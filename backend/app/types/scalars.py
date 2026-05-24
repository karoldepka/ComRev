from typing import Any
import strawberry

JSON = strawberry.scalar(
    Any,
    name="JSON",
    description="Arbitrary JSON value (bool | str | float | null | object | array)",
    serialize=lambda v: v,
    parse_value=lambda v: v,
)
