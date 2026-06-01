// Pluggable persistence layer.
//
// Add a new backend by implementing `DataStore` and adding a URL-prefix branch in `open()`.

use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;

use crate::custom_column::CustomColumn;

/// An ops log entry that has not yet been applied (applied_at IS NULL).
#[derive(Debug, Clone)]
pub struct PendingOp {
    pub id: String,
    pub op: String,
    pub payload: serde_json::Value,
    pub tx_id: Option<String>,
}

pub fn table_registry_columns() -> Vec<CustomColumn> {
    [
        ("id", "ID", "text"),
        ("title", "Title", "text"),
        ("description", "Description", "text"),
        ("who_created", "Created by", "text"),
        ("when_created", "Created", "timestamptz"),
        ("who_last_modified", "Modified by", "text"),
        ("when_last_modified", "Modified", "timestamptz"),
        ("modify_count", "Modify count", "integer"),
    ]
    .into_iter()
    .map(|(name, label, ty)| CustomColumn {
        id: name.to_string(),
        name: name.to_string(),
        label: Some(label.to_string()),
        description: None,
        expression: None,
        position_after: None,
        read_only: true,
        types: vec![ty.to_string()],
        source_path: None,
        data_types: vec![if ty == "integer" { "numeric" } else { "text" }.to_string()],
        is_group: false,
        parent_ids: vec![],
        is_frozen: name == "title",
    })
    .collect()
}

pub mod couch;
pub mod mongo;
pub mod pg;
mod pg_schema;
pub mod sqlite;
pub mod surreal;
#[cfg(test)]
pub mod tests_integration;

pub use pg::PgStore;

#[async_trait]
pub trait DataStore: Send + Sync {
    async fn ensure_schema(&self) -> Result<()>;

    // ── Flags ─────────────────────────────────────────────────────────────────

    async fn list_flags(&self) -> Result<Vec<crate::flag::CellFlag>>;
    async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> Result<crate::flag::CellFlag>;
    async fn delete_flag(&self, key: &str) -> Result<()>;

    // ── Remarks ───────────────────────────────────────────────────────────────

    async fn list_remarks(&self) -> Result<Vec<crate::remark::Remark>>;
    async fn upsert_remark(
        &self,
        id: &str,
        body: &str,
        kind: &str,
        is_private: bool,
        resolved_at: Option<chrono::DateTime<chrono::Utc>>,
        targets: &[crate::remark::RemarkTarget],
    ) -> Result<crate::remark::Remark>;
    async fn delete_remark(&self, id: &str) -> Result<()>;

    // ── Hidden rows ───────────────────────────────────────────────────────────
    async fn list_hidden_rows(&self) -> Result<Vec<crate::hidden_row::HiddenRow>>;
    async fn add_hidden_row(&self, id: &str, row_id: &str) -> Result<crate::hidden_row::HiddenRow>;
    async fn remove_hidden_row(&self, row_id: &str) -> Result<()>;

    // ── Hidden columns ────────────────────────────────────────────────────────
    async fn list_hidden_columns(&self) -> Result<Vec<crate::hidden_column::HiddenColumn>>;
    async fn add_hidden_column(
        &self,
        id: &str,
        column_id: &str,
    ) -> Result<crate::hidden_column::HiddenColumn>;
    async fn remove_hidden_column(&self, column_id: &str) -> Result<()>;

    // ── Custom columns ────────────────────────────────────────────────────────

    async fn list_custom_columns(
        &self,
        table_id: &str,
    ) -> Result<Vec<crate::custom_column::CustomColumn>>;
    async fn upsert_custom_column(
        &self,
        table_id: &str,
        id: &str,
        input: &crate::custom_column::CustomColumnInput,
    ) -> Result<crate::custom_column::CustomColumn>;
    async fn delete_custom_column(&self, id: &str) -> Result<()>;
    async fn set_table_column_frozen(
        &self,
        table_id: &str,
        column_id: &str,
        is_frozen: bool,
    ) -> Result<crate::custom_column::CustomColumn>;

    // ── Tables registry ───────────────────────────────────────────────────────

    async fn list_tables(&self) -> Result<Vec<crate::table::Table>>;
    async fn create_table(
        &self,
        id: &str,
        title: &str,
        description: Option<&str>,
        who_created: Option<&str>,
    ) -> Result<crate::table::Table>;
    async fn patch_table(
        &self,
        id: &str,
        title: Option<&str>,
        description: Option<&str>,
        who_last_modified: Option<&str>,
    ) -> Result<crate::table::Table>;
    async fn delete_table(&self, id: &str) -> Result<()>;

    // ── Rows / items ──────────────────────────────────────────────────────────

    async fn list_data_rows(
        &self,
        table_id: &str,
        params: &crate::types::RowQuery,
    ) -> Result<crate::types::PagedResponse>;

    /// Create a new row (idempotent: if `row_id` already exists the existing row is returned).
    async fn create_row(
        &self,
        table_id: &str,
        row_id: &str,
        title: Option<&str>,
        who_created: Option<&str>,
    ) -> Result<crate::data_row::TableRow>;

    /// Updates a single column value for a row without touching other columns.
    /// Implementations must ensure concurrent edits to different columns do not overwrite each other.
    async fn patch_row_value(
        &self,
        table_id: &str,
        row_id: &str,
        col_id: &str,
        value: serde_json::Value,
    ) -> Result<()>;

    // ── Ops log ──────────────────────────────────────────────────────────────
    // Both methods are fire-and-forget; errors are logged internally.
    // `id` is a nanoid shared across all stores for a single logical operation.
    // `tx_id` groups related operations from one client transaction; None for standalone ops.

    /// Insert a pending log entry (applied_at = NULL) before the write. Idempotent.
    async fn begin_ops_log(&self, id: &str, op: &str, payload: serde_json::Value, tx_id: Option<&str>);

    /// Mark the log entry applied (applied_at = now()) after a successful write. Idempotent.
    async fn mark_op_applied(&self, id: &str);

    /// Return all ops log entries that have not yet been applied (applied_at IS NULL).
    /// Used at startup to replay any ops that were logged before a crash.
    async fn pending_ops(&self) -> anyhow::Result<Vec<PendingOp>>;

    // ── GitHub repos batch upsert ─────────────────────────────────────────────
    /// Upsert a batch of raw GitHub repo objects (from star_diff_rs). Returns the upserted count.
    async fn upsert_github_repos_batch(&self, repos: &[serde_json::Value]) -> Result<usize>;

    /// Upsert a batch of rows into any table. Each element is a JSON object; the row id is taken
    /// from the "id" field (falling back to "github_id" as a string). Everything becomes custom_values.
    async fn upsert_rows_batch(&self, table_id: &str, rows: &[serde_json::Value]) -> Result<usize>;
}

pub mod multi_db;

/// Construct the appropriate store from DATABASE_URL.
pub async fn open(url: &str) -> Result<Arc<dyn DataStore>> {
    if url.starts_with("sqlite") {
        Ok(Arc::new(sqlite::SqliteStore))
    } else if url.starts_with("surreal") || url.starts_with("wss://") || url.starts_with("ws://") {
        Ok(Arc::new(surreal::SurrealStore::connect(url).await?))
    } else if url.starts_with("mongodb") {
        Ok(Arc::new(mongo::MongoStore::connect(url).await?))
    } else if url.starts_with("http://") || url.starts_with("https://") {
        Ok(Arc::new(couch::CouchStore::connect(url).await?))
    } else {
        // Covers postgres:// and postgresql://
        Ok(Arc::new(PgStore::connect(url).await?))
    }
}

/// Construct a MultiStore from a list of DB URLs. All stores have equal standing.
/// Always returns a MultiStore (even for one URL) so ops log wrapping is guaranteed.
/// Stores that fail to connect are logged and skipped; at least one must succeed.
pub async fn open_all(urls: &[&str]) -> Result<Arc<dyn DataStore>> {
    anyhow::ensure!(!urls.is_empty(), "DB_URLS must contain at least one URL");
    let mut stores = Vec::with_capacity(urls.len());
    for url in urls {
        match open(url).await {
            Ok(s) => stores.push(s),
            Err(e) => {
                let short = url.split('@').last().unwrap_or(url);
                tracing::error!("store connection failed for {short}, skipping: {e:#}");
                eprintln!("[store] FAILED to connect to {short}: {e:#}");
            }
        }
    }
    anyhow::ensure!(!stores.is_empty(), "all store connections failed — cannot start");
    Ok(Arc::new(multi_db::MultiStore::new(stores)))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── table_registry_columns ────────────────────────────────────────────────

    #[test]
    fn registry_columns_non_empty() {
        assert!(!table_registry_columns().is_empty());
    }

    #[test]
    fn registry_columns_include_id_and_title() {
        let cols = table_registry_columns();
        let names: Vec<&str> = cols.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"id"),    "missing id column");
        assert!(names.contains(&"title"), "missing title column");
    }

    #[test]
    fn registry_columns_all_read_only() {
        for col in table_registry_columns() {
            assert!(col.read_only, "column '{}' should be read_only", col.name);
        }
    }

    #[test]
    fn registry_columns_title_is_frozen() {
        let cols = table_registry_columns();
        let title = cols.iter().find(|c| c.name == "title").expect("title column missing");
        assert!(title.is_frozen, "title column should be frozen");
    }

    #[test]
    fn registry_columns_non_title_not_frozen() {
        for col in table_registry_columns() {
            if col.name != "title" {
                assert!(!col.is_frozen, "column '{}' should not be frozen", col.name);
            }
        }
    }

    #[test]
    fn registry_columns_ids_match_names() {
        for col in table_registry_columns() {
            assert_eq!(col.id, col.name, "id and name must match for column '{}'", col.name);
        }
    }

    #[test]
    fn registry_columns_all_have_labels() {
        for col in table_registry_columns() {
            assert!(col.label.is_some(), "column '{}' missing label", col.name);
        }
    }

    #[test]
    fn registry_columns_have_valid_types() {
        let valid = ["text", "timestamptz", "integer", "numeric", "boolean", "array", "jsonb", "url"];
        for col in table_registry_columns() {
            for t in &col.types {
                assert!(valid.contains(&t.as_str()), "column '{}' has unknown type '{t}'", col.name);
            }
        }
    }

    #[test]
    fn registry_columns_no_groups_no_parents() {
        for col in table_registry_columns() {
            assert!(!col.is_group, "registry column '{}' should not be a group", col.name);
            assert!(col.parent_ids.is_empty(), "registry column '{}' should have no parents", col.name);
        }
    }
}
