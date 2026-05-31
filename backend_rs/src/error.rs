use axum::http::StatusCode;

/// Convert a store error into an Axum error response.
/// Unique-constraint violations (SQLSTATE 23505) become 400 Bad Request.
/// Everything else becomes 500 Internal Server Error.
pub fn db_err(op: &str, e: anyhow::Error) -> (StatusCode, String) {
    if let Some(sqlx_err) = e.downcast_ref::<sqlx::Error>() {
        if let sqlx::Error::Database(ref db_err) = sqlx_err {
            if db_err.code().as_deref() == Some("23505") {
                let msg = format!("Duplicate key: {}", db_err.message());
                tracing::warn!("{op}: {msg}");
                return (StatusCode::BAD_REQUEST, msg);
            }
        }
    }
    tracing::error!("{op}: {e}");
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generic_error_returns_500() {
        let e = anyhow::anyhow!("something went wrong");
        let (status, body) = db_err("test_op", e);
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert!(body.contains("something went wrong"));
    }

    #[test]
    fn non_database_sqlx_error_returns_500() {
        // A connection-level sqlx error (not a database error) must also 500.
        let e: anyhow::Error = sqlx::Error::PoolTimedOut.into();
        let (status, _) = db_err("test_op", e);
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    }
}
