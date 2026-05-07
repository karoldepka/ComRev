#!/usr/bin/env python3

import os
import yaml
from datetime import datetime, timezone, timedelta
from git import Repo
from typing import Dict, List

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_REPO_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "ComRev_Data"))

CURRENT_YAML = os.path.join(DATA_REPO_DIR, "repos.yaml")
OUTPUT_YAML = os.path.join(DATA_REPO_DIR, "repos_diff.yaml")


# =========================
# CONFIG: TIME WINDOWS
# =========================
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
# LOAD YAML
# =========================
def load_yaml_from_file(path: str) -> List[dict]:
    if not os.path.exists(path):
        return []

    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or []


def load_yaml_from_commit(repo: Repo, commit, file_path: str) -> List[dict]:
    try:
        rel_path = os.path.relpath(file_path, DATA_REPO_DIR)
        blob = commit.tree / rel_path
        content = blob.data_stream.read().decode("utf-8")
        return yaml.safe_load(content) or []
    except Exception:
        return []


# =========================
# FIND COMMIT BEFORE DELTA
# =========================
def find_commit_before(repo: Repo, delta: timedelta):
    target_time = datetime.now(timezone.utc) - delta

    for commit in repo.iter_commits("master"):
        commit_time = datetime.fromtimestamp(
            commit.committed_date, tz=timezone.utc
        )

        if commit_time <= target_time:
            print(f"⏪ Found commit ({delta}) → {commit_time.isoformat()}")
            return commit

    print(f"⚠️ No commit found for window {delta}")
    return None


# =========================
# INDEX
# =========================
def index_by_id(repos: List[dict]) -> Dict[int, dict]:
    return {r["id"]: r for r in repos if "id" in r}


# =========================
# COMPUTE ALL DIFFS
# =========================
def compute_all_diffs(repo: Repo, new_data: List[dict]) -> List[dict]:
    new_index = index_by_id(new_data)

    # preload snapshots for each window
    old_snapshots: Dict[str, Dict[int, dict]] = {}

    for label, delta in TIME_WINDOWS.items():
        commit = find_commit_before(repo, delta)

        if not commit:
            old_snapshots[label] = {}
            continue

        old_data = load_yaml_from_commit(repo, commit, CURRENT_YAML)
        old_snapshots[label] = index_by_id(old_data)

    result = []

    for repo_id, new_repo in new_index.items():
        stars_now = new_repo.get("stars", 0)

        diffs = {}
        has_change = False

        for label in TIME_WINDOWS.keys():
            old_repo = old_snapshots[label].get(repo_id)
            old_stars = old_repo["stars"] if old_repo else 0

            diff = stars_now - old_stars
            diffs[label] = diff

            if diff != 0:
                has_change = True

        # skip repos with no changes at all
        if not has_change:
            continue

        item = {
            # full repo metadata
            **new_repo,

            # normalized fields
            "stars_now": stars_now,

            # diffs per period
            "stars_diff": diffs,
        }

        result.append(item)

    # sort by strongest short-term growth (6h)
    result.sort(key=lambda x: x["stars_diff"]["6h"], reverse=True)

    return result


# =========================
# SAVE YAML
# =========================
def save_yaml(data: List[dict], path: str):
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(
            data,
            f,
            sort_keys=False,
            allow_unicode=True,
        )


# =========================
# MAIN
# =========================
def generate_multi_diff():
    print("📊 Generating multi-window star diffs")

    repo = Repo(DATA_REPO_DIR)

    new_data = load_yaml_from_file(CURRENT_YAML)
    print(f"📦 Current repos: {len(new_data)}")

    result = compute_all_diffs(repo, new_data)

    print(f"🔥 {len(result)} repos changed")

    save_yaml(result, OUTPUT_YAML)
    print(f"💾 Saved → {OUTPUT_YAML}")


if __name__ == "__main__":
    generate_multi_diff()
