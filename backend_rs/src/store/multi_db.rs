/// Multi-store: all stores have equal standing.
///
/// **Writes** fan out to every store in parallel. The result from the first
/// store that succeeds is returned; if all stores fail the last error propagates.
/// Per-store failures are always logged and pushed via `write_errors`.
///
/// **Reads** fan out to every store in parallel, bounded by `FAN_READ_TIMEOUT_SECS`
/// (env var, default 60 s). The response is returned as soon as the FIRST store
/// succeeds. Store failures are immediately broadcast as `StoreErrorEvent` over the
/// gRPC Subscribe stream. Remaining stores are checked for divergence in a background
/// task; any discrepancies are also broadcast as `StoreErrorEvent`.
///
/// **Timing** Every per-store operation emits one INFO log line: result + elapsed ms.
use anyhow::Result;
use async_trait::async_trait;
use futures::{
    future::{join_all, BoxFuture},
    stream::FuturesUnordered,
    StreamExt,
};
use std::{
    collections::HashSet,
    sync::Arc,
    time::{Duration, Instant},
};

use super::DataStore;
use crate::types::{PagedResponse, RowQuery};

pub struct MultiStore {
    stores: Vec<Arc<dyn DataStore>>,
    event_tx: Option<crate::sync_service::EventTx>,
}

impl MultiStore {
    pub fn new(stores: Vec<Arc<dyn DataStore>>, event_tx: Option<crate::sync_service::EventTx>) -> Self {
        assert!(!stores.is_empty(), "MultiStore requires at least one store");
        Self { stores, event_tx }
    }
}

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_FAN_READ_TIMEOUT_SECS: u64 = 60;

/// Resolve the effective fan-read timeout.
/// Priority: per-request override → `FAN_READ_TIMEOUT_SECS` env var → 60 s default.
fn fan_read_timeout(override_secs: Option<u64>) -> Duration {
    let secs = override_secs
        .or_else(|| {
            std::env::var("FAN_READ_TIMEOUT_SECS")
                .ok()
                .and_then(|s| s.parse::<u64>().ok())
        })
        .unwrap_or(DEFAULT_FAN_READ_TIMEOUT_SECS);
    Duration::from_secs(secs)
}

// ── MergeKey — deduplication key for list results ─────────────────────────────

trait MergeKey {
    fn merge_key(&self) -> String;
}

impl MergeKey for crate::flag::CellFlag {
    fn merge_key(&self) -> String {
        self.key.clone()
    }
}
impl MergeKey for crate::remark::Remark {
    fn merge_key(&self) -> String {
        self.id.clone()
    }
}
impl MergeKey for crate::hidden_row::HiddenRow {
    fn merge_key(&self) -> String {
        self.row_id.clone()
    }
}
impl MergeKey for crate::hidden_column::HiddenColumn {
    fn merge_key(&self) -> String {
        self.column_id.clone()
    }
}
impl MergeKey for crate::custom_column::CustomColumn {
    fn merge_key(&self) -> String {
        self.id.clone()
    }
}
impl MergeKey for crate::table::Table {
    fn merge_key(&self) -> String {
        self.id.clone()
    }
}

// ── Write helpers ─────────────────────────────────────────────────────────────

/// Return the first successful result; if all stores failed, return the last error.
fn fan_write<T>(results: Vec<Result<T>>, method: &str) -> Result<T> {
    let mut last_err = anyhow::anyhow!("{method}: no stores configured");
    let mut success: Option<T> = None;
    let mut partial_errs: Vec<String> = Vec::new();
    for r in results {
        match r {
            Ok(v) => { success = Some(v); }
            Err(e) => {
                partial_errs.push(format!("{method}: {e}"));
                last_err = e;
            }
        }
    }
    if let Some(v) = success {
        for msg in partial_errs {
            crate::write_errors::push(msg);
        }
        Ok(v)
    } else {
        Err(last_err)
    }
}

/// Fan a write to every store in parallel.
/// Before each write: inserts a pending ops log entry (applied_at = NULL).
/// After a successful write: marks the entry applied (applied_at = now()).
/// The same nanoid `op_id` is used across all stores for cross-DB correlation.
macro_rules! fan_out {
    ($self:ident, $op:literal, $payload:expr, $method:ident ( $($arg:expr),* ) ) => {{
        let op_id = nanoid::nanoid!();
        let payload = $payload;
        let results = join_all(
            $self.stores.iter().enumerate().map(|(store_idx, s)| {
                let op_id = op_id.clone();
                let payload = payload.clone();
                async move {
                    let t0 = Instant::now();
                    s.begin_ops_log(&op_id, $op, payload, None).await;
                    let result = s.$method($($arg),*).await;
                    let ms = t0.elapsed().as_millis();
                    match &result {
                        Ok(_) => {
                            tracing::info!("store[{store_idx}] {} write OK in {ms}ms", stringify!($method));
                            s.mark_op_applied(&op_id).await;
                        }
                        Err(e) => tracing::warn!("store[{store_idx}] {} write FAILED in {ms}ms: {e}", stringify!($method)),
                    }
                    result
                }
            })
        ).await;
        fan_write(results, stringify!($method))
    }};
}

// ── Read helpers ──────────────────────────────────────────────────────────────


fn paged_item_id(v: &serde_json::Value) -> String {
    v.get("id")
        .and_then(|id| id.as_str())
        .map(str::to_owned)
        .or_else(|| v.get("key").and_then(|k| k.as_str()).map(str::to_owned))
        .unwrap_or_else(|| serde_json::to_string(v).unwrap_or_default())
}

// ── Read fan-out helpers ──────────────────────────────────────────────────────

fn send_store_error(tx: &Option<crate::sync_service::EventTx>, method: &str, msg: &str) {
    if let Some(tx) = tx {
        let _ = tx.send(crate::sync_service::store_error_event(method, msg));
    }
}

impl MultiStore {
    /// Fan a list read: return on first-success, broadcast store errors immediately,
    /// check divergence against remaining stores in a background task.
    async fn fan_first_list<T>(
        &self,
        method: &'static str,
        futs: Vec<(usize, BoxFuture<'static, Result<Vec<T>>>)>,
    ) -> Result<Vec<T>>
    where
        T: MergeKey + Send + 'static,
    {
        let timeout = fan_read_timeout(None);
        let mut unordered: FuturesUnordered<_> = futs
            .into_iter()
            .map(|(i, fut)| async move {
                let t0 = Instant::now();
                let result = tokio::time::timeout(timeout, fut)
                    .await
                    .unwrap_or_else(|_| Err(anyhow::anyhow!("timed out after {}s", timeout.as_secs())));
                let ms = t0.elapsed().as_millis();
                match &result {
                    Ok(_) => tracing::info!("store[{i}] {method} read OK in {ms}ms"),
                    Err(e) => tracing::warn!("store[{i}] {method} read FAILED in {ms}ms: {e}"),
                }
                (i, result)
            })
            .collect();

        let mut first: Option<(usize, Vec<T>)> = None;
        while let Some((i, result)) = unordered.next().await {
            match result {
                Ok(items) => {
                    first = Some((i, items));
                    break;
                }
                Err(e) => {
                    let msg = format!("{method}: store[{i}] failed: {e}");
                    send_store_error(&self.event_tx, method, &msg);
                }
            }
        }

        let Some((first_idx, first_data)) = first else {
            return Err(anyhow::anyhow!("ALL STORES FAILED to read {method}"));
        };

        if unordered.is_empty() {
            return Ok(first_data);
        }

        let event_tx = self.event_tx.clone();
        let first_keys: HashSet<String> = first_data.iter().map(MergeKey::merge_key).collect();
        tokio::spawn(async move {
            while let Some((i, result)) = unordered.next().await {
                match result {
                    Ok(items) => {
                        let keys: HashSet<String> = items.iter().map(MergeKey::merge_key).collect();
                        for key in &first_keys {
                            if !keys.contains(key) {
                                let msg = format!(
                                    "DATA DIVERGENCE [{method}]: key={key:?} missing from store[{i}] (vs store[{first_idx}])"
                                );
                                tracing::error!("{msg}");
                                send_store_error(&event_tx, method, &msg);
                            }
                        }
                    }
                    Err(e) => {
                        let msg = format!("{method}: store[{i}] background check failed: {e}");
                        tracing::warn!("{msg}");
                        send_store_error(&event_tx, method, &msg);
                    }
                }
            }
        });

        Ok(first_data)
    }

    /// Fan a paged read: return on first-success, broadcast store errors immediately,
    /// check divergence in a background task.
    async fn fan_first_paged(
        &self,
        method: &'static str,
        timeout: Duration,
        futs: Vec<(usize, BoxFuture<'static, Result<PagedResponse>>)>,
    ) -> Result<PagedResponse> {
        let mut unordered: FuturesUnordered<_> = futs
            .into_iter()
            .map(|(i, fut)| async move {
                let t0 = Instant::now();
                let result = tokio::time::timeout(timeout, fut)
                    .await
                    .unwrap_or_else(|_| Err(anyhow::anyhow!("timed out after {}s", timeout.as_secs())));
                let ms = t0.elapsed().as_millis();
                match &result {
                    Ok(_) => tracing::info!("store[{i}] {method} read OK in {ms}ms"),
                    Err(e) => tracing::warn!("store[{i}] {method} read FAILED in {ms}ms: {e}"),
                }
                (i, result)
            })
            .collect();

        let mut first: Option<(usize, PagedResponse)> = None;
        while let Some((i, result)) = unordered.next().await {
            match result {
                Ok(page) => {
                    first = Some((i, page));
                    break;
                }
                Err(e) => {
                    let msg = format!("{method}: store[{i}] failed: {e}");
                    send_store_error(&self.event_tx, method, &msg);
                }
            }
        }

        let Some((first_idx, first_data)) = first else {
            return Err(anyhow::anyhow!("ALL STORES FAILED to read {method}"));
        };

        if unordered.is_empty() {
            return Ok(first_data);
        }

        let event_tx = self.event_tx.clone();
        let first_total = first_data.total;
        let first_ids: HashSet<String> = first_data.data.iter().map(paged_item_id).collect();
        tokio::spawn(async move {
            while let Some((i, result)) = unordered.next().await {
                match result {
                    Ok(page) => {
                        if page.total != first_total {
                            let msg = format!(
                                "DATA DIVERGENCE [{method}]: store[{i}] total={} vs store[{first_idx}] total={first_total}",
                                page.total
                            );
                            tracing::error!("{msg}");
                            send_store_error(&event_tx, method, &msg);
                        }
                        let ids: HashSet<String> = page.data.iter().map(paged_item_id).collect();
                        for id in &first_ids {
                            if !ids.contains(id) {
                                let msg = format!(
                                    "DATA DIVERGENCE [{method}]: id={id:?} missing from store[{i}]"
                                );
                                tracing::error!("{msg}");
                                send_store_error(&event_tx, method, &msg);
                            }
                        }
                    }
                    Err(e) => {
                        let msg = format!("{method}: store[{i}] background check failed: {e}");
                        tracing::warn!("{msg}");
                        send_store_error(&event_tx, method, &msg);
                    }
                }
            }
        });

        Ok(first_data)
    }
}

// ── MultiStore DataStore impl ─────────────────────────────────────────────────

#[async_trait]
impl DataStore for MultiStore {
    async fn ensure_schema(&self) -> Result<()> {
        let results = join_all(self.stores.iter().enumerate().map(|(i, s)| async move {
            let t0 = Instant::now();
            let result = s.ensure_schema().await;
            let ms = t0.elapsed().as_millis();
            match &result {
                Ok(_) => tracing::info!("store[{i}] ensure_schema OK in {ms}ms"),
                Err(e) => tracing::warn!("store[{i}] ensure_schema FAILED in {ms}ms: {e}"),
            }
            result
        }))
        .await;
        fan_write(results, "ensure_schema")
    }

    async fn set_column_source_path(
        &self,
        column_id: &str,
        path: Option<&[String]>,
    ) -> Result<crate::custom_column::CustomColumn> {
        let path_owned: Option<Vec<String>> = path.map(|p| p.to_vec());
        fan_out!(
            self,
            "custom_column.set_source_path",
            serde_json::json!({"column_id": column_id, "source_path": path_owned}),
            set_column_source_path(column_id, path)
        )
    }

    async fn nuke_db(&self) -> Result<()> {
        let results = join_all(self.stores.iter().enumerate().map(|(i, s)| async move {
            let result = s.nuke_db().await;
            if let Err(ref e) = result {
                tracing::warn!("store[{i}] nuke_db FAILED: {e}");
            }
            result
        }))
        .await;
        fan_write(results, "nuke_db")
    }

    // ── Flags ──────────────────────────────────────────────────────────────────

    async fn list_flags(&self) -> Result<Vec<crate::flag::CellFlag>> {
        let futs = self.stores.iter().enumerate().map(|(i, s)| {
            let s = s.clone();
            let fut: BoxFuture<'static, Result<Vec<crate::flag::CellFlag>>> =
                Box::pin(async move { s.list_flags().await });
            (i, fut)
        }).collect();
        self.fan_first_list("list_flags", futs).await
    }
    async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> Result<crate::flag::CellFlag> {
        fan_out!(
            self,
            "flag.upsert",
            serde_json::json!({"id": id, "key": key, "color": color}),
            upsert_flag(id, key, color)
        )
    }
    async fn delete_flag(&self, key: &str) -> Result<()> {
        fan_out!(
            self,
            "flag.delete",
            serde_json::json!({"key": key}),
            delete_flag(key)
        )
    }

    // ── Remarks ────────────────────────────────────────────────────────────────

    async fn list_remarks(&self) -> Result<Vec<crate::remark::Remark>> {
        let futs = self.stores.iter().enumerate().map(|(i, s)| {
            let s = s.clone();
            let fut: BoxFuture<'static, Result<Vec<crate::remark::Remark>>> =
                Box::pin(async move { s.list_remarks().await });
            (i, fut)
        }).collect();
        self.fan_first_list("list_remarks", futs).await
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
        fan_out!(
            self,
            "remark.upsert",
            serde_json::json!({
                "id": id, "body": body, "kind": kind, "is_private": is_private,
                "resolved_at": resolved_at.map(|dt| dt.to_rfc3339()),
                "targets": targets.iter().map(|t| serde_json::json!({"row_id": t.row_id, "column_id": t.column_id})).collect::<Vec<_>>(),
            }),
            upsert_remark(id, body, kind, is_private, resolved_at, targets)
        )
    }
    async fn delete_remark(&self, id: &str) -> Result<()> {
        fan_out!(
            self,
            "remark.delete",
            serde_json::json!({"id": id}),
            delete_remark(id)
        )
    }

    // ── Hidden rows ────────────────────────────────────────────────────────────

    async fn list_hidden_rows(&self) -> Result<Vec<crate::hidden_row::HiddenRow>> {
        let futs = self.stores.iter().enumerate().map(|(i, s)| {
            let s = s.clone();
            let fut: BoxFuture<'static, Result<Vec<crate::hidden_row::HiddenRow>>> =
                Box::pin(async move { s.list_hidden_rows().await });
            (i, fut)
        }).collect();
        self.fan_first_list("list_hidden_rows", futs).await
    }
    async fn add_hidden_row(&self, id: &str, row_id: &str) -> Result<crate::hidden_row::HiddenRow> {
        fan_out!(
            self,
            "hidden_row.add",
            serde_json::json!({"id": id, "row_id": row_id}),
            add_hidden_row(id, row_id)
        )
    }
    async fn remove_hidden_row(&self, row_id: &str) -> Result<()> {
        fan_out!(
            self,
            "hidden_row.remove",
            serde_json::json!({"row_id": row_id}),
            remove_hidden_row(row_id)
        )
    }

    // ── Hidden columns ─────────────────────────────────────────────────────────

    async fn list_hidden_columns(&self) -> Result<Vec<crate::hidden_column::HiddenColumn>> {
        let futs = self.stores.iter().enumerate().map(|(i, s)| {
            let s = s.clone();
            let fut: BoxFuture<'static, Result<Vec<crate::hidden_column::HiddenColumn>>> =
                Box::pin(async move { s.list_hidden_columns().await });
            (i, fut)
        }).collect();
        self.fan_first_list("list_hidden_columns", futs).await
    }
    async fn add_hidden_column(
        &self,
        id: &str,
        column_id: &str,
    ) -> Result<crate::hidden_column::HiddenColumn> {
        fan_out!(
            self,
            "hidden_column.add",
            serde_json::json!({"id": id, "column_id": column_id}),
            add_hidden_column(id, column_id)
        )
    }
    async fn remove_hidden_column(&self, column_id: &str) -> Result<()> {
        fan_out!(
            self,
            "hidden_column.remove",
            serde_json::json!({"column_id": column_id}),
            remove_hidden_column(column_id)
        )
    }

    // ── Custom columns ─────────────────────────────────────────────────────────

    async fn list_custom_columns(
        &self,
        table_id: &str,
    ) -> Result<Vec<crate::custom_column::CustomColumn>> {
        let futs = self.stores.iter().enumerate().map(|(i, s)| {
            let s = s.clone();
            let tid = table_id.to_string();
            let fut: BoxFuture<'static, Result<Vec<crate::custom_column::CustomColumn>>> =
                Box::pin(async move { s.list_custom_columns(&tid).await });
            (i, fut)
        }).collect();
        self.fan_first_list("list_custom_columns", futs).await
    }
    async fn upsert_custom_column(
        &self,
        table_id: &str,
        id: &str,
        input: &crate::custom_column::CustomColumnInput,
    ) -> Result<crate::custom_column::CustomColumn> {
        fan_out!(
            self,
            "custom_column.upsert",
            serde_json::json!({
                "id": id, "table_id": table_id, "title": input.title,
                "description": input.description,
                "expression": input.expression, "position_after": input.position_after,
                "is_group": input.is_group, "parent_ids": input.parent_ids,
                "source_path": input.source_path, "types": input.types, "data_types": input.data_types,
            }),
            upsert_custom_column(table_id, id, input)
        )
    }
    async fn delete_custom_column(&self, id: &str) -> Result<()> {
        fan_out!(
            self,
            "custom_column.delete",
            serde_json::json!({"id": id}),
            delete_custom_column(id)
        )
    }
    async fn set_table_column_frozen(
        &self,
        table_id: &str,
        column_id: &str,
        is_frozen: bool,
    ) -> Result<crate::custom_column::CustomColumn> {
        fan_out!(
            self,
            "custom_column.freeze",
            serde_json::json!({"table_id": table_id, "column_id": column_id, "is_frozen": is_frozen}),
            set_table_column_frozen(table_id, column_id, is_frozen)
        )
    }

    // ── Tables registry ────────────────────────────────────────────────────────

    async fn list_tables(&self) -> Result<Vec<crate::table::Table>> {
        let futs = self.stores.iter().enumerate().map(|(i, s)| {
            let s = s.clone();
            let fut: BoxFuture<'static, Result<Vec<crate::table::Table>>> =
                Box::pin(async move { s.list_tables().await });
            (i, fut)
        }).collect();
        self.fan_first_list("list_tables", futs).await
    }
    async fn create_table(
        &self,
        id: &str,
        title: &str,
        description: Option<&str>,
        who_created: Option<&str>,
    ) -> Result<crate::table::Table> {
        fan_out!(
            self,
            "table.create",
            serde_json::json!({"id": id, "title": title, "description": description, "who_created": who_created}),
            create_table(id, title, description, who_created)
        )
    }
    async fn patch_table(
        &self,
        id: &str,
        title: Option<&str>,
        description: Option<&str>,
        who_last_modified: Option<&str>,
    ) -> Result<crate::table::Table> {
        fan_out!(
            self,
            "table.patch",
            serde_json::json!({"id": id, "title": title, "description": description, "who_last_modified": who_last_modified}),
            patch_table(id, title, description, who_last_modified)
        )
    }
    async fn delete_table(&self, id: &str) -> Result<()> {
        fan_out!(
            self,
            "table.delete",
            serde_json::json!({"id": id}),
            delete_table(id)
        )
    }

    // ── Rows ───────────────────────────────────────────────────────────────────

    async fn list_data_rows(&self, table_id: &str, params: &RowQuery) -> Result<PagedResponse> {
        let timeout = fan_read_timeout(params.read_timeout_secs);
        let futs = self.stores.iter().enumerate().map(|(i, s)| {
            let s = s.clone();
            let tid = table_id.to_string();
            let p = params.clone();
            (i, Box::pin(async move { s.list_data_rows(&tid, &p).await }) as BoxFuture<'static, _>)
        }).collect();
        self.fan_first_paged("list_data_rows", timeout, futs).await
    }
    async fn create_row(
        &self,
        table_id: &str,
        row_id: &str,
        title: Option<&str>,
        who_created: Option<&str>,
    ) -> Result<crate::data_row::TableRow> {
        fan_out!(
            self,
            "row.create",
            serde_json::json!({"table_id": table_id, "row_id": row_id, "title": title, "who_created": who_created}),
            create_row(table_id, row_id, title, who_created)
        )
    }
    async fn patch_row_value(
        &self,
        table_id: &str,
        row_id: &str,
        col_id: &str,
        value: serde_json::Value,
    ) -> Result<()> {
        let op_id = nanoid::nanoid!();
        let payload = serde_json::json!({"table_id": table_id, "row_id": row_id, "col_id": col_id, "value": value});
        let results = join_all(self.stores.iter().enumerate().map(|(i, s)| {
            let op_id = op_id.clone();
            let payload = payload.clone();
            let value = value.clone();
            async move {
                let t0 = Instant::now();
                s.begin_ops_log(&op_id, "row.patch", payload, None).await;
                let result = s.patch_row_value(table_id, row_id, col_id, value).await;
                let ms = t0.elapsed().as_millis();
                match &result {
                    Ok(_) => {
                        tracing::info!("store[{i}] patch_row_value write OK in {ms}ms");
                        s.mark_op_applied(&op_id).await;
                    }
                    Err(e) => {
                        tracing::warn!("store[{i}] patch_row_value write FAILED in {ms}ms: {e}")
                    }
                }
                result
            }
        }))
        .await;
        fan_write(results, "patch_row_value")
    }

    // ── GitHub repos batch ─────────────────────────────────────────────────────

    async fn upsert_github_repos_batch(&self, repos: &[serde_json::Value]) -> Result<usize> {
        fan_out!(
            self,
            "github_repos.batch_upsert",
            serde_json::json!({"repos": repos}),
            upsert_github_repos_batch(repos)
        )
    }

    async fn upsert_rows_batch(&self, table_id: &str, rows: &[serde_json::Value]) -> Result<usize> {
        fan_out!(
            self,
            "rows.batch_upsert",
            serde_json::json!({"table_id": table_id, "rows": rows}),
            upsert_rows_batch(table_id, rows)
        )
    }

    // ── Ops log ────────────────────────────────────────────────────────────────

    async fn begin_ops_log(
        &self,
        id: &str,
        op: &str,
        payload: serde_json::Value,
        tx_id: Option<&str>,
    ) {
        join_all(
            self.stores
                .iter()
                .map(|s| s.begin_ops_log(id, op, payload.clone(), tx_id)),
        )
        .await;
    }

    async fn mark_op_applied(&self, id: &str) {
        join_all(self.stores.iter().map(|s| s.mark_op_applied(id))).await;
    }

    /// Returns pending ops from the store with the fewest applied ops — the most conservative
    /// view of what has been durably persisted. This is the source of truth for crash recovery.
    async fn pending_ops(&self) -> Result<Vec<crate::store::PendingOp>> {
        let results = join_all(self.stores.iter().enumerate().map(|(i, s)| async move {
            match s.pending_ops().await {
                Ok(ops) => {
                    tracing::info!("store[{i}] has {} pending op(s)", ops.len());
                    Some(ops)
                }
                Err(e) => {
                    tracing::warn!("store[{i}] pending_ops failed: {e}");
                    None
                }
            }
        }))
        .await;

        // Use the result from the store that has the most pending ops (least applied = most conservative).
        let most_pending = results
            .into_iter()
            .flatten()
            .max_by_key(|ops| ops.len())
            .unwrap_or_default();

        Ok(most_pending)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{PagedResponse, RowQuery};
    use std::sync::{Arc, Mutex};

    // ── Mock store ────────────────────────────────────────────────────────────

    struct MockStore {
        name: &'static str,
        calls: Arc<Mutex<Vec<String>>>,
        fail_all: bool,
        // configurable list responses
        flags: Vec<crate::flag::CellFlag>,
    }

    impl MockStore {
        fn new(name: &'static str, fail_all: bool) -> Arc<Self> {
            Arc::new(Self {
                name,
                calls: Arc::new(Mutex::new(vec![])),
                fail_all,
                flags: vec![],
            })
        }
        fn with_flags(name: &'static str, flags: Vec<crate::flag::CellFlag>) -> Arc<Self> {
            Arc::new(Self {
                name,
                calls: Arc::new(Mutex::new(vec![])),
                fail_all: false,
                flags,
            })
        }
        fn record(&self, m: &str) {
            self.calls
                .lock()
                .unwrap()
                .push(format!("{}:{}", self.name, m));
        }
        fn was_called(&self, m: &str) -> bool {
            self.calls.lock().unwrap().iter().any(|c| c.contains(m))
        }
        fn fail(&self) -> Result<()> {
            if self.fail_all {
                anyhow::bail!("mock failure")
            } else {
                Ok(())
            }
        }
    }

    #[async_trait]
    impl DataStore for MockStore {
        async fn ensure_schema(&self) -> Result<()> {
            self.record("ensure_schema");
            self.fail()
        }

        async fn nuke_db(&self) -> Result<()> {
            self.record("nuke_db");
            self.fail()
        }

        async fn set_column_source_path(
            &self,
            _column_id: &str,
            _path: Option<&[String]>,
        ) -> Result<crate::custom_column::CustomColumn> {
            self.record("set_column_source_path");
            self.fail()?;
            unreachable!()
        }

        async fn list_flags(&self) -> Result<Vec<crate::flag::CellFlag>> {
            self.record("list_flags");
            self.fail()?;
            Ok(self.flags.clone())
        }
        async fn upsert_flag(
            &self,
            id: &str,
            key: &str,
            color: &str,
        ) -> Result<crate::flag::CellFlag> {
            self.record("upsert_flag");
            self.fail()?;
            Ok(crate::flag::CellFlag {
                id: id.into(),
                key: key.into(),
                color: color.into(),
            })
        }
        async fn delete_flag(&self, _key: &str) -> Result<()> {
            self.record("delete_flag");
            self.fail()
        }

        async fn list_remarks(&self) -> Result<Vec<crate::remark::Remark>> {
            self.record("list_remarks");
            self.fail()?;
            Ok(vec![])
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
            self.record("upsert_remark");
            self.fail()?;
            Ok(crate::remark::Remark {
                id: id.into(),
                body: body.into(),
                kind: kind.into(),
                is_private,
                resolved_at,
                targets: targets.to_vec(),
            })
        }
        async fn delete_remark(&self, _id: &str) -> Result<()> {
            self.record("delete_remark");
            self.fail()
        }

        async fn list_hidden_rows(&self) -> Result<Vec<crate::hidden_row::HiddenRow>> {
            self.record("list_hidden_rows");
            self.fail()?;
            Ok(vec![])
        }
        async fn add_hidden_row(
            &self,
            id: &str,
            row_id: &str,
        ) -> Result<crate::hidden_row::HiddenRow> {
            self.record("add_hidden_row");
            self.fail()?;
            Ok(crate::hidden_row::HiddenRow {
                id: id.into(),
                row_id: row_id.into(),
            })
        }
        async fn remove_hidden_row(&self, _row_id: &str) -> Result<()> {
            self.record("remove_hidden_row");
            self.fail()
        }

        async fn list_hidden_columns(&self) -> Result<Vec<crate::hidden_column::HiddenColumn>> {
            self.record("list_hidden_columns");
            self.fail()?;
            Ok(vec![])
        }
        async fn add_hidden_column(
            &self,
            id: &str,
            column_id: &str,
        ) -> Result<crate::hidden_column::HiddenColumn> {
            self.record("add_hidden_column");
            self.fail()?;
            Ok(crate::hidden_column::HiddenColumn {
                id: id.into(),
                column_id: column_id.into(),
            })
        }
        async fn remove_hidden_column(&self, _column_id: &str) -> Result<()> {
            self.record("remove_hidden_column");
            self.fail()
        }

        async fn list_custom_columns(
            &self,
            _table_id: &str,
        ) -> Result<Vec<crate::custom_column::CustomColumn>> {
            self.record("list_custom_columns");
            self.fail()?;
            Ok(vec![])
        }
        async fn upsert_custom_column(
            &self,
            _table_id: &str,
            id: &str,
            input: &crate::custom_column::CustomColumnInput,
        ) -> Result<crate::custom_column::CustomColumn> {
            self.record("upsert_custom_column");
            self.fail()?;
            Ok(crate::custom_column::CustomColumn {
                id: id.into(),
                title: input.title.clone(),
                description: input.description.clone(),
                expression: input.expression.clone(),
                position_after: input.position_after.clone(),
                read_only: false,
                types: input.effective_types(),
                source_path: input.source_path.clone(),
                data_types: input.effective_data_types(),
                is_group: input.is_group,
                parent_ids: input.parent_ids.clone(),
                is_frozen: false,
            })
        }
        async fn delete_custom_column(&self, _id: &str) -> Result<()> {
            self.record("delete_custom_column");
            self.fail()
        }
        async fn set_table_column_frozen(
            &self,
            _table_id: &str,
            id: &str,
            is_frozen: bool,
        ) -> Result<crate::custom_column::CustomColumn> {
            self.record("set_table_column_frozen");
            self.fail()?;
            Ok(crate::custom_column::CustomColumn {
                id: id.into(),
                title: None,
                description: None,
                expression: None,
                position_after: None,
                read_only: false,
                types: vec![],
                source_path: None,
                data_types: vec![],
                is_group: false,
                parent_ids: vec![],
                is_frozen,
            })
        }

        async fn list_tables(&self) -> Result<Vec<crate::table::Table>> {
            self.record("list_tables");
            self.fail()?;
            Ok(vec![])
        }
        async fn create_table(
            &self,
            id: &str,
            title: &str,
            description: Option<&str>,
            who_created: Option<&str>,
        ) -> Result<crate::table::Table> {
            self.record("create_table");
            self.fail()?;
            let now = chrono::Utc::now();
            Ok(crate::table::Table {
                id: id.into(),
                title: title.into(),
                description: description.map(Into::into),
                who_created: who_created.map(Into::into),
                when_created: now,
                who_last_modified: None,
                when_last_modified: now,
                modify_count: 0,
            })
        }
        async fn patch_table(
            &self,
            id: &str,
            title: Option<&str>,
            description: Option<&str>,
            who_last_modified: Option<&str>,
        ) -> Result<crate::table::Table> {
            self.record("patch_table");
            self.fail()?;
            let now = chrono::Utc::now();
            Ok(crate::table::Table {
                id: id.into(),
                title: title.unwrap_or("").into(),
                description: description.map(Into::into),
                who_created: None,
                when_created: now,
                who_last_modified: who_last_modified.map(Into::into),
                when_last_modified: now,
                modify_count: 1,
            })
        }
        async fn delete_table(&self, _id: &str) -> Result<()> {
            self.record("delete_table");
            self.fail()
        }

        async fn list_data_rows(
            &self,
            _table_id: &str,
            _params: &RowQuery,
        ) -> Result<PagedResponse> {
            self.record("list_data_rows");
            self.fail()?;
            Ok(PagedResponse {
                data: vec![],
                total: 0,
                page: 1,
                per_page: 50,
                errors: vec![],
            })
        }
        async fn create_row(
            &self,
            table_id: &str,
            row_id: &str,
            _title: Option<&str>,
            _who_created: Option<&str>,
        ) -> Result<crate::data_row::TableRow> {
            self.record("create_row");
            self.fail()?;
            let now = chrono::Utc::now();
            Ok(crate::data_row::TableRow {
                id: row_id.into(),
                table_id: table_id.into(),
                who_created: None,
                when_created: now,
                who_last_modified: None,
                when_last_modified: now,
                custom_values: serde_json::json!({}),
                modify_count: 0,
            })
        }
        async fn patch_row_value(
            &self,
            _table_id: &str,
            _row_id: &str,
            _col_id: &str,
            _value: serde_json::Value,
        ) -> Result<()> {
            self.record("patch_row_value");
            self.fail()
        }
        async fn upsert_github_repos_batch(&self, repos: &[serde_json::Value]) -> Result<usize> {
            self.record("upsert_github_repos_batch");
            self.fail()?;
            Ok(repos.len())
        }
        async fn upsert_rows_batch(
            &self,
            _table_id: &str,
            rows: &[serde_json::Value],
        ) -> Result<usize> {
            self.record("upsert_rows_batch");
            self.fail()?;
            Ok(rows.len())
        }
        async fn begin_ops_log(
            &self,
            _id: &str,
            _op: &str,
            _payload: serde_json::Value,
            _tx_id: Option<&str>,
        ) {
            self.record("begin_ops_log");
        }
        async fn mark_op_applied(&self, _id: &str) {
            self.record("mark_op_applied");
        }
        async fn pending_ops(&self) -> Result<Vec<crate::store::PendingOp>> {
            Ok(vec![])
        }
    }

    fn flag(key: &str) -> crate::flag::CellFlag {
        crate::flag::CellFlag {
            id: key.into(),
            key: key.into(),
            color: "blue".into(),
        }
    }

    // ── Write fan-out ─────────────────────────────────────────────────────────

    #[tokio::test]
    async fn writes_fan_out_to_all_stores() {
        let p = MockStore::new("store-a", false);
        let s = MockStore::new("store-b", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        store
            .create_row("_tests_table", "row-001", Some("Hello"), None)
            .await
            .unwrap();
        assert!(p.was_called("create_row"), "store-a must receive the write");
        assert!(s.was_called("create_row"), "store-b must receive the write");
    }

    #[tokio::test]
    async fn writes_fan_out_to_three_stores() {
        let s0 = MockStore::new("store-0", false);
        let s1 = MockStore::new("store-1", false);
        let s2 = MockStore::new("store-2", false);
        let store = MultiStore::new(vec![s0.clone(), s1.clone(), s2.clone()], None);
        store
            .upsert_flag("f1", "header:name", "blue")
            .await
            .unwrap();
        assert!(s0.was_called("upsert_flag"));
        assert!(s1.was_called("upsert_flag"));
        assert!(s2.was_called("upsert_flag"));
    }

    #[tokio::test]
    async fn one_write_failure_does_not_propagate() {
        let p = MockStore::new("store-a", false);
        let s = MockStore::new("store-b", true);
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        store
            .upsert_flag("f1", "header:name", "blue")
            .await
            .unwrap();
        assert!(p.was_called("upsert_flag"));
    }

    #[tokio::test]
    async fn all_write_failures_propagate() {
        let a = MockStore::new("store-a", true);
        let b = MockStore::new("store-b", true);
        let store = MultiStore::new(vec![a.clone(), b.clone()], None);
        assert!(store
            .upsert_flag("f1", "header:name", "blue")
            .await
            .is_err());
    }

    #[tokio::test]
    async fn one_write_failure_succeeds_via_other_store() {
        let a = MockStore::new("store-a", true);
        let b = MockStore::new("store-b", false);
        let store = MultiStore::new(vec![a.clone(), b.clone()], None);
        assert!(store.upsert_flag("f1", "header:name", "blue").await.is_ok());
    }

    // ── Read merge ────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn reads_query_all_stores_for_divergence_detection() {
        let p = MockStore::new("store-a", false);
        let s = MockStore::new("store-b", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        store.list_flags().await.unwrap();
        // FuturesUnordered polls all synchronous futures on the first .next() call,
        // so both stores are called even before we return the first result.
        tokio::task::yield_now().await; // let background divergence task run
        assert!(p.was_called("list_flags"), "store-a must be queried");
        assert!(s.was_called("list_flags"), "store-b must be queried for divergence detection");
    }

    #[tokio::test]
    async fn reads_return_first_store_result() {
        // First store (store-a) wins; store-b's diverging data is checked in background.
        let p = MockStore::with_flags("store-a", vec![flag("A")]);
        let s = MockStore::with_flags("store-b", vec![flag("B")]);
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        let flags = store.list_flags().await.unwrap();
        assert_eq!(flags.len(), 1, "only first store's result is returned");
        assert_eq!(flags[0].key, "A", "store-a (first) wins");
    }

    #[tokio::test]
    async fn reads_first_store_data_returned_on_key_collision() {
        let p = MockStore::with_flags(
            "store-a",
            vec![crate::flag::CellFlag { id: "p".into(), key: "X".into(), color: "color-a".into() }],
        );
        let s = MockStore::with_flags(
            "store-b",
            vec![crate::flag::CellFlag { id: "s".into(), key: "X".into(), color: "color-b".into() }],
        );
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        let flags = store.list_flags().await.unwrap();
        assert_eq!(flags.len(), 1);
        assert_eq!(flags[0].color, "color-a", "first store (store-a) wins");
    }

    #[tokio::test]
    async fn read_falls_back_when_one_store_fails() {
        let p = MockStore::new("store-a", true);
        let s = MockStore::with_flags("store-b", vec![flag("A")]);
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        let flags = store.list_flags().await.unwrap();
        assert!(
            !flags.is_empty(),
            "store-b result returned when store-a fails"
        );
        assert!(s.was_called("list_flags"));
    }

    #[tokio::test]
    async fn all_stores_failing_returns_error() {
        let p = MockStore::new("store-a", true);
        let s = MockStore::new("store-b", true);
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        assert!(store.list_flags().await.is_err());
    }

    // ── Specific method tests ─────────────────────────────────────────────────

    #[tokio::test]
    async fn patch_row_value_fans_out() {
        let p = MockStore::new("store-a", false);
        let s = MockStore::new("store-b", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        store
            .patch_row_value(
                "_tests_table",
                "row-001",
                "status",
                serde_json::json!("active"),
            )
            .await
            .unwrap();
        assert!(p.was_called("patch_row_value"));
        assert!(s.was_called("patch_row_value"));
    }

    #[tokio::test]
    async fn upsert_github_repos_batch_fans_out() {
        let p = MockStore::new("store-a", false);
        let s = MockStore::new("store-b", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        let repos = vec![
            serde_json::json!({ "github_id": 1, "name": "owner/repo-a" }),
            serde_json::json!({ "github_id": 2, "name": "owner/repo-b" }),
        ];
        let count = store.upsert_github_repos_batch(&repos).await.unwrap();
        assert_eq!(count, 2);
        assert!(p.was_called("upsert_github_repos_batch"));
        assert!(s.was_called("upsert_github_repos_batch"));
    }

    #[tokio::test]
    async fn upsert_github_repos_batch_empty_slice() {
        let p = MockStore::new("store-a", false);
        let store = MultiStore::new(vec![p.clone()]);
        assert_eq!(store.upsert_github_repos_batch(&[]).await.unwrap(), 0);
    }

    #[tokio::test]
    async fn upsert_github_repos_batch_one_failure_is_best_effort() {
        let p = MockStore::new("store-a", false);
        let s = MockStore::new("store-b", true);
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        let result = store
            .upsert_github_repos_batch(&[serde_json::json!({ "github_id": 99 })])
            .await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 1);
    }

    #[tokio::test]
    async fn ops_log_begin_and_mark_fan_out_to_all_stores() {
        // A write (create_row) should trigger begin_ops_log before and mark_op_applied after on every store.
        let s0 = MockStore::new("store-0", false);
        let s1 = MockStore::new("store-1", false);
        let s2 = MockStore::new("store-2", false);
        let store = MultiStore::new(vec![s0.clone(), s1.clone(), s2.clone()], None);
        store
            .create_row("_test_", "row-ops", None, None)
            .await
            .unwrap();
        assert!(
            s0.was_called("begin_ops_log"),
            "store-0 must receive begin_ops_log"
        );
        assert!(
            s1.was_called("begin_ops_log"),
            "store-1 must receive begin_ops_log"
        );
        assert!(
            s2.was_called("begin_ops_log"),
            "store-2 must receive begin_ops_log"
        );
        assert!(
            s0.was_called("mark_op_applied"),
            "store-0 must receive mark_op_applied"
        );
        assert!(
            s1.was_called("mark_op_applied"),
            "store-1 must receive mark_op_applied"
        );
        assert!(
            s2.was_called("mark_op_applied"),
            "store-2 must receive mark_op_applied"
        );
    }

    #[tokio::test]
    async fn ops_log_mark_not_called_when_write_fails() {
        let s0 = MockStore::new("store-a", true); // fails
        let s1 = MockStore::new("store-b", false);
        let store = MultiStore::new(vec![s0.clone(), s1.clone()]);
        store
            .create_row("_test_", "row-fail", None, None)
            .await
            .ok();
        assert!(
            s0.was_called("begin_ops_log"),
            "begin must be called even for failing store"
        );
        assert!(
            !s0.was_called("mark_op_applied"),
            "mark must NOT be called when write fails"
        );
        assert!(
            s1.was_called("mark_op_applied"),
            "mark must be called for succeeding store"
        );
    }

    #[tokio::test]
    async fn ensure_schema_fans_out() {
        let p = MockStore::new("store-a", false);
        let s = MockStore::new("store-b", false);
        let store = MultiStore::new(vec![p.clone(), s.clone()], None);
        store.ensure_schema().await.unwrap();
        assert!(p.was_called("ensure_schema"));
        assert!(s.was_called("ensure_schema"));
    }


}
