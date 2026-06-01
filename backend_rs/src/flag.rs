use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{error::db_err, data_row::AppState};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CellFlag {
    pub id: String,
    pub key: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct UpsertFlag {
    pub id: String,
    pub key: String,
    pub color: String,
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<CellFlag>>, (StatusCode, String)> {
    state
        .store
        .list_flags()
        .await
        .map(Json)
        .map_err(|e| db_err("flag", e))
}

pub async fn upsert(
    State(state): State<AppState>,
    Json(body): Json<UpsertFlag>,
) -> Result<Json<CellFlag>, (StatusCode, String)> {
    let flag = state
        .store
        .upsert_flag(&body.id, &body.key, &body.color)
        .await
        .map_err(|e| db_err("flag", e))?;
    Ok(Json(flag))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .store
        .delete_flag(&key)
        .await
        .map_err(|e| db_err("flag", e))?;
    Ok(StatusCode::NO_CONTENT)
}
