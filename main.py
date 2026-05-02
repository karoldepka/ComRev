#!/data/data/com.termux/files/usr/bin/python
import asyncio
import os
from dataclasses import asdict

from dotenv import load_dotenv
from git import Repo, GitCommandError

from fetcher import fetch_repos
from storage_yaml import save_yaml


load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

TOPICS = ["frontend"]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_REPO_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "ComRev_Data"))

REPO_HTTPS = "https://github.com/karoldepkap/ComRev_Data.git"

YAML_PATH = os.path.join(DATA_REPO_DIR, "repos.yaml")


# =========================
# BUILD AUTH URL
# =========================
def build_auth_repo_url():
    if not GITHUB_TOKEN:
        raise RuntimeError("GITHUB_TOKEN is required")

    ret = REPO_HTTPS.replace(
        "https://",
        f"https://x-access-token:{GITHUB_TOKEN}@",
    )    
    print(f"ret:{ret}")
    return ret

# =========================
# CLONE / LOAD REPO
# =========================
def ensure_git_repo() -> Repo:
    try:
        auth_url = build_auth_repo_url()

        if not os.path.exists(DATA_REPO_DIR):
            print("📥 Cloning repo...")
            repo = Repo.clone_from(auth_url, DATA_REPO_DIR)
            print("✅ Repo cloned")
            return repo

        if not os.path.exists(os.path.join(DATA_REPO_DIR, ".git")):
            raise RuntimeError("Directory exists but is not a git repo")

        print("📁 Using existing repo")
        repo = Repo(DATA_REPO_DIR)

        # ensure remote uses token
        repo.remotes.origin.set_url(auth_url)

        return repo

    except Exception as e:
        raise RuntimeError(f"Git setup failed: {e}")


# =========================
# COMMIT + PUSH
# =========================
def git_commit_and_push(repo: Repo, file_path: str, count: int):
    try:
        rel_path = os.path.relpath(file_path, DATA_REPO_DIR)

        repo.index.add([rel_path])

        if not repo.is_dirty(untracked_files=True):
            print("ℹ️ No changes to commit")
            return

        commit_message = f"chore: update repos ({count} items)"
        repo.index.commit(commit_message)
        print("📝 Git commit created")

        # avoid CI conflicts
        try:
            repo.git.pull("--rebase")
        except Exception:
            print("ℹ️ Pull skipped or failed")

        repo.remotes.origin.push()
        print("🚀 Git push complete")

    except GitCommandError as e:
        print(f"⚠️ Git command failed: {e}")
    except Exception as e:
        print(f"⚠️ Git operation failed: {e}")


# =========================
# MAIN
# =========================
async def main():
    print("🚀 Starting GitHub fetch pipeline...")

    repo = ensure_git_repo()

    repos = await fetch_repos(TOPICS)
    print(f"📦 Fetched {len(repos)} repos")

    if not repos:
        print("⚠️ No data found")
        return

    data = [asdict(r) for r in repos]

    save_yaml(data, YAML_PATH)
    print(f"💾 YAML saved → {YAML_PATH}")

    await asyncio.to_thread(git_commit_and_push, repo, YAML_PATH, len(data))

    print("✅ Pipeline complete")


if __name__ == "__main__":
    asyncio.run(main())
