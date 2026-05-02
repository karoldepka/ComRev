#!/data/data/com.termux/files/usr/bin/python
import asyncio
import os
from dataclasses import asdict

from dotenv import load_dotenv
from git import Repo, GitCommandError

from fetcher import fetch_repos
from storage_yaml import save_yaml


load_dotenv()

GITHUB_PAT = os.getenv("GH_PAT")

TOPICS = ["frontend"]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_REPO_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "ComRev_Data"))

REPO_HTTPS = "https://github.com/karoldepkap/ComRev_Data.git"

YAML_PATH = os.path.join(DATA_REPO_DIR, "repos.yaml")


# =========================
# BUILD AUTH URL
# =========================
def build_auth_repo_url():
    if not GITHUB_PAT:
        raise RuntimeError("GITHUB_PAT is required")

    return REPO_HTTPS.replace(
        "https://",
        f"https://x-access-token:{GITHUB_PAT}@",
    )


# =========================
# CLONE / LOAD REPO
# =========================
def ensure_git_repo() -> Repo:
    repo_url = build_auth_repo_url()

    try:
        if not os.path.exists(DATA_REPO_DIR):
            print(f"📥 Cloning repo → {DATA_REPO_DIR}")
            return Repo.clone_from(repo_url, DATA_REPO_DIR)

        if not os.path.exists(os.path.join(DATA_REPO_DIR, ".git")):
            raise RuntimeError(
                f"{DATA_REPO_DIR} exists but is not a git repository"
            )

        print("📁 Using existing repo")
        repo = Repo(DATA_REPO_DIR)

        # enforce authenticated remote
        repo.remotes.origin.set_url(repo_url)

        return repo

    except GitCommandError as e:
        print("❌ Git command failed during setup")
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        raise

    except Exception:
        raise


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
            print("🔄 Pulling latest changes (rebase)...")
            repo.git.pull("--rebase")
        except GitCommandError as e:
            print("⚠️ Pull failed (continuing)")
            print("STDERR:", e.stderr)

        print("🚀 Pushing changes...")
        repo.remotes.origin.push()
        print("✅ Git push complete")

    except GitCommandError as e:
        print("❌ Git command failed during commit/push")
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        raise

    except Exception:
        raise


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

    await asyncio.to_thread(
        git_commit_and_push, repo, YAML_PATH, len(data)
    )

    print("✅ Pipeline complete")


if __name__ == "__main__":
    asyncio.run(main())
