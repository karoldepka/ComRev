use axum::http::StatusCode;

#[allow(dead_code)]
pub fn db_err(op: &str, e: impl std::fmt::Display) -> (StatusCode, String) {
    tracing::error!("{op}: {e}");
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}
