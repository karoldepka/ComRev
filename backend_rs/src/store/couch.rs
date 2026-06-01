/// CouchDB / PouchDB (HTTP) store.
///
/// Works with any CouchDB-compatible endpoint, including PouchDB-Server and
/// Cloudant.  Set DATABASE_URL to e.g. `http://admin:pass@localhost:5984`.
/// The database name defaults to `structable`; override with `COUCH_DB`.
///
/// Document `_id` is our nanoid string.  Every write preserves `_rev` by
/// reading the current revision before updating (read-modify-write).
use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use reqwest::{Client, StatusCode};
use serde_json::{json, Value};

use super::DataStore;
use crate::types::{PagedResponse, RowQuery};

// ── Store ─────────────────────────────────────────────────────────────────────

pub struct CouchStore {
    client: Client,
    base: String, // e.g. "http://host:5984/structable"
}

impl CouchStore {
    pub async fn connect(url: &str) -> Result<Self> {
        let db_name = std::env::var("COUCH_DB").unwrap_or_else(|_| "structable".into());
        // Strip trailing slash from the raw URL, then append db name.
        let base = format!("{}/{db_name}", url.trim_end_matches('/'));
        let client = Client::new();
        let store = CouchStore { client, base };
        store.ensure_schema().await?;
        Ok(store)
    }

    // ── Low-level helpers ─────────────────────────────────────────────────────

    fn db_url(&self, path: &str) -> String {
        format!("{}/{}", self.base, path.trim_start_matches('/'))
    }

    /// GET a single document by id; returns None if 404.
    async fn get_doc(&self, collection: &str, id: &str) -> Result<Option<Value>> {
        let url = self.db_url(&format!("{collection}:{id}"));
        let resp = self.client.get(&url).send().await
            .with_context(|| format!("CouchDB GET {url}"))?;
        if resp.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let doc: Value = resp.error_for_status()
            .with_context(|| format!("CouchDB GET {url}"))?
            .json()
            .await?;
        Ok(Some(doc))
    }

    /// PUT (create or replace) a document. Fetches current `_rev` first.
    async fn put_doc(&self, collection: &str, id: &str, mut body: Value) -> Result<Value> {
        let doc_id = format!("{collection}:{id}");
        let url = self.db_url(&doc_id);
        // Carry forward _rev if the doc already exists.
        if let Some(existing) = self.get_doc(collection, id).await? {
            if let Some(rev) = existing.get("_rev").and_then(|v| v.as_str()) {
                body["_rev"] = json!(rev);
            }
        }
        body["_id"] = json!(doc_id);
        body["_collection"] = json!(collection);
        let resp = self.client.put(&url).json(&body).send().await
            .with_context(|| format!("CouchDB PUT {url}"))?
            .error_for_status()
            .with_context(|| format!("CouchDB PUT {url}"))?;
        let result: Value = resp.json().await?;
        // Return a merged doc with the fields we sent + new _rev.
        body["_rev"] = result["rev"].clone();
        Ok(body)
    }

    /// DELETE a document by id (no-op if missing).
    async fn delete_doc(&self, collection: &str, id: &str) -> Result<()> {
        let Some(doc) = self.get_doc(collection, id).await? else {
            return Ok(());
        };
        let rev = doc["_rev"].as_str().unwrap_or("");
        let doc_id = format!("{collection}:{id}");
        let url = self.db_url(&doc_id);
        self.client
            .delete(&url)
            .query(&[("rev", rev)])
            .send()
            .await
            .with_context(|| format!("CouchDB DELETE {url}"))?
            .error_for_status()
            .with_context(|| format!("CouchDB DELETE {url}"))?;
        Ok(())
    }

    /// Mango query — returns all matching docs.
    async fn find(&self, selector: Value, sort: Option<Value>, limit: Option<u64>, skip: Option<u64>) -> Result<Vec<Value>> {
        let mut query = json!({ "selector": selector });
        if let Some(s) = sort    { query["sort"]  = s; }
        if let Some(l) = limit   { query["limit"] = json!(l); }
        if let Some(o) = skip    { query["skip"]  = json!(o); }
        let url = self.db_url("_find");
        let resp = self.client.post(&url).json(&query).send().await
            .with_context(|| format!("CouchDB _find {url}"))?
            .error_for_status()
            .with_context(|| format!("CouchDB _find {url}"))?;
        let body: Value = resp.json().await?;
        Ok(body["docs"].as_array().cloned().unwrap_or_default())
    }

    /// Count documents matching a selector via Mango.
    async fn count(&self, selector: Value) -> Result<i64> {
        let docs = self.find(selector, None, Some(u64::MAX), None).await?;
        Ok(docs.len() as i64)
    }
}

// ── Field extraction helpers ──────────────────────────────────────────────────

fn str_f(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or("").to_owned()
}

fn opt_str_f(v: &Value, key: &str) -> Option<String> {
    v[key].as_str().map(str::to_owned)
}

fn bool_f(v: &Value, key: &str) -> bool {
    v[key].as_bool().unwrap_or(false)
}

fn i32_f(v: &Value, key: &str) -> i32 {
    v[key].as_i64().unwrap_or(0) as i32
}

fn datetime_f(v: &Value, key: &str) -> DateTime<Utc> {
    v[key].as_str()
        .and_then(|s| s.parse::<DateTime<Utc>>().ok())
        .unwrap_or_else(Utc::now)
}

fn opt_datetime_f(v: &Value, key: &str) -> Option<DateTime<Utc>> {
    v[key].as_str()?.parse::<DateTime<Utc>>().ok()
}

fn str_vec_f(v: &Value, key: &str) -> Vec<String> {
    v[key].as_array()
        .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_owned)).collect())
        .unwrap_or_default()
}

fn opt_str_vec_f(v: &Value, key: &str) -> Option<Vec<String>> {
    let arr = v[key].as_array()?;
    Some(arr.iter().filter_map(|x| x.as_str().map(str::to_owned)).collect())
}

/// Extract our app id from the CouchDB `_id` field ("collection:nanoid" → "nanoid").
fn doc_id(v: &Value) -> String {
    v["_id"].as_str()
        .and_then(|s| s.split_once(':').map(|(_, id)| id.to_owned()))
        .unwrap_or_default()
}

// ── Row → domain type converters ──────────────────────────────────────────────

fn val_to_flag(v: &Value) -> crate::flag::CellFlag {
    crate::flag::CellFlag { id: doc_id(v), key: str_f(v, "key"), color: str_f(v, "color") }
}

fn val_to_remark(v: &Value) -> crate::remark::Remark {
    let targets = v["targets"].as_array()
        .map(|arr| arr.iter().map(|t| crate::remark::RemarkTarget {
            row_id: str_f(t, "row_id"),
            column_id: str_f(t, "column_id"),
        }).collect())
        .unwrap_or_default();
    crate::remark::Remark {
        id: doc_id(v),
        body: str_f(v, "body"),
        kind: str_f(v, "kind"),
        is_private: bool_f(v, "is_private"),
        resolved_at: opt_datetime_f(v, "resolved_at"),
        targets,
    }
}

fn val_to_hidden_row(v: &Value) -> crate::hidden_row::HiddenRow {
    crate::hidden_row::HiddenRow { id: doc_id(v), row_id: str_f(v, "row_id") }
}

fn val_to_hidden_column(v: &Value) -> crate::hidden_column::HiddenColumn {
    crate::hidden_column::HiddenColumn { id: doc_id(v), column_id: str_f(v, "column_id") }
}

fn val_to_custom_column(v: &Value) -> crate::custom_column::CustomColumn {
    crate::custom_column::CustomColumn {
        id: doc_id(v),
        name: str_f(v, "name"),
        label: opt_str_f(v, "label"),
        description: opt_str_f(v, "description"),
        expression: opt_str_f(v, "expression"),
        position_after: opt_str_f(v, "position_after"),
        read_only: bool_f(v, "read_only"),
        types: str_vec_f(v, "types"),
        source_path: opt_str_vec_f(v, "source_path"),
        data_types: str_vec_f(v, "data_types"),
        is_group: bool_f(v, "is_group"),
        parent_ids: str_vec_f(v, "parent_ids"),
        is_frozen: bool_f(v, "is_frozen"),
    }
}

fn val_to_table(v: &Value) -> crate::table::Table {
    crate::table::Table {
        id: doc_id(v),
        title: str_f(v, "title"),
        description: opt_str_f(v, "description"),
        who_created: opt_str_f(v, "who_created"),
        when_created: datetime_f(v, "when_created"),
        who_last_modified: opt_str_f(v, "who_last_modified"),
        when_last_modified: datetime_f(v, "when_last_modified"),
        modify_count: i32_f(v, "modify_count"),
    }
}

fn val_to_table_row(v: &Value) -> crate::data_row::TableRow {
    crate::data_row::TableRow {
        id: doc_id(v),
        table_id: str_f(v, "table_id"),
        who_created: opt_str_f(v, "who_created"),
        when_created: datetime_f(v, "when_created"),
        who_last_modified: opt_str_f(v, "who_last_modified"),
        when_last_modified: datetime_f(v, "when_last_modified"),
        custom_values: v["custom_values"].clone(),
        modify_count: i32_f(v, "modify_count"),
    }
}

fn row_to_json(v: &Value) -> Value {
    let mut obj = v["custom_values"].as_object().cloned().unwrap_or_default();
    obj.insert("id".into(), json!(doc_id(v)));
    obj.insert("when_created".into(), json!(datetime_f(v, "when_created").to_rfc3339()));
    obj.insert("when_last_modified".into(), json!(datetime_f(v, "when_last_modified").to_rfc3339()));
    if let Some(who) = opt_str_f(v, "who_created") {
        obj.insert("who_created".into(), json!(who));
    }
    if let Some(who) = opt_str_f(v, "who_last_modified") {
        obj.insert("who_last_modified".into(), json!(who));
    }
    Value::Object(obj)
}

// ── DataStore impl ────────────────────────────────────────────────────────────

#[async_trait]
impl DataStore for CouchStore {
    async fn ensure_schema(&self) -> Result<()> {
        // Create the database if it doesn't exist.
        let resp = self.client.put(&self.base).send().await
            .context("CouchDB: create database")?;
        let status = resp.status();
        if !status.is_success() && status != StatusCode::PRECONDITION_FAILED {
            // 412 = database already exists — fine.
            resp.error_for_status().context("CouchDB: create database")?;
        }

        // Create Mango indexes.
        let index_url = self.db_url("_index");
        let indexes: &[(&str, &[&str])] = &[
            ("idx_flags_key",       &["_collection", "key"]),
            ("idx_hidden_rows",     &["_collection", "row_id"]),
            ("idx_hidden_columns",  &["_collection", "column_id"]),
            ("idx_custom_columns",  &["_collection", "table_id", "when_created"]),
            ("idx_table_rows",      &["_collection", "table_id", "when_created"]),
            ("idx_app_tables",      &["_collection", "when_created"]),
            ("idx_ops_log",         &["_collection", "when_created"]),
        ];
        for (name, fields) in indexes {
            let body = json!({
                "index": { "fields": fields },
                "name": name,
                "type": "json",
            });
            self.client
                .post(&index_url)
                .json(&body)
                .send()
                .await
                .with_context(|| format!("CouchDB: create index {name}"))?
                .error_for_status()
                .with_context(|| format!("CouchDB: create index {name}"))?;
        }
        Ok(())
    }

    // ── Flags ─────────────────────────────────────────────────────────────────

    async fn list_flags(&self) -> Result<Vec<crate::flag::CellFlag>> {
        let docs = self.find(json!({ "_collection": "flags" }), None, None, None).await?;
        Ok(docs.iter().map(val_to_flag).collect())
    }

    async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> Result<crate::flag::CellFlag> {
        let doc = self.put_doc("flags", id, json!({ "key": key, "color": color })).await?;
        Ok(val_to_flag(&doc))
    }

    async fn delete_flag(&self, key: &str) -> Result<()> {
        let docs = self.find(json!({ "_collection": "flags", "key": key }), None, Some(1), None).await?;
        if let Some(doc) = docs.first() {
            if let Some(id) = doc["_id"].as_str().and_then(|s| s.split_once(':').map(|(_, i)| i.to_owned())) {
                self.delete_doc("flags", &id).await?;
            }
        }
        Ok(())
    }

    // ── Remarks ───────────────────────────────────────────────────────────────

    async fn list_remarks(&self) -> Result<Vec<crate::remark::Remark>> {
        let docs = self.find(json!({ "_collection": "remarks" }), None, None, None).await?;
        Ok(docs.iter().map(val_to_remark).collect())
    }

    async fn upsert_remark(
        &self,
        id: &str,
        body: &str,
        kind: &str,
        is_private: bool,
        resolved_at: Option<DateTime<Utc>>,
        targets: &[crate::remark::RemarkTarget],
    ) -> Result<crate::remark::Remark> {
        let doc = self.put_doc("remarks", id, json!({
            "body": body,
            "kind": kind,
            "is_private": is_private,
            "resolved_at": resolved_at.map(|dt| dt.to_rfc3339()),
            "targets": targets,
        })).await?;
        Ok(val_to_remark(&doc))
    }

    async fn delete_remark(&self, id: &str) -> Result<()> {
        self.delete_doc("remarks", id).await
    }

    // ── Hidden rows ───────────────────────────────────────────────────────────

    async fn list_hidden_rows(&self) -> Result<Vec<crate::hidden_row::HiddenRow>> {
        let docs = self.find(json!({ "_collection": "hidden_rows" }), None, None, None).await?;
        Ok(docs.iter().map(val_to_hidden_row).collect())
    }

    async fn add_hidden_row(&self, id: &str, row_id: &str) -> Result<crate::hidden_row::HiddenRow> {
        let doc = self.put_doc("hidden_rows", id, json!({ "row_id": row_id })).await?;
        Ok(val_to_hidden_row(&doc))
    }

    async fn remove_hidden_row(&self, row_id: &str) -> Result<()> {
        let docs = self.find(json!({ "_collection": "hidden_rows", "row_id": row_id }), None, Some(1), None).await?;
        if let Some(doc) = docs.first() {
            if let Some(id) = doc["_id"].as_str().and_then(|s| s.split_once(':').map(|(_, i)| i.to_owned())) {
                self.delete_doc("hidden_rows", &id).await?;
            }
        }
        Ok(())
    }

    // ── Hidden columns ────────────────────────────────────────────────────────

    async fn list_hidden_columns(&self) -> Result<Vec<crate::hidden_column::HiddenColumn>> {
        let docs = self.find(json!({ "_collection": "hidden_columns" }), None, None, None).await?;
        Ok(docs.iter().map(val_to_hidden_column).collect())
    }

    async fn add_hidden_column(&self, id: &str, column_id: &str) -> Result<crate::hidden_column::HiddenColumn> {
        let doc = self.put_doc("hidden_columns", id, json!({ "column_id": column_id })).await?;
        Ok(val_to_hidden_column(&doc))
    }

    async fn remove_hidden_column(&self, column_id: &str) -> Result<()> {
        let docs = self.find(json!({ "_collection": "hidden_columns", "column_id": column_id }), None, Some(1), None).await?;
        if let Some(doc) = docs.first() {
            if let Some(id) = doc["_id"].as_str().and_then(|s| s.split_once(':').map(|(_, i)| i.to_owned())) {
                self.delete_doc("hidden_columns", &id).await?;
            }
        }
        Ok(())
    }

    // ── Custom columns ────────────────────────────────────────────────────────

    async fn list_custom_columns(&self, table_id: &str) -> Result<Vec<crate::custom_column::CustomColumn>> {
        if table_id == "tables" {
            return Ok(crate::store::pg::table_registry_columns());
        }
        let docs = self.find(
            json!({ "_collection": "custom_columns", "table_id": table_id }),
            Some(json!([{ "when_created": "asc" }])),
            None, None,
        ).await?;
        Ok(docs.iter().map(val_to_custom_column).collect())
    }

    async fn upsert_custom_column(
        &self,
        table_id: &str,
        id: &str,
        name: &str,
        label: Option<&str>,
        description: Option<&str>,
        expression: Option<&str>,
        position_after: Option<&str>,
    ) -> Result<crate::custom_column::CustomColumn> {
        // Preserve when_created on update.
        let when_created = self.get_doc("custom_columns", id).await?
            .and_then(|d| d["when_created"].as_str().map(str::to_owned))
            .unwrap_or_else(|| Utc::now().to_rfc3339());
        let doc = self.put_doc("custom_columns", id, json!({
            "table_id": table_id,
            "name": name,
            "label": label,
            "description": description,
            "expression": expression,
            "position_after": position_after,
            "read_only": false,
            "types": ["text"],
            "data_types": ["text"],
            "is_group": false,
            "parent_ids": [],
            "is_frozen": false,
            "when_created": when_created,
        })).await?;
        Ok(val_to_custom_column(&doc))
    }

    async fn delete_custom_column(&self, id: &str) -> Result<()> {
        self.delete_doc("custom_columns", id).await
    }

    async fn set_table_column_frozen(&self, table_id: &str, column_id: &str, is_frozen: bool) -> Result<crate::custom_column::CustomColumn> {
        let mut doc = self.get_doc("custom_columns", column_id).await?
            .ok_or_else(|| anyhow::anyhow!("set_table_column_frozen: column {column_id} not found"))?;
        anyhow::ensure!(
            doc.get("table_id").and_then(|v| v.as_str()) == Some(table_id),
            "set_table_column_frozen: column {column_id} does not belong to table {table_id}"
        );
        doc["is_frozen"] = json!(is_frozen);
        doc["_collection"] = json!("custom_columns");
        let updated = self.put_doc("custom_columns", column_id, doc).await?;
        Ok(val_to_custom_column(&updated))
    }

    // ── Tables registry ───────────────────────────────────────────────────────

    async fn list_tables(&self) -> Result<Vec<crate::table::Table>> {
        let docs = self.find(
            json!({ "_collection": "app_tables" }),
            Some(json!([{ "when_created": "asc" }])),
            None, None,
        ).await?;
        Ok(docs.iter().map(val_to_table).collect())
    }

    async fn create_table(&self, id: &str, title: &str, description: Option<&str>, who_created: Option<&str>) -> Result<crate::table::Table> {
        // Idempotent: return existing if already present.
        if let Some(existing) = self.get_doc("app_tables", id).await? {
            return Ok(val_to_table(&existing));
        }
        let now = Utc::now().to_rfc3339();
        let doc = self.put_doc("app_tables", id, json!({
            "title": title,
            "description": description,
            "who_created": who_created,
            "when_created": now.clone(),
            "when_last_modified": now,
            "modify_count": 0,
        })).await?;
        Ok(val_to_table(&doc))
    }

    async fn patch_table(&self, id: &str, title: Option<&str>, description: Option<&str>, who_last_modified: Option<&str>) -> Result<crate::table::Table> {
        let mut doc = self.get_doc("app_tables", id).await?
            .ok_or_else(|| anyhow::anyhow!("patch_table: table {id} not found"))?;
        if let Some(t) = title { doc["title"] = json!(t); }
        if let Some(d) = description { doc["description"] = json!(d); }
        if let Some(w) = who_last_modified { doc["who_last_modified"] = json!(w); }
        doc["when_last_modified"] = json!(Utc::now().to_rfc3339());
        doc["modify_count"] = json!(i32_f(&doc, "modify_count") + 1);
        doc["_collection"] = json!("app_tables");
        let updated = self.put_doc("app_tables", id, doc).await?;
        Ok(val_to_table(&updated))
    }

    async fn delete_table(&self, id: &str) -> Result<()> {
        self.delete_doc("app_tables", id).await
    }

    // ── Rows / items ──────────────────────────────────────────────────────────

    async fn create_row(&self, table_id: &str, row_id: &str, title: Option<&str>, who_created: Option<&str>) -> Result<crate::data_row::TableRow> {
        if let Some(existing) = self.get_doc("table_rows", row_id).await? {
            return Ok(val_to_table_row(&existing));
        }
        let now = Utc::now().to_rfc3339();
        let custom_values = title.map(|t| json!({ "title": t })).unwrap_or(json!({}));
        let doc = self.put_doc("table_rows", row_id, json!({
            "table_id": table_id,
            "who_created": who_created,
            "when_created": now.clone(),
            "when_last_modified": now,
            "custom_values": custom_values,
            "modify_count": 0,
        })).await?;
        Ok(val_to_table_row(&doc))
    }

    async fn list_data_rows(&self, table_id: &str, params: &RowQuery) -> Result<PagedResponse> {
        let per_page = params.per_page.clamp(1, 200) as u64;
        let offset = (params.page.max(1) - 1) as u64 * per_page;

        if table_id == "tables" {
            let total = self.count(json!({ "_collection": "app_tables" })).await?;
            let docs = self.find(
                json!({ "_collection": "app_tables" }),
                Some(json!([{ "when_created": "asc" }])),
                Some(per_page), Some(offset),
            ).await?;
            let data = docs.iter().map(|d| json!({
                "id": doc_id(d),
                "title": str_f(d, "title"),
                "description": opt_str_f(d, "description"),
                "who_created": opt_str_f(d, "who_created"),
                "when_created": str_f(d, "when_created"),
                "who_last_modified": opt_str_f(d, "who_last_modified"),
                "when_last_modified": str_f(d, "when_last_modified"),
                "modify_count": i32_f(d, "modify_count"),
            })).collect();
            return Ok(PagedResponse { data, total, page: params.page, per_page: params.per_page });
        }

        let selector = json!({ "_collection": "table_rows", "table_id": table_id });
        let total = self.count(selector.clone()).await?;
        let docs = self.find(
            selector,
            Some(json!([{ "when_created": "desc" }])),
            Some(per_page), Some(offset),
        ).await?;
        let data = docs.iter().map(row_to_json).collect();
        Ok(PagedResponse { data, total, page: params.page, per_page: params.per_page })
    }

    async fn patch_row_value(&self, _table_id: &str, row_id: &str, col_id: &str, value: Value) -> Result<()> {
        let mut doc = self.get_doc("table_rows", row_id).await?
            .ok_or_else(|| anyhow::anyhow!("patch_row_value: row {row_id} not found"))?;
        if !doc["custom_values"].is_object() {
            doc["custom_values"] = json!({});
        }
        doc["custom_values"][col_id] = value;
        doc["when_last_modified"] = json!(Utc::now().to_rfc3339());
        doc["modify_count"] = json!(i32_f(&doc, "modify_count") + 1);
        doc["_collection"] = json!("table_rows");
        self.put_doc("table_rows", row_id, doc).await?;
        Ok(())
    }

    // ── GitHub repos batch upsert ─────────────────────────────────────────────

    async fn upsert_github_repos_batch(&self, repos: &[Value]) -> Result<usize> {
        let mut count = 0usize;
        for repo in repos {
            let github_id = repo["github_id"]
                .as_i64()
                .map(|n| n.to_string())
                .or_else(|| repo["id"].as_str().map(str::to_owned));
            let id = match github_id {
                Some(id) => id,
                None => {
                    tracing::warn!("upsert_github_repos_batch: repo missing github_id");
                    continue;
                }
            };
            self.put_doc("github_repos", &id, json!({ "custom_values": repo })).await
                .context("CouchDB: upsert github repo")?;
            count += 1;
        }
        Ok(count)
    }

    // ── Ops log ───────────────────────────────────────────────────────────────

    async fn append_ops_log(&self, op: &str, payload: Value, tx_id: Option<&str>) {
        let id = nanoid::nanoid!();
        let doc = json!({
            "op": op,
            "payload": payload,
            "tx_id": tx_id,
            "when_created": Utc::now().to_rfc3339(),
        });
        if let Err(e) = self.put_doc("ops_log", &id, doc).await {
            tracing::error!(op = %op, "couch ops_log insert failed: {e}");
        }
    }
}
