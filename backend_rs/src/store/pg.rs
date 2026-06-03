use std::{collections::HashMap, time::Duration};

use anyhow::Result;
use async_trait::async_trait;
use sqlx::{postgres::PgPoolOptions, PgPool, Postgres, QueryBuilder, Row};

use super::DataStore;
use crate::{
    custom_column::CustomColumn,
    flag::CellFlag,
    hidden_column::HiddenColumn,
    hidden_row::HiddenRow,
    remark::{Remark, RemarkRow, RemarkTarget},
    table::Table,
    types::{PagedResponse, RowQuery},
};

pub struct PgStore {
    pub(super) pool: PgPool,
    db_id: String,
    /// Column IDs known to exist per table. Avoids hitting the DB on every batch
    /// when auto-detected columns were already created in a previous upload.
    known_cols:
        std::sync::RwLock<std::collections::HashMap<String, std::collections::HashSet<String>>>,
}

/// Infer display type from a JSON value.
fn infer_col_types(v: &serde_json::Value) -> Vec<String> {
    match v {
        serde_json::Value::Number(_) => vec!["numeric".into()],
        serde_json::Value::Bool(_) => vec!["boolean".into()],
        serde_json::Value::Array(_) => vec!["array".into()],
        _ => vec!["text".into()],
    }
}

fn inferred_nested_source_path(id: &str, parent_ids: &[String]) -> Option<Vec<String>> {
    let parent = parent_ids.last()?;
    let child = id.strip_prefix(&format!("{parent}__"))?;
    if child.is_empty() {
        return None;
    }
    Some(vec![parent.clone(), child.to_string()])
}

/// Returns the double-quoted PG identifier for a user table, e.g. `"t_gh_repos"`.
/// The table_id is already validated to `[a-zA-Z0-9_-]+` at the API boundary,
/// but we strip any double-quotes defensively.
fn user_table_ident(table_id: &str) -> String {
    format!("\"t_{}\"", table_id.replace('"', ""))
}

fn schema_statement_hash(stmt: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in stmt.replace("\r\n", "\n").trim().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn schema_statement_id(stmt: &str) -> String {
    let mut id = String::new();
    let mut last_was_separator = false;

    for ch in stmt.trim().chars().flat_map(|ch| ch.to_lowercase()) {
        let is_word = ch.is_ascii_alphanumeric();
        if is_word {
            id.push(ch);
            last_was_separator = false;
        } else if !last_was_separator && !id.is_empty() {
            id.push('_');
            last_was_separator = true;
        }
        if id.len() >= 160 {
            break;
        }
    }

    while id.ends_with('_') {
        id.pop();
    }
    id
}

impl PgStore {
    pub async fn connect(db_id: &str, url: &str) -> Result<Self> {
        let short = url.split('@').last().unwrap_or(url);
        let max_conn = std::env::var("PG_MAX_CONNECTIONS")
            .ok()
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(10);
        let acquire_secs = std::env::var("PG_ACQUIRE_TIMEOUT_SECS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(5);
        let pool = PgPoolOptions::new()
            .max_connections(max_conn)
            .acquire_timeout(Duration::from_secs(acquire_secs))
            .connect(url)
            .await
            .map_err(|e| anyhow::anyhow!("PgStore({db_id}): failed to connect to {short}: {e}"))?;
        tracing::info!(db_id, url = short, max_conn, acquire_timeout_secs = acquire_secs, "PgStore: connected");
        Ok(Self { pool, db_id: db_id.to_string(), known_cols: Default::default() })
    }

    /// Connect with a dedicated PostgreSQL schema.
    ///
    /// Every connection in the pool runs `CREATE SCHEMA IF NOT EXISTS` and
    /// `SET search_path` on first use, so all DDL and DML goes to `schema`
    /// instead of `public`. Useful for test isolation: each test gets its own
    /// schema and can run in parallel without touching shared tables.
    pub async fn connect_with_schema(
        db_id: &str,
        url: &str,
        schema: &str,
        max_connections: u32,
    ) -> Result<Self> {
        let short = url.split('@').last().unwrap_or(url);
        let schema_owned = schema.to_string();
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .acquire_timeout(Duration::from_secs(30))
            .after_connect(move |conn, _meta| {
                let s = schema_owned.clone();
                Box::pin(async move {
                    sqlx::query(&format!("CREATE SCHEMA IF NOT EXISTS \"{s}\""))
                        .execute(&mut *conn).await?;
                    sqlx::query(&format!("SET search_path TO \"{s}\""))
                        .execute(&mut *conn).await?;
                    Ok(())
                })
            })
            .connect(url)
            .await
            .map_err(|e| anyhow::anyhow!("PgStore({db_id}, schema={schema}): failed to connect to {short}: {e}"))?;
        tracing::info!(db_id, url = short, schema, "PgStore: connected with schema");
        Ok(Self { pool, db_id: db_id.to_string(), known_cols: Default::default() })
    }

    /// Create a physical PG table for a user table if it doesn't yet exist.
    /// Also adds a GIN index on `custom_vals` for fast JSONB lookups.
    pub async fn ensure_user_table(&self, table_id: &str) -> Result<()> {
        let tname = user_table_ident(table_id);
        sqlx::query(&format!(
            r#"CREATE TABLE IF NOT EXISTS {tname} (
                id                TEXT        PRIMARY KEY,
                when_created      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                when_last_modified TIMESTAMPTZ,
                who_created       TEXT,
                who_last_modified TEXT,
                modify_count      INTEGER     NOT NULL DEFAULT 0,
                custom_vals       JSONB       NOT NULL DEFAULT '{{}}'
            )"#
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table({table_id}): {e}"))?;

        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS \"idx_{table_id}_custom_vals\" \
             ON {tname} USING GIN (custom_vals)"
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table index({table_id}): {e}"))?;

        Ok(())
    }

    /// Add a btree index for a specific custom column on a user table.
    /// `types` is the column's declared type list (e.g. `["numeric"]`); used to
    /// cast the indexed expression so the index is usable by numeric sort queries.
    pub async fn ensure_column_index(
        &self,
        table_id: &str,
        col_id: &str,
        types: &[String],
    ) -> Result<()> {
        let tname = user_table_ident(table_id);
        let col_safe = col_id.replace('"', "");
        let idx = format!("idx_{table_id}_{col_safe}");
        let cast = if types
            .iter()
            .any(|t| matches!(t.as_str(), "integer" | "bigint" | "numeric"))
        {
            "::numeric"
        } else if types.iter().any(|t| t == "timestamptz") {
            "::timestamptz"
        } else {
            ""
        };
        let expr = format!("custom_vals->>{col_safe:?}");
        let indexed = if cast.is_empty() {
            format!("({expr})")
        } else {
            format!("(({expr}){cast})")
        };
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS \"{idx}\" ON {tname} USING btree ({indexed})"
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_column_index({table_id}.{col_id}): {e}"))?;
        Ok(())
    }

    /// Detect fields in a sample row and create missing custom columns for this table.
    ///
    /// Plain scalar fields become leaf columns. Fields whose value is a JSON object
    /// become a group column with one child column per sub-key; each child gets a
    /// `source_path` so the frontend navigates correctly into the nested JSONB
    /// (e.g. `stars_diff.7d`).
    ///
    /// An in-memory cache avoids redundant DB calls across batches in the same process.
    async fn auto_create_columns_from_row(
        &self,
        table_id: &str,
        sample: &serde_json::Value,
    ) -> Result<()> {
        const SKIP: &[&str] = &[
            "id",
            "github_id",
            "table_id",
            "who_created",
            "when_created",
            "when_last_modified",
            "modify_count",
        ];

        let Some(obj) = sample.as_object() else {
            return Ok(());
        };

        struct ColSpec {
            id: String,
            title: Option<String>,
            position_before: Option<String>,
            position_after: Option<String>,
            types: Vec<String>,
            is_group: bool,
            parent_ids: Vec<String>,
            source_path: Option<Vec<String>>,
        }
        let mut specs: Vec<ColSpec> = Vec::new();
        let mut root_indices: Vec<usize> = Vec::new();

        for (field, value) in obj {
            if SKIP.contains(&field.as_str()) || value.is_null() {
                continue;
            }
            if let Some(sub_obj) = value.as_object() {
                if sub_obj.is_empty() {
                    continue;
                }
                specs.push(ColSpec {
                    id: field.clone(),
                    title: None,
                    position_before: None,
                    position_after: root_indices.last().map(|idx| specs[*idx].id.clone()),
                    types: vec![],
                    is_group: true,
                    parent_ids: vec![],
                    source_path: None,
                });
                root_indices.push(specs.len() - 1);
                let mut child_indices: Vec<usize> = Vec::new();
                for (sub_key, sub_val) in sub_obj {
                    if sub_val.is_null() {
                        continue;
                    }
                    let id = format!("{field}__{sub_key}");
                    specs.push(ColSpec {
                        id: id.clone(),
                        title: Some(sub_key.clone()),
                        position_before: None,
                        position_after: child_indices.last().map(|idx| specs[*idx].id.clone()),
                        types: infer_col_types(sub_val),
                        is_group: false,
                        parent_ids: vec![field.clone()],
                        source_path: Some(vec![field.clone(), sub_key.clone()]),
                    });
                    child_indices.push(specs.len() - 1);
                }
                for pair in child_indices.windows(2) {
                    let next_id = specs[pair[1]].id.clone();
                    specs[pair[0]].position_before = Some(next_id);
                }
            } else {
                specs.push(ColSpec {
                    id: field.clone(),
                    title: None,
                    position_before: None,
                    position_after: root_indices.last().map(|idx| specs[*idx].id.clone()),
                    types: infer_col_types(value),
                    is_group: false,
                    parent_ids: vec![],
                    source_path: None,
                });
                root_indices.push(specs.len() - 1);
            }
        }
        for pair in root_indices.windows(2) {
            let next_id = specs[pair[1]].id.clone();
            specs[pair[0]].position_before = Some(next_id);
        }

        // Only create columns not already in the per-process cache.
        let missing_ids: Vec<usize> = {
            let cache = self.known_cols.read().unwrap();
            let known = cache.get(table_id);
            specs
                .iter()
                .enumerate()
                .filter(|(_, s)| known.map_or(true, |k| !k.contains(&s.id)))
                .map(|(i, _)| i)
                .collect()
        };
        if missing_ids.is_empty() {
            return Ok(());
        }

        let base = crate::custom_column::CustomColumnInput::default();
        for &i in &missing_ids {
            let spec = &specs[i];
            let data_types = if spec.types.iter().any(|t| t == "numeric") {
                vec!["numeric".into()]
            } else if spec.types.iter().any(|t| t == "boolean") {
                vec!["boolean".into()]
            } else {
                vec!["text".into()]
            };
            let inp = crate::custom_column::CustomColumnInput {
                title: spec.title.clone(),
                position_before: spec.position_before.clone(),
                position_after: spec.position_after.clone(),
                types: if spec.types.is_empty() {
                    None
                } else {
                    Some(spec.types.clone())
                },
                data_types: Some(data_types),
                is_group: spec.is_group,
                parent_ids: spec.parent_ids.clone(),
                source_path: spec.source_path.clone(),
                ..base.clone()
            };
            if let Err(e) = self.upsert_custom_column(table_id, &spec.id, &inp).await {
                tracing::warn!(table_id, col_id = %spec.id, "auto-create column failed: {e}");
            }
        }

        let mut cache = self.known_cols.write().unwrap();
        let entry = cache.entry(table_id.to_string()).or_default();
        for spec in &specs {
            entry.insert(spec.id.clone());
        }
        Ok(())
    }
}

#[async_trait]
impl DataStore for PgStore {
    async fn ensure_schema(&self) -> Result<()> {
        let stmts = super::pg_schema::POSTGRES_SCHEMA;
        let db_id = &self.db_id;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                id              TEXT PRIMARY KEY,
                schema_hash     TEXT NOT NULL,
                statement_index INTEGER NOT NULL,
                statement_sql   TEXT NOT NULL,
                applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )",
        )
        .execute(&self.pool)
        .await
        .map_err(|e| {
            anyhow::anyhow!("PgStore({db_id}): schema_migrations bootstrap failed: {e}")
        })?;

        let applied_rows: Vec<(String, String)> =
            sqlx::query_as("SELECT id, schema_hash FROM schema_migrations")
                .fetch_all(&self.pool)
                .await
                .map_err(|e| {
                    anyhow::anyhow!("PgStore({db_id}): schema_migrations read failed: {e}")
                })?;
        let applied: HashMap<String, String> = applied_rows.into_iter().collect();

        let pending: Vec<(usize, &str, String, String)> = stmts
            .iter()
            .enumerate()
            .filter_map(|(idx, stmt)| {
                let id = schema_statement_id(stmt);
                let hash = schema_statement_hash(stmt);
                if applied.get(&id) == Some(&hash) {
                    None
                } else {
                    Some((idx, *stmt, id, hash))
                }
            })
            .collect();

        if pending.is_empty() {
            tracing::debug!(
                db_id,
                applied = applied.len(),
                "PgStore: schema is current, skipping DDL"
            );
            return Ok(());
        }

        tracing::info!(
            db_id,
            total = stmts.len(),
            pending = pending.len(),
            "PgStore: applying schema migrations"
        );
        let t0 = std::time::Instant::now();

        let mut tx = self.pool.begin().await?;
        for (idx, stmt, id, hash) in pending {
            sqlx::query(stmt).execute(&mut *tx).await.map_err(|e| {
                anyhow::anyhow!(
                    "PgStore({db_id}): schema migration {id} (statement {idx}) failed: {e}"
                )
            })?;
            sqlx::query(
                "INSERT INTO schema_migrations (id, schema_hash, statement_index, statement_sql)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (id) DO UPDATE
                 SET schema_hash = EXCLUDED.schema_hash,
                     statement_index = EXCLUDED.statement_index,
                     statement_sql = EXCLUDED.statement_sql,
                     applied_at = NOW()",
            )
            .bind(&id)
            .bind(&hash)
            .bind(idx as i32)
            .bind(stmt)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                anyhow::anyhow!("PgStore({db_id}): schema migration {id} record failed: {e}")
            })?;
        }
        tx.commit().await.map_err(|e| {
            anyhow::anyhow!("PgStore({db_id}): schema transaction commit failed: {e}")
        })?;

        tracing::info!(
            db_id,
            ms = t0.elapsed().as_millis(),
            "PgStore: schema applied"
        );
        Ok(())
    }

    async fn nuke_user_data(&self) -> Result<()> {
        let db_id = &self.db_id;
        tracing::warn!(db_id, "NUKE__DATA: truncating all user data (schema preserved)");

        // Truncate all known application tables in one shot.
        // CASCADE handles FK-ordered dependencies automatically.
        sqlx::query(
            "TRUNCATE TABLE remarks, remark_targets, custom_columns, cell_flags,
                          hidden_rows, hidden_columns, operations_log, tables,
                          github_repos, table_custom_columns CASCADE",
        )
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("NUKE__DATA({db_id}): TRUNCATE failed: {e}"))?;

        // Drop user-created physical row tables (named t_<table_id>) entirely so
        // that indexes are also removed and recreated fresh on the next upload.
        let user_tables: Vec<String> = sqlx::query_scalar(
            "SELECT tablename FROM pg_tables \
             WHERE schemaname = 'public' AND LEFT(tablename, 2) = 't_'",
        )
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();
        for tbl in &user_tables {
            let safe = tbl.replace('"', "");
            sqlx::query(&format!("DROP TABLE IF EXISTS \"{safe}\" CASCADE"))
                .execute(&self.pool)
                .await
                .map_err(|e| anyhow::anyhow!("NUKE__DATA({db_id}): DROP {safe} failed: {e}"))?;
        }
        tracing::warn!(db_id, user_tables = user_tables.len(), "NUKE__DATA: complete");
        Ok(())
    }

    async fn nuke_db(&self) -> Result<()> {
        let db_id = &self.db_id;
        tracing::warn!(db_id, "NUKE__DB: dropping Postgres public schema");
        sqlx::query("DROP SCHEMA public CASCADE")
            .execute(&self.pool)
            .await
            .map_err(|e| anyhow::anyhow!("NUKE__DB({db_id}): DROP SCHEMA failed: {e}"))?;
        sqlx::query("CREATE SCHEMA public")
            .execute(&self.pool)
            .await
            .map_err(|e| anyhow::anyhow!("NUKE__DB({db_id}): CREATE SCHEMA failed: {e}"))?;
        tracing::warn!(db_id, "NUKE__DB: schema dropped, re-applying");
        self.ensure_schema().await?;
        tracing::warn!(db_id, "NUKE__DB: complete");
        Ok(())
    }

    // ── Flags ─────────────────────────────────────────────────────────────────

    async fn list_flags(&self) -> Result<Vec<CellFlag>> {
        Ok(sqlx::query_as::<_, CellFlag>(
            "SELECT id::text, key, color FROM cell_flags ORDER BY key",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> Result<CellFlag> {
        Ok(sqlx::query_as::<_, CellFlag>(
            "INSERT INTO cell_flags (id, key, color)
             VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE
               SET color = EXCLUDED.color,
                   when_last_modified = NOW(),
                   modify_count = cell_flags.modify_count + 1
             RETURNING id::text, key, color",
        )
        .bind(id)
        .bind(key)
        .bind(color)
        .fetch_one(&self.pool)
        .await?)
    }

    async fn delete_flag(&self, key: &str) -> Result<()> {
        sqlx::query("DELETE FROM cell_flags WHERE key = $1")
            .bind(key)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Remarks ───────────────────────────────────────────────────────────────

    async fn list_remarks(&self) -> Result<Vec<Remark>> {
        let rows = sqlx::query_as::<_, RemarkRow>(
            "SELECT r.id, r.body, r.kind, r.is_private, r.resolved_at,
                    COALESCE(
                      json_agg(
                        json_build_object('row_id', t.row_id, 'column_id', t.column_id)
                      ) FILTER (WHERE t.remark_id IS NOT NULL),
                      '[]'::json
                    ) AS targets_json
             FROM remarks r
             LEFT JOIN remark_targets t ON t.remark_id = r.id
             GROUP BY r.id
             ORDER BY r.when_created",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(Remark::from).collect())
    }

    async fn upsert_remark(
        &self,
        id: &str,
        body: &str,
        kind: &str,
        is_private: bool,
        resolved_at: Option<chrono::DateTime<chrono::Utc>>,
        targets: &[RemarkTarget],
    ) -> Result<Remark> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            "INSERT INTO remarks (id, body, kind, is_private, resolved_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE
               SET body = EXCLUDED.body, kind = EXCLUDED.kind,
                   is_private = EXCLUDED.is_private, resolved_at = EXCLUDED.resolved_at,
                   when_last_modified = NOW(),
                   modify_count = remarks.modify_count + 1",
        )
        .bind(id)
        .bind(body)
        .bind(kind)
        .bind(is_private)
        .bind(resolved_at)
        .execute(&mut *tx)
        .await?;

        sqlx::query("DELETE FROM remark_targets WHERE remark_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        for t in targets {
            sqlx::query(
                "INSERT INTO remark_targets (remark_id, row_id, column_id) VALUES ($1, $2, $3)",
            )
            .bind(id)
            .bind(&t.row_id)
            .bind(&t.column_id)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;

        Ok(Remark {
            id: id.to_string(),
            body: body.to_string(),
            kind: kind.to_string(),
            is_private,
            resolved_at,
            targets: targets.to_vec(),
        })
    }

    async fn delete_remark(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM remarks WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Hidden rows ───────────────────────────────────────────────────────────

    async fn list_hidden_rows(&self) -> Result<Vec<HiddenRow>> {
        Ok(sqlx::query_as::<_, HiddenRow>(
            "SELECT id::text, row_id FROM hidden_rows ORDER BY when_created",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn add_hidden_row(&self, id: &str, row_id: &str) -> Result<HiddenRow> {
        Ok(sqlx::query_as::<_, HiddenRow>(
            "INSERT INTO hidden_rows (id, row_id)
             VALUES ($1, $2)
             ON CONFLICT (row_id) DO UPDATE SET row_id = EXCLUDED.row_id
             RETURNING id::text, row_id",
        )
        .bind(id)
        .bind(row_id)
        .fetch_one(&self.pool)
        .await?)
    }

    async fn remove_hidden_row(&self, row_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM hidden_rows WHERE row_id = $1")
            .bind(row_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Hidden columns ────────────────────────────────────────────────────────

    async fn list_hidden_columns(&self) -> Result<Vec<HiddenColumn>> {
        Ok(sqlx::query_as::<_, HiddenColumn>(
            "SELECT id::text, column_id FROM hidden_columns ORDER BY column_id",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn add_hidden_column(&self, id: &str, column_id: &str) -> Result<HiddenColumn> {
        Ok(sqlx::query_as::<_, HiddenColumn>(
            "INSERT INTO hidden_columns (id, column_id)
             VALUES ($1, $2)
             ON CONFLICT (column_id) DO UPDATE SET column_id = EXCLUDED.column_id
             RETURNING id::text, column_id",
        )
        .bind(id)
        .bind(column_id)
        .fetch_one(&self.pool)
        .await?)
    }

    async fn remove_hidden_column(&self, column_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM hidden_columns WHERE column_id = $1")
            .bind(column_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Custom columns ────────────────────────────────────────────────────────

    async fn list_custom_columns(&self, table_id: &str) -> Result<Vec<CustomColumn>> {
        if table_id == "tables" {
            return Ok(super::table_view_columns());
        }

        Ok(sqlx::query_as::<_, CustomColumn>(
            "SELECT c.id::text, c.title, c.description, c.expression,
               COALESCE(tcc.position_before, c.position_before) AS position_before,
               COALESCE(tcc.position_after, c.position_after) AS position_after,
               c.read_only, c.types, c.source_path,
               COALESCE(c.data_types, ARRAY[]::TEXT[]) AS data_types,
               COALESCE(c.is_group, false) AS is_group,
               COALESCE(c.parent_ids, ARRAY[]::TEXT[]) AS parent_ids,
               COALESCE(tcc.is_frozen, c.is_frozen) AS is_frozen
             FROM custom_columns c
             JOIN table_custom_columns tcc ON tcc.column_id = c.id
             WHERE tcc.table_id = $1
             ORDER BY tcc.when_created, c.when_created",
        )
        .bind(table_id)
        .fetch_all(&self.pool)
        .await?)
    }

    async fn upsert_custom_column(
        &self,
        table_id: &str,
        id: &str,
        input: &crate::custom_column::CustomColumnInput,
    ) -> Result<CustomColumn> {
        if table_id != "tables" {
            self.ensure_user_table(table_id).await?;
            sqlx::query(
                "INSERT INTO tables (id, title)
                 VALUES ($1, $2)
                 ON CONFLICT (id) DO NOTHING",
            )
            .bind(table_id)
            .bind(table_id)
            .execute(&self.pool)
            .await
            .map_err(|e| anyhow::anyhow!("upsert_custom_column: ensure table {table_id}: {e}"))?;
        }

        let effective_source_path = input
            .source_path
            .clone()
            .filter(|path| !path.is_empty())
            .or_else(|| inferred_nested_source_path(id, &input.parent_ids));
        let types = input.effective_types();
        let data_types = input.effective_data_types();
        let col = sqlx::query_as::<_, CustomColumn>(
            "WITH upsert_col AS (
               INSERT INTO custom_columns
                 (id, title, description, expression, position_before, position_after,
                  read_only, is_frozen, is_group, parent_ids, source_path, types, data_types)
               VALUES ($1, $2, $3, $4, $5, $6, $13, false, $8, $9, $10, $11, $12)
               ON CONFLICT (id) DO UPDATE
                 SET title = EXCLUDED.title,
                     description = EXCLUDED.description,
                     expression = EXCLUDED.expression,
                     position_before = COALESCE(EXCLUDED.position_before, custom_columns.position_before),
                     position_after  = COALESCE(EXCLUDED.position_after,  custom_columns.position_after),
                     read_only = EXCLUDED.read_only,
                     is_group = EXCLUDED.is_group,
                     parent_ids = EXCLUDED.parent_ids,
                     source_path = COALESCE(EXCLUDED.source_path, custom_columns.source_path),
                     types = EXCLUDED.types,
                     data_types = EXCLUDED.data_types,
                     when_last_modified = NOW(),
                     modify_count = custom_columns.modify_count + 1
               RETURNING *
             ),
             attach AS (
               INSERT INTO table_custom_columns (table_id, column_id, position_before, position_after)
               VALUES ($7, $1, $5, $6)
               ON CONFLICT (table_id, column_id) DO UPDATE
                 SET position_before = COALESCE(EXCLUDED.position_before, table_custom_columns.position_before),
                     position_after  = COALESCE(EXCLUDED.position_after,  table_custom_columns.position_after),
                     when_last_modified = NOW(),
                     modify_count = table_custom_columns.modify_count + 1
               RETURNING *
             )
             SELECT c.id::text, c.title, c.description, c.expression,
               COALESCE(a.position_before, c.position_before) AS position_before,
               COALESCE(a.position_after, c.position_after) AS position_after,
               c.read_only, c.types, c.source_path,
               COALESCE(c.data_types, ARRAY[]::TEXT[]) AS data_types,
               COALESCE(c.is_group, false) AS is_group,
               COALESCE(c.parent_ids, ARRAY[]::TEXT[]) AS parent_ids,
               COALESCE(a.is_frozen, c.is_frozen) AS is_frozen
             FROM upsert_col c
             JOIN attach a ON a.column_id = c.id",
        )
        .bind(id)
        .bind(input.title.as_deref())
        .bind(input.description.as_deref())
        .bind(input.expression.as_deref())
        .bind(input.position_before.as_deref())
        .bind(input.position_after.as_deref())
        .bind(table_id)
        .bind(input.is_group)
        .bind(&input.parent_ids)
        .bind(&effective_source_path)
        .bind(&types)
        .bind(&data_types)
        .bind(input.read_only)
        .fetch_one(&self.pool)
        .await?;

        // Per-column index on the physical user table.
        // Uses source_path when available (nested/read-only data), otherwise the stable column id.
        let mut index_input = input.clone();
        index_input.source_path = effective_source_path;
        let jsonb_expr = build_index_expr(id, &index_input);
        let types = index_input.effective_types();
        let (cast, direction) = if types
            .iter()
            .any(|t| matches!(t.as_str(), "integer" | "bigint" | "numeric"))
        {
            ("::numeric", " DESC NULLS LAST")
        } else if types.iter().any(|t| t == "timestamptz") {
            ("::timestamptz", " DESC NULLS LAST")
        } else {
            ("", "")
        };
        let cast_expr = if cast.is_empty() {
            jsonb_expr.clone()
        } else {
            format!("({jsonb_expr}){cast}")
        };
        let tname = user_table_ident(table_id);
        for suffix in ["", "_asc"] {
            if suffix == "_asc" && direction != " DESC NULLS LAST" {
                break;
            }
            let idx = format!("idx_cv_{}_{id}{suffix}", table_id.replace('-', "_"));
            let dir = if suffix.is_empty() {
                direction
            } else {
                " ASC NULLS LAST"
            };
            let sql =
                format!(r#"CREATE INDEX IF NOT EXISTS "{idx}" ON {tname} (({cast_expr}){dir})"#);
            if let Err(e) = sqlx::query(&sql).execute(&self.pool).await {
                tracing::warn!("could not create index \"{idx}\": {e}");
            }
        }

        Ok(col)
    }

    async fn delete_custom_column(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM custom_columns WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;

        for idx in [format!("idx_cv_{id}"), format!("idx_cv_{id}_asc")] {
            let sql = format!(r#"DROP INDEX IF EXISTS "{idx}""#);
            if let Err(e) = sqlx::query(&sql).execute(&self.pool).await {
                tracing::warn!("could not drop index \"{idx}\": {e}");
            }
        }
        Ok(())
    }

    async fn set_table_column_frozen(
        &self,
        table_id: &str,
        column_id: &str,
        is_frozen: bool,
    ) -> Result<CustomColumn> {
        Ok(sqlx::query_as::<_, CustomColumn>(
            "WITH updated AS (
               UPDATE table_custom_columns
               SET is_frozen = $3,
                   when_last_modified = NOW(),
                   modify_count = table_custom_columns.modify_count + 1
               WHERE table_id = $1 AND column_id = $2
               RETURNING *
             )
             SELECT c.id::text, c.title, c.description, c.expression,
               COALESCE(u.position_before, c.position_before) AS position_before,
               COALESCE(u.position_after, c.position_after) AS position_after,
               c.read_only, c.types, c.source_path,
               COALESCE(c.data_types, ARRAY[]::TEXT[]) AS data_types,
               COALESCE(c.is_group, false) AS is_group,
               COALESCE(c.parent_ids, ARRAY[]::TEXT[]) AS parent_ids,
               COALESCE(u.is_frozen, c.is_frozen) AS is_frozen
             FROM updated u
             JOIN custom_columns c ON c.id = u.column_id",
        )
        .bind(table_id)
        .bind(column_id)
        .bind(is_frozen)
        .fetch_one(&self.pool)
        .await?)
    }

    async fn set_column_source_path(
        &self,
        column_id: &str,
        path: Option<&[String]>,
    ) -> Result<CustomColumn> {
        Ok(sqlx::query_as::<_, CustomColumn>(
            "UPDATE custom_columns SET source_path = $2, when_last_modified = NOW(),
               modify_count = modify_count + 1
             WHERE id = $1
             RETURNING id::text, title, description, expression, position_before,
               position_after,
               read_only, types, source_path,
               COALESCE(data_types, ARRAY[]::TEXT[]) AS data_types,
               COALESCE(is_group, false) AS is_group,
               COALESCE(parent_ids, ARRAY[]::TEXT[]) AS parent_ids,
               COALESCE(is_frozen, false) AS is_frozen",
        )
        .bind(column_id)
        .bind(path.map(|p| p.to_vec()))
        .fetch_one(&self.pool)
        .await?)
    }

    // ── Tables registry ───────────────────────────────────────────────────────

    async fn list_tables(&self) -> Result<Vec<Table>> {
        Ok(sqlx::query_as::<_, Table>(
            "SELECT id, title, description, who_created, when_created, who_last_modified, when_last_modified, modify_count \
             FROM tables ORDER BY when_created",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn create_table(
        &self,
        id: &str,
        title: &str,
        description: Option<&str>,
        who_created: Option<&str>,
    ) -> Result<Table> {
        const SEL: &str = "SELECT id, title, description, who_created, when_created, \
                           who_last_modified, when_last_modified, modify_count \
                           FROM tables WHERE id = $1";
        let row = sqlx::query_as::<_, Table>(
            "INSERT INTO tables (id, title, description, who_created)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO NOTHING
             RETURNING id, title, description, who_created, when_created,
                       who_last_modified, when_last_modified, modify_count",
        )
        .bind(id)
        .bind(title)
        .bind(description)
        .bind(who_created)
        .fetch_optional(&self.pool)
        .await?;
        // Always ensure the physical data table exists (idempotent).
        self.ensure_user_table(id).await?;
        match row {
            Some(t) => Ok(t),
            None => Ok(sqlx::query_as::<_, Table>(SEL)
                .bind(id)
                .fetch_one(&self.pool)
                .await?),
        }
    }

    async fn patch_table(
        &self,
        id: &str,
        title: Option<&str>,
        description: Option<&str>,
        who_last_modified: Option<&str>,
    ) -> Result<Table> {
        Ok(sqlx::query_as::<_, Table>(
            "UPDATE tables
             SET title = COALESCE($2, title),
                 description = COALESCE($3, description),
                 who_last_modified = $4,
                 when_last_modified = NOW(),
                 modify_count = modify_count + 1
             WHERE id = $1
             RETURNING id, title, description, who_created, when_created, who_last_modified, when_last_modified, modify_count",
        )
        .bind(id).bind(title).bind(description).bind(who_last_modified)
        .fetch_one(&self.pool)
        .await?)
    }

    async fn delete_table(&self, id: &str) -> Result<()> {
        let tname = user_table_ident(id);
        sqlx::query("DELETE FROM tables WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        sqlx::query(&format!("DROP TABLE IF EXISTS {tname}"))
            .execute(&self.pool)
            .await
            .map_err(|e| anyhow::anyhow!("delete_table: drop {id}: {e}"))?;
        Ok(())
    }

    // ── Rows / items ──────────────────────────────────────────────────────────

    async fn patch_row_value(
        &self,
        table_id: &str,
        row_id: &str,
        col_id: &str,
        value: serde_json::Value,
    ) -> Result<()> {
        // The `tables` registry table is patched directly.
        if table_id == "tables" {
            let sql = match col_id {
                "title" => {
                    "UPDATE tables SET title = $2::text,
                              when_last_modified = NOW(), modify_count = modify_count + 1
                            WHERE id = $1"
                }
                "description" => {
                    "UPDATE tables SET description = $2::text,
                                    when_last_modified = NOW(), modify_count = modify_count + 1
                                  WHERE id = $1"
                }
                _ => return Ok(()),
            };
            sqlx::query(sql)
                .bind(row_id)
                .bind(value.as_str().unwrap_or(""))
                .execute(&self.pool)
                .await?;
            return Ok(());
        }
        self.ensure_user_table(table_id).await?;
        let tname = user_table_ident(table_id);
        sqlx::query(&format!(
            "INSERT INTO {tname} (id, custom_vals)
             VALUES ($1, jsonb_build_object($2::text, $3::jsonb))
             ON CONFLICT (id) DO UPDATE
               SET custom_vals = {tname}.custom_vals || jsonb_build_object($2::text, $3::jsonb),
                   when_last_modified = NOW(),
                   modify_count = {tname}.modify_count + 1",
        ))
        .bind(row_id)
        .bind(col_id)
        .bind(value)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn create_row(
        &self,
        table_id: &str,
        row_id: &str,
        title: Option<&str>,
        who_created: Option<&str>,
    ) -> Result<serde_json::Value> {
        self.ensure_user_table(table_id).await?;
        let tname = user_table_ident(table_id);
        let initial = title
            .map(|t| serde_json::json!({ "title": t }))
            .unwrap_or_else(|| serde_json::json!({}));
        let row_json_expr = format!(
            "jsonb_build_object(\
               'id', id, 'table_id', '{table_id}', \
               'who_created', who_created, \
               'when_created', when_created, \
               'when_last_modified', when_last_modified, \
               'modify_count', modify_count) || custom_vals"
        );
        let inserted: Option<serde_json::Value> = sqlx::query_scalar(&format!(
            "INSERT INTO {tname} (id, who_created, custom_vals)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO NOTHING
             RETURNING ({row_json_expr})",
        ))
        .bind(row_id)
        .bind(who_created)
        .bind(initial)
        .fetch_optional(&self.pool)
        .await?;
        let row = match inserted {
            Some(v) => v,
            None => {
                sqlx::query_scalar(&format!(
                    "SELECT ({row_json_expr}) FROM {tname} WHERE id = $1"
                ))
                .bind(row_id)
                .fetch_one(&self.pool)
                .await?
            }
        };
        Ok(row)
    }

    async fn list_data_rows(&self, table_id: &str, params: &RowQuery) -> Result<PagedResponse> {
        let per_page = params.per_page.clamp(1, 200) as i64;
        let offset = (params.page.max(1) - 1) as i64 * per_page;

        if table_id == "tables" {
            let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tables")
                .fetch_one(&self.pool)
                .await?;
            let rows = sqlx::query(
                "SELECT jsonb_build_object(
                   'id', id,
                   'title', title,
                   'description', description,
                   'who_created', who_created,
                   'when_created', when_created,
                   'who_last_modified', who_last_modified,
                   'when_last_modified', when_last_modified,
                   'modify_count', modify_count
                 ) FROM tables ORDER BY when_created LIMIT $1 OFFSET $2",
            )
            .bind(per_page)
            .bind(offset)
            .fetch_all(&self.pool)
            .await?
            .iter()
            .map(|r| r.try_get::<serde_json::Value, _>(0))
            .collect::<Result<_, _>>()?;
            return Ok(PagedResponse {
                data: rows,
                total,
                page: params.page,
                per_page: params.per_page,
                errors: vec![],
            });
        }

        {
            // Reads may be the first operation a secondary store sees for a table
            // during multi-store background checks. Empty tables should read as
            // empty, not fail because their physical relation is not materialized.
            self.ensure_user_table(table_id).await?;
            let tname = user_table_ident(table_id);
            let col_type_rows = sqlx::query_as::<_, (String, Vec<String>, Option<Vec<String>>)>(
                "SELECT c.id, c.types, c.source_path
                     FROM custom_columns c
                     JOIN table_custom_columns tcc ON tcc.column_id = c.id
                     WHERE tcc.table_id = $1",
            )
            .bind(table_id)
            .fetch_all(&self.pool)
            .await?;
            let mut col_types: std::collections::HashMap<String, Vec<String>> =
                std::collections::HashMap::new();
            for (id, types, source_path) in col_type_rows {
                col_types.insert(id.clone(), types.clone());
                // For nested columns using the double-underscore naming convention
                // (e.g. "stars_diff__14d"), also register the dot-notation key as a
                // fallback so sort type lookups work even when source_path is null.
                if id.contains("__") {
                    col_types.entry(id.replace("__", ".")).or_insert_with(|| types.clone());
                }
                if let Some(path) = source_path {
                    if !path.is_empty() {
                        col_types.insert(path.join("."), types);
                    }
                }
            }

            let total: i64 = {
                let mut qb = QueryBuilder::new(format!("SELECT COUNT(*) FROM {tname} WHERE "));
                qb.push("id NOT IN (SELECT row_id FROM hidden_rows)");
                push_table_row_filters(&mut qb, params, &col_types);
                qb.build_query_scalar().fetch_one(&self.pool).await?
            };

            let order = validated_sort_with_types(params.sort.as_deref(), &col_types);
            let data: Vec<serde_json::Value> = {
                let mut qb = QueryBuilder::new(format!(
                    "SELECT (jsonb_build_object(\
                       'id', id, \
                       'when_created', when_created, \
                       'who_created', who_created, \
                       'when_last_modified', when_last_modified, \
                       'who_last_modified', who_last_modified\
                     ) || custom_vals) FROM {tname} WHERE ",
                ));
                qb.push("id NOT IN (SELECT row_id FROM hidden_rows)");
                push_table_row_filters(&mut qb, params, &col_types);
                qb.push(format!(" ORDER BY {order}"));
                qb.push(" LIMIT ").push_bind(per_page);
                qb.push(" OFFSET ").push_bind(offset);
                qb.build()
                    .fetch_all(&self.pool)
                    .await?
                    .iter()
                    .map(|r| r.try_get::<serde_json::Value, _>(0))
                    .collect::<Result<_, _>>()?
            };
            return Ok(PagedResponse {
                data,
                total,
                page: params.page,
                per_page: params.per_page,
                errors: vec![],
            });
        }
    }

    // ── GitHub repos batch upsert ─────────────────────────────────────────────
    async fn upsert_github_repos_batch(&self, repos: &[serde_json::Value]) -> Result<usize> {
        if repos.is_empty() {
            return Ok(0);
        }
        let json_array = serde_json::Value::Array(repos.to_vec());
        // Each element has github_id + all other GitHub fields.
        // Store id = github_id::text; all fields go into custom_values (minus the id key).
        // DISTINCT ON deduplicates within the batch itself — Postgres raises an error if the
        // same primary key appears twice in a single INSERT, so we must deduplicate first.
        let count: i64 = sqlx::query_scalar(
            "WITH deduped AS (
               SELECT DISTINCT ON (github_id) github_id, custom_values
               FROM (
                 SELECT
                   (r->>'github_id') AS github_id,
                   (r - 'id')        AS custom_values
                 FROM jsonb_array_elements($1::jsonb) AS r
                 WHERE r->>'github_id' IS NOT NULL
               ) sub
               ORDER BY github_id
             ),
             upserted AS (
               INSERT INTO github_repos (id, custom_values)
               SELECT github_id, custom_values FROM deduped
               ON CONFLICT (id) DO UPDATE SET
                 custom_values      = EXCLUDED.custom_values,
                 when_last_modified = NOW()
               RETURNING 1
             ) SELECT COUNT(*) FROM upserted",
        )
        .bind(json_array)
        .fetch_one(&self.pool)
        .await?;
        Ok(count as usize)
    }

    async fn upsert_rows_batch(&self, table_id: &str, rows: &[serde_json::Value]) -> Result<usize> {
        if rows.is_empty() {
            return Ok(0);
        }
        self.ensure_user_table(table_id).await?;
        let tname = user_table_ident(table_id);
        let json_array = serde_json::Value::Array(rows.to_vec());
        let count: i64 = sqlx::query_scalar(&format!(
            "WITH incoming AS (
               SELECT DISTINCT ON (row_id)
                 COALESCE(r->>'id', r->>'github_id') AS row_id,
                 r AS custom_vals
               FROM jsonb_array_elements($1::jsonb) AS r
               WHERE COALESCE(r->>'id', r->>'github_id') IS NOT NULL
               ORDER BY row_id
             ),
             upserted AS (
               INSERT INTO {tname} (id, custom_vals, when_created, when_last_modified)
               SELECT row_id, custom_vals, NOW(), NOW() FROM incoming
               ON CONFLICT (id) DO UPDATE SET
                 custom_vals        = {tname}.custom_vals || EXCLUDED.custom_vals,
                 when_last_modified = NOW(),
                 modify_count       = {tname}.modify_count + 1
               RETURNING 1
             ) SELECT COUNT(*) FROM upserted",
        ))
        .bind(json_array)
        .fetch_one(&self.pool)
        .await?;

        // Auto-create custom columns for fields found anywhere in the batch.
        // The first row may have an empty nested object while later rows carry
        // concrete sub-fields, so sampling only one row loses data paths.
        for sample in rows {
            self.auto_create_columns_from_row(table_id, sample)
                .await
                .unwrap_or_else(|e| {
                    tracing::warn!(table_id, "auto_create_columns_from_row failed: {e}");
                });
        }

        Ok(count as usize)
    }

    // ── Ops log ───────────────────────────────────────────────────────────────
    async fn begin_ops_log(
        &self,
        id: &str,
        op: &str,
        payload: serde_json::Value,
        tx_id: Option<&str>,
    ) {
        crate::ops_log::begin(&self.pool, id, op, payload, tx_id).await;
    }

    async fn mark_op_applied(&self, id: &str) {
        crate::ops_log::mark_applied(&self.pool, id).await;
    }

    async fn pending_ops(&self) -> Result<Vec<crate::store::PendingOp>> {
        crate::ops_log::pending(&self.pool).await
    }
}

// ── Query helpers (PG-specific) ───────────────────────────────────────────────

fn col_has_type(
    col_types: &std::collections::HashMap<String, Vec<String>>,
    name: &str,
    target: &str,
) -> bool {
    col_types
        .get(name)
        .map_or(false, |types| types.iter().any(|t| t == target))
}

/// Shared AND-clause conditions used by both push_filters and push_table_row_filters.
fn push_filter_conditions<'q>(
    qb: &mut QueryBuilder<'q, Postgres>,
    p: &'q RowQuery,
    col_types: &std::collections::HashMap<String, Vec<String>>,
) {
    for (path, min, max) in &p.range_filters {
        if let Some(expr) = path_to_jsonb_expr(path) {
            if let Some(v) = min {
                qb.push(format!(" AND ({expr})::numeric >= ")).push_bind(*v);
            }
            if let Some(v) = max {
                qb.push(format!(" AND ({expr})::numeric <= ")).push_bind(*v);
            }
        }
    }
    for (path, after, before) in &p.date_filters {
        if let Some(expr) = path_to_jsonb_expr(path) {
            if let Some(v) = after {
                qb.push(format!(" AND ({expr})::timestamptz >= "))
                    .push_bind(*v);
            }
            if let Some(v) = before {
                qb.push(format!(" AND ({expr})::timestamptz <= "))
                    .push_bind(*v);
            }
        }
    }
    for (path, vals) in &p.value_filters {
        if vals.is_empty() {
            continue;
        }
        let col_name = path.split('.').next().unwrap_or(path.as_str());
        if col_has_type(col_types, col_name, "array") {
            if let Some(obj_expr) = path_to_jsonb_value_expr(path) {
                qb.push(format!(" AND {obj_expr} ?| "))
                    .push_bind(vals.clone());
            }
        } else if let Some(expr) = path_to_jsonb_expr(path) {
            qb.push(format!(" AND ({expr}) = ANY("))
                .push_bind(vals.clone())
                .push(")");
        }
    }
    for (path, patterns) in &p.like_filters {
        let wrapped: Vec<String> = patterns
            .iter()
            .filter(|p| !p.is_empty())
            .map(|p| format!("%{p}%"))
            .collect();
        if wrapped.is_empty() {
            continue;
        }
        let col_name = path.split('.').next().unwrap_or(path.as_str());
        if col_has_type(col_types, col_name, "array") {
            if let Some(obj_expr) = path_to_jsonb_value_expr(path) {
                qb.push(format!(" AND EXISTS (SELECT 1 FROM jsonb_array_elements_text({obj_expr}) _t WHERE _t ILIKE ANY("))
                  .push_bind(wrapped).push("))");
            }
        } else if let Some(expr) = path_to_jsonb_expr(path) {
            qb.push(format!(" AND ({expr}) ILIKE ANY("))
                .push_bind(wrapped)
                .push(")");
        }
    }
    if let Some(ref q) = p.q {
        let pat = format!("%{q}%");
        qb.push(" AND (custom_vals->>'name' ILIKE ")
            .push_bind(pat.clone())
            .push(" OR custom_vals->>'description' ILIKE ")
            .push_bind(pat)
            .push(")");
    }
}

/// Build the JSONB expression for a column index, using source_path when available.
/// User-created columns default to their stable column id, not the renameable name/title.
fn build_index_expr(id: &str, input: &crate::custom_column::CustomColumnInput) -> String {
    let path = input.source_path.as_deref().unwrap_or(&[]);
    if path.len() >= 2 {
        let n = path.len();
        let mut expr = String::from("custom_vals");
        for key in &path[..n - 1] {
            expr.push_str(&format!("->'{}'", key.replace('\'', "''")));
        }
        expr.push_str(&format!("->>'{}'", path[n - 1].replace('\'', "''")));
        expr
    } else if path.len() == 1 {
        format!("custom_vals->>'{}'", path[0].replace('\'', "''"))
    } else {
        format!("custom_vals->>'{}'", id.replace('\'', "''"))
    }
}

/// Additional AND-conditions for `table_rows` (WHERE table_id=? AND hidden_rows already applied).
fn push_table_row_filters<'q>(
    qb: &mut QueryBuilder<'q, Postgres>,
    p: &'q RowQuery,
    col_types: &std::collections::HashMap<String, Vec<String>>,
) {
    push_filter_conditions(qb, p, col_types);
}

/// Validate and split a dot-path into segments.
/// Each segment must be non-empty and contain only alphanumeric/underscore chars
/// (SQL-injection guard). Returns None if any segment is invalid.
fn validated_path_parts(path: &str) -> Option<Vec<&str>> {
    let parts: Vec<&str> = path.split('.').collect();
    if parts
        .iter()
        .any(|p| p.is_empty() || !p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
    {
        return None;
    }
    Some(parts)
}

/// Returns a JSONB expression (all `->` navigation, last segment also `->`)
/// for use with operators like `?|` that need a JSONB value, not text.
fn path_to_jsonb_value_expr(path: &str) -> Option<String> {
    let parts = validated_path_parts(path)?;
    let mut expr = String::from("custom_vals");
    for &seg in &parts {
        expr.push_str(&format!("->'{seg}'"));
    }
    Some(expr)
}

/// Build a PostgreSQL text expression for navigating `custom_vals` by a dot-path.
/// Each segment must be alphanumeric/underscore only (SQL-injection guard).
/// "stars"           → custom_vals->>'stars'
/// "stars_diff.6h"   → custom_vals->'stars_diff'->>'6h'
/// "a.b.c"           → custom_vals->'a'->'b'->>'c'
fn path_to_jsonb_expr(path: &str) -> Option<String> {
    let parts = validated_path_parts(path)?;
    let n = parts.len();
    let mut expr = String::from("custom_vals");
    for &seg in &parts[..n - 1] {
        expr.push_str(&format!("->'{seg}'"));
    }
    expr.push_str(&format!("->>'{}'", parts[n - 1]));
    Some(expr)
}

/// Build a sort expression from a dot-path and an optional type hint.
/// col_type values match custom_columns.types elements: "integer", "text", "timestamptz", …
fn col_to_sort_expr(col: &str, col_type: Option<&str>) -> Option<String> {
    if col
        .chars()
        .any(|c| !c.is_ascii_alphanumeric() && c != '_' && c != '.')
    {
        return None;
    }
    let base = match col {
        "id" | "when_created" | "who_created" | "when_last_modified" | "who_last_modified" => {
            return Some(col.to_string());
        }
        _ => path_to_jsonb_expr(col)?,
    };
    let cast = match col_type {
        Some("integer") | Some("bigint") | Some("numeric") => "::numeric",
        Some("timestamptz") => "::timestamptz",
        Some("boolean") => "::boolean",
        _ => "",
    };
    Some(if cast.is_empty() {
        base
    } else {
        format!("({base}){cast}")
    })
}

pub(super) fn validated_sort(sort: Option<&str>) -> String {
    validated_sort_with_types(sort, &std::collections::HashMap::new())
}

pub(super) fn validated_sort_with_types(
    sort: Option<&str>,
    col_types: &std::collections::HashMap<String, Vec<String>>,
) -> String {
    // Sort param format: "col:dir[:type]" where type is a custom_columns.types element.
    // Multiple sorts are comma-separated.
    let parts: Vec<String> = sort
        .unwrap_or("")
        .split(',')
        .filter_map(|s| {
            let s = s.trim();
            if s.is_empty() {
                return None;
            }
            let mut it = s.splitn(3, ':');
            let col = it.next()?;
            let dir = it.next().unwrap_or("desc");
            let col_type = it.next().or_else(|| {
                col_types
                    .get(col)
                    .and_then(|types| types.first().map(String::as_str))
            });
            let expr = col_to_sort_expr(col, col_type)?;
            let dir_sql = if dir.eq_ignore_ascii_case("asc") {
                "ASC"
            } else {
                "DESC"
            };
            Some(format!("{expr} {dir_sql} NULLS LAST"))
        })
        .collect();

    if parts.is_empty() {
        "when_created DESC NULLS LAST".to_string()
    } else {
        parts.join(", ")
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── schema migrations ────────────────────────────────────────────────────

    #[test]
    fn schema_statement_id_is_human_readable_sql_name() {
        assert_eq!(
            schema_statement_id("CREATE TABLE IF NOT EXISTS custom_columns (id TEXT PRIMARY KEY);"),
            "create_table_if_not_exists_custom_columns_id_text_primary_key"
        );
    }

    #[test]
    fn schema_statement_hash_is_stable_across_line_endings() {
        assert_eq!(
            schema_statement_hash("ALTER TABLE custom_columns\r\nADD COLUMN title TEXT;"),
            schema_statement_hash("ALTER TABLE custom_columns\nADD COLUMN title TEXT;")
        );
    }

    // ── validated_path_parts ──────────────────────────────────────────────────

    #[test]
    fn valid_single_segment() {
        assert_eq!(validated_path_parts("stars"), Some(vec!["stars"]));
    }

    #[test]
    fn valid_two_segments() {
        assert_eq!(
            validated_path_parts("stars_diff.6h"),
            Some(vec!["stars_diff", "6h"])
        );
    }

    #[test]
    fn valid_three_segments() {
        assert_eq!(validated_path_parts("a.b.c"), Some(vec!["a", "b", "c"]));
    }

    #[test]
    fn rejects_empty_path() {
        assert!(validated_path_parts("").is_none());
    }

    #[test]
    fn rejects_empty_segment() {
        assert!(validated_path_parts("a..b").is_none());
    }

    #[test]
    fn rejects_special_chars() {
        assert!(validated_path_parts("'; DROP TABLE --").is_none());
        assert!(validated_path_parts("a.b-c").is_none());
        assert!(validated_path_parts("a.b c").is_none());
    }

    // ── path_to_jsonb_expr ────────────────────────────────────────────────────

    #[test]
    fn jsonb_expr_single() {
        assert_eq!(
            path_to_jsonb_expr("stars"),
            Some("custom_vals->>'stars'".into())
        );
    }

    #[test]
    fn jsonb_expr_two_segments() {
        assert_eq!(
            path_to_jsonb_expr("stars_diff.6h"),
            Some("custom_vals->'stars_diff'->>'6h'".into())
        );
    }

    #[test]
    fn jsonb_expr_three_segments() {
        assert_eq!(
            path_to_jsonb_expr("a.b.c"),
            Some("custom_vals->'a'->'b'->>'c'".into())
        );
    }

    #[test]
    fn jsonb_expr_rejects_injection() {
        assert!(path_to_jsonb_expr("'; DROP TABLE --").is_none());
        assert!(path_to_jsonb_expr("").is_none());
    }

    #[test]
    fn index_expr_defaults_to_stable_column_id() {
        let input = crate::custom_column::CustomColumnInput {
            title: Some("User-facing title".into()),
            ..Default::default()
        };
        assert_eq!(
            build_index_expr("col_123", &input),
            "custom_vals->>'col_123'"
        );
    }

    #[test]
    fn index_expr_uses_source_path_when_present() {
        let input = crate::custom_column::CustomColumnInput {
            title: Some("Stars diff 24h".into()),
            source_path: Some(vec!["stars_diff".into(), "24h".into()]),
            ..Default::default()
        };
        assert_eq!(
            build_index_expr("gh_stars_diff_24h", &input),
            "custom_vals->'stars_diff'->>'24h'"
        );
    }

    // ── path_to_jsonb_value_expr ──────────────────────────────────────────────

    #[test]
    fn jsonb_value_expr_single() {
        assert_eq!(
            path_to_jsonb_value_expr("stars"),
            Some("custom_vals->'stars'".into())
        );
    }

    #[test]
    fn jsonb_value_expr_two_segments() {
        assert_eq!(
            path_to_jsonb_value_expr("topics.name"),
            Some("custom_vals->'topics'->'name'".into())
        );
    }

    #[test]
    fn jsonb_value_expr_rejects_injection() {
        assert!(path_to_jsonb_value_expr("bad-key").is_none());
    }

    // ── col_to_sort_expr ──────────────────────────────────────────────────────

    #[test]
    fn sort_expr_builtin_id() {
        assert_eq!(col_to_sort_expr("id", None), Some("id".into()));
    }

    #[test]
    fn sort_expr_builtin_when_created() {
        assert_eq!(
            col_to_sort_expr("when_created", None),
            Some("when_created".into())
        );
    }

    #[test]
    fn sort_expr_custom_no_type() {
        assert_eq!(
            col_to_sort_expr("name", None),
            Some("custom_vals->>'name'".into())
        );
    }

    #[test]
    fn sort_expr_custom_integer() {
        assert_eq!(
            col_to_sort_expr("stars", Some("integer")),
            Some("(custom_vals->>'stars')::numeric".into())
        );
    }

    #[test]
    fn sort_expr_custom_timestamptz() {
        assert_eq!(
            col_to_sort_expr("pushed_at", Some("timestamptz")),
            Some("(custom_vals->>'pushed_at')::timestamptz".into())
        );
    }

    #[test]
    fn sort_expr_rejects_injection() {
        assert!(col_to_sort_expr("'; DROP TABLE", None).is_none());
    }

    // ── validated_sort ────────────────────────────────────────────────────────

    #[test]
    fn sort_defaults_to_when_created_desc() {
        assert_eq!(validated_sort(None), "when_created DESC NULLS LAST");
        assert_eq!(validated_sort(Some("")), "when_created DESC NULLS LAST");
    }

    #[test]
    fn sort_single_column_desc() {
        assert_eq!(
            validated_sort(Some("stars:desc:integer")),
            "(custom_vals->>'stars')::numeric DESC NULLS LAST"
        );
    }

    #[test]
    fn sort_uses_known_type_for_dot_path_without_explicit_type() {
        let mut col_types = std::collections::HashMap::new();
        col_types.insert("metrics.views".to_string(), vec!["numeric".to_string()]);
        assert_eq!(
            validated_sort_with_types(Some("metrics.views:desc"), &col_types),
            "(custom_vals->'metrics'->>'views')::numeric DESC NULLS LAST"
        );
    }

    #[test]
    fn sort_single_column_asc() {
        assert_eq!(
            validated_sort(Some("name:asc")),
            "custom_vals->>'name' ASC NULLS LAST"
        );
    }

    #[test]
    fn sort_builtin_column() {
        assert_eq!(
            validated_sort(Some("when_created:asc")),
            "when_created ASC NULLS LAST"
        );
    }

    #[test]
    fn sort_multi_column() {
        let result = validated_sort(Some("stars:desc:integer,name:asc"));
        assert_eq!(
            result,
            "(custom_vals->>'stars')::numeric DESC NULLS LAST, custom_vals->>'name' ASC NULLS LAST"
        );
    }

    #[test]
    fn sort_skips_invalid_columns() {
        // A column name with SQL-injection chars is silently dropped; valid ones survive.
        let result = validated_sort(Some("'; DROP TABLE:asc,name:asc"));
        assert_eq!(result, "custom_vals->>'name' ASC NULLS LAST");
    }

    #[test]
    fn sort_all_invalid_falls_back_to_default() {
        assert_eq!(
            validated_sort(Some("'; DROP TABLE:asc")),
            "when_created DESC NULLS LAST"
        );
    }
}
