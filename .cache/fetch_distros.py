#!/usr/bin/env python3


import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = "DistroMapBot/1.0 (research script; https://github.com/distromap)"

#
DISTROS = [
    ("Linux Kernel", "linux_kernel", "Linux_kernel", None),
    ("Debian",       "debian",       "Debian",       "linux_kernel"),
    ("Ubuntu",       "ubuntu",       "Ubuntu",       "debian"),
    ("Linux Mint",   "linux_mint",   "Linux_Mint",   "ubuntu"),
    ("Pop!_OS",      "pop_os",       "Pop!_OS",      "ubuntu"),
    ("Arch Linux",   "arch",         "Arch_Linux",   "linux_kernel"),
    ("Manjaro",      "manjaro",      "Manjaro_Linux","arch"),
    ("EndeavourOS",  "endeavouros",  "EndeavourOS",  "arch"),
    ("Fedora",       "fedora",       "Fedora_(operating_system)", "linux_kernel"),
    ("Nobara",       "nobara",       "Nobara_(operating_system)", "fedora"),
    ("Gentoo",       "gentoo",       "Gentoo_Linux", "linux_kernel"),
    ("Slackware",    "slackware",    "Slackware",    "linux_kernel"),
]

CACHE = Path(".cache/api")
CACHE.mkdir(parents=True, exist_ok=True)


def http_get(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def fetch_summary(wp_title: str) -> dict:
    url = (
        "https://en.wikipedia.org/api/rest_v1/page/summary/"
        + urllib.parse.quote(wp_title.replace(" ", "_"))
    )
    return json.loads(http_get(url))


def fetch_qid(wp_title: str) -> str | None:
    url = (
        "https://en.wikipedia.org/w/api.php?action=query&prop=pageprops"
        + "&format=json&titles=" + urllib.parse.quote(wp_title)
    )
    data = json.loads(http_get(url))
    pages = data.get("query", {}).get("pages", {})
    for _, p in pages.items():
        return p.get("pageprops", {}).get("wikibase_item")
    return None


def fetch_entity(qid: str) -> dict:
    url = f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
    return json.loads(http_get(url))


def first_claim(entity_data: dict, prop: str) -> dict | None:
    e = entity_data["entities"][list(entity_data["entities"].keys())[0]]
    claims = e.get("claims", {}).get(prop, [])
    return claims[0] if claims else None


def claim_maintainer(entity_data: dict, prop: str) -> str | None:
    """Resolve a claim to its human-readable label when possible."""
    c = first_claim(entity_data, prop)
    if not c:
        return None
    snak = c["mainsnak"]
    dv = snak.get("datavalue", {})
    v = dv.get("value")
    if v is None:
        return None
   
    if isinstance(v, dict) and "id" in v:
        
        return f"wd:{v['id']}"
    if isinstance(v, dict) and "time" in v:
        return v["time"].split("T")[0]
    if isinstance(v, dict) and "amount" in v:
        return v["amount"]
    if isinstance(v, dict) and "text" in v:
        return v["text"]
    if isinstance(v, dict) and "value" in v:
        return v["value"]
    return str(v)


def main() -> None:
    results = []
    for display, slug, wp_title, parent in DISTROS:
        print(f">>> {display}  ({wp_title})")
        try:
            summary = fetch_summary(wp_title)
            (CACHE / f"{slug}_summary.json").write_text(
                json.dumps(summary, indent=2, ensure_ascii=False)
            )
            short_desc = summary.get("description", "")
            extract = summary.get("extract", "")
            thumbnail = (
                summary.get("thumbnail", {}).get("source")
                or summary.get("originalimage", {}).get("source")
            )
            wiki_url = (
                summary.get("content_urls", {})
                .get("desktop", {})
                .get("page")
            )
        except Exception as e:
            print(f"  summary fail: {e}")
            short_desc = extract = thumbnail = wiki_url = None

        # QID
        try:
            qid = fetch_qid(wp_title)
        except Exception as e:
            print(f"  qid fail: {e}")
            qid = None


        entity = None
        if qid:
            try:
                entity = fetch_entity(qid)
                (CACHE / f"{slug}_entity.json").write_text(
                    json.dumps(entity, indent=2, ensure_ascii=False)
                )
                official = claim_maintainer(entity, "P856")
                developer = claim_maintainer(entity, "P112")
                inception = claim_maintainer(entity, "P571")
                based_on = claim_maintainer(entity, "P144")
            except Exception as e:
                print(f"  entity fail: {e}")
                qid = None
                official = developer = inception = based_on = None
        else:
            official = developer = inception = based_on = None

        results.append({
            "display": display,
            "slug": slug,
            "wp_title": wp_title,
            "qid": qid,
            "parent": parent,
            "short_desc": short_desc,
            "extract": extract,
            "thumbnail": thumbnail,
            "wiki_url": wiki_url,
            "official_website": official,
            "developer": developer,
            "inception": inception,
            "based_on": based_on,
        })     
        time.sleep(0.4)

    Path(".cache/api/all.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False)
    )
    print(f"\nCached {len(results)} distros in .cache/api/")

    # v0.4 — missing-field report. Helps a maintainer decide which
    # entries to add to .cache/api/manual_overrides.json. We print to
    # stdout; pipe it into a file if you want history.
    optional_fields = ("developer", "inception", "based_on", "official_website")
    print("\n--- missing-field report (Wikidata gaps) ---")
    any_missing = False
    for r in results:
        gaps = [f for f in optional_fields if not r.get(f)]
        if gaps:
            any_missing = True
            print(f"  {r['slug']:14s}  missing: {', '.join(gaps)}")
        if not r.get("qid"):
            print(f"  {r['slug']:14s}  missing: qid")
            any_missing = True
    if not any_missing:
        print("  (none — every distro has every optional field)")
    print("\nOverride any gap by editing .cache/api/manual_overrides.json and re-running")
    print("  python3 .cache/build_distro_files.py\n")


if __name__ == "__main__":
    main()
