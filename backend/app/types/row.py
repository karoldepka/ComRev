import strawberry
from typing import Any, Optional
from datetime import datetime
from .scalars import JSON


@strawberry.type
class Row:
    id: strawberry.ID
    set_id: strawberry.ID
    name: str
    description: Optional[str]
    url: Optional[str]
    github_url: Optional[str]
    position: int
    metadata: JSON
    created_at: datetime
