import os
import httpx
from typing import List

from models import Repo


def upsert_repos(repos: List[Repo]) -> None:
    url = f"{os.environ['SUPABASE_URL']}/rest/v1/github_repos"

    headers = {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    payload = [
        {
            "id": r.id,
            "name": r.name,
            "url": r.url,
            "stars": r.stars,
            "pushed_at": r.pushed_at,
            "description": r.description,
            "language": r.language,
        }
        for r in repos
    ]

    with httpx.Client(timeout=20) as client:
        r = client.post(url, json=payload, headers=headers)
        r.raise_for_status()
