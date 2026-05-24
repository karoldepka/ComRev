use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{PgPool, Postgres, QueryBuilder, Row};
use std::{collections::HashSet, sync::Arc};

// ─── App state ────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    /// Column names fetched from information_schema at startup — drives the
    /// sort whitelist without any hard-coded list.
    pub sortable_cols: Arc<HashSet<String>>,
}

pub async fn fetch_sortable_cols(pool: &PgPool) -> anyhow::Result<HashSet<String>> {
    let cols: Vec<String> = sqlx::query_scalar(
        "SELECT column_name::text FROM information_schema.columns \
         WHERE table_schema = 'public' AND table_name = 'github_repos'",
    )
    .fetch_all(pool)
    .await?;
    Ok(cols.into_iter().collect())
}

// ─── Query params ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Default)]
pub struct RepoQuery {
    /// Comma-separated sort specs: "stars_diff_24h:desc,stars:desc"
    pub sort: Option<String>,

    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_per_page")]
    pub per_page: u32,

    // ── numeric ranges ──────────────────────────────────────────────────────
    pub stars_min:           Option<i64>,
    pub stars_max:           Option<i64>,
    pub forks_min:           Option<i64>,
    pub forks_max:           Option<i64>,
    pub open_issues_min:     Option<i64>,
    pub open_issues_max:     Option<i64>,
    pub size_min:            Option<i64>,
    pub size_max:            Option<i64>,
    pub stars_now_min:       Option<i64>,
    pub stars_now_max:       Option<i64>,

    pub stars_diff_6h_min:   Option<i64>,
    pub stars_diff_6h_max:   Option<i64>,
    pub stars_diff_12h_min:  Option<i64>,
    pub stars_diff_12h_max:  Option<i64>,
    pub stars_diff_24h_min:  Option<i64>,
    pub stars_diff_24h_max:  Option<i64>,
    pub stars_diff_48h_min:  Option<i64>,
    pub stars_diff_48h_max:  Option<i64>,
    pub stars_diff_5d_min:   Option<i64>,
    pub stars_diff_5d_max:   Option<i64>,
    pub stars_diff_7d_min:   Option<i64>,
    pub stars_diff_7d_max:   Option<i64>,
    pub stars_diff_10d_min:  Option<i64>,
    pub stars_diff_10d_max:  Option<i64>,
    pub stars_diff_14d_min:  Option<i64>,
    pub stars_diff_14d_max:  Option<i64>,
    pub stars_diff_20d_min:  Option<i64>,
    pub stars_diff_20d_max:  Option<i64>,
    pub stars_diff_30d_min:  Option<i64>,
    pub stars_diff_30d_max:  Option<i64>,

    // ── text IN filters (comma-separated → = ANY(…)) ────────────────────────
    pub language:    Option<String>,
    pub license:     Option<String>,
    pub visibility:  Option<String>,
    pub owner_login: Option<String>,

    // ── boolean filters ─────────────────────────────────────────────────────
    pub archived: Option<bool>,
    pub disabled: Option<bool>,

    // ── topics: CSV, matches repos with ANY of the given topics ─────────────
    pub topics: Option<String>,

    // ── timestamp ranges ─────────────────────────────────────────────────────
    pub pushed_after:   Option<DateTime<Utc>>,
    pub pushed_before:  Option<DateTime<Utc>>,
    pub created_after:  Option<DateTime<Utc>>,
    pub created_before: Option<DateTime<Utc>>,

    // ── full-text search on name / description ───────────────────────────────
    pub q: Option<String>,
}

fn default_page()     -> u32 { 1 }
fn default_per_page() -> u32 { 50 }

// ─── Filter builder ───────────────────────────────────────────────────────────

fn push_filters<'q>(qb: &mut QueryBuilder<'q, Postgres>, p: &'q RepoQuery) {
    qb.push(" WHERE 1=1");

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

// ─── Sort builder ─────────────────────────────────────────────────────────────

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

// ─── Response ─────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct PagedResponse {
    pub data:     Vec<JsonValue>,
    pub total:    i64,
    pub page:     u32,
    pub per_page: u32,
}

// ─── Error wrapper ────────────────────────────────────────────────────────────

pub struct ApiError(anyhow::Error);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (StatusCode::INTERNAL_SERVER_ERROR, self.0.to_string()).into_response()
    }
}

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self { Self(e.into()) }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub async fn list_repos(
    State(state): State<AppState>,
    Query(params): Query<RepoQuery>,
) -> Result<Json<PagedResponse>, ApiError> {
    let per_page = params.per_page.clamp(1, 200) as i64;
    let offset   = (params.page.max(1) - 1) as i64 * per_page;

    // COUNT — same WHERE clause, separate query
    let total: i64 = {
        let mut qb = QueryBuilder::new("SELECT COUNT(*) FROM github_repos");
        push_filters(&mut qb, &params);
        qb.build_query_scalar().fetch_one(&state.pool).await?
    };

    // DATA — to_jsonb wraps each row as a JSON object; no Rust struct needed.
    // Adding/renaming columns in Postgres is picked up automatically.
    let order = validated_sort(params.sort.as_deref(), &state.sortable_cols);
    let data: Vec<JsonValue> = {
        let mut qb = QueryBuilder::new(
            "SELECT to_jsonb(t) FROM (SELECT * FROM github_repos",
        );
        push_filters(&mut qb, &params);
        qb.push(format!(" ORDER BY {order}"));
        qb.push(" LIMIT ").push_bind(per_page);
        qb.push(" OFFSET ").push_bind(offset);
        qb.push(") t");

        qb.build()
            .fetch_all(&state.pool)
            .await?
            .iter()
            .map(|r| r.try_get::<JsonValue, _>(0))
            .collect::<Result<_, _>>()?
    };

    Ok(Json(PagedResponse { data, total, page: params.page, per_page: params.per_page }))
}
