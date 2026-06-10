/// Two-file TOML database configuration.
///
/// `databases.toml`  (committed) — connection topology and non-secret credentials.
/// `databases.secrets.toml` (gitignored) — passwords only.
///
/// Both files are optional; when absent the caller falls back to env vars.
///
/// ## `databases.secrets.toml` format
///
/// Each database id from `databases.toml` gets a `[<id>]` section with `password`.
/// An optional `[extra_env]` table sets arbitrary environment variables at startup
/// (e.g. SUPABASE_URL, API keys).
///
/// `username` lives in `databases.toml`, not the secrets file — it is not sensitive
/// and keeping it non-secret makes the config easier to read and diff.
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
    driver: String, // postgres | mongodb | surrealdb | sqlite
    host: Option<String>,
    port: Option<u16>,
    dbname: Option<String>,
    /// Non-sensitive: commit openly in databases.toml.
    username: Option<String>,
    // SurrealDB extras (set as SURREAL_NS / SURREAL_DB env vars)
    namespace: Option<String>,
    database: Option<String>,
    tls: Option<bool>,
    /// Extra query-string parameters appended to the URL (e.g. "sslmode=require&channel_binding=require").
    options: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct DbSecrets {
    /// Password only — username belongs in the non-secret databases.toml.
    password: Option<String>,
}

/// Parsed secrets file: per-db passwords + optional extra env vars.
#[derive(Debug)]
struct SecretsFile {
    db_secrets: HashMap<String, DbSecrets>,
    extra_env: HashMap<String, String>,
}

fn parse_secrets(text: &str, path: &str) -> Result<SecretsFile> {
    let raw: toml::Table = toml::from_str(text).map_err(|e| anyhow::anyhow!("{path}: {e}"))?;

    let mut db_secrets: HashMap<String, DbSecrets> = HashMap::new();
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
            let password = t
                .get("password")
                .and_then(|v| v.as_str())
                .map(str::to_owned);
            db_secrets.insert(key, DbSecrets { password });
        }
    }

    Ok(SecretsFile {
        db_secrets,
        extra_env,
    })
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Read `databases.toml` and `databases.secrets.toml`, set any env vars declared
/// in `[extra_env]` and SurrealDB-specific vars, and return `(id, url)` pairs per
/// configured database. Returns `Ok(None)` if `databases.toml` is absent.
pub fn load() -> Result<Option<Vec<(String, String)>>> {
    let config_path =
        std::env::var("DATABASES_TOML").unwrap_or_else(|_| "databases.toml".to_string());
    let secrets_path = std::env::var("DATABASES_SECRETS_TOML")
        .unwrap_or_else(|_| "databases.secrets.toml".to_string());

    let config_text = match std::fs::read_to_string(&config_path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };

    let config: DatabasesFile =
        toml::from_str(&config_text).map_err(|e| anyhow::anyhow!("{config_path}: {e}"))?;

    if config.database.is_empty() {
        tracing::warn!(
            path = config_path,
            "databases.toml found but contains no [[database]] entries — falling back to env vars"
        );
        return Ok(None);
    }

    let secrets = match std::fs::read_to_string(&secrets_path) {
        Ok(t) => parse_secrets(&t, &secrets_path)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => SecretsFile {
            db_secrets: HashMap::new(),
            extra_env: HashMap::new(),
        },
        Err(e) => return Err(e.into()),
    };

    // Apply extra env vars (e.g. SUPABASE_URL, API keys) before anything else.
    for (k, v) in &secrets.extra_env {
        // Only set if not already present so explicit env vars take precedence.
        if std::env::var(k).is_err() {
            // Safety: single-threaded startup, no other threads reading these yet.
            unsafe { std::env::set_var(k, v) }
        }
    }
    if !secrets.extra_env.is_empty() {
        let keys: Vec<&str> = secrets.extra_env.keys().map(String::as_str).collect();
        tracing::info!(
            count = secrets.extra_env.len(),
            ?keys,
            "db_config: extra_env vars applied"
        );
    }

    let entries: Vec<(String, String)> = config
        .database
        .iter()
        .map(|entry| {
            let password = secrets
                .db_secrets
                .get(&entry.id)
                .and_then(|s| s.password.as_deref());
            let url = build_url(entry, password)?;
            // SurrealDB credentials travel via env vars, not the URL.
            if entry.driver == "surrealdb" {
                set_surreal_env(entry, password);
            }
            log_entry(entry, password, &url);
            Ok((entry.id.clone(), url))
        })
        .collect::<Result<_>>()?;

    Ok(Some(entries))
}

fn mask(s: &str) -> String {
    if s.is_empty() {
        return "<empty>".into();
    }
    let chars: Vec<char> = s.chars().collect();
    let show = 3.min(chars.len());
    let tail: String = chars[chars.len() - show..].iter().collect();
    format!("***{tail}")
}

fn log_entry(entry: &DbEntry, password: Option<&str>, url: &str) {
    let host = entry.host.as_deref().unwrap_or("localhost");
    let port = entry.port.map(|p| format!(":{p}")).unwrap_or_default();
    let dbname = entry.dbname.as_deref().unwrap_or("-");
    let user = entry.username.as_deref().unwrap_or("<none>");
    let pass = password
        .map(|p| {
            if p.is_empty() {
                "<empty>".into()
            } else {
                mask(p)
            }
        })
        .unwrap_or_else(|| "<none>".into());

    // Only replace non-empty passwords — str::replace("", x) corrupts every char boundary.
    let display_url = match password {
        Some(pw) if !pw.is_empty() => url.replace(pw, &mask(pw)),
        _ => url.to_owned(),
    };

    tracing::info!(
        id     = entry.id,
        driver = entry.driver,
        host   = %format!("{host}{port}"),
        db     = dbname,
        user   = user,
        pass   = %pass,
        url    = display_url,
        "db_config: loaded database entry",
    );
}

fn build_url(entry: &DbEntry, password: Option<&str>) -> Result<String> {
    let host = entry.host.as_deref().unwrap_or("localhost");
    let userinfo = match (&entry.username, password) {
        (Some(u), Some(p)) if !p.is_empty() => format!("{}:{}@", urlencoded(u), urlencoded(p)),
        (Some(u), _) => format!("{}@", urlencoded(u)),
        _ => String::new(),
    };

    let base = match entry.driver.as_str() {
        "postgres" | "postgresql" => {
            let port = entry.port.unwrap_or(5432);
            let db = entry.dbname.as_deref().unwrap_or("structable");
            format!("postgresql://{userinfo}{host}:{port}/{db}")
        }
        "mongodb" => {
            let port = entry.port.unwrap_or(27017);
            let db = entry.dbname.as_deref().unwrap_or("structable");
            format!("mongodb://{userinfo}{host}:{port}/{db}")
        }
        "surrealdb" => {
            let scheme = if entry.tls.unwrap_or(false) {
                "wss"
            } else {
                "ws"
            };
            // Credentials travel via SURREAL_USER/PASS env vars (set in load()); don't embed in URL.
            // Only append port if explicitly set — cloud instances use the default WSS port.
            match entry.port {
                Some(p) => format!("{scheme}://{host}:{p}"),
                None => format!("{scheme}://{host}"),
            }
        }
        "sqlite" => {
            let path = entry.dbname.as_deref().unwrap_or("structable.db");
            format!("sqlite://{path}")
        }
        other => anyhow::bail!(
            "databases.toml: unknown driver '{other}' for id '{}'",
            entry.id
        ),
    };

    let url = match &entry.options {
        Some(opts) if !opts.is_empty() => format!("{base}?{opts}"),
        _ => base,
    };

    Ok(url)
}

/// Set SurrealDB-specific env vars so the store's connect() picks them up.
fn set_surreal_env(entry: &DbEntry, password: Option<&str>) {
    let set = |key: &str, val: &str| {
        if std::env::var(key).is_err() {
            unsafe { std::env::set_var(key, val) }
        }
    };
    if let Some(u) = &entry.username {
        set("SURREAL_USER", u);
    }
    if let Some(p) = password {
        set("SURREAL_PASS", p);
    }
    if let Some(ns) = &entry.namespace {
        set("SURREAL_NS", ns);
    }
    if let Some(db) = &entry.database {
        set("SURREAL_DB", db);
    }
}

/// Percent-encode characters that are not safe in the userinfo segment of a URL.
/// `%` is encoded first to prevent double-encoding existing sequences.
fn urlencoded(s: &str) -> String {
    s.chars()
        .flat_map(|c| match c {
            '%' => vec!['%', '2', '5'], // must come before other encodings
            ':' => vec!['%', '3', 'A'],
            '@' => vec!['%', '4', '0'],
            '/' => vec!['%', '2', 'F'],
            '#' => vec!['%', '2', '3'],
            '?' => vec!['%', '3', 'F'],
            ' ' => vec!['%', '2', '0'],
            _ => vec![c],
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
            username: None,
            namespace: None,
            database: None,
            tls: None,
            options: None,
        }
    }

    fn entry_with_user(driver: &str, user: &str) -> DbEntry {
        DbEntry {
            username: Some(user.into()),
            ..entry(driver)
        }
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
    fn urlencoded_percent_sign() {
        // A literal % in a password must become %25 to avoid corrupting existing %XX sequences.
        assert_eq!(urlencoded("p%ss"), "p%25ss");
    }

    #[test]
    fn urlencoded_hash_and_question() {
        assert_eq!(urlencoded("pass#1?x"), "pass%231%3Fx");
    }

    #[test]
    fn urlencoded_space() {
        assert_eq!(urlencoded("a b"), "a%20b");
    }

    #[test]
    fn urlencoded_special_password() {
        // Passwords with : and @ must be safe to embed in a URL.
        assert_eq!(urlencoded("p@ss:w0rd"), "p%40ss%3Aw0rd");
    }

    // ── mask ──────────────────────────────────────────────────────────────────

    #[test]
    fn mask_shows_last_three_chars() {
        assert_eq!(mask("supersecret"), "***ret");
    }

    #[test]
    fn mask_short_string() {
        assert_eq!(mask("ab"), "***ab");
    }

    #[test]
    fn mask_empty_string() {
        assert_eq!(mask(""), "<empty>");
    }

    #[test]
    fn mask_unicode() {
        // Unicode char is multi-byte; mask must not panic on byte boundaries.
        assert_eq!(mask("passé"), "***ssé");
    }

    // ── display_url: empty password must not corrupt URL ─────────────────────

    #[test]
    fn empty_password_does_not_corrupt_url() {
        // str::replace("", x) inserts x between every character — guard against it.
        let e = entry_with_user("postgres", "u");
        let url = build_url(&e, Some("")).unwrap();
        assert_eq!(url, "postgresql://u@localhost:5432/structable");
    }

    // ── build_url: postgres ───────────────────────────────────────────────────

    #[test]
    fn postgres_with_creds_and_defaults() {
        let url = build_url(&entry_with_user("postgres", "u"), Some("p")).unwrap();
        assert_eq!(url, "postgresql://u:p@localhost:5432/structable");
    }

    #[test]
    fn postgres_explicit_host_port_db() {
        let e = DbEntry {
            host: Some("db.example.com".into()),
            port: Some(5433),
            dbname: Some("mydb".into()),
            ..entry_with_user("postgres", "u")
        };
        let url = build_url(&e, Some("p")).unwrap();
        assert_eq!(url, "postgresql://u:p@db.example.com:5433/mydb");
    }

    #[test]
    fn postgres_no_creds() {
        let url = build_url(&entry("postgres"), None).unwrap();
        assert_eq!(url, "postgresql://localhost:5432/structable");
    }

    #[test]
    fn postgres_with_options() {
        let e = DbEntry {
            options: Some("sslmode=require&channel_binding=require".into()),
            ..entry_with_user("postgres", "u")
        };
        let url = build_url(&e, Some("p")).unwrap();
        assert!(
            url.ends_with("?sslmode=require&channel_binding=require"),
            "{url}"
        );
    }

    #[test]
    fn postgres_username_only() {
        let url = build_url(&entry_with_user("postgres", "user"), None).unwrap();
        assert!(url.starts_with("postgresql://user@"), "{url}");
    }

    #[test]
    fn postgres_password_with_special_chars() {
        let url = build_url(
            &entry_with_user("postgres", "pg.project"),
            Some("p@ss:word"),
        )
        .unwrap();
        assert!(url.contains("pg.project:p%40ss%3Aword@"), "{url}");
    }

    #[test]
    fn postgres_password_with_percent_sign() {
        let url = build_url(&entry_with_user("postgres", "u"), Some("p%ss%word")).unwrap();
        assert!(url.contains(":p%25ss%25word@"), "{url}");
    }

    // ── build_url: mongodb ────────────────────────────────────────────────────

    #[test]
    fn mongodb_defaults() {
        let url = build_url(&entry_with_user("mongodb", "u"), Some("p")).unwrap();
        assert_eq!(url, "mongodb://u:p@localhost:27017/structable");
    }

    #[test]
    fn mongodb_explicit_db() {
        let e = DbEntry {
            dbname: Some("mydb".into()),
            port: Some(27018),
            ..entry_with_user("mongodb", "u")
        };
        let url = build_url(&e, Some("p")).unwrap();
        assert_eq!(url, "mongodb://u:p@localhost:27018/mydb");
    }

    // ── build_url: surrealdb ──────────────────────────────────────────────────

    #[test]
    fn surrealdb_no_creds_in_url() {
        // Credentials are set via env vars by set_surreal_env, NOT embedded in the URL.
        let url = build_url(&entry_with_user("surrealdb", "admin"), Some("secret")).unwrap();
        assert!(
            !url.contains("admin"),
            "credentials must not appear in SurrealDB URL: {url}"
        );
        assert!(
            !url.contains("secret"),
            "credentials must not appear in SurrealDB URL: {url}"
        );
    }

    #[test]
    fn surrealdb_ws_by_default() {
        let url = build_url(&entry("surrealdb"), None).unwrap();
        assert!(url.starts_with("ws://"), "{url}");
    }

    #[test]
    fn surrealdb_wss_when_tls() {
        let e = DbEntry {
            tls: Some(true),
            ..entry("surrealdb")
        };
        let url = build_url(&e, None).unwrap();
        assert!(url.starts_with("wss://"), "{url}");
    }

    #[test]
    fn surrealdb_no_port_when_not_specified() {
        let e = DbEntry {
            host: Some("cloud.surreal.cloud".into()),
            tls: Some(true),
            ..entry("surrealdb")
        };
        let url = build_url(&e, None).unwrap();
        assert_eq!(url, "wss://cloud.surreal.cloud");
    }

    #[test]
    fn surrealdb_local_with_explicit_port() {
        let e = DbEntry {
            host: Some("localhost".into()),
            port: Some(8000),
            tls: Some(false),
            ..entry("surrealdb")
        };
        let url = build_url(&e, None).unwrap();
        assert_eq!(url, "ws://localhost:8000");
    }

    #[test]
    fn surrealdb_host_and_explicit_port() {
        let e = DbEntry {
            host: Some("surreal.example.com".into()),
            port: Some(443),
            tls: Some(true),
            ..entry("surrealdb")
        };
        let url = build_url(&e, None).unwrap();
        assert_eq!(url, "wss://surreal.example.com:443");
    }

    // ── build_url: sqlite ─────────────────────────────────────────────────────

    #[test]
    fn sqlite_default_path() {
        let url = build_url(&entry("sqlite"), None).unwrap();
        assert_eq!(url, "sqlite://structable.db");
    }

    #[test]
    fn sqlite_explicit_path() {
        let e = DbEntry {
            dbname: Some("/data/app.db".into()),
            ..entry("sqlite")
        };
        let url = build_url(&e, None).unwrap();
        assert_eq!(url, "sqlite:///data/app.db");
    }

    // ── build_url: unknown driver ─────────────────────────────────────────────

    #[test]
    fn unknown_driver_returns_error() {
        let err = build_url(&entry("oracle"), None).unwrap_err();
        assert!(err.to_string().contains("unknown driver"), "{err}");
    }

    // ── parse_secrets ─────────────────────────────────────────────────────────

    #[test]
    fn parse_secrets_db_password_only() {
        let toml = r#"
[pg-main]
password = "secret"
"#;
        let s = parse_secrets(toml, "test").unwrap();
        assert_eq!(s.db_secrets["pg-main"].password.as_deref(), Some("secret"));
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
        assert!(s.db_secrets.is_empty());
    }

    #[test]
    fn parse_secrets_mixed() {
        let toml = r#"
[pg-main]
password = "p"

[extra_env]
FOO = "bar"
"#;
        let s = parse_secrets(toml, "test").unwrap();
        assert_eq!(s.db_secrets["pg-main"].password.as_deref(), Some("p"));
        assert_eq!(s.extra_env["FOO"], "bar");
    }

    #[test]
    fn parse_secrets_empty() {
        let s = parse_secrets("", "test").unwrap();
        assert!(s.db_secrets.is_empty());
        assert!(s.extra_env.is_empty());
    }

    #[test]
    fn parse_secrets_invalid_toml_returns_error() {
        let err = parse_secrets("this is not toml ]]", "test.toml").unwrap_err();
        assert!(err.to_string().contains("test.toml"), "{err}");
    }
}
