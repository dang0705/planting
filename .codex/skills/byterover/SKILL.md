---
name: byterover
description: "Persistent, portable memory for AI builders and agent teams. Use BEFORE any non-trivial work to retrieve prior decisions, patterns, and gotchas; use AFTER finishing to record what was learned. ALSO use to authenticate with ByteRover — when the user says to authenticate / auth / log in / sign in / connect / link ByteRover (or log out / sign out / disconnect), run the auth flow. Iron Law: query before you think, curate after you implement."
metadata:
  version: 4.2.0
---

# ByteRover — durable project memory

ByteRover keeps project knowledge as a deterministic context tree. **You are
the brain; the engine never calls an LLM.** You do the reasoning, then run the
bundled deterministic scripts (via your Bash tool) to retrieve or persist
knowledge.

## Iron Law

1. **Query before you think.** At the start of any non-trivial task, retrieve
   what the project already knows so you don't re-derive or contradict it.
2. **Curate after you implement.** When you finish something worth remembering
   (a decision, a gotcha, a pattern), write it back so the next session
   inherits it.

## Where memory lives

The engine resolves the right context tree from your working directory. **You
do not compute, look up, or override the storage path.** Run commands from
inside the project (any subdirectory works) and the right tree is found
automatically — the resolver and registry are engine-internal.

## Language

**Match the user's input language.** Author the human-readable content in
whatever language the user is conversing in — body text of `<bv-*>` elements,
list items, and the `title` / `summary` attributes on `<bv-topic>`. There is no
setting and no flag; you infer the language from the conversation, the same way
you already do when replying.

**The schema stays English.** Keep **tag names** (`<bv-fact>`, never a
translated tag), **attribute names** (`subject`, `category`, `severity`),
**enum values** (`category="project"`, `subject="visa_required"`), and the
**`path`** attribute in English for tooling consistency. Code snippets and
identifiers stay verbatim.

Concrete (Vietnamese conversation): `path="travel/vietnam_visa"` and
`subject="visa_required" category="project"` stay English, while
`title="Yêu cầu visa Việt Nam"` and the `<bv-fact>` body
(`Người Mỹ cần visa để vào Việt Nam.`) are Vietnamese. Same rule for Chinese,
Japanese, Korean, Russian, Arabic, etc.

## Commands

Run from inside the project (any subdirectory). Topics are stored as `<bv-*>`
HTML. Spaces (including the default) are provisioned through the ByteRover
desktop app — the agent never creates them.

| Need | Command |
| --- | --- |
| Retrieve | `node scripts/query.mjs "<question>" --limit 5` |
| Save (rich, multi-element topics) | `node scripts/record.mjs "<topic-path>" --html '<bv-topic …>…</bv-topic>'` — **see the worked example in "Authoring rich topics" below; do NOT improvise the shape from this row** |
| Save (simple, single-fact topics) | `node scripts/record.mjs "<topic-path>" --title "T" --summary "S" --keywords a,b --body "..."` |
| Save many topics in one call | `node scripts/record.mjs --batch --input <ndjson-file>` (one JSON spec per line: `{"path":"...","html":"<bv-topic …>…</bv-topic>","overwrite"?:true}`; one auth check + one manifest/index rebuild for the whole batch — meaningfully faster than recording N topics one-at-a-time; per-line failures are reported in `failed[]` and don't abort the run) |

> **Required `<bv-topic>` attributes:** `path` and `title` MUST be present and
> non-empty on the topic root or the writer rejects the call. The `path` on
> `<bv-topic>` should match the positional `<topic-path>` you pass to
> `record.mjs`. See [vocabulary.md](vocabulary.md) for the full attribute spec.
| Read | `node scripts/brv.mjs read "<topic-path>.html" [--raw]` (use `--raw` to get the on-disk HTML byte-for-byte — required when round-tripping through `record --html`, since `elements[].text` flattens inner `<ul>`/`<li>`/`<strong>` formatting) |
| List | `node scripts/brv.mjs list` |
| Rebuild manifest + index | `node scripts/manifest.mjs` |
| Detect consolidation opportunities | `node scripts/dream.mjs --mode merge\|link\|prune\|synthesize` (proposes — never executes) |
| Fold one topic into another | `node scripts/merge.mjs <survivor> <loser> [--title "…"] [--summary "…"] [--tags a,b] [--keywords a,b] [--reason "…"] [--related @x.html,@y.html]` (use `--title` to give the survivor a new title that reflects the merged scope — without it, the survivor keeps its own title even when the merged content is broader) |
| Remove redundant topics | `node scripts/prune.mjs <topic-path>...` (variadic, atomic — aborts on first failure with a partial report) |
| Combine many topics into a new one | `node scripts/synthesize.mjs <new-path> --html '<bv-topic …>…</bv-topic>' --absorb a.html,b.html,c.html` |
| Rename / move / re-parent a topic within the current space | `node scripts/move.mjs <topic-path> --to-path <new-path>` (atomic — siblings' `related=` refs are rewritten to the new path; signal sidecar carries over; covers all of rename, move-to-new-parent, deep re-parent, and combined) |
| Add or remove a `related=` cross-link between two topics | `node scripts/brv.mjs link "<a>" "<b>" [--bidirectional] [--remove]` (atomic byte-preserving edit of the `<bv-topic related="…">` attribute — use this instead of hand-editing the opening tag, which is unsafe for summaries containing `>` characters; idempotent — re-linking is a noop; refuses to add a ref to a topic that doesn't exist (would dangle) — but `--remove` allows missing targets so you can clean up existing dangling refs) |
| Move a topic to a different space | `node scripts/move.mjs <topic-path> --from-space <name> --to-space <name>` (rebuilds manifest + index in both spaces; reports any sibling `related=` refs in the source that now dangle) |
| Migrate legacy markdown | `node scripts/migrate.mjs [--dry-run]` |
| Migrate a self-hosted **v3 VPS** → v4 (full guided procedure) | follow [migrate-v3-to-v4.md](migrate-v3-to-v4.md) |
| Authenticate / log in to ByteRover | `node scripts/auth.mjs` — returns at once; the user approves in the browser, then `auth.mjs status`; see [Authenticate with ByteRover](#authenticate-with-byterover) |
| Check whether signed in (local, no network) | `node scripts/auth.mjs whoami` — prints `{ ok, authed, providerKind }` (a credential exists locally; not a server-side validity check) |
| Log out of ByteRover | `node scripts/logout.mjs` |
| See which space this folder uses | `node scripts/space.mjs current` |
| List spaces (grouped by `team_name`) | `node scripts/space.mjs list` |
| Bind this folder to a space | `node scripts/space.mjs bind "<name>"` |

To delete a topic, surface the request to the user — deletions happen through
the ByteRover desktop app.

Every command prints a JSON result. On `{ "ok": false, ... }` read
[troubleshooting.md](troubleshooting.md).

## Citing retrieved memory

After a `query` answer materially drew on the returned hits, **append the
`citation_block` from the query envelope to your response** so the user
can see — and click through to — what was used. The engine pre-formats
the block; your job is decisional, not formatting.

When the query envelope has `should_cite: true` AND your answer
genuinely used the retrieved memory:

1. Add ONE blank line after your answer.
2. Emit the `citation_block` string **verbatim — character for
   character** — including the `[…](…)` Markdown link wrapping each
   title, the indented `"snippet"` line when present, and the
   `Updated by <agent> · <relative>` trailer when present. Every host
   the engine targets (Codex CLI, Claude Code CLI, Claude Code
   Desktop) renders the wrapped title as a clickable inline link.
3. Don't reformat, paraphrase, or add agent-generated relevance scores
   to the citations. The user judges relevance from the title.
4. **Do NOT unwrap the Markdown link.** The engine deliberately emits
   `- [Title  ·  Recalled N×](http://…)` — rewriting it as a plain
   title with the URL on a separate row undoes the format that hides
   the long URL behind clickable text. Same rule for the snippet and
   updated-by lines: keep them indented exactly as the engine emitted
   them, never merged into the title row or stripped of their leading
   spaces.

When `should_cite` is `false`, OR when you didn't actually use the
returned hits to answer, OR when the user asked for no sources —
**skip the block entirely.** The engine intentionally suppresses
low-confidence retrievals; don't second-guess by surfacing them in
prose.

Example final response shape (the `📚 …` block comes from the engine,
emit it verbatim):

```
ATM: Er Rak Error is a 2012 Thai romantic comedy by Mez Tharatorn …

📚 From ByteRover:
- [ATM: Er Rak Error (2012 Thai film) (fact)  ·  Recalled 14×](http://127.0.0.1:<port>/i/topic/<space-id>/context-tree/movies/atm_er_rak_error.html#bve-a1b2c3d4)
    "matched-context preview that explains why this hit ranked here"
    Updated by claude · 3d ago
- [Pee Mak Phra Khanong (2013) (highlights)](http://127.0.0.1:<port>/i/topic/<space-id>/context-tree/movies/pee_mak_phra_khanong.html#bve-e5f6g7h8,k1m2n3p4)
```

## Authenticate with ByteRover

Run this when the user wants to **authenticate / log in / sign in / connect /
link** ByteRover for this workspace (or when ByteRover reports the session has
expired):

```bash
node scripts/auth.mjs
```

This returns **immediately** with `{ "ok": true, "pending": true, "verifyUrl":
…, "userCode": …, "expiresInS": … }` while a background process waits for the
approval. Relay the `verifyUrl` (and the code) to the user verbatim, tell them
how long the code lives (`expiresInS`, typically a few minutes), and tell them
to **come back and say "approved"** once they have approved in the browser.
End your turn — do NOT poll or re-run commands while waiting.

When the user returns, confirm with:

```bash
node scripts/auth.mjs status
```

- `{ "state": "approved" }` → connected; tell the user.
- `{ "state": "pending" }` → not through yet — ask them to finish the browser
  step (the result re-includes `verifyUrl`) and say so again.
- `{ "state": "expired" }` → the code died; run `node scripts/auth.mjs` again
  for a fresh one and re-relay it.
- `{ "state": "denied" }` → the user declined; stop and surface it.

Re-running `auth.mjs` while a flow is pending is safe — it returns the SAME
code (`"reused": true`), never a competing one. No secret is ever pasted into
the chat — only the short code. To **log out / sign out**:

```bash
node scripts/logout.mjs
```

For non-interactive / CI environments only, an API key may be supplied by file
(never inline in the conversation): `node scripts/auth.mjs --key-file <path>`.
A blocking variant that waits in the foreground until approval (for scripted
use, NOT for conversations) is `node scripts/auth.mjs --wait`.

Authentication is not required — every command works without it. See
[sync.md](sync.md) for what authenticating enables, and
[troubleshooting.md](troubleshooting.md) if `auth.mjs` returns `{ "ok": false }`.

## Authoring rich topics

Topics render in **four sections** and you should author with that
structure in mind. Each `<bv-*>` element belongs to one section; the
renderer ignores order within a section but you should emit them in
section order to keep the source readable.

| Section | Elements | What it carries |
|---|---|---|
| **`## Reason` (the WHY)** | `<bv-reason>` | The "why" of this curation, 1–2 sentences. Almost always include this. |
| **`## Raw Concept` (the WHAT and HOW)** | `<bv-task>`, `<bv-changes>`, `<bv-files>`, `<bv-flow>`, `<bv-timestamp>`, `<bv-author>`, `<bv-pattern>` | The concept itself: subject, changes, related files, process flow, date, author, regex patterns. |
| **`## Narrative` (the EXPLANATION)** | `<bv-structure>`, `<bv-dependencies>`, `<bv-highlights>`, `<bv-rule>`, `<bv-examples>`, `<bv-diagram>` | Structural docs, deps, key highlights, project rules, worked examples, preserved diagrams. |
| **`## Facts` (the EXTRACTED DATA)** | `<bv-fact>` | Discrete, queryable facts — one per element. Not a dumping ground for content that belongs in Narrative. |
| **Runbook (any section)** | `<bv-decision>`, `<bv-bug>`+`<bv-fix>` (siblings) | Standalone runbook records. |

Every topic MUST include:

1. **A `<bv-reason>`** explaining the WHY of the curation (the topic isn't
   useful without context for why it was captured).
2. **A `<bv-task>`** describing what the topic is about (one sentence), OR
   an `<h1>` + intro `<p>` if "task" doesn't fit.
3. **At least one Narrative or Raw Concept element** beyond the task:
   `<bv-changes>` / `<bv-files>` / `<bv-flow>` / `<bv-structure>` /
   `<bv-dependencies>` / `<bv-highlights>` / `<bv-decision>` /
   `<bv-bug>` / `<bv-fix>`. A topic with only `<bv-fact>` siblings is a
   placeholder, not a topic.
4. **`<bv-timestamp>`** in ISO 8601 if the content has a reference date.
5. **`<bv-fact subject="snake_case" category="…" value="…">canonical
   statement</bv-fact>`** for each extracted fact — `subject` is snake_case,
   `category` is one of `personal` / `project` / `preference` /
   `convention` / `team` / `environment` / `other`, `value` carries the
   extracted form, and the **body text is the canonical natural-language
   statement** (not a label).

### Worked example — research/profile-style topic

This is the shape an agent must author. Copy this skeleton and fill the
slots; do not invent a flatter shape:

```bash
node scripts/record.mjs "movies/atm_er_rak_error" --html '
<bv-topic path="movies/atm_er_rak_error"
          title="ATM: Er Rak Error (2012 Thai film)"
          summary="GTH 2012 romantic comedy by Mez Tharatorn — secretly-dating bank employees bet their jobs on recovering money from a malfunctioning ATM."
          keywords="atm_er_rak_error,gth,thai_romcom,mez_tharatorn,2012"
          tags="film,thai,gth,romcom"
          related="@movies/pee_mak_phra_khanong.html">

  <bv-reason>
    Anchor topic for cross-references between Thai GTH romcoms; documents
    the studio box-office record holder before Pee Mak (2013).
  </bv-reason>

  <bv-task>Profile of ATM: Er Rak Error (2012) — credits, plot, awards, legacy.</bv-task>

  <bv-timestamp>2012-01-19</bv-timestamp>

  <bv-highlights>
    Premise: a bank no-fraternization policy forces a secret 5-year couple
    into a winner-keeps-the-job bet over money from a glitching ATM.
    Was GTH biggest hit until Pee Mak (2013) topped it.
  </bv-highlights>

  <bv-structure>
    <p>Credits:</p>
    <ul>
      <li><strong>Director:</strong> Mez Tharatorn</li>
      <li><strong>Writers:</strong> Mez Tharatorn, Aummaraporn Phandintong</li>
      <li><strong>Studio:</strong> GTH (GMM Tai Hub)</li>
    </ul>
    <p>Lead cast:</p>
    <ul>
      <li><strong>Sua:</strong> Ter Chantavit Dhanasevi</li>
      <li><strong>Jib:</strong> Ice Preechaya Pongthananikorn</li>
    </ul>
  </bv-structure>

  <bv-flow>
    Sua and Jib are bank staff who dated secretly for 5 years under the
    bank no-fraternization policy. An ATM glitches and dispenses 130,000
    baht. They bet: whoever recovers the money keeps their job. The
    sequence escalates into a chaotic showdown involving manager Pakorn,
    Sergeant Sam, and Sam pet crocodile Jack.
  </bv-flow>

  <bv-fact subject="release_date" category="project" value="2012-01-19">
    The film was released theatrically in Thailand on January 19, 2012.
  </bv-fact>

  <bv-fact subject="runtime_minutes" category="project" value="123">
    The film runs 123 minutes.
  </bv-fact>

  <bv-fact subject="box_office" category="project" value="150.11 million baht">
    The film grossed 150.11 million baht, reaching Thailand 7th highest-
    grossing film within four weeks of release.
  </bv-fact>

  <bv-fact subject="record_vs_pee_mak" category="project" value="GTH highest-grossing film until Pee Mak (2013)">
    ATM was GTH/GMM Tai Hub highest-grossing film until Pee Mak surpassed it in 2013.
  </bv-fact>

  <bv-changes>
    <li>2013-11-30 to 2014-02-08: TV sequel ATM 2: Koo ver Error Er Rak aired (21 episodes, One 31).</li>
    <li>Chinese-language remake released as Welcome to the Beartown.</li>
  </bv-changes>

</bv-topic>'
```

Note what carries WHAT:

- **`<bv-reason>` carries the WHY** of this curation. Missing this is the
  single most common authoring failure — don't skip it.
- **`<bv-task>` + `<bv-timestamp>` carry the WHAT and WHEN.**
- **`<bv-highlights>` + `<bv-flow>` carry the HOW** (the explanation,
  the process).
- **`<bv-structure>` carries grouped lists** like cast/credits/file
  layouts — NOT a pile of `<bv-fact>` siblings. Reserve `<bv-fact>` for
  discrete queryable claims (release date, runtime, box office, awards).

### Output contract (hard rules)

The schema is permissive — the writer accepts violations silently — but
output that ignores these rules ranks worse and reads worse:

- **All attribute values are double-quoted strings.** Not single quotes.
- **All attribute names are lowercase.**
- **Path segments are snake_case with underscores between words**:
  `movies/atm_er_rak_error`, NOT `movies/atm-er-rak-error` (hyphens).
- **`related=`** uses **`@path.html`** for file targets, **`@path`** bare
  for folder/domain targets. The `@` prefix is required.
- **No code fence wrapper.** The `--html` argument is bare HTML — first
  character `<`, last characters `</bv-topic>`. No ` ``` `, no
  ` ```html `.
- **Don't set `createdat`, `updatedat`, `id`, `importance`, `maturity`,
  or `recency`** on `<bv-topic>`. The writer system-stamps the first
  three; the last three are sidecar runtime signals the LLM does not
  author.
- **Don't invent custom elements** outside the 19-element `<bv-*>`
  vocabulary, or attributes outside each element's documented schema.

### Sensitivity — mark facts you intend to share

A topic can be shared at three views: **full** (everything), **redacted**
(only `<bv-fact disclosure="public">` plus structural prose), and
**metadata** (an opaque catalog handle — no content). Mark a fact you
intend to share with `disclosure="public"`; otherwise the fact defaults
to restricted and is stripped from the redacted view.

Three rules to write by:

- **`<bv-fact>` is the SOLE unit of per-item restriction.** The topic
  `title` and all prose text (inside `<bv-structure>`, `<p>`, `<bv-flow>`,
  `<bv-highlights>`, etc.) are **public-by-contract** — they survive the
  redacted view verbatim. Never put a secret in the title or in prose;
  move it into a `<bv-fact>` (which can then default to restricted).
- **Absent or misspelled `disclosure` is treated as restricted.** Fail-
  closed: a typo never accidentally publishes, but it can accidentally
  hide. Double-check the spelling.
- **`<bv-topic visibility>` does NOT make facts public.** It's an
  informational label only. The redacted view consults each fact's own
  `disclosure` attribute, never the topic-level default.

See [vocabulary.md](vocabulary.md#sensitivity-and-the-disclosure-model)
for the full model, the canonical example, and guidance on choosing
public vs restricted for any given fact.

### Two record forms

- **Simple form (`--title --body`)** wraps the body in a single
  `<bv-fact>`. Use it ONLY when the topic is genuinely one fact ("we
  use OAuth 2.0 with PKCE"). For anything else the wrapper structure
  is wrong.
- **Rich form (`--html`)** is everything else — profile dumps,
  decisions+reasons+rules+facts, bug+fix runbooks, research notes.

For the full element registry, schema-level attributes, and the
authoritative anti-patterns list, read
[vocabulary.md](vocabulary.md). For commit-quality recording guidance,
read [record.md](record.md).

## When to read what

- First time in a repo, or no memory exists for the project → [onboarding.md](onboarding.md)
- Before retrieving → [query.md](query.md)
- Before saving knowledge → [record.md](record.md)
- Choosing the right `<bv-*>` element → [vocabulary.md](vocabulary.md)
- Periodic cleanup / consolidation → [dream.md](dream.md)

> Note: topics are `<bv-*>` HTML (not markdown). `scripts/*.mjs` are generated
> from `@byterover/skill-runtime` by `pnpm build:skill`; if missing, build first.
