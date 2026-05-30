// gRPC SyncService — bidirectional sync gateway.
//
// All DB access is delegated to AppState.store (DataStore trait).

use std::pin::Pin;

use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
use tonic::{Request, Response, Status};

use crate::{flag, remark, repo::AppState};

// ── Proto types ────────────────────────────────────────────────────────────────

pub mod proto {
    tonic::include_proto!("structable");
}

use proto::{
    client_op::Payload as OpPayload,
    sync_server::{Sync, SyncServer},
    *,
};

// ── Broadcast channel capacity ─────────────────────────────────────────────────
pub const EVENT_CHANNEL_SIZE: usize = 512;

pub type EventTx = broadcast::Sender<ServerEvent>;

pub fn make_channel() -> EventTx {
    broadcast::channel(EVENT_CHANNEL_SIZE).0
}

pub fn make_server(state: AppState) -> SyncServer<SyncServiceImpl> {
    SyncServer::new(SyncServiceImpl { state })
}

// ── Service struct ─────────────────────────────────────────────────────────────

pub struct SyncServiceImpl {
    state: AppState,
}

// ── Stream type alias ──────────────────────────────────────────────────────────

type SubscribeStream =
    Pin<Box<dyn futures_core::Stream<Item = Result<ServerEvent, Status>> + Send + 'static>>;

// ── Conversion helpers ─────────────────────────────────────────────────────────

fn flag_to_proto(f: &flag::CellFlag) -> Flag {
    Flag {
        id: f.id.clone(),
        key: f.key.clone(),
        color: f.color.clone(),
    }
}

fn remark_to_proto(r: &remark::Remark) -> Remark {
    Remark {
        id: r.id.clone(),
        body: r.body.clone(),
        kind: r.kind.clone(),
        is_private: r.is_private,
        resolved_at: r.resolved_at.map(|dt| dt.to_rfc3339()).unwrap_or_default(),
        targets: r
            .targets
            .iter()
            .map(|t| RemarkTarget {
                // Proto uses repo_id: i64; '' sentinel → 0.
                repo_id: if t.row_id.is_empty() {
                    0
                } else {
                    t.row_id.parse().unwrap_or(0)
                },
                column_id: t.column_id.clone(),
            })
            .collect(),
    }
}

// ── Service implementation ─────────────────────────────────────────────────────

#[tonic::async_trait]
impl Sync for SyncServiceImpl {
    // ── Reads ──────────────────────────────────────────────────────────────────

    async fn list_flags(&self, _: Request<ListRequest>) -> Result<Response<FlagList>, Status> {
        let flags = self
            .state
            .store
            .list_flags()
            .await
            .map_err(|e| Status::internal(format!("list_flags: {e}")))?;
        Ok(Response::new(FlagList {
            flags: flags.iter().map(flag_to_proto).collect(),
        }))
    }

    async fn list_remarks(&self, _: Request<ListRequest>) -> Result<Response<RemarkList>, Status> {
        let remarks = self
            .state
            .store
            .list_remarks()
            .await
            .map_err(|e| Status::internal(format!("list_remarks: {e}")))?;
        Ok(Response::new(RemarkList {
            remarks: remarks.iter().map(remark_to_proto).collect(),
        }))
    }

    async fn list_hidden_rows(
        &self,
        _: Request<ListRequest>,
    ) -> Result<Response<HiddenRowList>, Status> {
        let rows = self
            .state
            .store
            .list_hidden_rows()
            .await
            .map_err(|e| Status::internal(format!("list_hidden_rows: {e}")))?;
        Ok(Response::new(HiddenRowList {
            rows: rows
                .iter()
                .map(|r| HiddenRow {
                    id: r.id.clone(),
                    // Proto still uses repo_id: i64; parse row_id string.
                    repo_id: r.row_id.parse().unwrap_or(0),
                })
                .collect(),
        }))
    }

    async fn list_hidden_columns(
        &self,
        _: Request<ListRequest>,
    ) -> Result<Response<HiddenColumnList>, Status> {
        let cols = self
            .state
            .store
            .list_hidden_columns()
            .await
            .map_err(|e| Status::internal(format!("list_hidden_columns: {e}")))?;
        Ok(Response::new(HiddenColumnList {
            cols: cols
                .iter()
                .map(|c| HiddenCol {
                    id: c.id.clone(),
                    column_id: c.column_id.clone(),
                })
                .collect(),
        }))
    }

    async fn list_custom_columns(
        &self,
        _: Request<ListRequest>,
    ) -> Result<Response<CustomColumnList>, Status> {
        let cols = self
            .state
            .store
            .list_custom_columns()
            .await
            .map_err(|e| Status::internal(format!("list_custom_columns: {e}")))?;
        Ok(Response::new(CustomColumnList {
            cols: cols
                .iter()
                .map(|c| CustomCol {
                    id: c.id.clone(),
                    name: c.name.clone(),
                    label: c.label.clone().unwrap_or_default(),
                    description: c.description.clone().unwrap_or_default(),
                    expression: c.expression.clone().unwrap_or_default(),
                    position_after: c.position_after.clone().unwrap_or_default(),
                    read_only: c.read_only,
                    types: c.types.clone(),
                })
                .collect(),
        }))
    }

    async fn list_repos(
        &self,
        request: Request<ListReposRequest>,
    ) -> Result<Response<PagedRepos>, Status> {
        let req = request.into_inner();
        let params = crate::types::RowQuery {
            sort: if req.sort.is_empty() {
                None
            } else {
                Some(req.sort)
            },
            page: req.page.max(1) as u32,
            per_page: req.per_page.clamp(1, 200) as u32,
            ..Default::default()
        };
        let paged = self
            .state
            .store
            .list_repos(&params)
            .await
            .map_err(|e| Status::internal(format!("list_repos: {e}")))?;

        let rows_json: Vec<Vec<u8>> = paged
            .data
            .iter()
            .map(|v| serde_json::to_vec(v).unwrap_or_default())
            .collect();

        Ok(Response::new(PagedRepos {
            rows_json,
            total: paged.total,
            page: paged.page as i32,
            per_page: paged.per_page as i32,
        }))
    }

    // ── Mutation ───────────────────────────────────────────────────────────────

    async fn apply_op(&self, request: Request<ClientOp>) -> Result<Response<OpResult>, Status> {
        let op = request.into_inner();
        let op_id = op.op_id.clone();

        let payload = op.payload.ok_or_else(|| {
            tracing::error!("apply_op({op_id}): missing payload");
            Status::invalid_argument("missing payload")
        })?;

        tracing::debug!("apply_op({op_id})");

        match self.dispatch(op_id.clone(), payload).await {
            Ok((event, response_bytes)) => {
                let _ = self.state.event_tx.send(event);
                Ok(Response::new(OpResult {
                    op_id,
                    ok: true,
                    error: String::new(),
                    response: response_bytes,
                }))
            }
            Err(e) => {
                tracing::error!("apply_op({op_id}) failed: {e}");
                Ok(Response::new(OpResult {
                    op_id,
                    ok: false,
                    error: e.to_string(),
                    response: vec![],
                }))
            }
        }
    }

    // ── Server-streaming push ──────────────────────────────────────────────────

    type SubscribeStream = SubscribeStream;

    async fn subscribe(
        &self,
        request: Request<SubscribeRequest>,
    ) -> Result<Response<Self::SubscribeStream>, Status> {
        let client_id = request.into_inner().client_id;
        tracing::info!("subscribe: client {client_id}");
        let rx = self.state.event_tx.subscribe();
        let stream = BroadcastStream::new(rx).filter_map(move |result| match result {
            Ok(event) => Some(Ok(event)),
            Err(e) => {
                tracing::warn!("subscribe({client_id}): broadcast lagged: {e}");
                None
            }
        });
        Ok(Response::new(Box::pin(stream)))
    }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

impl SyncServiceImpl {
    fn record_id(op_id: &str, provided_id: &str) -> String {
        if !provided_id.is_empty() {
            return provided_id.to_string();
        }
        op_id
            .rsplit(':')
            .next()
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
                let f = self.state.store.upsert_flag(&id, &p.key, &p.color).await?;
                self.state
                    .store
                    .append_ops_log(
                        "flag.upsert",
                        serde_json::json!({
                            "op_id": op_id, "id": f.id, "key": f.key, "color": f.color,
                        }),
                        None,
                    )
                    .await?;
                let resp = serde_json::to_vec(&serde_json::json!({
                    "id": f.id, "key": f.key, "color": f.color,
                }))?;
                Ok((flag_event(EventKind::Upsert, flag_to_proto(&f)), resp))
            }
            OpPayload::DeleteFlag(p) => {
                self.state.store.delete_flag(&p.key).await?;
                self.state
                    .store
                    .append_ops_log(
                        "flag.delete",
                        serde_json::json!({
                            "op_id": op_id, "key": p.key,
                        }),
                        None,
                    )
                    .await;
                let event = flag_event(
                    EventKind::Delete,
                    Flag {
                        id: String::new(),
                        key: p.key,
                        color: String::new(),
                    },
                );
                Ok((event, vec![]))
            }
            OpPayload::UpsertRemark(p) => {
                // Proto still carries repo_id: i64; convert to row_id: String at boundary.
                // TODO: update proto to use row_id: string once sync_core Rust is updated.
                let targets: Vec<remark::RemarkTarget> = p
                    .targets
                    .iter()
                    .map(|t| remark::RemarkTarget {
                        row_id: if t.repo_id == 0 {
                            String::new()
                        } else {
                            t.repo_id.to_string()
                        },
                        column_id: t.column_id.clone(),
                    })
                    .collect();
                let r = self
                    .state
                    .store
                    .upsert_remark(&p.id, &p.body, &p.kind, false, None, &targets)
                    .await?;
                self.state
                    .store
                    .append_ops_log(
                        "remark.upsert",
                        serde_json::json!({
                            "op_id": op_id, "id": r.id, "kind": r.kind,
                        }),
                        None,
                    )
                    .await;
                let resp = serde_json::to_vec(&serde_json::json!({
                    "id": r.id, "body": r.body, "kind": r.kind,
                }))?;
                Ok((remark_event(EventKind::Upsert, remark_to_proto(&r)), resp))
            }
            OpPayload::DeleteRemark(p) => {
                self.state.store.delete_remark(&p.id).await?;
                self.state
                    .store
                    .append_ops_log(
                        "remark.delete",
                        serde_json::json!({
                            "op_id": op_id, "id": p.id,
                        }),
                        None,
                    )
                    .await;
                let event = remark_event(
                    EventKind::Delete,
                    Remark {
                        id: p.id,
                        ..Default::default()
                    },
                );
                Ok((event, vec![]))
            }
            OpPayload::AddHiddenRow(p) => {
                // Proto carries repo_id: i64; convert to row_id: String.
                let row_id_str = p.repo_id.to_string();
                let id = Self::record_id(&op_id, &p.id);
                let row = self.state.store.add_hidden_row(&id, &row_id_str).await?;
                self.state
                    .store
                    .append_ops_log(
                        "hidden_row.add",
                        serde_json::json!({
                            "op_id": op_id, "id": row.id, "row_id": row.row_id,
                        }),
                        None,
                    )
                    .await?;
                let event = hidden_row_event(
                    EventKind::Upsert,
                    HiddenRow {
                        id: row.id.clone(),
                        repo_id: p.repo_id,
                    },
                );
                Ok((
                    event,
                    serde_json::to_vec(&serde_json::json!({
                        "id": row.id, "row_id": row.row_id,
                    }))?,
                ))
            }
            OpPayload::RemoveHiddenRow(p) => {
                let row_id_str = p.repo_id.to_string();
                self.state.store.remove_hidden_row(&row_id_str).await?;
                let event = hidden_row_event(
                    EventKind::Delete,
                    HiddenRow {
                        id: String::new(),
                        repo_id: p.repo_id,
                    },
                );
                Ok((event, vec![]))
            }
            OpPayload::AddHiddenCol(p) => {
                let id = Self::record_id(&op_id, &p.id);
                let col = self
                    .state
                    .store
                    .add_hidden_column(&id, &p.column_id)
                    .await?;
                self.state
                    .store
                    .append_ops_log(
                        "hidden_column.add",
                        serde_json::json!({
                            "op_id": op_id, "id": col.id, "column_id": col.column_id,
                        }),
                        None,
                    )
                    .await?;
                let event = hidden_col_event(
                    EventKind::Upsert,
                    HiddenCol {
                        id: col.id.clone(),
                        column_id: p.column_id,
                    },
                );
                Ok((
                    event,
                    serde_json::to_vec(&serde_json::json!({ "id": col.id }))?,
                ))
            }
            OpPayload::RemoveHiddenCol(p) => {
                self.state.store.remove_hidden_column(&p.column_id).await?;
                let event = hidden_col_event(
                    EventKind::Delete,
                    HiddenCol {
                        id: String::new(),
                        column_id: p.column_id,
                    },
                );
                Ok((event, vec![]))
            }
            OpPayload::CreateCustomCol(p) => {
                let col = self
                    .state
                    .store
                    .upsert_custom_column(
                        &p.id,
                        &p.name,
                        if p.label.is_empty() {
                            None
                        } else {
                            Some(p.label.as_str())
                        },
                        if p.description.is_empty() {
                            None
                        } else {
                            Some(p.description.as_str())
                        },
                        if p.expression.is_empty() {
                            None
                        } else {
                            Some(p.expression.as_str())
                        },
                        if p.position_after.is_empty() {
                            None
                        } else {
                            Some(p.position_after.as_str())
                        },
                    )
                    .await?;
                let event = custom_col_event(
                    EventKind::Upsert,
                    CustomCol {
                        id: col.id.clone(),
                        name: col.name.clone(),
                        label: col.label.clone().unwrap_or_default(),
                        description: col.description.clone().unwrap_or_default(),
                        expression: col.expression.clone().unwrap_or_default(),
                        position_after: col.position_after.clone().unwrap_or_default(),
                        read_only: col.read_only,
                        types: col.types.clone(),
                    },
                );
                let resp = serde_json::to_vec(&serde_json::json!({
                    "id": col.id, "name": col.name,
                }))?;
                Ok((event, resp))
            }
            OpPayload::DeleteCustomCol(p) => {
                self.state.store.delete_custom_column(&p.id).await?;
                let event = custom_col_event(
                    EventKind::Delete,
                    CustomCol {
                        id: p.id,
                        ..Default::default()
                    },
                );
                Ok((event, vec![]))
            }
        }
    }
}

// ── Event constructors ─────────────────────────────────────────────────────────

fn flag_event(kind: EventKind, data: Flag) -> ServerEvent {
    ServerEvent {
        payload: Some(server_event::Payload::Flag(FlagEvent {
            kind: kind.into(),
            data: Some(data),
        })),
    }
}

fn remark_event(kind: EventKind, data: Remark) -> ServerEvent {
    ServerEvent {
        payload: Some(server_event::Payload::Remark(RemarkEvent {
            kind: kind.into(),
            data: Some(data),
        })),
    }
}

fn hidden_row_event(kind: EventKind, data: HiddenRow) -> ServerEvent {
    ServerEvent {
        payload: Some(server_event::Payload::HiddenRow(HiddenRowEvent {
            kind: kind.into(),
            data: Some(data),
        })),
    }
}

fn hidden_col_event(kind: EventKind, data: HiddenCol) -> ServerEvent {
    ServerEvent {
        payload: Some(server_event::Payload::HiddenCol(HiddenColEvent {
            kind: kind.into(),
            data: Some(data),
        })),
    }
}

fn custom_col_event(kind: EventKind, data: CustomCol) -> ServerEvent {
    ServerEvent {
        payload: Some(server_event::Payload::CustomCol(CustomColEvent {
            kind: kind.into(),
            data: Some(data),
        })),
    }
}
