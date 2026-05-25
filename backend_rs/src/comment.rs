use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::repo::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Comment {
    pub id:        i32,
    pub repo_id:   i64,
    pub column_id: String,
    pub body:      String,
}

#[derive(Debug, Deserialize)]
pub struct UpsertComment {
    pub repo_id:   i64,
    pub column_id: String,
    pub body:      String,
}

pub async fn ensure_table(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS cell_comments (
            id         SERIAL PRIMARY KEY,
            repo_id    BIGINT NOT NULL,
            column_id  TEXT   NOT NULL,
            body       TEXT   NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (repo_id, column_id)
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<Comment>>, (StatusCode, String)> {
    sqlx::query_as::<_, Comment>(
        "SELECT id, repo_id, column_id, body FROM cell_comments ORDER BY id",
    )
    .fetch_all(&state.pool)
    .await
    .map(Json)
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn upsert(
    State(state): State<AppState>,
    Json(body): Json<UpsertComment>,
) -> Result<Json<Comment>, (StatusCode, String)> {
    sqlx::query_as::<_, Comment>(
        "INSERT INTO cell_comments (repo_id, column_id, body)
         VALUES ($1, $2, $3)
         ON CONFLICT (repo_id, column_id) DO UPDATE
           SET body = EXCLUDED.body, updated_at = NOW()
         RETURNING id, repo_id, column_id, body",
    )
    .bind(body.repo_id)
    .bind(&body.column_id)
    .bind(&body.body)
    .fetch_one(&state.pool)
    .await
    .map(Json)
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<StatusCode, (StatusCode, String)> {
    sqlx::query("DELETE FROM cell_comments WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
