use std::{collections::HashSet, time::Duration};

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
    types::{PagedResponse, RepoQuery},
};

pub struct PgStore {
    pub(super) pool: PgPool,
    sortable_cols: HashSet<String>,
}

impl PgStore {
    pub async fn connect(url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(Duration::from_secs(5))
            .connect(url)
            .await?;
        let sortable_cols = fetch_sortable_cols(&pool).await?;
        tracing::info!("{} sortable columns loaded from schema", sortable_cols.len());
        Ok(Self { pool, sortable_cols })
    }
}

async fn fetch_sortable_cols(pool: &PgPool) -> Result<HashSet<String>> {
    let cols: Vec<String> = sqlx::query_scalar(
        "SELECT column_name::text FROM information_schema.columns \
         WHERE table_schema = 'public' AND table_name = 'github_repos'",
    )
    .fetch_all(pool)
    .await?;
    Ok(cols.into_iter().collect())
}

#[async_trait]
impl DataStore for PgStore {
    async fn ensure_schema(&self) -> Result<()> {
        crate::flag::ensure_table(&self.pool).await?;
        crate::remark::ensure_table(&self.pool).await?;
        crate::hidden_row::ensure_table(&self.pool).await?;
        crate::hidden_column::ensure_table(&self.pool).await?;
        crate::custom_column::ensure_table(&self.pool).await?;
        crate::ops_log::ensure_table(&self.pool).await?;
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

    async fn upsert_flag(&self, key: &str, color: &str) -> Result<CellFlag> {
        Ok(sqlx::query_as::<_, CellFlag>(
            "INSERT INTO cell_flags (key, color)
             VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE
               SET color = EXCLUDED.color, updated_at = NOW()
             RETURNING id::text, key, color",
        )
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
                        json_build_object('repo_id', t.repo_id, 'column_id', t.column_id)
                      ) FILTER (WHERE t.remark_id IS NOT NULL),
                      '[]'::json
                    ) AS targets_json
             FROM remarks r
             LEFT JOIN remark_targets t ON t.remark_id = r.id
             GROUP BY r.id
             ORDER BY r.created_at",
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
                   updated_at = NOW()",
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
                "INSERT INTO remark_targets (remark_id, repo_id, column_id) VALUES ($1, $2, $3)",
            )
            .bind(id)
            .bind(t.repo_id)
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
            "SELECT id::text, repo_id FROM hidden_rows ORDER BY created_at",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn add_hidden_row(&self, repo_id: i64) -> Result<HiddenRow> {
        Ok(sqlx::query_as::<_, HiddenRow>(
            "INSERT INTO hidden_rows (repo_id)
             VALUES ($1)
             ON CONFLICT (repo_id) DO UPDATE SET repo_id = EXCLUDED.repo_id
             RETURNING id::text, repo_id",
        )
        .bind(repo_id)
        .fetch_one(&self.pool)
        .await?)
    }

    async fn remove_hidden_row(&self, repo_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM hidden_rows WHERE repo_id = $1")
            .bind(repo_id)
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

    async fn add_hidden_column(&self, column_id: &str) -> Result<HiddenColumn> {
        Ok(sqlx::query_as::<_, HiddenColumn>(
            "INSERT INTO hidden_columns (column_id)
             VALUES ($1)
             ON CONFLICT (column_id) DO UPDATE SET column_id = EXCLUDED.column_id
             RETURNING id::text, column_id",
        )
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
            "SELECT id::text, name, label, expression, position_after \
             FROM custom_columns ORDER BY created_at",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn upsert_custom_column(
        &self,
        id: &str,
        name: &str,
        label: Option<&str>,
        expression: Option<&str>,
        position_after: Option<&str>,
    ) -> Result<CustomColumn> {
        Ok(sqlx::query_as::<_, CustomColumn>(
            "INSERT INTO custom_columns (id, name, label, expression, position_after)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE
               SET name = EXCLUDED.name, label = EXCLUDED.label,
                   expression = EXCLUDED.expression, position_after = EXCLUDED.position_after
             RETURNING id::text, name, label, expression, position_after",
        )
        .bind(id)
        .bind(name)
        .bind(label)
        .bind(expression)
        .bind(position_after)
        .fetch_one(&self.pool)
        .await?)
    }

    async fn delete_custom_column(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM custom_columns WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Repos ─────────────────────────────────────────────────────────────────

    async fn list_repos(&self, params: &RepoQuery) -> Result<PagedResponse> {
        let per_page = params.per_page.clamp(1, 200) as i64;
        let offset   = (params.page.max(1) - 1) as i64 * per_page;

        let total: i64 = {
            let mut qb = QueryBuilder::new("SELECT COUNT(*) FROM github_repos");
            push_filters(&mut qb, params);
            qb.build_query_scalar().fetch_one(&self.pool).await?
        };

        let order = validated_sort(params.sort.as_deref(), &self.sortable_cols);
        let data: Vec<serde_json::Value> = {
            let mut qb = QueryBuilder::new(
                "SELECT to_jsonb(t) FROM (SELECT * FROM github_repos",
            );
            push_filters(&mut qb, params);
            qb.push(format!(" ORDER BY {order}"));
            qb.push(" LIMIT ").push_bind(per_page);
            qb.push(" OFFSET ").push_bind(offset);
            qb.push(") t");

            qb.build()
                .fetch_all(&self.pool)
                .await?
                .iter()
                .map(|r| r.try_get::<serde_json::Value, _>(0))
                .collect::<Result<_, _>>()?
        };

        Ok(PagedResponse { data, total, page: params.page, per_page: params.per_page })
    }

    // ── Ops log ───────────────────────────────────────────────────────────────

    async fn append_ops_log(&self, op: &str, payload: serde_json::Value, tx_id: Option<&str>) {
        crate::ops_log::append(&self.pool, op, payload, tx_id).await;
    }
}

// ── Query helpers (PG-specific) ───────────────────────────────────────────────

fn push_filters<'q>(qb: &mut QueryBuilder<'q, Postgres>, p: &'q RepoQuery) {
    qb.push(" WHERE (github_id IS NULL OR github_id NOT IN (SELECT repo_id FROM hidden_rows))");

    macro_rules! range {
        ($col:literal, $min:expr, $max:expr) => {
            if let Some(v) = $min { qb.push(concat!(" AND ", $col, " >= ")).push_bind(v); }
            if let Some(v) = $max { qb.push(concat!(" AND ", $col, " <= ")).push_bind(v); }
        };
    }

    range!("stars",           p.stars_min,           p.stars_max);
    range!("forks",           p.forks_min,           p.forks_max);
    range!("open_issues",     p.open_issues_min,     p.open_issues_max);
    range!("size",            p.size_min,            p.size_max);
    range!("stars_now",       p.stars_now_min,       p.stars_now_max);
    range!("stars_diff_6h",   p.stars_diff_6h_min,   p.stars_diff_6h_max);
    range!("stars_diff_12h",  p.stars_diff_12h_min,  p.stars_diff_12h_max);
    range!("stars_diff_24h",  p.stars_diff_24h_min,  p.stars_diff_24h_max);
    range!("stars_diff_48h",  p.stars_diff_48h_min,  p.stars_diff_48h_max);
    range!("stars_diff_5d",   p.stars_diff_5d_min,   p.stars_diff_5d_max);
    range!("stars_diff_7d",   p.stars_diff_7d_min,   p.stars_diff_7d_max);
    range!("stars_diff_10d",  p.stars_diff_10d_min,  p.stars_diff_10d_max);
    range!("stars_diff_14d",  p.stars_diff_14d_min,  p.stars_diff_14d_max);
    range!("stars_diff_20d",  p.stars_diff_20d_min,  p.stars_diff_20d_max);
    range!("stars_diff_30d",  p.stars_diff_30d_min,  p.stars_diff_30d_max);

    macro_rules! in_filter {
        ($col:literal, $opt:expr) => {
            if let Some(ref csv) = $opt {
                let vals: Vec<String> = csv
                    .split(',').map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()).collect();
                if !vals.is_empty() {
                    qb.push(concat!(" AND ", $col, " = ANY(")).push_bind(vals).push(")");
                }
            }
        };
    }

    in_filter!("language",    p.language);
    in_filter!("license",     p.license);
    in_filter!("visibility",  p.visibility);
    in_filter!("owner_login", p.owner_login);

    if let Some(v) = p.archived { qb.push(" AND archived = ").push_bind(v); }
    if let Some(v) = p.disabled { qb.push(" AND disabled = ").push_bind(v); }

    if let Some(ref csv) = p.topics {
        let vals: Vec<String> = csv
            .split(',').map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()).collect();
        if !vals.is_empty() {
            qb.push(" AND topics && ").push_bind(vals);
        }
    }

    if let Some(ref csv) = p.topics_like {
        let patterns: Vec<String> = csv
            .split(',').map(|s| format!("%{}%", s.trim())).filter(|s| s != "%%").collect();
        if !patterns.is_empty() {
            qb.push(" AND EXISTS (SELECT 1 FROM unnest(topics) t WHERE t ILIKE ANY(")
              .push_bind(patterns)
              .push("))");
        }
    }

    if let Some(v) = p.pushed_after   { qb.push(" AND pushed_at >= ").push_bind(v); }
    if let Some(v) = p.pushed_before  { qb.push(" AND pushed_at <= ").push_bind(v); }
    if let Some(v) = p.created_after  { qb.push(" AND created_at >= ").push_bind(v); }
    if let Some(v) = p.created_before { qb.push(" AND created_at <= ").push_bind(v); }

    if let Some(ref q) = p.q {
        let pat = format!("%{q}%");
        qb.push(" AND (name ILIKE ").push_bind(pat.clone())
          .push(" OR description ILIKE ").push_bind(pat)
          .push(")");
    }
}

fn validated_sort(sort: Option<&str>, allowed: &HashSet<String>) -> String {
    let parts: Vec<String> = sort
        .unwrap_or("")
        .split(',')
        .filter_map(|s| {
            let s = s.trim();
            if s.is_empty() { return None; }
            let (col, dir) = s.split_once(':').unwrap_or((s, "desc"));
            if !allowed.contains(col) { return None; }
            let dir = if dir.eq_ignore_ascii_case("asc") { "ASC" } else { "DESC" };
            Some(format!("{col} {dir}"))
        })
        .collect();

    if parts.is_empty() {
        "stars_diff_24h DESC NULLS LAST, stars DESC".to_string()
    } else {
        parts.join(", ")
    }
}
