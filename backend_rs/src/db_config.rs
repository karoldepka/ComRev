/// Two-file TOML database configuration.
///
/// `databases.toml`  (committed) — connection topology, no credentials.
/// `databases.secrets.toml` (gitignored) — credentials + extra env vars.
///
/// Both files are optional; when absent the caller falls back to env vars.
///
/// ## `databases.secrets.toml` format
///
/// Each database id from `databases.toml` gets a `[<id>]` section with
/// `username` and `password`. An optional `[extra_env]` table sets arbitrary
/// environment variables at startup (e.g. SUPABASE_URL, API keys).
use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;

// ── Config file shapes ────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct DatabasesFile {
    #[serde(default)]
    database: Vec<DbEntry>,
}

#[derive(Deserialize)]
struct DbEntry {
    id: String,
    driver: String,       // postgres | mongodb | surrealdb | couchdb | sqlite
    host: Option<String>,
    port: Option<u16>,
    dbname: Option<String>,
    // SurrealDB extras (set as SURREAL_NS / SURREAL_DB env vars)
    namespace: Option<String>,
    database: Option<String>,
    tls: Option<bool>,
    /// Extra query-string parameters appended to the URL (e.g. "sslmode=require&channel_binding=require").
    options: Option<String>,
}

#[derive(Deserialize, Default)]
struct DbCredentials {
    username: Option<String>,
    password: Option<String>,
}

/// Parsed secrets file: per-db credentials + optional extra env vars.
struct SecretsFile {
    db_creds: HashMap<String, DbCredentials>,
    extra_env: HashMap<String, String>,
}

fn parse_secrets(text: &str, path: &str) -> Result<SecretsFile> {
    let raw: toml::Table = toml::from_str(text)
        .map_err(|e| anyhow::anyhow!("{path}: {e}"))?;

    let mut db_creds: HashMap<String, DbCredentials> = HashMap::new();
    let mut extra_env: HashMap<String, String> = HashMap::new();

    for (key, val) in raw {
        if key == "extra_env" {
            if let toml::Value::Table(t) = val {
                for (k, v) in t {
                    if let toml::Value::String(s) = v {
                        extra_env.insert(k, s);
                    }
                }
            }
        } else if let toml::Value::Table(t) = val {
            let username = t.get("username").and_then(|v| v.as_str()).map(str::to_owned);
            let password = t.get("password").and_then(|v| v.as_str()).map(str::to_owned);
            db_creds.insert(key, DbCredentials { username, password });
        }
    }

    Ok(SecretsFile { db_creds, extra_env })
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Read `databases.toml` and `databases.secrets.toml`, set any env vars declared
/// in `[extra_env]` and SurrealDB-specific vars, and return one connection URL per
/// configured database. Returns `Ok(None)` if `databases.toml` is absent.
pub fn load() -> Result<Option<Vec<String>>> {
    let config_path = std::env::var("DATABASES_TOML")
        .unwrap_or_else(|_| "databases.toml".to_string());
    let secrets_path = std::env::var("DATABASES_SECRETS_TOML")
        .unwrap_or_else(|_| "databases.secrets.toml".to_string());

    let config_text = match std::fs::read_to_string(&config_path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };

    let config: DatabasesFile = toml::from_str(&config_text)
        .map_err(|e| anyhow::anyhow!("{config_path}: {e}"))?;

    if config.database.is_empty() {
        return Ok(None);
    }

    let secrets = match std::fs::read_to_string(&secrets_path) {
        Ok(t) => parse_secrets(&t, &secrets_path)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => SecretsFile {
            db_creds: HashMap::new(),
            extra_env: HashMap::new(),
        },
        Err(e) => return Err(e.into()),
    };

    // Apply extra env vars (e.g. SUPABASE_URL, API keys) before anything else.
    for (k, v) in &secrets.extra_env {
        // Only set if not already present so explicit env vars take precedence.
        if std::env::var(k).is_err() {
            // Safety: single-threaded startup, no other threads reading these yet.
            unsafe { std::env::set_var(k, v); }
        }
    }

    let urls: Vec<String> = config
        .database
        .iter()
        .map(|entry| {
            let default_creds = DbCredentials::default();
            let creds = secrets.db_creds.get(&entry.id).unwrap_or(&default_creds);
            let url = build_url(entry, creds, &secrets.db_creds)?;
            log_entry(entry, creds, &url);
            Ok(url)
        })
        .collect::<Result<_>>()?;

    if !secrets.extra_env.is_empty() {
        eprintln!("[db_config] extra_env: {} var(s) set", secrets.extra_env.len());
        for k in secrets.extra_env.keys() {
            eprintln!("  {k}=<set>");
        }
    }

    Ok(Some(urls))
}

fn mask(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let show = 3.min(chars.len());
    format!("***{}", &s[s.len() - chars[chars.len() - show..].iter().map(|c| c.len_utf8()).sum::<usize>()..])
}

fn log_entry(entry: &DbEntry, creds: &DbCredentials, url: &str) {
    let host    = entry.host.as_deref().unwrap_or("localhost");
    let port    = entry.port.map(|p| format!(":{p}")).unwrap_or_default();
    let dbname  = entry.dbname.as_deref().unwrap_or("-");
    let user    = creds.username.as_deref().unwrap_or("<none>");
    let pass    = creds.password.as_deref()
        .map(|p| if p.is_empty() { "<empty>".into() } else { mask(p) })
        .unwrap_or_else(|| "<none>".into());

    // Mask password in the URL for display.
    let display_url = if let Some(pw) = &creds.password {
        url.replace(pw.as_str(), &mask(pw))
    } else {
        url.to_owned()
    };

    eprintln!(
        "[db_config] [{id}] driver={driver}  host={host}{port}  db={dbname}  user={user}  pass={pass}",
        id     = entry.id,
        driver = entry.driver,
    );
    eprintln!("             url: {display_url}");
}

fn build_url(entry: &DbEntry, creds: &DbCredentials, _all: &HashMap<String, DbCredentials>) -> Result<String> {
    let host = entry.host.as_deref().unwrap_or("localhost");
    let userinfo = match (&creds.username, &creds.password) {
        (Some(u), Some(p)) => format!("{}:{}@", urlencoded(u), urlencoded(p)),
        (Some(u), None)    => format!("{}@", urlencoded(u)),
        _                  => String::new(),
    };

    let base = match entry.driver.as_str() {
        "postgres" | "postgresql" => {
            let port = entry.port.unwrap_or(5432);
            let db   = entry.dbname.as_deref().unwrap_or("structable");
            format!("postgresql://{userinfo}{host}:{port}/{db}")
        }
        "mongodb" => {
            let port = entry.port.unwrap_or(27017);
            let db   = entry.dbname.as_deref().unwrap_or("structable");
            format!("mongodb://{userinfo}{host}:{port}/{db}")
        }
        "surrealdb" => {
            let scheme = if entry.tls.unwrap_or(false) { "wss" } else { "ws" };
            // Credentials are set as SURREAL_USER/PASS env vars below; don't embed in URL.
            // Namespace/database are set as SURREAL_NS/SURREAL_DB env vars.
            set_surreal_env(entry, creds);
            // Only append port if explicitly set — cloud instances use the default WSS port.
            match entry.port {
                Some(p) => format!("{scheme}://{host}:{p}"),
                None    => format!("{scheme}://{host}"),
            }
        }
        "couchdb" => {
            let port   = entry.port.unwrap_or(5984);
            let scheme = if entry.tls.unwrap_or(false) { "https" } else { "http" };
            format!("{scheme}://{userinfo}{host}:{port}")
        }
        "sqlite" => {
            let path = entry.dbname.as_deref().unwrap_or("structable.db");
            format!("sqlite://{path}")
        }
        other => anyhow::bail!("databases.toml: unknown driver '{other}' for id '{}'", entry.id),
    };

    let url = match &entry.options {
        Some(opts) if !opts.is_empty() => format!("{base}?{opts}"),
        _ => base,
    };

    Ok(url)
}

/// Set SurrealDB-specific env vars so the store's connect() picks them up.
fn set_surreal_env(entry: &DbEntry, creds: &DbCredentials) {
    let set = |key: &str, val: &str| {
        if std::env::var(key).is_err() {
            unsafe { std::env::set_var(key, val); }
        }
    };
    if let Some(u) = &creds.username { set("SURREAL_USER", u); }
    if let Some(p) = &creds.password { set("SURREAL_PASS", p); }
    if let Some(ns) = &entry.namespace { set("SURREAL_NS", ns); }
    if let Some(db) = &entry.database  { set("SURREAL_DB", db); }
}

fn urlencoded(s: &str) -> String {
    s.chars()
        .flat_map(|c| match c {
            ':' => vec!['%', '3', 'A'],
            '@' => vec!['%', '4', '0'],
            '/' => vec!['%', '2', 'F'],
            _   => vec![c],
        })
        .collect()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(driver: &str) -> DbEntry {
        DbEntry {
            id: "test".into(),
            driver: driver.into(),
            host: None,
            port: None,
            dbname: None,
            namespace: None,
            database: None,
            tls: None,
            options: None,
        }
    }

    fn creds(u: &str, p: &str) -> DbCredentials {
        DbCredentials { username: Some(u.into()), password: Some(p.into()) }
    }

    fn no_creds() -> DbCredentials {
        DbCredentials::default()
    }

    // ── urlencoded ────────────────────────────────────────────────────────────

    #[test]
    fn urlencoded_plain() {
        assert_eq!(urlencoded("postgres"), "postgres");
    }

    #[test]
    fn urlencoded_colon() {
        assert_eq!(urlencoded("user:pass"), "user%3Apass");
    }

    #[test]
    fn urlencoded_at_sign() {
        assert_eq!(urlencoded("user@host"), "user%40host");
    }

    #[test]
    fn urlencoded_slash() {
        assert_eq!(urlencoded("a/b"), "a%2Fb");
    }

    #[test]
    fn urlencoded_special_password() {
        // Passwords with : and @ must be safe to embed in a URL
        assert_eq!(urlencoded("p@ss:w0rd"), "p%40ss%3Aw0rd");
    }

    // ── build_url: postgres ───────────────────────────────────────────────────

    #[test]
    fn postgres_with_creds_and_defaults() {
        let url = build_url(&entry("postgres"), &creds("u", "p"), &HashMap::new()).unwrap();
        assert_eq!(url, "postgresql://u:p@localhost:5432/structable");
    }

    #[test]
    fn postgres_explicit_host_port_db() {
        let e = DbEntry { host: Some("db.example.com".into()), port: Some(5433),
                          dbname: Some("mydb".into()), ..entry("postgres") };
        let url = build_url(&e, &creds("u", "p"), &HashMap::new()).unwrap();
        assert_eq!(url, "postgresql://u:p@db.example.com:5433/mydb");
    }

    #[test]
    fn postgres_no_creds() {
        let url = build_url(&entry("postgres"), &no_creds(), &HashMap::new()).unwrap();
        assert_eq!(url, "postgresql://localhost:5432/structable");
    }

    #[test]
    fn postgres_with_options() {
        let e = DbEntry { options: Some("sslmode=require&channel_binding=require".into()), ..entry("postgres") };
        let url = build_url(&e, &creds("u", "p"), &HashMap::new()).unwrap();
        assert!(url.ends_with("?sslmode=require&channel_binding=require"), "{url}");
    }

    #[test]
    fn postgres_username_only() {
        let c = DbCredentials { username: Some("user".into()), password: None };
        let url = build_url(&entry("postgres"), &c, &HashMap::new()).unwrap();
        assert!(url.starts_with("postgresql://user@"), "{url}");
    }

    #[test]
    fn postgres_password_with_special_chars() {
        let url = build_url(&entry("postgres"), &creds("pg.project", "p@ss:word"), &HashMap::new()).unwrap();
        assert!(url.contains("pg.project:p%40ss%3Aword@"), "{url}");
    }

    // ── build_url: mongodb ────────────────────────────────────────────────────

    #[test]
    fn mongodb_defaults() {
        let url = build_url(&entry("mongodb"), &creds("u", "p"), &HashMap::new()).unwrap();
        assert_eq!(url, "mongodb://u:p@localhost:27017/structable");
    }

    #[test]
    fn mongodb_explicit_db() {
        let e = DbEntry { dbname: Some("mydb".into()), port: Some(27018), ..entry("mongodb") };
        let url = build_url(&e, &creds("u", "p"), &HashMap::new()).unwrap();
        assert_eq!(url, "mongodb://u:p@localhost:27018/mydb");
    }

    // ── build_url: surrealdb ──────────────────────────────────────────────────

    #[test]
    fn surrealdb_no_creds_in_url() {
        // Credentials are set via env vars by set_surreal_env, NOT embedded in the URL.
        let url = build_url(&entry("surrealdb"), &creds("admin", "secret"), &HashMap::new()).unwrap();
        assert!(!url.contains("admin"), "credentials must not appear in SurrealDB URL: {url}");
        assert!(!url.contains("secret"), "credentials must not appear in SurrealDB URL: {url}");
    }

    #[test]
    fn surrealdb_ws_by_default() {
        let url = build_url(&entry("surrealdb"), &no_creds(), &HashMap::new()).unwrap();
        assert!(url.starts_with("ws://"), "{url}");
    }

    #[test]
    fn surrealdb_wss_when_tls() {
        let e = DbEntry { tls: Some(true), ..entry("surrealdb") };
        let url = build_url(&e, &no_creds(), &HashMap::new()).unwrap();
        assert!(url.starts_with("wss://"), "{url}");
    }

    #[test]
    fn surrealdb_no_port_when_not_specified() {
        let e = DbEntry { host: Some("cloud.surreal.cloud".into()), tls: Some(true), ..entry("surrealdb") };
        let url = build_url(&e, &no_creds(), &HashMap::new()).unwrap();
        assert_eq!(url, "wss://cloud.surreal.cloud");
    }

    #[test]
    fn surrealdb_local_with_explicit_port() {
        let e = DbEntry { host: Some("localhost".into()), port: Some(8000), tls: Some(false), ..entry("surrealdb") };
        let url = build_url(&e, &no_creds(), &HashMap::new()).unwrap();
        assert_eq!(url, "ws://localhost:8000");
    }

    #[test]
    fn surrealdb_host_and_explicit_port() {
        let e = DbEntry { host: Some("surreal.example.com".into()), port: Some(443), tls: Some(true), ..entry("surrealdb") };
        let url = build_url(&e, &no_creds(), &HashMap::new()).unwrap();
        assert_eq!(url, "wss://surreal.example.com:443");
    }

    // ── build_url: couchdb ────────────────────────────────────────────────────

    #[test]
    fn couchdb_http_default() {
        let url = build_url(&entry("couchdb"), &creds("u", "p"), &HashMap::new()).unwrap();
        assert_eq!(url, "http://u:p@localhost:5984");
    }

    #[test]
    fn couchdb_https_when_tls() {
        let e = DbEntry { tls: Some(true), ..entry("couchdb") };
        let url = build_url(&e, &creds("u", "p"), &HashMap::new()).unwrap();
        assert!(url.starts_with("https://"), "{url}");
    }

    // ── build_url: sqlite ─────────────────────────────────────────────────────

    #[test]
    fn sqlite_default_path() {
        let url = build_url(&entry("sqlite"), &no_creds(), &HashMap::new()).unwrap();
        assert_eq!(url, "sqlite://structable.db");
    }

    #[test]
    fn sqlite_explicit_path() {
        let e = DbEntry { dbname: Some("/data/app.db".into()), ..entry("sqlite") };
        let url = build_url(&e, &no_creds(), &HashMap::new()).unwrap();
        assert_eq!(url, "sqlite:///data/app.db");
    }

    // ── build_url: unknown driver ─────────────────────────────────────────────

    #[test]
    fn unknown_driver_returns_error() {
        let err = build_url(&entry("oracle"), &no_creds(), &HashMap::new()).unwrap_err();
        assert!(err.to_string().contains("unknown driver"), "{err}");
    }

    // ── parse_secrets ─────────────────────────────────────────────────────────

    #[test]
    fn parse_secrets_db_credentials() {
        let toml = r#"
[pg-main]
username = "postgres"
password = "secret"
"#;
        let s = parse_secrets(toml, "test").unwrap();
        assert_eq!(s.db_creds["pg-main"].username.as_deref(), Some("postgres"));
        assert_eq!(s.db_creds["pg-main"].password.as_deref(), Some("secret"));
        assert!(s.extra_env.is_empty());
    }

    #[test]
    fn parse_secrets_extra_env() {
        let toml = r#"
[extra_env]
SUPABASE_URL = "https://example.supabase.co"
MY_KEY = "abc123"
"#;
        let s = parse_secrets(toml, "test").unwrap();
        assert_eq!(s.extra_env["SUPABASE_URL"], "https://example.supabase.co");
        assert_eq!(s.extra_env["MY_KEY"], "abc123");
        assert!(s.db_creds.is_empty());
    }

    #[test]
    fn parse_secrets_mixed() {
        let toml = r#"
[pg-main]
username = "u"
password = "p"

[extra_env]
FOO = "bar"
"#;
        let s = parse_secrets(toml, "test").unwrap();
        assert_eq!(s.db_creds["pg-main"].username.as_deref(), Some("u"));
        assert_eq!(s.extra_env["FOO"], "bar");
    }

    #[test]
    fn parse_secrets_empty() {
        let s = parse_secrets("", "test").unwrap();
        assert!(s.db_creds.is_empty());
        assert!(s.extra_env.is_empty());
    }

    #[test]
    fn parse_secrets_username_only() {
        let toml = r#"
[db]
username = "user"
"#;
        let s = parse_secrets(toml, "test").unwrap();
        assert_eq!(s.db_creds["db"].username.as_deref(), Some("user"));
        assert!(s.db_creds["db"].password.is_none());
    }

    #[test]
    fn parse_secrets_invalid_toml_returns_error() {
        let err = parse_secrets("this is not toml ]]", "test.toml").unwrap_err();
        assert!(err.to_string().contains("test.toml"), "{err}");
    }
}
