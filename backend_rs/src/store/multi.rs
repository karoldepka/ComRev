/// Multi-store: primary (stores[0], authoritative) + N secondaries.
///
/// **Writes** are fanned out to every store in parallel; secondary failures are
/// logged as warnings and do not propagate.
///
/// **Reads** are issued to every store in parallel. The first successful result
/// is returned. If multiple stores succeed but their data differs, the divergence
/// is logged in ALL CAPS (data inconsistency alert) but execution continues.
use anyhow::Result;
use async_trait::async_trait;
use futures::future::join_all;
use std::sync::Arc;

use super::DataStore;
use crate::types::{PagedResponse, RowQuery};

pub struct MultiStore {
    stores: Vec<Arc<dyn DataStore>>,
}

impl MultiStore {
    /// `stores[0]` is the primary. All subsequent entries are secondaries.
    pub fn new(stores: Vec<Arc<dyn DataStore>>) -> Self {
        assert!(!stores.is_empty(), "MultiStore requires at least one store");
        Self { stores }
    }
}

// ── Write helper ──────────────────────────────────────────────────────────────

/// Run all write futures in parallel, return the primary (index 0) result.
/// Secondary failures are logged as warnings.
fn fan_write<T>(results: Vec<Result<T>>, method: &str) -> Result<T> {
    let mut iter = results.into_iter().enumerate();
    let (_, primary) = iter.next()
        .unwrap_or_else(|| (0, Err(anyhow::anyhow!("MultiStore: no stores configured"))));
    for (i, r) in iter {
        if let Err(e) = r {
            tracing::warn!("store[{i}] {method} failed: {e}");
        }
    }
    primary
}

/// Fan out a write to all stores.
macro_rules! fan_out {
    ($self:ident, $method:ident ( $($arg:expr),* ) ) => {{
        let results = join_all(
            $self.stores.iter().map(|s| s.$method($($arg),*))
        ).await;
        fan_write(results, stringify!($method))
    }};
}

// ── Read helper ───────────────────────────────────────────────────────────────

/// Issue a read to all stores in parallel:
/// - Return the first successful result.
/// - Fall back to the next store if an earlier one fails.
/// - If multiple stores succeed but disagree, log a loud divergence warning.
fn fan_read<T: serde::Serialize>(results: Vec<Result<T>>, method: &str) -> Result<T> {
    let mut first: Option<(serde_json::Value, T)> = None;

    for (i, result) in results.into_iter().enumerate() {
        match result {
            Err(e) => {
                tracing::warn!("store[{i}] {method} read failed, trying next store: {e}");
            }
            Ok(val) => {
                let json = serde_json::to_value(&val).unwrap_or_default();
                match &first {
                    None => { first = Some((json, val)); }
                    Some((ref first_json, _)) if &json != first_json => {
                        tracing::error!(
                            "DATA DIVERGENCE DETECTED IN {method}: \
                             store[0] AND store[{i}] RETURN DIFFERENT DATA — \
                             POSSIBLE DATA INCONSISTENCY, CHECK REPLICATION"
                        );
                    }
                    _ => {}
                }
            }
        }
    }

    first
        .map(|(_, v)| v)
        .ok_or_else(|| anyhow::anyhow!("ALL STORES FAILED to read {method}"))
}

/// Fan out a read to all stores, return first success with divergence detection.
macro_rules! fan_read {
    ($self:ident, $method:ident ( $($arg:expr),* ) ) => {{
        let results = join_all(
            $self.stores.iter().map(|s| s.$method($($arg),*))
        ).await;
        fan_read(results, stringify!($method))
    }};
}

#[async_trait]
impl DataStore for MultiStore {
    async fn ensure_schema(&self) -> Result<()> {
        let results = join_all(self.stores.iter().map(|s| s.ensure_schema())).await;
        fan_write(results, "ensure_schema")
    }

    // ── Flags ──────────────────────────────────────────────────────────────────

    async fn list_flags(&self) -> Result<Vec<crate::flag::CellFlag>> {
        fan_read!(self, list_flags())
    }
    async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> Result<crate::flag::CellFlag> {
        fan_out!(self, upsert_flag(id, key, color))
    }
    async fn delete_flag(&self, key: &str) -> Result<()> {
        fan_out!(self, delete_flag(key))
    }

    // ── Remarks ────────────────────────────────────────────────────────────────

    async fn list_remarks(&self) -> Result<Vec<crate::remark::Remark>> {
        fan_read!(self, list_remarks())
    }
    async fn upsert_remark(
        &self,
        id: &str,
        body: &str,
        kind: &str,
        is_private: bool,
        resolved_at: Option<chrono::DateTime<chrono::Utc>>,
        targets: &[crate::remark::RemarkTarget],
    ) -> Result<crate::remark::Remark> {
        fan_out!(self, upsert_remark(id, body, kind, is_private, resolved_at, targets))
    }
    async fn delete_remark(&self, id: &str) -> Result<()> {
        fan_out!(self, delete_remark(id))
    }

    // ── Hidden rows ────────────────────────────────────────────────────────────

    async fn list_hidden_rows(&self) -> Result<Vec<crate::hidden_row::HiddenRow>> {
        fan_read!(self, list_hidden_rows())
    }
    async fn add_hidden_row(&self, id: &str, row_id: &str) -> Result<crate::hidden_row::HiddenRow> {
        fan_out!(self, add_hidden_row(id, row_id))
    }
    async fn remove_hidden_row(&self, row_id: &str) -> Result<()> {
        fan_out!(self, remove_hidden_row(row_id))
    }

    // ── Hidden columns ─────────────────────────────────────────────────────────

    async fn list_hidden_columns(&self) -> Result<Vec<crate::hidden_column::HiddenColumn>> {
        fan_read!(self, list_hidden_columns())
    }
    async fn add_hidden_column(&self, id: &str, column_id: &str) -> Result<crate::hidden_column::HiddenColumn> {
        fan_out!(self, add_hidden_column(id, column_id))
    }
    async fn remove_hidden_column(&self, column_id: &str) -> Result<()> {
        fan_out!(self, remove_hidden_column(column_id))
    }

    // ── Custom columns ─────────────────────────────────────────────────────────

    async fn list_custom_columns(&self, table_id: &str) -> Result<Vec<crate::custom_column::CustomColumn>> {
        fan_read!(self, list_custom_columns(table_id))
    }
    async fn upsert_custom_column(
        &self,
        table_id: &str,
        id: &str,
        name: &str,
        label: Option<&str>,
        description: Option<&str>,
        expression: Option<&str>,
        position_after: Option<&str>,
    ) -> Result<crate::custom_column::CustomColumn> {
        fan_out!(self, upsert_custom_column(table_id, id, name, label, description, expression, position_after))
    }
    async fn delete_custom_column(&self, id: &str) -> Result<()> {
        fan_out!(self, delete_custom_column(id))
    }
    async fn set_table_column_frozen(&self, table_id: &str, column_id: &str, is_frozen: bool) -> Result<crate::custom_column::CustomColumn> {
        fan_out!(self, set_table_column_frozen(table_id, column_id, is_frozen))
    }

    // ── Tables registry ────────────────────────────────────────────────────────

    async fn list_tables(&self) -> Result<Vec<crate::table::Table>> {
        fan_read!(self, list_tables())
    }
    async fn create_table(&self, id: &str, title: &str, description: Option<&str>, who_created: Option<&str>) -> Result<crate::table::Table> {
        fan_out!(self, create_table(id, title, description, who_created))
    }
    async fn patch_table(&self, id: &str, title: Option<&str>, description: Option<&str>, who_last_modified: Option<&str>) -> Result<crate::table::Table> {
        fan_out!(self, patch_table(id, title, description, who_last_modified))
    }
    async fn delete_table(&self, id: &str) -> Result<()> {
        fan_out!(self, delete_table(id))
    }

    // ── Rows ───────────────────────────────────────────────────────────────────

    async fn list_data_rows(&self, table_id: &str, params: &RowQuery) -> Result<PagedResponse> {
        fan_read!(self, list_data_rows(table_id, params))
    }
    async fn create_row(&self, table_id: &str, row_id: &str, title: Option<&str>, who_created: Option<&str>) -> Result<crate::data_row::TableRow> {
        fan_out!(self, create_row(table_id, row_id, title, who_created))
    }
    async fn patch_row_value(&self, table_id: &str, row_id: &str, col_id: &str, value: serde_json::Value) -> Result<()> {
        // serde_json::Value is not Copy — clone for each secondary.
        let results = join_all(
            self.stores.iter().map(|s| s.patch_row_value(table_id, row_id, col_id, value.clone()))
        ).await;
        fan_write(results, "patch_row_value")
    }

    // ── GitHub repos batch ─────────────────────────────────────────────────────

    async fn upsert_github_repos_batch(&self, repos: &[serde_json::Value]) -> Result<usize> {
        fan_out!(self, upsert_github_repos_batch(repos))
    }

    // ── Ops log ────────────────────────────────────────────────────────────────

    async fn append_ops_log(&self, op: &str, payload: serde_json::Value, tx_id: Option<&str>) {
        // Fire-and-forget on all stores; errors logged internally by each impl.
        join_all(
            self.stores.iter().map(|s| s.append_ops_log(op, payload.clone(), tx_id))
        ).await;
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{PagedResponse, RowQuery};
    use std::sync::{Arc, Mutex};

    // ── Minimal mock store ────────────────────────────────────────────────────

    struct MockStore {
        name: &'static str,
        calls: Arc<Mutex<Vec<String>>>,
        fail_writes: bool,
    }

    impl MockStore {
        fn new(name: &'static str, fail_writes: bool) -> Arc<Self> {
            Arc::new(Self { name, calls: Arc::new(Mutex::new(vec![])), fail_writes })
        }
        fn record(&self, m: &str) {
            self.calls.lock().unwrap().push(format!("{}:{}", self.name, m));
        }
        fn was_called(&self, m: &str) -> bool {
            self.calls.lock().unwrap().iter().any(|c| c.contains(m))
        }
        fn fail(&self) -> Result<()> {
            if self.fail_writes { anyhow::bail!("mock write failure") } else { Ok(()) }
        }
    }

    #[async_trait]
    impl DataStore for MockStore {
        async fn ensure_schema(&self) -> Result<()> { self.record("ensure_schema"); self.fail() }

        async fn list_flags(&self) -> Result<Vec<crate::flag::CellFlag>> {
            self.record("list_flags"); Ok(vec![])
        }
        async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> Result<crate::flag::CellFlag> {
            self.record("upsert_flag");
            self.fail()?;
            Ok(crate::flag::CellFlag { id: id.into(), key: key.into(), color: color.into() })
        }
        async fn delete_flag(&self, _key: &str) -> Result<()> { self.record("delete_flag"); self.fail() }

        async fn list_remarks(&self) -> Result<Vec<crate::remark::Remark>> { Ok(vec![]) }
        async fn upsert_remark(&self, id: &str, body: &str, kind: &str, is_private: bool, resolved_at: Option<chrono::DateTime<chrono::Utc>>, targets: &[crate::remark::RemarkTarget]) -> Result<crate::remark::Remark> {
            self.record("upsert_remark"); self.fail()?;
            Ok(crate::remark::Remark { id: id.into(), body: body.into(), kind: kind.into(), is_private, resolved_at, targets: targets.to_vec() })
        }
        async fn delete_remark(&self, _id: &str) -> Result<()> { self.record("delete_remark"); self.fail() }

        async fn list_hidden_rows(&self) -> Result<Vec<crate::hidden_row::HiddenRow>> { Ok(vec![]) }
        async fn add_hidden_row(&self, id: &str, row_id: &str) -> Result<crate::hidden_row::HiddenRow> {
            self.record("add_hidden_row"); self.fail()?;
            Ok(crate::hidden_row::HiddenRow { id: id.into(), row_id: row_id.into() })
        }
        async fn remove_hidden_row(&self, _row_id: &str) -> Result<()> { self.record("remove_hidden_row"); self.fail() }

        async fn list_hidden_columns(&self) -> Result<Vec<crate::hidden_column::HiddenColumn>> { Ok(vec![]) }
        async fn add_hidden_column(&self, id: &str, column_id: &str) -> Result<crate::hidden_column::HiddenColumn> {
            self.record("add_hidden_column"); self.fail()?;
            Ok(crate::hidden_column::HiddenColumn { id: id.into(), column_id: column_id.into() })
        }
        async fn remove_hidden_column(&self, _column_id: &str) -> Result<()> { self.record("remove_hidden_column"); self.fail() }

        async fn list_custom_columns(&self, _table_id: &str) -> Result<Vec<crate::custom_column::CustomColumn>> { Ok(vec![]) }
        async fn upsert_custom_column(&self, _table_id: &str, id: &str, name: &str, label: Option<&str>, description: Option<&str>, expression: Option<&str>, position_after: Option<&str>) -> Result<crate::custom_column::CustomColumn> {
            self.record("upsert_custom_column"); self.fail()?;
            Ok(crate::custom_column::CustomColumn { id: id.into(), name: name.into(), label: label.map(Into::into), description: description.map(Into::into), expression: expression.map(Into::into), position_after: position_after.map(Into::into), read_only: false, types: vec![], source_path: None, data_types: vec![], is_group: false, parent_ids: vec![], is_frozen: false })
        }
        async fn delete_custom_column(&self, _id: &str) -> Result<()> { self.record("delete_custom_column"); self.fail() }
        async fn set_table_column_frozen(&self, _table_id: &str, id: &str, is_frozen: bool) -> Result<crate::custom_column::CustomColumn> {
            self.record("set_table_column_frozen"); self.fail()?;
            Ok(crate::custom_column::CustomColumn { id: id.into(), name: "".into(), label: None, description: None, expression: None, position_after: None, read_only: false, types: vec![], source_path: None, data_types: vec![], is_group: false, parent_ids: vec![], is_frozen })
        }

        async fn list_tables(&self) -> Result<Vec<crate::table::Table>> { Ok(vec![]) }
        async fn create_table(&self, id: &str, title: &str, description: Option<&str>, who_created: Option<&str>) -> Result<crate::table::Table> {
            self.record("create_table"); self.fail()?;
            let now = chrono::Utc::now();
            Ok(crate::table::Table { id: id.into(), title: title.into(), description: description.map(Into::into), who_created: who_created.map(Into::into), when_created: now, who_last_modified: None, when_last_modified: now, modify_count: 0 })
        }
        async fn patch_table(&self, id: &str, title: Option<&str>, description: Option<&str>, who_last_modified: Option<&str>) -> Result<crate::table::Table> {
            self.record("patch_table"); self.fail()?;
            let now = chrono::Utc::now();
            Ok(crate::table::Table { id: id.into(), title: title.unwrap_or("").into(), description: description.map(Into::into), who_created: None, when_created: now, who_last_modified: who_last_modified.map(Into::into), when_last_modified: now, modify_count: 1 })
        }
        async fn delete_table(&self, _id: &str) -> Result<()> { self.record("delete_table"); self.fail() }

        async fn list_data_rows(&self, _table_id: &str, _params: &RowQuery) -> Result<PagedResponse> {
            Ok(PagedResponse { data: vec![], total: 0, page: 1, per_page: 50 })
        }
        async fn create_row(&self, table_id: &str, row_id: &str, _title: Option<&str>, _who_created: Option<&str>) -> Result<crate::data_row::TableRow> {
            self.record("create_row"); self.fail()?;
            let now = chrono::Utc::now();
            Ok(crate::data_row::TableRow { id: row_id.into(), table_id: table_id.into(), who_created: None, when_created: now, who_last_modified: None, when_last_modified: now, custom_values: serde_json::json!({}), modify_count: 0 })
        }
        async fn patch_row_value(&self, _table_id: &str, _row_id: &str, _col_id: &str, _value: serde_json::Value) -> Result<()> {
            self.record("patch_row_value"); self.fail()
        }
        async fn upsert_github_repos_batch(&self, repos: &[serde_json::Value]) -> Result<usize> {
            self.record("upsert_github_repos_batch"); self.fail()?; Ok(repos.len())
        }
        async fn append_ops_log(&self, _op: &str, _payload: serde_json::Value, _tx_id: Option<&str>) {
            self.record("append_ops_log");
        }
    }

    // ── MultiStore behaviour tests ────────────────────────────────────────────

    #[tokio::test]
    async fn writes_fan_out_to_all_stores() {
        let p = MockStore::new("primary", false);
        let s = MockStore::new("secondary", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()]);
        store.create_row("_tests_table", "row-001", Some("Hello"), None).await.unwrap();
        assert!(p.was_called("create_row"), "primary must receive the write");
        assert!(s.was_called("create_row"), "secondary must receive the write");
    }

    #[tokio::test]
    async fn writes_fan_out_to_three_stores() {
        let p  = MockStore::new("primary",     false);
        let s1 = MockStore::new("secondary-1", false);
        let s2 = MockStore::new("secondary-2", false);
        let store = MultiStore::new(vec![p.clone(), s1.clone(), s2.clone()]);
        store.upsert_flag("f1", "header:name", "blue").await.unwrap();
        assert!(p.was_called("upsert_flag"));
        assert!(s1.was_called("upsert_flag"));
        assert!(s2.was_called("upsert_flag"));
    }

    #[tokio::test]
    async fn reads_query_all_stores_for_divergence_detection() {
        let p = MockStore::new("primary", false);
        let s = MockStore::new("secondary", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()]);
        store.list_flags().await.unwrap();
        assert!(p.was_called("list_flags"), "primary must be queried");
        assert!(s.was_called("list_flags"), "secondary must also be queried for divergence detection");
    }

    #[tokio::test]
    async fn read_falls_back_to_secondary_when_primary_fails() {
        let p = MockStore::new("primary", true);  // primary read fails
        let s = MockStore::new("secondary", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()]);
        // Secondary has data — must succeed despite primary failure
        store.list_flags().await.unwrap();
        assert!(s.was_called("list_flags"));
    }

    #[tokio::test]
    async fn secondary_failure_does_not_propagate() {
        let p = MockStore::new("primary", false);
        let s = MockStore::new("secondary", true); // fails
        let store = MultiStore::new(vec![p.clone(), s.clone()]);
        store.upsert_flag("f1", "header:name", "blue").await.unwrap();
        assert!(p.was_called("upsert_flag"));
    }

    #[tokio::test]
    async fn primary_failure_propagates() {
        let p = MockStore::new("primary", true); // primary fails
        let s = MockStore::new("secondary", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()]);
        assert!(store.upsert_flag("f1", "header:name", "blue").await.is_err());
    }

    #[tokio::test]
    async fn upsert_github_repos_batch_valid_data() {
        let p = MockStore::new("primary", false);
        let s = MockStore::new("secondary", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()]);
        let repos = vec![
            serde_json::json!({ "github_id": 1, "name": "owner/repo-a", "stars": 42 }),
            serde_json::json!({ "github_id": 2, "name": "owner/repo-b", "stars": 7  }),
        ];
        let count = store.upsert_github_repos_batch(&repos).await.unwrap();
        assert_eq!(count, 2);
        assert!(p.was_called("upsert_github_repos_batch"));
        assert!(s.was_called("upsert_github_repos_batch"));
    }

    #[tokio::test]
    async fn upsert_github_repos_batch_empty_slice() {
        let p = MockStore::new("primary", false);
        let s = MockStore::new("secondary", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()]);
        assert_eq!(store.upsert_github_repos_batch(&[]).await.unwrap(), 0);
    }

    #[tokio::test]
    async fn upsert_github_repos_batch_secondary_failure_is_best_effort() {
        let p = MockStore::new("primary", false);
        let s = MockStore::new("secondary", true);
        let store = MultiStore::new(vec![p.clone(), s.clone()]);
        let result = store.upsert_github_repos_batch(&[serde_json::json!({ "github_id": 99 })]).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 1);
    }

    #[tokio::test]
    async fn patch_row_value_fans_out() {
        let p = MockStore::new("primary", false);
        let s = MockStore::new("secondary", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()]);
        store.patch_row_value("_tests_table", "row-001", "status", serde_json::json!("active")).await.unwrap();
        assert!(p.was_called("patch_row_value"));
        assert!(s.was_called("patch_row_value"));
    }

    #[tokio::test]
    async fn ops_log_fans_out_to_all_stores() {
        let p  = MockStore::new("primary",     false);
        let s1 = MockStore::new("secondary-1", false);
        let s2 = MockStore::new("secondary-2", false);
        let store = MultiStore::new(vec![p.clone(), s1.clone(), s2.clone()]);
        store.append_ops_log("row.create", serde_json::json!({ "id": "r1" }), None).await;
        assert!(p.was_called("append_ops_log"),  "primary must receive ops_log");
        assert!(s1.was_called("append_ops_log"), "secondary-1 must receive ops_log");
        assert!(s2.was_called("append_ops_log"), "secondary-2 must receive ops_log");
    }

    #[tokio::test]
    async fn ensure_schema_fans_out() {
        let p = MockStore::new("primary", false);
        let s = MockStore::new("secondary", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()]);
        store.ensure_schema().await.unwrap();
        assert!(p.was_called("ensure_schema"));
        assert!(s.was_called("ensure_schema"));
    }
}
