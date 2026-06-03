use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use surrealdb::{engine::any::Any, opt::auth::Root, Surreal};

use super::DataStore;
use crate::types::{PagedResponse, RowQuery};

// ── Store ─────────────────────────────────────────────────────────────────────

pub struct SurrealStore {
    db: Surreal<Any>,
    db_id: String,
    surreal_ns: String,
    surreal_db: String,
}

impl SurrealStore {
    /// Connect to SurrealDB.
    ///
    /// `raw_url` is the endpoint — typically the value of `SURREAL_URL` from `.env`.
    /// Supports `ws://`, `wss://`, `surreal://`, and `surreal+ws://` schemes.
    ///
    /// Credentials and database are resolved from env vars (preferred) or parsed
    /// from the URL when they are embedded:
    ///
    /// ```env
    /// SURREAL_URL=wss://lucky-comet-xxxxx.aws-use1.surreal.cloud
    /// SURREAL_USER=root
    /// SURREAL_PASS=secret
    /// SURREAL_NS=main
    /// SURREAL_DB=main
    /// ```
    pub async fn connect(db_id: &str, raw_url: &str) -> Result<Self> {
        // ── Normalise URL ─────────────────────────────────────────────────────
        // Strip any user:pass@ embedded in surreal:// URLs and convert the
        // scheme so that surrealdb::engine::any::connect can handle it.
        let (connect_url, embedded_user, embedded_pass) = parse_surreal_url(raw_url);

        // ── Credentials (env vars take precedence over URL) ───────────────────
        let username = std::env::var("SURREAL_USER")
            .ok()
            .filter(|s| !s.is_empty())
            .or(embedded_user)
            .unwrap_or_default();
        let password = std::env::var("SURREAL_PASS")
            .ok()
            .filter(|s| !s.is_empty())
            .or(embedded_pass)
            .unwrap_or_default();
        let namespace = std::env::var("SURREAL_NS").unwrap_or_else(|_| "structable".into());
        let database = std::env::var("SURREAL_DB").unwrap_or_else(|_| "structable".into());

        // ── Connect ───────────────────────────────────────────────────────────
        let db = surrealdb::engine::any::connect(&connect_url)
            .await
            .with_context(|| format!("SurrealDB: cannot connect to {connect_url}"))?;

        if !username.is_empty() {
            tracing::debug!("SurrealDB: signing in as user '{username}' at {connect_url}");
            db.signin(Root {
                username: username.clone(),
                password: password.clone(),
            })
            .await
            .with_context(|| {
                format!(
                    "SurrealDB: signin failed for user '{username}' at {connect_url} \
                 — if the server runs unauthenticated, leave SURREAL_USER empty"
                )
            })?;
        } else {
            tracing::debug!(
                "SurrealDB: no credentials configured, connecting unauthenticated to {connect_url}"
            );
        }

        db.use_ns(&namespace)
            .use_db(&database)
            .await
            .context("SurrealDB: use_ns/use_db failed")?;

        let store = SurrealStore {
            db,
            db_id: db_id.to_string(),
            surreal_ns: namespace,
            surreal_db: database,
        };
        store.ensure_schema().await?;
        Ok(store)
    }
}

/// Normalise a `surreal://[user:pass@]host[:port][/ns/db]` URL into a plain
/// `wss://host[:port]` that `engine::any::connect` understands, extracting any
/// embedded credentials along the way.
///
/// `ws://`, `wss://`, and other schemes are returned as-is (no credentials extracted).
fn parse_surreal_url(raw: &str) -> (String, Option<String>, Option<String>) {
    let scheme_stripped = raw
        .strip_prefix("surreal+ws://")
        .or_else(|| raw.strip_prefix("surreal://"));

    let Some(rest) = scheme_stripped else {
        // Already ws://, wss://, or another scheme — pass through unchanged.
        return (raw.to_owned(), None, None);
    };

    let (userinfo, hostpath) = if let Some((u, h)) = rest.split_once('@') {
        (Some(u), h)
    } else {
        (None, rest)
    };

    // Drop any /namespace/database suffix — those come from env vars instead.
    let host = hostpath.split('/').next().unwrap_or(hostpath);

    let (user, pass) = userinfo
        .map(|u| {
            let (a, b) = u.split_once(':').unwrap_or((u, ""));
            (Some(a.to_owned()), Some(b.to_owned()))
        })
        .unwrap_or((None, None));

    (format!("wss://{host}"), user, pass)
}

// ── ID helpers ────────────────────────────────────────────────────────────────

/// Extract the application string ID from a JSON value that holds a SurrealDB RecordId.
/// SurrealDB serialises RecordId as "table:key" or "table:⟨key⟩" for keys with special chars.
fn id_str(v: &serde_json::Value) -> String {
    let s = v.as_str().unwrap_or("");
    let key = s.split_once(':').map(|(_, k)| k).unwrap_or(s);
    key.trim_matches(|c: char| c == '\u{27E8}' || c == '\u{27E9}')
        .to_owned()
}

/// Extract a String field or return empty string.
fn str_field(v: &serde_json::Value, field: &str) -> String {
    v[field].as_str().unwrap_or("").to_owned()
}

/// Extract an optional String field.
fn opt_str_field(v: &serde_json::Value, field: &str) -> Option<String> {
    v[field].as_str().map(str::to_owned)
}

/// Extract an optional DateTime<Utc> from a JSON RFC-3339 string field.
fn opt_datetime_field(v: &serde_json::Value, field: &str) -> Option<DateTime<Utc>> {
    v[field].as_str()?.parse::<DateTime<Utc>>().ok()
}

fn datetime_field(v: &serde_json::Value, field: &str) -> DateTime<Utc> {
    opt_datetime_field(v, field).unwrap_or_else(Utc::now)
}

/// Extract an i64 / i32 field.
fn i32_field(v: &serde_json::Value, field: &str) -> i32 {
    v[field].as_i64().unwrap_or(0) as i32
}

fn bool_field(v: &serde_json::Value, field: &str) -> bool {
    v[field].as_bool().unwrap_or(false)
}

fn str_vec_field(v: &serde_json::Value, field: &str) -> Vec<String> {
    v[field]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn opt_str_vec_field(v: &serde_json::Value, field: &str) -> Option<Vec<String>> {
    let arr = v[field].as_array()?;
    Some(
        arr.iter()
            .filter_map(|x| x.as_str().map(str::to_owned))
            .collect(),
    )
}

// ── DataStore impl ────────────────────────────────────────────────────────────

#[async_trait]
impl DataStore for SurrealStore {
    async fn ensure_schema(&self) -> Result<()> {
        tracing::info!(db_id = %self.db_id, "SurrealStore: applying schema");
        self.db
            .query(
                "DEFINE TABLE IF NOT EXISTS flags SCHEMALESS;
                 DEFINE INDEX IF NOT EXISTS idx_flags_key ON flags FIELDS key UNIQUE;

                 DEFINE TABLE IF NOT EXISTS hidden_rows SCHEMALESS;
                 DEFINE INDEX IF NOT EXISTS idx_hidden_rows_row_id
                   ON hidden_rows FIELDS row_id UNIQUE;

                 DEFINE TABLE IF NOT EXISTS hidden_columns SCHEMALESS;
                 DEFINE INDEX IF NOT EXISTS idx_hidden_columns_column_id
                   ON hidden_columns FIELDS column_id UNIQUE;

                 DEFINE TABLE IF NOT EXISTS remarks SCHEMALESS;

                 DEFINE TABLE IF NOT EXISTS custom_columns SCHEMALESS;
                 DEFINE INDEX IF NOT EXISTS idx_custom_columns_table
                   ON custom_columns FIELDS table_id;

                 DEFINE TABLE IF NOT EXISTS app_tables SCHEMALESS;

                 DEFINE TABLE IF NOT EXISTS table_rows SCHEMALESS;
                 DEFINE INDEX IF NOT EXISTS idx_table_rows_table_id
                   ON table_rows FIELDS table_id;

                 DEFINE TABLE IF NOT EXISTS ops_log SCHEMALESS;",
            )
            .await
            .context("SurrealDB ensure_schema failed")?;
        Ok(())
    }

    async fn set_column_source_path(
        &self,
        column_id: &str,
        path: Option<&[String]>,
    ) -> Result<crate::custom_column::CustomColumn> {
        let path_val = serde_json::to_value(path).unwrap_or(serde_json::Value::Null);
        let content = serde_json::json!({ "source_path": path_val });
        let rec: Option<serde_json::Value> = self
            .db
            .update(("custom_columns", column_id))
            .merge(content)
            .await?;
        let v = rec.ok_or_else(|| anyhow::anyhow!("column not found: {column_id}"))?;
        Ok(row_to_custom_column(&v))
    }

    async fn nuke_user_data(&self) -> Result<()> {
        tracing::warn!(db_id = %self.db_id, "NUKE__DATA: deleting all SurrealDB records (schema preserved)");
        for table in [
            "table_rows",
            "flags",
            "remarks",
            "remark_targets",
            "hidden_rows",
            "hidden_columns",
            "custom_columns",
            "app_tables",
            "github_repos",
            "ops_log",
        ] {
            self.db
                .query(format!("DELETE {table}"))
                .await
                .with_context(|| format!("NUKE__DATA: DELETE {table} failed"))?;
        }
        tracing::warn!(db_id = %self.db_id, "NUKE__DATA: complete");
        Ok(())
    }

    async fn nuke_db(&self) -> Result<()> {
        let db_name = &self.surreal_db;
        let ns_name = &self.surreal_ns;
        tracing::warn!(db_id = %self.db_id, db_name, "NUKE__DB: removing SurrealDB database");
        self.db
            .query(format!("REMOVE DATABASE IF EXISTS `{db_name}`"))
            .await
            .context("NUKE__DB: SurrealDB REMOVE DATABASE failed")?;
        self.db
            .use_ns(ns_name)
            .use_db(db_name)
            .await
            .context("NUKE__DB: SurrealDB use_ns/use_db failed after remove")?;
        tracing::warn!(db_id = %self.db_id, "NUKE__DB: database removed, re-applying schema");
        self.ensure_schema().await?;
        tracing::warn!(db_id = %self.db_id, "NUKE__DB: complete");
        Ok(())
    }

    // ── Flags ─────────────────────────────────────────────────────────────────

    async fn list_flags(&self) -> Result<Vec<crate::flag::CellFlag>> {
        let rows: Vec<serde_json::Value> = self.db.select("flags").await?;
        Ok(rows
            .iter()
            .map(|v| crate::flag::CellFlag {
                id: id_str(&v["id"]),
                key: str_field(v, "key"),
                color: str_field(v, "color"),
            })
            .collect())
    }

    async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> Result<crate::flag::CellFlag> {
        let rec: Option<serde_json::Value> = self
            .db
            .upsert(("flags", id))
            .content(serde_json::json!({ "key": key, "color": color }))
            .await?;
        let v = rec.ok_or_else(|| anyhow::anyhow!("flag upsert returned no record"))?;
        Ok(crate::flag::CellFlag {
            id: id_str(&v["id"]),
            key: str_field(&v, "key"),
            color: str_field(&v, "color"),
        })
    }

    async fn delete_flag(&self, key: &str) -> Result<()> {
        self.db
            .query("DELETE FROM flags WHERE key = $key")
            .bind(("key", key))
            .await?;
        Ok(())
    }

    // ── Remarks ───────────────────────────────────────────────────────────────

    async fn list_remarks(&self) -> Result<Vec<crate::remark::Remark>> {
        let rows: Vec<serde_json::Value> = self.db.select("remarks").await?;
        Ok(rows.iter().map(row_to_remark).collect())
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
        let content = serde_json::json!({
            "body": body,
            "kind": kind,
            "is_private": is_private,
            "resolved_at": resolved_at,
            "targets": serde_json::to_value(targets)?,
        });
        let rec: Option<serde_json::Value> =
            self.db.upsert(("remarks", id)).content(content).await?;
        let v = rec.ok_or_else(|| anyhow::anyhow!("remark upsert returned no record"))?;
        Ok(row_to_remark(&v))
    }

    async fn delete_remark(&self, id: &str) -> Result<()> {
        self.db
            .delete::<Option<serde_json::Value>>(("remarks", id))
            .await?;
        Ok(())
    }

    // ── Hidden rows ───────────────────────────────────────────────────────────

    async fn list_hidden_rows(&self) -> Result<Vec<crate::hidden_row::HiddenRow>> {
        let rows: Vec<serde_json::Value> = self.db.select("hidden_rows").await?;
        Ok(rows
            .iter()
            .map(|v| crate::hidden_row::HiddenRow {
                id: id_str(&v["id"]),
                row_id: str_field(v, "row_id"),
            })
            .collect())
    }

    async fn add_hidden_row(&self, id: &str, row_id: &str) -> Result<crate::hidden_row::HiddenRow> {
        let rec: Option<serde_json::Value> = self
            .db
            .upsert(("hidden_rows", id))
            .content(serde_json::json!({ "row_id": row_id }))
            .await?;
        let v = rec.ok_or_else(|| anyhow::anyhow!("hidden_row upsert returned no record"))?;
        Ok(crate::hidden_row::HiddenRow {
            id: id_str(&v["id"]),
            row_id: str_field(&v, "row_id"),
        })
    }

    async fn remove_hidden_row(&self, row_id: &str) -> Result<()> {
        self.db
            .query("DELETE FROM hidden_rows WHERE row_id = $row_id")
            .bind(("row_id", row_id))
            .await?;
        Ok(())
    }

    // ── Hidden columns ────────────────────────────────────────────────────────

    async fn list_hidden_columns(&self) -> Result<Vec<crate::hidden_column::HiddenColumn>> {
        let rows: Vec<serde_json::Value> = self.db.select("hidden_columns").await?;
        Ok(rows
            .iter()
            .map(|v| crate::hidden_column::HiddenColumn {
                id: id_str(&v["id"]),
                column_id: str_field(v, "column_id"),
            })
            .collect())
    }

    async fn add_hidden_column(
        &self,
        id: &str,
        column_id: &str,
    ) -> Result<crate::hidden_column::HiddenColumn> {
        let rec: Option<serde_json::Value> = self
            .db
            .upsert(("hidden_columns", id))
            .content(serde_json::json!({ "column_id": column_id }))
            .await?;
        let v = rec.ok_or_else(|| anyhow::anyhow!("hidden_column upsert returned no record"))?;
        Ok(crate::hidden_column::HiddenColumn {
            id: id_str(&v["id"]),
            column_id: str_field(&v, "column_id"),
        })
    }

    async fn remove_hidden_column(&self, column_id: &str) -> Result<()> {
        self.db
            .query("DELETE FROM hidden_columns WHERE column_id = $column_id")
            .bind(("column_id", column_id))
            .await?;
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
        let rows: Vec<serde_json::Value> = self
            .db
            .query(
                "SELECT * FROM custom_columns \
                 WHERE table_id = $table_id ORDER BY when_created ASC",
            )
            .bind(("table_id", table_id))
            .await?
            .take(0)?;
        Ok(rows.iter().map(row_to_custom_column).collect())
    }

    async fn upsert_custom_column(
        &self,
        table_id: &str,
        id: &str,
        input: &crate::custom_column::CustomColumnInput,
    ) -> Result<crate::custom_column::CustomColumn> {
        let content = serde_json::json!({
            "table_id": table_id,
            "title": input.title,
            "description": input.description,
            "expression": input.expression,
            "position_before": input.position_before,
            "position_after": input.position_after,
            "read_only": input.read_only,
            "types": input.effective_types(),
            "data_types": input.effective_data_types(),
            "is_group": input.is_group,
            "parent_ids": input.parent_ids,
            "source_path": input.source_path,
            "is_frozen": false,
        });
        let rec: Option<serde_json::Value> = self
            .db
            .upsert(("custom_columns", id))
            .content(content)
            .await?;
        let v = rec.ok_or_else(|| anyhow::anyhow!("custom_column upsert returned no record"))?;
        Ok(row_to_custom_column(&v))
    }

    async fn delete_custom_column(&self, id: &str) -> Result<()> {
        self.db
            .delete::<Option<serde_json::Value>>(("custom_columns", id))
            .await?;
        Ok(())
    }

    async fn set_table_column_frozen(
        &self,
        table_id: &str,
        column_id: &str,
        is_frozen: bool,
    ) -> Result<crate::custom_column::CustomColumn> {
        let rows: Vec<serde_json::Value> = self
            .db
            .query(
                "UPDATE custom_columns SET is_frozen = $is_frozen \
                 WHERE id = type::thing('custom_columns', $col_id) \
                 AND table_id = $table_id RETURN AFTER",
            )
            .bind(("is_frozen", is_frozen))
            .bind(("col_id", column_id))
            .bind(("table_id", table_id))
            .await?
            .take(0)?;
        let v = rows
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("set_table_column_frozen: column not found"))?;
        Ok(row_to_custom_column(&v))
    }

    // ── Tables registry ───────────────────────────────────────────────────────

    async fn list_tables(&self) -> Result<Vec<crate::table::Table>> {
        let rows: Vec<serde_json::Value> = self
            .db
            .query("SELECT * FROM app_tables ORDER BY when_created ASC")
            .await?
            .take(0)?;
        Ok(rows.iter().map(row_to_table).collect())
    }

    async fn create_table(
        &self,
        id: &str,
        title: &str,
        description: Option<&str>,
        who_created: Option<&str>,
    ) -> Result<crate::table::Table> {
        // Idempotent: return existing row if already present.
        let existing: Option<serde_json::Value> = self.db.select(("app_tables", id)).await?;
        if let Some(v) = existing {
            return Ok(row_to_table(&v));
        }
        let now = Utc::now();
        let rec: Option<serde_json::Value> = self
            .db
            .create(("app_tables", id))
            .content(serde_json::json!({
                "title": title,
                "description": description,
                "who_created": who_created,
                "when_created": now,
                "when_last_modified": now,
                "modify_count": 0,
            }))
            .await?;
        let v = rec.ok_or_else(|| anyhow::anyhow!("create_table returned no record"))?;
        Ok(row_to_table(&v))
    }

    async fn patch_table(
        &self,
        id: &str,
        title: Option<&str>,
        description: Option<&str>,
        who_last_modified: Option<&str>,
    ) -> Result<crate::table::Table> {
        let rows: Vec<serde_json::Value> = self
            .db
            .query(
                "UPDATE type::thing('app_tables', $id) SET \
                   title             = IF $title IS NOT NONE THEN $title ELSE title END, \
                   description       = IF $desc  IS NOT NONE THEN $desc  ELSE description END, \
                   who_last_modified = $who, \
                   when_last_modified = time::now(), \
                   modify_count      = modify_count + 1 \
                 RETURN AFTER",
            )
            .bind(("id", id))
            .bind(("title", title))
            .bind(("desc", description))
            .bind(("who", who_last_modified))
            .await?
            .take(0)?;
        let v = rows
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("patch_table: table not found"))?;
        Ok(row_to_table(&v))
    }

    async fn delete_table(&self, id: &str) -> Result<()> {
        self.db
            .delete::<Option<serde_json::Value>>(("app_tables", id))
            .await?;
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
        let collection = format!("t_{table_id}");
        let existing: Option<serde_json::Value> = self.db.select((&collection, row_id)).await?;
        if let Some(v) = existing {
            let mut row = v;
            row["table_id"] = serde_json::Value::String(table_id.to_string());
            return Ok(row);
        }
        let now = Utc::now();
        let custom_vals = title
            .map(|t| serde_json::json!({ "title": t }))
            .unwrap_or_else(|| serde_json::json!({}));
        let rec: Option<serde_json::Value> = self
            .db
            .create((&collection, row_id))
            .content(serde_json::json!({
                "who_created": who_created,
                "when_created": now,
                "when_last_modified": now,
                "custom_vals": custom_vals,
                "modify_count": 0,
            }))
            .await?;
        let mut v = rec.ok_or_else(|| anyhow::anyhow!("create_row returned no record"))?;
        v["table_id"] = serde_json::Value::String(table_id.to_string());
        Ok(v)
    }

    async fn list_data_rows(&self, table_id: &str, params: &RowQuery) -> Result<PagedResponse> {
        let per_page = params.per_page.clamp(1, 200) as i64;
        let offset = (params.page.max(1) - 1) as i64 * per_page;

        if table_id == "tables" {
            let rows: Vec<serde_json::Value> = self
                .db
                .query(
                    "SELECT * FROM app_tables ORDER BY when_created ASC \
                     LIMIT $limit START $offset",
                )
                .bind(("limit", per_page))
                .bind(("offset", offset))
                .await?
                .take(0)?;
            let totals: Vec<serde_json::Value> = self
                .db
                .query("SELECT count() AS c FROM app_tables GROUP ALL")
                .await?
                .take(0)?;
            let total = totals.first().and_then(|v| v["c"].as_i64()).unwrap_or(0);
            let data = rows
                .iter()
                .map(|v| {
                    serde_json::json!({
                        "id": id_str(&v["id"]),
                        "title": v["title"],
                        "description": v["description"],
                        "who_created": v["who_created"],
                        "when_created": v["when_created"],
                        "who_last_modified": v["who_last_modified"],
                        "when_last_modified": v["when_last_modified"],
                        "modify_count": v["modify_count"],
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

        let totals: Vec<serde_json::Value> = self
            .db
            .query("SELECT count() AS c FROM table_rows WHERE table_id = $table_id GROUP ALL")
            .bind(("table_id", table_id))
            .await?
            .take(0)?;
        let total = totals.first().and_then(|v| v["c"].as_i64()).unwrap_or(0);

        let rows: Vec<serde_json::Value> = self
            .db
            .query(
                "SELECT * FROM table_rows WHERE table_id = $table_id \
                 ORDER BY when_created DESC LIMIT $limit START $offset",
            )
            .bind(("table_id", table_id))
            .bind(("limit", per_page))
            .bind(("offset", offset))
            .await?
            .take(0)?;

        let data = rows
            .iter()
            .map(|v| {
                let mut obj = v["custom_values"].as_object().cloned().unwrap_or_default();
                obj.insert("id".into(), serde_json::Value::String(id_str(&v["id"])));
                obj.insert("when_created".into(), v["when_created"].clone());
                obj.insert("when_last_modified".into(), v["when_last_modified"].clone());
                if !v["who_created"].is_null() {
                    obj.insert("who_created".into(), v["who_created"].clone());
                }
                if !v["who_last_modified"].is_null() {
                    obj.insert("who_last_modified".into(), v["who_last_modified"].clone());
                }
                serde_json::Value::Object(obj)
            })
            .collect();

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
        self.db
            .query(
                "UPDATE type::thing('table_rows', $id) \
                 SET custom_values[$col] = $val, \
                     when_last_modified = time::now(), \
                     modify_count = modify_count + 1",
            )
            .bind(("id", row_id))
            .bind(("col", col_id))
            .bind(("val", value))
            .await?;
        Ok(())
    }

    async fn upsert_rows_batch(&self, table_id: &str, rows: &[serde_json::Value]) -> Result<usize> {
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
                    tracing::warn!("surreal upsert_rows_batch: row missing id/github_id");
                    continue;
                }
            };
            // MERGE does a deep object merge: existing keys inside custom_values that are
            // not in this upload are preserved; incoming keys overwrite the existing value.
            let _: Option<serde_json::Value> = self
                .db
                .upsert(("table_rows", id.as_str()))
                .merge(serde_json::json!({ "table_id": table_id, "custom_values": row }))
                .await?;
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
        // INSERT IGNORE: no-op if record with this id already exists (idempotent).
        if let Err(e) = self
            .db
            .query(
                "INSERT IGNORE INTO ops_log { \
                   id: $id, op: $op, payload: $payload, tx_id: $tx_id, \
                   when_created: time::now(), applied_at: NONE \
                 }",
            )
            .bind(("id", id))
            .bind(("op", op))
            .bind(("payload", payload))
            .bind(("tx_id", tx_id))
            .await
        {
            tracing::error!(op = %op, "surreal ops_log begin failed: {e}");
        }
    }

    async fn mark_op_applied(&self, id: &str) {
        if let Err(e) = self
            .db
            .query(
                "UPDATE ops_log SET applied_at = time::now() WHERE id = $id AND applied_at IS NONE",
            )
            .bind(("id", id))
            .await
        {
            tracing::error!("surreal ops_log mark_applied failed for id={id}: {e}");
        }
    }

    async fn pending_ops(&self) -> anyhow::Result<Vec<crate::store::PendingOp>> {
        let mut res = self
            .db
            .query(
                "SELECT id, op, payload, tx_id FROM ops_log WHERE applied_at IS NONE ORDER BY id",
            )
            .await
            .map_err(|e| anyhow::anyhow!("surreal pending_ops: {e}"))?;
        let rows: Vec<serde_json::Value> = res
            .take(0)
            .map_err(|e| anyhow::anyhow!("surreal pending_ops take: {e}"))?;
        Ok(rows
            .into_iter()
            .map(|v| crate::store::PendingOp {
                seq: None,
                id: v["id"].as_str().unwrap_or("").to_owned(),
                op: v["op"].as_str().unwrap_or("").to_owned(),
                payload: v["payload"].clone(),
                when_created: chrono::Utc::now(),
                who_created: v["who_created"].as_str().map(str::to_owned),
                tx_id: v["tx_id"].as_str().map(str::to_owned),
            })
            .collect())
    }
}

// ── Row → domain type converters ──────────────────────────────────────────────

fn row_to_remark(v: &serde_json::Value) -> crate::remark::Remark {
    let targets = v["targets"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|t| crate::remark::RemarkTarget {
                    row_id: str_field(t, "row_id"),
                    column_id: str_field(t, "column_id"),
                })
                .collect()
        })
        .unwrap_or_default();
    crate::remark::Remark {
        id: id_str(&v["id"]),
        body: str_field(v, "body"),
        kind: str_field(v, "kind"),
        is_private: bool_field(v, "is_private"),
        resolved_at: opt_datetime_field(v, "resolved_at"),
        targets,
    }
}

fn row_to_custom_column(v: &serde_json::Value) -> crate::custom_column::CustomColumn {
    crate::custom_column::CustomColumn {
        id: id_str(&v["id"]),
        title: opt_str_field(v, "title"),
        description: opt_str_field(v, "description"),
        expression: opt_str_field(v, "expression"),
        position_before: opt_str_field(v, "position_before"),
        position_after: opt_str_field(v, "position_after"),
        read_only: bool_field(v, "read_only"),
        types: str_vec_field(v, "types"),
        source_path: opt_str_vec_field(v, "source_path"),
        data_types: str_vec_field(v, "data_types"),
        is_group: bool_field(v, "is_group"),
        parent_ids: str_vec_field(v, "parent_ids"),
        is_frozen: bool_field(v, "is_frozen"),
    }
}

fn row_to_table(v: &serde_json::Value) -> crate::table::Table {
    crate::table::Table {
        id: id_str(&v["id"]),
        title: str_field(v, "title"),
        description: opt_str_field(v, "description"),
        who_created: opt_str_field(v, "who_created"),
        when_created: datetime_field(v, "when_created"),
        who_last_modified: opt_str_field(v, "who_last_modified"),
        when_last_modified: datetime_field(v, "when_last_modified"),
        modify_count: i32_field(v, "modify_count"),
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_surreal_url ─────────────────────────────────────────────────────

    #[test]
    fn pass_through_wss_url() {
        let (url, user, pass) = parse_surreal_url("wss://host.example.com");
        assert_eq!(url, "wss://host.example.com");
        assert!(user.is_none());
        assert!(pass.is_none());
    }

    #[test]
    fn pass_through_ws_url() {
        let (url, user, pass) = parse_surreal_url("ws://localhost:8000");
        assert_eq!(url, "ws://localhost:8000");
        assert!(user.is_none());
        assert!(pass.is_none());
    }

    #[test]
    fn surreal_scheme_converts_to_wss() {
        let (url, user, pass) = parse_surreal_url("surreal://host.example.com");
        assert_eq!(url, "wss://host.example.com");
        assert!(user.is_none());
        assert!(pass.is_none());
    }

    #[test]
    fn surreal_plus_ws_scheme_converts_to_wss() {
        let (url, user, pass) = parse_surreal_url("surreal+ws://host.example.com");
        assert_eq!(url, "wss://host.example.com");
        assert!(user.is_none());
        assert!(pass.is_none());
    }

    #[test]
    fn extracts_embedded_credentials() {
        let (url, user, pass) = parse_surreal_url("surreal://alice:secret@host.example.com");
        assert_eq!(url, "wss://host.example.com");
        assert_eq!(user.as_deref(), Some("alice"));
        assert_eq!(pass.as_deref(), Some("secret"));
    }

    #[test]
    fn strips_ns_db_path_suffix() {
        let (url, _, _) = parse_surreal_url("surreal://host.example.com/mynamespace/mydb");
        assert_eq!(url, "wss://host.example.com");
    }

    #[test]
    fn strips_path_with_credentials() {
        let (url, user, pass) = parse_surreal_url("surreal://root:pass@host.example.com/ns/db");
        assert_eq!(url, "wss://host.example.com");
        assert_eq!(user.as_deref(), Some("root"));
        assert_eq!(pass.as_deref(), Some("pass"));
    }

    // ── id_str ────────────────────────────────────────────────────────────────

    #[test]
    fn id_str_extracts_key_after_colon() {
        let v = serde_json::json!("flags:mykey");
        assert_eq!(id_str(&v), "mykey");
    }

    #[test]
    fn id_str_no_colon_returns_whole() {
        let v = serde_json::json!("justkey");
        assert_eq!(id_str(&v), "justkey");
    }

    #[test]
    fn id_str_strips_angle_brackets() {
        // SurrealDB wraps special-char keys in ⟨⟩ (U+27E8/U+27E9).
        let v = serde_json::json!("flags:\u{27E8}my-special-key\u{27E9}");
        assert_eq!(id_str(&v), "my-special-key");
    }

    #[test]
    fn id_str_non_string_returns_empty() {
        let v = serde_json::json!(42);
        assert_eq!(id_str(&v), "");
    }

    // ── field helpers ─────────────────────────────────────────────────────────

    #[test]
    fn str_field_present() {
        let v = serde_json::json!({ "key": "hello" });
        assert_eq!(str_field(&v, "key"), "hello");
    }

    #[test]
    fn str_field_missing_returns_empty() {
        let v = serde_json::json!({});
        assert_eq!(str_field(&v, "missing"), "");
    }

    #[test]
    fn opt_str_field_present() {
        let v = serde_json::json!({ "note": "hi" });
        assert_eq!(opt_str_field(&v, "note"), Some("hi".to_owned()));
    }

    #[test]
    fn opt_str_field_missing_returns_none() {
        let v = serde_json::json!({});
        assert!(opt_str_field(&v, "note").is_none());
    }

    #[test]
    fn bool_field_true() {
        let v = serde_json::json!({ "flag": true });
        assert!(bool_field(&v, "flag"));
    }

    #[test]
    fn bool_field_false_or_missing() {
        let v = serde_json::json!({ "flag": false });
        assert!(!bool_field(&v, "flag"));
        assert!(!bool_field(&v, "missing"));
    }

    #[test]
    fn i32_field_extracts_integer() {
        let v = serde_json::json!({ "count": 7 });
        assert_eq!(i32_field(&v, "count"), 7);
    }

    #[test]
    fn i32_field_missing_returns_zero() {
        let v = serde_json::json!({});
        assert_eq!(i32_field(&v, "missing"), 0);
    }

    #[test]
    fn str_vec_field_extracts_array() {
        let v = serde_json::json!({ "tags": ["rust", "async"] });
        assert_eq!(str_vec_field(&v, "tags"), vec!["rust", "async"]);
    }

    #[test]
    fn str_vec_field_missing_returns_empty() {
        let v = serde_json::json!({});
        assert!(str_vec_field(&v, "tags").is_empty());
    }

    #[test]
    fn opt_datetime_field_valid_rfc3339() {
        let v = serde_json::json!({ "ts": "2024-01-15T10:30:00Z" });
        let dt = opt_datetime_field(&v, "ts");
        assert!(dt.is_some());
        assert_eq!(dt.unwrap().to_rfc3339(), "2024-01-15T10:30:00+00:00");
    }

    #[test]
    fn opt_datetime_field_missing_returns_none() {
        let v = serde_json::json!({});
        assert!(opt_datetime_field(&v, "ts").is_none());
    }
}
