use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{error::db_err, repo::AppState};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct HiddenColumn {
    pub id:        i32,
    pub column_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AddHiddenColumn {
    pub column_id: String,
}

pub async fn ensure_table(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS hidden_columns (
            id         SERIAL PRIMARY KEY,
            column_id  TEXT NOT NULL UNIQUE,
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
    sqlx::query_as::<_, HiddenColumn>(
        "SELECT id, column_id FROM hidden_columns ORDER BY id",
    )
    .fetch_all(&state.pool)
    .await
    .map(Json)
    .map_err(|e| db_err("list hidden columns", e))
}

pub async fn add(
    State(state): State<AppState>,
    Json(body): Json<AddHiddenColumn>,
) -> Result<(StatusCode, Json<HiddenColumn>), (StatusCode, String)> {
    sqlx::query_as::<_, HiddenColumn>(
        "INSERT INTO hidden_columns (column_id)
         VALUES ($1)
         ON CONFLICT (column_id) DO UPDATE SET column_id = EXCLUDED.column_id
         RETURNING id, column_id",
    )
    .bind(&body.column_id)
    .fetch_one(&state.pool)
    .await
    .map(|c| (StatusCode::CREATED, Json(c)))
    .map_err(|e| db_err("add hidden column", e))
}

pub async fn remove(
    State(state): State<AppState>,
    Path(column_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    sqlx::query("DELETE FROM hidden_columns WHERE column_id = $1")
        .bind(&column_id)
        .execute(&state.pool)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| db_err("remove hidden column", e))
}
