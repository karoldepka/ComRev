import strawberry
from typing import Optional
from datetime import datetime


@strawberry.type
class ComparisonSet:
    id: strawberry.ID
    slug: str
    name: str
    description: Optional[str]
    is_public: bool
    created_at: datetime
    updated_at: datetime
