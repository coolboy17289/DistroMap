#!/usr/bin/env python3
"""
v0.6 — Fetch popularity signals per distro and write a JSON the build
script can merge.

For each slug in .cache/api/all.json, we hit the Wikipedia pageviews
REST API (no auth, no key, CC-BY-SA) and average the last 30 days of
`en.wikipedia / all-access / all-agents / <wp_title> / daily
pageviews`. We then:

  1. log-transform the daily-count column to widen the tail, and
  2. quantile-bin into a 1-5 score, so the linux_kernel (huge
     pageviews), Debian, Ubuntu, etc. don't all crowd the top bucket.

DistroWatch *would* have been a second signal ("blended"), but the
DistroWatch site aggressively blocks scripted traffic and the public
ToS discourages scraping. We ship pageviews-only in v0.6 and leave a
`signals` list shape in popularity.json so a DistroWatch rank can be
appended without breaking the build script.

Output: .cache/api/popularity.json (shape documented in POPULARITY)
"""

from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

UA = "DistroMapBot/1.0 (research script; https://github.com/distromap)"
SRC = Path(".cache/api/all.json")
OUT = Path(".cache/api/popularity.json")

WINDOW_DAYS = 30
SLEEP_S = 1.0  # Wikimedia polite rate: ~1 req/s for unauth'd scraping


# ── HTTP ──────────────────────────────────────────────────────────────


def http_get(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def fetch_pageviews(wp_title: str, end: date, days: int) -> dict[str, int]:
    """
    Returns {YYYYMMDD: views}. Missing/skipped days are absent, not 0.
    """
    start = end - timedelta(days=days - 1)
    url = (
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
        f"en.wikipedia/all-access/all-agents/{urllib.parse.quote(wp_title, safe='_')}/"
        f"daily/{start.strftime('%Y%m%d')}/{end.strftime('%Y%m%d')}"
    )
    raw = json.loads(http_get(url))
    return {item["timestamp"]: int(item["views"]) for item in raw.get("items", [])}


# ── Scoring ────────────────────────────────────────────────────────────


def quantile_bin(values: list[float]) -> list[int]:
    """
    Assign 1..5 by quantile so a skewed distribution still spreads out.
    Linear scaling on a power-law column always collapses into the top
    bucket; quantile binning is the standard fix and is fair enough
    for a 1-5 star label.
    """
    n = len(values)
    if n == 0:
        return []
    if n < 5:
        # Not enough data for quintiles – fall back to rank-order.
        return [(sorted(values).index(v) + 1) for v in values]
    sorted_pairs = sorted(enumerate(values), key=lambda p: p[1])
    out = [0] * n
    bucket = max(1, n // 5)
    for rank, (orig_idx, _v) in enumerate(sorted_pairs):
        out[orig_idx] = min(5, rank // bucket + 1)
    return out


def log1p(x: float) -> float:
    return math.log1p(max(0.0, x))


POPULARITY: dict = {
    "_doc": (
        "Per-slug { slug: { pageviews_30d: avg daily views over 30-day "
        "window, score: 1-5 from log+quantile bin, source: "
        "'wikipedia-pageviews', fetched_at: YYYY-MM-DD }. Top-level "
        "underscore keys are ignored by the build script."
    ),
    "_meta": {
        "window_days": WINDOW_DAYS,
        "transform": "log1p + quintile bin",
        "signals_in_use": ["wikipedia-pageviews"],
        "excluded_signals": {"distrowatch": "ToS discourages scraping; site actively blocks"},
    },
    # slug -> { pageviews_30d, score, source, fetched_at }
}


# ── Pipeline ───────────────────────────────────────────────────────────


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}. Run .cache/fetch_distros.py first.")

    data = json.loads(SRC.read_text(encoding="utf-8"))
    end = date.today()
    counter = 0

    log_values: list[float] = []
    raw_pageviews: list[int] = []
    slugs_in_order: list[str] = []

    # First pass: hit the pageviews API once per distro.
    for d in data:
        slug = d["slug"]
        wp_title = d["wp_title"]
        try:
            ts = fetch_pageviews(wp_title, end, WINDOW_DAYS)
        except Exception as e:
            print(f"  pageviews fail  {slug:18s} {e}")
            raw_pageviews.append(0)
            log_values.append(log1p(0))
            slugs_in_order.append(slug)
            continue

        if not ts:
            print(f"  pageviews empty {slug:18s} -- treating as 0")
            avg = 0
        else:
            avg = sum(ts.values()) // len(ts)
        print(f"  pageviews ok    {slug:18s} avg/day={avg:>6d}")

        raw_pageviews.append(avg)
        log_values.append(log1p(avg))
        slugs_in_order.append(slug)

        counter += 1
        if counter < len(data):
            time.sleep(SLEEP_S)

    # Second pass: bin. We bin on log1p so a power-law distribution
    # doesn't pile everyone into the top bucket.
    bins = quantile_bin(log_values)

    POPULARITY["_meta"]["fetched_at"] = end.isoformat()

    for slug, raw, binv in zip(slugs_in_order, raw_pageviews, bins):
        POPULARITY[slug] = {
            "pageviews_30d": raw,
            "score": int(binv),
            "source": "wikipedia-pageviews" if raw > 0 else None,
            "fetched_at": end.isoformat(),
        }

    OUT.write_text(json.dumps(POPULARITY, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {OUT} with {len(data)} entries.")


if __name__ == "__main__":
    main()
