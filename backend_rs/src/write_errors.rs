/// Per-request accumulator for partial fan-out write failures.
///
/// A task-local `Arc<Mutex<Vec<String>>>` is scoped for every HTTP request by
/// `write_error_layer` in main.rs.  `fan_write` in multi_db.rs calls `push()`
/// whenever one store in the fan-out fails but at least one succeeded — the
/// partial error message is collected here instead of being silently dropped.
///
/// The middleware reads the accumulated messages after the handler returns and
/// attaches them as the `x-store-errors` JSON response header so the client
/// can surface them in one round-trip.
use std::sync::{Arc, Mutex};

tokio::task_local! {
    pub static ERRORS: Arc<Mutex<Vec<String>>>;
}

/// Push a partial failure message into the current request's accumulator.
/// No-op when called outside a request scope (e.g. in tests or internal tasks).
pub fn push(msg: impl Into<String>) {
    let _ = ERRORS.try_with(|arc| arc.lock().unwrap().push(msg.into()));
}

/// Drain and return all accumulated errors.  Called by the middleware.
pub fn take() -> Vec<String> {
    ERRORS
        .try_with(|arc| std::mem::take(&mut *arc.lock().unwrap()))
        .unwrap_or_default()
}
