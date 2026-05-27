use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{error::db_err, repo::AppState};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomColumn {
    pub id:             i32,
    pub name:           String,
    pub label:          Option<String>,
    pub expression:     Option<String>,
    pub position_after: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCustomColumn {
    pub name:           String,
    pub label:          Option<String>,
    pub expression:     Option<String>,
    pub position_after: Option<String>,
}

pub async fn ensure_table(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS custom_columns (
            id             SERIAL PRIMARY KEY,
            name           TEXT NOT NULL,
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
    sqlx::query_as::<_, CustomColumn>(
        "SELECT id, name, label, expression, position_after \
         FROM custom_columns ORDER BY id",
    )
    .fetch_all(&state.pool)
    .await
    .map(Json)
    .map_err(|e| db_err("list custom columns", e))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateCustomColumn>,
) -> Result<(StatusCode, Json<CustomColumn>), (StatusCode, String)> {
    sqlx::query_as::<_, CustomColumn>(
        "INSERT INTO custom_columns (name, label, expression, position_after) \
         VALUES ($1, $2, $3, $4) \
         RETURNING id, name, label, expression, position_after",
    )
    .bind(&body.name)
    .bind(&body.label)
    .bind(&body.expression)
    .bind(&body.position_after)
    .fetch_one(&state.pool)
    .await
    .map(|col| (StatusCode::CREATED, Json(col)))
    .map_err(|e| db_err("create custom column", e))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<StatusCode, (StatusCode, String)> {
    sqlx::query("DELETE FROM custom_columns WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| db_err("delete custom column", e))
}
