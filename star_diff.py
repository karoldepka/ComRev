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
# LOAD YAML
# =========================
def load_yaml_from_file(path: str) -> List[dict]:
    if not os.path.exists(path):
        return []
    with open(path, "r") as f:
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
# FIND OLD COMMIT
# =========================
def find_commit_n_hours_ago(repo: Repo, hours: int):
    target_time = datetime.now(timezone.utc) - timedelta(hours=hours)

    for commit in repo.iter_commits("main"):
        commit_time = datetime.fromtimestamp(commit.committed_date, tz=timezone.utc)

        if commit_time <= target_time:
            print(f"⏪ Found commit from {commit_time.isoformat()}")
            return commit

    print("⚠️ No commit old enough found")
    return None


# =========================
# BUILD INDEX
# =========================
def index_by_id(repos: List[dict]) -> Dict[int, dict]:
    return {r["id"]: r for r in repos if "id" in r}


# =========================
# COMPUTE DIFF
# =========================
def compute_star_diff(old: List[dict], new: List[dict]) -> List[dict]:
    old_index = index_by_id(old)
    new_index = index_by_id(new)

    result = []

    for repo_id, new_repo in new_index.items():
        old_repo = old_index.get(repo_id)

        old_stars = old_repo["stars"] if old_repo else 0
        new_stars = new_repo["stars"]

        diff = new_stars - old_stars

        if diff == 0:
            continue

        item = {
            "id": repo_id,
            "name": new_repo.get("name"),
            "url": new_repo.get("url"),
            "stars_before": old_stars,
            "stars_now": new_stars,
            "stars_diff": diff,
        }

        result.append(item)

    # sort by growth descending
    result.sort(key=lambda x: x["stars_diff"], reverse=True)

    return result


# =========================
# SAVE YAML
# =========================
def save_yaml(data: List[dict], path: str):
    with open(path, "w") as f:
        yaml.dump(data, f, sort_keys=False)


# =========================
# MAIN
# =========================
def generate_diff(hours: int = 6):
    print(f"📊 Generating star diff for last {hours} hours")

    repo = Repo(DATA_REPO_DIR)

    old_commit = find_commit_n_hours_ago(repo, hours)
    if not old_commit:
        return

    old_data = load_yaml_from_commit(repo, old_commit, CURRENT_YAML)
    new_data = load_yaml_from_file(CURRENT_YAML)

    print(f"📦 Old repos: {len(old_data)}")
    print(f"📦 New repos: {len(new_data)}")

    diff = compute_star_diff(old_data, new_data)

    print(f"🔥 {len(diff)} repos changed")

    save_yaml(diff, OUTPUT_YAML)
    print(f"💾 Saved diff → {OUTPUT_YAML}")


if __name__ == "__main__":
    generate_diff(hours=6)