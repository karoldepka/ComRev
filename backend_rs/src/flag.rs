use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::repo::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CellFlag {
    pub id:    String,
    pub key:   String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct UpsertFlag {
    pub key:   String,
    pub color: String,
}

pub async fn ensure_table(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS cell_flags (
            id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            key        TEXT        NOT NULL UNIQUE,
            color      TEXT        NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<CellFlag>>, (StatusCode, String)> {
    state.store.list_flags().await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn upsert(
    State(state): State<AppState>,
    Json(body): Json<UpsertFlag>,
) -> Result<Json<CellFlag>, (StatusCode, String)> {
    let flag = state.store.upsert_flag(&body.key, &body.color).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.store.append_ops_log("flag.upsert", serde_json::json!({
        "key": flag.key, "color": flag.color,
    }), None).await;
    Ok(Json(flag))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state.store.delete_flag(&key).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.store.append_ops_log("flag.delete", serde_json::json!({ "key": key }), None).await;
    Ok(StatusCode::NO_CONTENT)
}
