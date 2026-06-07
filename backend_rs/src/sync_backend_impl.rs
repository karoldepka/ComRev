// Implements sync_core::service::SyncBackend for AppState.
//
// This is the adapter between the generic SyncServiceImpl (in sync_core) and
// the concrete backend_rs store layer.  All domain→proto conversions live here.

use async_trait::async_trait;
use sync_core::{
    proto::*,
    service::{EventTx, SyncBackend},
};

use crate::data_row::AppState;

#[async_trait]
impl SyncBackend for AppState {
    // ── Reads ─────────────────────────────────────────────────────────────────

    async fn list_flags(&self) -> anyhow::Result<Vec<Flag>> {
        let flags = self.store.list_flags().await?;
        Ok(flags
            .into_iter()
            .map(|f| Flag {
                id: f.id,
                key: f.key,
                color: f.color,
            })
            .collect())
    }

    async fn list_remarks(&self) -> anyhow::Result<Vec<Remark>> {
        let remarks = self.store.list_remarks().await?;
        Ok(remarks.iter().map(remark_to_proto).collect())
    }

    async fn list_hidden_rows(&self) -> anyhow::Result<Vec<HiddenRow>> {
        let rows = self.store.list_hidden_rows().await?;
        Ok(rows
            .into_iter()
            .map(|r| HiddenRow {
                id: r.id,
                repo_id: r.row_id.parse().unwrap_or(0),
            })
            .collect())
    }

    async fn list_hidden_columns(&self) -> anyhow::Result<Vec<HiddenCol>> {
        let cols = self.store.list_hidden_columns().await?;
        Ok(cols
            .into_iter()
            .map(|c| HiddenCol {
                id: c.id,
                column_id: c.column_id,
            })
            .collect())
    }

    async fn list_custom_columns(&self, table_id: &str) -> anyhow::Result<Vec<CustomCol>> {
        let cols = self.store.list_custom_columns(table_id).await?;
        Ok(cols.iter().map(custom_col_to_proto).collect())
    }

    async fn list_repos(&self, req: ListReposRequest) -> anyhow::Result<PagedRepos> {
        let params = crate::types::RowQuery {
            sort: if req.sort.is_empty() {
                None
            } else {
                Some(req.sort)
            },
            page: req.page.max(1) as u32,
            per_page: req.per_page.clamp(1, 200) as u32,
            ..Default::default()
        };
        let paged = self.store.list_data_rows(&req.table_id, &params).await?;
        let rows_json = paged
            .data
            .iter()
            .map(|v| serde_json::to_vec(v).unwrap_or_default())
            .collect();
        Ok(PagedRepos {
            rows_json,
            total: paged.total,
            page: paged.page as i32,
            per_page: paged.per_page as i32,
        })
    }

    // ── Writes ────────────────────────────────────────────────────────────────

    async fn upsert_flag(&self, id: &str, key: &str, color: &str) -> anyhow::Result<Flag> {
        let f = self.store.upsert_flag(id, key, color).await?;
        Ok(Flag {
            id: f.id,
            key: f.key,
            color: f.color,
        })
    }

    async fn delete_flag(&self, key: &str) -> anyhow::Result<()> {
        Ok(self.store.delete_flag(key).await?)
    }

    async fn upsert_remark(&self, op: UpsertRemarkOp) -> anyhow::Result<Remark> {
        let targets: Vec<crate::remark::RemarkTarget> = op
            .targets
            .iter()
            .map(|t| crate::remark::RemarkTarget {
                row_id: if t.repo_id == 0 {
                    String::new()
                } else {
                    t.repo_id.to_string()
                },
                column_id: t.column_id.clone(),
            })
            .collect();
        let r = self
            .store
            .upsert_remark(&op.id, &op.body, &op.kind, false, None, &targets)
            .await?;
        Ok(remark_to_proto(&r))
    }

    async fn delete_remark(&self, id: &str) -> anyhow::Result<()> {
        Ok(self.store.delete_remark(id).await?)
    }

    async fn add_hidden_row(&self, id: &str, repo_id: i64) -> anyhow::Result<HiddenRow> {
        let row = self.store.add_hidden_row(id, &repo_id.to_string()).await?;
        Ok(HiddenRow {
            id: row.id,
            repo_id,
        })
    }

    async fn remove_hidden_row(&self, repo_id: i64) -> anyhow::Result<()> {
        Ok(self.store.remove_hidden_row(&repo_id.to_string()).await?)
    }

    async fn add_hidden_col(&self, id: &str, column_id: &str) -> anyhow::Result<HiddenCol> {
        let col = self.store.add_hidden_column(id, column_id).await?;
        Ok(HiddenCol {
            id: col.id,
            column_id: col.column_id,
        })
    }

    async fn remove_hidden_col(&self, column_id: &str) -> anyhow::Result<()> {
        Ok(self.store.remove_hidden_column(column_id).await?)
    }

    async fn create_custom_col(
        &self,
        table_id: &str,
        id: &str,
        op: CreateCustomColOp,
    ) -> anyhow::Result<CustomCol> {
        let input = crate::custom_column::CustomColumnInput {
            title: (!op.title.is_empty()).then(|| op.title),
            description: (!op.description.is_empty()).then(|| op.description),
            expression: (!op.expression.is_empty()).then(|| op.expression),
            position_before: (!op.position_before.is_empty()).then(|| op.position_before),
            position_after: (!op.position_after.is_empty()).then(|| op.position_after),
            types: (!op.types.is_empty()).then(|| op.types),
            data_types: (!op.data_types.is_empty()).then(|| op.data_types),
            ..Default::default()
        };
        let col = self
            .store
            .upsert_custom_column(table_id, id, &input)
            .await?;
        Ok(custom_col_to_proto(&col))
    }

    async fn delete_custom_col(&self, id: &str) -> anyhow::Result<()> {
        Ok(self.store.delete_custom_column(id).await?)
    }

    async fn create_row_class(&self, op: CreateRowClassOp) -> anyhow::Result<RowClass> {
        let row_class = self
            .store
            .create_row_class(
                &op.table_id,
                &op.id,
                &op.name,
                (!op.color.is_empty()).then_some(op.color.as_str()),
            )
            .await?;
        Ok(row_class_to_proto(&row_class))
    }

    async fn delete_row_class(&self, table_id: &str, id: &str) -> anyhow::Result<()> {
        Ok(self.store.delete_row_class(table_id, id).await?)
    }

    async fn set_many_to_many(&self, op: SetManyToManyOp) -> anyhow::Result<ManyToManyValue> {
        self.store
            .set_many_to_many_assignments(&op.table_id, &op.row_id, &op.field_id, &op.item_ids)
            .await?;
        Ok(ManyToManyValue {
            table_id: op.table_id,
            row_id: op.row_id,
            field_id: op.field_id,
            item_ids: op.item_ids,
        })
    }

    fn event_tx(&self) -> &EventTx {
        &self.event_tx
    }
}

// ── Conversion helpers ────────────────────────────────────────────────────────

fn remark_to_proto(r: &crate::remark::Remark) -> Remark {
    Remark {
        id: r.id.clone(),
        body: r.body.clone(),
        kind: r.kind.clone(),
        is_private: r.is_private,
        resolved_at: r.resolved_at.map(|dt| dt.to_rfc3339()).unwrap_or_default(),
        targets: r
            .targets
            .iter()
            .map(|t| RemarkTarget {
                repo_id: if t.row_id.is_empty() {
                    0
                } else {
                    t.row_id.parse().unwrap_or(0)
                },
                column_id: t.column_id.clone(),
            })
            .collect(),
    }
}

fn custom_col_to_proto(c: &crate::custom_column::CustomColumn) -> CustomCol {
    CustomCol {
        id: c.id.clone(),
        title: c.title.clone(),
        description: c.description.clone().unwrap_or_default(),
        expression: c.expression.clone().unwrap_or_default(),
        position_before: c.position_before.clone().unwrap_or_default(),
        position_after: c.position_after.clone().unwrap_or_default(),
        read_only: c.read_only,
        types: c.types.clone(),
        is_frozen: c.is_frozen,
        source_path: c.source_path.clone().unwrap_or_default(),
        data_types: c.data_types.clone(),
        parent_ids: c.parent_ids.clone(),
        is_group: c.is_group,
    }
}

fn row_class_to_proto(row_class: &crate::row_class::RowClass) -> RowClass {
    RowClass {
        id: row_class.id.clone(),
        table_id: row_class.table_id.clone(),
        name: row_class.name.clone(),
        color: row_class.color.clone().unwrap_or_default(),
    }
}
