/// Integration tests against real Postgres database instances.
///
/// Tests run automatically when `databases.toml` (and `databases.secrets.toml`)
/// are present and credentials are valid. They skip gracefully otherwise.
///
///   cargo test integration
///
/// Credentials are loaded from `databases.toml` / `databases.secrets.toml` in the
/// backend_rs/ directory (the same files the server uses at startup).
/// Legacy env vars still work as a fallback:
///   DB_URLS, DATABASE_URL
///
/// ## Isolation
///
/// Each test gets its own PostgreSQL schema named `_test_{nanoseconds}`.
/// The store is pointed at that schema via `search_path`, so all tables and
/// records live there and are invisible to other tests.  The schema is dropped
/// when the `TestStore` is dropped, so tests clean up after themselves even if
/// they panic.  This means tests can run fully in parallel with no data
/// interference and no global cleanup step.
use super::{open_pg_isolated, DataStore};
use crate::types::RowQuery;
use std::{ops::Deref, sync::Arc};

// ── One-time global init ──────────────────────────────────────────────────────

/// Runs exactly once per test binary invocation regardless of how many tests
/// execute in parallel.  Calling it from multiple threads concurrently is safe.
static GLOBAL_INIT: tokio::sync::OnceCell<()> = tokio::sync::OnceCell::const_new();

async fn global_test_init() {
    GLOBAL_INIT
        .get_or_init(|| async {
            let _ = rustls::crypto::ring::default_provider().install_default();
            load_env();
        })
        .await;
}

// ── Env helpers ───────────────────────────────────────────────────────────────

fn load_env() {
    dotenvy::dotenv().ok();
}

fn all_db_urls() -> Vec<String> {
    load_env();
    if let Ok(Some(entries)) = crate::db_config::load() {
        if !entries.is_empty() {
            return entries.into_iter().map(|(_, url)| url).collect();
        }
    }
    if let Ok(raw) = std::env::var("DB_URLS") {
        let urls: Vec<String> = raw
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .collect();
        if !urls.is_empty() {
            return urls;
        }
    }
    let mut urls = Vec::new();
    if let Ok(u) = std::env::var("DATABASE_URL") {
        if !u.is_empty() {
            urls.push(u);
        }
    }
    urls
}

fn pg_url() -> Option<String> {
    all_db_urls()
        .into_iter()
        .find(|u| u.starts_with("postgres"))
}

// ── Per-test schema isolation ─────────────────────────────────────────────────

/// Generate a schema name that is unique even when many tests start simultaneously.
/// Combines the nanosecond timestamp with a random suffix to avoid collisions
/// between threads that read the same clock tick.
fn unique_test_schema() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let rand = nanoid::nanoid!(6);
    format!("_test_{nanos}_{rand}")
}

/// Holds a store scoped to a unique Postgres schema.
///
/// When this value is dropped the schema is deleted (`DROP SCHEMA … CASCADE`),
/// cleaning up all tables and records created during the test regardless of
/// whether the test passed or panicked.
struct TestStore {
    inner: Arc<dyn DataStore>,
    pg_url: String,
    schema: String,
}

impl Deref for TestStore {
    type Target = Arc<dyn DataStore>;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

/// Shared pool used exclusively for background schema-drop tasks.
/// A cap of 3 connections means at most 3 DROP SCHEMA statements run at once,
/// keeping the total well under PgBouncer's session-mode limit even when many
/// tests finish simultaneously.
static DROP_POOL: tokio::sync::OnceCell<sqlx::PgPool> = tokio::sync::OnceCell::const_new();

async fn drop_pool(url: &str) -> sqlx::PgPool {
    DROP_POOL
        .get_or_init(|| async {
            sqlx::postgres::PgPoolOptions::new()
                .max_connections(3)
                .acquire_timeout(std::time::Duration::from_secs(30))
                .connect(url)
                .await
                .expect("drop pool: failed to connect")
        })
        .await
        .clone()
}

impl Drop for TestStore {
    fn drop(&mut self) {
        let url = self.pg_url.clone();
        let schema = self.schema.clone();
        // Drop is synchronous; schedule cleanup as a fire-and-forget background task.
        // All tasks share a single capped pool to avoid saturating PgBouncer.
        tokio::spawn(async move {
            let pool = drop_pool(&url).await;
            let _ = sqlx::query(&format!("DROP SCHEMA IF EXISTS \"{schema}\" CASCADE"))
                .execute(&pool)
                .await;
        });
    }
}

impl TestStore {
    /// Open a single-connection pool scoped to this test's schema.
    ///
    /// Use this for direct SQL verification queries (e.g. ops_log checks)
    /// that must see the same isolated tables as the store.
    async fn direct_pool(&self) -> Option<sqlx::PgPool> {
        let schema = self.schema.clone();
        sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .after_connect(move |conn, _| {
                let s = schema.clone();
                Box::pin(async move {
                    sqlx::query(&format!("SET search_path TO \"{s}\""))
                        .execute(&mut *conn)
                        .await?;
                    Ok(())
                })
            })
            .connect(&self.pg_url)
            .await
            .ok()
    }
}

/// Create and return a `TestStore` isolated in a unique Postgres schema.
///
/// Returns `None` (causing the test to return early) when no DB URL is
/// configured or when the initial connection / schema setup fails.
async fn make_test_store() -> Option<TestStore> {
    global_test_init().await;
    let pg_url = pg_url()?;
    let schema = unique_test_schema();

    let store = match open_pg_isolated("test", &pg_url, &schema).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to open test store (schema={schema}): {e}");
            return None;
        }
    };
    if let Err(e) = store.ensure_schema().await {
        eprintln!("ensure_schema failed (schema={schema}): {e}");
        return None;
    }
    Some(TestStore {
        inner: store,
        pg_url,
        schema,
    })
}

/// Create a `TestStore` for this test, or skip the test if no DB is configured.
///
/// Each call produces a fresh isolated schema so tests run in parallel without
/// data interference.  The schema is dropped automatically when `store` goes
/// out of scope.
macro_rules! setup {
    () => {
        match make_test_store().await {
            Some(s) => s,
            None => return,
        }
    };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

/// Fetch a single row from a table by its id.
/// Returns `None` if the row does not exist; the caller decides whether to
/// panic (`.expect("…")`) or handle the absence differently.
async fn fetch_row(
    store: &dyn DataStore,
    table_id: &str,
    row_id: &str,
) -> Option<serde_json::Value> {
    let page = store
        .list_data_rows(
            table_id,
            &RowQuery {
                page: 1,
                per_page: 200,
                ..Default::default()
            },
        )
        .await
        .unwrap_or_else(|e| panic!("list_data_rows({table_id}) failed: {e}"));
    page.data.into_iter().find(|r| r["id"] == row_id)
}

fn text_col(display_title: &str) -> crate::custom_column::CustomColumnInput {
    crate::custom_column::CustomColumnInput {
        title: Some(display_title.to_owned()),
        types: Some(vec!["text".to_owned()]),
        ..Default::default()
    }
}

// ── Row CRUD tests ────────────────────────────────────────────────────────────

#[tokio::test]
async fn integration_create_and_read_row() {
    let store = setup!();
    let (table_id, row_id) = ("rows", "row_001");

    let row = store
        .create_row(table_id, row_id, Some("Integration test row"), None)
        .await
        .expect("create_row failed");
    assert_eq!(row["id"].as_str().unwrap_or(""), row_id);
    assert_eq!(row["table_id"].as_str().unwrap_or(""), table_id);

    let page = store
        .list_data_rows(
            table_id,
            &RowQuery {
                page: 1,
                per_page: 50,
                ..Default::default()
            },
        )
        .await
        .expect("list_data_rows failed");
    assert!(
        page.data.iter().any(|r| r["id"] == row_id),
        "created row not found"
    );
    assert!(page.total >= 1);
}

#[tokio::test]
async fn integration_list_empty_dynamic_table_materializes_relation() {
    let store = setup!();
    let table_id = "9PUohQTPxgrtrpVp9Qcrn";

    let page = store
        .list_data_rows(
            table_id,
            &RowQuery {
                page: 1,
                per_page: 50,
                ..Default::default()
            },
        )
        .await
        .expect("list_data_rows should materialize missing user table");

    assert_eq!(page.total, 0);
    assert!(page.data.is_empty());

    let pool = store.direct_pool().await.expect("direct pool");
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = current_schema() AND table_name = $1
         )",
    )
    .bind(format!("t_{table_id}"))
    .fetch_one(&pool)
    .await
    .expect("relation existence query");
    assert!(
        exists,
        "missing dynamic table relation should have been created"
    );
}

#[tokio::test]
async fn integration_create_row_idempotent() {
    // Creating the same row id twice must produce exactly one row.
    let store = setup!();
    let (table_id, row_id) = ("rows", "row_idem");

    store
        .create_row(table_id, row_id, Some("First"), None)
        .await
        .unwrap();
    store
        .create_row(table_id, row_id, Some("Second"), None)
        .await
        .unwrap();

    let page = store
        .list_data_rows(
            table_id,
            &RowQuery {
                page: 1,
                per_page: 50,
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let count = page.data.iter().filter(|r| r["id"] == row_id).count();
    assert_eq!(count, 1, "idempotent create produced duplicate rows");
}

// ── patch_row_value tests ─────────────────────────────────────────────────────

#[tokio::test]
async fn integration_patch_row_value_reflects() {
    // A patched value must be visible when the row is listed.
    let store = setup!();
    let (table_id, row_id) = ("rows", "row_patch");

    store
        .create_row(table_id, row_id, Some("Patch test"), None)
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "status", serde_json::json!("verified"))
        .await
        .unwrap();

    let row = fetch_row(&**store, table_id, row_id)
        .await
        .expect("row not found");
    assert_eq!(row["status"], "verified");
}

#[tokio::test]
async fn integration_patch_different_columns_no_overwrite() {
    // Patching column A must not clobber a previously patched column B.
    let store = setup!();
    let (table_id, row_id) = ("rows", "row_concurrent");

    store
        .create_row(table_id, row_id, None, None)
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "col_a", serde_json::json!("value_a"))
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "col_b", serde_json::json!("value_b"))
        .await
        .unwrap();

    let row = fetch_row(&**store, table_id, row_id)
        .await
        .expect("row not found");
    assert_eq!(row["col_a"], "value_a", "col_a was overwritten");
    assert_eq!(row["col_b"], "value_b", "col_b was overwritten");
}

#[tokio::test]
async fn integration_repatch_same_field_leaves_siblings_intact() {
    // Re-patching field_a with a new value must not affect field_b.
    let store = setup!();
    let (table_id, row_id) = ("rows", "row_repatch");

    store
        .create_row(table_id, row_id, None, None)
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "field_a", serde_json::json!("v1"))
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "field_b", serde_json::json!("stable"))
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "field_a", serde_json::json!("v2"))
        .await
        .unwrap();

    let row = fetch_row(&**store, table_id, row_id)
        .await
        .expect("row not found");
    assert_eq!(
        row["field_a"], "v2",
        "field_a must reflect the latest patch"
    );
    assert_eq!(
        row["field_b"], "stable",
        "field_b must be unaffected by re-patching field_a"
    );
}

#[tokio::test]
async fn integration_patch_custom_vals_merge_not_replace() {
    // Patching a field must merge into custom_vals, not replace the entire object.
    // After patching three independent fields one by one, all three must coexist.
    let store = setup!();
    let (table_id, row_id) = ("rows", "row_merge");

    store
        .create_row(table_id, row_id, None, None)
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "alpha", serde_json::json!(1))
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "beta", serde_json::json!(2))
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "gamma", serde_json::json!(3))
        .await
        .unwrap();

    let row = fetch_row(&**store, table_id, row_id)
        .await
        .expect("row not found");
    assert_eq!(row["alpha"], 1, "alpha overwritten");
    assert_eq!(row["beta"], 2, "beta overwritten");
    assert_eq!(row["gamma"], 3, "gamma overwritten");
}

#[tokio::test]
async fn integration_patch_with_3_level_deep_value_leaves_siblings_untouched() {
    // The value stored under a key may itself be a deeply-nested object.
    // Patching an unrelated sibling key must leave the deep structure intact.
    //
    // Layout:
    //   "metrics" → { "weekly": { "views": 100, "clicks": 50 }, "monthly": 500 }  (3 levels)
    //   "label"   → "original"                                                     (sibling)
    let store = setup!();
    let (table_id, row_id) = ("rows", "row_deep");

    store
        .create_row(table_id, row_id, None, None)
        .await
        .unwrap();
    store
        .patch_row_value(
            table_id,
            row_id,
            "metrics",
            serde_json::json!({
                "weekly":  { "views": 100, "clicks": 50 },
                "monthly": 500
            }),
        )
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "label", serde_json::json!("original"))
        .await
        .unwrap();

    // Patch only the sibling "label"; "metrics" must be fully preserved at all levels.
    store
        .patch_row_value(table_id, row_id, "label", serde_json::json!("updated"))
        .await
        .unwrap();

    let row = fetch_row(&**store, table_id, row_id)
        .await
        .expect("row not found");
    assert_eq!(row["label"], "updated", "label must reflect new value");
    assert_eq!(
        row["metrics"]["weekly"]["views"], 100,
        "metrics.weekly.views untouched"
    );
    assert_eq!(
        row["metrics"]["weekly"]["clicks"], 50,
        "metrics.weekly.clicks untouched"
    );
    assert_eq!(row["metrics"]["monthly"], 500, "metrics.monthly untouched");
}

#[tokio::test]
async fn integration_patch_nested_dict_removes_2_level_deep_key() {
    // patch_row_value replaces the entire value for a top-level key.
    // Patching with an object that omits some sub-keys effectively deletes those
    // sub-keys from the stored dict (2-level depth).
    //
    // Before: { "config": { "timeout": 30, "retries": 5, "debug": true }, "name": "svc" }
    // After:  { "config": { "timeout": 60, "retries": 5 },                 "name": "svc" }
    let store = setup!();
    let (table_id, row_id) = ("rows", "row_del2");

    store
        .create_row(table_id, row_id, None, None)
        .await
        .unwrap();
    store
        .patch_row_value(
            table_id,
            row_id,
            "config",
            serde_json::json!({
                "timeout": 30, "retries": 5, "debug": true
            }),
        )
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "name", serde_json::json!("svc"))
        .await
        .unwrap();

    // Re-patch "config" without "debug" — it must disappear.
    store
        .patch_row_value(
            table_id,
            row_id,
            "config",
            serde_json::json!({
                "timeout": 60, "retries": 5
            }),
        )
        .await
        .unwrap();

    let row = fetch_row(&**store, table_id, row_id)
        .await
        .expect("row not found");
    assert_eq!(row["config"]["timeout"], 60, "timeout must be updated");
    assert_eq!(row["config"]["retries"], 5, "retries must be unchanged");
    assert!(
        row["config"]["debug"].is_null(),
        "debug must be deleted (absent from new value)"
    );
    assert_eq!(row["name"], "svc", "sibling key must be untouched");
}

#[tokio::test]
async fn integration_patch_nested_dict_removes_3_level_deep_key() {
    // Same as above but one level deeper (3-level-deep key deletion).
    //
    // Before: { "data": { "owner": { "name": "Alice", "role": "admin" }, "repo": "foo" }, "status": "ok" }
    // After:  { "data": { "owner": { "name": "Alice" }                                  }, "status": "ok" }
    let store = setup!();
    let (table_id, row_id) = ("rows", "row_del3");

    store
        .create_row(table_id, row_id, None, None)
        .await
        .unwrap();
    store
        .patch_row_value(
            table_id,
            row_id,
            "data",
            serde_json::json!({
                "owner": { "name": "Alice", "role": "admin" },
                "repo":  "foo"
            }),
        )
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "status", serde_json::json!("ok"))
        .await
        .unwrap();

    // Re-patch "data" keeping only owner.name; owner.role and repo must be deleted.
    store
        .patch_row_value(
            table_id,
            row_id,
            "data",
            serde_json::json!({
                "owner": { "name": "Alice" }
            }),
        )
        .await
        .unwrap();

    let row = fetch_row(&**store, table_id, row_id)
        .await
        .expect("row not found");
    assert_eq!(
        row["data"]["owner"]["name"], "Alice",
        "owner.name must be preserved"
    );
    assert!(
        row["data"]["owner"]["role"].is_null(),
        "owner.role must be deleted"
    );
    assert!(row["data"]["repo"].is_null(), "repo must be deleted");
    assert_eq!(row["status"], "ok", "sibling status must be untouched");
}

// ── Batch upsert + patch interaction tests ────────────────────────────────────

#[tokio::test]
async fn integration_upsert_rows_batch_idempotent() {
    // Upserting the same rows twice must not create duplicates.
    let store = setup!();
    let table_id = "batch_rows";

    store
        .upsert_rows_batch(
            table_id,
            &[
                serde_json::json!({"id": "br_001", "name": "Alpha", "stars": 10}),
                serde_json::json!({"id": "br_002", "name": "Beta",  "stars": 20}),
            ],
        )
        .await
        .unwrap();

    // Second upsert with updated stars — must update, not duplicate.
    store
        .upsert_rows_batch(
            table_id,
            &[
                serde_json::json!({"id": "br_001", "name": "Alpha", "stars": 99}),
                serde_json::json!({"id": "br_002", "name": "Beta",  "stars": 88}),
            ],
        )
        .await
        .unwrap();

    let page = store
        .list_data_rows(
            table_id,
            &RowQuery {
                page: 1,
                per_page: 50,
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(page.total, 2, "expected exactly 2 rows after two upserts");
}

#[tokio::test]
async fn integration_batch_upsert_does_not_clobber_user_patched_fields() {
    // A user patches a field that never appears in source data.
    // Re-importing source data must leave the user's patch intact.
    let store = setup!();
    let (table_id, row_id) = ("batch_user_cols", "uuc_001");

    store
        .upsert_rows_batch(
            table_id,
            &[serde_json::json!({"id": row_id, "stars": 10, "name": "Repo"})],
        )
        .await
        .unwrap();

    store
        .patch_row_value(table_id, row_id, "my_notes", serde_json::json!("keep me"))
        .await
        .unwrap();

    // Re-import: updates source fields only, does not include my_notes.
    store
        .upsert_rows_batch(
            table_id,
            &[serde_json::json!({"id": row_id, "stars": 99, "name": "Repo"})],
        )
        .await
        .unwrap();

    let row = fetch_row(&**store, table_id, row_id)
        .await
        .expect("row not found");
    assert_eq!(
        row["stars"], 99,
        "source field must be refreshed by batch import"
    );
    assert_eq!(
        row["my_notes"], "keep me",
        "user-patched field must survive batch re-import"
    );
}

#[tokio::test]
async fn integration_batch_upsert_multiple_source_fields_then_patch_and_reimport() {
    // Broader coverage: row has several source fields + two user patches.
    // After a re-import, source fields update and both user patches survive.
    let store = setup!();
    let (table_id, row_id) = ("batch_multi", "bm_001");

    store
        .upsert_rows_batch(
            table_id,
            &[serde_json::json!({"id": row_id, "stars": 5, "forks": 2, "license": "MIT"})],
        )
        .await
        .unwrap();

    store
        .patch_row_value(table_id, row_id, "priority", serde_json::json!("high"))
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "reviewed", serde_json::json!(true))
        .await
        .unwrap();

    // Re-import refreshes source fields; user fields are absent from the payload.
    store.upsert_rows_batch(table_id, &[
        serde_json::json!({"id": row_id, "stars": 100, "forks": 50, "license": "Apache-2.0"}),
    ]).await.unwrap();

    let row = fetch_row(&**store, table_id, row_id)
        .await
        .expect("row not found");
    assert_eq!(row["stars"], 100, "stars must be refreshed");
    assert_eq!(row["forks"], 50, "forks must be refreshed");
    assert_eq!(row["license"], "Apache-2.0", "license must be refreshed");
    assert_eq!(row["priority"], "high", "user priority patch must survive");
    assert_eq!(row["reviewed"], true, "user reviewed patch must survive");
}

#[tokio::test]
async fn integration_batch_upsert_auto_creates_columns_for_nested_fields() {
    // When a row contains a nested object field (e.g. "metrics": {"views": 100}),
    // upsert_rows_batch must auto-create:
    //   - a group column "metrics"
    //   - a child column "metrics__views" with source_path ["metrics", "views"]
    // and a flat numeric field "score" must become a plain numeric column.
    let store = setup!();
    let table_id = "auto_cols";

    store
        .upsert_rows_batch(
            table_id,
            &[serde_json::json!({
                "id":      "row1",
                "score":   42,
                "metrics": { "views": 100, "clicks": 5 }
            })],
        )
        .await
        .unwrap();

    let cols = store.list_custom_columns(table_id).await.unwrap();
    let col_ids: Vec<&str> = cols.iter().map(|c| c.id.as_str()).collect();

    assert!(
        col_ids.contains(&"score"),
        "flat field must become a column"
    );
    assert!(
        col_ids.contains(&"metrics"),
        "nested field must become a group column"
    );
    assert!(
        col_ids.contains(&"metrics__views"),
        "nested sub-key must become a child column"
    );
    assert!(
        col_ids.contains(&"metrics__clicks"),
        "nested sub-key must become a child column"
    );
    let views_pos = col_ids
        .iter()
        .position(|id| *id == "metrics__views")
        .unwrap();
    let clicks_pos = col_ids
        .iter()
        .position(|id| *id == "metrics__clicks")
        .unwrap();
    assert!(
        views_pos < clicks_pos,
        "nested columns must preserve row field order"
    );

    let group = cols.iter().find(|c| c.id == "metrics").unwrap();
    assert!(group.is_group, "parent column must be marked as a group");

    let child = cols.iter().find(|c| c.id == "metrics__views").unwrap();
    assert_eq!(
        child.position_before.as_deref(),
        Some("metrics__clicks"),
        "nested column order should encode the next sibling in position_before"
    );
    assert_eq!(
        child.parent_ids,
        vec!["metrics"],
        "child must reference parent"
    );
    assert_eq!(
        child.source_path.as_deref(),
        Some(["metrics".to_owned(), "views".to_owned()].as_slice()),
        "child must have source_path pointing into the nested JSONB"
    );
    assert!(
        child.types.iter().any(|t| t == "numeric"),
        "numeric value must infer numeric type"
    );

    let second_child = cols.iter().find(|c| c.id == "metrics__clicks").unwrap();
    assert_eq!(
        second_child.position_after.as_deref(),
        Some("metrics__views"),
        "nested column order should be encoded in position_after"
    );
}

#[tokio::test]
async fn integration_batch_upsert_discovers_nested_fields_after_empty_first_row() {
    let store = setup!();
    let table_id = "auto_cols_late_nested";

    store
        .upsert_rows_batch(
            table_id,
            &[
                serde_json::json!({ "id": "row1", "metrics": {} }),
                serde_json::json!({ "id": "row2", "metrics": { "views": 100 } }),
            ],
        )
        .await
        .unwrap();

    let cols = store.list_custom_columns(table_id).await.unwrap();
    let child = cols.iter().find(|c| c.id == "metrics__views").unwrap();
    assert_eq!(
        child.source_path.as_deref(),
        Some(["metrics".to_owned(), "views".to_owned()].as_slice()),
        "nested column should be discovered even when the first row has an empty object"
    );
}

#[tokio::test]
async fn integration_list_data_rows_sorts_nested_numeric_path_numerically() {
    let store = setup!();
    let table_id = "sort_nested_numeric";

    store
        .upsert_rows_batch(
            table_id,
            &[
                serde_json::json!({ "id": "row2", "metrics": { "views": 2 } }),
                serde_json::json!({ "id": "row10", "metrics": { "views": 10 } }),
            ],
        )
        .await
        .unwrap();

    let page = store
        .list_data_rows(
            table_id,
            &RowQuery {
                page: 1,
                per_page: 50,
                sort: Some("metrics__views:desc".to_string()),
                ..Default::default()
            },
        )
        .await
        .unwrap();

    assert_eq!(
        page.data[0]["id"], "row10",
        "10 must sort before 2 numerically"
    );
    assert_eq!(
        page.data[1]["id"], "row2",
        "2 must sort after 10 numerically"
    );
}

#[tokio::test]
async fn integration_batch_upsert_repairs_stale_nested_source_path() {
    let store = setup!();
    let table_id = "nested_cols_repair";
    let pool = store.direct_pool().await.expect("direct pool");

    sqlx::query("INSERT INTO tables (id, title) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING")
        .bind(table_id)
        .bind("Nested columns repair")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO custom_columns (id, title, types, data_types, is_group, parent_ids, source_path)
         VALUES ('metrics__views', 'views', ARRAY['numeric'], ARRAY['numeric'], false, ARRAY[]::TEXT[], NULL)
         ON CONFLICT (id) DO UPDATE SET parent_ids = ARRAY[]::TEXT[], source_path = NULL",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO table_custom_columns (table_id, column_id)
         VALUES ($1, 'metrics__views')
         ON CONFLICT (table_id, column_id) DO NOTHING",
    )
    .bind(table_id)
    .execute(&pool)
    .await
    .unwrap();

    store
        .upsert_rows_batch(
            table_id,
            &[serde_json::json!({
                "id": "row1",
                "metrics": { "views": 100 }
            })],
        )
        .await
        .unwrap();

    let cols = store.list_custom_columns(table_id).await.unwrap();
    let col = cols.iter().find(|c| c.id == "metrics__views").unwrap();
    assert_eq!(
        col.source_path.as_deref(),
        Some(["metrics".to_owned(), "views".to_owned()].as_slice()),
        "stale nested column should be returned with a data path"
    );
    assert_eq!(
        col.parent_ids,
        vec!["metrics"],
        "stale nested column should be repaired in storage with its parent"
    );

    let persisted: Option<Vec<String>> =
        sqlx::query_scalar("SELECT source_path FROM custom_columns WHERE id = 'metrics__views'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        persisted.as_deref(),
        Some(["metrics".to_owned(), "views".to_owned()].as_slice()),
        "stale nested source_path should be repaired in storage"
    );
    let persisted_parent_ids: Vec<String> =
        sqlx::query_scalar("SELECT parent_ids FROM custom_columns WHERE id = 'metrics__views'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        persisted_parent_ids,
        vec!["metrics"],
        "stale nested parent_ids should be repaired in storage"
    );
}

#[tokio::test]
async fn integration_list_custom_columns_repairs_nested_metadata_from_existing_rows() {
    let store = setup!();
    let table_id = "nested_cols_list_repair";
    let pool = store.direct_pool().await.expect("direct pool");

    store
        .upsert_rows_batch(
            table_id,
            &[serde_json::json!({
                "id": "row1",
                "metrics": { "views": 100 }
            })],
        )
        .await
        .unwrap();

    sqlx::query(
        "UPDATE custom_columns
         SET parent_ids = ARRAY[]::TEXT[], source_path = NULL
         WHERE id = 'metrics__views'",
    )
    .execute(&pool)
    .await
    .unwrap();

    let cols = store.list_custom_columns(table_id).await.unwrap();
    let col = cols.iter().find(|c| c.id == "metrics__views").unwrap();
    assert_eq!(
        col.parent_ids,
        vec!["metrics"],
        "list_custom_columns should repair parent_ids from existing row data"
    );
    assert_eq!(
        col.source_path.as_deref(),
        Some(["metrics".to_owned(), "views".to_owned()].as_slice()),
        "list_custom_columns should repair source_path from existing row data"
    );
}

// ── Flag tests ────────────────────────────────────────────────────────────────

#[tokio::test]
async fn integration_upsert_flag_no_duplicates() {
    // Upserting the same flag key twice must produce exactly one row with the latest color.
    let store = setup!();
    let (flag_id, flag_key) = (nanoid::nanoid!(), "flag_dedup");

    store.upsert_flag(&flag_id, flag_key, "blue").await.unwrap();
    store
        .upsert_flag(&flag_id, flag_key, "green")
        .await
        .unwrap();

    let flags = store.list_flags().await.unwrap();
    let matching: Vec<_> = flags.iter().filter(|f| f.key == flag_key).collect();
    assert_eq!(matching.len(), 1, "duplicate flag rows detected");
    assert_eq!(matching[0].color, "green", "latest upsert not reflected");
}

#[tokio::test]
async fn integration_delete_flag_removes_from_list() {
    let store = setup!();
    let (flag_id, flag_key) = (nanoid::nanoid!(), "flag_delete");

    store.upsert_flag(&flag_id, flag_key, "red").await.unwrap();
    assert!(store
        .list_flags()
        .await
        .unwrap()
        .iter()
        .any(|f| f.key == flag_key));

    store.delete_flag(flag_key).await.unwrap();
    assert!(
        !store
            .list_flags()
            .await
            .unwrap()
            .iter()
            .any(|f| f.key == flag_key),
        "flag still present after delete"
    );
}

// ── Remark tests ──────────────────────────────────────────────────────────────

#[tokio::test]
async fn integration_remark_lifecycle() {
    // Create → update body/kind → delete.
    let store = setup!();
    let id = "remark_001";

    let remark = store
        .upsert_remark(id, "Initial body", "note", false, None, &[])
        .await
        .expect("upsert_remark failed");
    assert_eq!(remark.id, id);
    assert_eq!(remark.body, "Initial body");
    assert_eq!(remark.kind, "note");
    assert!(!remark.is_private);

    store
        .upsert_remark(id, "Updated body", "comment", true, None, &[])
        .await
        .unwrap();
    let found = store
        .list_remarks()
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.id == id)
        .expect("remark not found after update");
    assert_eq!(found.body, "Updated body");
    assert_eq!(found.kind, "comment");
    assert!(found.is_private);

    store.delete_remark(id).await.unwrap();
    assert!(
        !store
            .list_remarks()
            .await
            .unwrap()
            .iter()
            .any(|r| r.id == id),
        "remark still present after delete"
    );
}

#[tokio::test]
async fn integration_remark_with_targets() {
    // A remark can be attached to multiple cell targets simultaneously.
    let store = setup!();
    let id = "remark_targets";
    let targets = vec![
        crate::remark::RemarkTarget {
            row_id: "row_1".into(),
            column_id: "stars".into(),
        },
        crate::remark::RemarkTarget {
            row_id: "row_2".into(),
            column_id: "forks".into(),
        },
    ];

    store
        .upsert_remark(id, "Multi-target remark", "note", false, None, &targets)
        .await
        .unwrap();

    let found = store
        .list_remarks()
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.id == id)
        .expect("remark not found");
    assert_eq!(found.targets.len(), 2, "expected 2 targets");
    assert!(found.targets.iter().any(|t| t.column_id == "stars"));
    assert!(found.targets.iter().any(|t| t.column_id == "forks"));
}

#[tokio::test]
async fn integration_remark_resolve() {
    // A comment can be resolved by setting resolved_at.
    let store = setup!();
    let id = "remark_resolve";

    store
        .upsert_remark(id, "To be resolved", "comment", false, None, &[])
        .await
        .unwrap();
    let before = store
        .list_remarks()
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.id == id)
        .unwrap();
    assert!(before.resolved_at.is_none(), "should start unresolved");

    let resolved_at = chrono::Utc::now();
    store
        .upsert_remark(id, "Resolved", "comment", false, Some(resolved_at), &[])
        .await
        .unwrap();
    let after = store
        .list_remarks()
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.id == id)
        .unwrap();
    assert!(after.resolved_at.is_some(), "resolved_at must be set");
}

// ── Hidden row/column tests ───────────────────────────────────────────────────

#[tokio::test]
async fn integration_hidden_row_add_list_remove() {
    let store = setup!();
    let (id, row_id) = (nanoid::nanoid!(), "hidden_row_001");

    store.add_hidden_row(&id, row_id).await.unwrap();
    assert!(
        store
            .list_hidden_rows()
            .await
            .unwrap()
            .iter()
            .any(|r| r.row_id == row_id),
        "hidden row not in list after add"
    );

    store.remove_hidden_row(row_id).await.unwrap();
    assert!(
        !store
            .list_hidden_rows()
            .await
            .unwrap()
            .iter()
            .any(|r| r.row_id == row_id),
        "hidden row still in list after remove"
    );
}

#[tokio::test]
async fn integration_hidden_row_idempotent() {
    // Adding the same row id twice must not create duplicate entries.
    let store = setup!();
    let (id, row_id) = (nanoid::nanoid!(), "hidden_row_idem");

    store.add_hidden_row(&id, row_id).await.unwrap();
    store.add_hidden_row(&id, row_id).await.unwrap();

    let count = store
        .list_hidden_rows()
        .await
        .unwrap()
        .into_iter()
        .filter(|r| r.row_id == row_id)
        .count();
    assert_eq!(count, 1, "idempotent add produced duplicates");
}

#[tokio::test]
async fn integration_hidden_column_add_list_remove() {
    let store = setup!();
    let (id, col_id) = (nanoid::nanoid!(), "hidden_col_001");

    store.add_hidden_column(&id, col_id).await.unwrap();
    assert!(
        store
            .list_hidden_columns()
            .await
            .unwrap()
            .iter()
            .any(|c| c.column_id == col_id),
        "hidden column not in list after add"
    );

    store.remove_hidden_column(col_id).await.unwrap();
    assert!(
        !store
            .list_hidden_columns()
            .await
            .unwrap()
            .iter()
            .any(|c| c.column_id == col_id),
        "hidden column still in list after remove"
    );
}

// ── Table registry tests ──────────────────────────────────────────────────────

#[tokio::test]
async fn integration_table_create_list_patch_delete() {
    let store = setup!();
    let id = "table_001";

    let t = store
        .create_table(id, "Test Table", Some("A test"), Some("tester"))
        .await
        .unwrap();
    assert_eq!(t.id, id);
    assert_eq!(t.title, "Test Table");

    assert!(
        store
            .list_tables()
            .await
            .unwrap()
            .iter()
            .any(|t| t.id == id),
        "table not found in list after create"
    );

    let patched = store
        .patch_table(id, Some("Renamed Table"), None, Some("patcher"))
        .await
        .unwrap();
    assert_eq!(patched.title, "Renamed Table");
    assert!(patched.modify_count >= 1);

    store.delete_table(id).await.unwrap();
    assert!(
        !store
            .list_tables()
            .await
            .unwrap()
            .iter()
            .any(|t| t.id == id),
        "table still present after delete"
    );
}

#[tokio::test]
async fn integration_builtin_classes_table_is_listed() {
    let store = setup!();

    let tables = store.list_tables().await.unwrap();
    assert!(
        tables.iter().any(|t| t.id == "classes" && t.title == "Classes"),
        "builtin classes table should appear in the table registry"
    );

    let page = store
        .list_data_rows(
            "classes",
            &RowQuery {
                page: 1,
                per_page: 10,
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(page.total, 0, "builtin classes table should be empty by default");
}

#[tokio::test]
async fn integration_table_create_idempotent() {
    // Creating the same table id twice must produce exactly one entry.
    let store = setup!();
    let id = "table_idem";

    store
        .create_table(id, "First Title", None, None)
        .await
        .unwrap();
    store
        .create_table(id, "Second Title", None, None)
        .await
        .unwrap();

    let count = store
        .list_tables()
        .await
        .unwrap()
        .into_iter()
        .filter(|t| t.id == id)
        .count();
    assert_eq!(count, 1, "idempotent create produced duplicates");
}

// ── Row class tests ───────────────────────────────────────────────────────────

#[tokio::test]
async fn integration_row_classes_are_table_scoped_and_sync_jsonb() {
    let store = setup!();
    let (table_a, table_b, row_id) = ("classes_a", "classes_b", "shared_row");

    for (id, title) in [(table_a, "Classes A"), (table_b, "Classes B")] {
        store.create_table(id, title, None, None).await.unwrap();
        store.create_row(id, row_id, None, None).await.unwrap();
    }

    store
        .create_row_class(table_a, "class_a", "A", Some("#f97316"))
        .await
        .unwrap();
    store
        .create_row_class(table_b, "class_b", "B", Some("#2563eb"))
        .await
        .unwrap();

    store
        .set_many_to_many_assignments(
            table_a,
            row_id,
            "classes",
            &["class_a".to_owned(), "class_a".to_owned()],
        )
        .await
        .unwrap();
    store
        .set_many_to_many_assignments(table_b, row_id, "classes", &["class_b".to_owned()])
        .await
        .unwrap();

    assert_eq!(
        fetch_row(store.as_ref(), table_a, row_id).await.unwrap()["classes"],
        serde_json::json!(["class_a"])
    );
    assert_eq!(
        fetch_row(store.as_ref(), table_b, row_id).await.unwrap()["classes"],
        serde_json::json!(["class_b"])
    );
    assert_eq!(
        store
            .get_row_class_assignments(table_a, row_id)
            .await
            .unwrap()
            .into_iter()
            .map(|class| class.id)
            .collect::<Vec<_>>(),
        vec!["class_a"]
    );

    let invalid = store
        .set_many_to_many_assignments(table_a, row_id, "classes", &["class_b".to_owned()])
        .await;
    assert!(
        invalid.is_err(),
        "a class from another table must not be assignable"
    );
    assert_eq!(
        fetch_row(store.as_ref(), table_a, row_id).await.unwrap()["classes"],
        serde_json::json!(["class_a"]),
        "failed replacement must preserve existing assignments"
    );

    store
        .set_many_to_many_assignments(table_a, row_id, "classes", &[])
        .await
        .unwrap();
    assert_eq!(
        fetch_row(store.as_ref(), table_a, row_id).await.unwrap()["classes"],
        serde_json::json!([])
    );
    assert_eq!(
        fetch_row(store.as_ref(), table_b, row_id).await.unwrap()["classes"],
        serde_json::json!(["class_b"])
    );

    store
        .set_many_to_many_assignments(table_a, row_id, "classes", &["class_a".to_owned()])
        .await
        .unwrap();
    store.delete_row_class(table_a, "class_a").await.unwrap();

    assert_eq!(
        fetch_row(store.as_ref(), table_a, row_id).await.unwrap()["classes"],
        serde_json::json!([])
    );
    assert_eq!(
        fetch_row(store.as_ref(), table_b, row_id).await.unwrap()["classes"],
        serde_json::json!(["class_b"])
    );
    assert!(
        store.list_row_classes(table_a).await.unwrap().is_empty(),
        "deleted class remains in its table catalog"
    );
}

// ── Custom column tests ───────────────────────────────────────────────────────

#[tokio::test]
async fn integration_custom_column_upsert_and_list() {
    let store = setup!();
    let table_id = "table_cols";
    store
        .create_table(table_id, "Col test table", None, None)
        .await
        .unwrap();

    let col = store
        .upsert_custom_column(table_id, "col_name", &text_col("Display Name"))
        .await
        .unwrap();
    assert_eq!(col.id, "col_name");

    let cols = store.list_custom_columns(table_id).await.unwrap();
    assert!(
        cols.iter().any(|c| c.id == "col_name"),
        "column not in list"
    );
}

#[tokio::test]
async fn integration_custom_column_group_with_sub_columns() {
    // A group column can have sub-columns; parent_ids links them.
    let store = setup!();
    let table_id = "table_groups";
    store
        .create_table(table_id, "Group test", None, None)
        .await
        .unwrap();

    let group_input = crate::custom_column::CustomColumnInput {
        title: Some("Owner".to_owned()),
        is_group: true,
        ..Default::default()
    };
    store
        .upsert_custom_column(table_id, "col_owner", &group_input)
        .await
        .unwrap();

    let sub_input = crate::custom_column::CustomColumnInput {
        title: Some("Login".to_owned()),
        parent_ids: vec!["col_owner".to_owned()],
        types: Some(vec!["text".to_owned()]),
        ..Default::default()
    };
    store
        .upsert_custom_column(table_id, "col_owner_login", &sub_input)
        .await
        .unwrap();

    let cols = store.list_custom_columns(table_id).await.unwrap();
    let group = cols
        .iter()
        .find(|c| c.id == "col_owner")
        .expect("group col missing");
    let sub = cols
        .iter()
        .find(|c| c.id == "col_owner_login")
        .expect("sub col missing");

    assert!(group.is_group);
    assert_eq!(sub.parent_ids, vec!["col_owner"]);
}

#[tokio::test]
async fn integration_custom_column_delete() {
    let store = setup!();
    let table_id = "table_col_del";
    store
        .create_table(table_id, "Del test", None, None)
        .await
        .unwrap();
    store
        .upsert_custom_column(table_id, "col_del", &text_col("to_delete"))
        .await
        .unwrap();

    assert!(store
        .list_custom_columns(table_id)
        .await
        .unwrap()
        .iter()
        .any(|c| c.id == "col_del"));

    store.delete_custom_column("col_del").await.unwrap();
    assert!(
        !store
            .list_custom_columns(table_id)
            .await
            .unwrap()
            .iter()
            .any(|c| c.id == "col_del"),
        "column still present after delete"
    );
}

#[tokio::test]
async fn integration_custom_column_freeze() {
    // set_table_column_frozen toggles the is_frozen flag on the column.
    let store = setup!();
    let table_id = "table_freeze";
    store
        .create_table(table_id, "Freeze test", None, None)
        .await
        .unwrap();
    store
        .upsert_custom_column(table_id, "col_freeze", &text_col("freezable"))
        .await
        .unwrap();

    let col = store
        .set_table_column_frozen(table_id, "col_freeze", true)
        .await
        .unwrap();
    assert!(col.is_frozen, "column should be frozen after setting true");

    let col = store
        .set_table_column_frozen(table_id, "col_freeze", false)
        .await
        .unwrap();
    assert!(
        !col.is_frozen,
        "column should be unfrozen after setting false"
    );
}

#[tokio::test]
async fn integration_custom_column_full_metadata_round_trips() {
    // title, description, types, and data_types must survive an upsert round-trip.
    let store = setup!();
    let table_id = "table_meta";
    store
        .create_table(table_id, "Meta test", None, None)
        .await
        .unwrap();

    let input = crate::custom_column::CustomColumnInput {
        title: Some("Stars ⭐".to_owned()),
        description: Some("GitHub star count".to_owned()),
        types: Some(vec!["integer".to_owned()]),
        data_types: Some(vec!["numeric".to_owned()]),
        ..Default::default()
    };
    let col = store
        .upsert_custom_column(table_id, "col_stars", &input)
        .await
        .unwrap();
    assert_eq!(col.title.as_deref(), Some("Stars ⭐"));
    assert_eq!(col.description.as_deref(), Some("GitHub star count"));
    assert!(col.types.contains(&"integer".to_owned()));
    assert!(col.data_types.contains(&"numeric".to_owned()));
}

// ── Ops log tests ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn integration_ops_log_applied_at_set_after_write() {
    // After a write succeeds, its ops_log entry must have applied_at set.
    let store = setup!();

    store
        .upsert_flag(&nanoid::nanoid!(), "flag_ops_applied", "blue")
        .await
        .unwrap();

    let Some(pool) = store.direct_pool().await else {
        return;
    };
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM operations_log \
         WHERE op = 'flag.upsert' AND applied_at IS NOT NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);
    assert!(
        count >= 1,
        "ops_log applied_at not set after write (got {count})"
    );
}

#[tokio::test]
async fn integration_ops_log_no_pending_after_all_writes_succeed() {
    // Completed writes must not linger as pending ops.
    let store = setup!();

    store
        .upsert_flag(&nanoid::nanoid!(), "flag_no_pending", "blue")
        .await
        .unwrap();
    store
        .create_row("rows_no_pending", "row_no_pending", None, None)
        .await
        .unwrap();

    let pending = store.pending_ops().await.unwrap();
    let ours: Vec<_> = pending
        .iter()
        .filter(|op| op.op.starts_with("flag.") || op.op.starts_with("row."))
        .collect();
    assert!(
        ours.is_empty(),
        "found {n} unexpected pending ops: {ours:?}",
        n = ours.len()
    );
}

#[tokio::test]
async fn integration_ops_log_full_payload_for_remark() {
    // The ops_log entry for remark.upsert must store body + targets so crash
    // recovery can replay the operation.
    let store = setup!();

    let targets = vec![crate::remark::RemarkTarget {
        row_id: "row1".into(),
        column_id: "stars".into(),
    }];
    store
        .upsert_remark(
            "remark_payload",
            "Important body",
            "note",
            false,
            None,
            &targets,
        )
        .await
        .unwrap();

    let Some(pool) = store.direct_pool().await else {
        return;
    };
    let payload: serde_json::Value = sqlx::query_scalar(
        "SELECT payload FROM operations_log \
         WHERE op = 'remark.upsert' ORDER BY id DESC LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(
        payload["body"], "Important body",
        "body missing from ops log payload"
    );
    assert!(
        payload["targets"].is_array(),
        "targets missing from ops log payload"
    );
    assert!(
        !payload["targets"].as_array().unwrap().is_empty(),
        "targets array is empty"
    );
}

// ── Multi-store merge / timing tests ─────────────────────────────────────────

#[tokio::test]
async fn live_db_read_merges_from_both_stores() {
    // A write should be visible in list results without duplicates.
    let store = setup!();
    let flag_key = "flag_merge_read";

    store
        .upsert_flag(&nanoid::nanoid!(), flag_key, "orange")
        .await
        .unwrap();

    let found: Vec<_> = store
        .list_flags()
        .await
        .unwrap()
        .into_iter()
        .filter(|f| f.key == flag_key)
        .collect();
    assert_eq!(
        found.len(),
        1,
        "expected exactly one merged flag (got {})",
        found.len()
    );
    assert_eq!(found[0].color, "orange");
}

#[tokio::test]
async fn live_db_timing_is_logged_for_reads_and_writes() {
    let store = setup!();
    let (table_id, row_id) = ("rows_timing", "row_timing");

    let row = store
        .create_row(table_id, row_id, Some("Timing test"), None)
        .await
        .unwrap();
    assert_eq!(row["id"].as_str().unwrap_or(""), row_id);

    let page = store
        .list_data_rows(
            table_id,
            &RowQuery {
                page: 1,
                per_page: 50,
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert!(page.data.iter().any(|r| r["id"] == row_id));
}

#[tokio::test]
async fn live_db_per_request_timeout_override() {
    // A per-request read_timeout_secs must be honoured without error.
    let store = setup!();

    store
        .create_row("rows_timeout", "row_timeout", Some("Timeout test"), None)
        .await
        .unwrap();

    let page = store
        .list_data_rows(
            "rows_timeout",
            &RowQuery {
                page: 1,
                per_page: 50,
                read_timeout_secs: Some(30),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert!(page.total >= 1);
}
