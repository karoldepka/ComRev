/// Integration tests against real database instances.
///
/// Tests run automatically when `databases.toml` (and `databases.secrets.toml`)
/// are present and credentials are valid. They skip gracefully otherwise.
///
///   cargo test integration
///
/// Credentials are loaded from `databases.toml` / `databases.secrets.toml` in the
/// backend_rs/ directory (the same files the server uses at startup).
/// Legacy env vars still work as a fallback:
///   DB_URLS, DATABASE_URL, SURREAL_URL
///
/// SurrealDB always uses the isolated test namespace/database:
///   SURREAL_TEST_NS=_test  (default)
///   SURREAL_TEST_DB=_test  (default)
///
/// Tests always write to the `_test` namespace/DB for Surreal and to
/// `_test_`-prefixed table IDs for Postgres (which creates `t__test_*` physical
/// tables). Cleanup runs before each test.
use super::{open_all, DataStore};
use crate::types::RowQuery;
use std::sync::Arc;

// ── Env helpers ───────────────────────────────────────────────────────────────

fn load_env() {
    dotenvy::dotenv().ok();
}

/// All configured DB URLs — tries databases.toml first, then env vars.
fn all_db_urls() -> Vec<String> {
    load_env();
    // databases.toml takes precedence (same source the server uses).
    if let Ok(Some(entries)) = crate::db_config::load() {
        if !entries.is_empty() {
            return entries.into_iter().map(|(_, url)| url).collect();
        }
    }
    // Fall back to legacy env vars.
    if let Ok(raw) = std::env::var("rem") {
        let urls: Vec<String> = raw.split(',').map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned).collect();
        if !urls.is_empty() { return urls; }
    }
    let mut urls = Vec::new();
    if let Ok(u) = std::env::var("DATABASE_URL") { if !u.is_empty() { urls.push(u); } }
    if let Ok(u) = std::env::var("SURREAL_URL")  { if !u.is_empty() { urls.push(u); } }
    urls
}

/// Returns the first Postgres URL (for direct cleanup queries).
fn pg_url() -> Option<String> {
    all_db_urls().into_iter().find(|u| u.starts_with("postgres"))
}

/// Returns the first SurrealDB URL (for direct cleanup queries).
fn surreal_url() -> Option<String> {
    all_db_urls().into_iter()
        .find(|u| u.starts_with("surreal") || u.starts_with("wss://") || u.starts_with("ws://"))
}

/// Override SURREAL_NS and SURREAL_DB with test-specific values so tests never
/// touch the production namespace/database.
fn use_test_surreal_db() {
    load_env();
    let test_ns = std::env::var("SURREAL_TEST_NS").unwrap_or_else(|_| "_test".into());
    let test_db = std::env::var("SURREAL_TEST_DB").unwrap_or_else(|_| "_test".into());
    // Safety: tests must run with --test-threads=1; env mutation is not thread-safe.
    unsafe {
        std::env::set_var("SURREAL_NS", &test_ns);
        std::env::set_var("SURREAL_DB", &test_db);
    }
}

/// Build (once) or retrieve the shared store.
/// One pool is shared across all tests to stay within PgBouncer's session-mode limit.
async fn make_store() -> Option<Arc<dyn DataStore>> {
    static INIT: tokio::sync::OnceCell<Option<Arc<dyn DataStore>>> = tokio::sync::OnceCell::const_new();

    INIT.get_or_init(|| async {
        // Tests don't call main(), so we install the rustls provider here.
        let _ = rustls::crypto::ring::default_provider().install_default();
        use_test_surreal_db();

        let entries: Vec<(String, String)> = match crate::db_config::load() {
            Ok(Some(entries)) => entries,
            Ok(None) => {
                let urls = all_db_urls();
                if urls.is_empty() {
                    eprintln!("skip: no DB URLs configured (databases.toml absent and no DB_URLS/DATABASE_URL)");
                    return None;
                }
                urls.into_iter().enumerate().map(|(i, u)| (format!("db_{i}"), u)).collect()
            }
            Err(e) => { eprintln!("db_config::load error: {e}"); return None; }
        };

        if entries.is_empty() {
            eprintln!("skip: databases.toml has no [[database]] entries");
            return None;
        }

        let entry_refs: Vec<(&str, &str)> =
            entries.iter().map(|(id, url)| (id.as_str(), url.as_str())).collect();
        let store = match open_all(&entry_refs, None).await {
            Ok(s) => s,
            Err(e) => { eprintln!("Failed to open store: {e}"); return None; }
        };
        if let Err(e) = store.ensure_schema().await {
            eprintln!("ensure_schema failed: {e}");
            return None;
        }
        Some(store)
    }).await.clone()
}

// ── Postgres cleanup helpers (direct sqlx) ────────────────────────────────────

async fn pg_cleanup(url: &str) {
    let Ok(pool) = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect(url).await else { return };

    // Drop per-user physical tables for test table IDs (named t__test_*).
    // LEFT() avoids LIKE underscore-wildcard escaping issues.
    let test_tables: Vec<String> = sqlx::query_scalar::<_, String>(
        "SELECT tablename FROM pg_tables \
         WHERE schemaname = 'public' AND LEFT(tablename, 8) = 't__test_'",
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    for tbl in &test_tables {
        let tbl_safe = tbl.replace('"', "");
        if let Err(e) = sqlx::query(&format!("DROP TABLE IF EXISTS \"{tbl_safe}\" CASCADE"))
            .execute(&pool).await
        {
            eprintln!("pg_cleanup: drop {tbl_safe}: {e}");
        }
    }

    for q in [
        "DELETE FROM cell_flags           WHERE key        LIKE '\\_test\\_%' ESCAPE '\\'",
        "DELETE FROM remark_targets       WHERE remark_id  LIKE '\\_test\\_%' ESCAPE '\\'",
        "DELETE FROM remarks              WHERE id         LIKE '\\_test\\_%' ESCAPE '\\'",
        "DELETE FROM hidden_rows          WHERE row_id     LIKE '\\_test\\_%' ESCAPE '\\'",
        "DELETE FROM hidden_columns       WHERE column_id  LIKE '\\_test\\_%' ESCAPE '\\'",
        "DELETE FROM table_custom_columns WHERE table_id   LIKE '\\_test\\_%' ESCAPE '\\'",
        "DELETE FROM custom_columns       WHERE id         LIKE '\\_test\\_%' ESCAPE '\\'",
        "DELETE FROM tables               WHERE id         LIKE '\\_test\\_%' ESCAPE '\\'",
        "DELETE FROM github_repos         WHERE id         LIKE '-999%'",
        "DELETE FROM operations_log       WHERE id         LIKE '\\_test\\_%' ESCAPE '\\'",
    ] {
        if let Err(e) = sqlx::query(q).execute(&pool).await {
            eprintln!("pg_cleanup: {e}");
        }
    }
}

// ── SurrealDB cleanup helpers (direct surrealdb) ──────────────────────────────

async fn surreal_cleanup() {
    load_env();
    let Some(url) = surreal_url() else {
        return;
    };
    let test_db = std::env::var("SURREAL_TEST_DB").unwrap_or_else(|_| "_test".into());
    let ns = std::env::var("SURREAL_TEST_NS").unwrap_or_else(|_| "_test".into());
    let Ok(db) = surrealdb::engine::any::connect(&url).await else {
        return;
    };
    let user = std::env::var("SURREAL_USER").unwrap_or_default();
    let pass = std::env::var("SURREAL_PASS").unwrap_or_default();
    if !user.is_empty() {
        let _ = db
            .signin(surrealdb::opt::auth::Root {
                username: user,
                password: pass,
            })
            .await;
    }
    let _ = db.use_ns(&ns).use_db(&test_db).await;
    for table in [
        "table_rows",
        "flags",
        "remarks",
        "hidden_rows",
        "hidden_columns",
        "custom_columns",
        "app_tables",
        "github_repos",
        "ops_log",
    ] {
        let _ = db.query(format!("DELETE {table}")).await;
    }
}

/// Convenience: clean both stores and return a connected store, or skip.
macro_rules! setup {
    () => {{
        let pg = pg_url();
        if let Some(ref u) = pg {
            pg_cleanup(u).await;
        }
        surreal_cleanup().await;
        match make_store().await {
            Some(s) => s,
            None => return,
        }
    }};
}

// ── Row tests ─────────────────────────────────────────────────────────────────

#[tokio::test]
async fn integration_create_and_read_row() {
    let store = setup!();
    let (table_id, row_id) = ("_test_rows", "_test_row_001");

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
async fn integration_create_row_idempotent() {
    let store = setup!();
    let (table_id, row_id) = ("_test_rows", "_test_row_idem");

    store
        .create_row(table_id, row_id, Some("First"), None)
        .await
        .unwrap();
    store
        .create_row(table_id, row_id, Some("Second"), None)
        .await
        .unwrap(); // same id

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
    let matching: Vec<_> = page.data.iter().filter(|r| r["id"] == row_id).collect();
    assert_eq!(
        matching.len(),
        1,
        "idempotent create produced duplicate rows"
    );
}

#[tokio::test]
async fn integration_patch_row_value_reflects() {
    let store = setup!();
    let (table_id, row_id) = ("_test_rows", "_test_row_patch");

    store
        .create_row(table_id, row_id, Some("Patch test"), None)
        .await
        .unwrap();
    store
        .patch_row_value(table_id, row_id, "status", serde_json::json!("verified"))
        .await
        .expect("patch_row_value failed");

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
    let found = page
        .data
        .iter()
        .find(|r| r["id"] == row_id)
        .expect("row not found");
    assert_eq!(found["status"], "verified");
}

#[tokio::test]
async fn integration_patch_different_columns_no_overwrite() {
    // Two consecutive patches to different columns must not overwrite each other.
    let store = setup!();
    let (table_id, row_id) = ("_test_rows", "_test_row_concurrent");

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
    let found = page
        .data
        .iter()
        .find(|r| r["id"] == row_id)
        .expect("row not found");
    assert_eq!(found["col_a"], "value_a", "col_a was overwritten");
    assert_eq!(found["col_b"], "value_b", "col_b was overwritten");
}

#[tokio::test]
async fn integration_upsert_rows_batch_idempotent() {
    let store = setup!();
    let table_id = "_test_batch_rows";

    let rows = vec![
        serde_json::json!({"id": "_test_br_001", "name": "Alpha", "stars": 10}),
        serde_json::json!({"id": "_test_br_002", "name": "Beta",  "stars": 20}),
    ];
    let count1 = store.upsert_rows_batch(table_id, &rows).await.unwrap();
    assert_eq!(count1, 2);

    // Second upsert with updated stars — must not duplicate
    let rows_updated = vec![
        serde_json::json!({"id": "_test_br_001", "name": "Alpha", "stars": 99}),
        serde_json::json!({"id": "_test_br_002", "name": "Beta",  "stars": 88}),
    ];
    store
        .upsert_rows_batch(table_id, &rows_updated)
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
async fn integration_upsert_rows_batch_preserves_user_columns() {
    let store = setup!();
    let table_id = "_test_batch_user_cols";

    // First upload: initial GitHub data.
    store
        .upsert_rows_batch(
            table_id,
            &[serde_json::json!({"id": "_test_uuc_001", "stars": 10, "name": "Repo"})],
        )
        .await
        .unwrap();

    // User adds a note to this row via patch_row_value.
    store
        .patch_row_value(table_id, "_test_uuc_001", "my_notes", serde_json::json!("keep me"))
        .await
        .unwrap();

    // Second upload: GitHub data refreshes stars, does NOT include my_notes.
    store
        .upsert_rows_batch(
            table_id,
            &[serde_json::json!({"id": "_test_uuc_001", "stars": 99, "name": "Repo"})],
        )
        .await
        .unwrap();

    let page = store
        .list_data_rows(
            table_id,
            &RowQuery { page: 1, per_page: 10, ..Default::default() },
        )
        .await
        .unwrap();
    let row = &page.data[0];
    assert_eq!(row["stars"], 99, "GitHub data must be refreshed");
    assert_eq!(row["my_notes"], "keep me", "user-added cell must survive re-upload");
}

// ── Flag tests ────────────────────────────────────────────────────────────────

#[tokio::test]
async fn integration_upsert_flag_no_duplicates() {
    let store = setup!();
    let (flag_id, flag_key) = (nanoid::nanoid!(), "_test_flag_dedup");

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
    let (flag_id, flag_key) = (nanoid::nanoid!(), "_test_flag_delete");

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
    let store = setup!();
    let id = "_test_remark_001";

    let remark = store
        .upsert_remark(id, "Initial body", "note", false, None, &[])
        .await
        .expect("upsert_remark failed");
    assert_eq!(remark.id, id);
    assert_eq!(remark.body, "Initial body");
    assert_eq!(remark.kind, "note");
    assert!(!remark.is_private);

    // Update body and switch to comment
    store
        .upsert_remark(id, "Updated body", "comment", true, None, &[])
        .await
        .unwrap();
    let remarks = store.list_remarks().await.unwrap();
    let found = remarks
        .iter()
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
    let store = setup!();
    let id = "_test_remark_targets";
    let targets = vec![
        crate::remark::RemarkTarget {
            row_id: "_test_row_1".into(),
            column_id: "stars".into(),
        },
        crate::remark::RemarkTarget {
            row_id: "_test_row_2".into(),
            column_id: "forks".into(),
        },
    ];

    store
        .upsert_remark(id, "Multi-target remark", "note", false, None, &targets)
        .await
        .unwrap();

    let remarks = store.list_remarks().await.unwrap();
    let found = remarks
        .iter()
        .find(|r| r.id == id)
        .expect("remark not found");
    assert_eq!(found.targets.len(), 2, "expected 2 targets");
    assert!(found.targets.iter().any(|t| t.column_id == "stars"));
    assert!(found.targets.iter().any(|t| t.column_id == "forks"));
}

#[tokio::test]
async fn integration_remark_resolve() {
    let store = setup!();
    let id = "_test_remark_resolve";

    store
        .upsert_remark(id, "To be resolved", "comment", false, None, &[])
        .await
        .unwrap();
    let found = store
        .list_remarks()
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.id == id)
        .unwrap();
    assert!(found.resolved_at.is_none());

    let resolved_at = chrono::Utc::now();
    store
        .upsert_remark(id, "Resolved", "comment", false, Some(resolved_at), &[])
        .await
        .unwrap();
    let found = store
        .list_remarks()
        .await
        .unwrap()
        .into_iter()
        .find(|r| r.id == id)
        .unwrap();
    assert!(found.resolved_at.is_some(), "resolved_at not set");
}

// ── Hidden row/column tests ───────────────────────────────────────────────────

#[tokio::test]
async fn integration_hidden_row_add_list_remove() {
    let store = setup!();
    let (id, row_id) = (nanoid::nanoid!(), "_test_hidden_row_001");

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
    let store = setup!();
    let (id, row_id) = (nanoid::nanoid!(), "_test_hidden_row_idem");

    store.add_hidden_row(&id, row_id).await.unwrap();
    store.add_hidden_row(&id, row_id).await.unwrap(); // same id — must not duplicate

    let rows: Vec<_> = store
        .list_hidden_rows()
        .await
        .unwrap()
        .into_iter()
        .filter(|r| r.row_id == row_id)
        .collect();
    assert_eq!(rows.len(), 1, "idempotent add produced duplicates");
}

#[tokio::test]
async fn integration_hidden_column_add_list_remove() {
    let store = setup!();
    let (id, col_id) = (nanoid::nanoid!(), "_test_hidden_col_001");

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
    let id = "_test_table_001";

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
async fn integration_table_create_idempotent() {
    let store = setup!();
    let id = "_test_table_idem";

    store
        .create_table(id, "First Title", None, None)
        .await
        .unwrap();
    store
        .create_table(id, "Second Title", None, None)
        .await
        .unwrap(); // same id — must not error or duplicate

    let tables: Vec<_> = store
        .list_tables()
        .await
        .unwrap()
        .into_iter()
        .filter(|t| t.id == id)
        .collect();
    assert_eq!(tables.len(), 1, "idempotent create produced duplicates");
}

// ── Custom column tests ───────────────────────────────────────────────────────

fn text_col(display_title: &str) -> crate::custom_column::CustomColumnInput {
    crate::custom_column::CustomColumnInput {
        title: Some(display_title.to_owned()),
        types: Some(vec!["text".to_owned()]),
        ..Default::default()
    }
}

#[tokio::test]
async fn integration_custom_column_upsert_and_list() {
    let store = setup!();
    let table_id = "_test_table_cols";
    store
        .create_table(table_id, "Col test table", None, None)
        .await
        .unwrap();

    let col = store
        .upsert_custom_column(table_id, "_test_col_name", &text_col("name"))
        .await
        .unwrap();
    assert_eq!(col.id, "_test_col_name");

    let cols = store.list_custom_columns(table_id).await.unwrap();
    assert!(
        cols.iter().any(|c| c.id == "_test_col_name"),
        "column not in list"
    );
}

#[tokio::test]
async fn integration_custom_column_group_with_sub_columns() {
    let store = setup!();
    let table_id = "_test_table_groups";
    store
        .create_table(table_id, "Group test", None, None)
        .await
        .unwrap();

    // Create parent group column
    let group_input = crate::custom_column::CustomColumnInput {
        title: Some("Owner".to_owned()),
        is_group: true,
        ..Default::default()
    };
    store
        .upsert_custom_column(table_id, "_test_col_owner", &group_input)
        .await
        .unwrap();

    // Create sub-column with parent_ids pointing to the group
    let sub_input = crate::custom_column::CustomColumnInput {
        title: Some("Login".to_owned()),
        parent_ids: vec!["_test_col_owner".to_owned()],
        types: Some(vec!["text".to_owned()]),
        ..Default::default()
    };
    store
        .upsert_custom_column(table_id, "_test_col_owner_login", &sub_input)
        .await
        .unwrap();

    let cols = store.list_custom_columns(table_id).await.unwrap();
    let group = cols
        .iter()
        .find(|c| c.id == "_test_col_owner")
        .expect("group col missing");
    let sub = cols
        .iter()
        .find(|c| c.id == "_test_col_owner_login")
        .expect("sub col missing");

    assert!(group.is_group);
    assert_eq!(sub.parent_ids, vec!["_test_col_owner"]);
}

#[tokio::test]
async fn integration_custom_column_delete() {
    let store = setup!();
    let table_id = "_test_table_coldel";
    store
        .create_table(table_id, "Del test", None, None)
        .await
        .unwrap();
    store
        .upsert_custom_column(table_id, "_test_col_del", &text_col("to_delete"))
        .await
        .unwrap();

    assert!(store
        .list_custom_columns(table_id)
        .await
        .unwrap()
        .iter()
        .any(|c| c.id == "_test_col_del"));

    store.delete_custom_column("_test_col_del").await.unwrap();
    assert!(
        !store
            .list_custom_columns(table_id)
            .await
            .unwrap()
            .iter()
            .any(|c| c.id == "_test_col_del"),
        "column still present after delete"
    );
}

#[tokio::test]
async fn integration_custom_column_freeze() {
    let store = setup!();
    let table_id = "_test_table_freeze";
    store
        .create_table(table_id, "Freeze test", None, None)
        .await
        .unwrap();
    store
        .upsert_custom_column(table_id, "_test_col_freeze", &text_col("freezable"))
        .await
        .unwrap();

    let col = store
        .set_table_column_frozen(table_id, "_test_col_freeze", true)
        .await
        .unwrap();
    assert!(col.is_frozen);

    let col = store
        .set_table_column_frozen(table_id, "_test_col_freeze", false)
        .await
        .unwrap();
    assert!(!col.is_frozen);
}

#[tokio::test]
async fn integration_custom_column_full_metadata_round_trips() {
    let store = setup!();
    let table_id = "_test_table_meta";
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
        .upsert_custom_column(table_id, "_test_col_stars", &input)
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
    let pg = match pg_url() {
        Some(u) => u,
        None => {
            eprintln!("skip");
            return;
        }
    };
    pg_cleanup(&pg).await;
    surreal_cleanup().await;
    let store = match make_store().await {
        Some(s) => s,
        None => return,
    };

    store
        .upsert_flag(&nanoid::nanoid!(), "_test_flag_ops_applied", "blue")
        .await
        .unwrap();

    let pool = sqlx::PgPool::connect(&pg).await.unwrap();
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM operations_log WHERE op = 'flag.upsert' AND applied_at IS NOT NULL",
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
    let store = setup!();

    store
        .upsert_flag(&nanoid::nanoid!(), "_test_flag_nopending", "blue")
        .await
        .unwrap();
    store
        .create_row("_test_nopending", "_test_row_nopending", None, None)
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
    // Verify that remark.upsert ops log stores body + targets so crash recovery works.
    let pg = match pg_url() {
        Some(u) => u,
        None => {
            eprintln!("skip");
            return;
        }
    };
    pg_cleanup(&pg).await;
    surreal_cleanup().await;
    let store = match make_store().await {
        Some(s) => s,
        None => return,
    };

    let targets = vec![crate::remark::RemarkTarget {
        row_id: "row1".into(),
        column_id: "stars".into(),
    }];
    store
        .upsert_remark(
            "_test_remark_payload",
            "Important body",
            "note",
            false,
            None,
            &targets,
        )
        .await
        .unwrap();

    let pool = sqlx::PgPool::connect(&pg).await.unwrap();
    let payload: serde_json::Value = sqlx::query_scalar(
        "SELECT payload FROM operations_log WHERE op = 'remark.upsert' ORDER BY id DESC LIMIT 1",
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

// ── Multi-store merge tests ───────────────────────────────────────────────────

#[tokio::test]
async fn live_db_read_merges_from_both_stores() {
    let store = setup!();
    let flag_key = "_test_flag_merge_read";

    store
        .upsert_flag(&nanoid::nanoid!(), flag_key, "orange")
        .await
        .unwrap();

    let flags = store.list_flags().await.unwrap();
    let found: Vec<_> = flags.iter().filter(|f| f.key == flag_key).collect();
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
    let (table_id, row_id) = ("_test_timing", "_test_row_timing");

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
    let store = setup!();
    store
        .create_row(
            "_test_timeout_override",
            "_test_row_to_override",
            Some("Timeout test"),
            None,
        )
        .await
        .unwrap();

    let page = store
        .list_data_rows(
            "_test_timeout_override",
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

#[tokio::test]
async fn integration_upsert_github_repos_no_duplicates() {
    let store = setup!();
    let repo = serde_json::json!({ "github_id": -999001, "name": "_test_/repo-dedup", "stars": 1 });

    store
        .upsert_github_repos_batch(&[repo.clone()])
        .await
        .unwrap();
    store.upsert_github_repos_batch(&[repo]).await.unwrap();

    let updated =
        serde_json::json!({ "github_id": -999001, "name": "_test_/repo-dedup", "stars": 99 });
    let count = store.upsert_github_repos_batch(&[updated]).await.unwrap();
    assert_eq!(count, 1);
}
