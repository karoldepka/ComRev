use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::store::DataStore;

// ─── App state ────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub store:    Arc<dyn DataStore>,
    pub event_tx: crate::sync_service::EventTx,
}

// ─── Error wrapper ────────────────────────────────────────────────────────────

pub struct ApiError(anyhow::Error);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        tracing::error!("list_repos: {}", self.0);
        (StatusCode::INTERNAL_SERVER_ERROR, self.0.to_string()).into_response()
    }
}

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self { Self(e.into()) }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub async fn list_repos(
    State(state): State<AppState>,
    Query(params): Query<crate::types::RowQuery>,
) -> Result<Json<crate::types::PagedResponse>, ApiError> {
    Ok(Json(state.store.list_repos(&params).await?))
}

#[derive(Deserialize)]
pub struct PatchCellValueBody {
    pub col_id: String,
    pub value:  serde_json::Value,
}

pub async fn patch_cell_value(
    State(state): State<AppState>,
    Path((table_id, row_id)): Path<(String, String)>,
    Json(body): Json<PatchCellValueBody>,
) -> Result<StatusCode, (StatusCode, String)> {
    state.store
        .patch_row_value(&table_id, &row_id, &body.col_id, body.value)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}
