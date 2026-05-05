from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class Repo(BaseModel):
    id: int
    name: str
    url: str
    stars: int
    pushed_at: datetime

    description: Optional[str] = None
    language: Optional[str] = None

    forks: int = 0
    open_issues: int = 0
    watchers: int = 0

    owner_login: Optional[str] = None
    owner_avatar: Optional[str] = None
    owner_url: Optional[str] = None

    topics: List[str] = Field(default_factory=list)
    license: Optional[str] = None
    homepage: Optional[str] = None
    default_branch: str = "main"

    archived: bool = False
    disabled: bool = False

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    size: Optional[int] = None
    visibility: Optional[str] = None

    has_issues: bool = True
    has_projects: bool = True
    has_wiki: bool = True
    has_pages: bool = False
    has_downloads: bool = True

    stars_diff_1day: int = 0
    stars_diff_2days: int = 0
    