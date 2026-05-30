use serde_json::Value;

pub async fn append(pool: &sqlx::PgPool, op: &str, payload: Value, tx_id: Option<&str>) {
    let id = nanoid::nanoid!();
    let result = sqlx::query(
        "INSERT INTO operations_log (id, op, payload, tx_id) VALUES ($1, $2, $3, $4)",
    )
    .bind(&id)
    .bind(op)
    .bind(payload)
    .bind(tx_id)
    .execute(pool)
    .await;

    if let Err(e) = result {
        tracing::warn!("ops_log append failed for op={op}: {e}");
    }
}
