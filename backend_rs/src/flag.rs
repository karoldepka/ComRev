use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{error::db_err, repo::AppState};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CellFlag {
    pub id:    i32,
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
            id         SERIAL PRIMARY KEY,
            key        TEXT NOT NULL UNIQUE,
            color      TEXT NOT NULL,
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
    sqlx::query_as::<_, CellFlag>(
        "SELECT id, key, color FROM cell_flags ORDER BY id",
    )
    .fetch_all(&state.pool)
    .await
    .map(Json)
    .map_err(|e| db_err("list flags", e))
}

pub async fn upsert(
    State(state): State<AppState>,
    Json(body): Json<UpsertFlag>,
) -> Result<Json<CellFlag>, (StatusCode, String)> {
    sqlx::query_as::<_, CellFlag>(
        "INSERT INTO cell_flags (key, color)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE
           SET color = EXCLUDED.color, updated_at = NOW()
         RETURNING id, key, color",
    )
    .bind(&body.key)
    .bind(&body.color)
    .fetch_one(&state.pool)
    .await
    .map(Json)
    .map_err(|e| db_err("upsert flag", e))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    sqlx::query("DELETE FROM cell_flags WHERE key = $1")
        .bind(&key)
        .execute(&state.pool)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| db_err("delete flag", e))
}
