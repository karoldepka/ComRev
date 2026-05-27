use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::repo::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomColumn {
    pub id:             String,
    pub name:           String,
    pub label:          Option<String>,
    pub expression:     Option<String>,
    pub position_after: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCustomColumn {
    pub id:             Option<String>,
    pub name:           String,
    pub label:          Option<String>,
    pub expression:     Option<String>,
    pub position_after: Option<String>,
}

pub async fn ensure_table(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS custom_columns (
            id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name           TEXT        NOT NULL,
            label          TEXT,
            expression     TEXT,
            position_after TEXT,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<CustomColumn>>, (StatusCode, String)> {
    state.store.list_custom_columns().await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateCustomColumn>,
) -> Result<(StatusCode, Json<CustomColumn>), (StatusCode, String)> {
    let CreateCustomColumn { id, name, label, expression, position_after } = body;
    // Client should always provide a nanoid; server generates one only as fallback.
    let id = id.filter(|s| !s.is_empty()).unwrap_or_else(|| nanoid::nanoid!());

    let col = state.store.upsert_custom_column(
        &id,
        &name,
        label.as_deref(),
        expression.as_deref(),
        position_after.as_deref(),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    state.store.append_ops_log("custom_column.create", serde_json::json!({
        "id": col.id, "name": col.name,
    }), None).await;

    Ok((StatusCode::CREATED, Json(col)))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state.store.delete_custom_column(&id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.store.append_ops_log("custom_column.delete", serde_json::json!({ "id": id }), None).await;
    Ok(StatusCode::NO_CONTENT)
}
