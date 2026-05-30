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
}

impl PgStore {
    pub async fn connect(url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(Duration::from_secs(5))
            .connect(url)
            .await?;
        Ok(Self { pool })
    }
}

#[async_trait]
impl DataStore for PgStore {
    async fn ensure_schema(&self) -> Result<()> {
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

    async fn list_custom_columns(&self) -> Result<Vec<CustomColumn>> {
        Ok(sqlx::query_as::<_, CustomColumn>(
            "SELECT id::text, name, label, description, expression, position_after, read_only, types, \
               source_path, \
               COALESCE(data_types, ARRAY[]::TEXT[]) AS data_types, \
               COALESCE(is_group, false) AS is_group, \
               COALESCE(parent_ids, ARRAY[]::TEXT[]) AS parent_ids \
             FROM custom_columns ORDER BY when_created",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn upsert_custom_column(
        &self,
        id: &str,
        name: &str,
        label: Option<&str>,
        description: Option<&str>,
        expression: Option<&str>,
        position_after: Option<&str>,
    ) -> Result<CustomColumn> {
        let col = sqlx::query_as::<_, CustomColumn>(
            "INSERT INTO custom_columns (id, name, label, description, expression, position_after, read_only)
             VALUES ($1, $2, $3, $4, $5, $6, false)
             ON CONFLICT (id) DO UPDATE
               SET name = EXCLUDED.name, label = EXCLUDED.label,
                   description = EXCLUDED.description,
                   expression = EXCLUDED.expression, position_after = EXCLUDED.position_after,
                   when_last_modified = NOW(),
                   modify_count = custom_columns.modify_count + 1
             RETURNING id::text, name, label, description, expression, position_after, read_only, types, \
               source_path, \
               COALESCE(data_types, ARRAY[]::TEXT[]) AS data_types, \
               COALESCE(is_group, false) AS is_group, \
               COALESCE(parent_ids, ARRAY[]::TEXT[]) AS parent_ids",
        )
        .bind(id)
        .bind(name)
        .bind(label)
        .bind(description)
        .bind(expression)
        .bind(position_after)
        .fetch_one(&self.pool)
        .await?;

        // Per-key JSONB index for fast filtering/sorting on this column.
        // Index name uses the column id (unique, stable). Key is single-quote-escaped.
        // We always try to CREATE INDEX when a column is upserted/created.
        let idx = format!("idx_cv_{id}");
        let safe_key = name.replace('\'', "''");
        let sql = format!(
            r#"CREATE INDEX IF NOT EXISTS "{idx}" ON github_repos ((custom_values->>'{}'))"#,
            safe_key,
        );
        if let Err(e) = sqlx::query(&sql).execute(&self.pool).await {
            tracing::warn!("could not create index \"{idx}\": {e}");
        }

        Ok(col)
    }

    async fn delete_custom_column(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM custom_columns WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;

        let idx = format!("idx_cv_{id}");
        let sql = format!(r#"DROP INDEX IF EXISTS "{idx}""#);
        if let Err(e) = sqlx::query(&sql).execute(&self.pool).await {
            tracing::warn!("could not drop index \"{idx}\": {e}");
        }
        Ok(())
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
        Ok(sqlx::query_as::<_, Table>(
            "INSERT INTO tables (id, title, description, who_created)
             VALUES ($1, $2, $3, $4)
             RETURNING id, title, description, who_created, when_created, who_last_modified, when_last_modified, modify_count",
        )
        .bind(id).bind(title).bind(description).bind(who_created)
        .fetch_one(&self.pool)
        .await?)
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
        _table_id: &str,
        row_id: &str,
        col_id: &str,
        value: serde_json::Value,
    ) -> Result<()> {
        // Merge a single key into custom_values so concurrent edits to other keys are preserved.
        // TODO: use _table_id to route to the correct table once multi-table is supported.
        sqlx::query(
            "UPDATE github_repos
             SET custom_values = custom_values || jsonb_build_object($2::text, $3::jsonb)
             WHERE id = $1",
        )
        .bind(row_id)
        .bind(col_id)
        .bind(value)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_repos(&self, params: &RowQuery) -> Result<PagedResponse> {
        let per_page = params.per_page.clamp(1, 200) as i64;
        let offset = (params.page.max(1) - 1) as i64 * per_page;

        // Column type map drives filter SQL (array vs. scalar vs. date operators).
        let col_types: std::collections::HashMap<String, Vec<String>> =
            sqlx::query_as::<_, (String, Vec<String>)>(
                "SELECT name, types FROM custom_columns",
            )
            .fetch_all(&self.pool)
            .await?
            .into_iter()
            .collect();

        let total: i64 = {
            let mut qb = QueryBuilder::new("SELECT COUNT(*) FROM github_repos");
            push_filters(&mut qb, params, &col_types);
            qb.build_query_scalar().fetch_one(&self.pool).await?
        };

        let order = validated_sort(params.sort.as_deref());
        let data: Vec<serde_json::Value> = {
            // Merge built-in columns with custom_values so the frontend sees a flat object.
            let mut qb = QueryBuilder::new(
                "SELECT (jsonb_build_object(\
                   'id', id, \
                   'when_created', when_created, \
                   'who_created', who_created, \
                   'when_last_modified', when_last_modified, \
                   'who_last_modified', who_last_modified\
                 ) || custom_values) FROM github_repos",
            );
            push_filters(&mut qb, params, &col_types);
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

        Ok(PagedResponse {
            data,
            total,
            page: params.page,
            per_page: params.per_page,
        })
    }

    // ── Ops log ───────────────────────────────────────────────────────────────
    async fn append_ops_log(
        &self,
        op: &str,
        payload: serde_json::Value,
        tx_id: Option<&str>,
    ) {
        crate::ops_log::append(&self.pool, op, payload, tx_id).await;
    }
}

// ── Query helpers (PG-specific) ───────────────────────────────────────────────

fn col_has_type(col_types: &std::collections::HashMap<String, Vec<String>>, name: &str, target: &str) -> bool {
    col_types.get(name).map_or(false, |types| types.iter().any(|t| t == target))
}

fn push_filters<'q>(
    qb: &mut QueryBuilder<'q, Postgres>,
    p: &'q RowQuery,
    col_types: &std::collections::HashMap<String, Vec<String>>,
) {
    qb.push(" WHERE id NOT IN (SELECT row_id FROM hidden_rows)");

    // Numeric range filters: `{dot-path}_min` / `{dot-path}_max`
    for (path, min, max) in &p.range_filters {
        if let Some(expr) = path_to_jsonb_expr(path) {
            if let Some(v) = min { qb.push(format!(" AND ({expr})::numeric >= ")).push_bind(*v); }
            if let Some(v) = max { qb.push(format!(" AND ({expr})::numeric <= ")).push_bind(*v); }
        }
    }

    // Date range filters: `{dot-path}_after` / `{dot-path}_before`
    for (path, after, before) in &p.date_filters {
        if let Some(expr) = path_to_jsonb_expr(path) {
            if let Some(v) = after  { qb.push(format!(" AND ({expr})::timestamptz >= ")).push_bind(*v); }
            if let Some(v) = before { qb.push(format!(" AND ({expr})::timestamptz <= ")).push_bind(*v); }
        }
    }

    // Exact / categorical / array-containment filters: `{dot-path}=val1,val2`
    // Operator chosen by column type: array → ?|, otherwise → = ANY(text[])
    for (path, vals) in &p.value_filters {
        if vals.is_empty() { continue; }
        let col_name = path.split('.').next().unwrap_or(path.as_str());
        if col_has_type(col_types, col_name, "array") {
            if let Some(obj_expr) = path_to_jsonb_value_expr(path) {
                qb.push(format!(" AND {obj_expr} ?| ")).push_bind(vals.clone());
            }
        } else if let Some(expr) = path_to_jsonb_expr(path) {
            qb.push(format!(" AND ({expr}) = ANY(")).push_bind(vals.clone()).push(")");
        }
    }

    // ILIKE filters: `{dot-path}_like=pattern`; % wrapping added here
    // Array columns: element-level ILIKE via jsonb_array_elements_text
    for (path, patterns) in &p.like_filters {
        let wrapped: Vec<String> = patterns.iter().filter(|p| !p.is_empty()).map(|p| format!("%{p}%")).collect();
        if wrapped.is_empty() { continue; }
        let col_name = path.split('.').next().unwrap_or(path.as_str());
        if col_has_type(col_types, col_name, "array") {
            if let Some(obj_expr) = path_to_jsonb_value_expr(path) {
                qb.push(format!(" AND EXISTS (SELECT 1 FROM jsonb_array_elements_text({obj_expr}) _t WHERE _t ILIKE ANY("))
                  .push_bind(wrapped)
                  .push("))");
            }
        } else if let Some(expr) = path_to_jsonb_expr(path) {
            qb.push(format!(" AND ({expr}) ILIKE ANY(")).push_bind(wrapped).push(")");
        }
    }

    // Full-text search across the table's indexed text columns (q param)
    if let Some(ref q) = p.q {
        let pat = format!("%{q}%");
        qb.push(" AND (custom_values->>'name' ILIKE ")
            .push_bind(pat.clone())
            .push(" OR custom_values->>'description' ILIKE ")
            .push_bind(pat)
            .push(")");
    }
}

/// Returns a JSONB expression (all `->` navigation, last segment also `->`)
/// for use with operators like `?|` that need a JSONB value, not text.
fn path_to_jsonb_value_expr(path: &str) -> Option<String> {
    let parts: Vec<&str> = path.split('.').collect();
    if parts.is_empty() { return None; }
    if parts.iter().any(|p| p.is_empty() || !p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')) {
        return None;
    }
    let mut expr = String::from("custom_values");
    for &seg in &parts { expr.push_str(&format!("->'{seg}'")); }
    Some(expr)
}

/// Build a PostgreSQL text expression for navigating `custom_values` by a dot-path.
/// Each segment must be alphanumeric/underscore only (SQL-injection guard).
/// "stars"           → custom_values->>'stars'
/// "stars_diff.6h"   → custom_values->'stars_diff'->>'6h'
/// "a.b.c"           → custom_values->'a'->'b'->>'c'
fn path_to_jsonb_expr(path: &str) -> Option<String> {
    let parts: Vec<&str> = path.split('.').collect();
    if parts.is_empty() { return None; }
    if parts.iter().any(|p| p.is_empty() || !p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')) {
        return None;
    }
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
    if col.chars().any(|c| !c.is_ascii_alphanumeric() && c != '_' && c != '.') {
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
        Some("timestamptz")                                 => "::timestamptz",
        Some("boolean")                                     => "::boolean",
        _                                                   => "",
    };
    Some(if cast.is_empty() { base } else { format!("({base}){cast}") })
}

fn validated_sort(sort: Option<&str>) -> String {
    // Sort param format: "col:dir[:type]" where type is a custom_columns.types element.
    // Multiple sorts are comma-separated.
    let parts: Vec<String> = sort
        .unwrap_or("")
        .split(',')
        .filter_map(|s| {
            let s = s.trim();
            if s.is_empty() { return None; }
            let mut it = s.splitn(3, ':');
            let col      = it.next()?;
            let dir      = it.next().unwrap_or("desc");
            let col_type = it.next();
            let expr = col_to_sort_expr(col, col_type)?;
            let dir_sql = if dir.eq_ignore_ascii_case("asc") { "ASC" } else { "DESC" };
            Some(format!("{expr} {dir_sql} NULLS LAST"))
        })
        .collect();

    if parts.is_empty() {
        "when_created DESC NULLS LAST".to_string()
    } else {
        parts.join(", ")
    }
}
