use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{data_row::AppState, error::db_err};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomColumn {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub expression: Option<String>,
    pub position_before: Option<String>,
    pub position_after: Option<String>,
    pub read_only: bool,
    pub types: Vec<String>,
    pub source_path: Option<Vec<String>>,
    pub data_types: Vec<String>,
    pub is_group: bool,
    pub parent_ids: Vec<String>,
    pub is_frozen: bool,
}

/// Full mutable spec for a custom column. Used both in the store trait and as the HTTP wire type.
#[derive(Debug, Clone, Deserialize)]
pub struct CustomColumnInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub expression: Option<String>,
    pub position_before: Option<String>,
    pub position_after: Option<String>,
    /// Prevents the column from being edited by users. Builtin columns set this to true.
    #[serde(default)]
    pub read_only: bool,
    #[serde(default)]
    pub is_group: bool,
    #[serde(default)]
    pub parent_ids: Vec<String>,
    pub source_path: Option<Vec<String>>,
    /// Column display/filter type (e.g. "text", "numeric", "boolean", "array", "timestamptz").
    /// Defaults to ["text"].
    pub types: Option<Vec<String>>,
    /// Underlying data type for queries. Defaults to same as `types`.
    pub data_types: Option<Vec<String>>,
}

impl Default for CustomColumnInput {
    fn default() -> Self {
        Self {
            title: None,
            description: None,
            expression: None,
            position_before: None,
            position_after: None,
            read_only: false,
            is_group: false,
            parent_ids: vec![],
            source_path: None,
            types: None,
            data_types: None,
        }
    }
}

impl CustomColumnInput {
    pub fn effective_types(&self) -> Vec<String> {
        self.types
            .clone()
            .unwrap_or_else(|| vec!["text".to_string()])
    }
    pub fn effective_data_types(&self) -> Vec<String> {
        self.data_types
            .clone()
            .unwrap_or_else(|| self.effective_types())
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateCustomColumn {
    pub id: Option<String>,
    #[serde(flatten)]
    pub input: CustomColumnInput,
}

#[derive(Debug, Deserialize)]
pub struct PatchTableColumn {
    pub is_frozen: Option<bool>,
    /// `None` = no change; `Some([])` = clear; `Some([a, b])` = set nested path.
    pub source_path: Option<Vec<String>>,
}

pub async fn list(_state: axum::extract::State<AppState>) -> (StatusCode, String) {
    // Legacy route — callers must migrate to /tables/:table_id/custom-columns.
    (
        StatusCode::BAD_REQUEST,
        "Use /tables/:table_id/custom-columns — table_id is required".to_string(),
    )
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
    _state: axum::extract::State<AppState>,
    _body: Json<CreateCustomColumn>,
) -> (StatusCode, String) {
    // Legacy route — callers must migrate to /tables/:table_id/custom-columns.
    (
        StatusCode::BAD_REQUEST,
        "Use /tables/:table_id/custom-columns — table_id is required".to_string(),
    )
}

pub async fn create_for_table(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
    Json(body): Json<CreateCustomColumn>,
) -> Result<(StatusCode, Json<CustomColumn>), (StatusCode, String)> {
    let id = body
        .id
        .filter(|s| !s.is_empty())
        .map(|s| s.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_"))
        .unwrap_or_default();
    if id.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "missing column id".to_string()));
    }

    let col = state
        .store
        .upsert_custom_column(&table_id, &id, &body.input)
        .await
        .map_err(|e| db_err("custom_column", e))?;

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
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input_defaults() -> CustomColumnInput {
        CustomColumnInput::default()
    }

    // ── effective_types ───────────────────────────────────────────────────────

    #[test]
    fn effective_types_defaults_to_text() {
        assert_eq!(input_defaults().effective_types(), vec!["text"]);
    }

    #[test]
    fn effective_types_uses_provided_value() {
        let input = CustomColumnInput {
            types: Some(vec!["numeric".into()]),
            ..input_defaults()
        };
        assert_eq!(input.effective_types(), vec!["numeric"]);
    }

    #[test]
    fn effective_types_multiple() {
        let input = CustomColumnInput {
            types: Some(vec!["boolean".into(), "text".into()]),
            ..input_defaults()
        };
        assert_eq!(input.effective_types(), vec!["boolean", "text"]);
    }

    // ── effective_data_types ──────────────────────────────────────────────────

    #[test]
    fn effective_data_types_falls_back_to_types() {
        let input = CustomColumnInput {
            types: Some(vec!["numeric".into()]),
            ..input_defaults()
        };
        assert_eq!(input.effective_data_types(), vec!["numeric"]);
    }

    #[test]
    fn effective_data_types_defaults_to_text_when_both_unset() {
        assert_eq!(input_defaults().effective_data_types(), vec!["text"]);
    }

    #[test]
    fn effective_data_types_uses_own_value() {
        let input = CustomColumnInput {
            types: Some(vec!["timestamptz".into()]),
            data_types: Some(vec!["text".into()]),
            ..input_defaults()
        };
        assert_eq!(input.effective_types(), vec!["timestamptz"]);
        assert_eq!(input.effective_data_types(), vec!["text"]);
    }

    // ── Default ───────────────────────────────────────────────────────────────

    #[test]
    fn default_is_non_group_text_column() {
        let d = input_defaults();
        assert!(!d.is_group);
        assert!(d.parent_ids.is_empty());
        assert!(d.source_path.is_none());
        assert!(d.types.is_none()); // None → "text" via effective_types()
        assert!(d.data_types.is_none());
    }
}

pub async fn patch_for_table(
    State(state): State<AppState>,
    Path((table_id, column_id)): Path<(String, String)>,
    Json(body): Json<PatchTableColumn>,
) -> Result<Json<CustomColumn>, (StatusCode, String)> {
    if body.is_frozen.is_none() && body.source_path.is_none() {
        return Err((StatusCode::BAD_REQUEST, "nothing to patch".to_string()));
    }
    let mut col = None;
    if let Some(is_frozen) = body.is_frozen {
        col = Some(
            state
                .store
                .set_table_column_frozen(&table_id, &column_id, is_frozen)
                .await
                .map_err(|e| db_err("custom_column.patch_for_table", e))?,
        );
    }
    if let Some(path) = body.source_path {
        let effective = if path.is_empty() {
            None
        } else {
            Some(path.as_slice())
        };
        col = Some(
            state
                .store
                .set_column_source_path(&column_id, effective)
                .await
                .map_err(|e| db_err("custom_column.patch_for_table", e))?,
        );
    }
    Ok(Json(col.unwrap()))
}
