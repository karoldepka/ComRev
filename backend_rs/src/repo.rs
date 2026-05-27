use axum::{
    extract::{Query, State},
    response::IntoResponse,
    http::StatusCode,
    Json,
};
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
    Query(params): Query<crate::types::RepoQuery>,
) -> Result<Json<crate::types::PagedResponse>, ApiError> {
    Ok(Json(state.store.list_repos(&params).await?))
}
