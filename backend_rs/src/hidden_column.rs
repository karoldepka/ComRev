use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::repo::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct HiddenColumn {
    pub id:        String,
    pub column_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AddHiddenColumn {
    pub column_id: String,
}

pub async fn ensure_table(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS hidden_columns (
            id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            column_id  TEXT        NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<HiddenColumn>>, (StatusCode, String)> {
    state.store.list_hidden_columns().await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn add(
    State(state): State<AppState>,
    Json(body): Json<AddHiddenColumn>,
) -> Result<(StatusCode, Json<HiddenColumn>), (StatusCode, String)> {
    let col = state.store.add_hidden_column(&body.column_id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.store.append_ops_log("hidden_column.add", serde_json::json!({
        "column_id": col.column_id,
    }), None).await;
    Ok((StatusCode::CREATED, Json(col)))
}

pub async fn remove(
    State(state): State<AppState>,
    Path(column_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state.store.remove_hidden_column(&column_id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.store.append_ops_log("hidden_column.remove", serde_json::json!({
        "column_id": column_id,
    }), None).await;
    Ok(StatusCode::NO_CONTENT)
}
