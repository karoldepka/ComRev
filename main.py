#!/data/data/com.termux/files/usr/bin/python
import asyncio
import os
import subprocess
from dataclasses import asdict

from dotenv import load_dotenv

from fetcher import fetch_repos
from storage import upsert_repos
from storage_yaml import save_yaml


# Load secrets from .env (if present)
load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


TOPICS = [
    # core dev
    "frontend",
    "backend",
    "fullstack",
    "api",
    "microservices",

    # mobile
    "android",
    "ios",
    "react-native",
    "flutter",

    # low-code / no-code
    "nocode",
    "lowcode",
    "automation",
    "workflow",

    # data / AI
    "machine-learning",
    "ai",
    "llm",
    "vector-database",
    "data-engineering",

    # infra / devops
    "devops",
    "kubernetes",
    "docker",
    "ci-cd",
    "terraform",

    # web ecosystem
    "nextjs",
    "react",
    "vue",
    "svelte",

    # emerging / indie dev
    "indie-hacking",
    "saas",
    "boilerplate",
    "starter-template",
    
    
]

# Nested git repo config
DATA_REPO_DIR = "data-repo"
DATA_REPO_GIT = "data-repo/.git"

YAML_PATH = os.path.join(DATA_REPO_DIR, "repos.yaml")


def git_commit_and_push(file_path: str, count: int):
    try:
        rel_path = os.path.relpath(file_path, DATA_REPO_DIR)

        base_cmd = [
            "git",
            f"--git-dir={DATA_REPO_GIT}",
            f"--work-tree={DATA_REPO_DIR}",
        ]

        commit_message = f"chore: update repos ({count} items)"

        # Add file
        subprocess.run(base_cmd + ["add", rel_path], check=True)

        # Commit
        result = subprocess.run(
            base_cmd + ["commit", "-m", commit_message],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            if "nothing to commit" in result.stderr.lower():
                print("ℹ️ No changes to commit")
                return
            else:
                raise RuntimeError(result.stderr)

        print("📝 Git commit created")

        # Push
        subprocess.run(base_cmd + ["push"], check=True)
        print("🚀 Git push complete")

    except Exception as e:
        print(f"⚠️ Git operation failed: {e}")


async def main():
    print("🚀 Starting GitHub fetch pipeline...")
    print("🔍 Topics:", ", ".join(TOPICS))

    if not GITHUB_TOKEN:
        print("⚠️ Warning: GITHUB_TOKEN not set (rate limits may apply)")

    repos = await fetch_repos(TOPICS)

    print(f"📦 Fetched {len(repos)} repos")

    if not repos:
        print("⚠️ No data found")
        return

    # Convert dataclasses → dict
    data = [asdict(r) for r in repos]

    # Save YAML snapshot
    save_yaml(data, YAML_PATH)
    print(f"💾 YAML saved → {YAML_PATH}")

    # Git commit + push (non-blocking)
    await asyncio.to_thread(git_commit_and_push, YAML_PATH, len(data))

    # Push to Supabase (if configured)
    if SUPABASE_URL and SUPABASE_KEY:
        upsert_repos(repos)
        print("📡 Uploaded to Supabase")
    else:
        print("⚠️ Supabase not configured, skipping upload")

    print("✅ Pipeline complete")


if __name__ == "__main__":
    asyncio.run(main())
