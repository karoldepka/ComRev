// gRPC server-side sync service.
//
// Compiled only for non-WASM targets (enabled via the `server` Cargo feature).
// The `SyncBackend` trait decouples the service from any concrete database
// implementation; `backend_rs` provides the implementation for `AppState`.

use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
use tonic::{Request, Response, Status};

use crate::proto::{
    client_op::Payload as OpPayload,
    sync_server::{Sync as SyncGrpc, SyncServer},
    *,
};

// ── Event channel ─────────────────────────────────────────────────────────────

pub const EVENT_CHANNEL_SIZE: usize = 512;
pub type EventTx = broadcast::Sender<ServerEvent>;

pub fn make_channel() -> EventTx {
    broadcast::channel(EVENT_CHANNEL_SIZE).0
}

// ── SyncBackend trait ─────────────────────────────────────────────────────────
//
// Implement this for your application state. All methods take and return proto
// types so the service layer is free of any domain-model coupling.

#[async_trait]
pub trait SyncBackend: Send + std::marker::Sync + 'static {
    // ── Reads ─────────────────────────────────────────────────────────────────
    async fn list_flags(&self) -> anyhow::Result<Vec<Flag>>;
    async fn list_remarks(&self) -> anyhow::Result<Vec<Remark>>;
    async fn list_hidden_rows(&self) -> anyhow::Result<Vec<HiddenRow>>;
    async fn list_hidden_columns(&self) -> anyhow::Result<Vec<HiddenCol>>;
    async fn list_custom_columns(&self, table_id: &str) -> anyhow::Result<Vec<CustomCol>>;
    async fn list_repos(&self, req: ListReposRequest) -> anyhow::Result<PagedRepos>;

    // ── Writes (return proto types) ───────────────────────────────────────────
    async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> anyhow::Result<Flag>;
    async fn delete_flag(&self, key: &str) -> anyhow::Result<()>;
    async fn upsert_remark(&self, op: UpsertRemarkOp) -> anyhow::Result<Remark>;
    async fn delete_remark(&self, id: &str) -> anyhow::Result<()>;
    async fn add_hidden_row(&self, id: &str, repo_id: i64) -> anyhow::Result<HiddenRow>;
    async fn remove_hidden_row(&self, repo_id: i64) -> anyhow::Result<()>;
    async fn add_hidden_col(&self, id: &str, column_id: &str) -> anyhow::Result<HiddenCol>;
    async fn remove_hidden_col(&self, column_id: &str) -> anyhow::Result<()>;
    async fn create_custom_col(
        &self,
        table_id: &str,
        id: &str,
        op: CreateCustomColOp,
    ) -> anyhow::Result<CustomCol>;
    async fn delete_custom_col(&self, id: &str) -> anyhow::Result<()>;
    async fn create_row_class(&self, op: CreateRowClassOp) -> anyhow::Result<RowClass>;
    async fn delete_row_class(&self, table_id: &str, id: &str) -> anyhow::Result<()>;
    async fn set_many_to_many(&self, op: SetManyToManyOp) -> anyhow::Result<ManyToManyValue>;

    fn event_tx(&self) -> &EventTx;
}

// ── Service struct ────────────────────────────────────────────────────────────

pub struct SyncServiceImpl<B: SyncBackend> {
    backend: B,
}

pub fn make_server<B: SyncBackend>(backend: B) -> SyncServer<SyncServiceImpl<B>> {
    SyncServer::new(SyncServiceImpl { backend })
}

// ── Stream type alias ─────────────────────────────────────────────────────────

type SubscribeStream =
    Pin<Box<dyn Stream<Item = Result<ServerEvent, Status>> + Send + 'static>>;

// ── Helper ────────────────────────────────────────────────────────────────────

fn require_table_id(table_id: String, ctx: &str) -> Result<String, Status> {
    if table_id.is_empty() {
        Err(Status::invalid_argument(format!("{ctx}: table_id is required")))
    } else {
        Ok(table_id)
    }
}

// ── Tonic Sync implementation ─────────────────────────────────────────────────

#[tonic::async_trait]
impl<B: SyncBackend> SyncGrpc for SyncServiceImpl<B> {
    // ── Reads ─────────────────────────────────────────────────────────────────

    async fn list_flags(&self, _: Request<ListRequest>) -> Result<Response<FlagList>, Status> {
        let flags = self.backend.list_flags().await
            .map_err(|e| Status::internal(format!("list_flags: {e}")))?;
        Ok(Response::new(FlagList { flags }))
    }

    async fn list_remarks(&self, _: Request<ListRequest>) -> Result<Response<RemarkList>, Status> {
        let remarks = self.backend.list_remarks().await
            .map_err(|e| Status::internal(format!("list_remarks: {e}")))?;
        Ok(Response::new(RemarkList { remarks }))
    }

    async fn list_hidden_rows(&self, _: Request<ListRequest>) -> Result<Response<HiddenRowList>, Status> {
        let rows = self.backend.list_hidden_rows().await
            .map_err(|e| Status::internal(format!("list_hidden_rows: {e}")))?;
        Ok(Response::new(HiddenRowList { rows }))
    }

    async fn list_hidden_columns(&self, _: Request<ListRequest>) -> Result<Response<HiddenColumnList>, Status> {
        let cols = self.backend.list_hidden_columns().await
            .map_err(|e| Status::internal(format!("list_hidden_columns: {e}")))?;
        Ok(Response::new(HiddenColumnList { cols }))
    }

    async fn list_custom_columns(
        &self,
        request: Request<ListRequest>,
    ) -> Result<Response<CustomColumnList>, Status> {
        let table_id = require_table_id(request.into_inner().table_id, "list_custom_columns")?;
        let cols = self.backend.list_custom_columns(&table_id).await
            .map_err(|e| Status::internal(format!("list_custom_columns: {e}")))?;
        Ok(Response::new(CustomColumnList { cols }))
    }

    async fn list_repos(
        &self,
        request: Request<ListReposRequest>,
    ) -> Result<Response<PagedRepos>, Status> {
        let req = request.into_inner();
        require_table_id(req.table_id.clone(), "list_repos")?;
        let paged = self.backend.list_repos(req).await
            .map_err(|e| Status::internal(format!("list_repos: {e}")))?;
        Ok(Response::new(paged))
    }

    // ── Mutation ──────────────────────────────────────────────────────────────

    async fn apply_op(&self, request: Request<ClientOp>) -> Result<Response<OpResult>, Status> {
        let op = request.into_inner();
        let op_id = op.op_id.clone();
        let payload = op.payload.ok_or_else(|| {
            Status::invalid_argument("missing payload")
        })?;
        match self.dispatch(op_id.clone(), payload).await {
            Ok((event, response)) => {
                let _ = self.backend.event_tx().send(event);
                Ok(Response::new(OpResult { op_id, ok: true, error: String::new(), response }))
            }
            Err(e) => {
                tracing::error!("apply_op({op_id}) failed: {e}");
                Ok(Response::new(OpResult { op_id, ok: false, error: e.to_string(), response: vec![] }))
            }
        }
    }

    // ── Subscribe stream ──────────────────────────────────────────────────────

    type SubscribeStream = SubscribeStream;

    async fn subscribe(
        &self,
        request: Request<SubscribeRequest>,
    ) -> Result<Response<SubscribeStream>, Status> {
        let client_id = request.into_inner().client_id;
        tracing::info!("subscribe: client {client_id}");
        let rx = self.backend.event_tx().subscribe();
        let stream = BroadcastStream::new(rx).filter_map(move |r| match r {
            Ok(ev) => Some(Ok(ev)),
            Err(e) => {
                tracing::warn!("subscribe({client_id}): broadcast lagged: {e}");
                None
            }
        });
        Ok(Response::new(Box::pin(stream)))
    }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

impl<B: SyncBackend> SyncServiceImpl<B> {
    pub fn record_id(op_id: &str, provided_id: &str) -> String {
        if !provided_id.is_empty() {
            return provided_id.to_string();
        }
        op_id.rsplit(':').next()
            .filter(|id| !id.is_empty())
            .unwrap_or(op_id)
            .to_string()
    }

    async fn dispatch(
        &self,
        op_id: String,
        payload: OpPayload,
    ) -> anyhow::Result<(ServerEvent, Vec<u8>)> {
        match payload {
            OpPayload::UpsertFlag(p) => {
                let id = Self::record_id(&op_id, &p.id);
                let f = self.backend.upsert_flag(&id, &p.key, &p.color).await?;
                let resp = serde_json::to_vec(&serde_json::json!({ "id": f.id, "key": f.key, "color": f.color }))?;
                Ok((flag_event(EventKind::Upsert, f), resp))
            }
            OpPayload::DeleteFlag(p) => {
                self.backend.delete_flag(&p.key).await?;
                Ok((flag_event(EventKind::Delete, Flag { id: String::new(), key: p.key, color: String::new() }), vec![]))
            }
            OpPayload::UpsertRemark(p) => {
                let r = self.backend.upsert_remark(p).await?;
                let resp = serde_json::to_vec(&serde_json::json!({ "id": r.id, "body": r.body, "kind": r.kind }))?;
                Ok((remark_event(EventKind::Upsert, r), resp))
            }
            OpPayload::DeleteRemark(p) => {
                self.backend.delete_remark(&p.id).await?;
                Ok((remark_event(EventKind::Delete, Remark { id: p.id, ..Default::default() }), vec![]))
            }
            OpPayload::AddHiddenRow(p) => {
                let id = Self::record_id(&op_id, &p.id);
                let row = self.backend.add_hidden_row(&id, p.repo_id).await?;
                let resp = serde_json::to_vec(&serde_json::json!({ "id": row.id, "repo_id": row.repo_id }))?;
                Ok((hidden_row_event(EventKind::Upsert, row), resp))
            }
            OpPayload::RemoveHiddenRow(p) => {
                self.backend.remove_hidden_row(p.repo_id).await?;
                Ok((hidden_row_event(EventKind::Delete, HiddenRow { id: String::new(), repo_id: p.repo_id }), vec![]))
            }
            OpPayload::AddHiddenCol(p) => {
                let id = Self::record_id(&op_id, &p.id);
                let col = self.backend.add_hidden_col(&id, &p.column_id).await?;
                let resp = serde_json::to_vec(&serde_json::json!({ "id": col.id }))?;
                Ok((hidden_col_event(EventKind::Upsert, col), resp))
            }
            OpPayload::RemoveHiddenCol(p) => {
                self.backend.remove_hidden_col(&p.column_id).await?;
                Ok((hidden_col_event(EventKind::Delete, HiddenCol { id: String::new(), column_id: p.column_id }), vec![]))
            }
            OpPayload::CreateCustomCol(p) => {
                let table_id = require_table_id(p.table_id.clone(), "CreateCustomCol")
                    .map_err(|e| anyhow::anyhow!("{e}"))?;
                let id = Self::record_id(&op_id, &p.id);
                let col = self.backend.create_custom_col(&table_id, &id, p).await?;
                let resp = serde_json::to_vec(&serde_json::json!({ "id": col.id }))?;
                Ok((custom_col_event(EventKind::Upsert, col), resp))
            }
            OpPayload::DeleteCustomCol(p) => {
                self.backend.delete_custom_col(&p.id).await?;
                Ok((custom_col_event(EventKind::Delete, CustomCol { id: p.id, ..Default::default() }), vec![]))
            }
            OpPayload::CreateRowClass(p) => {
                require_table_id(p.table_id.clone(), "CreateRowClass")
                    .map_err(|e| anyhow::anyhow!("{e}"))?;
                let row_class = self.backend.create_row_class(p).await?;
                let resp = serde_json::to_vec(&serde_json::json!({
                    "id": row_class.id,
                    "table_id": row_class.table_id,
                    "name": row_class.name,
                    "color": row_class.color,
                }))?;
                Ok((row_class_event(EventKind::Upsert, row_class), resp))
            }
            OpPayload::DeleteRowClass(p) => {
                let table_id = require_table_id(p.table_id, "DeleteRowClass")
                    .map_err(|e| anyhow::anyhow!("{e}"))?;
                self.backend.delete_row_class(&table_id, &p.id).await?;
                Ok((row_class_event(EventKind::Delete, RowClass { id: p.id, table_id, ..Default::default() }), vec![]))
            }
            OpPayload::SetManyToMany(p) => {
                require_table_id(p.table_id.clone(), "SetManyToMany")
                    .map_err(|e| anyhow::anyhow!("{e}"))?;
                let value = self.backend.set_many_to_many(p).await?;
                let resp = serde_json::to_vec(&serde_json::json!({
                    "table_id": value.table_id,
                    "row_id": value.row_id,
                    "field_id": value.field_id,
                    "item_ids": value.item_ids,
                }))?;
                Ok((many_to_many_event(EventKind::Upsert, value), resp))
            }
        }
    }
}

// ── Event constructors ────────────────────────────────────────────────────────

pub fn flag_event(kind: EventKind, data: Flag) -> ServerEvent {
    ServerEvent { payload: Some(server_event::Payload::Flag(FlagEvent { kind: kind.into(), data: Some(data) })) }
}
pub fn remark_event(kind: EventKind, data: Remark) -> ServerEvent {
    ServerEvent { payload: Some(server_event::Payload::Remark(RemarkEvent { kind: kind.into(), data: Some(data) })) }
}
pub fn hidden_row_event(kind: EventKind, data: HiddenRow) -> ServerEvent {
    ServerEvent { payload: Some(server_event::Payload::HiddenRow(HiddenRowEvent { kind: kind.into(), data: Some(data) })) }
}
pub fn hidden_col_event(kind: EventKind, data: HiddenCol) -> ServerEvent {
    ServerEvent { payload: Some(server_event::Payload::HiddenCol(HiddenColEvent { kind: kind.into(), data: Some(data) })) }
}
pub fn custom_col_event(kind: EventKind, data: CustomCol) -> ServerEvent {
    ServerEvent { payload: Some(server_event::Payload::CustomCol(CustomColEvent { kind: kind.into(), data: Some(data) })) }
}
pub fn row_class_event(kind: EventKind, data: RowClass) -> ServerEvent {
    ServerEvent { payload: Some(server_event::Payload::RowClass(RowClassEvent { kind: kind.into(), data: Some(data) })) }
}
pub fn many_to_many_event(kind: EventKind, data: ManyToManyValue) -> ServerEvent {
    ServerEvent { payload: Some(server_event::Payload::ManyToMany(ManyToManyEvent { kind: kind.into(), data: Some(data) })) }
}
pub fn cell_value_event(table_id: impl Into<String>, row_id: impl Into<String>, col_id: impl Into<String>, value_json: impl Into<String>) -> ServerEvent {
    ServerEvent { payload: Some(server_event::Payload::CellValue(CellValueEvent {
        table_id: table_id.into(),
        row_id: row_id.into(),
        col_id: col_id.into(),
        value_json: value_json.into(),
    }))}
}
pub fn store_error_event(method: impl Into<String>, message: impl Into<String>) -> ServerEvent {
    ServerEvent { payload: Some(server_event::Payload::StoreError(StoreErrorEvent { method: method.into(), message: message.into() })) }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── record_id ─────────────────────────────────────────────────────────────

    struct DummyBackend; // needed to call SyncServiceImpl::record_id (static)

    #[async_trait]
    impl SyncBackend for DummyBackend {
        async fn list_flags(&self) -> anyhow::Result<Vec<Flag>> { Ok(vec![]) }
        async fn list_remarks(&self) -> anyhow::Result<Vec<Remark>> { Ok(vec![]) }
        async fn list_hidden_rows(&self) -> anyhow::Result<Vec<HiddenRow>> { Ok(vec![]) }
        async fn list_hidden_columns(&self) -> anyhow::Result<Vec<HiddenCol>> { Ok(vec![]) }
        async fn list_custom_columns(&self, _: &str) -> anyhow::Result<Vec<CustomCol>> { Ok(vec![]) }
        async fn list_repos(&self, _: ListReposRequest) -> anyhow::Result<PagedRepos> {
            Ok(PagedRepos { rows_json: vec![], total: 0, page: 1, per_page: 50 })
        }
        async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> anyhow::Result<Flag> {
            Ok(Flag { id: id.into(), key: key.into(), color: color.into() })
        }
        async fn delete_flag(&self, _: &str) -> anyhow::Result<()> { Ok(()) }
        async fn upsert_remark(&self, op: UpsertRemarkOp) -> anyhow::Result<Remark> {
            Ok(Remark { id: op.id, body: op.body, kind: op.kind, ..Default::default() })
        }
        async fn delete_remark(&self, _: &str) -> anyhow::Result<()> { Ok(()) }
        async fn add_hidden_row(&self, id: &str, repo_id: i64) -> anyhow::Result<HiddenRow> {
            Ok(HiddenRow { id: id.into(), repo_id })
        }
        async fn remove_hidden_row(&self, _: i64) -> anyhow::Result<()> { Ok(()) }
        async fn add_hidden_col(&self, id: &str, column_id: &str) -> anyhow::Result<HiddenCol> {
            Ok(HiddenCol { id: id.into(), column_id: column_id.into() })
        }
        async fn remove_hidden_col(&self, _: &str) -> anyhow::Result<()> { Ok(()) }
        async fn create_custom_col(&self, _: &str, id: &str, _: CreateCustomColOp) -> anyhow::Result<CustomCol> {
            Ok(CustomCol { id: id.into(), ..Default::default() })
        }
        async fn delete_custom_col(&self, _: &str) -> anyhow::Result<()> { Ok(()) }
        async fn create_row_class(&self, op: CreateRowClassOp) -> anyhow::Result<RowClass> {
            Ok(RowClass { id: op.id, table_id: op.table_id, name: op.name, color: op.color })
        }
        async fn delete_row_class(&self, _: &str, _: &str) -> anyhow::Result<()> { Ok(()) }
        async fn set_many_to_many(&self, op: SetManyToManyOp) -> anyhow::Result<ManyToManyValue> {
            Ok(ManyToManyValue {
                table_id: op.table_id,
                row_id: op.row_id,
                field_id: op.field_id,
                item_ids: op.item_ids,
            })
        }
        fn event_tx(&self) -> &EventTx { unimplemented!() }
    }

    type S = SyncServiceImpl<DummyBackend>;

    #[test]
    fn record_id_uses_provided_id() {
        assert_eq!(S::record_id("op:abc123", "explicit-id"), "explicit-id");
    }

    #[test]
    fn record_id_falls_back_to_op_id_suffix() {
        assert_eq!(S::record_id("op:abc123", ""), "abc123");
    }

    #[test]
    fn record_id_uses_full_op_id_when_no_colon() {
        assert_eq!(S::record_id("plainopid", ""), "plainopid");
    }

    // ── event constructors ────────────────────────────────────────────────────

    #[test]
    fn flag_event_has_correct_payload() {
        let ev = flag_event(EventKind::Upsert, Flag { id: "1".into(), key: "k".into(), color: "red".into() });
        assert!(matches!(ev.payload, Some(server_event::Payload::Flag(_))));
    }

    #[test]
    fn store_error_event_carries_method_and_message() {
        let ev = store_error_event("list_flags", "db error");
        if let Some(server_event::Payload::StoreError(e)) = ev.payload {
            assert_eq!(e.method, "list_flags");
            assert_eq!(e.message, "db error");
        } else {
            panic!("wrong payload variant");
        }
    }

    // ── dispatch (tokio async tests) ──────────────────────────────────────────

    #[tokio::test]
    async fn dispatch_upsert_flag_broadcasts_flag_event() {
        let svc = SyncServiceImpl { backend: DummyBackend };
        let op = OpPayload::UpsertFlag(UpsertFlagOp {
            id: "f1".into(), key: "header:name".into(), color: "blue".into(),
        });
        let (ev, resp) = svc.dispatch("op:f1".into(), op).await.unwrap();
        assert!(matches!(ev.payload, Some(server_event::Payload::Flag(_))));
        assert!(!resp.is_empty());
    }

    #[tokio::test]
    async fn dispatch_delete_flag_returns_empty_response() {
        let svc = SyncServiceImpl { backend: DummyBackend };
        let op = OpPayload::DeleteFlag(DeleteFlagOp { key: "header:name".into() });
        let (_, resp) = svc.dispatch("op:del".into(), op).await.unwrap();
        assert!(resp.is_empty());
    }

    #[tokio::test]
    async fn dispatch_create_custom_col_requires_table_id() {
        let svc = SyncServiceImpl { backend: DummyBackend };
        let op = OpPayload::CreateCustomCol(CreateCustomColOp {
            id: "c1".into(), title: "Stars".into(), table_id: String::new(),
            ..Default::default()
        });
        assert!(svc.dispatch("op:c1".into(), op).await.is_err());
    }
}
