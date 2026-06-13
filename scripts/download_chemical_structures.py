#!/usr/bin/env python3
"""
Download chemical structure images from PubChem (default) or Wikimedia Commons.

Usage examples:
  python download_chemical_structures.py caffeine aspirin paracetamol
  python download_chemical_structures.py --file chemicals.txt
  python download_chemical_structures.py --source wikimedia caffeine aspirin
  python download_chemical_structures.py --category "Analgesics"
  python download_chemical_structures.py --all-svg-structures --limit 200

Sources:
  pubchem  (default) — fast, reliable, PNG @ 300px, official NCBI database
  wikimedia           — Wikipedia infobox images, prefers SVG, but CDN rate-limited

Output goes to ./chemical_structures/ by default.
"""

import argparse
import sys
import time
from pathlib import Path
from urllib.parse import quote as url_quote

import requests

# ── API base URLs ─────────────────────────────────────────────────────────────

WIKIPEDIA_API  = "https://en.wikipedia.org/w/api.php"
COMMONS_API    = "https://commons.wikimedia.org/w/api.php"
PUBCHEM_API    = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
HEADERS = {"User-Agent": "ChemStructDownloader/1.0 (educational; contact: user)"}

# ── Helpers ───────────────────────────────────────────────────────────────────

def wikipedia_get(params: dict) -> dict:
    params.setdefault("format", "json")
    r = requests.get(WIKIPEDIA_API, params=params, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()

def commons_get(params: dict) -> dict:
    params.setdefault("format", "json")
    r = requests.get(COMMONS_API, params=params, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()

# ── Image selection ───────────────────────────────────────────────────────────

STRUCTURE_KEYWORDS = {"structure", "skeletal", "formula", "2d", "molecule", "bond", "chemical"}
EXCLUDE_KEYWORDS   = {"logo", "flag", "icon", "map", "photo", "portrait", "seal", "coat_of_arms", "ribbon"}

def score_image(filename: str) -> int:
    """
    Positive score = likely a structure image.
    Prefers SVG (+2) over PNG (+1). Returns 0 if not a structure image.
    """
    low = filename.lower()
    if any(ex in low for ex in EXCLUDE_KEYWORDS):
        return 0
    is_svg = low.endswith(".svg")
    is_png = low.endswith(".png")
    if not (is_svg or is_png):
        return 0
    has_kw = any(kw in low for kw in STRUCTURE_KEYWORDS)
    if not has_kw and not is_svg:
        return 0
    return (2 if is_svg else 1) + (3 if has_kw else 0)


def best_structure_image(images: list[dict]) -> str | None:
    """Pick the best structure image filename from a list of {'title': 'File:...'} dicts."""
    scored = []
    for img in images:
        fn = img["title"].removeprefix("File:")
        s = score_image(fn)
        if s > 0:
            scored.append((s, fn))
    if not scored:
        return None
    scored.sort(reverse=True)
    return scored[0][1]

# ── Wikipedia page images ─────────────────────────────────────────────────────

def page_images(title: str) -> list[dict]:
    """Return all images listed on a Wikipedia page."""
    data = wikipedia_get({
        "action": "query",
        "titles": title,
        "prop": "images",
        "imlimit": 100,
    })
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        if "missing" not in page:
            return page.get("images", [])
    return []


def file_download_url(filename: str, thumb_width: int = 0) -> str | None:
    """
    Resolve a 'File:...' name to a download URL.
    If thumb_width > 0, returns a thumbnail URL (less throttled for SVGs rasterised to PNG).
    thumb_width = 0 returns the original file URL.
    """
    params = {
        "action": "query",
        "titles": f"File:{filename}",
        "prop": "imageinfo",
        "iiprop": "url|mime",
    }
    if thumb_width > 0:
        params["iiurlwidth"] = thumb_width
    data = wikipedia_get(params)
    for page in data.get("query", {}).get("pages", {}).values():
        for info in page.get("imageinfo", []):
            # Prefer thumburl when available (less CDN pressure); fall back to url
            return info.get("thumburl") or info.get("url")
    return None

# ── Wikimedia Commons category crawl ─────────────────────────────────────────

def commons_category_files(category: str, limit: int = 500) -> list[str]:
    """Return filenames of SVG/PNG files in a Commons category (recursive=False)."""
    filenames: list[str] = []
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": f"Category:{category}",
        "cmtype": "file",
        "cmlimit": min(limit, 500),
    }
    while True:
        data = commons_get(params)
        for m in data.get("query", {}).get("categorymembers", []):
            fn = m["title"].removeprefix("File:")
            if score_image(fn) > 0:
                filenames.append(fn)
        cont = data.get("continue", {}).get("cmcontinue")
        if not cont or len(filenames) >= limit:
            break
        params["cmcontinue"] = cont
    return filenames[:limit]


def commons_file_url(filename: str) -> str | None:
    """Get direct download URL from Wikimedia Commons."""
    data = commons_get({
        "action": "query",
        "titles": f"File:{filename}",
        "prop": "imageinfo",
        "iiprop": "url",
    })
    for page in data.get("query", {}).get("pages", {}).values():
        for info in page.get("imageinfo", []):
            return info.get("url")
    return None


def commons_search_svgs(limit: int = 200) -> list[str]:
    """
    Return filenames from the Commons 'Chemical structure diagrams' category tree.
    Useful as a bulk source of chemical SVGs.
    """
    categories = [
        "Chemical structure diagrams",
        "SVG chemical structure diagrams",
        "Skeletal formulas",
    ]
    seen: set[str] = set()
    filenames: list[str] = []
    for cat in categories:
        for fn in commons_category_files(cat, limit):
            if fn not in seen:
                seen.add(fn)
                filenames.append(fn)
        if len(filenames) >= limit:
            break
    return filenames[:limit]

# ── Download ──────────────────────────────────────────────────────────────────

def download_url(url: str, dest: Path, max_http_errors: int = 5) -> None:
    """
    Download with exponential backoff on 5xx errors and full respect for
    Retry-After on 429.  Rate-limit waits are unlimited — Wikimedia CDN can
    return Retry-After: 600; we honour it instead of giving up.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    http_errors = 0
    rate_limit_hits = 0
    while True:
        try:
            r = requests.get(url, headers=HEADERS, timeout=60, stream=True)
            if r.status_code == 429:
                rate_limit_hits += 1
                wait = float(r.headers.get("Retry-After", min(30 * rate_limit_hits, 120)))
                print(f"  rate-limited (hit #{rate_limit_hits}) — waiting {wait:.0f}s …",
                      end=" ", flush=True)
                time.sleep(wait)
                continue
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
            return
        except requests.HTTPError as e:
            http_errors += 1
            if http_errors >= max_http_errors:
                raise
            wait = 2 ** http_errors
            print(f"  HTTP {e.response.status_code} — retry in {wait}s …", end=" ", flush=True)
            time.sleep(wait)


def safe_stem(name: str) -> str:
    return name.replace(" ", "_").replace("/", "-").replace(":", "-")


def pubchem_download_by_name(
    chemical: str, out_dir: Path, delay: float, image_size: str = "300x300"
) -> bool:
    """
    Download structure PNG from PubChem REST API.
    Returns True on success. Does not raise on a 404 (compound not found).
    """
    encoded = url_quote(chemical)
    url = f"{PUBCHEM_API}/compound/name/{encoded}/PNG?image_size={image_size}"
    dest = out_dir / f"{safe_stem(chemical)}.png"
    print(f"  [PubChem] -> {dest.name}")
    try:
        download_url(url, dest)
        time.sleep(delay)
        return True
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            print(f"  Not found in PubChem.")
        else:
            print(f"  PubChem error: {e}")
        return False


def download_by_name(
    chemical: str, out_dir: Path, delay: float, thumb_width: int = 0
) -> bool:
    """Download the best structure image for a named chemical."""
    print(f"  Querying Wikipedia for '{chemical}' ...", end=" ", flush=True)
    images = page_images(chemical)
    if not images:
        print("no page images found.")
        return False

    best = best_structure_image(images)
    if not best:
        print("no structure image identified.")
        return False

    print(f"selected '{best}'")
    url = file_download_url(best, thumb_width=thumb_width)
    if not url:
        print(f"  Could not resolve download URL.")
        return False

    is_svg = best.lower().endswith(".svg") and thumb_width == 0
    ext = ".svg" if is_svg else ".png"
    dest = out_dir / f"{safe_stem(chemical)}{ext}"
    print(f"  Downloading -> {dest}")
    download_url(url, dest)
    time.sleep(delay)
    return True


def download_file(filename: str, out_dir: Path, delay: float, thumb_width: int = 0) -> bool:
    """Download a single file by its Wikimedia Commons filename."""
    url = (commons_file_url(filename)
           if thumb_width == 0
           else file_download_url(filename, thumb_width=thumb_width))
    if not url:
        url = file_download_url(filename, thumb_width=thumb_width)
    if not url:
        print(f"  Cannot resolve URL for '{filename}'")
        return False
    is_svg = filename.lower().endswith(".svg") and thumb_width == 0
    ext = ".svg" if is_svg else ".png"
    stem = safe_stem(Path(filename).stem)
    dest = out_dir / f"{stem}{ext}"
    print(f"  {filename}  ->  {dest.name}")
    download_url(url, dest)
    time.sleep(delay)
    return True

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download chemical structure images (PubChem by default, or Wikimedia)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    input_group = parser.add_mutually_exclusive_group()
    input_group.add_argument(
        "chemicals", nargs="*",
        help="Chemical names",
    )
    input_group.add_argument(
        "--file", "-f", metavar="FILE",
        help="Text file with one chemical name per line",
    )
    input_group.add_argument(
        "--category", "-c", metavar="CATEGORY",
        help="(Wikimedia) Download all SVGs from a Commons category name",
    )
    input_group.add_argument(
        "--all-svg-structures", action="store_true",
        help="(Wikimedia) Bulk-download from Commons 'Chemical structure diagrams' categories",
    )

    parser.add_argument(
        "--source", choices=["pubchem", "wikimedia"], default="pubchem",
        help="Image source: pubchem (default, fast PNG) or wikimedia (SVG preferred, CDN rate-limited)",
    )
    parser.add_argument(
        "--image-size", default="300x300", metavar="WxH",
        help="PubChem image size (default: 300x300; try 600x600 for higher resolution)",
    )
    parser.add_argument("--output", "-o", default="chemical_structures",
                        help="Output directory (default: chemical_structures)")
    parser.add_argument("--limit", type=int, default=200,
                        help="Max files when using --category or --all-svg-structures (default: 200)")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Seconds between downloads (default: 0.5; increase if rate-limited)")
    parser.add_argument("--thumb-width", type=int, default=1200, metavar="PX",
                        help="(Wikimedia) thumbnail width in px; 0 = original SVG (default: 1200)")

    args = parser.parse_args()

    out_dir = Path(args.output)
    out_dir.mkdir(exist_ok=True)

    tw = args.thumb_width
    use_pubchem = args.source == "pubchem"

    # --category and --all-svg-structures are always Wikimedia
    if args.all_svg_structures:
        print(f"Fetching up to {args.limit} chemical SVGs from Commons categories...")
        filenames = commons_search_svgs(args.limit)
        print(f"Found {len(filenames)} files. Downloading to '{out_dir}/' ...\n")
        ok = fail = 0
        for i, fn in enumerate(filenames, 1):
            print(f"[{i}/{len(filenames)}] ", end="")
            if download_file(fn, out_dir, args.delay, thumb_width=tw):
                ok += 1
            else:
                fail += 1
        print(f"\nDone: {ok} downloaded, {fail} failed.")
        return

    if args.category:
        print(f"Fetching up to {args.limit} files from Commons category '{args.category}' ...")
        filenames = commons_category_files(args.category, args.limit)
        if not filenames:
            print("No structure images found in that category.")
            sys.exit(1)
        print(f"Found {len(filenames)} files. Downloading to '{out_dir}/' ...\n")
        ok = fail = 0
        for i, fn in enumerate(filenames, 1):
            print(f"[{i}/{len(filenames)}] ", end="")
            if download_file(fn, out_dir, args.delay, thumb_width=tw):
                ok += 1
            else:
                fail += 1
        print(f"\nDone: {ok} downloaded, {fail} failed.")
        return

    # Named chemicals
    if args.file:
        with open(args.file) as fh:
            chemicals = [l.strip() for l in fh if l.strip() and not l.startswith("#")]
    else:
        chemicals = args.chemicals

    if not chemicals:
        parser.error("Specify chemical names, --file, --category, or --all-svg-structures.")

    src_label = "PubChem" if use_pubchem else "Wikimedia"
    print(f"Downloading {len(chemicals)} chemical structure(s) via {src_label} to '{out_dir}/' ...\n")
    ok = fail = 0
    failed_names: list[str] = []
    for i, name in enumerate(chemicals, 1):
        print(f"[{i}/{len(chemicals)}] {name}")
        try:
            if use_pubchem:
                success = pubchem_download_by_name(name, out_dir, args.delay, args.image_size)
            else:
                success = download_by_name(name, out_dir, args.delay, thumb_width=tw)
            if success:
                ok += 1
            else:
                fail += 1
                failed_names.append(name)
        except Exception as e:
            print(f"  Error: {e}")
            fail += 1
            failed_names.append(name)

    print(f"\nDone: {ok} succeeded, {fail} failed.")
    if failed_names:
        print("Failed:", ", ".join(failed_names))


if __name__ == "__main__":
    main()
