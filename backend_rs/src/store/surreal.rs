use anyhow::Result;
use async_trait::async_trait;

use super::DataStore;
use crate::types::{PagedResponse, RowQuery};

pub struct SurrealStore;

macro_rules! not_impl {
    () => {
        anyhow::bail!("SurrealDB store not yet implemented")
    };
}

#[async_trait]
impl DataStore for SurrealStore {
    async fn ensure_schema(&self) -> Result<()> {
        not_impl!()
    }

    async fn list_flags(&self) -> Result<Vec<crate::flag::CellFlag>> {
        not_impl!()
    }
    async fn upsert_flag(
        &self,
        _id: &str,
        _key: &str,
        _color: &str,
    ) -> Result<crate::flag::CellFlag> {
        not_impl!()
    }
    async fn delete_flag(&self, _key: &str) -> Result<()> {
        not_impl!()
    }

    async fn list_remarks(&self) -> Result<Vec<crate::remark::Remark>> {
        not_impl!()
    }
    async fn upsert_remark(
        &self,
        _id: &str,
        _body: &str,
        _kind: &str,
        _is_private: bool,
        _resolved_at: Option<chrono::DateTime<chrono::Utc>>,
        _targets: &[crate::remark::RemarkTarget],
    ) -> Result<crate::remark::Remark> {
        not_impl!()
    }
    async fn delete_remark(&self, _id: &str) -> Result<()> {
        not_impl!()
    }

    async fn list_hidden_rows(&self) -> Result<Vec<crate::hidden_row::HiddenRow>> {
        not_impl!()
    }
    async fn add_hidden_row(
        &self,
        _id: &str,
        _row_id: &str,
    ) -> Result<crate::hidden_row::HiddenRow> {
        not_impl!()
    }
    async fn remove_hidden_row(&self, _row_id: &str) -> Result<()> {
        not_impl!()
    }

    async fn list_hidden_columns(&self) -> Result<Vec<crate::hidden_column::HiddenColumn>> {
        not_impl!()
    }
    async fn add_hidden_column(
        &self,
        _id: &str,
        _column_id: &str,
    ) -> Result<crate::hidden_column::HiddenColumn> {
        not_impl!()
    }
    async fn remove_hidden_column(&self, _column_id: &str) -> Result<()> {
        not_impl!()
    }

    async fn list_custom_columns(&self) -> Result<Vec<crate::custom_column::CustomColumn>> {
        not_impl!()
    }
    async fn upsert_custom_column(
        &self,
        _id: &str,
        _name: &str,
        _label: Option<&str>,
        _description: Option<&str>,
        _expression: Option<&str>,
        _position_after: Option<&str>,
    ) -> Result<crate::custom_column::CustomColumn> {
        not_impl!()
    }
    async fn delete_custom_column(&self, _id: &str) -> Result<()> {
        not_impl!()
    }

    async fn list_tables(&self) -> Result<Vec<crate::table::Table>> {
        not_impl!()
    }
    async fn create_table(
        &self,
        _id: &str,
        _title: &str,
        _description: Option<&str>,
        _who_created: Option<&str>,
    ) -> Result<crate::table::Table> {
        not_impl!()
    }
    async fn patch_table(
        &self,
        _id: &str,
        _title: Option<&str>,
        _description: Option<&str>,
        _who_last_modified: Option<&str>,
    ) -> Result<crate::table::Table> {
        not_impl!()
    }
    async fn delete_table(&self, _id: &str) -> Result<()> {
        not_impl!()
    }

    async fn list_repos(&self, _params: &RowQuery) -> Result<PagedResponse> {
        not_impl!()
    }
    async fn patch_row_value(
        &self,
        _table_id: &str,
        _row_id: &str,
        _col_id: &str,
        _value: serde_json::Value,
    ) -> Result<()> {
        not_impl!()
    }

    async fn append_ops_log(&self, _op: &str, _payload: serde_json::Value, _tx_id: Option<&str>) {}
}
