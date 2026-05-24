import strawberry
from typing import Optional
from datetime import datetime
from .scalars import JSON


@strawberry.type
class Cell:
    id: strawberry.ID
    row_id: strawberry.ID
    column_id: strawberry.ID
    value: Optional[JSON]
    filled_by_ai: bool
    source_url: Optional[str]
    source_excerpt: Optional[str]
    confidence: Optional[float]
    updated_at: datetime
