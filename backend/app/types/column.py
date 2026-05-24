import strawberry
from typing import List, Optional
from datetime import datetime


@strawberry.type
class Column:
    id: strawberry.ID
    set_id: strawberry.ID
    parent_id: Optional[strawberry.ID]
    name: str
    display_name: Optional[str]
    col_type: str
    position: int
    description: Optional[str]
    is_archived: bool
    created_at: datetime
    children: List["Column"] = strawberry.field(default_factory=list)
