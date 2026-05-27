use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::repo::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct HiddenRow {
    pub id:      String,
    pub repo_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct AddHiddenRow {
    pub repo_id: i64,
}

pub async fn ensure_table(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS hidden_rows (
            id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            repo_id    BIGINT      NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<HiddenRow>>, (StatusCode, String)> {
    state.store.list_hidden_rows().await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn add(
    State(state): State<AppState>,
    Json(body): Json<AddHiddenRow>,
) -> Result<(StatusCode, Json<HiddenRow>), (StatusCode, String)> {
    let row = state.store.add_hidden_row(body.repo_id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.store.append_ops_log("hidden_row.add", serde_json::json!({
        "repo_id": row.repo_id,
    }), None).await;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn remove(
    State(state): State<AppState>,
    Path(repo_id): Path<i64>,
) -> Result<StatusCode, (StatusCode, String)> {
    state.store.remove_hidden_row(repo_id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.store.append_ops_log("hidden_row.remove", serde_json::json!({
        "repo_id": repo_id,
    }), None).await;
    Ok(StatusCode::NO_CONTENT)
}
