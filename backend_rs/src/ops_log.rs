use serde_json::Value;

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
