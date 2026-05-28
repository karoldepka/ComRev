import os
from datetime import datetime, timezone
from typing import List

import httpx

from models import Repo


def _repo_to_row(r: Repo) -> dict:
    return {
        "id": str(r.id),  # github_id as stable TEXT primary key
        "custom_values": {
            "github_id": r.id,
            "name": r.name,
            "url": r.url,
            "description": r.description,
            "homepage": r.homepage,
            "stars": r.stars,
            "forks": r.forks,
            "open_issues": r.open_issues,
            "watchers": r.watchers,
            "size": r.size,
            "language": r.language,
            "license": r.license,
            "topics": r.topics,
            "visibility": r.visibility,
            "default_branch": r.default_branch,
            "archived": r.archived,
            "disabled": r.disabled,
            "has_issues": r.has_issues,
            "has_projects": r.has_projects,
            "has_wiki": r.has_wiki,
            "has_pages": r.has_pages,
            "has_downloads": r.has_downloads,
            "pushed_at": r.pushed_at,
            "github_created_at": r.created_at,
            "github_updated_at": r.updated_at,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "owner_login": r.owner_login,
            "owner_avatar": r.owner_avatar,
            "owner_url": r.owner_url,
        },
    }


def upsert_repos(repos: List[Repo]) -> None:
    url = f"{os.environ['SUPABASE_URL']}/rest/v1/github_repos"

    headers = {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    payload = [_repo_to_row(r) for r in repos]

    with httpx.Client(timeout=20) as client:
        response = client.post(url, json=payload, headers=headers)
        response.raise_for_status()
