#!/usr/bin/env python3
"""
DistroMap synthesis step.

This script is self-contained: running it from the `frontend/` directory
regenerates the dataset that the React app and the serverless API read
at runtime. No other scripts or data live outside this folder.

Pipeline:
  - Read every JSON file under src/data/_slices/*.json
  - Deduplicate records by slug (keep the most-detailed one)
  - Validate parent references; auto-attach `linux_kernel` to family roots
  - Compute depth (BFS from `linux_kernel`) and the inverse `children[]`
  - Build src/data/distros.json — the full record the API + SPA read
  - Build src/data/graph.json   — nodes + edges for the visual graph
  - Build src/data/layout.json  — precomputed (x, y) per node

Run via:  npm run synthesize        (from frontend/)
  Or:     python3 scripts/synthesize.py
"""
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import urlparse

# This script lives at frontend/scripts/synthesize.py; `frontend/` is
# the root everything else resolves from. The data + slices all live
# inside the same folder so the whole app is self-contained — clone
# `frontend/`, run `npm install && npm run synthesize && npm run dev`,
# and you have the full app on http://127.0.0.1:5173.
ROOT = Path(__file__).resolve().parent.parent  # .../frontend
SLICES_DIR = ROOT / "src" / "data" / "_slices"
OUT_DISTROS = ROOT / "src" / "data" / "distros.json"
OUT_GRAPH = ROOT / "src" / "data" / "graph.json"
OUT_LAYOUT = ROOT / "src" / "data" / "layout.json"

TAU = math.pi * 2
MIN_STEP_RAD = TAU / 240
MAX_RENDER_DEPTH = 4
RADIUS_BY_DEPTH = {0: 0, 1: 240, 2: 460, 3: 660, 4: 860}


def load_slices() -> list[dict]:
    if not SLICES_DIR.is_dir():
        sys.exit(f"slices dir not found: {SLICES_DIR}")
    records: list[dict] = []
    for fp in sorted(SLICES_DIR.glob("*.json")):
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  WARN: skipping {fp.name}: {e}")
            continue
        if not isinstance(data, list):
            print(f"  WARN: {fp.name} is not a list, skipping")
            continue
        for r in data:
            records.append({"__slice__": fp.stem, **r})
        print(f"  loaded {fp.stem}.json: {len(data)} records")
    return records


def favicon_url(site: str | None) -> str | None:
    if not site:
        return None
    try:
        host = urlparse(site).hostname
    except ValueError:
        return None
    if not host:
        return None
    return f"https://www.google.com/s2/favicons?domain={host}&sz=64"


def dedupe(records: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for r in records:
        slug = r.get("slug", "")
        if not slug:
            print(f"  WARN: {r.get('name','?')!r} has no slug, skipping")
            continue
        if slug in seen:
            # Prefer the more-detailed record (larger file? more fields filled).
            prev = seen[slug]
            prev_filled = sum(1 for v in prev.values() if v)
            cur_filled = sum(1 for v in r.values() if v)
            if cur_filled > prev_filled:
                seen[slug] = r
            # else keep prev
        else:
            seen[slug] = r
    out = list(seen.values())
    out.sort(key=lambda d: (d.get("family", "z"), d.get("name", "")))
    return out


def validate(records: list[dict]) -> tuple[list[dict], list[str]]:
    """Return (cleaned_records, warnings). Auto-attach linux_kernel if missing
    and drop records whose parent doesn't exist."""
    slugs = {r["slug"] for r in records}
    if "linux_kernel" not in slugs:
        records.insert(0, {
            "id": "linux_kernel",
            "name": "Linux Kernel",
            "slug": "linux_kernel",
            "family": "kernel",
            "parents": [],
            "based_on": None,
            "kernel_root": "Linux Kernel",
            "first_release": "1991",
            "latest_release": "6.x",
            "status": "Active",
            "release_model": "N/A",
            "package_manager": "N/A",
            "package_format": "N/A",
            "desktop_defaults": [],
            "init_system": "N/A",
            "architecture": ["x86_64", "aarch64", "armv7", "riscv64", "ppc64le", "s390x"],
            "license": "GPL-2.0",
            "website": "https://kernel.org",
            "source_code": "https://git.kernel.org",
            "description": "The Linux kernel is a free and open-source Unix-like kernel that is the foundation of every Linux distribution.",
            "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Tux.svg/330px-Tux.svg.png",
            "color": "#F5A623",
            "country": "Finland",
            "developer": "Linus Torvalds",
            "maintainer": "Linux Kernel maintainers",
            "immutable": False,
            "rolling": True,
            "lts": False,
            "gaming": False,
            "privacy": False,
            "security": False,
            "education": False,
            "server": True,
            "embedded": True,
            "container": False,
            "cloud": True,
            "arm": True,
            "discontinued_year": None,
        })
        slugs.add("linux_kernel")
    warnings: list[str] = []
    cleaned: list[dict] = []
    for r in records:
        slug = r.get("slug", "")
        parents = r.get("parents", [])
        # parents may be missing or empty
        if not isinstance(parents, list):
            parents = []
        # Reject any parent that doesn't exist
        for p in parents:
            if p not in slugs and p != "linux_kernel":
                warnings.append(f"  {slug}: unknown parent '{p}' (dropped)")
        parents = [p for p in parents if p in slugs]
        # If linux_kernel-style family roots (debian, arch, fedora, etc.) lack
        # a parent, attach linux_kernel.
        if not parents and slug != "linux_kernel":
            parents = ["linux_kernel"]
        r["parents"] = parents
        cleaned.append(r)
    return cleaned, warnings


def compute_depth_and_children(records: list[dict]) -> dict[str, int]:
    """BFS from linux_kernel; also build children[] on each record."""
    by_slug = {r["slug"]: r for r in records}
    children: dict[str, list[str]] = defaultdict(list)
    for r in records:
        for p in r["parents"]:
            children[p].append(r["slug"])
    # attach children
    for r in records:
        kids = sorted(set(children.get(r["slug"], [])))
        r["children"] = kids
    # BFS for depth
    depth: dict[str, int] = {}
    queue: deque[tuple[str, int]] = deque()
    for r in records:
        if not r["parents"] or (len(r["parents"]) == 1 and r["parents"][0] == "linux_kernel"):
            # family root: depth 1
            depth[r["slug"]] = 1 if r["slug"] != "linux_kernel" else 0
            queue.append((r["slug"], depth[r["slug"]]))
    if "linux_kernel" not in depth:
        depth["linux_kernel"] = 0
        queue.appendleft(("linux_kernel", 0))
    while queue:
        slug, d = queue.popleft()
        for c in children.get(slug, []):
            if c not in depth or depth[c] > d + 1:
                depth[c] = d + 1
                queue.append((c, d + 1))
    # Fallback: any orphan gets a large depth
    for r in records:
        if r["slug"] not in depth:
            depth[r["slug"]] = 99
    return depth


def compute_angles(records: list[dict]) -> dict[str, float]:
    """Polar angle for each node, depth-aware. Siblings of a wide parent get
    compressed to a minimum step so they don't overlap."""
    by_slug = {r["slug"]: r for r in records}
    angles: dict[str, float] = {}
    roots = sorted([r["slug"] for r in records if r["slug"] == "linux_kernel"] or
                   [r["slug"] for r in records if r.get("parent") is None])
    # We treat the family roots (children of linux_kernel) as the "depth 1" ring.
    family_roots = sorted([r["slug"] for r in records
                           if r["parents"] and r["parents"][0] == "linux_kernel" and r["slug"] != "linux_kernel"])
    if "linux_kernel" in by_slug:
        angles["linux_kernel"] = 0
    start = -math.pi / 2
    if not family_roots:
        family_roots = [r["slug"] for r in records if r["slug"] != "linux_kernel"][:1]
    for i, slug in enumerate(family_roots):
        a = start + (i / max(len(family_roots), 1)) * TAU
        angles[slug] = a

    def recurse(slug: str) -> None:
        kids = sorted({c for c in by_slug.get(slug, {}).get("children", [])})
        if not kids:
            return
        parent_angle = angles.get(slug, 0)
        # angular spread: tighter when fewer kids, looser when many — but
        # never below MIN_STEP_RAD per neighbour.
        step = max(MIN_STEP_RAD, TAU / max(len(kids) * 1.5, 24))
        for i, k in enumerate(kids):
            offset = (i - (len(kids) - 1) / 2) * step
            a = parent_angle + offset
            # normalise to [-π, π]
            while a > math.pi:
                a -= TAU
            while a < -math.pi:
                a += TAU
            angles[k] = a
            recurse(k)

    for r in family_roots:
        recurse(r)

    # Fallback: any record without an angle gets a deterministic slot
    for r in records:
        if r["slug"] not in angles:
            # hash-based angle
            angles[r["slug"]] = (hash(r["slug"]) % 1000) / 1000.0 * TAU
    return angles


def write_layout(records: list[dict], depth: dict[str, int], angles: dict[str, float]) -> dict:
    positions: dict[str, dict[str, float]] = {}
    for r in records:
        slug = r["slug"]
        d = min(depth.get(slug, 1), MAX_RENDER_DEPTH)
        ang = angles.get(slug, 0)
        radius = RADIUS_BY_DEPTH.get(d, 0)
        positions[slug] = {
            "x": round(math.cos(ang) * radius, 2),
            "y": round(math.sin(ang) * radius, 2),
        }
    return {"positions": positions}


def write_graph(records: list[dict], depth: dict[str, int]) -> dict:
    nodes = []
    for r in records:
        nodes.append({
            "id": r["slug"],
            "name": r.get("name", r["slug"]),
            "family": r.get("family", "other"),
            "depth": depth.get(r["slug"], 99),
            "status": r.get("status", "Active"),
        })
    edges = []
    for r in records:
        for p in r.get("parents", []):
            edges.append({"from": p, "to": r["slug"]})
    return {"nodes": nodes, "edges": edges}


def build_frontend_record(r: dict, depth: int) -> dict:
    """Convert a slice record into the Vite-friendly Distro shape."""
    name = r.get("name") or r.get("slug", "?")
    return {
        # Identity
        "id": r.get("id", r["slug"]),
        "slug": r["slug"],
        "name": name,
        "display": name,
        "family": r.get("family", "other"),
        "parents": r.get("parents", []),
        "parent": (r.get("parents", [None])[0] if r.get("parents") else None),
        "children": r.get("children", []),
        "based_on": r.get("based_on"),
        "kernel_root": "Linux Kernel",
        # Release timeline
        "first_release": r.get("first_release"),
        "latest_release": r.get("latest_release"),
        "status": r.get("status", "Active"),
        "discontinued_year": r.get("discontinued_year"),
        "release_model": r.get("release_model", "Unknown"),
        # Package / system
        "package_manager": r.get("package_manager", "Unknown"),
        "package_format": r.get("package_format", "Unknown"),
        "init_system": r.get("init_system", "Unknown"),
        "architecture": r.get("architecture", []),
        "desktop_defaults": r.get("desktop_defaults", []),
        # Provenance
        "license": r.get("license", "Free / open-source"),
        "website": r.get("website"),
        "source_code": r.get("source_code"),
        "description": r.get("description", ""),
        "logo": r.get("logo"),
        "color": r.get("color", "#888888"),
        "country": r.get("country"),
        "developer": r.get("developer"),
        "maintainer": r.get("maintainer"),
        # Boolean flags
        "immutable": bool(r.get("immutable", False)),
        "rolling": bool(r.get("rolling", False)),
        "lts": bool(r.get("lts", False)),
        "gaming": bool(r.get("gaming", False)),
        "privacy": bool(r.get("privacy", False)),
        "security": bool(r.get("security", False)),
        "education": bool(r.get("education", False)),
        "server": bool(r.get("server", False)),
        "embedded": bool(r.get("embedded", False)),
        "container": bool(r.get("container", False)),
        "cloud": bool(r.get("cloud", False)),
        "arm": bool(r.get("arm", False)),
        # Legacy fields used by old components
        "qid": None,
        "short_desc": r.get("description", "")[:280] if r.get("description") else "",
        "extract": r.get("description", ""),
        "thumbnail": r.get("logo"),
        "favicon_url": favicon_url(r.get("website")),
        "wiki_url": f"https://en.wikipedia.org/wiki/{name.replace(' ', '_')}",
        "official_website": r.get("website"),
        "inception": r.get("first_release"),
        "based_on_label": r.get("based_on"),
        "popularity": 3,
        "popularity_signals": None,
        "depth": depth,
    }


def main() -> None:
    print("→ loading slices…")
    raw = load_slices()
    print(f"  total raw: {len(raw)}")

    print("→ dedupe…")
    records = dedupe(raw)
    print(f"  unique slugs: {len(records)}")

    print("→ validate (parents, auto-attach kernel)…")
    records, warnings = validate(records)
    for w in warnings:
        print(w)
    print(f"  records after validation: {len(records)}")

    print("→ compute depth + children…")
    depth = compute_depth_and_children(records)
    max_depth = max(depth.values()) if depth else 0
    print(f"  max depth: {max_depth}")

    print("→ compute angles + positions…")
    angles = compute_angles(records)
    layout = write_layout(records, depth, angles)

    print("→ build graph…")
    graph = write_graph(records, depth)

    print("→ build distros.json…")
    distros_out = [build_frontend_record(r, depth[r["slug"]]) for r in records]

    print("→ writing files…")
    OUT_DISTROS.parent.mkdir(parents=True, exist_ok=True)
    OUT_DISTROS.write_text(
        json.dumps(distros_out, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    OUT_GRAPH.write_text(
        json.dumps(graph, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    OUT_LAYOUT.write_text(
        json.dumps(layout, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print("\n────────────────────────────────────────")
    print(f"  total:    {len(distros_out)} distros")
    print(f"  active:   {sum(1 for d in distros_out if d['status'] == 'Active')}")
    print(f"  discontin:{sum(1 for d in distros_out if d['status'] == 'Discontinued')}")
    print(f"  families: {len({d['family'] for d in distros_out})}")
    print(f"  max depth:{max_depth}")
    print(f"  output:   {OUT_DISTROS}")
    print(f"            {OUT_GRAPH}")
    print(f"            {OUT_LAYOUT}")


if __name__ == "__main__":
    main()
