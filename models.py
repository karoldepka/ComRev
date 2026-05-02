from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class Repo:
    # --- core ---
    id: int
    name: str
    url: str
    stars: int
    pushed_at: str

    # --- optional basics ---
    description: Optional[str] = None
    language: Optional[str] = None

    # --- engagement ---
    forks: int = 0
    open_issues: int = 0
    watchers: int = 0

    # --- owner ---
    owner_login: Optional[str] = None
    owner_avatar: Optional[str] = None
    owner_url: Optional[str] = None

    # --- metadata ---
    topics: List[str] = field(default_factory=list)
    license: Optional[str] = None
    homepage: Optional[str] = None
    default_branch: str = "main"

    # --- status ---
    archived: bool = False
    disabled: bool = False

    # --- timestamps ---
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    # --- extra ---
    size: Optional[int] = None
    visibility: Optional[str] = None

    has_issues: bool = True
    has_projects: bool = True
    has_wiki: bool = True
    has_pages: bool = False
    has_downloads: bool = True

