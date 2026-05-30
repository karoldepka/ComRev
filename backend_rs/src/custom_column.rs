use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{error::db_err, data_row::AppState};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomColumn {
    pub id: String,
    pub name: String,
    pub label: Option<String>,
    pub description: Option<String>,
    pub expression: Option<String>,
    pub position_after: Option<String>,
    pub read_only: bool,
    pub types: Vec<String>,
    pub source_path: Option<Vec<String>>,
    pub data_types: Vec<String>,
    pub is_group: bool,
    pub parent_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCustomColumn {
    pub id: Option<String>,
    pub name: String,
    pub label: Option<String>,
    pub description: Option<String>,
    pub expression: Option<String>,
    pub position_after: Option<String>,
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<CustomColumn>>, (StatusCode, String)> {
    state
        .store
        .list_custom_columns()
        .await
        .map(Json)
        .map_err(|e| db_err("custom_column", e))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateCustomColumn>,
) -> Result<(StatusCode, Json<CustomColumn>), (StatusCode, String)> {
    let CreateCustomColumn {
        id,
        name,
        label,
        description,
        expression,
        position_after,
    } = body;
    // Client should always provide a nanoid.
    let id = id
        .filter(|s| !s.is_empty())
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "missing column id".to_string()))?;

    let col = state
        .store
        .upsert_custom_column(
            &id,
            &name,
            label.as_deref(),
            description.as_deref(),
            expression.as_deref(),
            position_after.as_deref(),
        )
        .await
        .map_err(|e| db_err("custom_column", e))?;

    state
        .store
        .append_ops_log(
            "custom_column.create",
            serde_json::json!({
                "id": col.id, "name": col.name,
            }),
            None,
        )
        .await;

    Ok((StatusCode::CREATED, Json(col)))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .store
        .delete_custom_column(&id)
        .await
        .map_err(|e| db_err("custom_column", e))?;
    state
        .store
        .append_ops_log(
            "custom_column.delete",
            serde_json::json!({ "id": id }),
            None,
        )
        .await;
    Ok(StatusCode::NO_CONTENT)
}
