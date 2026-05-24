from typing import List, Optional
import strawberry
from .types.comparison_set import ComparisonSet
from .types.scalars import JSON


@strawberry.type
class Query:
    @strawberry.field
    def comparison_sets(self) -> List[ComparisonSet]:
        return []

    @strawberry.field
    def comparison_set(
        self, id: Optional[strawberry.ID] = None, slug: Optional[str] = None
    ) -> Optional[ComparisonSet]:
        return None

    @strawberry.field
    def hidden_column_ids(self, set_id: strawberry.ID) -> List[strawberry.ID]:
        return []


@strawberry.type
class Mutation:
    @strawberry.mutation
    def create_comparison_set(self, name: str, slug: str) -> ComparisonSet:
        raise NotImplementedError("Implemented in P1")

    @strawberry.mutation
    def upsert_cell(
        self, row_id: strawberry.ID, column_id: strawberry.ID, value: Optional[JSON] = None
    ) -> bool:
        raise NotImplementedError("Implemented in P1")


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    scalar_overrides={JSON: JSON},
)
