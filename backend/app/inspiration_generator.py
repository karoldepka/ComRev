from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import hashlib
import re

from pydantic import BaseModel, Field


class InspirationKind(StrEnum):
    MOTTO = "motto"
    FAMOUS_PEOPLE_QUOTE = "famous_people_quote"
    MANTRA = "mantra"
    AFFIRMATION = "affirmation"
    VALUE = "value"
    BELIEF = "belief"
    QUALITY = "quality"


DEFAULT_KINDS = [
    InspirationKind.MOTTO,
    InspirationKind.FAMOUS_PEOPLE_QUOTE,
    InspirationKind.MANTRA,
    InspirationKind.AFFIRMATION,
    InspirationKind.VALUE,
    InspirationKind.BELIEF,
    InspirationKind.QUALITY,
]


class InspirationGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=600)
    kinds: list[InspirationKind] | None = None
    count_per_kind: int = Field(3, ge=1, le=8)


class InspirationItem(BaseModel):
    kind: InspirationKind
    text: str
    author_name: str | None = None
    source_note: str | None = None


class InspirationGenerateResponse(BaseModel):
    prompt: str
    normalized_prompt: str
    items: list[InspirationItem]
    generated_by: str = "python-template-generator-v1"


@dataclass(frozen=True)
class QuoteSeed:
    text: str
    author_name: str


QUOTE_SEEDS = [
    QuoteSeed("Well done is better than well said.", "Benjamin Franklin"),
    QuoteSeed("Energy and persistence conquer all things.", "Benjamin Franklin"),
    QuoteSeed("Genius is one percent inspiration and ninety-nine percent perspiration.", "Thomas Edison"),
    QuoteSeed("To thine own self be true.", "William Shakespeare"),
    QuoteSeed("No great thing is created suddenly.", "Epictetus"),
    QuoteSeed("He who is brave is free.", "Seneca"),
]


STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "for",
    "from",
    "give",
    "help",
    "into",
    "make",
    "me",
    "my",
    "of",
    "on",
    "our",
    "please",
    "the",
    "to",
    "with",
}


TEMPLATES: dict[InspirationKind, list[str]] = {
    InspirationKind.MOTTO: [
        "Build {theme} with steady hands.",
        "{Theme}: honest work, visible progress.",
        "Make {theme} useful, durable, and kind.",
        "Small wins, strong {focus}.",
    ],
    InspirationKind.MANTRA: [
        "One clear step for {theme}.",
        "Return to the work; protect the signal.",
        "Calm focus, then momentum.",
        "Less noise, more {focus}.",
    ],
    InspirationKind.AFFIRMATION: [
        "I can turn {theme} into a concrete next step.",
        "I keep promises to the work and to myself.",
        "I am allowed to build steadily before it looks impressive.",
        "I learn, adjust, and continue.",
    ],
    InspirationKind.VALUE: [
        "Clarity before scale.",
        "Progress that users can trust.",
        "Craft in service of usefulness.",
        "Truthful momentum over performance.",
    ],
    InspirationKind.BELIEF: [
        "{Theme} grows through small decisions repeated well.",
        "Reliable systems are built by people who respect uncertainty.",
        "The next honest experiment is enough to move forward.",
        "Better tools can make better collaboration ordinary.",
    ],
    InspirationKind.QUALITY: [
        "Patient ambition",
        "Practical courage",
        "Careful momentum",
        "Generous rigor",
    ],
}


def generate_inspiration(request: InspirationGenerateRequest) -> InspirationGenerateResponse:
    prompt = request.prompt.strip()
    normalized_prompt = _normalize_prompt(prompt)
    theme = _theme_from_prompt(prompt)
    focus = _focus_word(prompt)
    seed = _stable_seed(prompt)
    kinds = request.kinds or DEFAULT_KINDS
    items: list[InspirationItem] = []

    for kind in kinds:
        for index in range(request.count_per_kind):
            if kind == InspirationKind.FAMOUS_PEOPLE_QUOTE:
                items.append(_quote_item(seed, index, theme))
                continue
            template = _pick(TEMPLATES[kind], seed, index)
            items.append(
                InspirationItem(
                    kind=kind,
                    text=template.format(theme=theme, Theme=theme.capitalize(), focus=focus),
                )
            )

    return InspirationGenerateResponse(
        prompt=prompt,
        normalized_prompt=normalized_prompt,
        items=items,
    )


def _quote_item(seed: int, index: int, theme: str) -> InspirationItem:
    quote = _pick(QUOTE_SEEDS, seed, index)
    return InspirationItem(
        kind=InspirationKind.FAMOUS_PEOPLE_QUOTE,
        text=quote.text,
        author_name=quote.author_name,
        source_note=f"Selected for: {theme}",
    )


def _pick[T](items: list[T], seed: int, index: int) -> T:
    return items[(seed + index) % len(items)]


def _stable_seed(prompt: str) -> int:
    digest = hashlib.sha256(prompt.strip().lower().encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def _normalize_prompt(prompt: str) -> str:
    normalized = re.sub(r"\s+", " ", prompt.strip().lower())
    return normalized or "motivation"


def _theme_from_prompt(prompt: str) -> str:
    words = _keywords(prompt)
    if not words:
        return "the work"
    return " ".join(words[:4])


def _focus_word(prompt: str) -> str:
    words = _keywords(prompt)
    return words[0] if words else "progress"


def _keywords(prompt: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]*", prompt.lower())
    filtered = [word for word in words if word not in STOP_WORDS]
    return filtered or [word for word in words if word]
