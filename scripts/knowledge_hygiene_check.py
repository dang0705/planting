#!/usr/bin/env python3
"""
Minimal knowledge hygiene classifier.

Usage:
  python scripts/knowledge_hygiene_check.py --changed-files file1 file2 ...
  python scripts/knowledge_hygiene_check.py --base origin/main

This script intentionally uses only stdlib. It is a cheap PR/task condition, not a
full documentation auditor.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Area:
    name: str
    patterns: tuple[str, ...]
    docs: tuple[str, ...]
    brv_keys: tuple[str, ...]
    reason: str
    public_contract: bool = True


AREAS: tuple[Area, ...] = (
    Area(
        name="ai-workflow",
        patterns=("AGENTS.md", ".codex/**", ".brvspace", ".brv/context-tree/**", "docs/_sync-map.yml", "docs/_doc-status.yml"),
        docs=("AGENTS.md", ".codex/context-packs.yml", "docs/KNOWLEDGE_GOVERNANCE.md", "docs/ARCHIVE_INDEX.md"),
        brv_keys=("F-AI-WORKFLOW-001",),
        reason="AI default context, dispatch, docs_keeper, ByteRover V4 binding, legacy BRV archive, or context-pack changed",
    ),
    Area(
        name="frontend-app-map",
        patterns=("src/main.js", "src/pages.json", "src/manifest.json", "src/pages/**", "src/components/**", "src/store/**"),
        docs=("docs/CURRENT.md",),
        brv_keys=("F-PROJECT-FRONTEND-001",),
        reason="frontend entry/page/app identity or visible UI surface changed",
    ),
    Area(
        name="frontend-http-core",
        patterns=("src/http-functions/core/**", "src/api/env.js", "src/utils/runtime-env.js"),
        docs=("docs/ACTIVE_CONTRACTS.md", "docs/RUNBOOK.md"),
        brv_keys=("F-ENV-SCHEMA-001",),
        reason="API base, auth header, env/schema routing or production URL guard changed",
    ),
    Area(
        name="diagnose-runtime",
        patterns=(
            "cloudfunctions/diagnose-http/app.js",
            "cloudfunctions/diagnose-http/app/**",
            "cloudfunctions/diagnose-http/handlers/**",
            "cloudfunctions/diagnose-http/domain/**",
            "cloudfunctions/diagnose-http/presenters/**",
            "cloudfunctions/diagnose-http/constants/**",
            "cloudfunctions/diagnose-http/repositories/**",
            "cloudfunctions/diagnose-http/services/**",
            "cloudfunctions/diagnose-http/db/**",
        ),
        docs=("docs/CURRENT.md", "docs/ACTIVE_CONTRACTS.md"),
        brv_keys=("F-DIAG-ENTRY-001", "F-DIAG-ROUTES-002", "F-DIAG-ROUTE-CONFIG-003", "F-DIAG-PUBLIC-RESPONSE-004"),
        reason="diagnosis route/outcome/result/schema source changed",
    ),
    Area(
        name="diagnose-question-package",
        patterns=(
            "cloudfunctions/diagnose-http/app/question-package-response.js",
            "cloudfunctions/diagnose-http/app/manual-symptom-question-start-fast-path.js",
            "cloudfunctions/diagnose-http/app/http-router.js",
            "src/pages/diagnose/follow-up/**",
            "src/utils/diagnose-follow-up-payload.js",
            "docs/tickets/86exv6fnx-diagnose-question-package.md",
            "src/utils/diagnose-result-normalizer.js",
            "src/http-functions/diagnose/client.js",
        ),
        docs=("docs/tickets/86exv6fnx-diagnose-question-package.md", "docs/CURRENT.md", "docs/ACTIVE_CONTRACTS.md"),
        brv_keys=("F-DIAG-QUESTION-PACKAGE-005", "F-DIAG-ROUTE-CONFIG-003"),
        reason="questionPackage/questions, no-follow-up product口径, package submit contract, or old one-question-per-round claim changed",
    ),
    Area(
        name="diagnosis-history-deprecated",
        patterns=("cloudfunctions/diagnosis-history-http/**", "src/http-functions/diagnosis-history/**", "src/http-functions/diagnose/client.js"),
        docs=("docs/ACTIVE_CONTRACTS.md", "docs/CURRENT.md"),
        brv_keys=("F-DIAG-HISTORY-DEPRECATED-006",),
        reason="deprecated diagnosis-history behavior or replacement changed",
    ),
    Area(
        name="storage-identify-weather-plants",
        patterns=(
            "cloudfunctions/storage-http/**",
            "cloudfunctions/identify-http/**",
            "cloudfunctions/weather-http/**",
            "cloudfunctions/plant-catalog-http/**",
            "cloudfunctions/plant-user-http/**",
            "cloudfunctions/auth-user-http/**",
            "src/http-functions/storage/**",
            "src/api/weather.js",
            "src/http-functions/**/client.js",
        ),
        docs=("docs/CURRENT.md", "docs/ACTIVE_CONTRACTS.md"),
        brv_keys=("F-STORAGE-IMAGE-001", "F-IDENTIFY-001", "F-WEATHER-V7-001", "F-PLANT-CATALOG-001", "F-PLANT-USER-001", "F-AUTH-USER-001"),
        reason="non-diagnose HTTP function route/payload/response changed",
    ),
    Area(
        name="local-debug-deploy",
        patterns=("package.json", "scripts/dev/**", "scripts/deploy-*.mjs", "scripts/security/**", "test/e2e/batch/diagnosis/**", "cloudfunctions/**/package.json", "cloudfunctions/**/cloudbase-functions.json"),
        docs=("docs/RUNBOOK.md",),
        brv_keys=("F-LOCAL-GATEWAY-001", "F-DEPLOY-RUNBOOK-001"),
        reason="package script, local gateway, deploy, smoke or secret check changed",
    ),
    Area(
        name="database-schema",
        patterns=("scripts/sql/**", "cloudfunctions/diagnose-http/constants/tables.js", "cloudfunctions/diagnose-http/db/**", "docs/data-base/**"),
        docs=("docs/ACTIVE_CONTRACTS.md",),
        brv_keys=("F-ENV-SCHEMA-001", "F-DATABASE-SCHEMA-001"),
        reason="SQL/schema resolver/data publishing source changed",
    ),
    Area(
        name="archive-docs",
        patterns=("docs/code-logics/**", "docs/new-rules/**", "docs/route规划及outcome瘦身计划/**", "docs/ai-runs/**", "docs/ai-tasks/**", "docs/planting_ai_diagnosis_all_in_one_package/**"),
        docs=("docs/ARCHIVE_INDEX.md", "docs/_doc-status.yml"),
        brv_keys=(),
        reason="archived/retrieval-only docs changed; do not bulk-sync old content",
        public_contract=False,
    ),
)


def norm(path: str) -> str:
    return path.strip().replace("\\", "/").lstrip("./")


def matches(path: str, pattern: str) -> bool:
    p = norm(path)
    pat = norm(pattern)
    return fnmatch.fnmatch(p, pat) or fnmatch.fnmatch(p, pat.rstrip("/**"))


def changed_files_from_git(base: str) -> list[str]:
    cmd = ["git", "diff", "--name-only", f"{base}...HEAD"]
    try:
        result = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    except subprocess.CalledProcessError as exc:
        print(exc.stderr.strip(), file=sys.stderr)
        raise SystemExit(exc.returncode)
    return [norm(line) for line in result.stdout.splitlines() if line.strip()]


def classify(files: Iterable[str]) -> dict:
    changed = [norm(f) for f in files if norm(f)]
    affected = []
    required_docs: set[str] = set()
    brv_keys: set[str] = set()
    public_contract = False

    for area in AREAS:
      matched = sorted({f for f in changed for pat in area.patterns if matches(f, pat)})
      if not matched:
        continue
      affected.append({
          "area": area.name,
          "matched_files": matched,
          "reason": area.reason,
          "docs": list(area.docs),
          "brv_keys": list(area.brv_keys),
          "public_contract": area.public_contract,
      })
      required_docs.update(area.docs)
      brv_keys.update(area.brv_keys)
      public_contract = public_contract or area.public_contract

    return {
        "changed_files": changed,
        "status": "patch-required" if affected else "no-op",
        "affected_areas": affected,
        "active_docs_to_check": sorted(required_docs),
        "brv_keys_to_check": sorted(brv_keys),
        "public_contract_or_ai_context_affected": public_contract,
        "notes": [
            "This is a classifier, not proof that docs are wrong.",
            "docs_keeper should read only matched source files, active docs, and relevant diff hunks.",
            "Archived blueprint docs should be marked stale/superseded, not bulk-synchronized.",
            "The current memory source is the .brvspace-bound ByteRover V4 space; repo .brv/context-tree/** is legacy archive material.",
            "For diagnosis question-package work, old follow-up/one-question-per-round claims are superseded unless source-verified by current code/task.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", help="Git base ref, e.g. origin/main")
    parser.add_argument("--changed-files", nargs="*", help="Explicit changed file list")
    parser.add_argument("--fail-on-patch-required", action="store_true")
    args = parser.parse_args()

    if args.changed_files:
        files = args.changed_files
    elif args.base:
        files = changed_files_from_git(args.base)
    else:
        parser.error("Provide --changed-files or --base")

    result = classify(files)
    print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.fail_on_patch_required and result["status"] == "patch-required":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
