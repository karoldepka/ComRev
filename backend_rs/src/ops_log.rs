use serde_json::Value;

/// Fire-and-forget append to operations_log.
/// Failures are logged but never propagate — the log is best-effort.
/// `tx_id` groups related operations from the same client transaction; pass `None` for standalone ops.
pub async fn append(pool: &sqlx::PgPool, op: &str, payload: Value, tx_id: Option<&str>) {
    let result = sqlx::query(
        "INSERT INTO operations_log (op, payload, tx_id) VALUES ($1, $2, $3)",
    )
    .bind(op)
    .bind(payload)
    .bind(tx_id)
    .execute(pool)
    .await;

    if let Err(e) = result {
        tracing::warn!("ops_log append failed for op={op}: {e}");
    }
}

pub async fn ensure_table(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS operations_log (
            id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
            op         TEXT        NOT NULL,
            payload    JSONB       NOT NULL,
            tx_id      TEXT,
            client_id  TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}
