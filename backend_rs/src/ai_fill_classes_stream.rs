use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    Json,
};
use futures::StreamExt;
use nanoid::nanoid;
use serde::Serialize;
use std::convert::Infallible;
use tokio_stream::wrappers::ReceiverStream;

use crate::{ai_fill_classes::AiFillClassesRequest, data_row::AppState, error::db_err, types::RowQuery};

// ── SSE event payload ─────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SseEvent {
    /// Sent once at the start with the total number of rows to process.
    Start { total: usize },
    /// Sent after each row is finished (including skipped rows).
    Progress {
        completed: usize,
        total: usize,
        classes_assigned: usize,
        classes_created: usize,
        error_count: usize,
        /// Present for non-skipped rows (processed or errored).
        #[serde(skip_serializing_if = "Option::is_none")]
        row_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        row_name: Option<String>,
        had_error: bool,
    },
    /// Sent once when all rows have been processed.
    Done {
        rows_processed: usize,
        classes_assigned: usize,
        classes_created: usize,
        errors: Vec<String>,
    },
}

fn make_event(payload: &SseEvent) -> Result<Event, Infallible> {
    let json = serde_json::to_string(payload).unwrap_or_default();
    Ok(Event::default().data(json))
}

// ── Handler ───────────────────────────────────────────────────────────────────

/// Streaming (SSE) version of ai-fill-classes.
/// Emits progress events while processing rows so the client can show a live indicator.
pub async fn stream_handler(
    State(state): State<AppState>,
    Path(table_id): Path<String>,
    Json(body): Json<AiFillClassesRequest>,
) -> impl IntoResponse {
    if body.ollama_model.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "ollama_model is required").into_response();
    }

    let base_url = body
        .ollama_base_url
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .or_else(|| std::env::var("OLLAMA_URL").ok())
        .unwrap_or_else(|| "http://localhost:11434".to_string());

    let source_fields: Vec<String> = if body.source_field_ids.is_empty() {
        crate::ai_fill_classes::DEFAULT_SOURCE_FIELDS
            .iter()
            .map(|s| s.to_string())
            .collect()
    } else {
        body.source_field_ids.clone()
    };

    // Resolve Brave Search API key once (request body takes precedence over env var).
    let brave_api_key: Option<String> = body
        .brave_api_key
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .or_else(|| std::env::var("BRAVE_SEARCH_API_KEY").ok());

    // ── Fetch initial data (before spawning) ──────────────────────────────────

    // Class definitions live in the shared "classes" table (t_classes), not per-table.
    let all_classes_init = match state.store.list_row_classes("classes").await {
        Ok(c) => c,
        Err(e) => {
            let msg = db_err("ai_fill_classes_stream:list_classes", e);
            return (msg.0, msg.1).into_response();
        }
    };

    let params = RowQuery { page: 1, per_page: 10_000, sort: body.sort.clone(), ..Default::default() };
    let page = match state.store.list_data_rows(&table_id, &params).await {
        Ok(p) => p,
        Err(e) => {
            let msg = db_err("ai_fill_classes_stream:list_rows", e);
            return (msg.0, msg.1).into_response();
        }
    };
    let rows = page.data;
    let total = rows.len();

    tracing::info!(%table_id, total, model = %body.ollama_model, web_search = body.enable_web_search, "ai_fill_classes_stream: starting");

    // ── Spawn background worker ───────────────────────────────────────────────

    let (tx, rx) = tokio::sync::mpsc::channel::<SseEvent>(64);

    {
        let tx = tx.clone();
        let _ = tx.send(SseEvent::Start { total }).await;
    }

    tokio::spawn(async move {
        let mut all_classes = all_classes_init;
        let extra_instructions = body
            .instructions
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(|s| format!("\n\nAdditional instructions: {s}"))
            .unwrap_or_default();

        let http_client = reqwest::Client::new();
        let search_result_count = body.web_search_result_count.unwrap_or(3).min(10);
        let mut rows_processed = 0usize;
        let mut classes_assigned_total = 0usize;
        let mut classes_created_total = 0usize;
        let mut errors: Vec<String> = Vec::new();
        let mut completed = 0usize;

        macro_rules! send_progress {
            (skip) => {
                let _ = tx.send(SseEvent::Progress {
                    completed, total,
                    classes_assigned: classes_assigned_total,
                    classes_created: classes_created_total,
                    error_count: errors.len(),
                    row_id: None, row_name: None, had_error: false,
                }).await;
            };
            ($rid:expr, $rname:expr, $err:expr) => {
                let _ = tx.send(SseEvent::Progress {
                    completed, total,
                    classes_assigned: classes_assigned_total,
                    classes_created: classes_created_total,
                    error_count: errors.len(),
                    row_id: Some($rid), row_name: Some($rname), had_error: $err,
                }).await;
            };
        }

        for row in &rows {
            let row_id = match row.get("id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => {
                    errors.push("row missing id field — skipped".into());
                    completed += 1;
                    send_progress!(skip);
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
                    completed += 1;
                    send_progress!(skip);
                    continue;
                }
            }

            // Build row context.
            let custom_vals = row.get("custom_vals").and_then(|v| v.as_object());
            let resolve = |field: &str| -> Option<String> {
                let val = custom_vals.and_then(|obj| obj.get(field)).or_else(|| row.get(field))?;
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
                completed += 1;
                send_progress!(skip);
                continue;
            }

            // ── Optional web search enrichment ────────────────────────────────

            let search_snippet: Option<String> = if body.enable_web_search {
                match &brave_api_key {
                    Some(key) => {
                        // Build a query from the row name; append "github" for repo context.
                        let query = row.get("full_name")
                            .and_then(|v| v.as_str())
                            .filter(|s| !s.is_empty())
                            .map(|n| format!("{n} github"))
                            .unwrap_or_else(|| row_name.clone());

                        tracing::debug!(%table_id, %row_id, %row_name, %query, "ai_fill_classes_stream: web search");
                        match crate::ai_fill_classes::brave_search(&http_client, &query, key, search_result_count).await {
                            Ok(results) if !results.is_empty() => {
                                let items: Vec<String> = results.iter()
                                    .map(|r| format!("  - {} — {}", r.title, r.description))
                                    .collect();
                                Some(format!("\n\nWeb search results for \"{}\":\n{}", query, items.join("\n")))
                            }
                            Ok(_) => None,
                            Err(e) => {
                                tracing::warn!(%table_id, %row_id, %row_name, error = %e, "ai_fill_classes_stream: web search failed (non-fatal)");
                                None
                            }
                        }
                    }
                    None => {
                        tracing::warn!(%table_id, "ai_fill_classes_stream: web search enabled but no Brave API key — set BRAVE_SEARCH_API_KEY env var or pass brave_api_key");
                        None
                    }
                }
            } else {
                None
            };

            // Build system prompt.
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
                "\n- \"create_new\": array of human-readable names for NEW classes to create (only when none of the existing classes fit). Keep new class names short and general."
            } else {
                "\n- \"create_new\": always an empty array"
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
                "Project metadata:\n{}{}",
                context_lines.join("\n"),
                search_snippet.as_deref().unwrap_or(""),
            );

            tracing::debug!(%table_id, %row_id, %row_name, "ai_fill_classes_stream: calling Ollama");

            let mut row_had_error = false;

            let text = match crate::ai_fill_classes::ollama_complete(
                &http_client, &base_url, &body.ollama_model, &system_prompt, &user_message,
            ).await {
                Ok(t) => t,
                Err(e) => {
                    tracing::warn!(%table_id, %row_id, %row_name, error = %e, "ai_fill_classes_stream: Ollama error");
                    errors.push(format!("row {row_name}: LLM error: {e}"));
                    completed += 1;
                    send_progress!(row_id, row_name, true);
                    continue;
                }
            };

            // Strip markdown fences.
            let json_text = text.trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim();

            let assignment: crate::ai_fill_classes::ClassAssignment =
                match serde_json::from_str(json_text) {
                    Ok(a) => a,
                    Err(e) => {
                        tracing::warn!(%table_id, %row_id, %row_name, output = %text, "ai_fill_classes_stream: JSON parse error: {e}");
                        errors.push(format!("row {row_name}: JSON parse: {e}\nOutput: {text}"));
                        completed += 1;
                        send_progress!(row_id, row_name, true);
                        continue;
                    }
                };

            rows_processed += 1;
            let mut ids_to_assign = assignment.assign_existing.clone();
            let mut row_created = 0usize;

            if body.create_new_classes {
                for new_name in &assignment.create_new {
                    let name = new_name.trim();
                    if name.is_empty() { continue; }
                    if let Some(existing) = all_classes.iter().find(|c| c.name.to_lowercase() == name.to_lowercase()) {
                        ids_to_assign.push(existing.id.clone());
                        continue;
                    }
                    let new_id = nanoid!(10);
                    // Class definitions live in the shared "classes" table (t_classes), not per-table.
                    match state.store.create_row_class("classes", &new_id, name, None).await {
                        Ok(created) => {
                            tracing::info!(%table_id, %row_id, %row_name, id = %new_id, %name, "ai_fill_classes_stream: created new class");
                            ids_to_assign.push(created.id.clone());
                            all_classes.push(created);
                            classes_created_total += 1;
                            row_created += 1;
                        }
                        Err(e) => {
                            errors.push(format!("row {row_name}: create_row_class({name}): {e}"));
                            row_had_error = true;
                        }
                    }
                }
            }

            ids_to_assign.sort();
            ids_to_assign.dedup();
            let valid_ids: Vec<String> = ids_to_assign
                .into_iter()
                .filter(|id| all_classes.iter().any(|c| &c.id == id))
                .collect();

            let row_assigned = valid_ids.len();
            if !valid_ids.is_empty() {
                match state.store.add_many_to_many_assignments(&table_id, &row_id, "classes", &valid_ids).await {
                    Ok(_) => {
                        classes_assigned_total += row_assigned;
                        tracing::debug!(%table_id, %row_id, %row_name, assigned = row_assigned, created = row_created, "ai_fill_classes_stream: row done");
                    }
                    Err(e) => {
                        errors.push(format!("row {row_name}: add_many_to_many: {e}"));
                        row_had_error = true;
                    }
                }
            }

            completed += 1;
            if tx.send(SseEvent::Progress {
                completed, total,
                classes_assigned: classes_assigned_total,
                classes_created: classes_created_total,
                error_count: errors.len(),
                row_id: Some(row_id.clone()),
                row_name: Some(row_name.clone()),
                had_error: row_had_error,
            }).await.is_err() {
                tracing::info!(%table_id, %row_id, %row_name, "ai_fill_classes_stream: client disconnected, aborting");
                return;
            }
        }

        tracing::info!(%table_id, rows_processed, classes_assigned = classes_assigned_total, classes_created = classes_created_total, errors = errors.len(), "ai_fill_classes_stream: done");

        let _ = tx.send(SseEvent::Done {
            rows_processed,
            classes_assigned: classes_assigned_total,
            classes_created: classes_created_total,
            errors,
        }).await;
    });

    let stream = ReceiverStream::new(rx).map(|event| make_event(&event));
    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}
