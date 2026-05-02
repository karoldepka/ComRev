import asyncio
import subprocess
from dataclasses import asdict

from fetcher import fetch_repos
from storage import upsert_repos
from storage_yaml import save_yaml


TOPICS = ["frontend"]  # , "backend", "android"]

YAML_PATH = "data-repo/repos.yaml"
COMMIT_MESSAGE = "chore: update repo snapshot"


def git_commit_and_push(file_path: str):
    try:
        # Add file
        subprocess.run(["git", "add", file_path], check=True)

        # Commit (will fail if no changes)
        result = subprocess.run(
            ["git", "commit", "-m", COMMIT_MESSAGE],
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
        subprocess.run(["git", "push"], check=True)
        print("🚀 Git push complete")

    except Exception as e:
        print(f"⚠️ Git operation failed: {e}")


async def main():
    print("🚀 Starting GitHub fetch pipeline...")
    print("🔍 Topics:", ", ".join(TOPICS))

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

    # Commit + push YAML
    git_commit_and_push(YAML_PATH)

    # Upload to Supabase
    upsert_repos(repos)
    print("📡 Uploaded to Supabase")

    print("✅ Pipeline complete")


if __name__ == "__main__":
    asyncio.run(main())
