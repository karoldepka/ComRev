import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, List

from models import Repo
from tenacity import retry, stop_after_attempt, wait_exponential


GITHUB_API = "https://api.github.com/search/repositories"


def within_48h(ts: str) -> bool:
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return datetime.now(timezone.utc) - dt <= timedelta(hours=48)


@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=1, max=8))
async def fetch_page(client: httpx.AsyncClient, query: str, page: int):
    r = await client.get(
        GITHUB_API,
        params={
            "q": query,
            "sort": "stars",
            "order": "desc",
            "per_page": 50,
            "page": page,
        },
    )
    r.raise_for_status()
    return r.json()


async def fetch_repos(topics: list[str]) -> list[Repo]:
    headers = {}

    token = None  # optional: os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    repos: Dict[int, Repo] = {}

    async with httpx.AsyncClient(timeout=20, headers=headers, http2=False) as client:
        for topic in topics:
            query = f"topic:{topic}"

            for page in range(1, 3):  # keep lightweight for Termux
                data = await fetch_page(client, query, page)
                items = data.get("items", [])

                if not items:
                    break

                found_recent = False

                for r in items:
                    if not within_48h(r["pushed_at"]):
                        continue

                    found_recent = True

                    repos[r["id"]] = Repo(
                        id=r["id"],
                        name=r["full_name"],
                        url=r["html_url"],
                        stars=r["stargazers_count"],
                        pushed_at=r["pushed_at"],
                        description=r.get("description"),
                        language=r.get("language"),
                    )

                if not found_recent:
                    break

    return sorted(repos.values(), key=lambda x: x.stars, reverse=True)

