#!/usr/bin/env python3
import importlib.util
import re
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("collector", HERE / "_tmp_qhz_fetch_plant_images.py")
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

_last_api = 0.0


def throttled_query(search_term, limit=20):
    global _last_api
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "generator": "search",
        "gsrnamespace": 6,
        "gsrsearch": search_term,
        "gsrlimit": min(limit, 20),
        "prop": "imageinfo|categories",
        "iiprop": "url|extmetadata|size|mime",
        "iiurlwidth": 1600,
        "cllimit": "max",
        "maxlag": 5,
    }
    for attempt in range(8):
        gap = 2.6 - (time.monotonic() - _last_api)
        if gap > 0:
            time.sleep(gap)
        _last_api = time.monotonic()
        r = collector.SESSION.get(collector.COMMONS_API, params=params, timeout=45)
        if r.status_code == 429:
            retry = r.headers.get("Retry-After")
            try:
                wait = max(float(retry), 10.0)
            except (TypeError, ValueError):
                wait = min(15.0 * (attempt + 1), 90.0)
            print(f"  RATE_LIMIT wait={wait:.0f}s term={search_term}", file=sys.stderr, flush=True)
            time.sleep(wait)
            continue
        if r.status_code in (502, 503, 504):
            wait = min(5.0 * (attempt + 1), 30.0)
            print(f"  TRANSIENT {r.status_code} wait={wait:.0f}s", file=sys.stderr, flush=True)
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r.json().get("query", {}).get("pages", [])
    raise RuntimeError(f"Commons API retries exhausted for {search_term}")


orig_score = collector.candidate_score


def safer_score(page, scientific, cn_name):
    score = orig_score(page, scientific, cn_name)
    if score is None:
        return None
    title = page.get("title", "").replace("_", " ")
    base = collector.norm_taxon(scientific)
    parts = [x for x in re.split(r"\s+", base.lower()) if x and x != "x"]
    target_genus = parts[0] if parts else ""
    target_species = parts[1] if len(parts) > 1 else ""
    low = title.lower()
    # A filename explicitly naming a different epithet is a strong warning; reject it.
    if target_species:
        named = re.findall(r"\b([A-Z][a-zA-Z-]+)\s+([a-z][a-zA-Z-]{2,})\b", title)
        if named and target_species not in low:
            # If the title clearly contains another Latin binomial, don't accept category/description leakage.
            return None
    if target_species and target_species in low:
        score += 55
    if target_genus and target_genus in low:
        score += 25
    if base.lower() in low:
        score += 80
    return score


def choose_candidate(row):
    scientific = row["scientific"]
    cn = row["name"]
    raw = scientific.replace("×", "x").replace(" spp.", "").replace(" sp.", "").strip()
    base = collector.norm_taxon(scientific)
    terms = []
    if raw:
        terms.append(f'"{raw}"')
    if base and base != raw:
        terms.append(f'"{base}"')
    # One unquoted scientific fallback catches files whose metadata separates tokens.
    if base:
        terms.append(base)
    terms.append(f'"{cn}"')
    # De-duplicate while preserving order, and cap at 3 requests/plant.
    terms = list(dict.fromkeys(terms))[:3]
    seen = set()
    scored = []
    for term in terms:
        try:
            pages = throttled_query(term, 20)
        except Exception as e:
            print(f"WARN search {cn} {term}: {e}", file=sys.stderr, flush=True)
            continue
        for p in pages:
            title = p.get("title", "")
            if title in seen:
                continue
            seen.add(title)
            s = safer_score(p, scientific, cn)
            if s is not None:
                scored.append((s, p))
        if scored and max(x[0] for x in scored) >= 120:
            break
    if not scored:
        return None
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0]


collector.query_commons = throttled_query
collector.candidate_score = safer_score
collector.choose_candidate = choose_candidate

if __name__ == "__main__":
    collector.main()
