---
name: migrate-v3-to-v4
description: "Migrate a self-hosted ByteRover v3 VPS to v4 — ALL of the user's spaces — driven by you (the agent). For every v3 project on the box (a folder with `.brv/context-tree/*.md`) it creates the v4 space, converts the markdown to v4 HTML, and materializes it, using the bundled `migrate-v3` command (which follows the desktop migration logic). The only input is a v4 API key (the auth step). Use when a user wants to migrate a self-hosted / VPS ByteRover v3 instance to v4. Runs ON the VPS where the v3 data + install live."
metadata:
  version: 4.2.0
---

# Migrate ByteRover v3 → v4 (self-hosted / VPS)

You (the agent) drive this. It migrates **every** v3 project on this VPS into its
own v4 space. Work **one step at a time** and confirm each step's **gate** before
the next — never batch them. If a gate fails, **STOP, fix it, and resume from that
step**. The v3 source is only touched at the end: step 5 **backs it up** (to
`Documents/ByteRover_Backups`, like the desktop app) **before** removing it, and
only after step 4 verifies — so a failure always leaves v3 intact.

This is the **unpaid / self-serve** path (the user's own API key). Paid CGIT data
is handled by a separate service-credentialed worker — not this skill.

## How it works

The bundled `migrate-v3` command does, per project, exactly what the ByteRover
**desktop** migration does:

1. **Create the v4 space** — `POST /api/teams/{teamId}/spaces` (your API key as Bearer).
2. **Convert + materialize** — each `.md` → `<bv-topic>` HTML, written into
   `<data-dir>/projects/<spaceId>/context-tree/` (+ `space.json`, folder binding).
3. **Idempotency marker** — re-runs reuse each project's `spaceId` (no duplicates).

The **sync daemon** (started by the auth step) then pushes the new spaces to v4.
You do **not** use `migrate.mjs` — `migrate-v3` replaces it for this flow.

## Prerequisites (one input)

- **Node ≥ 18** on the VPS (`node -v`).
- A v4 **API key** (`brv_…`) — the only input. Spaces are created automatically;
  there is no target-space to choose.

---

## Step 0 — Install the v4 ByteRover skill

```sh
npx -y skills add campfirein/skills@skill-v<version>
```
**Gate:** the skill `scripts/` dir exists (`auth.mjs`, `migrate-v3.mjs`).

## Step 1 — Authenticate (device login OR API key — either works)

```sh
node scripts/auth.mjs                 # device code: approve in the browser
node scripts/auth.mjs status          # wait until authenticated
# headless alternative (API key):
#   printf '%s' 'brv_xxx' > key && chmod 600 key && node scripts/auth.mjs --key-file key
```
**Gate:** `status` reports authenticated. `migrate-v3` reuses this credential —
a **device-code session is sufficient** (the web API resolves the daemon session
read-only for space creation), and an API key works too. No separate key needed.

## Step 2 — Detect every v3 project

```sh
node scripts/migrate-v3.mjs detect
```
Scans `$HOME` by default. Narrow it with `--scan-root <dir>` (e.g. `~/workspace`),
or target exact ones with `--project <dir>` (repeatable).
**Gate:** the listed projects + `mdFiles` counts look right. **If the list is
empty,** your v3 data isn't under the scan root — point `--scan-root` at where the
`.brv/context-tree` folders live (`find ~ -type d -name context-tree -path '*/.brv/*'`).

## Step 3 — Migrate everything (dry-run, then real)

```sh
node scripts/migrate-v3.mjs run --dry-run    # preview: per-project counts + fidelity warnings, NO changes
node scripts/migrate-v3.mjs run              # create spaces + convert + materialize, every project
```
**Gate:** result `ok: true`; each project shows a `spaceId` and a `converted`
count. Note **fidelity warnings** (see below). If a project reports an `error`,
read the troubleshooting table, fix it, and **re-run** — finished projects are
reused (idempotent), only the failed one is retried.

## Step 4 — Verify, and let the daemon sync

```sh
node scripts/migrate-v3.mjs verify           # lists created spaces + their html topic counts
```
The daemon from step 1 pushes the new spaces to v4 (signed). Confirm on the
**server** — the ByteRover desktop space view, or
`node scripts/query.mjs --space "<name>" "<a migrated topic>"`.
**Gate:** every migrated space is present in v4 with the expected topics. **Do not
proceed to step 5 until this passes.**

## Step 5 — Back up + remove the v3 source data (`.brv/`)

After verify, back up each migrated project's `.brv/` the way the desktop app does
— copy the whole `.brv/` into **`Documents/ByteRover_Backups/<project>/brv/`** with
a `manifest.json`, then remove the original `.brv/`:

```sh
node scripts/migrate-v3.mjs cleanup --dry-run     # preview backup + removal
node scripts/migrate-v3.mjs cleanup --yes         # copy .brv → ~/Documents/ByteRover_Backups/, then remove it
```
Backs up under `~/Documents/ByteRover_Backups` by default (override the parent with
`--backup-dir <dir>`); the `manifest.json` makes it restorable. Only removes a
project's `.brv/` once its v4 space is materialized.
**Gate:** each project shows `backedUpTo` + a `folder`.

> The v3 CLI + old connectors are removed **separately** (already handled) — this
> skill only migrates the data and backs up the v3 source.

---

## `migrate-v3` reference

| Task (subcommand) | What it does |
|---|---|
| `detect` | scan + list v3 projects (no changes) |
| `run` | per project: create space → convert → materialize → marker |
| `verify` | list migrated spaces + their html topic counts on disk |
| `cleanup` | back up each project's `.brv/` → `Documents/ByteRover_Backups/` then remove it (needs `--yes`) |

| Flag | Meaning |
|------|---------|
| `--dry-run` | (run) preview only — no spaces created, nothing written |
| `--scan-root <dir>` | where to scan (default `$HOME`; repeatable) |
| `--project <dir>` | migrate exact project root(s); skips the scan (repeatable) |
| `--team <id>` | target team (default: a team you own, via `GET /api/teams`) |
| `--space-type team\|personal` | space type to create (default `team`) |
| `--api-key-file <path>` | override the stored auth key |
| `--auth-url <url>` | override the API base (staging) |
| `--yes` | (cleanup) consent to back up + remove the v3 `.brv/` |
| `--backup-dir <dir>` | (cleanup) backup parent (default `~/Documents`; creates `ByteRover_Backups/` inside) |

Every command prints one JSON line to **stdout** (`{ ok, … }`); human progress
goes to **stderr**.

## Idempotency & re-runs

`run` records a marker per project (`<data-dir>/desktop-migrations.json`). A re-run
reuses each project's `spaceId` and overwrites its converted topics — so re-running
after a partial failure is safe and converges. To migrate just one project, use
`--project <dir>`.

## Fidelity — what's preserved vs degraded

Text is **never lost**, but the converter keeps these as **plain text** (not
semantic structure): markdown **tables**, `[[wikilinks]]`, **images**, and inline
bold/italic. `run --dry-run` reports a `warnings` count per project — surface the
affected files to the user. "100% data" holds for text content, not rich
structure/media.

## Troubleshooting (error `code` → fix)

| `code` | Meaning → what to do |
|---|---|
| `not_authenticated` | No stored key. Run step 1, or pass `--api-key-file <path>`. |
| `network_error` | Can't reach the API. Check the VPS network / `--auth-url`. |
| `auth_rejected` | Server rejected the key (401). Re-run step 1; check the key. |
| `no_team` | No team on the account. Create one in the desktop, or pass `--team <id>`. |
| `space_forbidden` | Can't create a **team** space here. Try `--space-type personal`, or `--team <a team you own>`. |
| `create_space_failed` | The space API returned an error — read the message; retry (idempotent). |
| project-level `error` | One project failed; others continued. Fix per the message and re-run. |

## Success checklist

- [ ] Step 2 — every project detected
- [ ] Step 3 — every project → a `spaceId` + `converted` count
- [ ] Step 4 — every space verified in v4 (server-side)
- [ ] Step 5 — each project's `.brv/` backed up to `Documents/ByteRover_Backups` + removed

If you stopped at a failed gate, the v3 data + install are still intact — fix the
issue and resume from that step.
