mod custom_column;
mod error;
mod flag;
mod hidden_column;
mod hidden_row;
mod ops_log;
mod remark;
mod data_row;
mod store;
mod sync_service;
mod table;
mod types;

use axum::{routing::get, Router};
use axum::routing::delete;
use data_row::AppState;
use tower_http::cors::CorsLayer;
use tonic_web::GrpcWebLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "backend_rs=info,tower_http=info".into()),
        )
        .init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL not set");

    let data_store = store::open(&database_url).await?;
    data_store.ensure_schema().await?;
    tracing::info!("schema ready");

    let event_tx = sync_service::make_channel();

    let state = AppState {
        store:    data_store,
        event_tx: event_tx.clone(),
    };

    // ── REST API (port 3001) ───────────────────────────────────────────────────

    let rest_app = Router::new()
        .route("/health", get(health))
        .route("/repos", get(data_row::list_repos))
        .route("/tables/:table_id/rows/:row_id/values", axum::routing::patch(data_row::patch_cell_value))
        .route("/custom-columns", get(custom_column::list).post(custom_column::create))
        .route("/custom-columns/:id", delete(custom_column::delete))
        .route("/remarks", get(remark::list))
        .route("/remarks/:id", axum::routing::put(remark::upsert).delete(remark::delete))
        .route("/flags", get(flag::list).put(flag::upsert))
        .route("/flags/:key", delete(flag::delete))
        .route("/hidden-rows", get(hidden_row::list).post(hidden_row::add))
        .route("/hidden-rows/:repo_id", delete(hidden_row::remove))
        .route("/hidden-columns", get(hidden_column::list).post(hidden_column::add))
        .route("/hidden-columns/:column_id", delete(hidden_column::remove))
        .route("/tables", get(table::list).post(table::create))
        .route("/tables/:id", axum::routing::patch(table::patch).delete(table::delete))
        .with_state(state.clone())
        .layer(CorsLayer::permissive());

    let rest_addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:3001".to_string());
    let rest_listener = tokio::net::TcpListener::bind(&rest_addr).await?;
    tracing::info!("REST listening on {rest_addr}");

    // ── gRPC + gRPC-Web (port 3002) ────────────────────────────────────────────

    let grpc_addr: std::net::SocketAddr = std::env::var("GRPC_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:3002".to_string())
        .parse()?;
    tracing::info!("gRPC listening on {grpc_addr}");

    let grpc_server = tonic::transport::Server::builder()
        .accept_http1(true)
        .layer(tower_http::cors::CorsLayer::permissive())
        .layer(GrpcWebLayer::new())
        .add_service(sync_service::make_server(state))
        .serve(grpc_addr);

    tokio::try_join!(
        async { axum::serve(rest_listener, rest_app).await.map_err(anyhow::Error::from) },
        async { grpc_server.await.map_err(anyhow::Error::from) },
    )?;

    Ok(())
}

async fn health() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({ "status": "ok" }))
}
