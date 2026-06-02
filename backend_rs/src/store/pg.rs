use std::time::Duration;

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
        Ok(Self { pool, db_id: db_id.to_string() })
    }
}

#[async_trait]
impl DataStore for PgStore {
    async fn ensure_schema(&self) -> Result<()> {
        let stmts = super::pg_schema::POSTGRES_SCHEMA;
        let db_id = &self.db_id;
        tracing::info!(db_id, statement_count = stmts.len(), "PgStore: applying schema");
        let total_t0 = std::time::Instant::now();
        for (i, sql) in stmts.iter().enumerate() {
            let t0 = std::time::Instant::now();
            sqlx::query(sql)
                .execute(&self.pool)
                .await
                .map_err(|e| anyhow::anyhow!("PgStore({db_id}): schema statement {i} failed: {e}"))?;
            let ms = t0.elapsed().as_millis();
            if ms > 0 {
                tracing::debug!(db_id, i, ms, "PgStore: schema statement applied");
            }
        }
        let total_ms = total_t0.elapsed().as_millis();
        tracing::info!(db_id, total_ms, "PgStore: schema ready");
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
        let types = input.effective_types();
        let data_types = input.effective_data_types();
        let col = sqlx::query_as::<_, CustomColumn>(
            "WITH upsert_col AS (
               INSERT INTO custom_columns
                 (id, title, description, expression, position_after,
                  read_only, is_frozen, is_group, parent_ids, source_path, types, data_types)
               VALUES ($1, $2, $3, $4, $5, $12, false, $7, $8, $9, $10, $11)
               ON CONFLICT (id) DO UPDATE
                 SET title = EXCLUDED.title,
                     description = EXCLUDED.description,
                     expression = EXCLUDED.expression,
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
               INSERT INTO table_custom_columns (table_id, column_id, position_after)
               VALUES ($6, $1, $5)
               ON CONFLICT (table_id, column_id) DO UPDATE
                 SET position_after = EXCLUDED.position_after,
                     when_last_modified = NOW(),
                     modify_count = table_custom_columns.modify_count + 1
               RETURNING *
             )
             SELECT c.id::text, c.title, c.description, c.expression,
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
        .bind(input.position_after.as_deref())
        .bind(table_id)
        .bind(input.is_group)
        .bind(&input.parent_ids)
        .bind(&input.source_path)
        .bind(&types)
        .bind(&data_types)
        .bind(input.read_only)
        .fetch_one(&self.pool)
        .await?;

        // Per-column JSONB index. Uses source_path when available (nested/read-only data),
        // otherwise falls back to the stable column id as a top-level key.
        // Partial index on table_id keeps it small when multiple tables share table_rows.
        let jsonb_expr = build_index_expr(id, input);
        let types = input.effective_types();
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
        let safe_tid = table_id.replace('\'', "''");
        for suffix in ["", "_asc"] {
            if suffix == "_asc" && direction != " DESC NULLS LAST" {
                break;
            } // only add _asc when _default is DESC
            let idx = format!("idx_cv_{id}{suffix}");
            let sql = format!(
                r#"CREATE INDEX IF NOT EXISTS "{idx}" ON table_rows (({cast_expr}){dir}) WHERE table_id = '{safe_tid}'"#,
                dir = if suffix.is_empty() {
                    direction
                } else {
                    " ASC NULLS LAST"
                },
            );
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
             RETURNING id::text, title, description, expression, position_after,
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
        match row {
            Some(t) => Ok(t),
            // Conflict: another request already inserted this id — return existing row.
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
        sqlx::query("DELETE FROM tables WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
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
        // Tables are stored in the `tables` table, not in `table_rows`.
        if table_id == "tables" {
            let sql = match col_id {
                "title" => "UPDATE tables SET title = $2::text,
                              when_last_modified = NOW(), modify_count = modify_count + 1
                            WHERE id = $1",
                "description" => "UPDATE tables SET description = $2::text,
                                    when_last_modified = NOW(), modify_count = modify_count + 1
                                  WHERE id = $1",
                _ => return Ok(()), // read-only columns silently ignored
            };
            sqlx::query(sql)
                .bind(row_id)
                .bind(value.as_str().unwrap_or(""))
                .execute(&self.pool)
                .await?;
            return Ok(());
        }
        sqlx::query(
            "INSERT INTO table_rows (id, table_id, custom_values)
             VALUES ($1, $2, jsonb_build_object($3::text, $4::jsonb))
             ON CONFLICT (id) DO UPDATE
               SET custom_values = table_rows.custom_values || jsonb_build_object($3::text, $4::jsonb),
                   when_last_modified = NOW(),
                   modify_count = table_rows.modify_count + 1",
        )
        .bind(row_id)
        .bind(table_id)
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
    ) -> Result<crate::data_row::TableRow> {
        use crate::data_row::TableRow;
        const SEL: &str = "SELECT id, table_id, who_created, when_created, \
                           who_last_modified, when_last_modified, custom_values, modify_count \
                           FROM table_rows WHERE id = $1";
        let initial = title
            .map(|t| serde_json::json!({ "title": t }))
            .unwrap_or_else(|| serde_json::json!({}));
        let row = sqlx::query_as::<_, TableRow>(
            "INSERT INTO table_rows (id, table_id, who_created, custom_values)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO NOTHING
             RETURNING id, table_id, who_created, when_created,
                       who_last_modified, when_last_modified, custom_values, modify_count",
        )
        .bind(row_id)
        .bind(table_id)
        .bind(who_created)
        .bind(initial)
        .fetch_optional(&self.pool)
        .await?;
        match row {
            Some(r) => Ok(r),
            None => Ok(sqlx::query_as::<_, TableRow>(SEL)
                .bind(row_id)
                .fetch_one(&self.pool)
                .await?),
        }
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
            // Generic table_rows query: full sort + hidden-row filtering.
            let col_types: std::collections::HashMap<String, Vec<String>> =
                sqlx::query_as::<_, (String, Vec<String>)>(
                    "SELECT c.id, c.types
                     FROM custom_columns c
                     JOIN table_custom_columns tcc ON tcc.column_id = c.id
                     WHERE tcc.table_id = $1",
                )
                .bind(table_id)
                .fetch_all(&self.pool)
                .await?
                .into_iter()
                .collect();

            let total: i64 = {
                let mut qb = QueryBuilder::new("SELECT COUNT(*) FROM table_rows WHERE table_id = ");
                qb.push_bind(table_id);
                qb.push(" AND id NOT IN (SELECT row_id FROM hidden_rows)");
                push_table_row_filters(&mut qb, params, &col_types);
                qb.build_query_scalar().fetch_one(&self.pool).await?
            };

            let order = validated_sort(params.sort.as_deref());
            let data: Vec<serde_json::Value> = {
                let mut qb = QueryBuilder::new(
                    "SELECT (jsonb_build_object(\
                       'id', id, \
                       'when_created', when_created, \
                       'who_created', who_created, \
                       'when_last_modified', when_last_modified, \
                       'who_last_modified', who_last_modified\
                     ) || custom_values) FROM table_rows WHERE table_id = ",
                );
                qb.push_bind(table_id);
                qb.push(" AND id NOT IN (SELECT row_id FROM hidden_rows)");
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
        let json_array = serde_json::Value::Array(rows.to_vec());
        let count: i64 = sqlx::query_scalar(
            "WITH rows AS (
               SELECT DISTINCT ON (row_id)
                 COALESCE(r->>'id', r->>'github_id') AS row_id,
                 r AS custom_values
               FROM jsonb_array_elements($1::jsonb) AS r
               WHERE COALESCE(r->>'id', r->>'github_id') IS NOT NULL
               ORDER BY row_id
             ),
             upserted AS (
               INSERT INTO table_rows (id, table_id, custom_values, when_created, when_last_modified)
               SELECT row_id, $2, custom_values, NOW(), NOW() FROM rows
               ON CONFLICT (id) DO UPDATE SET
                 -- Merge: existing keys not in the upload are preserved (user-added columns survive).
                 -- Incoming keys win, so GitHub data is always refreshed.
                 custom_values      = table_rows.custom_values || EXCLUDED.custom_values,
                 when_last_modified = NOW(),
                 modify_count       = table_rows.modify_count + 1
               RETURNING 1
             ) SELECT COUNT(*) FROM upserted",
        )
        .bind(json_array)
        .bind(table_id)
        .fetch_one(&self.pool)
        .await?;
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
        qb.push(" AND (custom_values->>'name' ILIKE ")
            .push_bind(pat.clone())
            .push(" OR custom_values->>'description' ILIKE ")
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
        let mut expr = String::from("custom_values");
        for key in &path[..n - 1] {
            expr.push_str(&format!("->'{}'", key.replace('\'', "''")));
        }
        expr.push_str(&format!("->>'{}'", path[n - 1].replace('\'', "''")));
        expr
    } else if path.len() == 1 {
        format!("custom_values->>'{}'", path[0].replace('\'', "''"))
    } else {
        format!("custom_values->>'{}'", id.replace('\'', "''"))
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
    let mut expr = String::from("custom_values");
    for &seg in &parts {
        expr.push_str(&format!("->'{seg}'"));
    }
    Some(expr)
}

/// Build a PostgreSQL text expression for navigating `custom_values` by a dot-path.
/// Each segment must be alphanumeric/underscore only (SQL-injection guard).
/// "stars"           → custom_values->>'stars'
/// "stars_diff.6h"   → custom_values->'stars_diff'->>'6h'
/// "a.b.c"           → custom_values->'a'->'b'->>'c'
fn path_to_jsonb_expr(path: &str) -> Option<String> {
    let parts = validated_path_parts(path)?;
    let n = parts.len();
    let mut expr = String::from("custom_values");
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
            let col_type = it.next();
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
            Some("custom_values->>'stars'".into())
        );
    }

    #[test]
    fn jsonb_expr_two_segments() {
        assert_eq!(
            path_to_jsonb_expr("stars_diff.6h"),
            Some("custom_values->'stars_diff'->>'6h'".into())
        );
    }

    #[test]
    fn jsonb_expr_three_segments() {
        assert_eq!(
            path_to_jsonb_expr("a.b.c"),
            Some("custom_values->'a'->'b'->>'c'".into())
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
            "custom_values->>'col_123'"
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
            "custom_values->'stars_diff'->>'24h'"
        );
    }

    // ── path_to_jsonb_value_expr ──────────────────────────────────────────────

    #[test]
    fn jsonb_value_expr_single() {
        assert_eq!(
            path_to_jsonb_value_expr("stars"),
            Some("custom_values->'stars'".into())
        );
    }

    #[test]
    fn jsonb_value_expr_two_segments() {
        assert_eq!(
            path_to_jsonb_value_expr("topics.name"),
            Some("custom_values->'topics'->'name'".into())
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
            Some("custom_values->>'name'".into())
        );
    }

    #[test]
    fn sort_expr_custom_integer() {
        assert_eq!(
            col_to_sort_expr("stars", Some("integer")),
            Some("(custom_values->>'stars')::numeric".into())
        );
    }

    #[test]
    fn sort_expr_custom_timestamptz() {
        assert_eq!(
            col_to_sort_expr("pushed_at", Some("timestamptz")),
            Some("(custom_values->>'pushed_at')::timestamptz".into())
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
            "(custom_values->>'stars')::numeric DESC NULLS LAST"
        );
    }

    #[test]
    fn sort_single_column_asc() {
        assert_eq!(
            validated_sort(Some("name:asc")),
            "custom_values->>'name' ASC NULLS LAST"
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
            "(custom_values->>'stars')::numeric DESC NULLS LAST, custom_values->>'name' ASC NULLS LAST"
        );
    }

    #[test]
    fn sort_skips_invalid_columns() {
        // A column name with SQL-injection chars is silently dropped; valid ones survive.
        let result = validated_sort(Some("'; DROP TABLE:asc,name:asc"));
        assert_eq!(result, "custom_values->>'name' ASC NULLS LAST");
    }

    #[test]
    fn sort_all_invalid_falls_back_to_default() {
        assert_eq!(
            validated_sort(Some("'; DROP TABLE:asc")),
            "when_created DESC NULLS LAST"
        );
    }
}
