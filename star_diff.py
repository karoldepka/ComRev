#!/usr/bin/env python3

import os
import yaml
from datetime import datetime, timezone, timedelta
from git import Repo
from typing import Dict, List, Optional

from utils.measure_time import measure_time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_REPO_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "ComRev_Data"))

CURRENT_YAML = os.path.join(DATA_REPO_DIR, "repos.yaml")
OUTPUT_YAML = os.path.join(DATA_REPO_DIR, "repos_diff.yaml")


# =========================
# CONFIG
# =========================

# If historical snapshot for a window is missing:
# True  -> diff = 0
# False -> diff = current_stars
MISSING_AS_ZERO = True

TIME_WINDOWS = {
    "6h": timedelta(hours=6),
    "12h": timedelta(hours=12),
    "24h": timedelta(hours=24),
    "48h": timedelta(hours=48),
    "5d": timedelta(days=5),
    "7d": timedelta(days=7),
    "14d": timedelta(days=14),
}


# =========================
# YAML
# =========================
@measure_time
def load_yaml_from_file(path: str) -> List[dict]:
    if not os.path.exists(path):
        return []

    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or []


def load_yaml_from_commit(
    commit,
    file_path: str,
) -> List[dict]:
    try:
        rel_path = os.path.relpath(file_path, DATA_REPO_DIR)
        blob = commit.tree / rel_path

        content = blob.data_stream.read().decode("utf-8")

        return yaml.safe_load(content) or []

    except Exception:
        return []


@measure_time
def save_yaml(data: List[dict], path: str):
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(
            data,
            f,
            sort_keys=False,
            allow_unicode=True,
        )


# =========================
# GIT
# =========================
@measure_time
def find_commit_before(
    repo: Repo,
    delta: timedelta,
):
    target_time = datetime.now(timezone.utc) - delta

    for commit in repo.iter_commits("master"):
        commit_time = datetime.fromtimestamp(
            commit.committed_date,
            tz=timezone.utc,
        )

        if commit_time <= target_time:
            print(f"⏪ Found commit ({delta}) → {commit_time.isoformat()}")
            return commit

    print(f"⚠️ No commit found for window {delta}")
    return None


@measure_time
def build_old_snapshots(
    repo: Repo,
) -> Dict[str, Dict[int, dict]]:
    snapshots = {}

    for label, delta in TIME_WINDOWS.items():
        commit = find_commit_before(repo, delta)

        if not commit:
            snapshots[label] = {}
            continue

        old_data = load_yaml_from_commit(
            commit,
            CURRENT_YAML,
        )

        snapshots[label] = index_by_id(old_data)

    return snapshots


# =========================
# REPO HELPERS
# =========================
def index_by_id(
    repos: List[dict],
) -> Dict[int, dict]:
    return {
        repo["id"]: repo
        for repo in repos
        if "id" in repo
    }


def compute_star_diff(
    stars_now: int,
    old_repo: Optional[dict],
) -> int:
    if old_repo is None:
        return 0 if MISSING_AS_ZERO else stars_now

    old_stars = old_repo.get("stars", 0)

    return stars_now - old_stars


def build_repo_diffs(
    repo_id: int,
    stars_now: int,
    snapshots: Dict[str, Dict[int, dict]],
) -> Dict[str, int]:
    diffs = {}

    for label in TIME_WINDOWS.keys():
        old_repo = snapshots[label].get(repo_id)

        diffs[label] = compute_star_diff(
            stars_now,
            old_repo,
        )

    return diffs


def has_any_change(
    diffs: Dict[str, int],
) -> bool:
    return any(diff != 0 for diff in diffs.values())


def build_output_repo(
    repo_data: dict,
    stars_now: int,
    diffs: Dict[str, int],
) -> dict:
    return {
        **repo_data,
        "stars_now": stars_now,
        "stars_diff": diffs,
    }


def sort_repos(
    repos: List[dict],
):
    repos.sort(
        key=lambda repo: (
            repo["stars_diff"]["48h"],
            repo["stars_diff"]["24h"],
            repo["stars_now"],
        ),
        reverse=True,
    )


# =========================
# MAIN DIFF LOGIC
# =========================
@measure_time
def compute_all_diffs(
    repo: Repo,
    new_data: List[dict],
) -> List[dict]:
    new_index = index_by_id(new_data)

    old_snapshots = build_old_snapshots(repo)

    result = []

    for repo_id, repo_data in new_index.items():
        stars_now = repo_data.get("stars", 0)

        diffs = build_repo_diffs(
            repo_id,
            stars_now,
            old_snapshots,
        )

        if not has_any_change(diffs):
            continue

        result.append(
            build_output_repo(
                repo_data,
                stars_now,
                diffs,
            )
        )

    sort_repos(result)

    return result


# =========================
# MAIN
# =========================
@measure_time
def generate_multi_diff():
    print("📊 Generating multi-window star diffs")

    repo = Repo(DATA_REPO_DIR)

    new_data = load_yaml_from_file(CURRENT_YAML)

    print(f"📦 Current repos: {len(new_data)}")

    result = compute_all_diffs(
        repo,
        new_data,
    )

    print(f"🔥 {len(result)} repos changed")

    save_yaml(result, OUTPUT_YAML)

    print(f"💾 Saved → {OUTPUT_YAML}")


if __name__ == "__main__":
    generate_multi_diff()