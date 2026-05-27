use anyhow::Result;
use async_trait::async_trait;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

use super::DataStore;
use crate::{
    custom_column::CustomColumn,
    flag::CellFlag,
    hidden_column::HiddenColumn,
    hidden_row::HiddenRow,
    remark::{Remark, RemarkTarget},
    types::{PagedResponse, RepoQuery},
};

pub struct SqliteStore {
    pool: SqlitePool,
}

impl SqliteStore {
    pub async fn connect(url: &str) -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(url)
            .await?;
        Ok(Self { pool })
    }
}

#[async_trait]
impl DataStore for SqliteStore {
    async fn ensure_schema(&self) -> Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS cell_flags (
                id         TEXT PRIMARY KEY,
                key        TEXT NOT NULL UNIQUE,
                color      TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS remarks (
                id          TEXT PRIMARY KEY,
                body        TEXT NOT NULL DEFAULT '',
                kind        TEXT NOT NULL DEFAULT 'note',
                is_private  INTEGER NOT NULL DEFAULT 0,
                resolved_at TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS remark_targets (
                remark_id  TEXT NOT NULL REFERENCES remarks(id) ON DELETE CASCADE,
                repo_id    INTEGER NOT NULL DEFAULT 0,
                column_id  TEXT NOT NULL,
                PRIMARY KEY (remark_id, repo_id, column_id)
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS hidden_rows (
                id         TEXT PRIMARY KEY,
                repo_id    INTEGER NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS hidden_columns (
                id         TEXT PRIMARY KEY,
                column_id  TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS custom_columns (
                id             TEXT PRIMARY KEY,
                name           TEXT NOT NULL,
                label          TEXT,
                expression     TEXT,
                position_after TEXT,
                created_at     TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS operations_log (
                id         TEXT PRIMARY KEY,
                op         TEXT NOT NULL,
                payload    TEXT NOT NULL,
                tx_id      TEXT,
                client_id  TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ── Flags ─────────────────────────────────────────────────────────────────

    async fn list_flags(&self) -> Result<Vec<CellFlag>> {
        Ok(sqlx::query_as::<_, CellFlag>(
            "SELECT id, key, color FROM cell_flags ORDER BY key",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn upsert_flag(&self, key: &str, color: &str) -> Result<CellFlag> {
        let id = nanoid::nanoid!();
        sqlx::query("INSERT OR IGNORE INTO cell_flags (id, key, color) VALUES (?, ?, ?)")
            .bind(&id).bind(key).bind(color)
            .execute(&self.pool).await?;
        sqlx::query("UPDATE cell_flags SET color = ? WHERE key = ?")
            .bind(color).bind(key)
            .execute(&self.pool).await?;
        Ok(sqlx::query_as::<_, CellFlag>("SELECT id, key, color FROM cell_flags WHERE key = ?")
            .bind(key).fetch_one(&self.pool).await?)
    }

    async fn delete_flag(&self, key: &str) -> Result<()> {
        sqlx::query("DELETE FROM cell_flags WHERE key = ?")
            .bind(key).execute(&self.pool).await?;
        Ok(())
    }

    // ── Remarks ───────────────────────────────────────────────────────────────

    async fn list_remarks(&self) -> Result<Vec<Remark>> {
        #[derive(sqlx::FromRow)]
        struct RmRow { id: String, body: String, kind: String, is_private: bool, resolved_at: Option<String> }
        #[derive(sqlx::FromRow)]
        struct TgtRow { remark_id: String, repo_id: i64, column_id: String }

        let rows = sqlx::query_as::<_, RmRow>(
            "SELECT id, body, kind, is_private, resolved_at FROM remarks ORDER BY created_at",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut targets_by_id: std::collections::HashMap<String, Vec<RemarkTarget>> =
            std::collections::HashMap::new();
        for t in sqlx::query_as::<_, TgtRow>(
            "SELECT remark_id, repo_id, column_id FROM remark_targets",
        )
        .fetch_all(&self.pool)
        .await?
        {
            targets_by_id
                .entry(t.remark_id)
                .or_default()
                .push(RemarkTarget { repo_id: t.repo_id, column_id: t.column_id });
        }

        Ok(rows
            .into_iter()
            .map(|r| {
                let resolved_at = r
                    .resolved_at
                    .and_then(|s| s.parse::<chrono::DateTime<chrono::Utc>>().ok());
                Remark {
                    id: r.id.clone(),
                    body: r.body,
                    kind: r.kind,
                    is_private: r.is_private,
                    resolved_at,
                    targets: targets_by_id.remove(&r.id).unwrap_or_default(),
                }
            })
            .collect())
    }

    async fn upsert_remark(
        &self,
        id: &str,
        body: &str,
        kind: &str,
        is_private: bool,
        resolved_at: Option<chrono::DateTime<chrono::Utc>>,
        targets: &[RemarkTarget],
    ) -> Result<Remark> {
        let resolved_at_str = resolved_at.map(|dt| dt.to_rfc3339());
        let is_private_int: i64 = if is_private { 1 } else { 0 };
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            "INSERT INTO remarks (id, body, kind, is_private, resolved_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               body = excluded.body, kind = excluded.kind,
               is_private = excluded.is_private, resolved_at = excluded.resolved_at",
        )
        .bind(id).bind(body).bind(kind).bind(is_private_int).bind(&resolved_at_str)
        .execute(&mut *tx).await?;

        sqlx::query("DELETE FROM remark_targets WHERE remark_id = ?")
            .bind(id).execute(&mut *tx).await?;

        for t in targets {
            sqlx::query(
                "INSERT INTO remark_targets (remark_id, repo_id, column_id) VALUES (?, ?, ?)",
            )
            .bind(id).bind(t.repo_id).bind(&t.column_id)
            .execute(&mut *tx).await?;
        }
        tx.commit().await?;

        Ok(Remark {
            id: id.to_string(), body: body.to_string(), kind: kind.to_string(),
            is_private, resolved_at, targets: targets.to_vec(),
        })
    }

    async fn delete_remark(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM remarks WHERE id = ?")
            .bind(id).execute(&self.pool).await?;
        Ok(())
    }

    // ── Hidden rows ───────────────────────────────────────────────────────────

    async fn list_hidden_rows(&self) -> Result<Vec<HiddenRow>> {
        Ok(sqlx::query_as::<_, HiddenRow>(
            "SELECT id, repo_id FROM hidden_rows ORDER BY created_at",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn add_hidden_row(&self, repo_id: i64) -> Result<HiddenRow> {
        let id = nanoid::nanoid!();
        sqlx::query("INSERT OR IGNORE INTO hidden_rows (id, repo_id) VALUES (?, ?)")
            .bind(&id).bind(repo_id)
            .execute(&self.pool).await?;
        let actual_id: String =
            sqlx::query_scalar("SELECT id FROM hidden_rows WHERE repo_id = ?")
                .bind(repo_id).fetch_one(&self.pool).await?;
        Ok(HiddenRow { id: actual_id, repo_id })
    }

    async fn remove_hidden_row(&self, repo_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM hidden_rows WHERE repo_id = ?")
            .bind(repo_id).execute(&self.pool).await?;
        Ok(())
    }

    // ── Hidden columns ────────────────────────────────────────────────────────

    async fn list_hidden_columns(&self) -> Result<Vec<HiddenColumn>> {
        Ok(sqlx::query_as::<_, HiddenColumn>(
            "SELECT id, column_id FROM hidden_columns ORDER BY column_id",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn add_hidden_column(&self, column_id: &str) -> Result<HiddenColumn> {
        let id = nanoid::nanoid!();
        sqlx::query("INSERT OR IGNORE INTO hidden_columns (id, column_id) VALUES (?, ?)")
            .bind(&id).bind(column_id)
            .execute(&self.pool).await?;
        let actual_id: String =
            sqlx::query_scalar("SELECT id FROM hidden_columns WHERE column_id = ?")
                .bind(column_id).fetch_one(&self.pool).await?;
        Ok(HiddenColumn { id: actual_id, column_id: column_id.to_string() })
    }

    async fn remove_hidden_column(&self, column_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM hidden_columns WHERE column_id = ?")
            .bind(column_id).execute(&self.pool).await?;
        Ok(())
    }

    // ── Custom columns ────────────────────────────────────────────────────────

    async fn list_custom_columns(&self) -> Result<Vec<CustomColumn>> {
        Ok(sqlx::query_as::<_, CustomColumn>(
            "SELECT id, name, label, expression, position_after \
             FROM custom_columns ORDER BY created_at",
        )
        .fetch_all(&self.pool)
        .await?)
    }

    async fn upsert_custom_column(
        &self,
        id: &str,
        name: &str,
        label: Option<&str>,
        expression: Option<&str>,
        position_after: Option<&str>,
    ) -> Result<CustomColumn> {
        sqlx::query(
            "INSERT OR IGNORE INTO custom_columns (id, name, label, expression, position_after)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id).bind(name).bind(label).bind(expression).bind(position_after)
        .execute(&self.pool).await?;

        sqlx::query(
            "UPDATE custom_columns SET name = ?, label = ?, expression = ?, position_after = ?
             WHERE id = ?",
        )
        .bind(name).bind(label).bind(expression).bind(position_after).bind(id)
        .execute(&self.pool).await?;

        Ok(sqlx::query_as::<_, CustomColumn>(
            "SELECT id, name, label, expression, position_after FROM custom_columns WHERE id = ?",
        )
        .bind(id).fetch_one(&self.pool).await?)
    }

    async fn delete_custom_column(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM custom_columns WHERE id = ?")
            .bind(id).execute(&self.pool).await?;
        Ok(())
    }

    // ── Repos (not applicable for SQLite) ─────────────────────────────────────

    async fn list_repos(&self, _params: &RepoQuery) -> Result<PagedResponse> {
        anyhow::bail!("list_repos is not supported on SQLite")
    }

    // ── Ops log ───────────────────────────────────────────────────────────────

    async fn append_ops_log(&self, op: &str, payload: serde_json::Value, tx_id: Option<&str>) {
        let id = nanoid::nanoid!();
        let payload_str = payload.to_string();
        let result = sqlx::query(
            "INSERT INTO operations_log (id, op, payload, tx_id) VALUES (?, ?, ?, ?)",
        )
        .bind(&id).bind(op).bind(&payload_str).bind(tx_id)
        .execute(&self.pool)
        .await;
        if let Err(e) = result {
            tracing::warn!("sqlite ops_log append failed for op={op}: {e}");
        }
    }
}
