import asyncio

from fetcher import fetch_repos
from storage import upsert_repos


TOPICS = ["frontend", "backend", "android"]


async def main():
    print("🚀 Starting GitHub fetch pipeline...")

    repos = await fetch_repos(TOPICS)

    print(f"📦 Fetched {len(repos)} repos")

    if not repos:
        print("⚠️ No data to store")
        return

    
    # upsert_repos(repos)

    print("✅ Stored to Supabase successfully")


if __name__ == "__main__":
    asyncio.run(main())
