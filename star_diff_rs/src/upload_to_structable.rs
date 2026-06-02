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
const TABLE_ID: &str = "github_repos";

// ─── Stars-diff window labels (must match main.rs windows()) ─────────────────

const DIFF_WINDOWS: &[&str] = &[
    "6h", "12h", "24h", "48h", "5d", "7d", "10d", "14d", "20d", "30d",
];

// ─── Column definitions ───────────────────────────────────────────────────────

struct ColDef {
    id: &'static str,
    title: &'static str,
    types: &'static [&'static str],
    is_group: bool,
    parent_id: Option<&'static str>,
    /// Nested JSON path inside custom_values, e.g. ["stars_diff", "6h"].
    source_path: Option<&'static [&'static str]>,
}

impl ColDef {
    const fn text(id: &'static str, title: &'static str) -> Self {
        Self { id, title, types: &["text"], is_group: false, parent_id: None, source_path: None }
    }
    const fn numeric(id: &'static str, title: &'static str) -> Self {
        Self { id, title, types: &["numeric"], is_group: false, parent_id: None, source_path: None }
    }
    const fn boolean(id: &'static str, title: &'static str) -> Self {
        Self { id, title, types: &["boolean"], is_group: false, parent_id: None, source_path: None }
    }
    const fn timestamp(id: &'static str, title: &'static str) -> Self {
        Self { id, title, types: &["timestamptz"], is_group: false, parent_id: None, source_path: None }
    }
    const fn group(id: &'static str, title: &'static str) -> Self {
        Self { id, title, types: &[], is_group: true, parent_id: None, source_path: None }
    }
}

// Static column definitions (stars_diff sub-columns are built dynamically).
static STATIC_COLS: &[ColDef] = &[
    // Identity
    ColDef::text("name",           "Repo name"),
    ColDef::text("description",    "Description"),
    ColDef::text("url",            "URL"),
    ColDef::text("homepage",       "Homepage"),
    // Metrics
    ColDef::numeric("stars",       "Stars"),
    ColDef::numeric("forks",       "Forks"),
    ColDef::numeric("open_issues", "Open issues"),
    ColDef::numeric("watchers",    "Watchers"),
    ColDef::numeric("size",        "Size (KB)"),
    ColDef::numeric("stars_now",   "Stars now"),
    // Stars diff group
    ColDef::group("stars_diff",    "Stars diff"),
    // Attributes
    ColDef::text("language",       "Language"),
    ColDef::text("license",        "License"),
    ColDef::text("visibility",     "Visibility"),
    ColDef::text("default_branch", "Default branch"),
    // Booleans
    ColDef::boolean("archived",       "Archived"),
    ColDef::boolean("disabled",       "Disabled"),
    ColDef::boolean("has_issues",     "Has issues"),
    ColDef::boolean("has_projects",   "Has projects"),
    ColDef::boolean("has_wiki",       "Has wiki"),
    ColDef::boolean("has_pages",      "Has pages"),
    ColDef::boolean("has_downloads",  "Has downloads"),
    // Timestamps
    ColDef::timestamp("pushed_at",  "Pushed at"),
    ColDef::timestamp("created_at", "Created at"),
    ColDef::timestamp("updated_at", "Updated at"),
    // Array
    ColDef { id: "topics", title: "Topics",
             types: &["array"], is_group: false, parent_id: None, source_path: None },
    // Owner group
    ColDef::group("owner",            "Owner"),
    ColDef { id: "owner_login",  title: "Login",
             types: &["text"],  is_group: false, parent_id: Some("owner"), source_path: None },
    ColDef { id: "owner_avatar", title: "Avatar",
             types: &["text"],  is_group: false, parent_id: Some("owner"), source_path: None },
    ColDef { id: "owner_url",    title: "Owner URL",
             types: &["text"],  is_group: false, parent_id: Some("owner"), source_path: None },
];

async fn upsert_column(
    client: &reqwest::Client,
    backend_url: &str,
    table_id: &str,
    id: &str,
    title: &str,
    types: &[&str],
    is_group: bool,
    parent_id: Option<&str>,
    source_path: Option<&[&str]>,
) -> Result<()> {
    let endpoint = format!(
        "{}/tables/{table_id}/custom-columns",
        backend_url.trim_end_matches('/')
    );
    let body = serde_json::json!({
        "id": id,
        "title": title,
        "types": types,
        "data_types": if types.iter().any(|t| *t == "numeric") { vec!["numeric"] } else { vec!["text"] },
        "is_group": is_group,
        "parent_ids": parent_id.map(|p| vec![p]).unwrap_or_default(),
        "source_path": source_path.map(|sp| sp.to_vec()),
    });
    let resp = client
        .post(&endpoint)
        .json(&body)
        .send()
        .await
        .context("sending column upsert")?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        bail!("column upsert {id} failed ({status}): {text}");
    }
    Ok(())
}

async fn upsert_github_columns(client: &reqwest::Client, backend_url: &str) -> Result<()> {
    info!("📋 Upserting GitHub column definitions for table '{TABLE_ID}'");

    // Static columns
    for col in STATIC_COLS {
        upsert_column(
            client, backend_url, TABLE_ID,
            col.id, col.title, col.types,
            col.is_group, col.parent_id, col.source_path,
        )
        .await
        .with_context(|| format!("upserting column '{}'", col.id))?;
    }

    // stars_diff sub-columns (one per time window)
    for window in DIFF_WINDOWS {
        let id = format!("stars_diff__{window}");
        upsert_column(
            client, backend_url, TABLE_ID,
            &id, window, &["numeric"],
            false,
            Some("stars_diff"),
            Some(&["stars_diff", window]),
        )
        .await
        .with_context(|| format!("upserting column '{id}'"))?;
    }

    info!("✅ Column definitions upserted ({} static + {} windows)",
        STATIC_COLS.len(), DIFF_WINDOWS.len());
    Ok(())
}

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

async fn ensure_table_exists(client: &reqwest::Client, backend_url: &str) -> Result<()> {
    let endpoint = format!("{}/tables", backend_url.trim_end_matches('/'));
    let resp = client
        .post(&endpoint)
        .json(&serde_json::json!({
            "id":    TABLE_ID,
            "title": "GitHub Repos",
        }))
        .send()
        .await
        .context("ensure_table_exists: POST /tables")?;

    let status = resp.status();
    // 201 Created or 200 OK are both fine; the store upserts on conflict.
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        bail!("ensure_table_exists failed ({status}): {body}");
    }
    info!("📋 Table '{TABLE_ID}' ready");
    Ok(())
}

async fn upload_batch(
    client: &reqwest::Client,
    backend_url: &str,
    batch: &[DbRepo],
) -> Result<()> {
    let endpoint = format!(
        "{}/tables/{TABLE_ID}/rows/batch-upsert",
        backend_url.trim_end_matches('/')
    );
    // The backend extracts the row id from "github_id" (i64) field automatically.
    let payload = serde_json::json!({ "rows": batch });
    let resp = client
        .post(&endpoint)
        .json(&payload)
        .send()
        .await
        .context("sending batch-upsert to backend")?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        bail!("batch-upsert failed ({status}): {body}");
    }
    Ok(())
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_yaml_repo() -> YamlRepo {
        YamlRepo {
            id: 123,
            name: "my-repo".to_string(),
            url: "https://github.com/owner/my-repo".to_string(),
            stars: 500,
            forks: 30,
            open_issues: 5,
            watchers: 500,
            size: 1024,
            stars_now: 500,
            stars_diff: HashMap::new(),
            language: Some("Rust".to_string()),
            license: Some("MIT".to_string()),
            visibility: "public".to_string(),
            default_branch: "main".to_string(),
            archived: false,
            disabled: false,
            has_issues: true,
            has_projects: false,
            has_wiki: false,
            has_pages: false,
            has_downloads: false,
            pushed_at: Some("2024-01-01T00:00:00Z".to_string()),
            created_at: Some("2020-01-01T00:00:00Z".to_string()),
            updated_at: Some("2024-01-01T00:00:00Z".to_string()),
            description: Some("A test repo".to_string()),
            homepage: None,
            topics: vec!["rust".to_string(), "cli".to_string()],
            owner_login: "owner".to_string(),
            owner_avatar: None,
            owner_url: None,
        }
    }

    // ── DbRepo::from(YamlRepo) ────────────────────────────────────────────────

    #[test]
    fn from_yaml_basic_fields() {
        let db = DbRepo::from(minimal_yaml_repo());
        assert_eq!(db.github_id, 123);
        assert_eq!(db.name, "my-repo");
        assert_eq!(db.stars, 500);
        assert_eq!(db.forks, 30);
        assert_eq!(db.open_issues, 5);
        assert_eq!(db.watchers, 500);
        assert_eq!(db.size, 1024);
        assert_eq!(db.stars_now, 500);
        assert_eq!(db.language, Some("Rust".to_string()));
        assert_eq!(db.license, Some("MIT".to_string()));
        assert_eq!(db.visibility, "public");
        assert_eq!(db.default_branch, "main");
    }

    #[test]
    fn from_yaml_boolean_fields() {
        let mut yaml = minimal_yaml_repo();
        yaml.archived = true;
        yaml.has_issues = true;
        yaml.has_wiki = false;
        let db = DbRepo::from(yaml);
        assert!(db.archived);
        assert!(db.has_issues);
        assert!(!db.has_wiki);
    }

    #[test]
    fn from_yaml_topics_preserved() {
        let db = DbRepo::from(minimal_yaml_repo());
        assert_eq!(db.topics, vec!["rust", "cli"]);
    }

    #[test]
    fn from_yaml_empty_topics() {
        let mut yaml = minimal_yaml_repo();
        yaml.topics = vec![];
        let db = DbRepo::from(yaml);
        assert!(db.topics.is_empty());
    }

    #[test]
    fn from_yaml_optional_fields_none() {
        let mut yaml = minimal_yaml_repo();
        yaml.language = None;
        yaml.license = None;
        yaml.homepage = None;
        yaml.owner_avatar = None;
        yaml.owner_url = None;
        yaml.description = None;
        let db = DbRepo::from(yaml);
        assert_eq!(db.language, None);
        assert_eq!(db.license, None);
        assert_eq!(db.homepage, None);
        assert_eq!(db.owner_avatar, None);
        assert_eq!(db.owner_url, None);
        assert_eq!(db.description, None);
    }

    #[test]
    fn from_yaml_stars_diff_empty_is_empty_json_object() {
        let db = DbRepo::from(minimal_yaml_repo());
        assert!(db.stars_diff.is_object());
        assert!(db.stars_diff.as_object().unwrap().is_empty());
    }

    #[test]
    fn from_yaml_stars_diff_none_value_becomes_json_null() {
        let mut yaml = minimal_yaml_repo();
        yaml.stars_diff.insert("7d".to_string(), None);
        let db = DbRepo::from(yaml);
        let obj = db.stars_diff.as_object().unwrap();
        assert_eq!(obj.get("7d"), Some(&serde_json::Value::Null));
    }

    #[test]
    fn from_yaml_stars_diff_some_value_becomes_json_number() {
        let mut yaml = minimal_yaml_repo();
        yaml.stars_diff.insert("30d".to_string(), Some(42));
        yaml.stars_diff.insert("7d".to_string(), None);
        let db = DbRepo::from(yaml);
        let obj = db.stars_diff.as_object().unwrap();
        assert_eq!(obj.get("30d"), Some(&serde_json::Value::from(42i64)));
        assert_eq!(obj.get("7d"), Some(&serde_json::Value::Null));
    }

    // ── load_repos ────────────────────────────────────────────────────────────

    #[test]
    fn load_repos_parses_valid_yaml() {
        let content = "\
- id: 1
  name: foo
  url: https://github.com/a/foo
  stars: 100
  forks: 10
  open_issues: 0
  watchers: 100
  size: 512
  stars_now: 100
  stars_diff: {}
  owner_login: alice
";
        let path = std::env::temp_dir().join("test_load_repos_valid.yaml");
        std::fs::write(&path, content).unwrap();
        let repos = load_repos(&path).unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].id, 1);
        assert_eq!(repos[0].name, "foo");
        assert_eq!(repos[0].owner_login, "alice");
    }

    #[test]
    fn load_repos_applies_defaults() {
        let content = "\
- id: 2
  name: bar
  url: https://github.com/b/bar
  stars: 0
  forks: 0
  open_issues: 0
  watchers: 0
  size: 0
  stars_now: 0
  stars_diff: {}
  owner_login: bob
";
        let path = std::env::temp_dir().join("test_load_repos_defaults.yaml");
        std::fs::write(&path, content).unwrap();
        let repos = load_repos(&path).unwrap();
        assert_eq!(repos[0].visibility, "public");       // default_public()
        assert_eq!(repos[0].default_branch, "main");     // default_main()
        assert!(!repos[0].archived);
        assert!(repos[0].topics.is_empty());
    }

    #[test]
    fn load_repos_skips_malformed_entry() {
        // second entry has stars as a string (not i64) — should be skipped with a warning
        let content = "\
- id: 1
  name: good
  url: https://github.com/a/good
  stars: 50
  forks: 0
  open_issues: 0
  watchers: 50
  size: 0
  stars_now: 50
  stars_diff: {}
  owner_login: alice
- id: bad_id_type
  name: bad
  url: https://github.com/a/bad
  stars: not_a_number
  forks: 0
  open_issues: 0
  watchers: 0
  size: 0
  stars_now: 0
  stars_diff: {}
  owner_login: bob
";
        let path = std::env::temp_dir().join("test_load_repos_malformed.yaml");
        std::fs::write(&path, content).unwrap();
        let repos = load_repos(&path).unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].name, "good");
    }

    #[test]
    fn load_repos_returns_error_on_missing_file() {
        let path = std::env::temp_dir().join("nonexistent_file_xyz.yaml");
        assert!(load_repos(&path).is_err());
    }

    // ── upload endpoint URL ───────────────────────────────────────────────────

    #[test]
    fn endpoint_url_strips_trailing_slash() {
        let backend_url = "http://localhost:3001/";
        let endpoint = format!("{}/tables/{TABLE_ID}/rows/batch-upsert", backend_url.trim_end_matches('/'));
        assert_eq!(endpoint, "http://localhost:3001/tables/github_repos/rows/batch-upsert");
    }

    #[test]
    fn endpoint_url_no_trailing_slash() {
        let backend_url = "http://localhost:3001";
        let endpoint = format!("{}/tables/{TABLE_ID}/rows/batch-upsert", backend_url.trim_end_matches('/'));
        assert_eq!(endpoint, "http://localhost:3001/tables/github_repos/rows/batch-upsert");
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    // load .env from cwd or any parent — silently ignored if absent
    dotenvy::dotenv().ok();

    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let backend_url = std::env::var("BACKEND_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());
    let client = reqwest::Client::new();

    // Provision table and columns before uploading data (all calls are idempotent).
    ensure_table_exists(&client, &backend_url).await?;
    upsert_github_columns(&client, &backend_url).await?;

    // load
    let path = yaml_path();
    info!("📂 Loading {}", path.display());
    let t0 = Instant::now();
    let yaml_repos = load_repos(&path)?;
    let raw_count = yaml_repos.len();
    info!("📦 {:>10?}  {} repos loaded", t0.elapsed(), raw_count);

    // Deduplicate by github_id — last entry in the file wins if the same id appears twice.
    let unique: std::collections::HashMap<i64, DbRepo> = yaml_repos
        .into_iter()
        .map(|r| (r.id, DbRepo::from(r)))
        .collect();
    let duplicate_count = raw_count - unique.len();
    if duplicate_count > 0 {
        warn!("⚠️  Skipped {} duplicate github_id entries", duplicate_count);
    }
    let db_repos: Vec<DbRepo> = unique.into_values().collect();

    // Upload rows in batches. Each run is safe to re-run: rows upsert by github_id.
    let total = db_repos.len();
    let mut uploaded = 0usize;

    for (i, chunk) in db_repos.chunks(BATCH_SIZE).enumerate() {
        let t = Instant::now();
        upload_batch(&client, &backend_url, chunk)
            .await
            .with_context(|| format!("batch {}", i + 1))?;
        uploaded += chunk.len();
        info!("🚀 {:>10?}  batch {} — {}/{} rows", t.elapsed(), i + 1, uploaded, total);
    }

    info!("✅ Upload complete — {} rows, total {:?}", total, t0.elapsed());
    Ok(())
}
