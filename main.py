import asyncio
from dataclasses import asdict

from fetcher import fetch_repos
from storage import upsert_repos
from storage_yaml import save_yaml


TOPICS = ["frontend"] #, "backend", "android"]

# Change this if you want different location
YAML_PATH = "data-repo/repos.yaml"


async def main():
    print("🚀 Starting GitHub fetch pipeline...")
    print("🔍 Topics:", ", ".join(TOPICS))

    repos = await fetch_repos(TOPICS)

    print(f"📦 Fetched {len(repos)} repos")

    if not repos:
        print("⚠️ No data found")
        return

    # ✅ Convert dataclasses safely (slots-compatible)
    data = [asdict(r) for r in repos]

    # ✅ Save YAML snapshot
    save_yaml(data, YAML_PATH)
    print(f"💾 YAML saved → {YAML_PATH}")

    # ✅ Push to Supabase
    upsert_repos(repos)
    print("📡 Uploaded to Supabase")

    print("✅ Pipeline complete")


if __name__ == "__main__":
    asyncio.run(main())

