use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nanoid::nanoid;
use serde::{Deserialize, Serialize};

use crate::{data_row::AppState, error::db_err, types::RowQuery};

// ── Request / response types ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AiFillClassesRequest {
    /// Local Ollama model name (e.g. "llama3.2"). Required.
    pub ollama_model: String,
    /// Row fields to send as context. Defaults to a sensible set when empty.
    #[serde(default)]
    pub source_field_ids: Vec<String>,
    /// When true (default) skip rows that already have classes assigned.
    #[serde(default = "default_true")]
    pub only_empty: bool,
    /// When true (default) allow the LLM to suggest new class names to create.
    #[serde(default = "default_true")]
    pub create_new_classes: bool,
    /// Extra instructions appended to the system prompt.
    #[serde(default)]
    pub instructions: Option<String>,
    /// Override Ollama base URL. Defaults to OLLAMA_URL env var or http://localhost:11434.
    #[serde(default)]
    pub ollama_base_url: Option<String>,
    /// Sort string in `col:dir[:type]` format, matching the table's current view order.
    #[serde(default)]
    pub sort: Option<String>,
    /// Perform a Brave Search web query per row to enrich LLM context.
    #[serde(default)]
    pub enable_web_search: bool,
    /// Brave Search API key. Falls back to BRAVE_SEARCH_API_KEY env var when absent.
    #[serde(default)]
    pub brave_api_key: Option<String>,
    /// Number of web search results to include per row (default 3).
    #[serde(default)]
    pub web_search_result_count: Option<usize>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize)]
pub struct AiFillClassesResult {
    pub rows_processed: usize,
    pub classes_assigned: usize,
    pub classes_created: usize,
    pub errors: Vec<String>,
}

// ── Ollama wire types ─────────────────────────────────────────────────────────

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    choices: Vec<OllamaChoice>,
}

#[derive(Deserialize)]
struct OllamaChoice {
    message: OllamaMessage,
}

#[derive(Deserialize)]
struct OllamaMessage {
    content: String,
}

// ── LLM response shape ────────────────────────────────────────────────────────

/// Lenient deserializer: accepts both a JSON array and a stringified array like "[a,b,c]".
fn deserialize_string_or_vec<'de, D>(de: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::Deserialize as _;
    let value = serde_json::Value::deserialize(de)?;
    match value {
        serde_json::Value::Array(arr) => Ok(arr
            .into_iter()
            .filter_map(|v| match v {
                serde_json::Value::String(s) => Some(s),
                serde_json::Value::Number(n) => Some(n.to_string()),
                _ => None,
            })
            .collect()),
        serde_json::Value::String(s) => {
            let inner = s.trim().trim_start_matches('[').trim_end_matches(']');
            if inner.is_empty() {
                return Ok(vec![]);
            }
            // Try to parse as proper JSON array first, then fall back to comma-split.
            if let Ok(serde_json::Value::Array(arr)) = serde_json::from_str(&format!("[{inner}]")) {
                return Ok(arr
                    .into_iter()
                    .filter_map(|v| v.as_str().map(str::to_owned))
                    .collect());
            }
            Ok(inner.split(',').map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()).collect())
        }
        serde_json::Value::Null => Ok(vec![]),
        _ => Ok(vec![]),
    }
}

#[derive(Deserialize, Default)]
pub struct ClassAssignment {
    /// IDs of existing classes to assign.
    #[serde(default, deserialize_with = "deserialize_string_or_vec")]
    pub assign_existing: Vec<String>,
    /// Human-readable names of new classes to create.
    #[serde(default, deserialize_with = "deserialize_string_or_vec")]
    pub create_new: Vec<String>,
}

// ── Ollama completion ─────────────────────────────────────────────────────────

pub async fn ollama_complete(
    http: &reqwest::Client,
    base_url: &str,
    model: &str,
    system: &str,
    user: &str,
) -> anyhow::Result<String> {
    let req = OllamaChatRequest {
        model: model.to_string(),
        stream: false,
        messages: vec![
            ChatMessage {
                role: "system".into(),
                content: system.to_string(),
            },
            ChatMessage {
                role: "user".into(),
                content: user.to_string(),
            },
        ],
    };
    let url = format!("{base_url}/v1/chat/completions");
    let resp = http.post(&url).json(&req).send().await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Ollama error {status}: {body}");
    }
    let parsed: OllamaChatResponse = resp.json().await?;
    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| anyhow::anyhow!("empty Ollama response"))
}

// ── Web search ────────────────────────────────────────────────────────────────

pub struct WebSearchResult {
    pub title: String,
    pub description: String,
    pub url: String,
}

/// Query Brave Search and return up to `count` results.
/// API docs: https://api.search.brave.com/app/documentation/web-search/get-started
pub async fn brave_search(
    http: &reqwest::Client,
    query: &str,
    api_key: &str,
    count: usize,
) -> anyhow::Result<Vec<WebSearchResult>> {
    let resp = http
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("Accept", "application/json")
        .header("X-Subscription-Token", api_key)
        .query(&[("q", query), ("count", &count.to_string())])
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Brave Search error {status}: {body}");
    }

    let json: serde_json::Value = resp.json().await?;
    let results = json["web"]["results"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(count)
        .filter_map(|r| {
            Some(WebSearchResult {
                title: r["title"].as_str()?.to_string(),
                description: r["description"].as_str().unwrap_or("").to_string(),
                url: r["url"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect();
    Ok(results)
}

// ── Handler ───────────────────────────────────────────────────────────────────

/// Default source fields sent to the LLM when `source_field_ids` is not specified.
pub const DEFAULT_SOURCE_FIELDS: &[&str] = &[
    "full_name",
    "description",
    "url",
    "topics",
    "readme",
    "language",
    "owner_login",
];

pub async fn handler(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
    Json(body): Json<AiFillClassesRequest>,
) -> Result<Json<AiFillClassesResult>, (StatusCode, String)> {
    if body.ollama_model.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "ollama_model is required".into()));
    }

    let base_url = body
        .ollama_base_url
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("OLLAMA_URL").ok())
        .unwrap_or_else(|| "http://localhost:11434".to_string());

    let source_fields: Vec<String> = if body.source_field_ids.is_empty() {
        DEFAULT_SOURCE_FIELDS.iter().map(|s| s.to_string()).collect()
    } else {
        body.source_field_ids.clone()
    };

    // Class definitions live in the shared "classes" table (t_classes), not per-table.
    let mut all_classes = state
        .store
        .list_row_classes("classes")
        .await
        .map_err(|e| db_err("ai_fill_classes:list_classes", e))?;

    // Fetch all rows in the same order as the current view.
    let params = RowQuery {
        page: 1,
        per_page: 10_000,
        sort: body.sort.clone(),
        ..Default::default()
    };
    let page = state
        .store
        .list_data_rows(&table_id, &params)
        .await
        .map_err(|e| db_err("ai_fill_classes:list_rows", e))?;
    let rows = page.data;

    let extra_instructions = body
        .instructions
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| format!("\n\nAdditional instructions: {s}"))
        .unwrap_or_default();

    tracing::info!(
        %table_id,
        total_rows = rows.len(),
        existing_classes = all_classes.len(),
        model = %body.ollama_model,
        only_empty = body.only_empty,
        create_new = body.create_new_classes,
        "ai_fill_classes: starting"
    );

    let http_client = reqwest::Client::new();
    let mut rows_processed = 0usize;
    let mut classes_assigned = 0usize;
    let mut classes_created = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for row in &rows {
        let row_id = match row.get("id").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => {
                tracing::warn!(%table_id, "ai_fill_classes: row missing id — skipped");
                errors.push("row missing id field — skipped".into());
                continue;
            }
        };
        let row_name = row.get("full_name").and_then(|v| v.as_str()).unwrap_or(&row_id).to_string();

        // Skip rows that already have classes using the denormalized JSONB field (no extra DB round-trip).
        if body.only_empty {
            let already_has_classes = row.get("classes")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false);
            if already_has_classes {
                tracing::debug!(%table_id, %row_id, %row_name, "ai_fill_classes: row already has classes, skipping");
                continue;
            }
        }

        // Build row context from source fields.
        let custom_vals = row.get("custom_vals").and_then(|v| v.as_object());
        let resolve = |field: &str| -> Option<String> {
            let val = custom_vals
                .and_then(|obj| obj.get(field))
                .or_else(|| row.get(field))?;
            match val {
                serde_json::Value::Null => None,
                serde_json::Value::String(s) if s.is_empty() => None,
                other => Some(other.to_string()),
            }
        };

        let context_lines: Vec<String> = source_fields
            .iter()
            .filter_map(|f| resolve(f).map(|v| format!("  {f}: {v}")))
            .collect();

        if context_lines.is_empty() {
            tracing::debug!(%table_id, %row_id, %row_name, "ai_fill_classes: no context fields — skipping row");
            continue;
        }

        tracing::debug!(%table_id, %row_id, %row_name, fields = context_lines.len(), "ai_fill_classes: calling Ollama");

        // Build the system prompt, embedding the current class list.
        let class_list: Vec<String> = all_classes
            .iter()
            .map(|c| format!("  - id={} name=\"{}\"", c.id, c.name))
            .collect();

        let class_list_section = if class_list.is_empty() {
            "(no classes exist yet)".to_string()
        } else {
            class_list.join("\n")
        };

        let create_new_section = if body.create_new_classes {
            "\n- \"create_new\": array of human-readable names for NEW classes to create (only \
when none of the existing classes fit). Keep new class names short and general."
        } else {
            "\n- \"create_new\": always an empty array (do not create new classes)"
        };

        let system_prompt = format!(
            "You are an expert software project classifier. You will receive metadata about a \
software project (repository) and must assign it to one or more categories (\"classes\").\n\
\n\
Current available classes:\n{class_list_section}\n\
\n\
Respond ONLY with a valid JSON object (no markdown fences, no explanation) with these keys:\n\
- \"assign_existing\": array of class IDs from the list above that apply to this project.{create_new_section}\n\
\n\
Rules:\n\
- Prefer reusing existing classes over creating new ones.\n\
- Only assign classes that clearly apply.\n\
- If nothing fits and create_new is allowed, suggest at most 2 new class names.\
{extra_instructions}"
        );

        let user_message = format!(
            "Project metadata:\n{}\n\nClassify this project.",
            context_lines.join("\n")
        );

        let text = match ollama_complete(
            &http_client,
            &base_url,
            &body.ollama_model,
            &system_prompt,
            &user_message,
        )
        .await
        {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!(%table_id, %row_id, %row_name, error = %e, "ai_fill_classes: Ollama error");
                errors.push(format!("row {row_id}: LLM error: {e}"));
                continue;
            }
        };

        // Strip markdown fences.
        let json_text = text
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();

        let assignment: ClassAssignment = match serde_json::from_str(json_text) {
            Ok(a) => a,
            Err(e) => {
                tracing::warn!(%table_id, %row_id, %row_name, output = %text, "ai_fill_classes: JSON parse error: {e}");
                errors.push(format!(
                    "row {row_id}: could not parse LLM output as JSON: {e}\nOutput: {text}"
                ));
                continue;
            }
        };

        // Create any new classes the LLM suggested.
        let mut ids_to_assign = assignment.assign_existing.clone();

        if body.create_new_classes {
            for new_name in &assignment.create_new {
                let name = new_name.trim();
                if name.is_empty() {
                    continue;
                }
                // Deduplicate: check if already exists (case-insensitive).
                if let Some(existing) = all_classes
                    .iter()
                    .find(|c| c.name.to_lowercase() == name.to_lowercase())
                {
                    ids_to_assign.push(existing.id.clone());
                    continue;
                }
                let new_id = nanoid!(10);
                match state
                    .store
                    .create_row_class("classes", &new_id, name, None)
                    .await
                {
                    Ok(created) => {
                        tracing::info!(%table_id, id = %new_id, %name, "ai_fill_classes: created new class");
                        ids_to_assign.push(created.id.clone());
                        all_classes.push(created);
                        classes_created += 1;
                    }
                    Err(e) => {
                        tracing::warn!(%table_id, %row_id, %row_name, %name, error = %e, "ai_fill_classes: create_row_class failed");
                        errors.push(format!(
                            "row {row_id}: create_row_class({name}): {e}"
                        ));
                    }
                }
            }
        }

        // Deduplicate IDs and filter to known IDs only.
        ids_to_assign.sort();
        ids_to_assign.dedup();
        let valid_ids: Vec<String> = ids_to_assign
            .into_iter()
            .filter(|id| all_classes.iter().any(|c| &c.id == id))
            .collect();

        if valid_ids.is_empty() {
            tracing::debug!(%table_id, %row_id, %row_name, "ai_fill_classes: no valid class IDs to assign");
            continue;
        }

        tracing::debug!(%table_id, %row_id, %row_name, count = valid_ids.len(), "ai_fill_classes: assigning classes");
        match state
            .store
            .add_many_to_many_assignments(&table_id, &row_id, "classes", &valid_ids)
            .await
        {
            Ok(_) => {
                classes_assigned += valid_ids.len();
                rows_processed += 1;
            },
            Err(e) => {
                tracing::warn!(%table_id, %row_id, %row_name, error = %e, "ai_fill_classes: add_many_to_many failed");
                errors.push(format!("row {row_id}: add_many_to_many: {e}"));
            }
        }
    }

    tracing::info!(
        %table_id,
        rows_processed,
        classes_assigned,
        classes_created,
        errors = errors.len(),
        "ai_fill_classes completed"
    );

    Ok(Json(AiFillClassesResult {
        rows_processed,
        classes_assigned,
        classes_created,
        errors,
    }))
}
