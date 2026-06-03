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
    /// DB-generated monotonic serial — authoritative insertion order for replay.
    pub seq: Option<i64>,
    pub id: String,
    pub op: String,
    pub payload: serde_json::Value,
    pub when_created: chrono::DateTime<chrono::Utc>,
    pub who_created: Option<String>,
    /// Populated for future transaction-grouped crash recovery; not yet consumed by the replayer.
    #[allow(dead_code)]
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
    .map(|(id, display, ty)| CustomColumn {
        id: id.to_string(),
        title: Some(display.to_string()),
        description: None,
        expression: None,
        position_before: None,
        position_after: None,
        read_only: true,
        types: vec![ty.to_string()],
        source_path: None,
        data_types: vec![if ty == "integer" { "numeric" } else { "text" }.to_string()],
        is_group: false,
        parent_ids: vec![],
        is_frozen: id == "title",
    })
    .collect()
}

/// Columns for the "tables" meta-table view.
/// `title` and `description` are editable; all others are read-only.
pub fn table_view_columns() -> Vec<CustomColumn> {
    table_registry_columns()
        .into_iter()
        .map(|mut c| {
            if c.id == "title" || c.id == "description" {
                c.read_only = false;
            }
            if c.id == "id" {
                c.is_frozen = true;
            }
            c
        })
        .collect()
}

pub mod pg;
mod pg_schema;
#[cfg(test)]
pub mod tests_integration;

pub use pg::PgStore;

#[async_trait]
pub trait DataStore: Send + Sync {
    async fn ensure_schema(&self) -> Result<()>;

    /// Delete all user data while keeping the schema (tables, indexes, triggers
    /// remain intact).  Much faster than `nuke_db` and the schema does not need
    /// to be re-applied afterwards.  IRREVERSIBLE.
    async fn nuke_user_data(&self) -> Result<()>;

    /// Drop every table / collection and recreate the schema from scratch.
    /// Use `nuke_user_data` instead when you only need to clear rows.  IRREVERSIBLE.
    async fn nuke_db(&self) -> Result<()>;

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

    /// Directly set (or clear) the source_path for a column. None = clear.
    async fn set_column_source_path(
        &self,
        column_id: &str,
        path: Option<&[String]>,
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
    ) -> Result<serde_json::Value>;

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
    async fn begin_ops_log(
        &self,
        id: &str,
        op: &str,
        payload: serde_json::Value,
        tx_id: Option<&str>,
    );

    /// Mark the log entry applied (applied_at = now()) after a successful write. Idempotent.
    async fn mark_op_applied(&self, id: &str);

    /// Return all ops log entries that have not yet been applied (applied_at IS NULL).
    /// Used at startup to replay any ops that were logged before a crash.
    async fn pending_ops(&self) -> anyhow::Result<Vec<PendingOp>>;

    /// Upsert a batch of rows into any table. Each element is a JSON object; the row id is taken
    /// from the "id" field (falling back to "github_id" as a string). Everything becomes custom_values.
    async fn upsert_rows_batch(&self, table_id: &str, rows: &[serde_json::Value]) -> Result<usize>;
}

pub mod multi_db;

/// Open a Postgres store scoped to an isolated schema.
///
/// Creates the schema if it doesn't exist and pins the search_path on every
/// connection. Intended for integration tests: each test generates a unique
/// schema name, enabling parallel runs without data interference.
/// Call `DROP SCHEMA … CASCADE` to clean up after the test.
pub async fn open_pg_isolated(db_id: &str, url: &str, schema: &str) -> Result<Arc<dyn DataStore>> {
    let pg = Arc::new(pg::PgStore::connect_with_schema(db_id, url, schema, 1).await?);
    Ok(Arc::new(multi_db::MultiStore::new(vec![pg], None)))
}

/// Construct a Postgres store from a DB URL (must start with `postgres://` or `postgresql://`).
pub async fn open(db_id: &str, url: &str) -> Result<Arc<dyn DataStore>> {
    let short = url.split('@').last().unwrap_or(url);
    tracing::debug!(db_id, url = short, "store: opening connection");
    // Covers postgres:// and postgresql://
    Ok(Arc::new(PgStore::connect(db_id, url).await?))
}

/// Construct a MultiStore from a list of `(db_id, url)` pairs. All stores have equal standing.
/// Always returns a MultiStore (even for one entry) so ops log wrapping is guaranteed.
/// Stores that fail to connect are logged and skipped; at least one must succeed.
pub async fn open_all(
    entries: &[(&str, &str)],
    event_tx: Option<crate::sync_service::EventTx>,
) -> Result<Arc<dyn DataStore>> {
    anyhow::ensure!(!entries.is_empty(), "DB_URLS must contain at least one URL");
    let mut stores = Vec::with_capacity(entries.len());
    for (db_id, url) in entries {
        let short = url.split('@').last().unwrap_or(url);
        match open(db_id, url).await {
            Ok(s) => {
                tracing::info!(db_id, url = short, "store: connected");
                stores.push(s);
            }
            Err(e) => {
                tracing::error!(db_id, url = short, error = %e, "store: connection failed, skipping");
            }
        }
    }
    anyhow::ensure!(
        !stores.is_empty(),
        "all {} store connection(s) failed — cannot start",
        entries.len()
    );
    tracing::info!(
        connected = stores.len(),
        attempted = entries.len(),
        "store: open_all complete"
    );
    Ok(Arc::new(multi_db::MultiStore::new(stores, event_tx)))
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
        let ids: Vec<&str> = cols.iter().map(|c| c.id.as_str()).collect();
        assert!(ids.contains(&"id"), "missing id column");
        assert!(ids.contains(&"title"), "missing title column");
    }

    #[test]
    fn registry_columns_all_read_only() {
        for col in table_registry_columns() {
            assert!(col.read_only, "column '{}' should be read_only", col.id);
        }
    }

    #[test]
    fn registry_columns_title_is_frozen() {
        let cols = table_registry_columns();
        let title = cols
            .iter()
            .find(|c| c.id == "title")
            .expect("title column missing");
        assert!(title.is_frozen, "title column should be frozen");
    }

    #[test]
    fn registry_columns_non_title_not_frozen() {
        for col in table_registry_columns() {
            if col.id != "title" {
                assert!(!col.is_frozen, "column '{}' should not be frozen", col.id);
            }
        }
    }

    #[test]
    fn registry_columns_all_have_titles() {
        for col in table_registry_columns() {
            assert!(col.title.is_some(), "column '{}' missing title", col.id);
        }
    }

    #[test]
    fn registry_columns_have_valid_types() {
        let valid = [
            "text",
            "timestamptz",
            "integer",
            "numeric",
            "boolean",
            "array",
            "jsonb",
            "url",
        ];
        for col in table_registry_columns() {
            for t in &col.types {
                assert!(
                    valid.contains(&t.as_str()),
                    "column '{}' has unknown type '{t}'",
                    col.id
                );
            }
        }
    }

    #[test]
    fn registry_columns_no_groups_no_parents() {
        for col in table_registry_columns() {
            assert!(
                !col.is_group,
                "registry column '{}' should not be a group",
                col.id
            );
            assert!(
                col.parent_ids.is_empty(),
                "registry column '{}' should have no parents",
                col.id
            );
        }
    }
}
