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
    pub is_frozen: bool,
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

#[derive(Debug, Deserialize)]
pub struct PatchTableColumn {
    pub is_frozen: Option<bool>,
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<CustomColumn>>, (StatusCode, String)> {
    list_for_table(State(state), Path("gh_repos".to_string())).await
}

pub async fn list_for_table(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
) -> Result<Json<Vec<CustomColumn>>, (StatusCode, String)> {
    state
        .store
        .list_custom_columns(&table_id)
        .await
        .map(Json)
        .map_err(|e| db_err("custom_column", e))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateCustomColumn>,
) -> Result<(StatusCode, Json<CustomColumn>), (StatusCode, String)> {
    create_for_table(State(state), Path("gh_repos".to_string()), Json(body)).await
}

pub async fn create_for_table(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
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
            &table_id,
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
                "id": col.id, "table_id": table_id, "name": col.name,
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

pub async fn patch_for_table(
    State(state): State<AppState>,
    Path((table_id, column_id)): Path<(String, String)>,
    Json(body): Json<PatchTableColumn>,
) -> Result<Json<CustomColumn>, (StatusCode, String)> {
    let is_frozen = body
        .is_frozen
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "missing is_frozen".to_string()))?;
    state
        .store
        .set_table_column_frozen(&table_id, &column_id, is_frozen)
        .await
        .map(Json)
        .map_err(|e| db_err("custom_column.patch_for_table", e))
}
