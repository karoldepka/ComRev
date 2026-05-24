use anyhow::{bail, Context, Result};
use dotenvy;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use serde_json::Value as Json;
use serde_yaml::Value as Yaml;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

const BATCH_SIZE: usize = 500;

// ─── YAML input ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct YamlRepo {
    id: i64,
    name: String,
    url: String,
    stars: i64,
    forks: i64,
    open_issues: i64,
    watchers: i64,
    size: i64,
    stars_now: i64,
    stars_diff: HashMap<String, Option<i64>>,
    language: Option<String>,
    license: Option<String>,
    #[serde(default = "default_public")]
    visibility: String,
    #[serde(default = "default_main")]
    default_branch: String,
    #[serde(default)]
    archived: bool,
    #[serde(default)]
    disabled: bool,
    #[serde(default)]
    has_issues: bool,
    #[serde(default)]
    has_projects: bool,
    #[serde(default)]
    has_wiki: bool,
    #[serde(default)]
    has_pages: bool,
    #[serde(default)]
    has_downloads: bool,
    pushed_at: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    description: Option<String>,
    homepage: Option<String>,
    #[serde(default)]
    topics: Vec<String>,
    owner_login: String,
    owner_avatar: Option<String>,
    owner_url: Option<String>,
}

fn default_public() -> String { "public".to_string() }
fn default_main()   -> String { "main".to_string() }

// ─── DB row (serialized to JSON for PostgREST) ────────────────────────────────

#[derive(Debug, Serialize)]
struct DbRepo {
    github_id: i64,
    name: String,
    url: String,
    stars: i64,
    forks: i64,
    open_issues: i64,
    watchers: i64,
    size: i64,
    stars_now: i64,
    stars_diff: Json,           // JSONB — generated columns computed by Postgres
    language: Option<String>,
    license: Option<String>,
    visibility: String,
    default_branch: String,
    archived: bool,
    disabled: bool,
    has_issues: bool,
    has_projects: bool,
    has_wiki: bool,
    has_pages: bool,
    has_downloads: bool,
    pushed_at: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    description: Option<String>,
    homepage: Option<String>,
    topics: Vec<String>,
    owner_login: String,
    owner_avatar: Option<String>,
    owner_url: Option<String>,
}

impl From<YamlRepo> for DbRepo {
    fn from(r: YamlRepo) -> Self {
        let stars_diff: serde_json::Map<String, Json> = r.stars_diff
            .into_iter()
            .map(|(k, v)| (k, v.map(Json::from).unwrap_or(Json::Null)))
            .collect();
        Self {
            github_id: r.id,
            name: r.name,
            url: r.url,
            stars: r.stars,
            forks: r.forks,
            open_issues: r.open_issues,
            watchers: r.watchers,
            size: r.size,
            stars_now: r.stars_now,
            stars_diff: Json::Object(stars_diff),
            language: r.language,
            license: r.license,
            visibility: r.visibility,
            default_branch: r.default_branch,
            archived: r.archived,
            disabled: r.disabled,
            has_issues: r.has_issues,
            has_projects: r.has_projects,
            has_wiki: r.has_wiki,
            has_pages: r.has_pages,
            has_downloads: r.has_downloads,
            pushed_at: r.pushed_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
            description: r.description,
            homepage: r.homepage,
            topics: r.topics,
            owner_login: r.owner_login,
            owner_avatar: r.owner_avatar,
            owner_url: r.owner_url,
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn data_repo_dir() -> Result<PathBuf> {
    let cwd = std::env::current_dir()?;
    let data = cwd.join("..").join("..").join("ComRev_Data");
    Ok(data.canonicalize().unwrap_or(data))
}

fn yaml_path() -> PathBuf {
    std::env::var("YAML_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| data_repo_dir().unwrap().join("repos_diff.yaml"))
}

fn load_repos(path: &PathBuf) -> Result<Vec<YamlRepo>> {
    let s = fs::read_to_string(path)
        .with_context(|| format!("reading {}", path.display()))?;
    let raw: Vec<Yaml> = serde_yaml::from_str(&s)
        .with_context(|| "parsing YAML")?;
    let mut repos = Vec::with_capacity(raw.len());
    for item in raw {
        match serde_yaml::from_value::<YamlRepo>(item) {
            Ok(r) => repos.push(r),
            Err(e) => warn!("skipping malformed entry: {e}"),
        }
    }
    Ok(repos)
}

async fn upsert_batch(
    client: &reqwest::Client,
    url: &str,
    key: &str,
    batch: &[DbRepo],
) -> Result<()> {
    let resp = client
        .post(url)
        .header("apikey", key)
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=merge-duplicates,return=minimal")
        .json(batch)
        .send()
        .await
        .context("sending upsert request")?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        bail!("upsert failed ({status}): {body}");
    }
    Ok(())
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    // load .env from cwd or any parent — silently ignored if absent
    dotenvy::dotenv().ok();

    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // env
    let supabase_url = std::env::var("SUPABASE_URL")
        .context("SUPABASE_URL not set")?;
    let service_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .context("SUPABASE_SERVICE_ROLE_KEY not set")?;

    let endpoint = format!("{}/rest/v1/github_repos", supabase_url.trim_end_matches('/'));

    // load
    let path = yaml_path();
    info!("📂 Loading {}", path.display());
    let t0 = Instant::now();
    let yaml_repos = load_repos(&path)?;
    info!("📦 {:>10?}  {} repos loaded", t0.elapsed(), yaml_repos.len());

    let db_repos: Vec<DbRepo> = yaml_repos.into_iter().map(DbRepo::from).collect();

    // upload in batches
    let client = reqwest::Client::new();
    let total = db_repos.len();
    let mut uploaded = 0usize;

    for (i, chunk) in db_repos.chunks(BATCH_SIZE).enumerate() {
        let t = Instant::now();
        upsert_batch(&client, &endpoint, &service_key, chunk)
            .await
            .with_context(|| format!("batch {}", i + 1))?;
        uploaded += chunk.len();
        info!("🚀 {:>10?}  batch {} — {}/{} rows", t.elapsed(), i + 1, uploaded, total);
    }

    info!("✅ Upload complete — {} rows, total {:?}", total, t0.elapsed());
    Ok(())
}
