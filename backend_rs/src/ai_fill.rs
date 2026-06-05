use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{data_row::AppState, error::db_err, types::RowQuery};

// ── Request / response types ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AiFillRequest {
    /// Columns whose values are sent to the AI as context.
    pub source_column_ids: Vec<String>,
    /// Columns the AI should write values into.
    pub target_column_ids: Vec<String>,
    /// Extra instructions appended to the system prompt.
    #[serde(default)]
    pub instructions: Option<String>,
    /// Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. Ignored for Ollama.
    #[serde(default)]
    pub api_key: Option<String>,
    /// Claude model identifier. Defaults to claude-haiku-4-5-20251001. Ignored for Ollama.
    #[serde(default)]
    pub model: Option<String>,
    /// When set, use a local Ollama instance instead of Claude. Value is the model name (e.g. "llama3.2").
    #[serde(default)]
    pub ollama_model: Option<String>,
    /// When true (default) skip rows that already have all target columns filled.
    #[serde(default = "default_true")]
    pub only_empty: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize)]
pub struct AiFillResult {
    pub rows_processed: usize,
    pub cells_filled: usize,
    pub errors: Vec<String>,
}

// ── Provider abstraction ──────────────────────────────────────────────────────

enum Provider {
    Claude { api_key: String, model: String },
    Ollama { base_url: String, model: String },
}

// ── Claude wire types ─────────────────────────────────────────────────────────

#[derive(Serialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<ChatMessage>,
}

#[derive(Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContent>,
}

#[derive(Deserialize)]
struct ClaudeContent {
    text: String,
}

// ── OpenAI-compatible wire types (used by Ollama) ─────────────────────────────

#[derive(Serialize, Clone)]
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

// ── Shared completion helper ──────────────────────────────────────────────────

async fn complete(
    http: &reqwest::Client,
    provider: &Provider,
    system: &str,
    user: &str,
) -> anyhow::Result<String> {
    match provider {
        Provider::Claude { api_key, model } => {
            let req = ClaudeRequest {
                model: model.clone(),
                max_tokens: 1024,
                system: system.to_string(),
                messages: vec![ChatMessage { role: "user".into(), content: user.to_string() }],
            };
            let resp = http
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&req)
                .send()
                .await?;
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                anyhow::bail!("Claude API error {status}: {body}");
            }
            let parsed: ClaudeResponse = resp.json().await?;
            parsed
                .content
                .into_iter()
                .next()
                .map(|c| c.text)
                .ok_or_else(|| anyhow::anyhow!("empty Claude response"))
        }

        Provider::Ollama { base_url, model } => {
            let req = OllamaChatRequest {
                model: model.clone(),
                stream: false,
                messages: vec![
                    ChatMessage { role: "system".into(), content: system.to_string() },
                    ChatMessage { role: "user".into(),   content: user.to_string() },
                ],
            };
            let url = format!("{base_url}/v1/chat/completions");
            let resp = http.post(&url).json(&req).send().await?;
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                anyhow::bail!("Ollama API error {status}: {body}");
            }
            let parsed: OllamaChatResponse = resp.json().await?;
            parsed
                .choices
                .into_iter()
                .next()
                .map(|c| c.message.content)
                .ok_or_else(|| anyhow::anyhow!("empty Ollama response"))
        }
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

pub async fn handler(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
    Json(body): Json<AiFillRequest>,
) -> Result<Json<AiFillResult>, (StatusCode, String)> {
    if body.source_column_ids.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "source_column_ids cannot be empty".into()));
    }
    if body.target_column_ids.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "target_column_ids cannot be empty".into()));
    }

    // Resolve provider.
    let provider = if let Some(ollama_model) = body.ollama_model.filter(|s| !s.is_empty()) {
        let base_url = std::env::var("OLLAMA_URL")
            .unwrap_or_else(|_| "http://localhost:11434".to_string());
        Provider::Ollama { base_url, model: ollama_model }
    } else {
        let api_key = body
            .api_key
            .filter(|k| !k.is_empty())
            .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
            .ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    "api_key not provided and ANTHROPIC_API_KEY env var not set".into(),
                )
            })?;
        let model = body
            .model
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| "claude-haiku-4-5-20251001".to_string());
        Provider::Claude { api_key, model }
    };

    // Fetch all column metadata to resolve human-readable titles.
    let all_columns = state
        .store
        .list_custom_columns(&table_id)
        .await
        .map_err(|e| db_err("ai_fill:list_columns", e))?;

    let column_titles: std::collections::HashMap<String, String> = all_columns
        .iter()
        .map(|c| {
            let title = c.title.clone().unwrap_or_else(|| c.id.clone());
            (c.id.clone(), title)
        })
        .collect();

    // Fetch all rows (up to 10 000 — sufficient for a comparison table).
    let params = RowQuery { page: 1, per_page: 10_000, ..Default::default() };
    let page = state
        .store
        .list_data_rows(&table_id, &params)
        .await
        .map_err(|e| db_err("ai_fill:list_rows", e))?;

    let rows = page.data;

    // Build system prompt once — reused for every row.
    let target_col_descriptions: Vec<String> = body
        .target_column_ids
        .iter()
        .map(|id| {
            let title = column_titles.get(id).cloned().unwrap_or_else(|| id.clone());
            format!("  - \"{id}\": {title}")
        })
        .collect();

    let extra_instructions = body
        .instructions
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| format!("\n\nAdditional instructions: {s}"))
        .unwrap_or_default();

    let system_prompt = format!(
        "You are an AI assistant filling in missing data in a comparison table. \
        You will receive values from some columns of a single row and must return \
        values for the specified target columns.\n\
        \n\
        Respond ONLY with a valid JSON object (no markdown fences, no explanation). \
        Keys must be the exact column IDs listed below. Use null for any column you \
        cannot confidently fill.\n\
        \n\
        Target columns to fill:\n{}{extra_instructions}",
        target_col_descriptions.join("\n"),
    );

    let http_client = reqwest::Client::new();
    let mut rows_processed = 0usize;
    let mut cells_filled = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for row in &rows {
        let row_id = match row.get("id").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => { errors.push("row missing id field — skipped".into()); continue; }
        };

        let custom_vals = row.get("custom_vals").and_then(|v| v.as_object());

        let resolve_val = |col_id: &str| -> serde_json::Value {
            custom_vals
                .and_then(|obj| obj.get(col_id))
                .or_else(|| row.get(col_id))
                .cloned()
                .unwrap_or(serde_json::Value::Null)
        };

        // Skip rows where all target columns are already filled (when only_empty=true).
        if body.only_empty {
            let all_filled = body.target_column_ids.iter().all(|col_id| {
                let val = resolve_val(col_id);
                !val.is_null() && val.as_str().map(|s| !s.is_empty()).unwrap_or(true)
            });
            if all_filled { continue; }
        }

        let source_lines: Vec<String> = body
            .source_column_ids
            .iter()
            .map(|col_id| {
                let title = column_titles.get(col_id).cloned().unwrap_or_else(|| col_id.clone());
                let val = resolve_val(col_id);
                format!("  {title}: {val}")
            })
            .collect();

        let user_message = format!(
            "Source data for this row:\n{}\n\nFill in the target columns.",
            source_lines.join("\n")
        );

        let text = match complete(&http_client, &provider, &system_prompt, &user_message).await {
            Ok(t) => t,
            Err(e) => { errors.push(format!("row {row_id}: {e}")); continue; }
        };

        // Strip markdown code fences the model sometimes wraps JSON in.
        let json_text = text
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();

        let filled: serde_json::Map<String, serde_json::Value> =
            match serde_json::from_str(json_text) {
                Ok(m) => m,
                Err(e) => {
                    errors.push(format!(
                        "row {row_id}: could not parse AI output as JSON: {e}\nOutput: {text}"
                    ));
                    continue;
                }
            };

        rows_processed += 1;

        for col_id in &body.target_column_ids {
            if let Some(value) = filled.get(col_id) {
                if value.is_null() { continue; }
                match state
                    .store
                    .patch_row_value(&table_id, &row_id, col_id, value.clone())
                    .await
                {
                    Ok(_) => cells_filled += 1,
                    Err(e) => errors.push(format!(
                        "row {row_id}, col {col_id}: patch_row_value failed: {e}"
                    )),
                }
            }
        }
    }

    tracing::info!(
        %table_id,
        rows_processed,
        cells_filled,
        errors = errors.len(),
        "ai_fill completed"
    );

    Ok(Json(AiFillResult { rows_processed, cells_filled, errors }))
}
