from typing import Optional, List, Literal
from pydantic import BaseModel


class RepoFilter(BaseModel):
    search: Optional[str] = None

    language: Optional[str] = None
    license: Optional[str] = None
    owner: Optional[str] = None

    topics_includes: Optional[List[str]] = None

    archived: Optional[bool] = None
    disabled: Optional[bool] = None

    min_stars: Optional[int] = None
    max_stars: Optional[int] = None

    sort_by: Optional[
        Literal[
            "stars",
            "pushed_at",
            "created_at",
            "forks",
            "open_issues",
            "stars_diff_1day"
        ]
    ] = "stars"

    sort_dir: Optional[Literal["asc", "desc"]] = "desc"

    limit: int = 50
    offset: int = 0
