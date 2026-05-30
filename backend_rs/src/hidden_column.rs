use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{error::db_err, data_row::AppState};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct HiddenColumn {
    pub id: String,
    pub column_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AddHiddenColumn {
    pub id: String,
    pub column_id: String,
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<HiddenColumn>>, (StatusCode, String)> {
    state
        .store
        .list_hidden_columns()
        .await
        .map(Json)
        .map_err(|e| db_err("hidden_column", e))
}

pub async fn add(
    State(state): State<AppState>,
    Json(body): Json<AddHiddenColumn>,
) -> Result<(StatusCode, Json<HiddenColumn>), (StatusCode, String)> {
    let col = state
        .store
        .add_hidden_column(&body.id, &body.column_id)
        .await
        .map_err(|e| db_err("hidden_column", e))?;
    state
        .store
        .append_ops_log(
            "hidden_column.add",
            serde_json::json!({
                "id": col.id, "column_id": col.column_id,
            }),
            None,
        )
        .await
        .map_err(|e| db_err("hidden_column", e))?;
    Ok((StatusCode::CREATED, Json(col)))
}

pub async fn remove(
    State(state): State<AppState>,
    Path(column_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .store
        .remove_hidden_column(&column_id)
        .await
        .map_err(|e| db_err("hidden_column", e))?;
    state
        .store
        .append_ops_log(
            "hidden_column.remove",
            serde_json::json!({
                "column_id": column_id,
            }),
            None,
        )
        .await;
    Ok(StatusCode::NO_CONTENT)
}
