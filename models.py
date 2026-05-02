from dataclasses import dataclass


@dataclass(slots=True)
class Repo:
    id: int
    name: str
    url: str
    stars: int
    pushed_at: str
    description: str | None
    language: str | None

