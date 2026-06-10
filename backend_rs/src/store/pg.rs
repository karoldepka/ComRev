use std::{
    collections::{HashMap, HashSet},
    time::Duration,
};

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
    /// Nested column IDs whose source_path/parent metadata was written from
    /// observed row data in this process.
    known_nested_defs:
        std::sync::RwLock<std::collections::HashMap<String, std::collections::HashSet<String>>>,
    /// Tables whose existing row JSON has already been scanned for missing
    /// nested column definitions in this process.
    nested_row_repairs: std::sync::RwLock<HashSet<String>>,
    /// Table IDs for which ensure_user_table has already run in this process.
    /// Avoids re-running ~10 DDL statements (all IF NOT EXISTS) on every write.
    ensured_tables: std::sync::RwLock<HashSet<String>>,
    /// "table_id\x00field_id" keys for which ensure_many_to_many_field has run.
    ensured_m2m_fields: std::sync::RwLock<HashSet<String>>,
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

fn non_blank_text(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

/// Returns the double-quoted PG identifier for a user table, e.g. `"t_gh_repos"`.
/// The table_id is already validated to `[a-zA-Z0-9_-]+` at the API boundary,
/// but we strip any double-quotes defensively.
fn user_table_ident(table_id: &str) -> String {
    format!("\"t_{}\"", table_id.replace('"', ""))
}

#[derive(Default)]
struct AutoCreateColumnsStats {
    rows_scanned: usize,
    specs_found: usize,
    missing_columns: usize,
    created_columns: usize,
    discovery_ms: u128,
    cache_filter_ms: u128,
    upsert_ms: u128,
    total_ms: u128,
}

impl AutoCreateColumnsStats {
    fn add(&mut self, other: AutoCreateColumnsStats) {
        self.rows_scanned += other.rows_scanned;
        self.specs_found += other.specs_found;
        self.missing_columns += other.missing_columns;
        self.created_columns += other.created_columns;
        self.discovery_ms += other.discovery_ms;
        self.cache_filter_ms += other.cache_filter_ms;
        self.upsert_ms += other.upsert_ms;
        self.total_ms += other.total_ms;
    }
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
        tracing::info!(
            db_id,
            url = short,
            max_conn,
            acquire_timeout_secs = acquire_secs,
            "PgStore: connected"
        );
        Ok(Self {
            pool,
            db_id: db_id.to_string(),
            known_cols: Default::default(),
            known_nested_defs: Default::default(),
            nested_row_repairs: Default::default(),
            ensured_tables: Default::default(),
            ensured_m2m_fields: Default::default(),
        })
    }

    /// Connect with a dedicated PostgreSQL schema.
    ///
    /// Every connection in the pool runs `CREATE SCHEMA IF NOT EXISTS` and
    /// `SET search_path` on first use, so all DDL and DML goes to `schema`
    /// instead of `public`. Useful for test isolation: each test gets its own
    /// schema and can run in parallel without touching shared tables.
    #[cfg(test)]
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
                        .execute(&mut *conn)
                        .await?;
                    sqlx::query(&format!("SET search_path TO \"{s}\""))
                        .execute(&mut *conn)
                        .await?;
                    Ok(())
                })
            })
            .connect(url)
            .await
            .map_err(|e| {
                anyhow::anyhow!(
                    "PgStore({db_id}, schema={schema}): failed to connect to {short}: {e}"
                )
            })?;
        tracing::info!(db_id, url = short, schema, "PgStore: connected with schema");
        Ok(Self {
            pool,
            db_id: db_id.to_string(),
            known_cols: Default::default(),
            known_nested_defs: Default::default(),
            nested_row_repairs: Default::default(),
            ensured_tables: Default::default(),
            ensured_m2m_fields: Default::default(),
        })
    }

    /// Create a physical PG table for a user table if it doesn't yet exist.
    /// Also adds a GIN index on `custom_vals` for fast JSONB lookups.
    pub async fn ensure_user_table(&self, table_id: &str) -> Result<()> {
        if self.ensured_tables.read().unwrap().contains(table_id) {
            return Ok(());
        }
        let tname = user_table_ident(table_id);
        sqlx::query(&format!(
            r#"CREATE TABLE IF NOT EXISTS {tname} (
                id                TEXT        PRIMARY KEY,
                when_created      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                when_last_modified TIMESTAMPTZ,
                who_created       TEXT,
                who_last_modified TEXT,
                modify_count      INTEGER     NOT NULL DEFAULT 0,
                full_name         TEXT        NOT NULL DEFAULT '',
                custom_vals       JSONB       NOT NULL DEFAULT '{{}}',
                classes           JSONB       NOT NULL DEFAULT '[]',
                parent_child      JSONB       NOT NULL DEFAULT '[]',
                when_deleted      TIMESTAMPTZ
            )"#
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table({table_id}): {e}"))?;

        sqlx::query(&format!(
            "ALTER TABLE {tname} ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT ''"
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table full_name column({table_id}): {e}"))?;

        sqlx::query(&format!(
            "UPDATE {tname}
             SET full_name = COALESCE(
               NULLIF(full_name, ''),
               NULLIF(custom_vals->>'full_name', ''),
               NULLIF(custom_vals->>'title', ''),
               NULLIF(custom_vals->>'name', ''),
               id
             )
             WHERE full_name = ''"
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table full_name backfill({table_id}): {e}"))?;

        sqlx::query(&format!(
            "UPDATE {tname}
             SET custom_vals = custom_vals - 'full_name'
             WHERE custom_vals ? 'full_name'"
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table full_name cleanup({table_id}): {e}"))?;

        // Ensure classes column exists for tables created before this migration.
        sqlx::query(&format!(
            "ALTER TABLE {tname} ADD COLUMN IF NOT EXISTS classes JSONB NOT NULL DEFAULT '[]'::jsonb"
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table classes column({table_id}): {e}"))?;

        sqlx::query(&format!(
            "ALTER TABLE {tname} ADD COLUMN IF NOT EXISTS parent_child JSONB NOT NULL DEFAULT '[]'::jsonb"
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table parent_child column({table_id}): {e}"))?;

        sqlx::query(&format!(
            "ALTER TABLE {tname} ADD COLUMN IF NOT EXISTS when_deleted TIMESTAMPTZ"
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table when_deleted column({table_id}): {e}"))?;

        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS \"idx_{}_when_deleted\" \
             ON {tname} (when_deleted) WHERE when_deleted IS NOT NULL",
            table_id.replace('"', "")
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table when_deleted index({table_id}): {e}"))?;

        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS \"idx_{table_id}_custom_vals\" \
             ON {tname} USING GIN (custom_vals)"
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table index({table_id}): {e}"))?;

        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS \"idx_{}_full_name_fts\"
             ON {tname} USING GIN (to_tsvector('simple', COALESCE(full_name, '')))",
            table_id.replace('"', "")
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table full_name fts index({table_id}): {e}"))?;

        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS \"idx_{}_full_name_lower\" ON {tname} (LOWER(full_name))",
            table_id.replace('"', "")
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table full_name lower index({table_id}): {e}"))?;

        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS \"idx_{}_classes\" ON {tname} USING GIN (classes)",
            table_id.replace('"', "")
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table classes index({table_id}): {e}"))?;

        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS \"idx_{}_parent_child\" ON {tname} USING GIN (parent_child)",
            table_id.replace('"', "")
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_user_table parent_child index({table_id}): {e}"))?;

        self.ensured_tables.write().unwrap().insert(table_id.to_string());
        Ok(())
    }

    async fn ensure_many_to_many_field(&self, table_id: &str, field_id: &str) -> Result<()> {
        if field_id == "superclasses" {
            return Ok(());
        }
        let cache_key = format!("{table_id}\x00{field_id}");
        if self.ensured_m2m_fields.read().unwrap().contains(&cache_key) {
            return Ok(());
        }
        validate_field_id(field_id)?;
        self.ensure_user_table(table_id).await?;
        let tname = user_table_ident(table_id);
        sqlx::query(&format!(
            "ALTER TABLE {tname} ADD COLUMN IF NOT EXISTS {field_id} JSONB NOT NULL DEFAULT '[]'::jsonb"
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("ensure_many_to_many_field column({table_id}.{field_id}): {e}"))?;
        sqlx::query(&format!(
            "CREATE INDEX IF NOT EXISTS \"idx_{}_{}\" ON {tname} USING GIN ({field_id})",
            table_id.replace('"', ""),
            field_id.replace('"', ""),
        ))
        .execute(&self.pool)
        .await
        .map_err(|e| {
            anyhow::anyhow!("ensure_many_to_many_field index({table_id}.{field_id}): {e}")
        })?;
        self.ensured_m2m_fields.write().unwrap().insert(cache_key);
        Ok(())
    }

    async fn repair_nested_columns_from_existing_rows(&self, table_id: &str) -> Result<()> {
        {
            let checked = self.nested_row_repairs.read().unwrap();
            if checked.contains(table_id) {
                return Ok(());
            }
        }

        self.ensure_user_table(table_id).await?;
        let table_name = user_table_ident(table_id);
        let nested_fields: Vec<(String, String, String)> = sqlx::query_as(&format!(
            r#"
            SELECT DISTINCT parent.key, child.key, jsonb_typeof(child.value)
            FROM {table_name}
            CROSS JOIN LATERAL jsonb_each(custom_vals) AS parent(key, value)
            CROSS JOIN LATERAL jsonb_each(parent.value) AS child(key, value)
            WHERE jsonb_typeof(parent.value) = 'object'
              AND child.value <> 'null'::jsonb
            ORDER BY parent.key, child.key
            "#
        ))
        .fetch_all(&self.pool)
        .await
        .map_err(|e| {
            anyhow::anyhow!("repair_nested_columns_from_existing_rows({table_id}): {e}")
        })?;

        let mut repaired = 0usize;
        let base = crate::custom_column::CustomColumnInput::default();
        for (parent, child, value_type) in nested_fields {
            let parent_input = crate::custom_column::CustomColumnInput {
                is_group: true,
                data_types: Some(vec!["text".into()]),
                ..base.clone()
            };
            self.upsert_custom_column(table_id, &parent, &parent_input)
                .await?;

            let types = match value_type.as_str() {
                "number" => vec!["numeric".into()],
                "boolean" => vec!["boolean".into()],
                "array" => vec!["array".into()],
                _ => vec!["text".into()],
            };
            let data_types = if types.iter().any(|t| t == "numeric") {
                vec!["numeric".into()]
            } else if types.iter().any(|t| t == "boolean") {
                vec!["boolean".into()]
            } else {
                vec!["text".into()]
            };
            let child_id = format!("{parent}__{child}");
            let child_input = crate::custom_column::CustomColumnInput {
                title: Some(child.clone()),
                parent_ids: vec![parent.clone()],
                source_path: Some(vec![parent.clone(), child]),
                types: Some(types),
                data_types: Some(data_types),
                ..base.clone()
            };
            self.upsert_custom_column(table_id, &child_id, &child_input)
                .await?;
            repaired += 1;
        }

        self.nested_row_repairs
            .write()
            .unwrap()
            .insert(table_id.to_string());
        tracing::info!(
            table_id,
            repaired,
            "repaired nested column definitions from existing rows"
        );
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
    ) -> Result<AutoCreateColumnsStats> {
        let total_started = std::time::Instant::now();
        let discovery_started = std::time::Instant::now();
        let mut stats = AutoCreateColumnsStats::default();
        const SKIP: &[&str] = &[
            "id",
            "github_id",
            "table_id",
            "full_name",
            "who_created",
            "when_created",
            "when_last_modified",
            "modify_count",
            "classes",
        ];

        let Some(obj) = sample.as_object() else {
            stats.total_ms = total_started.elapsed().as_millis();
            return Ok(stats);
        };
        stats.rows_scanned = 1;

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
        stats.specs_found = specs.len();
        stats.discovery_ms = discovery_started.elapsed().as_millis();

        for pair in root_indices.windows(2) {
            let next_id = specs[pair[1]].id.clone();
            specs[pair[0]].position_before = Some(next_id);
        }

        // Only create columns not already in the per-process cache.
        let cache_filter_started = std::time::Instant::now();
        let missing_ids: Vec<usize> = {
            let cache = self.known_cols.read().unwrap();
            let known = cache.get(table_id);
            let nested_cache = self.known_nested_defs.read().unwrap();
            let nested_known = nested_cache.get(table_id);
            specs
                .iter()
                .enumerate()
                .filter(|(_, s)| {
                    let exists = known.map_or(false, |k| k.contains(&s.id));
                    let nested_def_verified = nested_known.map_or(false, |k| k.contains(&s.id));
                    !exists || (s.source_path.is_some() && !nested_def_verified)
                })
                .map(|(i, _)| i)
                .collect()
        };
        stats.missing_columns = missing_ids.len();
        stats.cache_filter_ms = cache_filter_started.elapsed().as_millis();
        if missing_ids.is_empty() {
            stats.total_ms = total_started.elapsed().as_millis();
            return Ok(stats);
        }

        let base = crate::custom_column::CustomColumnInput::default();
        let mut succeeded_ids: Vec<String> = Vec::new();
        let upsert_started = std::time::Instant::now();
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
            match self.upsert_custom_column(table_id, &spec.id, &inp).await {
                Ok(_) => succeeded_ids.push(spec.id.clone()),
                Err(e) => {
                    tracing::warn!(table_id, col_id = %spec.id, "auto-create column failed: {e}")
                }
            }
        }
        stats.upsert_ms = upsert_started.elapsed().as_millis();
        stats.created_columns = succeeded_ids.len();

        if !succeeded_ids.is_empty() {
            let mut cache = self.known_cols.write().unwrap();
            let entry = cache.entry(table_id.to_string()).or_default();
            let mut nested_cache = self.known_nested_defs.write().unwrap();
            let nested_entry = nested_cache.entry(table_id.to_string()).or_default();
            for id in succeeded_ids {
                entry.insert(id.clone());
                if specs
                    .iter()
                    .any(|spec| spec.id == id && spec.source_path.is_some())
                {
                    nested_entry.insert(id);
                }
            }
        }
        stats.total_ms = total_started.elapsed().as_millis();
        Ok(stats)
    }
}

#[async_trait]
impl DataStore for PgStore {
    async fn ensure_schema(&self) -> Result<()> {
        let stmts = super::pg_schema::POSTGRES_SCHEMA;
        let db_id = &self.db_id;

        let bootstrap_stmt = stmts
            .first()
            .expect("POSTGRES_SCHEMA must contain at least one statement");
        sqlx::query(bootstrap_stmt)
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
        tracing::warn!(
            db_id,
            "NUKE__DATA: truncating all user data (schema preserved)"
        );

        // Truncate all known application tables in one shot.
        // CASCADE handles FK-ordered dependencies automatically.
        sqlx::query(
            "TRUNCATE TABLE remarks, remark_targets, custom_columns, cell_flags,
                          hidden_rows, hidden_columns, operations_log, tables,
                          table_custom_columns, row_classes, many_to_many_assignments,
                          schema_migrations CASCADE",
        )
        .execute(&self.pool)
        .await
        .map_err(|e| anyhow::anyhow!("NUKE__DATA({db_id}): TRUNCATE failed: {e}"))?;

        // Restore the builtin classes table entry after truncation.
        sqlx::query(
            "INSERT INTO tables (id, title, description)
             VALUES ('classes', 'Classes', 'Row class definitions and class metadata.')
             ON CONFLICT (id) DO NOTHING",
        )
        .execute(&self.pool)
        .await
        .map_err(|e| {
            anyhow::anyhow!("NUKE__DATA({db_id}): restore builtin classes table failed: {e}")
        })?;

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

        // Clear the in-memory column cache so auto_create_columns_from_row
        // recreates all columns (including group columns) on the next upload.
        self.known_cols.write().unwrap().clear();
        self.known_nested_defs.write().unwrap().clear();
        self.nested_row_repairs.write().unwrap().clear();
        self.ensured_tables.write().unwrap().clear();
        self.ensured_m2m_fields.write().unwrap().clear();

        tracing::warn!(
            db_id,
            user_tables = user_tables.len(),
            "NUKE__DATA: complete"
        );
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
        self.known_cols.write().unwrap().clear();
        self.known_nested_defs.write().unwrap().clear();
        self.nested_row_repairs.write().unwrap().clear();
        self.ensured_tables.write().unwrap().clear();
        self.ensured_m2m_fields.write().unwrap().clear();
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

    // ── Row classes ───────────────────────────────────────────────────────────

    async fn list_row_classes(&self, table_id: &str) -> Result<Vec<crate::row_class::RowClass>> {
        if table_id == "classes" {
            let t0 = std::time::Instant::now();
            self.ensure_user_table("classes").await?;
            let result = sqlx::query_as::<_, crate::row_class::RowClass>(
                r#"SELECT id, 'classes'::text AS table_id,
                          COALESCE(full_name, id) AS name,
                          custom_vals->>'color' AS color
                   FROM "t_classes"
                   WHERE when_deleted IS NULL
                   ORDER BY full_name NULLS LAST"#,
            )
            .fetch_all(&self.pool)
            .await?;
            tracing::debug!(
                elapsed_ms = t0.elapsed().as_millis(),
                rows = result.len(),
                "list_row_classes from t_classes"
            );
            return Ok(result);
        }
        Ok(sqlx::query_as::<_, crate::row_class::RowClass>(
            "SELECT id, table_id, name, color FROM row_classes WHERE table_id = $1 ORDER BY name",
        )
        .bind(table_id)
        .fetch_all(&self.pool)
        .await?)
    }

    async fn create_row_class(
        &self,
        table_id: &str,
        id: &str,
        name: &str,
        color: Option<&str>,
    ) -> Result<crate::row_class::RowClass> {
        let name = name.trim();
        anyhow::ensure!(!name.is_empty(), "row class name must not be blank");
        if table_id == "classes" {
            self.ensure_user_table("classes").await?;
            let color_json: serde_json::Value = match color.filter(|c| !c.is_empty()) {
                Some(c) => serde_json::json!({ "color": c }),
                None => serde_json::json!({}),
            };
            sqlx::query(
                r#"INSERT INTO "t_classes" (id, full_name, custom_vals)
                   VALUES ($1, $2, $3)
                   ON CONFLICT (id) DO UPDATE
                   SET full_name = EXCLUDED.full_name,
                       custom_vals = COALESCE("t_classes".custom_vals, '{}') || EXCLUDED.custom_vals,
                       when_last_modified = NOW()
                   WHERE "t_classes".when_deleted IS NULL"#,
            )
            .bind(id)
            .bind(name)
            .bind(&color_json)
            .execute(&self.pool)
            .await?;
            return Ok(crate::row_class::RowClass {
                id: id.to_string(),
                table_id: "classes".to_string(),
                name: name.to_string(),
                color: color.filter(|c| !c.is_empty()).map(|c| c.to_string()),
            });
        }
        Ok(sqlx::query_as::<_, crate::row_class::RowClass>(
            "INSERT INTO row_classes (id, table_id, name, color)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name,
                 color = EXCLUDED.color,
                 who_last_modified = EXCLUDED.who_created,
                 when_last_modified = NOW(),
                 modify_count = row_classes.modify_count + 1
             WHERE row_classes.table_id = EXCLUDED.table_id
             RETURNING id, table_id, name, color",
        )
        .bind(id)
        .bind(table_id)
        .bind(name)
        .bind(color)
        .fetch_one(&self.pool)
        .await?)
    }

    async fn delete_row_class(&self, table_id: &str, id: &str) -> Result<()> {
        self.ensure_user_table(table_id).await?;
        let mut transaction = self.pool.begin().await?;
        let affected_rows: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT row_id
             FROM many_to_many_assignments
             WHERE table_id = $1 AND field_id = 'classes' AND item_id = $2",
        )
        .bind(table_id)
        .bind(id)
        .fetch_all(&mut *transaction)
        .await?;

        let affected_subclasses: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT row_id
             FROM many_to_many_assignments
             WHERE table_id = $1 AND field_id = 'superclasses' AND item_id = $2",
        )
        .bind(table_id)
        .bind(id)
        .fetch_all(&mut *transaction)
        .await?;

        sqlx::query(
            "DELETE FROM many_to_many_assignments
             WHERE table_id = $1
               AND ((field_id = 'classes' AND item_id = $2)
                    OR (field_id = 'superclasses' AND (item_id = $2 OR row_id = $2)))",
        )
        .bind(table_id)
        .bind(id)
        .execute(&mut *transaction)
        .await?;

        sqlx::query("DELETE FROM row_classes WHERE table_id = $1 AND id = $2")
            .bind(table_id)
            .bind(id)
            .execute(&mut *transaction)
            .await?;

        for row_id in affected_rows {
            sync_many_to_many_jsonb(&mut transaction, table_id, &row_id, "classes").await?;
        }
        for subclass_id in affected_subclasses {
            sync_many_to_many_jsonb(&mut transaction, table_id, &subclass_id, "superclasses")
                .await?;
        }
        transaction.commit().await?;
        Ok(())
    }

    async fn get_row_class_assignments(
        &self,
        table_id: &str,
        row_id: &str,
    ) -> Result<Vec<crate::row_class::RowClass>> {
        Ok(sqlx::query_as::<_, crate::row_class::RowClass>(
            "SELECT rc.id, rc.table_id, rc.name, rc.color
             FROM row_classes rc
             JOIN many_to_many_assignments mma ON mma.item_id = rc.id
             WHERE mma.row_id = $1 AND mma.table_id = $2 AND mma.field_id = 'classes'
               AND rc.table_id = mma.table_id
             ORDER BY mma.when_created, rc.id",
        )
        .bind(row_id)
        .bind(table_id)
        .fetch_all(&self.pool)
        .await?)
    }

    async fn list_row_class_superclasses(
        &self,
        table_id: &str,
        class_id: &str,
    ) -> Result<Vec<crate::row_class::RowClass>> {
        Ok(sqlx::query_as::<_, crate::row_class::RowClass>(
            "SELECT rc.id, rc.table_id, rc.name, rc.color
             FROM row_classes rc
             JOIN many_to_many_assignments mma ON mma.item_id = rc.id
             WHERE mma.row_id = $1 AND mma.table_id = $2 AND mma.field_id = 'superclasses'
               AND rc.table_id = mma.table_id
             ORDER BY mma.when_created, rc.id",
        )
        .bind(class_id)
        .bind(table_id)
        .fetch_all(&self.pool)
        .await?)
    }

    async fn set_row_class_superclasses(
        &self,
        table_id: &str,
        class_id: &str,
        superclass_ids: &[String],
    ) -> Result<()> {
        self.set_many_to_many_assignments(table_id, class_id, "superclasses", superclass_ids)
            .await
    }

    async fn add_many_to_many_assignments(
        &self,
        table_id: &str,
        row_id: &str,
        field_id: &str,
        item_ids: &[String],
    ) -> Result<()> {
        if item_ids.is_empty() {
            return Ok(());
        }
        validate_field_id(field_id)?;
        self.ensure_many_to_many_field(table_id, field_id).await?;
        let mut transaction = self.pool.begin().await?;
        let item_ids = unique_item_ids(item_ids);
        validate_many_to_many_items(&mut transaction, table_id, field_id, &item_ids).await?;
        for item_id in item_ids {
            sqlx::query(
                "INSERT INTO many_to_many_assignments (row_id, item_id, field_id, table_id)
                 VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
            )
            .bind(row_id)
            .bind(item_id)
            .bind(field_id)
            .bind(table_id)
            .execute(&mut *transaction)
            .await?;
        }
        sync_many_to_many_jsonb(&mut transaction, table_id, row_id, field_id).await?;
        transaction.commit().await?;
        Ok(())
    }

    async fn remove_many_to_many_assignments(
        &self,
        table_id: &str,
        row_id: &str,
        field_id: &str,
        item_ids: &[String],
    ) -> Result<()> {
        if item_ids.is_empty() {
            return Ok(());
        }
        validate_field_id(field_id)?;
        self.ensure_many_to_many_field(table_id, field_id).await?;
        let mut transaction = self.pool.begin().await?;
        for item_id in unique_item_ids(item_ids) {
            sqlx::query(
                "DELETE FROM many_to_many_assignments
                 WHERE table_id = $1 AND row_id = $2 AND item_id = $3 AND field_id = $4",
            )
            .bind(table_id)
            .bind(row_id)
            .bind(item_id)
            .bind(field_id)
            .execute(&mut *transaction)
            .await?;
        }
        sync_many_to_many_jsonb(&mut transaction, table_id, row_id, field_id).await?;
        transaction.commit().await?;
        Ok(())
    }

    async fn set_many_to_many_assignments(
        &self,
        table_id: &str,
        row_id: &str,
        field_id: &str,
        item_ids: &[String],
    ) -> Result<()> {
        validate_field_id(field_id)?;
        self.ensure_many_to_many_field(table_id, field_id).await?;
        let mut transaction = self.pool.begin().await?;
        let item_ids = unique_item_ids(item_ids);
        validate_many_to_many_items(&mut transaction, table_id, field_id, &item_ids).await?;
        sqlx::query(
            "DELETE FROM many_to_many_assignments
             WHERE table_id = $1 AND row_id = $2 AND field_id = $3",
        )
        .bind(table_id)
        .bind(row_id)
        .bind(field_id)
        .execute(&mut *transaction)
        .await?;

        for item_id in item_ids {
            sqlx::query(
                "INSERT INTO many_to_many_assignments (table_id, row_id, field_id, item_id)
                 VALUES ($1, $2, $3, $4)",
            )
            .bind(table_id)
            .bind(row_id)
            .bind(field_id)
            .bind(item_id)
            .execute(&mut *transaction)
            .await?;
        }
        sync_many_to_many_jsonb(&mut transaction, table_id, row_id, field_id).await?;
        transaction.commit().await?;
        Ok(())
    }

    // ── Custom columns ────────────────────────────────────────────────────────

    async fn list_custom_columns(&self, table_id: &str) -> Result<Vec<CustomColumn>> {
        if table_id == "tables" {
            return Ok(super::table_view_columns());
        }
        self.repair_nested_columns_from_existing_rows(table_id)
            .await?;

        let mut columns = super::row_builtin_columns();
        columns.extend(sqlx::query_as::<_, CustomColumn>(
            "SELECT c.id::text, NULLIF(BTRIM(c.title), '') AS title, c.description, c.expression,
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
        .await?
        .into_iter()
        .filter(|column| column.id != "full_name"));
        Ok(columns)
    }

    async fn upsert_custom_column(
        &self,
        table_id: &str,
        id: &str,
        input: &crate::custom_column::CustomColumnInput,
    ) -> Result<CustomColumn> {
        if id == "full_name" {
            return Err(anyhow::anyhow!(
                "full_name is a built-in physical column and cannot be created as a custom column"
            ));
        }
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

        let effective_source_path = input.source_path.clone().filter(|path| !path.is_empty());
        let title = input.title.as_deref().and_then(non_blank_text);
        let types = input.effective_types();
        let data_types = input.effective_data_types();
        let col = sqlx::query_as::<_, CustomColumn>(
            "WITH upsert_col AS (
               INSERT INTO custom_columns
                 (id, title, description, expression, position_before, position_after,
                  read_only, is_frozen, is_group, parent_ids, source_path, types, data_types)
               VALUES ($1, $2, $3, $4, $5, $6, $13, false, $8, $9, $10, $11, $12)
               ON CONFLICT (id) DO UPDATE
                 SET title = COALESCE(EXCLUDED.title, NULLIF(BTRIM(custom_columns.title), '')),
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
             SELECT c.id::text, NULLIF(BTRIM(c.title), '') AS title, c.description, c.expression,
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
        .bind(title)
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
        let data_types = index_input.effective_data_types();
        let (cast, direction) = if data_types
            .iter()
            .any(|t| matches!(t.as_str(), "integer" | "bigint" | "numeric"))
        {
            ("::numeric", " DESC NULLS LAST")
        } else if data_types.iter().any(|t| t == "timestamptz") {
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
             SELECT c.id::text, NULLIF(BTRIM(c.title), '') AS title, c.description, c.expression,
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
             RETURNING id::text, NULLIF(BTRIM(title), '') AS title, description, expression, position_before,
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

    async fn set_column_title(&self, column_id: &str, title: Option<&str>) -> Result<CustomColumn> {
        let title = title.and_then(non_blank_text);
        Ok(sqlx::query_as::<_, CustomColumn>(
            "UPDATE custom_columns
             SET title = $2, when_last_modified = NOW(), modify_count = modify_count + 1
             WHERE id = $1
             RETURNING id::text, NULLIF(BTRIM(title), '') AS title, description, expression,
               position_before, position_after, read_only, types, source_path,
               COALESCE(data_types, ARRAY[]::TEXT[]) AS data_types,
               COALESCE(is_group, false) AS is_group,
               COALESCE(parent_ids, ARRAY[]::TEXT[]) AS parent_ids,
               COALESCE(is_frozen, false) AS is_frozen",
        )
        .bind(column_id)
        .bind(title)
        .fetch_one(&self.pool)
        .await?)
    }

    // ── Tables registry ───────────────────────────────────────────────────────

    async fn list_tables(&self) -> Result<Vec<Table>> {
        Ok(sqlx::query_as::<_, Table>(
            "SELECT id, title, tagline, description, who_created, when_created, who_last_modified, when_last_modified, modify_count \
             FROM tables ORDER BY when_created",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn create_table(
        &self,
        id: &str,
        title: &str,
        tagline: Option<&str>,
        description: Option<&str>,
        who_created: Option<&str>,
    ) -> Result<Table> {
        const SEL: &str = "SELECT id, title, tagline, description, who_created, when_created, \
                           who_last_modified, when_last_modified, modify_count \
                           FROM tables WHERE id = $1";
        let row = sqlx::query_as::<_, Table>(
            "INSERT INTO tables (id, title, tagline, description, who_created)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING
             RETURNING id, title, tagline, description, who_created, when_created,
                       who_last_modified, when_last_modified, modify_count",
        )
        .bind(id)
        .bind(title)
        .bind(tagline)
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
        tagline: Option<&str>,
        description: Option<&str>,
        who_last_modified: Option<&str>,
    ) -> Result<Table> {
        Ok(sqlx::query_as::<_, Table>(
            "UPDATE tables
             SET title = COALESCE($2, title),
                 tagline = COALESCE($3, tagline),
                 description = COALESCE($4, description),
                 who_last_modified = $5,
                 when_last_modified = NOW(),
                 modify_count = modify_count + 1
             WHERE id = $1
             RETURNING id, title, tagline, description, who_created, when_created, who_last_modified, when_last_modified, modify_count",
        )
        .bind(id).bind(title).bind(tagline).bind(description).bind(who_last_modified)
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
                "title" | "full_name" => {
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
        if col_id == "classes" {
            let values = value.as_array().ok_or_else(|| {
                anyhow::anyhow!("classes cell value must be an array of class ids")
            })?;
            let item_ids = values
                .iter()
                .map(|item| {
                    item.as_str()
                        .map(str::to_owned)
                        .ok_or_else(|| anyhow::anyhow!("classes cell values must be class ids"))
                })
                .collect::<Result<Vec<_>>>()?;
            return self
                .set_many_to_many_assignments(table_id, row_id, col_id, &item_ids)
                .await;
        }
        if col_id == "full_name" {
            self.ensure_user_table(table_id).await?;
            let tname = user_table_ident(table_id);
            sqlx::query(&format!(
                "INSERT INTO {tname} (id, full_name)
                 VALUES ($1, $2)
                 ON CONFLICT (id) DO UPDATE
                   SET full_name = EXCLUDED.full_name,
                       when_last_modified = NOW(),
                       modify_count = {tname}.modify_count + 1",
            ))
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
        let full_name = title.unwrap_or("");
        let row_json_expr = format!(
            "jsonb_build_object(\
               'id', id, 'table_id', '{table_id}', \
               'full_name', full_name, \
               'who_created', who_created, \
               'when_created', when_created, \
               'when_last_modified', when_last_modified, \
               'modify_count', modify_count, \
               'classes', COALESCE(classes, '[]'::jsonb), \
               'parent_child', COALESCE(parent_child, '[]'::jsonb)) || (custom_vals - 'classes' - 'parent_child' - 'full_name')"
        );
        let inserted: Option<serde_json::Value> = sqlx::query_scalar(&format!(
            "INSERT INTO {tname} (id, full_name, who_created)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO NOTHING
             RETURNING ({row_json_expr})",
        ))
        .bind(row_id)
        .bind(full_name)
        .bind(who_created)
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

    async fn delete_row(&self, table_id: &str, row_id: &str) -> Result<()> {
        self.ensure_user_table(table_id).await?;
        let tname = user_table_ident(table_id);
        sqlx::query(&format!(
            "UPDATE {tname} SET when_deleted = NOW() WHERE id = $1 AND when_deleted IS NULL"
        ))
        .bind(row_id)
        .execute(&self.pool)
        .await?;
        Ok(())
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
                   'full_name', title,
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
            col_types.insert("full_name".to_string(), vec!["text".to_string()]);
            col_types.insert("classes".to_string(), vec!["array".to_string()]);
            let mut col_paths: std::collections::HashMap<String, String> =
                std::collections::HashMap::new();
            for (id, types, source_path) in col_type_rows {
                col_types.insert(id.clone(), types.clone());
                if let Some(path) = source_path.filter(|path| !path.is_empty()) {
                    let path = path.join(".");
                    col_paths.insert(id, path.clone());
                    col_types.insert(path, types);
                }
            }

            let total: i64 = {
                let mut qb = QueryBuilder::new(format!("SELECT COUNT(*) FROM {tname} WHERE "));
                qb.push("when_deleted IS NULL AND id NOT IN (SELECT row_id FROM hidden_rows)");
                push_table_row_filters(&mut qb, params, &col_types);
                qb.build_query_scalar().fetch_one(&self.pool).await?
            };

            let order = validated_sort_with_paths(params.sort.as_deref(), &col_types, &col_paths);
            let data: Vec<serde_json::Value> = {
                let mut qb = QueryBuilder::new(format!(
                    "SELECT (jsonb_build_object(\
                       'id', id, \
                       'full_name', full_name, \
                       'when_created', when_created, \
                       'who_created', who_created, \
                       'when_last_modified', when_last_modified, \
                       'who_last_modified', who_last_modified, \
                       'classes', COALESCE(classes, '[]'::jsonb),\
                       'parent_child', COALESCE(parent_child, '[]'::jsonb)\
                     ) || (custom_vals - 'classes' - 'parent_child' - 'full_name')) FROM {tname} WHERE ",
                ));
                qb.push("when_deleted IS NULL AND id NOT IN (SELECT row_id FROM hidden_rows)");
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

    async fn upsert_rows_batch(&self, table_id: &str, rows: &[serde_json::Value]) -> Result<usize> {
        if rows.is_empty() {
            return Ok(0);
        }
        self.ensure_user_table(table_id).await?;
        let tname = user_table_ident(table_id);

        // Auto-create custom columns before inserting the batch. The first batch
        // for a table may create many per-column indexes; doing that while the
        // physical table is still empty avoids building indexes over the just-
        // inserted rows.
        let column_create_started = std::time::Instant::now();
        let mut column_create_stats = AutoCreateColumnsStats::default();
        let mut column_create_errors = 0usize;
        for sample in rows {
            match self.auto_create_columns_from_row(table_id, sample).await {
                Ok(stats) => column_create_stats.add(stats),
                Err(e) => {
                    column_create_errors += 1;
                    tracing::warn!(table_id, "auto_create_columns_from_row failed: {e}");
                }
            }
        }
        tracing::info!(
            table_id,
            row_count = rows.len(),
            rows_scanned = column_create_stats.rows_scanned,
            specs_found = column_create_stats.specs_found,
            missing_columns = column_create_stats.missing_columns,
            created_columns = column_create_stats.created_columns,
            errors = column_create_errors,
            discovery_ms = column_create_stats.discovery_ms,
            cache_filter_ms = column_create_stats.cache_filter_ms,
            upsert_ms = column_create_stats.upsert_ms,
            row_scan_total_ms = column_create_stats.total_ms,
            wall_ms = column_create_started.elapsed().as_millis(),
            "auto-create columns from rows measured"
        );

        let row_upsert_started = std::time::Instant::now();
        let json_array = serde_json::Value::Array(rows.to_vec());
        let count: i64 = sqlx::query_scalar(&format!(
            "WITH incoming AS (
               SELECT DISTINCT ON (row_id)
                 COALESCE(r->>'id', r->>'github_id') AS row_id,
                 COALESCE(NULLIF(r->>'full_name', ''), NULLIF(r->>'title', ''), NULLIF(r->>'name', ''), COALESCE(r->>'id', r->>'github_id')) AS full_name,
                 r - 'classes' - 'full_name' AS custom_vals
               FROM jsonb_array_elements($1::jsonb) AS r
               WHERE COALESCE(r->>'id', r->>'github_id') IS NOT NULL
               ORDER BY row_id
             ),
             upserted AS (
               INSERT INTO {tname} (id, full_name, custom_vals, when_created, when_last_modified)
               SELECT row_id, full_name, custom_vals, NOW(), NOW() FROM incoming
               ON CONFLICT (id) DO UPDATE SET
                 full_name          = COALESCE(NULLIF(EXCLUDED.full_name, ''), {tname}.full_name),
                 custom_vals        = {tname}.custom_vals || EXCLUDED.custom_vals,
                 when_last_modified = NOW(),
                 modify_count       = {tname}.modify_count + 1
               RETURNING 1
             ) SELECT COUNT(*) FROM upserted",
        ))
        .bind(json_array)
        .fetch_one(&self.pool)
        .await?;
        tracing::info!(
            table_id,
            row_count = rows.len(),
            upserted = count,
            wall_ms = row_upsert_started.elapsed().as_millis(),
            "upsert rows batch measured"
        );

        Ok(count as usize)
    }

    async fn reconcile_rows_batch(&self, table_id: &str, rows: &[serde_json::Value]) -> Result<usize> {
        if rows.is_empty() {
            return Ok(0);
        }
        self.ensure_user_table(table_id).await?;
        let tname = user_table_ident(table_id);

        for row in rows {
            if let Err(e) = self.auto_create_columns_from_row(table_id, row).await {
                tracing::warn!(table_id, "reconcile auto_create_columns_from_row failed: {e}");
            }
        }

        let json_array = serde_json::Value::Array(rows.to_vec());
        // Only overwrite existing row if incoming when_last_modified is strictly newer.
        // Preserves the incoming timestamp rather than bumping to NOW().
        let count: i64 = sqlx::query_scalar(&format!(
            "WITH incoming AS (
               SELECT DISTINCT ON (row_id)
                 COALESCE(r->>'id', r->>'github_id')        AS row_id,
                 COALESCE(NULLIF(r->>'full_name', ''), NULLIF(r->>'title', ''), NULLIF(r->>'name', ''),
                          COALESCE(r->>'id', r->>'github_id')) AS full_name,
                 (r->>'when_last_modified')::timestamptz     AS when_last_modified,
                 r - 'classes' - 'full_name'                 AS custom_vals
               FROM jsonb_array_elements($1::jsonb) AS r
               WHERE COALESCE(r->>'id', r->>'github_id') IS NOT NULL
               ORDER BY row_id
             ),
             upserted AS (
               INSERT INTO {tname} (id, full_name, custom_vals, when_created, when_last_modified)
               SELECT row_id, full_name, custom_vals, NOW(), when_last_modified FROM incoming
               ON CONFLICT (id) DO UPDATE SET
                 full_name          = COALESCE(NULLIF(EXCLUDED.full_name, ''), {tname}.full_name),
                 custom_vals        = {tname}.custom_vals || EXCLUDED.custom_vals,
                 when_last_modified = EXCLUDED.when_last_modified,
                 modify_count       = {tname}.modify_count + 1
               WHERE EXCLUDED.when_last_modified IS NOT NULL
                 AND (
                   {tname}.when_last_modified IS NULL
                   OR EXCLUDED.when_last_modified > {tname}.when_last_modified
                 )
               RETURNING 1
             ) SELECT COUNT(*) FROM upserted",
        ))
        .bind(json_array)
        .fetch_one(&self.pool)
        .await?;

        tracing::info!(table_id, upserted = count, "reconcile_rows_batch");
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
    if let Some(q) = p.q.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let pat = format!("%{q}%");
        let mut paths = vec![
            "full_name".to_string(),
            "name".to_string(),
            "title".to_string(),
            "description".to_string(),
        ];
        for (path, types) in col_types {
            if types
                .iter()
                .any(|t| matches!(t.as_str(), "text" | "string"))
            {
                paths.push(path.clone());
            }
        }
        paths.sort();
        paths.dedup();

        qb.push(" AND (");
        qb.push(
            "to_tsvector('simple', COALESCE(full_name, '')) @@ websearch_to_tsquery('simple', ",
        )
        .push_bind(q.to_string())
        .push(") OR full_name ILIKE ")
        .push_bind(pat.clone());
        let mut pushed = true;
        for path in paths {
            if path == "full_name" {
                continue;
            }
            if let Some(expr) = path_to_jsonb_expr(&path) {
                if pushed {
                    qb.push(" OR ");
                }
                qb.push(format!("({expr}) ILIKE ")).push_bind(pat.clone());
                pushed = true;
            }
        }
        if !pushed {
            qb.push("FALSE");
        }
        qb.push(")");
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

/// Validate that a field_id is a safe SQL identifier (lowercase letters, digits, underscores).
/// Used to guard dynamic column names in UPDATE statements.
fn validate_field_id(field_id: &str) -> Result<()> {
    if field_id.is_empty()
        || !field_id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err(anyhow::anyhow!(
            "invalid field_id '{}': must be lowercase letters, digits, or underscores",
            field_id
        ));
    }
    Ok(())
}

fn unique_item_ids(item_ids: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    item_ids
        .iter()
        .filter(|id| !id.is_empty() && seen.insert(id.as_str()))
        .cloned()
        .collect()
}

async fn validate_many_to_many_items(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    table_id: &str,
    field_id: &str,
    item_ids: &[String],
) -> Result<()> {
    if item_ids.is_empty() {
        return Ok(());
    }
    if field_id == "classes" || field_id == "superclasses" {
        // Classes may live in the per-table row_classes (legacy) OR globally in t_classes.
        let found: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*) FROM (
                 SELECT id FROM row_classes WHERE table_id = $1 AND id = ANY($2)
                 UNION
                 SELECT id FROM "t_classes" WHERE id = ANY($2) AND when_deleted IS NULL
               ) combined"#,
        )
        .bind(table_id)
        .bind(item_ids)
        .fetch_one(&mut **transaction)
        .await?;
        anyhow::ensure!(
            found as usize == item_ids.len(),
            "one or more row classes do not exist in table '{table_id}'"
        );
    }
    Ok(())
}

/// Recompute the current item_ids for (row_id, field_id) from many_to_many_assignments
/// and write them to the denormalized JSONB column on the per-table row.
async fn sync_many_to_many_jsonb(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    table_id: &str,
    row_id: &str,
    field_id: &str,
) -> Result<()> {
    let item_ids: Vec<String> = sqlx::query_scalar(
        "SELECT item_id FROM many_to_many_assignments
         WHERE row_id = $1 AND field_id = $2 AND table_id = $3
         ORDER BY when_created",
    )
    .bind(row_id)
    .bind(field_id)
    .bind(table_id)
    .fetch_all(&mut **transaction)
    .await?;

    let result = if field_id == "superclasses" {
        sqlx::query(
            "UPDATE row_classes
             SET superclasses = $1, when_last_modified = NOW(), modify_count = modify_count + 1
             WHERE table_id = $2 AND id = $3",
        )
        .bind(serde_json::to_value(&item_ids)?)
        .bind(table_id)
        .bind(row_id)
        .execute(&mut **transaction)
        .await?
    } else {
        let tname = user_table_ident(table_id);
        // field_id is validated before calling this function — safe to interpolate.
        sqlx::query(&format!(
            "UPDATE {tname}
             SET {field_id} = $1, when_last_modified = NOW(), modify_count = modify_count + 1
             WHERE id = $2"
        ))
        .bind(serde_json::to_value(&item_ids)?)
        .bind(row_id)
        .execute(&mut **transaction)
        .await?
    };
    anyhow::ensure!(
        result.rows_affected() == 1,
        "row '{row_id}' does not exist in table '{table_id}'"
    );

    Ok(())
}

/// Returns a JSONB expression (all `->` navigation, last segment also `->`)
/// for use with operators like `?|` that need a JSONB value, not text.
fn path_to_jsonb_value_expr(path: &str) -> Option<String> {
    if path == "full_name" {
        return Some("to_jsonb(full_name)".to_string());
    }
    if path == "classes" {
        return Some("classes".to_string());
    }
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
    if path == "full_name" {
        return Some("full_name".to_string());
    }
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
        "full_name" => return Some("full_name".to_string()),
        "classes" => return Some("classes".to_string()),
        _ => path_to_jsonb_expr(col)?,
    };
    let cast = match col_type {
        Some("integer") | Some("bigint") | Some("numeric") | Some("rating") => "::numeric",
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

#[cfg(test)]
pub(super) fn validated_sort(sort: Option<&str>) -> String {
    validated_sort_with_types(sort, &std::collections::HashMap::new())
}

pub(super) fn validated_sort_with_types(
    sort: Option<&str>,
    col_types: &std::collections::HashMap<String, Vec<String>>,
) -> String {
    validated_sort_with_paths(sort, col_types, &std::collections::HashMap::new())
}

pub(super) fn validated_sort_with_paths(
    sort: Option<&str>,
    col_types: &std::collections::HashMap<String, Vec<String>>,
    col_paths: &std::collections::HashMap<String, String>,
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
            let expr_col = col_paths.get(col).map(String::as_str).unwrap_or(col);
            let col_type = it.next().or_else(|| {
                col_types
                    .get(col)
                    .or_else(|| col_types.get(expr_col))
                    .and_then(|types| types.first().map(String::as_str))
            });
            let expr = col_to_sort_expr(expr_col, col_type)?;
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
    fn jsonb_value_expr_builtin_classes() {
        assert_eq!(path_to_jsonb_value_expr("classes"), Some("classes".into()));
    }

    #[test]
    fn jsonb_value_expr_builtin_full_name() {
        assert_eq!(
            path_to_jsonb_value_expr("full_name"),
            Some("to_jsonb(full_name)".into())
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
    fn sort_expr_builtin_classes() {
        assert_eq!(col_to_sort_expr("classes", None), Some("classes".into()));
    }

    #[test]
    fn sort_expr_builtin_full_name() {
        assert_eq!(
            col_to_sort_expr("full_name", None),
            Some("full_name".into())
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
    fn sort_expr_custom_rating() {
        assert_eq!(
            col_to_sort_expr("my_rating", Some("rating")),
            Some("(custom_vals->>'my_rating')::numeric".into())
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
    fn sort_uses_source_path_for_stable_nested_column_id() {
        let mut col_types = std::collections::HashMap::new();
        col_types.insert("metrics__views".to_string(), vec!["numeric".to_string()]);
        let mut col_paths = std::collections::HashMap::new();
        col_paths.insert("metrics__views".to_string(), "metrics.views".to_string());
        assert_eq!(
            validated_sort_with_paths(Some("metrics__views:desc"), &col_types, &col_paths),
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
