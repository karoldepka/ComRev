use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::{collections::HashMap, sync::Arc};

use crate::{error::db_err, store::DataStore};

// ─── App state ────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<dyn DataStore>,
    pub event_tx: crate::sync_service::EventTx,
}

// ─── Error wrapper ────────────────────────────────────────────────────────────

pub struct ApiError(anyhow::Error);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        tracing::error!("list_data_rows: {}", self.0);
        (StatusCode::INTERNAL_SERVER_ERROR, self.0.to_string()).into_response()
    }
}

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self {
        Self(e.into())
    }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub async fn list_data_rows(
    State(state): State<AppState>,
    Query(raw): Query<HashMap<String, String>>,
) -> Result<Json<crate::types::PagedResponse>, ApiError> {
    list_data_rows_for_table(State(state), Path("gh_repos".to_string()), Query(raw)).await
}

pub async fn list_data_rows_for_table(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
    Query(raw): Query<HashMap<String, String>>,
) -> Result<Json<crate::types::PagedResponse>, ApiError> {
    let params = crate::types::RowQuery::from_map(&raw);
    tracing::debug!(%table_id, ?raw, "list rows requested");
    let page = state.store.list_data_rows(&table_id, &params).await?;
    tracing::info!(
        total = page.total,
        page = page.page,
        per_page = page.per_page,
        "list rows completed"
    );
    Ok(Json(page))
}

#[derive(Deserialize)]
pub struct PatchCellValueBody {
    pub col_id: String,
    pub value: serde_json::Value,
}

pub async fn patch_cell_value(
    State(state): State<AppState>,
    Path((table_id, row_id)): Path<(String, String)>,
    Json(body): Json<PatchCellValueBody>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::info!(%table_id, %row_id, col_id = %body.col_id, "patch cell value requested");
    state
        .store
        .patch_row_value(&table_id, &row_id, &body.col_id, body.value)
        .await
        .map_err(|e| db_err("repo", e))?;
    tracing::debug!(%table_id, %row_id, col_id = %body.col_id, "patch cell value completed");
    Ok(StatusCode::NO_CONTENT)
}
