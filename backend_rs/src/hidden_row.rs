use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{error::db_err, data_row::AppState};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct HiddenRow {
    pub id: String,
    pub row_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AddHiddenRow {
    pub id: String,
    pub row_id: String,
}

pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<HiddenRow>>, (StatusCode, String)> {
    state
        .store
        .list_hidden_rows()
        .await
        .map(Json)
        .map_err(|e| db_err("hidden_row", e))
}

pub async fn add(
    State(state): State<AppState>,
    Json(body): Json<AddHiddenRow>,
) -> Result<(StatusCode, Json<HiddenRow>), (StatusCode, String)> {
    let row = state
        .store
        .add_hidden_row(&body.id, &body.row_id)
        .await
        .map_err(|e| db_err("hidden_row", e))?;
    state
        .store
        .append_ops_log(
            "hidden_row.add",
            serde_json::json!({
                "id": row.id, "row_id": row.row_id,
            }),
            None,
        )
        .await;
    Ok((StatusCode::CREATED, Json(row)))
}

pub async fn remove(
    State(state): State<AppState>,
    Path(row_id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state
        .store
        .remove_hidden_row(&row_id)
        .await
        .map_err(|e| db_err("hidden_row", e))?;
    state
        .store
        .append_ops_log(
            "hidden_row.remove",
            serde_json::json!({
                "row_id": row_id,
            }),
            None,
        )
        .await;
    Ok(StatusCode::NO_CONTENT)
}
