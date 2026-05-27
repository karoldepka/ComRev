// Pluggable persistence layer.
//
// Add a new backend by implementing `DataStore` and adding a URL-prefix branch in `open()`.

use std::sync::Arc;
use anyhow::Result;
use async_trait::async_trait;

pub mod pg;
pub mod sqlite;
pub mod surreal;
pub mod mongo;

pub use pg::PgStore;
pub use sqlite::SqliteStore;

#[async_trait]
pub trait DataStore: Send + Sync {
    async fn ensure_schema(&self) -> Result<()>;

    // ── Flags ─────────────────────────────────────────────────────────────────

    async fn list_flags(&self) -> Result<Vec<crate::flag::CellFlag>>;
    async fn upsert_flag(&self, key: &str, color: &str) -> Result<crate::flag::CellFlag>;
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
    async fn add_hidden_row(&self, repo_id: i64) -> Result<crate::hidden_row::HiddenRow>;
    async fn remove_hidden_row(&self, repo_id: i64) -> Result<()>;

    // ── Hidden columns ────────────────────────────────────────────────────────

    async fn list_hidden_columns(&self) -> Result<Vec<crate::hidden_column::HiddenColumn>>;
    async fn add_hidden_column(&self, column_id: &str) -> Result<crate::hidden_column::HiddenColumn>;
    async fn remove_hidden_column(&self, column_id: &str) -> Result<()>;

    // ── Custom columns ────────────────────────────────────────────────────────

    async fn list_custom_columns(&self) -> Result<Vec<crate::custom_column::CustomColumn>>;
    async fn upsert_custom_column(
        &self,
        id: &str,
        name: &str,
        label: Option<&str>,
        expression: Option<&str>,
        position_after: Option<&str>,
    ) -> Result<crate::custom_column::CustomColumn>;
    async fn delete_custom_column(&self, id: &str) -> Result<()>;

    // ── Repos (PG-specific; other backends return Err) ────────────────────────

    async fn list_repos(&self, params: &crate::types::RepoQuery) -> Result<crate::types::PagedResponse>;

    // ── Ops log (fire-and-forget; MUST NOT propagate errors) ─────────────────
    // tx_id groups related operations from one client transaction; None for standalone ops.
    async fn append_ops_log(&self, op: &str, payload: serde_json::Value, tx_id: Option<&str>);
}

/// Construct the appropriate store from DATABASE_URL.
pub async fn open(url: &str) -> Result<Arc<dyn DataStore>> {
    if url.starts_with("sqlite") {
        Ok(Arc::new(SqliteStore::connect(url).await?))
    } else if url.starts_with("surreal") {
        Ok(Arc::new(surreal::SurrealStore))
    } else if url.starts_with("mongodb") {
        Ok(Arc::new(mongo::MongoStore))
    } else {
        // Covers postgres:// and postgresql://
        Ok(Arc::new(PgStore::connect(url).await?))
    }
}
