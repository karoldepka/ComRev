use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use futures::TryStreamExt;
use mongodb::{
    bson::{self, doc, Bson, Document},
    options::{IndexOptions, ReturnDocument},
    Client, Database, IndexModel,
};

use super::DataStore;
use crate::types::{PagedResponse, RowQuery};

// ── Store ─────────────────────────────────────────────────────────────────────

pub struct MongoStore {
    db: Database,
    db_id: String,
}

impl MongoStore {
    pub async fn connect(db_id: &str, url: &str) -> Result<Self> {
        let db_name = std::env::var("MONGO_DB").unwrap_or_else(|_| "structable".into());
        let client = Client::with_uri_str(url)
            .await
            .context("MongoDB: invalid URI")?;
        let db = client.database(&db_name);
        let store = MongoStore {
            db,
            db_id: db_id.to_string(),
        };
        store.ensure_schema().await?;
        Ok(store)
    }
}

// ── Field extraction helpers ──────────────────────────────────────────────────

fn str_val(doc: &Document, key: &str) -> String {
    doc.get_str(key).unwrap_or("").to_owned()
}

fn opt_str_val(doc: &Document, key: &str) -> Option<String> {
    doc.get_str(key).ok().map(str::to_owned)
}

fn bool_val(doc: &Document, key: &str) -> bool {
    doc.get_bool(key).unwrap_or(false)
}

fn i32_val(doc: &Document, key: &str) -> i32 {
    doc.get_i32(key)
        .or_else(|_| doc.get_i64(key).map(|n| n as i32))
        .unwrap_or(0)
}

fn datetime_val(doc: &Document, key: &str) -> DateTime<Utc> {
    doc.get_datetime(key)
        .map(|dt| DateTime::from_timestamp_millis(dt.timestamp_millis()).unwrap_or_else(Utc::now))
        .unwrap_or_else(|_| Utc::now())
}

fn opt_datetime_val(doc: &Document, key: &str) -> Option<DateTime<Utc>> {
    doc.get_datetime(key)
        .ok()
        .and_then(|dt| DateTime::from_timestamp_millis(dt.timestamp_millis()))
}

fn str_vec_val(doc: &Document, key: &str) -> Vec<String> {
    doc.get_array(key)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn opt_str_vec_val(doc: &Document, key: &str) -> Option<Vec<String>> {
    let arr = doc.get_array(key).ok()?;
    Some(
        arr.iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect(),
    )
}

fn doc_id(doc: &Document) -> String {
    match doc.get("_id") {
        Some(Bson::String(s)) => s.clone(),
        Some(other) => other.to_string(),
        None => String::new(),
    }
}

fn opt_bson(s: Option<&str>) -> Bson {
    s.map(|v| Bson::String(v.to_owned())).unwrap_or(Bson::Null)
}

fn bson_to_json(v: &Bson) -> serde_json::Value {
    match v {
        Bson::Null => serde_json::Value::Null,
        Bson::Boolean(b) => serde_json::Value::Bool(*b),
        Bson::Int32(n) => serde_json::Value::Number((*n).into()),
        Bson::Int64(n) => serde_json::Value::Number((*n).into()),
        Bson::Double(n) => serde_json::Number::from_f64(*n)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Bson::String(s) => serde_json::Value::String(s.clone()),
        Bson::Array(arr) => serde_json::Value::Array(arr.iter().map(bson_to_json).collect()),
        Bson::Document(d) => serde_json::Value::Object(
            d.iter()
                .map(|(k, v)| (k.clone(), bson_to_json(v)))
                .collect(),
        ),
        Bson::DateTime(dt) => serde_json::Value::String(
            DateTime::from_timestamp_millis(dt.timestamp_millis())
                .unwrap_or_else(Utc::now)
                .to_rfc3339(),
        ),
        other => serde_json::Value::String(other.to_string()),
    }
}

// ── Row → domain type converters ──────────────────────────────────────────────

fn doc_to_flag(doc: &Document) -> crate::flag::CellFlag {
    crate::flag::CellFlag {
        id: doc_id(doc),
        key: str_val(doc, "key"),
        color: str_val(doc, "color"),
    }
}

fn doc_to_remark(doc: &Document) -> crate::remark::Remark {
    let targets = doc
        .get_array("targets")
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_document())
                .map(|t| crate::remark::RemarkTarget {
                    row_id: str_val(t, "row_id"),
                    column_id: str_val(t, "column_id"),
                })
                .collect()
        })
        .unwrap_or_default();
    crate::remark::Remark {
        id: doc_id(doc),
        body: str_val(doc, "body"),
        kind: str_val(doc, "kind"),
        is_private: bool_val(doc, "is_private"),
        resolved_at: opt_datetime_val(doc, "resolved_at"),
        targets,
    }
}

fn doc_to_hidden_row(doc: &Document) -> crate::hidden_row::HiddenRow {
    crate::hidden_row::HiddenRow {
        id: doc_id(doc),
        row_id: str_val(doc, "row_id"),
    }
}

fn doc_to_hidden_column(doc: &Document) -> crate::hidden_column::HiddenColumn {
    crate::hidden_column::HiddenColumn {
        id: doc_id(doc),
        column_id: str_val(doc, "column_id"),
    }
}

fn doc_to_custom_column(doc: &Document) -> crate::custom_column::CustomColumn {
    crate::custom_column::CustomColumn {
        id: doc_id(doc),
        title: opt_str_val(doc, "title"),
        description: opt_str_val(doc, "description"),
        expression: opt_str_val(doc, "expression"),
        position_before: opt_str_val(doc, "position_before"),
        position_after: opt_str_val(doc, "position_after"),
        read_only: bool_val(doc, "read_only"),
        types: str_vec_val(doc, "types"),
        source_path: opt_str_vec_val(doc, "source_path"),
        data_types: str_vec_val(doc, "data_types"),
        is_group: bool_val(doc, "is_group"),
        parent_ids: str_vec_val(doc, "parent_ids"),
        is_frozen: bool_val(doc, "is_frozen"),
    }
}

fn doc_to_table(doc: &Document) -> crate::table::Table {
    crate::table::Table {
        id: doc_id(doc),
        title: str_val(doc, "title"),
        description: opt_str_val(doc, "description"),
        who_created: opt_str_val(doc, "who_created"),
        when_created: datetime_val(doc, "when_created"),
        who_last_modified: opt_str_val(doc, "who_last_modified"),
        when_last_modified: datetime_val(doc, "when_last_modified"),
        modify_count: i32_val(doc, "modify_count"),
    }
}

fn doc_to_row_json(doc: &Document) -> serde_json::Value {
    let mut obj: serde_json::Map<String, serde_json::Value> = doc
        .get_document("custom_values")
        .map(|cv| {
            cv.iter()
                .map(|(k, v)| (k.clone(), bson_to_json(v)))
                .collect()
        })
        .unwrap_or_default();
    obj.insert("id".into(), serde_json::Value::String(doc_id(doc)));
    obj.insert(
        "when_created".into(),
        serde_json::Value::String(datetime_val(doc, "when_created").to_rfc3339()),
    );
    obj.insert(
        "when_last_modified".into(),
        serde_json::Value::String(datetime_val(doc, "when_last_modified").to_rfc3339()),
    );
    if let Some(who) = opt_str_val(doc, "who_created") {
        obj.insert("who_created".into(), serde_json::Value::String(who));
    }
    if let Some(who) = opt_str_val(doc, "who_last_modified") {
        obj.insert("who_last_modified".into(), serde_json::Value::String(who));
    }
    serde_json::Value::Object(obj)
}

// ── DataStore impl ────────────────────────────────────────────────────────────

#[async_trait]
impl DataStore for MongoStore {
    async fn ensure_schema(&self) -> Result<()> {
        tracing::info!(db_id = %self.db_id, "MongoStore: applying schema");
        let unique = IndexOptions::builder().unique(true).build();

        self.db
            .collection::<Document>("flags")
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "key": 1 })
                    .options(unique.clone())
                    .build(),
            )
            .await
            .context("MongoDB: flags.key index")?;

        self.db
            .collection::<Document>("hidden_rows")
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "row_id": 1 })
                    .options(unique.clone())
                    .build(),
            )
            .await
            .context("MongoDB: hidden_rows.row_id index")?;

        self.db
            .collection::<Document>("hidden_columns")
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "column_id": 1 })
                    .options(unique.clone())
                    .build(),
            )
            .await
            .context("MongoDB: hidden_columns.column_id index")?;

        self.db
            .collection::<Document>("custom_columns")
            .create_index(IndexModel::builder().keys(doc! { "table_id": 1 }).build())
            .await
            .context("MongoDB: custom_columns.table_id index")?;

        self.db
            .collection::<Document>("table_rows")
            .create_index(IndexModel::builder().keys(doc! { "table_id": 1 }).build())
            .await
            .context("MongoDB: table_rows.table_id index")?;

        Ok(())
    }

    async fn set_column_source_path(
        &self,
        column_id: &str,
        path: Option<&[String]>,
    ) -> Result<crate::custom_column::CustomColumn> {
        let path_bson = path
            .map(|p| bson::to_bson(p).unwrap_or(Bson::Null))
            .unwrap_or(Bson::Null);
        let doc = self
            .db
            .collection::<Document>("custom_columns")
            .find_one_and_update(
                doc! { "_id": column_id },
                doc! { "$set": { "source_path": path_bson } },
            )
            .return_document(ReturnDocument::After)
            .await
            .context("MongoDB: set_column_source_path")?
            .ok_or_else(|| anyhow::anyhow!("column not found: {column_id}"))?;
        Ok(doc_to_custom_column(&doc))
    }

    async fn nuke_user_data(&self) -> Result<()> {
        tracing::warn!(db_id = %self.db_id, "NUKE__DATA: dropping all MongoDB collections (recreated empty)");
        for coll in [
            "flags",
            "remarks",
            "remark_targets",
            "hidden_rows",
            "hidden_columns",
            "custom_columns",
            "tables",
            "github_repos",
            "operations_log",
            "table_custom_columns",
        ] {
            self.db
                .collection::<mongodb::bson::Document>(coll)
                .drop()
                .await
                .with_context(|| format!("NUKE__DATA: drop collection {coll}"))?;
        }
        // Drop user row collections (named t_<table_id>).
        let names = self
            .db
            .list_collection_names()
            .await
            .context("NUKE__DATA: list collections")?;
        for name in names.iter().filter(|n| n.starts_with("t_")) {
            self.db
                .collection::<mongodb::bson::Document>(name)
                .drop()
                .await
                .with_context(|| format!("NUKE__DATA: drop collection {name}"))?;
        }
        tracing::warn!(db_id = %self.db_id, "NUKE__DATA: complete");
        Ok(())
    }

    async fn nuke_db(&self) -> Result<()> {
        tracing::warn!(db_id = %self.db_id, "NUKE__DB: dropping MongoDB database");
        self.db.drop().await.context("NUKE__DB: drop database")?;
        tracing::warn!(db_id = %self.db_id, "NUKE__DB: database dropped, re-applying schema");
        self.ensure_schema().await?;
        tracing::warn!(db_id = %self.db_id, "NUKE__DB: complete");
        Ok(())
    }

    // ── Flags ─────────────────────────────────────────────────────────────────

    async fn list_flags(&self) -> Result<Vec<crate::flag::CellFlag>> {
        let docs: Vec<Document> = self
            .db
            .collection::<Document>("flags")
            .find(doc! {})
            .await
            .context("MongoDB: list_flags")?
            .try_collect()
            .await
            .context("MongoDB: list_flags collect")?;
        Ok(docs.iter().map(doc_to_flag).collect())
    }

    async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> Result<crate::flag::CellFlag> {
        let doc = self
            .db
            .collection::<Document>("flags")
            .find_one_and_update(
                doc! { "_id": id },
                doc! { "$set": { "key": key, "color": color } },
            )
            .upsert(true)
            .return_document(ReturnDocument::After)
            .await
            .context("MongoDB: upsert_flag")?
            .ok_or_else(|| anyhow::anyhow!("upsert_flag: no document returned"))?;
        Ok(doc_to_flag(&doc))
    }

    async fn delete_flag(&self, key: &str) -> Result<()> {
        self.db
            .collection::<Document>("flags")
            .delete_one(doc! { "key": key })
            .await
            .context("MongoDB: delete_flag")?;
        Ok(())
    }

    // ── Remarks ───────────────────────────────────────────────────────────────

    async fn list_remarks(&self) -> Result<Vec<crate::remark::Remark>> {
        let docs: Vec<Document> = self
            .db
            .collection::<Document>("remarks")
            .find(doc! {})
            .await
            .context("MongoDB: list_remarks")?
            .try_collect()
            .await
            .context("MongoDB: list_remarks collect")?;
        Ok(docs.iter().map(doc_to_remark).collect())
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
        let targets_bson: Vec<Bson> = targets
            .iter()
            .map(|t| {
                Bson::Document(doc! {
                    "row_id": &t.row_id,
                    "column_id": &t.column_id,
                })
            })
            .collect();
        let resolved_at_bson = resolved_at
            .map(|dt| Bson::DateTime(bson::DateTime::from_millis(dt.timestamp_millis())))
            .unwrap_or(Bson::Null);
        let doc = self
            .db
            .collection::<Document>("remarks")
            .find_one_and_update(
                doc! { "_id": id },
                doc! { "$set": {
                    "body": body,
                    "kind": kind,
                    "is_private": is_private,
                    "resolved_at": resolved_at_bson,
                    "targets": targets_bson,
                }},
            )
            .upsert(true)
            .return_document(ReturnDocument::After)
            .await
            .context("MongoDB: upsert_remark")?
            .ok_or_else(|| anyhow::anyhow!("upsert_remark: no document returned"))?;
        Ok(doc_to_remark(&doc))
    }

    async fn delete_remark(&self, id: &str) -> Result<()> {
        self.db
            .collection::<Document>("remarks")
            .delete_one(doc! { "_id": id })
            .await
            .context("MongoDB: delete_remark")?;
        Ok(())
    }

    // ── Hidden rows ───────────────────────────────────────────────────────────

    async fn list_hidden_rows(&self) -> Result<Vec<crate::hidden_row::HiddenRow>> {
        let docs: Vec<Document> = self
            .db
            .collection::<Document>("hidden_rows")
            .find(doc! {})
            .await
            .context("MongoDB: list_hidden_rows")?
            .try_collect()
            .await
            .context("MongoDB: list_hidden_rows collect")?;
        Ok(docs.iter().map(doc_to_hidden_row).collect())
    }

    async fn add_hidden_row(&self, id: &str, row_id: &str) -> Result<crate::hidden_row::HiddenRow> {
        let doc = self
            .db
            .collection::<Document>("hidden_rows")
            .find_one_and_update(doc! { "_id": id }, doc! { "$set": { "row_id": row_id } })
            .upsert(true)
            .return_document(ReturnDocument::After)
            .await
            .context("MongoDB: add_hidden_row")?
            .ok_or_else(|| anyhow::anyhow!("add_hidden_row: no document returned"))?;
        Ok(doc_to_hidden_row(&doc))
    }

    async fn remove_hidden_row(&self, row_id: &str) -> Result<()> {
        self.db
            .collection::<Document>("hidden_rows")
            .delete_one(doc! { "row_id": row_id })
            .await
            .context("MongoDB: remove_hidden_row")?;
        Ok(())
    }

    // ── Hidden columns ────────────────────────────────────────────────────────

    async fn list_hidden_columns(&self) -> Result<Vec<crate::hidden_column::HiddenColumn>> {
        let docs: Vec<Document> = self
            .db
            .collection::<Document>("hidden_columns")
            .find(doc! {})
            .await
            .context("MongoDB: list_hidden_columns")?
            .try_collect()
            .await
            .context("MongoDB: list_hidden_columns collect")?;
        Ok(docs.iter().map(doc_to_hidden_column).collect())
    }

    async fn add_hidden_column(
        &self,
        id: &str,
        column_id: &str,
    ) -> Result<crate::hidden_column::HiddenColumn> {
        let doc = self
            .db
            .collection::<Document>("hidden_columns")
            .find_one_and_update(
                doc! { "_id": id },
                doc! { "$set": { "column_id": column_id } },
            )
            .upsert(true)
            .return_document(ReturnDocument::After)
            .await
            .context("MongoDB: add_hidden_column")?
            .ok_or_else(|| anyhow::anyhow!("add_hidden_column: no document returned"))?;
        Ok(doc_to_hidden_column(&doc))
    }

    async fn remove_hidden_column(&self, column_id: &str) -> Result<()> {
        self.db
            .collection::<Document>("hidden_columns")
            .delete_one(doc! { "column_id": column_id })
            .await
            .context("MongoDB: remove_hidden_column")?;
        Ok(())
    }

    // ── Custom columns ────────────────────────────────────────────────────────

    async fn list_custom_columns(
        &self,
        table_id: &str,
    ) -> Result<Vec<crate::custom_column::CustomColumn>> {
        if table_id == "tables" {
            return Ok(crate::store::table_registry_columns());
        }
        let docs: Vec<Document> = self
            .db
            .collection::<Document>("custom_columns")
            .find(doc! { "table_id": table_id })
            .sort(doc! { "when_created": 1 })
            .await
            .context("MongoDB: list_custom_columns")?
            .try_collect()
            .await
            .context("MongoDB: list_custom_columns collect")?;
        Ok(docs.iter().map(doc_to_custom_column).collect())
    }

    async fn upsert_custom_column(
        &self,
        table_id: &str,
        id: &str,
        input: &crate::custom_column::CustomColumnInput,
    ) -> Result<crate::custom_column::CustomColumn> {
        let types_bson: Vec<Bson> = input
            .effective_types()
            .into_iter()
            .map(Bson::String)
            .collect();
        let data_types_bson: Vec<Bson> = input
            .effective_data_types()
            .into_iter()
            .map(Bson::String)
            .collect();
        let parent_ids_bson: Vec<Bson> = input
            .parent_ids
            .iter()
            .map(|s| Bson::String(s.clone()))
            .collect();
        let source_path_bson: Bson = input
            .source_path
            .as_ref()
            .map(|v| Bson::Array(v.iter().map(|s| Bson::String(s.clone())).collect()))
            .unwrap_or(Bson::Null);
        let doc = self
            .db
            .collection::<Document>("custom_columns")
            .find_one_and_update(
                doc! { "_id": id },
                doc! {
                    "$setOnInsert": { "when_created": bson::DateTime::now() },
                    "$set": {
                        "table_id": table_id,
                        "title": opt_bson(input.title.as_deref()),
                        "description": opt_bson(input.description.as_deref()),
                        "expression": opt_bson(input.expression.as_deref()),
                        "position_before": opt_bson(input.position_before.as_deref()),
                        "position_after": opt_bson(input.position_after.as_deref()),
                        "read_only": input.read_only,
                        "types": types_bson,
                        "data_types": data_types_bson,
                        "is_group": input.is_group,
                        "parent_ids": parent_ids_bson,
                        "source_path": source_path_bson,
                        "is_frozen": false,
                    },
                },
            )
            .upsert(true)
            .return_document(ReturnDocument::After)
            .await
            .context("MongoDB: upsert_custom_column")?
            .ok_or_else(|| anyhow::anyhow!("upsert_custom_column: no document returned"))?;
        Ok(doc_to_custom_column(&doc))
    }

    async fn delete_custom_column(&self, id: &str) -> Result<()> {
        self.db
            .collection::<Document>("custom_columns")
            .delete_one(doc! { "_id": id })
            .await
            .context("MongoDB: delete_custom_column")?;
        Ok(())
    }

    async fn set_table_column_frozen(
        &self,
        table_id: &str,
        column_id: &str,
        is_frozen: bool,
    ) -> Result<crate::custom_column::CustomColumn> {
        let doc = self
            .db
            .collection::<Document>("custom_columns")
            .find_one_and_update(
                doc! { "_id": column_id, "table_id": table_id },
                doc! { "$set": { "is_frozen": is_frozen } },
            )
            .return_document(ReturnDocument::After)
            .await
            .context("MongoDB: set_table_column_frozen")?
            .ok_or_else(|| {
                anyhow::anyhow!("set_table_column_frozen: column {column_id} not found")
            })?;
        Ok(doc_to_custom_column(&doc))
    }

    // ── Tables registry ───────────────────────────────────────────────────────

    async fn list_tables(&self) -> Result<Vec<crate::table::Table>> {
        let docs: Vec<Document> = self
            .db
            .collection::<Document>("app_tables")
            .find(doc! {})
            .sort(doc! { "when_created": 1 })
            .await
            .context("MongoDB: list_tables")?
            .try_collect()
            .await
            .context("MongoDB: list_tables collect")?;
        Ok(docs.iter().map(doc_to_table).collect())
    }

    async fn create_table(
        &self,
        id: &str,
        title: &str,
        description: Option<&str>,
        who_created: Option<&str>,
    ) -> Result<crate::table::Table> {
        let now = bson::DateTime::now();
        let doc = self
            .db
            .collection::<Document>("app_tables")
            .find_one_and_update(
                doc! { "_id": id },
                doc! { "$setOnInsert": {
                    "title": title,
                    "description": opt_bson(description),
                    "who_created": opt_bson(who_created),
                    "when_created": now.clone(),
                    "when_last_modified": now,
                    "modify_count": 0i32,
                }},
            )
            .upsert(true)
            .return_document(ReturnDocument::After)
            .await
            .context("MongoDB: create_table")?
            .ok_or_else(|| anyhow::anyhow!("create_table: no document returned"))?;
        Ok(doc_to_table(&doc))
    }

    async fn patch_table(
        &self,
        id: &str,
        title: Option<&str>,
        description: Option<&str>,
        who_last_modified: Option<&str>,
    ) -> Result<crate::table::Table> {
        let mut set_doc = doc! { "when_last_modified": bson::DateTime::now() };
        if let Some(t) = title {
            set_doc.insert("title", t);
        }
        if let Some(d) = description {
            set_doc.insert("description", d);
        }
        if let Some(w) = who_last_modified {
            set_doc.insert("who_last_modified", w);
        }
        let doc = self
            .db
            .collection::<Document>("app_tables")
            .find_one_and_update(
                doc! { "_id": id },
                doc! { "$set": set_doc, "$inc": { "modify_count": 1i32 } },
            )
            .return_document(ReturnDocument::After)
            .await
            .context("MongoDB: patch_table")?
            .ok_or_else(|| anyhow::anyhow!("patch_table: table {id} not found"))?;
        Ok(doc_to_table(&doc))
    }

    async fn delete_table(&self, id: &str) -> Result<()> {
        self.db
            .collection::<Document>("app_tables")
            .delete_one(doc! { "_id": id })
            .await
            .context("MongoDB: delete_table")?;
        Ok(())
    }

    // ── Rows / items ──────────────────────────────────────────────────────────

    async fn create_row(
        &self,
        table_id: &str,
        row_id: &str,
        title: Option<&str>,
        who_created: Option<&str>,
    ) -> Result<serde_json::Value> {
        let now = bson::DateTime::now();
        let custom_vals = title
            .map(|t| doc! { "title": t })
            .unwrap_or_else(Document::new);
        let doc = self
            .db
            .collection::<Document>(&format!("t_{table_id}"))
            .find_one_and_update(
                doc! { "_id": row_id },
                doc! { "$setOnInsert": {
                    "who_created": opt_bson(who_created),
                    "when_created": now.clone(),
                    "when_last_modified": now,
                    "custom_vals": custom_vals,
                    "modify_count": 0i32,
                }},
            )
            .upsert(true)
            .return_document(ReturnDocument::After)
            .await
            .context("MongoDB: create_row")?
            .ok_or_else(|| anyhow::anyhow!("create_row: no document returned"))?;
        let mut row = doc_to_row_json(&doc);
        row["table_id"] = serde_json::Value::String(table_id.to_string());
        Ok(row)
    }

    async fn list_data_rows(&self, table_id: &str, params: &RowQuery) -> Result<PagedResponse> {
        let per_page = params.per_page.clamp(1, 200) as u64;
        let offset = (params.page.max(1) - 1) as u64 * per_page;

        if table_id == "tables" {
            let coll = self.db.collection::<Document>("app_tables");
            let total = coll
                .count_documents(doc! {})
                .await
                .context("MongoDB: count app_tables")? as i64;
            let docs: Vec<Document> = coll
                .find(doc! {})
                .sort(doc! { "when_created": 1 })
                .skip(offset)
                .limit(per_page as i64)
                .await
                .context("MongoDB: list app_tables")?
                .try_collect()
                .await
                .context("MongoDB: collect app_tables")?;
            let data = docs
                .iter()
                .map(|d| {
                    serde_json::json!({
                        "id": doc_id(d),
                        "title": str_val(d, "title"),
                        "description": opt_str_val(d, "description"),
                        "who_created": opt_str_val(d, "who_created"),
                        "when_created": datetime_val(d, "when_created").to_rfc3339(),
                        "who_last_modified": opt_str_val(d, "who_last_modified"),
                        "when_last_modified": datetime_val(d, "when_last_modified").to_rfc3339(),
                        "modify_count": i32_val(d, "modify_count"),
                    })
                })
                .collect();
            return Ok(PagedResponse {
                data,
                total,
                page: params.page,
                per_page: params.per_page,
                errors: vec![],
            });
        }

        let coll = self.db.collection::<Document>("table_rows");
        let filter = doc! { "table_id": table_id };
        let total = coll
            .count_documents(filter.clone())
            .await
            .context("MongoDB: count table_rows")? as i64;
        let docs: Vec<Document> = coll
            .find(filter)
            .sort(doc! { "when_created": -1 })
            .skip(offset)
            .limit(per_page as i64)
            .await
            .context("MongoDB: list table_rows")?
            .try_collect()
            .await
            .context("MongoDB: collect table_rows")?;
        let data = docs.iter().map(doc_to_row_json).collect();
        Ok(PagedResponse {
            data,
            total,
            page: params.page,
            per_page: params.per_page,
            errors: vec![],
        })
    }

    async fn patch_row_value(
        &self,
        _table_id: &str,
        row_id: &str,
        col_id: &str,
        value: serde_json::Value,
    ) -> Result<()> {
        let bson_value = bson::to_bson(&value).context("MongoDB: value to BSON")?;
        let field = format!("custom_values.{col_id}");
        let mut set_doc = Document::new();
        set_doc.insert(field, bson_value);
        set_doc.insert("when_last_modified", bson::DateTime::now());
        self.db
            .collection::<Document>("table_rows")
            .update_one(
                doc! { "_id": row_id },
                doc! { "$set": set_doc, "$inc": { "modify_count": 1i32 } },
            )
            .await
            .context("MongoDB: patch_row_value")?;
        Ok(())
    }

    async fn upsert_rows_batch(&self, table_id: &str, rows: &[serde_json::Value]) -> Result<usize> {
        let coll = self.db.collection::<Document>("table_rows");
        let mut count = 0usize;
        for row in rows {
            let id = match row
                .get("id")
                .and_then(|v| v.as_str())
                .map(str::to_owned)
                .or_else(|| {
                    row.get("github_id")
                        .and_then(|v| v.as_i64())
                        .map(|n| n.to_string())
                }) {
                Some(id) => id,
                None => {
                    tracing::warn!("mongo upsert_rows_batch: row missing id/github_id");
                    continue;
                }
            };
            let bson_cv = bson::to_bson(row).context("mongo upsert_rows_batch: row to BSON")?;
            // Aggregation pipeline update: $mergeObjects preserves existing user-added keys
            // while the incoming data refreshes the keys it owns.
            coll.update_one(
                doc! { "_id": &id },
                vec![doc! {
                    "$set": {
                        "table_id": table_id,
                        "custom_values": { "$mergeObjects": [
                            { "$ifNull": ["$custom_values", {}] },
                            bson_cv
                        ]},
                        "when_last_modified": bson::DateTime::now(),
                        "when_created": { "$ifNull": ["$when_created", bson::DateTime::now()] },
                    }
                }],
            )
            .upsert(true)
            .await
            .context("mongo upsert_rows_batch")?;
            count += 1;
        }
        Ok(count)
    }

    // ── Ops log ───────────────────────────────────────────────────────────────

    async fn begin_ops_log(
        &self,
        id: &str,
        op: &str,
        payload: serde_json::Value,
        tx_id: Option<&str>,
    ) {
        let bson_payload = bson::to_bson(&payload).unwrap_or(Bson::Null);
        let doc = doc! {
            "op": op,
            "payload": bson_payload,
            "tx_id": opt_bson(tx_id),
            "when_created": bson::DateTime::now(),
            "applied_at": Bson::Null,
        };
        // ON CONFLICT DO NOTHING equivalent: $setOnInsert with upsert, but only set if new.
        if let Err(e) = self
            .db
            .collection::<Document>("ops_log")
            .update_one(doc! { "_id": id }, doc! { "$setOnInsert": doc })
            .upsert(true)
            .await
        {
            tracing::error!(op = %op, "mongo ops_log begin failed: {e}");
        }
    }

    async fn mark_op_applied(&self, id: &str) {
        if let Err(e) = self
            .db
            .collection::<Document>("ops_log")
            .update_one(
                doc! { "_id": id, "applied_at": Bson::Null },
                doc! { "$set": { "applied_at": bson::DateTime::now() } },
            )
            .await
        {
            tracing::error!("mongo ops_log mark_applied failed for id={id}: {e}");
        }
    }

    async fn pending_ops(&self) -> anyhow::Result<Vec<crate::store::PendingOp>> {
        let docs: Vec<Document> = self
            .db
            .collection::<Document>("ops_log")
            .find(doc! { "applied_at": Bson::Null })
            .sort(doc! { "_id": 1 })
            .await
            .context("mongo pending_ops")?
            .try_collect()
            .await
            .context("mongo pending_ops collect")?;
        Ok(docs
            .into_iter()
            .map(|d| crate::store::PendingOp {
                seq: None,
                id: doc_id(&d),
                op: str_val(&d, "op"),
                payload: d
                    .get_document("payload")
                    .map(|p| bson_to_json(&Bson::Document(p.clone())))
                    .unwrap_or(serde_json::Value::Null),
                when_created: chrono::Utc::now(),
                who_created: opt_str_val(&d, "who_created"),
                tx_id: opt_str_val(&d, "tx_id"),
            })
            .collect())
    }
}
