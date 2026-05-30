pub fn init(default_filter: &str) {
    init_impl(default_filter);
}

pub fn debug(target: &'static str, message: impl AsRef<str>) {
    debug_impl(target, message.as_ref());
}

pub fn info(target: &'static str, message: impl AsRef<str>) {
    info_impl(target, message.as_ref());
}

pub fn warn(target: &'static str, message: impl AsRef<str>) {
    warn_impl(target, message.as_ref());
}

pub fn error(target: &'static str, message: impl AsRef<str>) {
    error_impl(target, message.as_ref());
}

#[cfg(not(target_arch = "wasm32"))]
fn init_impl(default_filter: &str) {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| default_filter.into()),
        )
        .try_init()
        .ok();
}

#[cfg(target_arch = "wasm32")]
fn init_impl(_default_filter: &str) {}

#[cfg(not(target_arch = "wasm32"))]
fn debug_impl(target: &'static str, message: &str) {
    tracing::debug!(logger_target = target, "{message}");
}

#[cfg(target_arch = "wasm32")]
fn debug_impl(target: &'static str, message: &str) {
    web_sys::console::debug_1(&wasm_bindgen::JsValue::from_str(&format!(
        "[{target}] {message}"
    )));
}

#[cfg(not(target_arch = "wasm32"))]
fn info_impl(target: &'static str, message: &str) {
    tracing::info!(logger_target = target, "{message}");
}

#[cfg(target_arch = "wasm32")]
fn info_impl(target: &'static str, message: &str) {
    web_sys::console::info_1(&wasm_bindgen::JsValue::from_str(&format!(
        "[{target}] {message}"
    )));
}

#[cfg(not(target_arch = "wasm32"))]
fn warn_impl(target: &'static str, message: &str) {
    tracing::warn!(logger_target = target, "{message}");
}

#[cfg(target_arch = "wasm32")]
fn warn_impl(target: &'static str, message: &str) {
    web_sys::console::warn_1(&wasm_bindgen::JsValue::from_str(&format!(
        "[{target}] {message}"
    )));
}

#[cfg(not(target_arch = "wasm32"))]
fn error_impl(target: &'static str, message: &str) {
    tracing::error!(logger_target = target, "{message}");
}

#[cfg(target_arch = "wasm32")]
fn error_impl(target: &'static str, message: &str) {
    web_sys::console::error_1(&wasm_bindgen::JsValue::from_str(&format!(
        "[{target}] {message}"
    )));
}
