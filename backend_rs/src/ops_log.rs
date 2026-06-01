use std::sync::Arc;
use serde_json::Value;
use crate::store::{DataStore, PendingOp};

/// Insert a pending ops log entry (applied_at = NULL). Idempotent: ON CONFLICT DO NOTHING.
pub async fn begin(pool: &sqlx::PgPool, id: &str, op: &str, payload: Value, tx_id: Option<&str>) {
    let result = sqlx::query(
        "INSERT INTO operations_log (id, op, payload, tx_id, applied_at)
         VALUES ($1, $2, $3, $4, NULL)
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(id)
    .bind(op)
    .bind(payload)
    .bind(tx_id)
    .execute(pool)
    .await;

    if let Err(e) = result {
        tracing::warn!("ops_log begin failed for op={op} id={id}: {e}");
    }
}

/// Return all ops log entries with applied_at IS NULL.
pub async fn pending(pool: &sqlx::PgPool) -> anyhow::Result<Vec<PendingOp>> {
    let rows = sqlx::query_as::<_, (String, String, serde_json::Value, Option<String>)>(
        "SELECT id, op, payload, tx_id FROM operations_log WHERE applied_at IS NULL ORDER BY id",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, op, payload, tx_id)| PendingOp { id, op, payload, tx_id })
        .collect())
}

/// On startup: replay any ops that have applied_at = NULL (i.e. logged before a previous crash).
/// All store write methods are idempotent so replaying is always safe.
/// Blocks until all pending ops are replayed; the server must not serve reads until this returns.
pub async fn recover_pending(store: &Arc<dyn DataStore>) {
    let pending = match store.pending_ops().await {
        Ok(ops) => ops,
        Err(e) => {
            tracing::error!("crash recovery: failed to fetch pending ops: {e}");
            return;
        }
    };

    if pending.is_empty() {
        tracing::info!("crash recovery: no pending ops");
        return;
    }

    tracing::warn!("crash recovery: replaying {} pending op(s)", pending.len());

    for op in &pending {
        if let Err(e) = replay_op(store, op).await {
            tracing::error!(op_id = %op.id, op_name = %op.op, "crash recovery: replay failed: {e}");
            // Continue with other ops — partial recovery is better than none.
        }
    }
}

async fn replay_op(store: &Arc<dyn DataStore>, op: &PendingOp) -> anyhow::Result<()> {
    let p = &op.payload;
    tracing::info!(op_id = %op.id, op_name = %op.op, "replaying pending op");

    match op.op.as_str() {
        "flag.upsert" => {
            store.upsert_flag(
                str(p, "id")?, str(p, "key")?, str(p, "color")?,
            ).await?;
        }
        "flag.delete" => {
            store.delete_flag(str(p, "key")?).await?;
        }
        "remark.upsert" => {
            let targets: Vec<crate::remark::RemarkTarget> = p["targets"]
                .as_array().unwrap_or(&vec![])
                .iter()
                .filter_map(|t| {
                    Some(crate::remark::RemarkTarget {
                        row_id:    t["row_id"].as_str()?.to_owned(),
                        column_id: t["column_id"].as_str()?.to_owned(),
                    })
                })
                .collect();
            let resolved_at = p["resolved_at"].as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc));
            store.upsert_remark(
                str(p, "id")?,
                str_or(p, "body", ""),
                str_or(p, "kind", "note"),
                p["is_private"].as_bool().unwrap_or(false),
                resolved_at,
                &targets,
            ).await?;
        }
        "remark.delete" => {
            store.delete_remark(str(p, "id")?).await?;
        }
        "hidden_row.add" => {
            store.add_hidden_row(str(p, "id")?, str(p, "row_id")?).await?;
        }
        "hidden_row.remove" => {
            store.remove_hidden_row(str(p, "row_id")?).await?;
        }
        "hidden_column.add" => {
            store.add_hidden_column(str(p, "id")?, str(p, "column_id")?).await?;
        }
        "hidden_column.remove" => {
            store.remove_hidden_column(str(p, "column_id")?).await?;
        }
        "custom_column.upsert" => {
            let to_str_vec = |v: &serde_json::Value| -> Option<Vec<String>> {
                v.as_array().map(|arr| arr.iter().filter_map(|s| s.as_str().map(str::to_owned)).collect())
            };
            store.upsert_custom_column(
                str(p, "table_id")?, str(p, "id")?,
                &crate::custom_column::CustomColumnInput {
                    name:          str(p, "name")?.to_owned(),
                    label:         p["label"].as_str().map(str::to_owned),
                    description:   p["description"].as_str().map(str::to_owned),
                    expression:    p["expression"].as_str().map(str::to_owned),
                    position_after: p["position_after"].as_str().map(str::to_owned),
                    is_group:      p["is_group"].as_bool().unwrap_or(false),
                    parent_ids:    to_str_vec(&p["parent_ids"]).unwrap_or_default(),
                    source_path:   to_str_vec(&p["source_path"]),
                    types:         to_str_vec(&p["types"]),
                    data_types:    to_str_vec(&p["data_types"]),
                },
            ).await?;
        }
        "custom_column.delete" => {
            store.delete_custom_column(str(p, "id")?).await?;
        }
        "custom_column.freeze" => {
            store.set_table_column_frozen(
                str(p, "table_id")?, str(p, "column_id")?,
                p["is_frozen"].as_bool().unwrap_or(false),
            ).await?;
        }
        "table.create" => {
            store.create_table(
                str(p, "id")?, str(p, "title")?,
                p["description"].as_str(), p["who_created"].as_str(),
            ).await?;
        }
        "table.patch" => {
            store.patch_table(
                str(p, "id")?,
                p["title"].as_str(),
                p["description"].as_str(),
                p["who_last_modified"].as_str(),
            ).await?;
        }
        "table.delete" => {
            store.delete_table(str(p, "id")?).await?;
        }
        "row.create" => {
            store.create_row(
                str(p, "table_id")?, str(p, "row_id")?,
                p["title"].as_str(), p["who_created"].as_str(),
            ).await?;
        }
        "row.patch" => {
            store.patch_row_value(
                str(p, "table_id")?, str(p, "row_id")?, str(p, "col_id")?,
                p["value"].clone(),
            ).await?;
        }
        "github_repos.batch_upsert" => {
            let repos = p["repos"].as_array()
                .ok_or_else(|| anyhow::anyhow!("github_repos.batch_upsert payload missing 'repos'"))?
                .clone();
            store.upsert_github_repos_batch(&repos).await?;
        }
        "rows.batch_upsert" => {
            let table_id = str(p, "table_id")?;
            let rows = p["rows"].as_array()
                .ok_or_else(|| anyhow::anyhow!("rows.batch_upsert payload missing 'rows'"))?
                .clone();
            store.upsert_rows_batch(table_id, &rows).await?;
        }
        other => {
            tracing::error!(op_id = %op.id, "crash recovery: unknown op '{}', skipping — DATA MAY NOT HAVE BEEN APPLIED", other);
            return Ok(());
        }
    }

    store.mark_op_applied(&op.id).await;
    Ok(())
}

fn str<'a>(p: &'a Value, key: &str) -> anyhow::Result<&'a str> {
    p[key].as_str().ok_or_else(|| anyhow::anyhow!("missing field '{key}' in op payload"))
}

fn str_or<'a>(p: &'a Value, key: &str, default: &'a str) -> &'a str {
    p[key].as_str().unwrap_or(default)
}

/// Mark an ops log entry as applied (applied_at = now()). Idempotent: no-op if already set.
pub async fn mark_applied(pool: &sqlx::PgPool, id: &str) {
    let result = sqlx::query(
        "UPDATE operations_log SET applied_at = NOW() WHERE id = $1 AND applied_at IS NULL",
    )
    .bind(id)
    .execute(pool)
    .await;

    if let Err(e) = result {
        tracing::warn!("ops_log mark_applied failed for id={id}: {e}");
    }
}
