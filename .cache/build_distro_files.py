#!/usr/bin/env python3
"""
Build per-distro Markdown files from the cached API responses.

For every distro in .cache/api/all.json, this script writes:

  1. distros/<slug>/<slug>.md          (the human-facing dossier)
  2. frontend/src/data/distros.json   (single-file data blob for the
                                       Vite frontend, including the raw
                                       markdown body as a string field)

Both share the source regex/structured-data fetch pipeline in
.cache/fetch_distros.py — run them in order, refresh in under a minute.
"""
import json
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlparse

ROOT = Path(".")
SRC       = ROOT / ".cache" / "api" / "all.json"
MAR       = ROOT / ".cache" / "api" / "manual_overrides.json"
POP       = ROOT / ".cache" / "api" / "popularity.json"
DISTROS_OUT = ROOT / "distros"
FE_OUT      = ROOT / "frontend" / "src" / "data"

WIKIDATA_HOST = "https://www.wikidata.org/wiki"
WIKI_HOST     = "https://en.wikipedia.org/wiki"

# Approximate defaults for fields some distros don't expose on Wikidata.
FAMILY_DEFAULTS = {
    "debian":    {"release_model": "Point releases (~2 yr)",       "package_manager": "apt",      "desktop_environments": []},
    "ubuntu":    {"release_model": "Point releases (LTS + interim)", "package_manager": "apt",    "desktop_environments": ["GNOME", "KDE Plasma", "XFCE"]},
    "linux_mint":{"release_model": "Point releases",              "package_manager": "apt",      "desktop_environments": ["Cinnamon", "MATE", "XFCE"]},
    "pop_os":    {"release_model": "Point releases",              "package_manager": "apt",      "desktop_environments": ["COSMIC (Rust + Wayland)"]},
    "arch":      {"release_model": "Rolling release",             "package_manager": "pacman",   "desktop_environments": []},
    "manjaro":   {"release_model": "Rolling release (delayed)",   "package_manager": "pacman + pamac", "desktop_environments": ["XFCE", "KDE Plasma", "GNOME"]},
    "endeavouros":{"release_model": "Rolling release",            "package_manager": "pacman + yay",  "desktop_environments": []},
    "fedora":    {"release_model": "Point releases (~6 months)",  "package_manager": "dnf / rpm","desktop_environments": ["GNOME", "KDE Plasma"]},
    "nobara":    {"release_model": "Rolling (follows Fedora)",    "package_manager": "dnf + Nobara tweaks", "desktop_environments": ["GNOME (modified)"]},
    "gentoo":    {"release_model": "Rolling (source builds)",     "package_manager": "portage (emerge)", "desktop_environments": []},
    "slackware": {"release_model": "Point releases (slow)",       "package_manager": "pkgtools / slapt-get", "desktop_environments": []},
    "linux_kernel":{"release_model": "N/A",                       "package_manager": "N/A",      "desktop_environments": []},
}

TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")


def render_md(d: dict) -> str:
    """Render a single distro to its Markdown dossier body (no leading heading)."""
    parts: list[str] = []
    parts.append(f"# {d['display']}\n")

    if d.get("short_desc"):
        parts.append(f"> {d['short_desc']}\n")

    rows = []
    rows.append(("Display name", d["display"]))
    if d.get("qid"):
        rows.append(("Wikidata ID", f"`{d['qid']}` &nbsp;·&nbsp; [open]({WIKIDATA_HOST}/{d['qid']})"))
    if d.get("wiki_url"):
        rows.append(("Wikipedia", f"[{d['display']} on en.wikipedia]({d['wiki_url']})"))
    if d.get("official_website"):
        rows.append(("Official website", f"<{d['official_website']}>"))
    if d.get("developer"):
        rows.append(("Developer / maintainer", d["developer"]))
    if d.get("inception"):
        rows.append(("First released", d["inception"]))
    if d.get("based_on"):
        rows.append(("Based on (Wikidata P144)", d["based_on"]))

    parent = d.get("parent")
    if parent:
        rows.append(("Parent in DistroMap tree", f"[`{parent}`](../{parent}/{parent}.md)"))

    if rows:
        parts.append("| Field | Value |\n|---|---|")
        for k, v in rows:
            parts.append(f"| {k} | {v} |")
        parts.append("")

    if d.get("extract"):
        parts.append("## Summary\n")
        parts.append(d["extract"].strip())
        parts.append("")

    thumb = d.get("thumbnail")
    if thumb and thumb.startswith("http"):
        parts.append("## Logo / thumbnail\n")
        parts.append(f"![{d['display']} logo]({thumb})\n")

    parts.append("## Sources\n")
    parts.append(
        "All data on this page was retrieved from two free, public APIs:\n\n"
        f"- **Wikipedia REST API** — `/page/summary/{d['wp_title']}`\n"
        f"  <https://en.wikipedia.org/api/rest_v1/page/summary/{d['wp_title'].replace(' ', '_')}>\n"
    )
    if d.get("qid"):
        parts.append(
            f"- **Wikidata entity endpoint** — `{d['qid']}`\n"
            f"  <{WIKIDATA_HOST}/Special:EntityData/{d['qid']}.json>\n"
        )
    parts.append(
        "\nBoth endpoints are maintained by the Wikimedia Foundation, are free to "
        "use, require no API key, and are licensed under CC-BY-SA."
    )
    parts.append(f"\n_Last regenerated: {TODAY}_\n")

    return "\n".join(parts)


def _favicon_url(d: dict) -> str | None:
    """
    Resolve the favicon via Google Favicon Service so the DistroNode
    can render each distro's actual website favicon. Falls back to None
    when there's no usable `official_website`. DistroNode chains
    favicon -> Wikipedia thumbnail -> letter, so this primary miss
    is fine as long as the upstream domain is OK.
    """
    site = d.get("official_website") or ""
    if not site:
        return None
    try:
        host = urlparse(site).hostname
    except ValueError:
        return None
    if not host:
        return None
    return f"https://www.google.com/s2/favicons?domain={host}&sz=64"


def frontend_payload(d: dict, parent_map: dict, popularity: dict) -> dict:
    """Convert a .cache/api/all.json record into the Vite-friendly shape."""
    defaults = FAMILY_DEFAULTS.get(d["slug"], {})

    # Walk the actual parent chain to compute depth from root (kernel = 0).
    depth = 0
    cur = d["slug"]
    while parent_map.get(cur):
        depth += 1
        cur = parent_map[cur]
        if depth > 64:    # cycle guard
            break

    # v0.6 — popularity score: prefer the computed 1-5, fall back to 3
    # mid-range if popularity.json doesn't have a row for this slug.
    pop_row = popularity.get(d["slug"])
    pop_score = int(pop_row.get("score", 3)) if pop_row else 3

    rec = {
        "slug": d["slug"],
        "display": d["display"],
        "parent": d["parent"],
        "depth": depth,
        "family": d.get("family") or slug_to_family(d["slug"]),
        "qid": d.get("qid"),
        "short_desc": d.get("short_desc"),
        "extract":    d.get("extract"),
        "thumbnail":  d.get("thumbnail"),
        "favicon_url": _favicon_url(d),
        "wiki_url":   d.get("wiki_url"),
        "official_website": d.get("official_website"),
        "developer":  d.get("developer"),
        "inception":  d.get("inception"),
        "based_on_label": _friendly_based_on(d.get("based_on")),
        "release_model":  defaults.get("release_model", ""),
        "package_manager":defaults.get("package_manager", ""),
        "popularity": pop_score,
        "popularity_signals": _pop_signals(pop_row),
        "desktop_environments": defaults.get("desktop_environments", []),
        "markdown": render_md(d),
    }
    return rec


def slug_to_family(slug: str) -> str:
    return {
        "linux_kernel":"kernel",
        "debian":   "debian",
        "ubuntu":   "debian",
        "linux_mint":"debian",
        "pop_os":   "debian",
        "arch":     "arch",
        "manjaro":  "arch",
        "endeavouros":"arch",
        "fedora":   "fedora",
        "nobara":   "fedora",
        "gentoo":   "gentoo",
        "slackware":"slackware",
    }.get(slug, "other")


def _friendly_based_on(b):
    """Strip 'wd:Q<id>' values from the based_on field."""
    if not b:
        return None
    if isinstance(b, str) and b.startswith("wd:"):
        return None
    return b


# v0.4 — manual override merge (shallow, slug-keyed).
def _load_overrides() -> dict:
    if not MAR.exists():
        return {}
    raw = json.loads(MAR.read_text(encoding="utf-8"))
    return {
        slug: fields
        for slug, fields in raw.items()
        if not slug.startswith("_") and isinstance(fields, dict)
    }


def _apply_overrides(record: dict, overrides: dict) -> dict:
    slug_overrides = overrides.get(record["slug"])
    if slug_overrides:
        for k, v in slug_overrides.items():
            record[k] = v
    return record


# v0.6 — popularity merge
def _load_popularity() -> dict:
    if not POP.exists():
        return {}
    raw = json.loads(POP.read_text(encoding="utf-8"))
    return {
        slug: fields
        for slug, fields in raw.items()
        if not slug.startswith("_") and isinstance(fields, dict)
    }


def _pop_signals(pop_row: dict | None) -> dict | None:
    """Reshape the popularity.json row for the frontend's JSON shape."""
    if not pop_row:
        return None
    raw = int(pop_row.get("pageviews_30d") or 0)
    return {
        "pageviews_30d": raw,
        "source": pop_row.get("source") or "",
        "fetched_at": pop_row.get("fetched_at") or "",
    }


# Pipeline
def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))

    overrides = _load_overrides()
    if overrides:
        for d in data:
            _apply_overrides(d, overrides)
        print(f"  applied manual overrides for {len(overrides)} slug(s)")
    else:
        print("  no manual_overrides.json found -- using Wikidata as-is")

    popularity = _load_popularity()
    if popularity:
        scored = sum(1 for slug, fields in popularity.items()
                     if not slug.startswith("_") and "score" in fields)
        print(f"  loaded popularity for {scored} slug(s) from {POP}")
    else:
        print("  no popularity.json found -- popularity stays at neutral 3")
        print("  (run `python3 .cache/fetch_popularity.py` to populate)")

    parent_map = {d["slug"]: d["parent"] for d in data}

    DISTROS_OUT.mkdir(parents=True, exist_ok=True)
    for d in data:
        slug = d["slug"]
        (DISTROS_OUT / slug / f"{slug}.md").parent.mkdir(parents=True, exist_ok=True)
        (DISTROS_OUT / slug / f"{slug}.md").write_text(render_md(d), encoding="utf-8")
    print(f"  wrote {len(data)} dossiers under {DISTROS_OUT}/")

    FE_OUT.mkdir(parents=True, exist_ok=True)
    fe_payload = [frontend_payload(d, parent_map, popularity) for d in data]
    FE_OUT.joinpath("distros.json").write_text(
        json.dumps(fe_payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"  wrote frontend bundle → {FE_OUT/'distros.json'}")


if __name__ == "__main__":
    main()
