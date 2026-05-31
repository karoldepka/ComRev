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
        name: &str,
        label: Option<&str>,
        description: Option<&str>,
        expression: Option<&str>,
        position_after: Option<&str>,
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
    // Fire-and-forget: errors are logged internally; callers do not need to handle them.
    // tx_id groups related operations from one client transaction; None for standalone ops.
    async fn append_ops_log(&self, op: &str, payload: serde_json::Value, tx_id: Option<&str>);

    // ── GitHub repos batch upsert ─────────────────────────────────────────────
    /// Upsert a batch of raw GitHub repo objects (from star_diff_rs). Returns the upserted count.
    async fn upsert_github_repos_batch(&self, repos: &[serde_json::Value]) -> Result<usize>;
}

pub mod multi;

/// Construct the appropriate store from DATABASE_URL.
pub async fn open(url: &str) -> Result<Arc<dyn DataStore>> {
    if url.starts_with("sqlite") {
        Ok(Arc::new(sqlite::SqliteStore))
    } else if url.starts_with("surreal") || url.starts_with("wss://") || url.starts_with("ws://") {
        Ok(Arc::new(surreal::SurrealStore::connect(url).await?))
    } else if url.starts_with("mongodb") {
        Ok(Arc::new(mongo::MongoStore))
    } else {
        // Covers postgres:// and postgresql://
        Ok(Arc::new(PgStore::connect(url).await?))
    }
}

/// Construct a multi-store when secondary URLs are provided, or a single store otherwise.
/// `secondary_urls` is a comma-separated list of additional database URLs.
pub async fn open_multi(
    primary_url: &str,
    secondary_urls: Option<&str>,
) -> Result<Arc<dyn DataStore>> {
    let primary = open(primary_url).await?;
    let secondaries: Vec<&str> = secondary_urls
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    if secondaries.is_empty() {
        return Ok(primary);
    }
    let mut stores = vec![primary];
    for url in secondaries {
        stores.push(open(url).await?);
    }
    Ok(Arc::new(multi::MultiStore::new(stores)))
}
