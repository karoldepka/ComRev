use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
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
        tracing::error!("{}", self.0);
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
    _state: State<AppState>,
    _raw: Query<HashMap<String, String>>,
) -> Result<Json<crate::types::PagedResponse>, ApiError> {
    // Legacy route — callers must migrate to /tables/:table_id/data-rows.
    Err(ApiError(anyhow::anyhow!(
        "Use /tables/:table_id/data-rows — table_id is required"
    )))
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

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TableRow {
    pub id: String,
    pub table_id: String,
    pub who_created: Option<String>,
    pub when_created: DateTime<Utc>,
    pub who_last_modified: Option<String>,
    pub when_last_modified: DateTime<Utc>,
    pub custom_values: serde_json::Value,
    pub modify_count: i32,
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateRowBody {
    pub id: String,
    pub title: Option<String>,
    pub who_created: Option<String>,
}

pub async fn create_row(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
    Json(body): Json<CreateRowBody>,
) -> Result<(StatusCode, Json<TableRow>), (StatusCode, String)> {
    let row = state
        .store
        .create_row(
            &table_id,
            &body.id,
            body.title.as_deref(),
            body.who_created.as_deref(),
        )
        .await
        .map_err(|e| db_err("row.create", e))?;
    Ok((StatusCode::CREATED, Json(row)))
}

#[derive(Deserialize)]
pub struct UpsertGithubReposBatchBody {
    pub repos: Vec<serde_json::Value>,
}

pub async fn upsert_github_repos_batch(
    State(state): State<AppState>,
    Json(body): Json<UpsertGithubReposBatchBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    let count = state
        .store
        .upsert_github_repos_batch(&body.repos)
        .await
        .map_err(|e| db_err("github_repos_batch", e))?;
    Ok((
        StatusCode::OK,
        Json(serde_json::json!({ "upserted": count })),
    ))
}

#[derive(Deserialize)]
pub struct BatchUpsertRowsBody {
    pub rows: Vec<serde_json::Value>,
}

pub async fn batch_upsert_rows(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
    Json(body): Json<BatchUpsertRowsBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    let count = state
        .store
        .upsert_rows_batch(&table_id, &body.rows)
        .await
        .map_err(|e| db_err("rows_batch", e))?;
    Ok((
        StatusCode::OK,
        Json(serde_json::json!({ "upserted": count })),
    ))
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
