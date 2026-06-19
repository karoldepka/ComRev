"""Tools that let the LangGraph agent read live data from the Structable backend."""

import os
from typing import Optional

import httpx
from langchain_core.tools import tool

from structable_agent.cv_data import CV, filter_skills, search_cv, sort_skills
from structable_agent.domain_names import find_domain_names

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



# ── CV tools (no HTTP calls — data is embedded) ───────────────────────────────

@tool
def get_cv_overview() -> dict:
    """Return the top-level CV overview: name, title, location, and summary."""
    return {
        "name": CV["name"],
        "title": CV["title"],
        "email": CV["email"],
        "location": CV["location"],
        "github": CV["github"],
        "summary": CV["summary"],
    }


@tool
def get_cv_skills(
    keyword: Optional[str] = None,
    category: Optional[str] = None,
    proficiency: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: str = "asc",
) -> dict:
    """Return skills filtered and/or sorted.

    Args:
        keyword: Filter by keyword matching name, category, or tags (e.g. "java", "ai", "rust").
        category: Filter by category: Frontend, Backend, Language, Database, AI/ML, DevOps, Tools, Mobile.
        proficiency: Filter by level: expert, proficient, or familiar.
        sort_by: Sort field — one of: name, proficiency, years, category.
        sort_order: 'asc' or 'desc'.
    """
    skills = filter_skills(keyword=keyword, category=category, proficiency=proficiency)
    if sort_by:
        skills = sort_skills(skills, sort_by, sort_order)
    return {"count": len(skills), "skills": skills}


@tool
def search_cv_tool(query: str, sections: Optional[list[str]] = None) -> dict:
    """Keyword search across CV sections (skills, experience, projects, education).

    Args:
        query: Search term.
        sections: List of sections to search — 'skills', 'experience', 'projects', 'education', or 'all'.
    """
    return search_cv(query, sections)


@tool
def get_cv_experience(keyword: Optional[str] = None) -> dict:
    """Return work experience entries, optionally filtered by keyword in role, company, or technologies."""
    experience = CV["experience"]
    if keyword:
        q = keyword.lower()
        experience = [
            e for e in experience
            if q in e["company"].lower()
            or q in e["role"].lower()
            or q in e["description"].lower()
            or any(q in h.lower() for h in e.get("highlights", []))
            or any(q in t.lower() for t in e.get("technologies", []))
        ]
    return {"count": len(experience), "experience": experience}


@tool
def get_cv_education() -> dict:
    """Return education history."""
    return {"education": CV["education"]}


@tool
def get_cv_projects(keyword: Optional[str] = None) -> dict:
    """Return notable projects, optionally filtered by keyword in name, description, or technologies."""
    projects = CV["projects"]
    if keyword:
        q = keyword.lower()
        projects = [
            p for p in projects
            if q in p["name"].lower()
            or q in p["description"].lower()
            or any(q in t.lower() for t in p.get("technologies", []))
            or any(q in h.lower() for h in p.get("highlights", []))
        ]
    return {"count": len(projects), "projects": projects}


@tool
def get_skill_usage_matrix(category: Optional[str] = None, keyword: Optional[str] = None) -> dict:
    """Return a matrix of skills with project and experience counts.

    Ideal for 'how many projects use X' or 'make a table of database usage' requests.

    Args:
        category: Filter by category e.g. Database, Frontend, AI/ML, Language.
        keyword: Filter by keyword.
    """
    skills = filter_skills(keyword=keyword, category=category)
    matrix = []
    for skill in skills:
        name_lower = skill["name"].lower()
        proj_count = sum(
            1 for p in CV["projects"]
            if any(
                name_lower in t.lower() or t.lower() in name_lower
                for t in p.get("technologies", [])
            )
        )
        exp_count = sum(
            1 for e in CV["experience"]
            if any(
                name_lower in t.lower() or t.lower() in name_lower
                for t in e.get("technologies", [])
            )
        )
        matrix.append({
            "skill": skill["name"],
            "category": skill["category"],
            "proficiency": skill["proficiency"],
            "years": skill["years"],
            "projects": proj_count,
            "experiences": exp_count,
        })
    return {"count": len(matrix), "skills_usage": matrix}


CV_TOOLS = [get_cv_overview, get_cv_skills, search_cv_tool, get_cv_experience, get_cv_education, get_cv_projects, get_skill_usage_matrix]


# ── Domain-name research tools ───────────────────────────────────────────────

@tool
async def find_cool_domain_names(
    idea: str,
    extra_names: Optional[list[str]] = None,
    max_results: int = 10,
) -> dict:
    """Find cool .ai domain names and research whether they are usable.

    The generator is intentionally constrained:
    - TLDs are hardcoded to .ai for now.
    - Names must have at most 3 syllables.
    - Names must contain both letters I and T, e.g. InTek.

    Args:
        idea: Product, project, or vibe to generate names for.
        extra_names: Optional names or fragments to include in the candidate pool.
        max_results: Number of checked candidates to return, up to 20.

    Returns checked candidates with generated name, domain, syllable count, domain availability
    status, and Google result-count research when Google Custom Search env vars are configured.
    """
    return await find_domain_names(idea=idea, extra_names=extra_names, max_results=max_results)


DOMAIN_TOOLS = [find_cool_domain_names]

TOOLS = [list_tables, list_columns, query_rows, get_row, *CV_TOOLS, *DOMAIN_TOOLS]
