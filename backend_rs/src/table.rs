use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{error::db_err, data_row::AppState};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Table {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub who_created: Option<String>,
    pub when_created: DateTime<Utc>,
    pub who_last_modified: Option<String>,
    pub when_last_modified: DateTime<Utc>,
    pub modify_count: i32,
}

/// Only user-editable fields; id and audit timestamps are server-managed.
#[derive(Debug, Deserialize)]
pub struct CreateTable {
    /// Client provides the nanoid so creation works offline.
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub who_created: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchTable {
    pub title: Option<String>,
    pub description: Option<String>,
    pub who_last_modified: Option<String>,
}

pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Table>>, (StatusCode, String)> {
    state
        .store
        .list_tables()
        .await
        .map(Json)
        .map_err(|e| db_err("table", e))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateTable>,
) -> Result<(StatusCode, Json<Table>), (StatusCode, String)> {
    let t = state
        .store
        .create_table(
            &body.id,
            &body.title,
            body.description.as_deref(),
            body.who_created.as_deref(),
        )
        .await
        .map_err(|e| db_err("table", e))?;
    Ok((StatusCode::CREATED, Json(t)))
}

pub async fn patch(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PatchTable>,
) -> Result<Json<Table>, (StatusCode, String)> {
    let t = state
        .store
        .patch_table(
            &id,
            body.title.as_deref(),
            body.description.as_deref(),
            body.who_last_modified.as_deref(),
        )
        .await
        .map_err(|e| db_err("table", e))?;
    Ok(Json(t))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .store
        .delete_table(&id)
        .await
        .map_err(|e| db_err("table", e))?;
    Ok(StatusCode::NO_CONTENT)
}
