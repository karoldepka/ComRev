#!/usr/bin/env python3

import os
import time
import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from models import Repo
from tenacity import retry, stop_after_attempt, wait_exponential

from github_topics import TOPICS


GITHUB_API = "https://api.github.com/search/repositories"


# =========================
# Time filtering
# =========================
def within_48h(ts: str) -> bool:
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return datetime.now(timezone.utc) - dt <= timedelta(hours=48)


# =========================
# Rate limit handling
# =========================
def print_rate_limit(headers: httpx.Headers):
    remaining = headers.get("X-RateLimit-Remaining")
    limit = headers.get("X-RateLimit-Limit")

    if remaining and limit:
        print(f"[RateLimit] {remaining}/{limit}")


def handle_rate_limit(headers: httpx.Headers):
    remaining = headers.get("X-RateLimit-Remaining")
    reset = headers.get("X-RateLimit-Reset")

    if remaining == "0":
        print("[RateLimit] Exhausted")
        sleep_until_reset(reset)
        raise RuntimeError("Rate limit hit")


def print_reset_time(headers: httpx.Headers):
    reset = headers.get("X-RateLimit-Reset")
    if reset:
        reset_time = datetime.fromtimestamp(int(reset), tz=timezone.utc)
        print(f"[RateLimit Reset] {reset_time.isoformat()}")


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
        GITHUB_API,
        params={
            "q": query,
            "sort": "stars",
            "order": "desc",
            "per_page": 100,
            "page": page,
        },
    )

    print_rate_limit(r.headers)
    print_reset_time(r.headers)
    handle_rate_limit(r.headers)

    if r.status_code != 200:
        print(f"[GitHub {r.status_code}] query={query} page={page}")
        print(r.text[:200])
        return {"items": []}

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
    return datetime.now(timezone.utc) - dt <= timedelta(hours=48)


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