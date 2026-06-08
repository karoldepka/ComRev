mod ai_fill;
mod custom_column;
mod data_row;
mod db_config;
mod error;
mod flag;
mod hidden_column;
mod hidden_row;
mod ops_log;
mod remark;
mod row_class;
mod store;
mod sync_backend_impl;
mod sync_service;
mod table;
mod types;
mod write_errors;

use std::sync::{Arc, Mutex};

use axum::middleware::Next;
use axum::response::Response;
use axum::routing::delete;
use axum::{routing::get, Router};
use data_row::AppState;
use tonic_web::GrpcWebLayer;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // rustls 0.22+ requires an explicit crypto provider to be installed.
    let _ = rustls::crypto::ring::default_provider().install_default();

    dotenvy::dotenv().ok();

    structable_logger::init("backend_rs=debug,tower_http=info");

    // Resolve DB (id, url) pairs: databases.toml > DB_URLS > DATABASE_URL (+ SURREAL_URL fallback).
    let db_entries_owned: Vec<(String, String)> = match db_config::load()? {
        Some(entries) => {
            structable_logger::info("backend_rs", "loaded DB config from databases.toml");
            entries
        }
        None => {
            let raw = std::env::var("DB_URLS").unwrap_or_else(|_| {
                std::env::var("DATABASE_URL")
                    .expect("databases.toml, DB_URLS, or DATABASE_URL must be set")
            });
            raw.split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .enumerate()
                .map(|(i, url)| (format!("db_{i}"), url.to_owned()))
                .collect()
        }
    };
    let db_entries: Vec<(&str, &str)> = db_entries_owned
        .iter()
        .map(|(id, url)| (id.as_str(), url.as_str()))
        .collect();
    // ── One-shot commands ─────────────────────────────────────────────────────
    let args: Vec<String> = std::env::args().collect();

    if args.iter().any(|a| a == "--NUKE-USER-DATA") {
        eprintln!("⚠  NUKE-USER-DATA: deleting all user data (schema preserved)…");
        let data_store = store::open_all(&db_entries, None).await?;
        match data_store.nuke_user_data().await {
            Ok(_) => { eprintln!("✓  NUKE-USER-DATA complete."); std::process::exit(0); }
            Err(e) => { eprintln!("✗  NUKE-USER-DATA failed: {e}"); std::process::exit(1); }
        }
    }

    if args.iter().any(|a| a == "--NUKE__ALL_DB") {
        eprintln!("⚠  NUKE__ALL_DB requested — dropping and recreating schema…");
        let data_store = store::open_all(&db_entries, None).await?;
        match data_store.nuke_db().await {
            Ok(_) => { eprintln!("✓  NUKE__ALL_DB complete (schema re-applied)."); std::process::exit(0); }
            Err(e) => { eprintln!("✗  NUKE__ALL_DB failed: {e}"); std::process::exit(1); }
        }
    }

    if args.iter().any(|a| a == "--ensure-schema") {
        eprintln!("Applying schema…");
        let data_store = store::open_all(&db_entries, None).await?;
        match data_store.ensure_schema().await {
            Ok(_) => { eprintln!("✓  Schema ready."); std::process::exit(0); }
            Err(e) => { eprintln!("✗  ensure-schema failed: {e}"); std::process::exit(1); }
        }
    }

    structable_logger::info("backend_rs", "starting backend_rs");

    let event_tx = sync_service::make_channel();
    let data_store = store::open_all(&db_entries, Some(event_tx.clone())).await?;
    structable_logger::info("backend_rs", "data store connected");
    data_store.ensure_schema().await?;
    structable_logger::info("backend_rs", "schema ready");

    // Replay any ops that were logged before a previous crash (applied_at IS NULL).
    // No reads are served until recovery completes.
    ops_log::recover_pending(&data_store).await;
    structable_logger::info("backend_rs", "crash recovery complete");

    let state = AppState {
        store: data_store,
        event_tx: event_tx.clone(),
    };

    // ── REST API (port 3001) ───────────────────────────────────────────────────

    let rest_app = Router::new()
        .route("/health", get(health))
        .route("/data-rows", get(data_row::list_data_rows))
        // Compatibility route for older frontend builds.
        .route("/repos", get(data_row::list_data_rows))
        .route(
            "/tables/:table_id/data-rows",
            get(data_row::list_data_rows_for_table),
        )
        .route(
            "/tables/:table_id/rows",
            axum::routing::post(data_row::create_row),
        )
        .route(
            "/tables/:table_id/rows/batch-upsert",
            axum::routing::post(data_row::batch_upsert_rows),
        )
        .route(
            "/tables/:table_id/rows/:row_id/values",
            axum::routing::patch(data_row::patch_cell_value),
        )
        .route(
            "/tables/:table_id/custom-columns",
            get(custom_column::list_for_table).post(custom_column::create_for_table),
        )
        .route(
            "/tables/:table_id/custom-columns/:column_id",
            axum::routing::patch(custom_column::patch_for_table),
        )
        .route(
            "/custom-columns",
            get(custom_column::list).post(custom_column::create),
        )
        .route("/custom-columns/:id", delete(custom_column::delete))
        .route("/remarks", get(remark::list))
        .route(
            "/remarks/:id",
            axum::routing::put(remark::upsert).delete(remark::delete),
        )
        .route("/flags", get(flag::list).put(flag::upsert))
        .route("/flags/:key", delete(flag::delete))
        .route("/hidden-rows", get(hidden_row::list).post(hidden_row::add))
        .route("/hidden-rows/:repo_id", delete(hidden_row::remove))
        .route(
            "/tables/:table_id/row-classes",
            get(row_class::list_for_table).post(row_class::create_for_table),
        )
        .route(
            "/tables/:table_id/row-classes/:class_id",
            delete(row_class::delete_for_table),
        )
        .route(
            "/tables/:table_id/rows/:row_id/classes",
            get(row_class::get_row_classes).put(row_class::set_row_classes),
        )
        .route(
            "/tables/:table_id/row-classes/:class_id/superclasses",
            get(row_class::list_superclasses).put(row_class::set_superclasses),
        )
        .route(
            "/hidden-columns",
            get(hidden_column::list).post(hidden_column::add),
        )
        .route("/hidden-columns/:column_id", delete(hidden_column::remove))
        .route("/tables", get(table::list).post(table::create))
        .route(
            "/tables/:id",
            axum::routing::patch(table::patch).delete(table::delete),
        )
        .route(
            "/tables/:table_id/ai-fill",
            axum::routing::post(ai_fill::handler),
        )
        .route("/NUKE__USER_DATA", delete(nuke_user_data_handler))
        .route("/NUKE__DB",   delete(nuke_db))
        .with_state(state.clone())
        .layer(axum::middleware::from_fn(write_error_middleware))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive());

    let rest_addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:3001".to_string());
    let rest_listener = tokio::net::TcpListener::bind(&rest_addr).await?;
    structable_logger::info("backend_rs", format!("REST listening on {rest_addr}"));

    // ── gRPC + gRPC-Web (port 3002) ────────────────────────────────────────────

    let grpc_addr: std::net::SocketAddr = std::env::var("GRPC_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:3002".to_string())
        .parse()?;
    structable_logger::info("backend_rs", format!("gRPC listening on {grpc_addr}"));

    let grpc_server = tonic::transport::Server::builder()
        .accept_http1(true)
        .layer(tower_http::cors::CorsLayer::permissive())
        .layer(GrpcWebLayer::new())
        .add_service(sync_service::make_server(state))
        .serve(grpc_addr);

    tokio::try_join!(
        async {
            axum::serve(rest_listener, rest_app)
                .await
                .map_err(anyhow::Error::from)
        },
        async { grpc_server.await.map_err(anyhow::Error::from) },
    )?;

    Ok(())
}

async fn health() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({ "status": "ok" }))
}

async fn nuke_user_data_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> (axum::http::StatusCode, String) {
    tracing::warn!("NUKE__DATA requested via HTTP");
    match state.store.nuke_user_data().await {
        Ok(_) => (axum::http::StatusCode::OK, "NUKE__DATA complete".to_string()),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("NUKE__DATA failed: {e}")),
    }
}

async fn nuke_db(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> (axum::http::StatusCode, String) {
    tracing::warn!("NUKE__DB requested via HTTP");
    match state.store.nuke_db().await {
        Ok(_) => (axum::http::StatusCode::OK, "NUKE__DB complete".to_string()),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("NUKE__DB failed: {e}")),
    }
}

async fn write_error_middleware(req: axum::extract::Request, next: Next) -> Response {
    let errors: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let mut response = write_errors::ERRORS.scope(errors, next.run(req)).await;
    let errs = write_errors::take();
    if !errs.is_empty() {
        let json = serde_json::to_string(&errs).unwrap_or_else(|_| "[]".to_string());
        if let Ok(val) = json.parse::<axum::http::HeaderValue>() {
            response.headers_mut().insert("x-store-errors", val);
        }
    }
    response
}
