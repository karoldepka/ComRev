use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{data_row::AppState, error::db_err};

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct RowClass {
    pub id: String,
    pub table_id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRowClass {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetRowClasses {
    pub class_ids: Vec<String>,
}

pub async fn list_for_table(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
) -> Result<Json<Vec<RowClass>>, (StatusCode, String)> {
    state
        .store
        .list_row_classes(&table_id)
        .await
        .map(Json)
        .map_err(|e| db_err("row_class", e))
}

pub async fn create_for_table(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
    Json(body): Json<CreateRowClass>,
) -> Result<(StatusCode, Json<RowClass>), (StatusCode, String)> {
    let class = state
        .store
        .create_row_class(&table_id, &body.id, &body.name, body.color.as_deref())
        .await
        .map_err(|e| db_err("row_class", e))?;
    Ok((StatusCode::CREATED, Json(class)))
}

pub async fn delete_for_table(
    State(state): State<AppState>,
    Path((table_id, class_id)): Path<(String, String)>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .store
        .delete_row_class(&table_id, &class_id)
        .await
        .map_err(|e| db_err("row_class", e))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_row_classes(
    State(state): State<AppState>,
    Path((table_id, row_id)): Path<(String, String)>,
) -> Result<Json<Vec<RowClass>>, (StatusCode, String)> {
    state
        .store
        .get_row_class_assignments(&table_id, &row_id)
        .await
        .map(Json)
        .map_err(|e| db_err("row_class", e))
}

pub async fn set_row_classes(
    State(state): State<AppState>,
    Path((table_id, row_id)): Path<(String, String)>,
    Json(body): Json<SetRowClasses>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .store
        .set_many_to_many_assignments(&table_id, &row_id, "classes", &body.class_ids)
        .await
        .map_err(|e| db_err("row_class", e))?;
    Ok(StatusCode::NO_CONTENT)
}
