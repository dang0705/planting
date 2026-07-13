# skill

## 4.2.0

### Minor Changes

- `record` now accepts `--batch --input <ndjson-file>` to write many topics in one call. The input file is line-delimited JSON; each line carries `{path, html, overwrite?}`. One auth check and one `rebuildManifest` + `rebuildIndex` cover the whole batch instead of N rebuilds — the dogfooding case (16-topic consolidation seeded into a 500-topic space) drops measurably (in-process bench: 1.46× faster; real-world CLI invocations save additional ~50-100ms node-startup × N, projecting to ~3-4× for the 16-call case). Per-line errors are reported in `failed[]` and don't abort the run; malformed-JSON, missing required fields, and writer rejections all flow to `failed[]` with a per-line error message. Single-record (no `--batch`) behavior unchanged. Bench harness lives in `apps/skill/test/_bench/record-latency.test.ts` (skipped in CI; flip the `.skip` to re-measure).

## 4.1.1

### Patch Changes

- `link` now refuses to add a `related=` edge to a target topic that doesn't exist on disk — the previous behavior silently created a dangling ref. Both single and `--bidirectional` add modes pre-flight target existence and return `{ok: false, error: 'no topic at "<missing>"'}` before any write, so partial-write windows are gone. `--remove` is exempt: removing a ref to a missing target is the recovery path for cleaning up already-dangling edges. Mirrors `move`'s dangling-ref discipline.

## 4.1.0

### Minor Changes

- Add `brv link "<a>" "<b>" [--bidirectional] [--remove]` for adding or removing a `related=` cross-link between two topics atomically. Uses a byte-preserving attribute-patch primitive — safe for topics whose summaries contain `>` characters (e.g. `->` arrows), which the prior workaround of regex-rewriting the `<bv-topic>` opening tag silently corrupted. Idempotent: re-linking an existing edge returns `op: "noop"`; removing a non-existent edge is also a noop. Closes the "amend the graph" gap that was the highest-leverage agent maintenance op surfaced by real curation work — paired with the recently-shipped `read --raw` and `merge --title`, this completes the amend surface that lets agents maintain a knowledge base instead of just write into one.

## 4.0.11

### Patch Changes

- `read` now accepts `--raw` to surface a `rawHtml` field containing the on-disk HTML byte-for-byte. Without the flag, the `elements[].text` payload is whitespace-collapsed by `getInnerText` — re-recording from a `read` result silently degrades inner `<ul>`/`<li>`/`<strong>` structure. With `--raw`, agents can round-trip topics through `record --html` without losing formatting and without bypassing the engine. Purely additive: existing callers see the same payload shape; `rawHtml` is absent unless requested.

## 4.0.10

### Patch Changes

- `merge` now accepts `--title "…"` for the survivor, alongside the existing `--summary`, `--tags`, `--keywords`, `--reason`, `--related` flags. The survivor's title goes stale immediately after most merges (the merged content is broader than either input), and there was no way to fix it in the same call — `merge a b --title "Combined topic"` closes that gap. Without the flag, behavior is unchanged: survivor keeps its own title, falling back to the loser's only when the survivor's is empty.

## 4.0.9

### Patch Changes

- Stamp a ByteRover User-Agent on outgoing skill requests, harden synced move intent handling, encrypt daemon device refresh tokens, bind the onboarding recall space correctly, and include stale candidate counts in prune-dream analytics.

## 4.0.8

### Patch Changes

- `move` now supports in-space rename / move / re-parent via a new `--to-path` flag, in addition to the existing cross-space `--from-space` + `--to-space` shape. Path-based knowledge tree means rename / move / re-parent are all the same operation (change the path string), so one command + one flag covers every shape: `brv move "auth/jwt" --to-path "security/jwt-refresh"`. The destination's `<bv-topic path="…">` attribute is rewritten to match the new path. In-space moves emit a single `rename` reconciler event, so sibling `related=` refs targeting the source path are **atomically rewritten** to the new path in one pass (no transient `?orphan=1` soft-marks visible in mid-batch state) and the signal sidecar carries over so importance / recency / maturity survive the move. Mutually exclusive with `--from-space`/`--to-space` — cross-space + rename in one shot is not supported in this release. SKILL.md updated to document the new shape.
- `move` (both in-space and cross-space branches) now records a `delete-intent` for the source path before unlinking, so the next reconcile cycle force-deletes the source's cloud copy instead of restoring it. Without this, the source resurrected on the next sync — a cross-space move "duplicated" (topic ended up in both spaces); an in-space rename never stuck. Same pattern as `prune`/`merge`/`synthesize` from 4.0.7.

## 4.0.7

### Patch Changes

- `prune`, `merge`, and `synthesize` now record a `delete-intent` in the space's sync-state dir before each local delete, so the daemon's reconcile cycle force-deletes the matching cloud copy instead of resurrecting it on the next sync. Without this, agent-driven deletions never stuck: the local file disappeared, then reappeared on the next reconcile because the missing-local-but-present-in-cloud topic was treated as "lost data, restore from remote." Mirrors the desktop UI's existing intent-recording pattern; best-effort, never fails the user's command.

## 4.0.6

### Patch Changes

- Capture the raw query text on `query_completed` (truncated at 512 chars), so usefulness dashboards can label "Used for these tasks" rows with the actual query instead of an opaque `task_id`. Field is optional — existing rows stay valid, and a bare `search` with no positionals emits the event without it.

## 4.0.5

### Patch Changes

- Emit a `read_completed` analytics event on direct `brv read` so usefulness dashboards see direct-read activity. The event mirrors `query_completed.read_paths_with_metadata` shape so downstream rollups can union read + query streams without per-event branching. Recall stays uninstrumented as before (system caller).

## 4.0.4

### Patch Changes

- Retrieval citation block now embeds the topic URL into the title as a Markdown link, hiding the long URL behind the clickable title. Adds three per-hit evidence lines beneath the title: a `"snippet"` preview of the matched context (with mid-token-cut sanitization), a `Recalled N×` badge from the second recall onward, and an `Updated by <agent> · <relative>` trailer within a 30-day window.

## 4.0.3

### Patch Changes

- Point the shipped skill's default service URLs at v4-\*.byterover.dev.

## 4.0.2

### Patch Changes

- Resolve `team_id` authoritatively; never fall back to "Personal".
- Batch recall analytics per space.

## 4.0.1

### Patch Changes

- Accept non-v4 UUID space ids (previously only v4 UUIDs were recognized).

## 4.0.0

### Major Changes

- ByteRover 4.0.0 — official release.
