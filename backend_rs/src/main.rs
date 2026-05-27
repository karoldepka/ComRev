mod comment;
mod custom_column;
mod error;
mod flag;
mod hidden_column;
mod hidden_row;
mod repo;

use axum::{routing::get, Router};
use axum::routing::delete;
use repo::{AppState, fetch_sortable_cols};
use sqlx::postgres::PgPoolOptions;
use std::{sync::Arc, time::Duration};
use tower_http::cors::CorsLayer;

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

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&database_url)
        .await?;

    custom_column::ensure_table(&pool).await?;
    comment::ensure_table(&pool).await?;
    flag::ensure_table(&pool).await?;
    hidden_row::ensure_table(&pool).await?;
    hidden_column::ensure_table(&pool).await?;

    let sortable_cols = fetch_sortable_cols(&pool).await?;
    tracing::info!("{} sortable columns loaded from schema", sortable_cols.len());

    let state = AppState {
        pool,
        sortable_cols: Arc::new(sortable_cols),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/repos", get(repo::list_repos))
        .route("/custom-columns", get(custom_column::list).post(custom_column::create))
        .route("/custom-columns/:id", delete(custom_column::delete))
        .route("/comments", get(comment::list).post(comment::upsert))
        .route("/comments/:id", delete(comment::delete))
        .route("/flags", get(flag::list).put(flag::upsert))
        .route("/flags/:key", delete(flag::delete))
        .route("/hidden-rows", get(hidden_row::list).post(hidden_row::add))
        .route("/hidden-rows/:repo_id", delete(hidden_row::remove))
        .route("/hidden-columns", get(hidden_column::list).post(hidden_column::add))
        .route("/hidden-columns/:column_id", delete(hidden_column::remove))
        .with_state(state)
        .layer(CorsLayer::permissive());

    let addr = std::env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:3001".to_string());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("listening on {addr}");
    axum::serve(listener, app).await?;
    tracing::info!("after listening on {addr}");
    Ok(())
}

async fn health() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({ "status": "ok" }))
}
