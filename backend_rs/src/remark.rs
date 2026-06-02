use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{data_row::AppState, error::db_err};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RemarkTarget {
    pub row_id: String, // '' = column-header remark
    pub column_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Remark {
    pub id: String,
    pub body: String,
    pub kind: String,
    pub is_private: bool,
    pub resolved_at: Option<chrono::DateTime<chrono::Utc>>,
    pub targets: Vec<RemarkTarget>,
}

/// Wire shape used by the PG json_agg aggregation query.
#[derive(sqlx::FromRow)]
pub struct RemarkRow {
    pub id: String,
    pub body: String,
    pub kind: String,
    pub is_private: bool,
    pub resolved_at: Option<chrono::DateTime<chrono::Utc>>,
    pub targets_json: serde_json::Value,
}

impl From<RemarkRow> for Remark {
    fn from(r: RemarkRow) -> Self {
        let targets =
            serde_json::from_value::<Vec<RemarkTarget>>(r.targets_json).unwrap_or_default();
        Remark {
            id: r.id,
            body: r.body,
            kind: r.kind,
            is_private: r.is_private,
            resolved_at: r.resolved_at,
            targets,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UpsertRemark {
    pub body: String,
    pub kind: Option<String>,
    pub is_private: Option<bool>,
    pub targets: Vec<RemarkTarget>,
    pub resolved_at: Option<chrono::DateTime<chrono::Utc>>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<Remark>>, (StatusCode, String)> {
    state
        .store
        .list_remarks()
        .await
        .map(Json)
        .map_err(|e| db_err("remark", e))
}

pub async fn upsert(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpsertRemark>,
) -> Result<Json<Remark>, (StatusCode, String)> {
    let kind = body.kind.as_deref().unwrap_or("note");
    let is_private = body.is_private.unwrap_or(false);

    let remark = state
        .store
        .upsert_remark(
            &id,
            &body.body,
            kind,
            is_private,
            body.resolved_at,
            &body.targets,
        )
        .await
        .map_err(|e| db_err("remark", e))?;

    Ok(Json(remark))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .store
        .delete_remark(&id)
        .await
        .map_err(|e| db_err("remark", e))?;
    Ok(StatusCode::NO_CONTENT)
}
