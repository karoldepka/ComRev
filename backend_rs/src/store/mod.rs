// Pluggable persistence layer.
//
// Add a new backend by implementing `DataStore` and adding a URL-prefix branch in `open()`.

use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;

pub mod mongo;
pub mod pg;
pub mod sqlite;
pub mod surreal;

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

    async fn list_custom_columns(&self) -> Result<Vec<crate::custom_column::CustomColumn>>;
    async fn upsert_custom_column(
        &self,
        id: &str,
        name: &str,
        label: Option<&str>,
        description: Option<&str>,
        expression: Option<&str>,
        position_after: Option<&str>,
    ) -> Result<crate::custom_column::CustomColumn>;
    async fn delete_custom_column(&self, id: &str) -> Result<()>;

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

    async fn list_repos(
        &self,
        params: &crate::types::RowQuery,
    ) -> Result<crate::types::PagedResponse>;

    /// Updates a single column value for a row without touching other columns.
    /// Implementations must ensure concurrent edits to different columns do not overwrite each other.
    async fn patch_row_value(
        &self,
        table_id: &str,
        row_id: &str,
        col_id: &str,
        value: serde_json::Value,
    ) -> Result<()>;

    // ── Ops log (propagates errors to frontend) ─────────────────────────────
    // tx_id groups related operations from one client transaction; None for standalone ops.
    async fn append_ops_log(
        &self,
        op: &str,
        payload: serde_json::Value,
        tx_id: Option<&str>,
    ) -> Result<()>;
}

/// Construct the appropriate store from DATABASE_URL.
pub async fn open(url: &str) -> Result<Arc<dyn DataStore>> {
    if url.starts_with("sqlite") {
        Ok(Arc::new(sqlite::SqliteStore))
    } else if url.starts_with("surreal") {
        Ok(Arc::new(surreal::SurrealStore))
    } else if url.starts_with("mongodb") {
        Ok(Arc::new(mongo::MongoStore))
    } else {
        // Covers postgres:// and postgresql://
        Ok(Arc::new(PgStore::connect(url).await?))
    }
}
