import os
import time
import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from models import Repo
from tenacity import retry, stop_after_attempt, wait_exponential

from github_topics import TOPICS, HARDCODED_REPOS


GITHUB_API_SEARCH_REPOS = "https://api.github.com/search/repositories"
GITHUB_REPO_API = "https://api.github.com/repos"


# =========================
# Rate limit handling
# =========================
def print_rate_limit(headers: httpx.Headers):
    remaining = headers.get("X-RateLimit-Remaining")
    limit = headers.get("X-RateLimit-Limit")
    reset = headers.get("X-RateLimit-Reset")

    if remaining and limit:
        output = f"[RateLimit] {remaining}/{limit}"
        if reset:
            reset_time = datetime.fromtimestamp(int(reset), tz=timezone.utc)
            output += f" reset={reset_time.isoformat()}"
        print(output)


def handle_rate_limit(headers: httpx.Headers):
    remaining = headers.get("X-RateLimit-Remaining")
    reset = headers.get("X-RateLimit-Reset")

    if remaining == "0":
        print("[RateLimit] Exhausted")
        sleep_until_reset(reset)
        raise RuntimeError("Rate limit hit")


def sleep_until_reset(reset_ts: Optional[str]):
    if not reset_ts:
        print("[RateLimit] No reset header, sleeping 60s fallback")
        time.sleep(60)
        return

    reset_time = datetime.fromtimestamp(int(reset_ts), tz=timezone.utc)
    now = datetime.now(timezone.utc)

    wait_seconds = (reset_time - now).total_seconds()

    if wait_seconds > 0:
        print(
            f"[RateLimit] Sleeping until reset: "
            f"{reset_time.isoformat()} ({int(wait_seconds)}s)"
        )
        time.sleep(wait_seconds + 2)


# =========================
# GitHub request
# =========================
def build_query(topic: str) -> str:
    return f"topic:{topic}"


async def github_request(client: httpx.AsyncClient, query: str, page: int):
    r = await client.get(
        GITHUB_API_SEARCH_REPOS,
        params={
            "q": query,
            "sort": "stars",
            "order": "desc",
            "per_page": 100,
            "page": page,
        },
    )

    print_rate_limit(r.headers)
    handle_rate_limit(r.headers)

    if r.status_code != 200:
        print(f"[GitHub {r.status_code}] query={query} page={page}")
        print(r.text[:200])
        return {"items": []}

    return r.json()


def normalize_owner_repo(owner_repo: str) -> str:
    if owner_repo.startswith("https://github.com/"):
        owner_repo = owner_repo[len("https://github.com/"):]
    elif owner_repo.startswith("http://github.com/"):
        owner_repo = owner_repo[len("http://github.com/"):]

    # Strip query params and fragments
    if "?" in owner_repo:
        owner_repo = owner_repo.split("?", 1)[0]
    if "#" in owner_repo:
        owner_repo = owner_repo.split("#", 1)[0]

    # Keep only owner/repo, ignore extra path segments
    parts = [segment for segment in owner_repo.split("/") if segment]
    owner_repo = "/".join(parts[:2])

    return owner_repo


async def github_repo_request(client: httpx.AsyncClient, owner_repo: str):
    owner_repo = normalize_owner_repo(owner_repo)
    r = await client.get(f"{GITHUB_REPO_API}/{owner_repo}")

    print_rate_limit(r.headers)
    handle_rate_limit(r.headers)

    if r.status_code != 200:
        print(f"[GitHub {r.status_code}] repo={owner_repo}")
        print(r.text[:200])
        return None

    return r.json()


# =========================
# Repo parsing
# =========================
def parse_repo(r: dict) -> Repo:
    return Repo(
        id=r["id"],
        name=r["full_name"],
        url=r["html_url"],
        stars=r["stargazers_count"],
        pushed_at=r["pushed_at"],
        description=r.get("description"),
        language=r.get("language"),

        forks=r.get("forks_count", 0),
        open_issues=r.get("open_issues_count", 0),
        watchers=r.get("watchers_count", 0),

        owner_login=r.get("owner", {}).get("login"),
        owner_avatar=r.get("owner", {}).get("avatar_url"),
        owner_url=r.get("owner", {}).get("html_url"),

        topics=r.get("topics", []),
        license=(r.get("license") or {}).get("spdx_id"),
        homepage=r.get("homepage"),
        default_branch=r.get("default_branch", "main"),

        archived=r.get("archived", False),
        disabled=r.get("disabled", False),

        created_at=r.get("created_at"),
        updated_at=r.get("updated_at"),

        size=r.get("size"),
        visibility=r.get("visibility"),
        has_issues=r.get("has_issues", True),
        has_projects=r.get("has_projects", True),
        has_wiki=r.get("has_wiki", True),
        has_pages=r.get("has_pages", False),
        has_downloads=r.get("has_downloads", True),
    )


def is_recent_repo(r: dict) -> bool:
    dt = datetime.fromisoformat(r["pushed_at"].replace("Z", "+00:00"))
    return datetime.now(timezone.utc) - dt <= timedelta(hours=48*30)


# =========================
# Topic logging
# =========================
def log_topic(i: int, total: int, topic: str):
    print(f"\n[{i}/{total}] Topic: {topic}")


# =========================
# Main fetch logic
# =========================
@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=1, max=8))
async def fetch_page(client: httpx.AsyncClient, query: str, page: int):
    return await github_request(client, query, page)


@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=1, max=8))
async def fetch_repo(client: httpx.AsyncClient, owner_repo: str):
    return await github_repo_request(client, owner_repo)


async def fetch_repos(topics: List[str] = TOPICS) -> List[Repo]:
    headers = {
        "Accept": "application/vnd.github.mercy-preview+json"
    }

    # =========================
    # GITHUB TOKEN INFO
    # =========================
    token = os.getenv("GITHUB_TOKEN")

    if token:
        masked = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "***"
        print(f"[GitHub] Token: PRESENT ({masked})")
        headers["Authorization"] = f"Bearer {token}"
    else:
        print("[GitHub] Token: ABSENT → low rate limits apply")

    repos: Dict[int, Repo] = {}
    total = len(topics)

    async with httpx.AsyncClient(timeout=20, headers=headers, http2=False) as client:
        if HARDCODED_REPOS:
            print("\n📌 Adding hardcoded repository list")
            for owner_repo in HARDCODED_REPOS:
                print(f"Fetching hardcoded repo: {owner_repo}")
                try:
                    data = await fetch_repo(client, owner_repo)
                except RuntimeError:
                    data = await fetch_repo(client, owner_repo)

                if not data:
                    continue

                repo = parse_repo(data)
                repos[repo.id] = repo

        for i, topic in enumerate(topics, start=1):
            log_topic(i, total, topic)

            query = build_query(topic)

            for page in range(1, 3):
                try:
                    data = await fetch_page(client, query, page)
                except RuntimeError:
                    data = await fetch_page(client, query, page)

                items = data.get("items", [])
                if not items:
                    break

                found_recent = False

                for r in items:
                    if not is_recent_repo(r):
                        continue

                    found_recent = True
                    repo = parse_repo(r)
                    repos[repo.id] = repo

                if not found_recent:
                    break



    return sorted(repos.values(), key=lambda x: x.stars, reverse=True)