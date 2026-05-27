use axum::http::StatusCode;

/// Log the error and return an Axum-compatible 500 tuple.
pub fn db_err(op: &str, e: impl std::fmt::Display) -> (StatusCode, String) {
    tracing::error!("{op}: {e}");
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}
