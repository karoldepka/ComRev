use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{error::db_err, repo::AppState};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct HiddenRow {
    pub id:      i32,
    pub repo_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct AddHiddenRow {
    pub repo_id: i64,
}

pub async fn ensure_table(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS hidden_rows (
            id         SERIAL PRIMARY KEY,
            repo_id    BIGINT NOT NULL UNIQUE,
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
    sqlx::query_as::<_, HiddenRow>(
        "SELECT id, repo_id FROM hidden_rows ORDER BY id",
    )
    .fetch_all(&state.pool)
    .await
    .map(Json)
    .map_err(|e| db_err("list hidden rows", e))
}

pub async fn add(
    State(state): State<AppState>,
    Json(body): Json<AddHiddenRow>,
) -> Result<(StatusCode, Json<HiddenRow>), (StatusCode, String)> {
    sqlx::query_as::<_, HiddenRow>(
        "INSERT INTO hidden_rows (repo_id)
         VALUES ($1)
         ON CONFLICT (repo_id) DO UPDATE SET repo_id = EXCLUDED.repo_id
         RETURNING id, repo_id",
    )
    .bind(body.repo_id)
    .fetch_one(&state.pool)
    .await
    .map(|r| (StatusCode::CREATED, Json(r)))
    .map_err(|e| db_err("add hidden row", e))
}

pub async fn remove(
    State(state): State<AppState>,
    Path(repo_id): Path<i64>,
) -> Result<StatusCode, (StatusCode, String)> {
    sqlx::query("DELETE FROM hidden_rows WHERE repo_id = $1")
        .bind(repo_id)
        .execute(&state.pool)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| db_err("remove hidden row", e))
}
