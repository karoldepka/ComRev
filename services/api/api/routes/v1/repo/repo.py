from fastapi import APIRouter, Query
from typing import List, Optional
from .store import load_repos
from .schema import Repo

router = APIRouter(prefix="/repo", tags=["repos"])


@router.get("/", response_model=List[Repo])
def get_repos(
    search: Optional[str] = None,
    language: Optional[str] = None,
    topics_includes: Optional[List[str]] = Query(None),

    min_stars: Optional[int] = None,
    max_stars: Optional[int] = None,

    sort_by: str = "stars",
    sort_dir: str = "desc",

    limit: int = 50,
    offset: int = 0,
):

    repos = load_repos()

    def match(r: Repo):

        if language and r.language != language:
            return False

        if min_stars and r.stars < min_stars:
            return False

        if max_stars and r.stars > max_stars:
            return False

        if topics_includes:
            if not all(t in r.topics for t in topics_includes):
                return False

        if search:
            s = search.lower()
            if s not in r.name.lower() and s not in (r.description or "").lower():
                return False

        return True

    repos = list(filter(match, repos))

    reverse = sort_dir == "desc"
    repos.sort(key=lambda r: getattr(r, sort_by), reverse=reverse)

    return repos[offset: offset + limit]
    
    