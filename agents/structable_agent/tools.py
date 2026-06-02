"""Tools that let the LangGraph agent read live data from the Structable backend."""

import os
from typing import Optional

import httpx
from langchain_core.tools import tool

_BACKEND = os.getenv("STRUCTABLE_BACKEND_URL", "http://localhost:3001")


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=_BACKEND, timeout=10.0)


@tool
async def list_tables() -> list[dict]:
    """Return all tables registered in Structable (id, title, description)."""
    async with _client() as c:
        r = await c.get("/tables")
        r.raise_for_status()
        return r.json()


@tool
async def list_columns(table_id: str) -> list[dict]:
    """Return column definitions for a table (id, title, types, source_path, is_group, parent_ids)."""
    async with _client() as c:
        r = await c.get(f"/tables/{table_id}/custom-columns")
        r.raise_for_status()
        return r.json()


@tool
async def query_rows(
    table_id: str,
    sort: Optional[str] = None,
    filter_col: Optional[str] = None,
    filter_op: Optional[str] = None,
    filter_val: Optional[str] = None,
    per_page: int = 20,
    page: int = 1,
) -> dict:
    """Query rows from a Structable table.

    Args:
        table_id: Table to query (e.g. "github_repos").
        sort: Column id to sort by, prefix with '-' for descending (e.g. "stars_diff.7d" or "-stars").
        filter_col: Column id to filter on.
        filter_op: Filter operator — one of: eq, neq, gt, gte, lt, lte, contains, starts_with.
        filter_val: Value to compare against.
        per_page: Rows per page (max 100).
        page: 1-based page number.

    Returns a PagedResponse: { data: [...], total: N, page: N, per_page: N }.
    """
    params: dict = {"per_page": min(per_page, 100), "page": page}
    if sort:
        params["sort"] = sort
    if filter_col and filter_op and filter_val is not None:
        params[f"filter[{filter_col}][{filter_op}]"] = filter_val

    async with _client() as c:
        r = await c.get(f"/tables/{table_id}/data-rows", params=params)
        r.raise_for_status()
        return r.json()


@tool
async def get_row(table_id: str, row_id: str) -> dict:
    """Fetch a single row by id from a Structable table (returns its full custom_values)."""
    # The REST API doesn't have a single-row endpoint yet; fetch page 1 and find the row.
    result = await query_rows.ainvoke(
        {"table_id": table_id, "filter_col": "id", "filter_op": "eq", "filter_val": row_id, "per_page": 1}
    )
    rows = result.get("data", [])
    if not rows:
        return {"error": f"Row {row_id} not found in {table_id}"}
    return rows[0]


TOOLS = [list_tables, list_columns, query_rows, get_row]
