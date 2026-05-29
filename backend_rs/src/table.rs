use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::repo::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Table {
    pub id:                 String,
    pub title:              String,
    pub description:        Option<String>,
    pub who_created:        Option<String>,
    pub when_created:       DateTime<Utc>,
    pub who_last_modified:  Option<String>,
    pub when_last_modified: DateTime<Utc>,
    pub modify_count:       i32,
}

/// Only user-editable fields; id and audit timestamps are server-managed.
#[derive(Debug, Deserialize)]
pub struct CreateTable {
    /// Client provides the nanoid so creation works offline.
    pub id:          String,
    pub title:       String,
    pub description: Option<String>,
    pub who_created: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchTable {
    pub title:            Option<String>,
    pub description:      Option<String>,
    pub who_last_modified: Option<String>,
}

pub async fn ensure_table(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tables (
            id                 TEXT        PRIMARY KEY,
            title              TEXT        NOT NULL,
            description        TEXT,
            who_created        TEXT,
            when_created       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            who_last_modified  TEXT,
            when_last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            modify_count       INTEGER     NOT NULL DEFAULT 0
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<Table>>, (StatusCode, String)> {
    state.store.list_tables().await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateTable>,
) -> Result<(StatusCode, Json<Table>), (StatusCode, String)> {
    let t = state.store
        .create_table(&body.id, &body.title, body.description.as_deref(), body.who_created.as_deref())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.store.append_ops_log("table.create", serde_json::json!({
        "id": t.id, "title": t.title,
    }), None).await;
    Ok((StatusCode::CREATED, Json(t)))
}

pub async fn patch(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PatchTable>,
) -> Result<Json<Table>, (StatusCode, String)> {
    let t = state.store
        .patch_table(&id, body.title.as_deref(), body.description.as_deref(), body.who_last_modified.as_deref())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.store.append_ops_log("table.patch", serde_json::json!({
        "id": t.id,
    }), None).await;
    Ok(Json(t))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state.store.delete_table(&id).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.store.append_ops_log("table.delete", serde_json::json!({ "id": id }), None).await;
    Ok(StatusCode::NO_CONTENT)
}
