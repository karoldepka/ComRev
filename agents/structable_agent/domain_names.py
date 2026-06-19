"""Domain-name ideation and research helpers for Structable agents."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Iterable
from urllib.parse import urljoin, urlencode

import httpx

LOGGER = logging.getLogger(__name__)

TLD_DOMAINS = (".ai",)
MAX_SYLLABLES = 3
MAX_RESULTS = 20

_VOWEL_GROUP_RE = re.compile(r"[aeiouy]+", re.IGNORECASE)
_WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9]{1,24}")
_DOMAIN_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_RDAP_ENDPOINT_CACHE: dict[str, str | None] = {}

_PREFIXES = (
    "in",
    "it",
    "bit",
    "kit",
    "lit",
    "mint",
    "tilt",
    "twin",
    "vital",
    "grid",
    "tab",
    "cell",
    "sync",
    "open",
    "spark",
)

_SUFFIXES = (
    "it",
    "kit",
    "tek",
    "tech",
    "grid",
    "mint",
    "tide",
    "tilt",
    "bits",
    "link",
    "base",
    "flow",
    "forge",
    "pilot",
    "stack",
)

_SEED_NAMES = (
    "intek",
    "tabkit",
    "gridtek",
    "cellkit",
    "syncit",
    "tinker",
    "tiltbase",
    "bitloom",
    "mintly",
    "kitflow",
    "datakit",
    "openit",
    "itemize",
    "tintly",
    "vitalink",
)


@dataclass(frozen=True)
class DomainCandidate:
    label: str
    tld: str
    score: int
    reasons: tuple[str, ...]

    @property
    def domain(self) -> str:
        return f"{self.label}{self.tld}"

    @property
    def name(self) -> str:
        return display_name(self.label)

    @property
    def syllables(self) -> int:
        return count_syllables(self.label)


def count_syllables(text: str) -> int:
    """Return a small English-ish syllable estimate suitable for brand filters."""
    word = re.sub(r"[^a-z]", "", text.lower())
    if not word:
        return 0
    groups = _VOWEL_GROUP_RE.findall(word)
    count = len(groups)
    if len(word) > 3 and word.endswith("e") and not word.endswith(("le", "ye")):
        count -= 1
    return max(1, count)


def display_name(label: str) -> str:
    """Convert a domain label into a readable brand-style name."""
    lower = label.lower()
    for suffix in ("tek", "tech", "kit", "grid", "sync", "flow", "base", "stack", "pilot", "forge"):
        if lower.endswith(suffix) and len(lower) > len(suffix) + 1:
            return f"{lower[:-len(suffix)].capitalize()}{suffix.capitalize()}"
    return lower.capitalize()


def generate_domain_candidates(
    idea: str,
    extra_names: Iterable[str] | None = None,
    limit: int = 50,
) -> list[DomainCandidate]:
    """Generate pronounceable-ish .ai candidates with I and T within 3 syllables."""
    requested_limit = max(1, min(limit, 100))
    words = _keyword_fragments(idea)
    if extra_names:
        words.extend(_normalize_label(name) for name in extra_names)
    words = [word for word in dict.fromkeys(words) if word]

    labels: list[tuple[str, tuple[str, ...]]] = [(name, ("curated seed",)) for name in _SEED_NAMES]

    for word in words:
        labels.append((word, ("from user phrase",)))
        for prefix in _PREFIXES:
            labels.append((f"{prefix}{word}", ("keyword plus prefix",)))
        for suffix in _SUFFIXES:
            labels.append((f"{word}{suffix}", ("keyword plus suffix",)))

    for prefix in _PREFIXES:
        for suffix in _SUFFIXES:
            labels.append((f"{prefix}{suffix}", ("brand fragment blend",)))

    candidates: list[DomainCandidate] = []
    seen: set[str] = set()
    for raw_label, reasons in labels:
        label = _normalize_label(raw_label)
        if label in seen or not _is_valid_label(label):
            continue
        syllables = count_syllables(label)
        if syllables > MAX_SYLLABLES:
            continue
        seen.add(label)
        candidates.append(
            DomainCandidate(
                label=label,
                tld=TLD_DOMAINS[0],
                score=_brand_score(label, reasons),
                reasons=reasons,
            )
        )

    candidates.sort(key=lambda candidate: (-candidate.score, len(candidate.label), candidate.label))
    return candidates[:requested_limit]


async def find_domain_names(
    idea: str,
    extra_names: list[str] | None = None,
    max_results: int = 10,
) -> dict[str, Any]:
    """Generate candidates, then check domain and Google presence."""
    result_count = max(1, min(max_results, MAX_RESULTS))
    candidate_pool = generate_domain_candidates(
        idea=idea,
        extra_names=extra_names,
        limit=max(result_count * 3, 15),
    )
    timeout = httpx.Timeout(12.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        checked = await _check_candidates(client, candidate_pool)

    checked.sort(key=lambda item: (-item["score"], item["domain"]))
    return {
        "constraints": {
            "tlds": list(TLD_DOMAINS),
            "max_syllables": MAX_SYLLABLES,
            "required_letters": ["i", "t"],
        },
        "count": min(result_count, len(checked)),
        "candidates": checked[:result_count],
    }


async def check_domain_availability(client: httpx.AsyncClient, domain: str) -> dict[str, Any]:
    """Check availability via IANA RDAP bootstrap, with DNS as a weak fallback."""
    normalized = domain.lower().strip()
    rdap = await _check_rdap(client, normalized)
    if rdap["available"] is not None:
        return rdap

    dns = await _check_dns(client, normalized)
    return {
        "available": None if not dns["has_nameservers"] else False,
        "status": "registered_dns_seen" if dns["has_nameservers"] else "unknown",
        "method": "dns_ns_fallback",
        "details": (
            "Nameservers are visible, so the domain is not available."
            if dns["has_nameservers"]
            else "No nameservers were visible, but registry availability was not confirmed."
        ),
        "rdap": rdap,
        "dns": dns,
    }


async def check_google_results(client: httpx.AsyncClient, name: str, domain: str) -> dict[str, Any]:
    """Check Google search results via Serper or Google Custom Search."""
    query = f'"{name}" OR "{domain}"'
    search_url = f"https://www.google.com/search?{urlencode({'q': query})}"
    serper_api_key = os.getenv("SERPER_API_KEY")
    if serper_api_key:
        return await _check_serper_results(client, query, search_url, serper_api_key, domain)

    api_key = os.getenv("GOOGLE_SEARCH_API_KEY")
    cse_id = os.getenv("GOOGLE_SEARCH_ENGINE_ID") or os.getenv("GOOGLE_CSE_ID")
    if not api_key or not cse_id:
        return {
            "status": "unconfigured",
            "provider": None,
            "total_results": None,
            "result_count": 0,
            "search_url": search_url,
            "results": [],
            "details": (
                "Set SERPER_API_KEY for Serper, or GOOGLE_SEARCH_API_KEY and "
                "GOOGLE_SEARCH_ENGINE_ID for Google Custom Search."
            ),
        }

    try:
        response = await client.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"key": api_key, "cx": cse_id, "q": query, "num": 3},
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:  # noqa: BLE001 - tool should report, not crash, on provider issues.
        LOGGER.exception("Google Custom Search failed for %s", domain)
        return {
            "status": "error",
            "provider": "google_custom_search",
            "total_results": None,
            "result_count": 0,
            "search_url": search_url,
            "results": [],
            "details": str(exc),
        }

    total = _parse_int(payload.get("searchInformation", {}).get("totalResults"))
    items = [
        {
            "title": item.get("title"),
            "link": item.get("link"),
            "snippet": item.get("snippet"),
        }
        for item in payload.get("items", [])
    ]
    return {
        "status": "ok",
        "provider": "google_custom_search",
        "total_results": total,
        "result_count": len(items),
        "search_url": search_url,
        "results": items,
        "details": "Google Custom Search JSON API",
    }


async def _check_serper_results(
    client: httpx.AsyncClient,
    query: str,
    search_url: str,
    api_key: str,
    domain: str,
) -> dict[str, Any]:
    try:
        response = await client.post(
            "https://google.serper.dev/search",
            headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
            json={"q": query, "num": 3},
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:  # noqa: BLE001 - tool should report, not crash, on provider issues.
        LOGGER.exception("Serper search failed for %s", domain)
        return {
            "status": "error",
            "provider": "serper",
            "total_results": None,
            "result_count": 0,
            "search_url": search_url,
            "results": [],
            "details": str(exc),
        }

    items = [
        {
            "title": item.get("title"),
            "link": item.get("link"),
            "snippet": item.get("snippet"),
            "position": item.get("position"),
        }
        for item in payload.get("organic", [])
    ]
    return {
        "status": "ok",
        "provider": "serper",
        "total_results": _parse_int(payload.get("searchInformation", {}).get("totalResults")),
        "result_count": len(items),
        "search_url": search_url,
        "results": items,
        "details": "Serper Google Search API",
    }


async def _check_candidates(
    client: httpx.AsyncClient,
    candidates: list[DomainCandidate],
) -> list[dict[str, Any]]:
    semaphore = asyncio.Semaphore(4)

    async def check(candidate: DomainCandidate) -> dict[str, Any]:
        async with semaphore:
            availability, google = await asyncio.gather(
                check_domain_availability(client, candidate.domain),
                check_google_results(client, candidate.name, candidate.domain),
            )
            score = candidate.score + _availability_score(availability) + _google_score(google)
            return {
                "name": candidate.name,
                "domain": candidate.domain,
                "tld": candidate.tld,
                "syllables": candidate.syllables,
                "score": score,
                "reasons": list(candidate.reasons),
                "availability": availability,
                "google": google,
            }

    return await asyncio.gather(*(check(candidate) for candidate in candidates))


async def _check_rdap(client: httpx.AsyncClient, domain: str) -> dict[str, Any]:
    tld = domain.rsplit(".", 1)[-1]
    try:
        endpoint = await _rdap_endpoint_for_tld(client, tld)
        if not endpoint:
            return {
                "available": None,
                "status": "unknown",
                "method": "rdap",
                "details": f"No IANA RDAP endpoint found for .{tld}.",
            }
        url = urljoin(endpoint if endpoint.endswith("/") else f"{endpoint}/", f"domain/{domain}")
        response = await client.get(url)
        if response.status_code == 200:
            return {
                "available": False,
                "status": "registered",
                "method": "rdap",
                "details": "RDAP returned a domain record.",
                "rdap_url": str(response.url),
            }
        if response.status_code == 404:
            return {
                "available": True,
                "status": "available",
                "method": "rdap",
                "details": "Authoritative RDAP endpoint returned not found.",
                "rdap_url": str(response.url),
            }
        return {
            "available": None,
            "status": "unknown",
            "method": "rdap",
            "details": f"RDAP returned HTTP {response.status_code}.",
            "rdap_url": str(response.url),
        }
    except Exception as exc:  # noqa: BLE001 - network research errors are part of the result.
        LOGGER.exception("RDAP lookup failed for %s", domain)
        return {
            "available": None,
            "status": "error",
            "method": "rdap",
            "details": str(exc),
        }


async def _rdap_endpoint_for_tld(client: httpx.AsyncClient, tld: str) -> str | None:
    cache_key = tld.lower()
    if cache_key in _RDAP_ENDPOINT_CACHE:
        return _RDAP_ENDPOINT_CACHE[cache_key]

    response = await client.get("https://data.iana.org/rdap/dns.json")
    response.raise_for_status()
    services = response.json().get("services", [])
    for service_tlds, endpoints in services:
        if cache_key in {service_tld.lower() for service_tld in service_tlds} and endpoints:
            _RDAP_ENDPOINT_CACHE[cache_key] = endpoints[0]
            return endpoints[0]
    _RDAP_ENDPOINT_CACHE[cache_key] = None
    return None


async def _check_dns(client: httpx.AsyncClient, domain: str) -> dict[str, Any]:
    try:
        response = await client.get("https://dns.google/resolve", params={"name": domain, "type": "NS"})
        response.raise_for_status()
        payload = response.json()
        answers = payload.get("Answer", []) or []
        return {
            "status": payload.get("Status"),
            "has_nameservers": bool(answers),
            "answers": [answer.get("data") for answer in answers if answer.get("data")],
        }
    except Exception as exc:  # noqa: BLE001
        LOGGER.exception("DNS lookup failed for %s", domain)
        return {"status": "error", "has_nameservers": False, "answers": [], "details": str(exc)}


def _keyword_fragments(idea: str) -> list[str]:
    words: list[str] = []
    for match in _WORD_RE.finditer(idea.lower()):
        word = _normalize_label(match.group(0))
        if len(word) < 3:
            continue
        words.append(word[:8])
        if len(word) > 5:
            words.append(word[:5])
    return list(dict.fromkeys(words))


def _normalize_label(value: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", value.lower()).strip("-")


def _is_valid_label(label: str) -> bool:
    return (
        3 <= len(label) <= 15
        and "i" in label
        and "t" in label
        and bool(_DOMAIN_LABEL_RE.match(label))
    )


def _brand_score(label: str, reasons: tuple[str, ...]) -> int:
    score = 40
    length = len(label)
    syllables = count_syllables(label)
    if 5 <= length <= 9:
        score += 18
    elif 10 <= length <= 12:
        score += 10
    else:
        score += 4
    if syllables <= 2:
        score += 12
    elif syllables == 3:
        score += 6
    if "curated seed" in reasons:
        score += 10
    if re.search(r"(.)\1\1", label):
        score -= 8
    if "-" in label:
        score -= 10
    return score


def _availability_score(availability: dict[str, Any]) -> int:
    available = availability.get("available")
    if available is True:
        return 30
    if available is False:
        return -35
    return 0


def _google_score(google: dict[str, Any]) -> int:
    total = google.get("total_results")
    if not isinstance(total, int):
        result_count = google.get("result_count")
        if result_count == 0 and google.get("status") == "ok":
            return 8
        return 0
    if total == 0:
        return 12
    if total < 100:
        return 8
    if total < 1000:
        return 4
    if total > 100_000:
        return -12
    if total > 10_000:
        return -6
    return 0


def _parse_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
