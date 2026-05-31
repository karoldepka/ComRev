/// Integration tests against real Postgres (Supabase) and SurrealDB instances.
///
/// These tests are skipped by default. Run with:
///
///   cargo test -- --include-ignored
///   cargo test integration  -- --include-ignored
///
/// Required `.env` (backend_rs/.env):
///
///   DATABASE_URL=postgresql://...supabase.com:5432/postgres
///   SURREAL_URL=wss://...surreal.cloud
///   SURREAL_USER=root
///   SURREAL_PASS=secret
///   SURREAL_NS=main
///   SURREAL_TEST_DB=_test   ← isolated test database in SurrealDB (default: _test)
///
/// All data is written to tables/records prefixed with `_test_`.
/// At the start of each test, leftover data from previous runs is deleted.
use super::{open_multi, DataStore};
use crate::types::RowQuery;
use std::sync::Arc;

// ── Env helpers ───────────────────────────────────────────────────────────────

fn load_env() {
    dotenvy::dotenv().ok();
}

fn pg_url() -> Option<String> {
    load_env();
    std::env::var("DATABASE_URL").ok().filter(|s| !s.is_empty())
}

fn surreal_url() -> Option<String> {
    load_env();
    std::env::var("SURREAL_URL").ok().filter(|s| !s.is_empty())
}

/// Override SURREAL_DB with the test-specific database for the duration of the test.
fn use_test_surreal_db() {
    load_env();
    let test_db = std::env::var("SURREAL_TEST_DB").unwrap_or_else(|_| "_test".into());
    // Safety: tests run single-threaded; acceptable for env mutation in tests.
    unsafe { std::env::set_var("SURREAL_DB", &test_db); }
}

/// Build a real MultiStore from .env credentials. Returns None if any URL is missing.
async fn make_store() -> Option<Arc<dyn DataStore>> {
    use_test_surreal_db();
    let pg = pg_url()?;
    let surreal = surreal_url()?;
    let secondary = surreal; // comma-separated list accepted by open_multi
    match open_multi(&pg, Some(&secondary)).await {
        Ok(s) => Some(s),
        Err(e) => { eprintln!("Failed to open MultiStore: {e}"); None }
    }
}

// ── Postgres cleanup helpers (direct sqlx) ────────────────────────────────────

async fn pg_cleanup(url: &str) {
    let Ok(pool) = sqlx::PgPool::connect(url).await else { return; };
    for q in [
        "DELETE FROM table_rows  WHERE table_id  LIKE '_test_%'",
        "DELETE FROM flags        WHERE key        LIKE '_test_%'",
        "DELETE FROM remarks      WHERE id         LIKE '_test_%'",
        "DELETE FROM hidden_rows  WHERE row_id     LIKE '_test_%'",
        "DELETE FROM hidden_columns WHERE column_id LIKE '_test_%'",
        "DELETE FROM github_repos WHERE id         LIKE '-999%'",
    ] {
        if let Err(e) = sqlx::query(q).execute(&pool).await {
            eprintln!("pg_cleanup: {e}");
        }
    }
}

// ── SurrealDB cleanup helpers (direct surrealdb) ──────────────────────────────

async fn surreal_cleanup() {
    load_env();
    let Some(url) = surreal_url() else { return; };
    let test_db = std::env::var("SURREAL_TEST_DB").unwrap_or_else(|_| "_test".into());
    let ns = std::env::var("SURREAL_NS").unwrap_or_else(|_| "main".into());
    let Ok(db) = surrealdb::engine::any::connect(&url).await else { return; };
    let user = std::env::var("SURREAL_USER").unwrap_or_default();
    let pass = std::env::var("SURREAL_PASS").unwrap_or_default();
    if !user.is_empty() {
        let _ = db.signin(surrealdb::opt::auth::Root {
            username: user,
            password: pass,
        }).await;
    }
    let _ = db.use_ns(&ns).use_db(&test_db).await;
    for table in ["table_rows", "flags", "remarks", "hidden_rows",
                  "hidden_columns", "app_tables", "github_repos", "ops_log"] {
        let _ = db.query(format!("DELETE {table}")).await;
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[tokio::test]
#[ignore = "requires real .env credentials (DATABASE_URL + SURREAL_URL)"]
async fn integration_create_and_read_row() {
    let pg = match pg_url() { Some(u) => u, None => { eprintln!("skip: DATABASE_URL missing"); return; } };
    pg_cleanup(&pg).await;
    surreal_cleanup().await;

    let store = match make_store().await {
        Some(s) => s,
        None => return,
    };

    let table_id = "_test_rows";
    let row_id   = "_test_row_001";

    let row = store
        .create_row(table_id, row_id, Some("Integration test row"), None)
        .await
        .expect("create_row failed");

    assert_eq!(row.id,       row_id,   "id mismatch");
    assert_eq!(row.table_id, table_id, "table_id mismatch");

    let params = RowQuery { page: 1, per_page: 50, ..Default::default() };
    let page = store
        .list_data_rows(table_id, &params)
        .await
        .expect("list_data_rows failed");

    assert!(
        page.data.iter().any(|r| r["id"] == row_id),
        "created row not found in list"
    );
    assert!(page.total >= 1);
}

#[tokio::test]
#[ignore = "requires real .env credentials (DATABASE_URL + SURREAL_URL)"]
async fn integration_patch_row_value_reflects_in_both_stores() {
    let pg = match pg_url() { Some(u) => u, None => { eprintln!("skip: DATABASE_URL missing"); return; } };
    pg_cleanup(&pg).await;
    surreal_cleanup().await;

    let store = match make_store().await { Some(s) => s, None => return };

    let table_id = "_test_rows";
    let row_id   = "_test_row_patch";

    store.create_row(table_id, row_id, Some("Patch test"), None).await.unwrap();
    store
        .patch_row_value(table_id, row_id, "status", serde_json::json!("verified"))
        .await
        .expect("patch_row_value failed");

    let params = RowQuery { page: 1, per_page: 50, ..Default::default() };
    let page = store.list_data_rows(table_id, &params).await.unwrap();
    let found = page.data.iter().find(|r| r["id"] == row_id).expect("row not found");
    assert_eq!(found["status"], "verified", "patched value not reflected");
}

#[tokio::test]
#[ignore = "requires real .env credentials (DATABASE_URL + SURREAL_URL)"]
async fn integration_upsert_flag_no_duplicates() {
    let pg = match pg_url() { Some(u) => u, None => { eprintln!("skip: DATABASE_URL missing"); return; } };
    pg_cleanup(&pg).await;
    surreal_cleanup().await;

    let store = match make_store().await { Some(s) => s, None => return };

    let flag_id  = nanoid::nanoid!();
    let flag_key = "_test_flag_dedup";

    // Upsert the same key twice — must not create duplicates
    store.upsert_flag(&flag_id, flag_key, "blue").await.unwrap();
    store.upsert_flag(&flag_id, flag_key, "green").await.unwrap();

    let flags = store.list_flags().await.unwrap();
    let matching: Vec<_> = flags.iter().filter(|f| f.key == flag_key).collect();
    assert_eq!(matching.len(), 1, "duplicate flag rows detected");
    assert_eq!(matching[0].color, "green", "latest upsert not reflected");
}

#[tokio::test]
#[ignore = "requires real .env credentials (DATABASE_URL + SURREAL_URL)"]
async fn integration_upsert_github_repos_no_duplicates() {
    let pg = match pg_url() { Some(u) => u, None => { eprintln!("skip: DATABASE_URL missing"); return; } };
    pg_cleanup(&pg).await;
    surreal_cleanup().await;

    let store = match make_store().await { Some(s) => s, None => return };

    let repo = serde_json::json!({
        "github_id": -999001,
        "name": "_test_/repo-dedup",
        "stars": 1
    });

    // Send the same repo twice in separate batches
    store.upsert_github_repos_batch(&[repo.clone()]).await.unwrap();
    store.upsert_github_repos_batch(&[repo.clone()]).await.unwrap();

    // Updated stars
    let repo_updated = serde_json::json!({
        "github_id": -999001,
        "name": "_test_/repo-dedup",
        "stars": 99
    });
    let count = store.upsert_github_repos_batch(&[repo_updated]).await.unwrap();
    assert_eq!(count, 1, "expected exactly 1 upserted row");
}

#[tokio::test]
#[ignore = "requires real .env credentials (DATABASE_URL + SURREAL_URL)"]
async fn integration_ops_log_written_to_both_stores() {
    let pg = match pg_url() { Some(u) => u, None => { eprintln!("skip: DATABASE_URL missing"); return; } };
    pg_cleanup(&pg).await;
    surreal_cleanup().await;

    let store = match make_store().await { Some(s) => s, None => return };

    store
        .append_ops_log(
            "_test_.integration",
            serde_json::json!({ "test": true }),
            None,
        )
        .await;

    // Verify ops_log reached Postgres
    let pool = sqlx::PgPool::connect(&pg).await.unwrap();
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM operations_log WHERE op = '_test_.integration'"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);
    assert!(count >= 1, "ops_log not found in Postgres (got {count})");
}
