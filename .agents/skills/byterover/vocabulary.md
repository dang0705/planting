# The `<bv-*>` vocabulary

ByteRover topics are HTML built from **19 structured element types**. Choose
the element that matches the *kind* of knowledge you're capturing — that's
how the engine indexes, ranks, and surfaces it.

> **The most common authoring mistake:** stuffing all content into a single
> `<bv-fact>` produces flat, unsearchable topics. This doc exists to prevent
> that. Use `<bv-fact>` for discrete factual statements — not as a default
> container.

## Output contract

Every topic you author MUST follow these output rules:

- The HTML payload is HTML, and only HTML. **First character is `<`**
  (opening of `<bv-topic>`), **last characters are `</bv-topic>`**.
- **No code fence wrapper.** No ` ``` `, no ` ```html `, no markdown around
  the HTML. The `--html` argument to `record.mjs` is a bare HTML string.
- No HTML5 document preamble (no `<!doctype>`, `<html>`, `<head>`, `<body>`).
- **Exactly one `<bv-topic>` per file** — it is the root container.
- **All attribute names are lowercase.** HTML5 normalizes attribute names at
  parse time; lowercase keeps source diffs clean.
- **All attribute values are double-quoted strings.** Single quotes work
  syntactically but diverge from v3.x convention; the engine output uses
  double quotes consistently and your output should too.
- Do not invent custom elements outside the `<bv-*>` vocabulary.
- Do not invent attributes outside each element's documented schema.

## Path format and domain guidelines

The `path` attribute on `<bv-topic>` is a slash-separated topic path:
`<domain>/<topic>` or `<domain>/<topic>/<subtopic>`.

- **Use snake_case for each segment.** Underscores between words, NOT
  hyphens. Examples: `security/auth`, `payments/refunds`,
  `infra/postgres_upgrade`, `movies/atm_er_rak_error`. ❌ `movies/atm-er-rak-error`.
- **Domain names are 1–3 words, snake_case.** Pick categories that represent
  broad knowledge areas relevant to the project's work.
- **Reuse existing domains.** Don't fork a new domain when the topic fits an
  existing one.
- **Avoid generic domain names** like `misc`, `other`, `general`. Use
  `facts/personal`, `facts/project`, `facts/conventions` for ungrouped facts.

## Required topic structure

A well-formed topic is not just any `<bv-topic>` wrapper — every topic MUST
satisfy these rules (the schema is permissive, but a topic missing them is
degraded against v3.x and your search results will suffer).

- `<bv-topic>` with non-empty `path` AND `title` attributes.
- Either a `<bv-task>` describing what the topic is about, OR an `<h1>` +
  intro `<p>` if "task" doesn't fit the input shape.
- At least one of: `<bv-changes>`, `<bv-files>`, `<bv-flow>`, `<bv-structure>`,
  `<bv-dependencies>`, `<bv-highlights>`, `<bv-decision>`, `<bv-bug>`,
  `<bv-fix>`.
- Extracted **facts** as `<bv-fact subject="…" category="…" value="…">…</bv-fact>`
  siblings — one per discrete fact. Fact extraction is REQUIRED whenever
  the input contains factual statements (see the Facts section below for
  the canonical form).
- Temporal information (dates, timestamps, version markers) preserved as
  `<bv-timestamp>` (ISO 8601). This is distinct from the file's
  system-stamped `createdat`/`updatedat`.
- Enough prose that a domain expert can understand the topic from this
  file alone, without reading the source materials.

A topic with only `<bv-topic><bv-fact>…</bv-fact></bv-topic>` is not a
topic — it's a placeholder.

## Container

| Element | Attributes | Purpose |
|---|---|---|
| `<bv-topic>` | `path`*, `title`*, `summary?`, `keywords?`, `tags?`, `related?`, `id?`, `visibility?` | The outer wrapper. Exactly one per topic file. |

> **Required attributes on `<bv-topic>`:** `path` AND `title` must both be
> present and non-empty, or the writer rejects the call with
> ``<bv-topic> must declare a non-empty `path` attribute.`` and
> ``<bv-topic> Required``. The `path` value must match the positional
> `<topic-path>` argument you passed to `record.mjs`.

### Attribute conventions on `<bv-topic>`

- `keywords` — comma-separated retrieval keywords (e.g. `"jwt,refresh,token"`).
- `related` — comma-separated cross-references. **File targets end in `.html`**
  (e.g. `"@security/cookies.html,@security/oauth.html"`); **folder/domain
  targets stay bare** (e.g. `"@ops"`). A missing or wrong extension produces
  a dead reference. The `@` prefix is required.
- `tags` — comma-separated tags for categorical retrieval.
- `summary` — one-sentence prose summary; surfaces in search snippets.
- `path` should match the positional argument you passed to `record.mjs`.
- `visibility` — `"public"` or `"restricted"`. **Informational only.** It does
  NOT change which facts a redacted-view recipient sees; only each fact's own
  `disclosure` attribute does that. See the **Sensitivity and the disclosure
  model** section below. Absent or misspelled → coerced to `"restricted"`.

### NOT `<bv-topic>` attributes (forbidden)

These are runtime signals tracked by the engine in a sidecar store. **The
LLM does not author them.** Setting them in your HTML payload is a violation
of the contract:

- `importance`
- `maturity`
- `recency`
- `updatedat` / `updatedAt`
- `createdat` / `createdAt`
- `id`

The writer system-stamps `createdat`, `updatedat`, and `id` on every write
and will overwrite any value you set.

## Decisions and rules

| Element | Attributes | Use for |
|---|---|---|
| `<bv-decision>` | `id?` | A deliberate choice the project has made. Body may contain block content (`<p>`, `<ul>`, `<li>`). Almost always pair with `<bv-reason>`. |
| `<bv-reason>` | (none) | **RECOMMENDED for every topic.** The "why" of this curate operation, stated for a human reviewer (one or two sentences). Also fits as the reasoning behind an adjacent decision/rule/pattern. |
| `<bv-rule>` | `id?`, `severity?` (`must` \| `should` \| `info`) | An invariant the project enforces. `must` = non-negotiable; `should` = strong preference; `info` = guidance. |

```html
<bv-decision id="d-rs256">
  Use RS256 for all service tokens; reject HS256.
</bv-decision>
<bv-reason>
  Asymmetric signing lets the public key be distributed for verification
  without sharing the signing secret.
</bv-reason>
<bv-rule severity="must" id="r-verify">
  All services MUST verify tokens against the published public key.
</bv-rule>
```

## Facts

| Element | Attributes | Use for |
|---|---|---|
| `<bv-fact>` | `subject`*, `category`*, `value?`, `disclosure?` | A discrete factual statement. **Element text is the canonical natural-language statement**; attributes are the structured extraction. One fact per element. `disclosure` controls whether the fact survives a redacted-view share (see **Sensitivity** section below). |

```html
<bv-fact subject="user_name" category="personal" value="Andy">My name is Andy.</bv-fact>
<bv-fact subject="database_version" category="project" value="PostgreSQL 15">We use PostgreSQL 15 for all services.</bv-fact>
<bv-fact subject="sprint_duration" category="convention" value="2 weeks">Sprint cycles are 2 weeks.</bv-fact>
```

The canonical form is non-negotiable — agents that violate it produce search
results that look right but rank wrong:

- `subject` — the key concept in **snake_case** (`user_name`,
  `database_version`, `release_date`). NOT `"User Name"`, `"Release date"`,
  `"Thai title"`. Title Case with spaces is the most common mistake.
- `category` — one of `personal` / `project` / `preference` / `convention` /
  `team` / `environment` / `other`. **Every fact gets a category.** Skipping
  it silently degrades retrieval; the schema allows missing category but
  v3.x always sets one.
- `value` — the extracted value when applicable (`"PostgreSQL 15"`,
  `"2 weeks"`, `"2012-01-19"`). Short, structured, machine-greppable.
- **Body text IS the canonical statement** — a complete sentence a human
  could read aloud. Body is NOT a label, NOT a generic descriptor, NOT a
  duplicate of the value. Write `"We use PostgreSQL 15 for all services."`,
  not `"Database version."` with value=`"PostgreSQL 15"`.

**Standalone-facts topics.** When facts don't belong to any domain (general
personal preferences, environment notes), use a `facts/` domain:
`facts/personal`, `facts/project`, `facts/conventions`.

## Sensitivity and the disclosure model

A topic can be shared at three views: **full** (everything), **redacted**
(only facts marked `disclosure="public"`, plus public-by-contract structural
prose), and **metadata** (an opaque catalog handle — no content). When the
user shares a topic at the redacted view, content NOT marked public is
stripped before delivery.

Sharing itself is initiated by the user in the ByteRover desktop app, not by
you. **Your** job is to mark each fact correctly so the user's sharing
intent is honored: an authored topic carries the policy that determines what
a recipient sees at each view. Read these rules before authoring sensitive
content:

- **`<bv-fact>` is the SOLE unit of per-item restriction.** Mark a fact as
  shareable with `disclosure="public"`. Without that explicit attribute, the
  fact is treated as **restricted** — even if you didn't intend it.
- **The topic `title` is public-by-contract.** Anyone who can see the topic
  at any layer sees the title. **Never put a secret in the title.**
- **All prose text is public-by-contract.** Text inside `<bv-structure>`,
  `<p>`, `<ul>`/`<li>`, `<bv-flow>`, `<bv-highlights>`, diagram bodies, etc.
  survives the redacted view verbatim. **Never put a secret in prose** —
  extract it into a `<bv-fact>` (which can then default to restricted).
- **Topic-level `summary`, `keywords`, `tags`, and `related` are stripped
  at redacted but visible at full.** Treat them as "internal but not
  secret": good for search hints and cross-references, indefensible for
  credentials, PII, or sensitive identifying context. Anything that needs
  protection from a redacted-view recipient goes in a `<bv-fact>` (which
  can default to restricted), never in a topic-level attribute.
- **Absent or misspelled `disclosure` is treated as restricted.** Fail-closed:
  the schema coerces `disclosure="publci"` (typo) → restricted, and an absent
  attribute → restricted. You CANNOT accidentally publish a fact by omission;
  you CAN accidentally hide one by forgetting to mark it public.
- **`<bv-topic visibility>` does NOT make facts public.** It is an
  informational label only. Setting `visibility="public"` on a topic does
  not change which facts the redacted view returns; only each fact's own
  `disclosure="public"` does.

### Example — the preference + reason split

This is the canonical pattern for a topic where the public, actionable form
of a fact is safe to share but the underlying sensitive context is not.
Split it into two `<bv-fact>` siblings: the actionable form marked
`disclosure="public"`, the sensitive context unmarked (defaulting to
restricted). At the redacted view the recipient acts on the public fact
without learning the restricted one.

```html
<bv-topic path="travel/floor_preference"
          title="Hotel floor preference">
  <bv-task>Personal accommodation preference for hotel booking.</bv-task>
  <bv-reason>
    Anchor for a preference whose public meaning ("lower floors") is safe
    to share, while the personal reason for it is not.
  </bv-reason>

  <bv-fact subject="floor_preference"
           category="preference"
           disclosure="public"
           value="lower">
    Prefers lower floors when booking hotels.
  </bv-fact>

  <bv-fact subject="floor_aversion_reason"
           category="personal"
           value="acrophobia">
    Avoids upper floors because of acrophobia.
  </bv-fact>
</bv-topic>
```

At the **full** view, both facts are returned. At the **redacted** view,
only the first survives — a recipient sees the actionable preference but
not the personal reason. At the **metadata** view, neither fact is
returned; the recipient sees only that the topic exists.

This example is pinned by a test in
`packages/core/test/disclosure.test.ts` — if you change the example here,
update the test (or the engine, if the example drifted from current
behavior).

### Choosing the disclosure for a fact

Default to leaving `disclosure` unset (fail-closed → restricted). Add
`disclosure="public"` ONLY when the fact is genuinely safe to share with
any recipient cleared to see the topic at the redacted view. Concrete
guidance:

- **Public is appropriate for:** the actionable form of a fact when its
  sensitive context can be carried separately. A preference (paired with
  a separate restricted fact for the personal reason behind it); a
  convention; a date without identifying context; public credits; factual
  descriptions of public artifacts (films, books, libraries, public APIs).
- **Restricted (the default) is right for:** identifying details, medical
  or personal reasons, credentials and secrets, internal policy details,
  PII, financial data, anything where the redacted-view recipient was
  granted access without the sensitive context.

A fact's body, `subject`, `value`, and `category` are ALL stripped
together when the fact is restricted — you don't need to redact further
by hand. Mark the fact; trust the engine.

## Action items

| Element | Attributes | Use for |
|---|---|---|
| `<bv-task>` | (none) | Action items (with assignees and deadlines if applicable), or the task/subject this concept relates to. One task per element. |

```html
<bv-task>Rotate the JWT signing key by 2026-Q4 (owner: infra-platform).</bv-task>
<bv-task>Sunset HS256 verification path before 2026-Q3 deploy freeze.</bv-task>
```

## Bugs and fixes

| Element | Attributes | Use for |
|---|---|---|
| `<bv-bug>` | `id?`, `severity?` (`low` \| `medium` \| `high` \| `critical`) | A known bug or footgun. Body may contain block content. Pair with a sibling `<bv-fix>` whenever the resolution is known. |
| `<bv-fix>` | `id?` | The fix or workaround for a `<bv-bug>` or recurring issue. **Emit as a sibling of the `<bv-bug>` inside `<bv-topic>`**, not nested inside it. |

```html
<bv-bug severity="medium" id="b-clock-skew">
  Services with ±5min clock drift reject otherwise-valid tokens.
</bv-bug>
<bv-fix id="f-clock-skew">
  Use the 30-second leeway: <code>verifyJwt(token, { tolerance: 30 })</code>.
</bv-fix>
```

## Patterns

| Element | Attributes | Use for |
|---|---|---|
| `<bv-pattern>` | `description?`, `flags?` | A **regex pattern**. Element text is the regex literal; `flags` are regex flags (`g`, `i`, `m`, etc.); `description` says what the pattern matches. Multiple `<bv-pattern>` siblings render as a bullet list. |

```html
<bv-pattern flags="g" description="Match an email">[\w.+-]+@[\w.-]+</bv-pattern>
<bv-pattern flags="i" description="Match an ISO 8601 date">\d{4}-\d{2}-\d{2}</bv-pattern>
```

> `<bv-pattern>` is for **regex** patterns. For design patterns or reusable
> solution shapes, use `<bv-structure>` or `<bv-examples>` instead.

## Structure and process

| Element | Attributes | Use for |
|---|---|---|
| `<bv-structure>` | (none) | Structural or organizational documentation — file layout, process hierarchy, timeline, team org. |
| `<bv-flow>` | (none) | A process flow, workflow, or sequence of steps — request flow, deployment pipeline, debugging procedure. |
| `<bv-dependencies>` | (none) | Dependencies, prerequisites, blockers, or relationship information. |

```html
<bv-structure>
  <p>Repo layout:</p>
  <ul>
    <li>apps/cli — oclif binary; the only published artifact.</li>
    <li>apps/server — daemon and forked agent-process entry.</li>
    <li>packages/core — deterministic memory engine.</li>
  </ul>
</bv-structure>
<bv-flow>
  Request → auth middleware → handler → response. Auth middleware verifies
  the JWT and attaches <code>req.user</code> for downstream handlers.
</bv-flow>
<bv-dependencies>
  Requires Redis ≥ 6 and Postgres ≥ 14. Blocked by IDP rollout (Q3 2026).
</bv-dependencies>
```

## References and metadata

| Element | Attributes | Use for |
|---|---|---|
| `<bv-files>` | (none) | Related source files, documents, URLs, or references. Children should be `<li>` items. |
| `<bv-changes>` | (none) | List of changes — code, process, or decision. Children should be `<li>` items. |
| `<bv-timestamp>` | (none) | The date the concept's data represents (distinct from the file's system-stamped `createdat`/`updatedat`). Typically ISO 8601. |
| `<bv-author>` | (none) | Person or system identifier responsible for the concept (team name, GitHub handle, external source). |

```html
<bv-files>
  <li>src/auth/middleware.ts</li>
  <li>src/auth/refresh.ts</li>
  <li>https://auth.internal/.well-known/jwks.json</li>
</bv-files>
<bv-changes>
  <li>2026-Q2: switched from HS256 to RS256.</li>
  <li>2026-Q3: introduced refresh endpoint at /auth/refresh.</li>
</bv-changes>
<bv-timestamp>2026-04-15</bv-timestamp>
<bv-author>infra-platform team</bv-author>
```

## Illustrative content

| Element | Attributes | Use for |
|---|---|---|
| `<bv-examples>` | (none) | Worked examples, sample code, scenario walkthroughs. Code in `<pre><code>` blocks. |
| `<bv-diagram>` | `title?`, `type?` (`mermaid` \| `plantuml` \| `ascii` \| `dot` \| `graphviz` \| `other`) | Preserve diagrams **character-for-character**. `type` tells the writer which fenced-code-block language tag to emit. One diagram per element. |
| `<bv-highlights>` | (none) | Key highlights, capabilities, deliverables, notable outcomes — the "TL;DR" for the topic. |

```html
<bv-examples>
  <pre><code>const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });</code></pre>
</bv-examples>
<bv-diagram type="mermaid" title="Authentication Flow">
graph TD
  A[Request] --&gt; B{Has Token?}
  B --&gt;|Yes| C[Validate]
  B --&gt;|No| D[Reject]
</bv-diagram>
<bv-highlights>
  All service tokens use RS256. Refresh handled by the gateway, not the
  client. Public key distributed via JWKS endpoint.
</bv-highlights>
```

`*` = required attribute.

## Realistic full example — JWT authentication

A topic combining multiple element types — decisions, reasoning, rules,
structured facts, files, bugs, and fixes:

```html
<bv-topic path="auth/jwt-design"
          title="JWT authentication design"
          summary="Service-to-service tokens use RS256 with 24h expiry"
          keywords="auth,jwt,rs256,security">

  <bv-decision id="d-rs256">
    Use RS256 for all service tokens; reject HS256.
  </bv-decision>

  <bv-reason>
    Asymmetric signing lets the public key be distributed for verification
    without sharing the signing secret, simplifying key rotation and
    multi-service deployments.
  </bv-reason>

  <bv-rule severity="must" id="r-verify">
    All services MUST verify tokens against the published public key
    (https://auth.internal/.well-known/jwks.json).
  </bv-rule>

  <bv-fact subject="algorithm" category="convention" value="RS256">
    Production enforces RS256 exclusively.
  </bv-fact>

  <bv-fact subject="expiry_window" category="convention" value="24h">
    Access tokens expire in 24 hours; refresh via /auth/refresh.
  </bv-fact>

  <bv-files>
    <li>src/auth/middleware.ts</li>
    <li>src/auth/refresh.ts</li>
    <li>config/jwks-public.json</li>
  </bv-files>

  <bv-bug severity="medium" id="b-clock-skew">
    Services with ±5min clock drift reject otherwise-valid tokens.
  </bv-bug>

  <bv-fix id="f-clock-skew">
    Use the 30-second leeway: <code>verifyJwt(token, { tolerance: 30 })</code>.
  </bv-fix>

</bv-topic>
```

Queries can now narrow on "all rules with severity must", "facts where
subject=algorithm", "bugs in this domain" — capabilities the engine supports
only when the topic is actually structured.

## Realistic full example — profile / research dump

For non-engineering topics (films, books, people, organizations, events)
the same discipline applies: structured facts with snake_case + category,
a task or h1 anchoring what the topic is about, grouped credits in
`<bv-structure>`, dates in `<bv-timestamp>`, the canonical "why we curated"
in `<bv-reason>`:

```html
<bv-topic path="movies/atm-er-rak-error"
          title="ATM: Er Rak Error (2012 Thai film)"
          summary="GTH 2012 romantic comedy by Mez Tharatorn — two secretly-dating bank employees bet their jobs on recovering money from a malfunctioning ATM."
          keywords="atm er rak error,gth,thai romantic comedy,2012,mez tharatorn"
          tags="film,thai,gth,romcom"
          related="@movies/pee-mak-phra-khanong.html">

  <bv-reason>
    Anchor topic for cross-references between Thai GTH romcoms; documents the
    studio's box-office record holder before Pee Mak (2013).
  </bv-reason>

  <bv-task>Profile of ATM: Er Rak Error (2012) — credits, plot, awards, legacy.</bv-task>

  <bv-timestamp>2012-01-19</bv-timestamp>

  <bv-highlights>
    Premise: a bank no-fraternization policy forces a secret 5-year couple
    into a winner-keeps-the-job bet over money from a glitching ATM. Was
    GTH's biggest hit until Pee Mak (2013) topped it.
  </bv-highlights>

  <bv-structure>
    <p>Credits:</p>
    <ul>
      <li><strong>Director:</strong> Mez Tharatorn</li>
      <li><strong>Writers:</strong> Mez Tharatorn, Aummaraporn Phandintong</li>
      <li><strong>Producers:</strong> Jira Maligool, Chenchonnee Soonthornsaratul, Suvimon Techasupinun, Vanridee Pongsittisak</li>
      <li><strong>Composer:</strong> Vichaya Vatanasapt</li>
      <li><strong>Studio:</strong> GTH (GMM Tai Hub); distributor Vicol Entertainment</li>
    </ul>
    <p>Lead cast:</p>
    <ul>
      <li><strong>Sua:</strong> Ter Chantavit Dhanasevi</li>
      <li><strong>Jib:</strong> Ice Preechaya Pongthananikorn (breakout)</li>
    </ul>
  </bv-structure>

  <bv-fact subject="thai_title" category="project" value="ATM เออรัก เออเร่อ">
    The Thai-language title is ATM เออรัก เออเร่อ.
  </bv-fact>

  <bv-fact subject="release_date" category="project" value="2012-01-19">
    The film was released theatrically in Thailand on January 19, 2012.
  </bv-fact>

  <bv-fact subject="runtime" category="project" value="123 minutes">
    The film runs 123 minutes.
  </bv-fact>

  <bv-fact subject="box_office" category="project" value="150.11 million baht">
    The film grossed 150.11 million baht, reaching Thailand's 7th highest-grossing film within four weeks of release.
  </bv-fact>

  <bv-fact subject="record_vs_pee_mak" category="project" value="GTH highest-grossing film until Pee Mak (2013)">
    ATM was GTH/GMM Tai Hub's highest-grossing film until Pee Mak surpassed it in 2013.
  </bv-fact>

  <bv-flow>
    Sua and Jib are overachieving bank staff who dated secretly for 5 years
    under the bank's no-fraternization policy. An ATM glitches and dispenses
    130,000 baht. They bet: whoever recovers the money keeps their job, the
    loser resigns. Jib negotiates; Sua goes rogue. They trace the money to
    manager Pakorn and Sergeant Sam, culminating in a chaotic confrontation
    involving Sam's pet crocodile Jack.
  </bv-flow>

  <bv-changes>
    <li>2013-11-30 to 2014-02-08: TV sequel ATM 2: Koo ver Error Er Rak aired (21 episodes, One 31).</li>
    <li>Chinese-language remake released as Welcome to the Beartown.</li>
  </bv-changes>

</bv-topic>
```

Note what each element carries: cast/credits go in **`<bv-structure>` with
grouped `<ul><li>`**, not 8 separate `<bv-fact>` siblings. Date facts land
in **`<bv-timestamp>` for the topic's reference date** plus `<bv-fact
subject="release_date">` for queryability. Cross-references use
**`@movies/pee-mak-phra-khanong.html`**, not bare `movies/pee-mak-phra-khanong`.

## Detail preservation

When the input contains diagrams, tables, code, factual statements, or
numbered procedures, preserve them — don't summarize:

- **Diagrams** (mermaid, plantuml, ascii, dot, graphviz) — preserve VERBATIM
  in `<bv-diagram>`. Never paraphrase. Use HTML entities for `<`, `>`, `&`
  (mermaid arrows become `--&gt;`). Do NOT wrap the body in `<![CDATA[…]]>`
  — HTML5 parses CDATA as a bogus comment and the first `-->` closes it,
  mangling the diagram source.
- **Tables** — preserve every row and column. Don't reduce to prose.
- **Step-by-step procedures** — preserve the original numbering with `<ol>`
  inside `<bv-flow>` or `<bv-rule>`.
- **Code snippets** — preserve exact syntax and values in `<pre><code>`
  blocks (typically inside `<bv-examples>`).
- **Factual statements** — extract each as a separate `<bv-fact>` with
  `subject` / `category` / `value` filled where derivable. Don't dump them
  into a single prose paragraph.

The engine doesn't re-derive structure from prose. What you author is what
gets indexed.

## Element children — block vs inline

The schema is permissive (`passthrough()`), so the writer accepts any child
structure without rejecting. **But rendering quality and the reader's
`bodyText` extraction depend on each element matching its content category.**
Putting `<ul>` inside `<bv-rule>` won't crash, but the list structure is lost
in the rendered output and search extraction sees a flat string.

**Block-content elements.** Allow `<p>`, `<ul>`, `<ol>`, `<li>`, `<code>`,
`<pre>`, `<strong>`, `<em>`, `<img>`, plus `<h1>`–`<h6>`:

`<bv-topic>`, `<bv-decision>`, `<bv-bug>`, `<bv-fix>`, `<bv-reason>`,
`<bv-structure>`, `<bv-dependencies>`, `<bv-highlights>`, `<bv-examples>`,
`<bv-diagram>`, `<bv-files>`, `<bv-changes>`.

**Inline-content elements.** Allow only `<code>`, `<strong>`, `<em>` — write
prose directly:

`<bv-rule>`, `<bv-task>`, `<bv-flow>`, `<bv-fact>`, `<bv-pattern>`,
`<bv-timestamp>`, `<bv-author>`.

Inside `<li>` items, write plain text only — no leading `-`, `*`, `•`,
`1.`/`2.` markers. The renderer adds list markers; a literal prefix produces
a double bullet.

## Anti-patterns

The schema accepts these silently (passthrough). The output looks valid but
ranks worse and reads worse. Treat each as a defect to fix.

- **Title-Case fact subjects.** ❌ `subject="Thai title"`, ❌ `subject="Release date"`.
  Subjects MUST be `snake_case` (`thai_title`, `release_date`). Title Case
  breaks subject-equality queries and search tokenization.
- **Missing `category` on `<bv-fact>`.** Every fact in v3.x sets `category`.
  Skipping it is silent degradation — your fact still renders, but category-
  scoped retrieval misses it. Pick one of the seven enum values; don't omit.
- **Inverted body and value.** ❌ `<bv-fact subject="release_date" value="2012-01-19">Theatrical release in Thailand.</bv-fact>`.
  The body is supposed to be the canonical statement ("The film was released
  theatrically on January 19, 2012."). Putting a label there and stuffing the
  value into `value=` is backwards. Body is the human-readable claim.
- **Many `<bv-fact>` for grouped data.** ❌ 8 separate `<bv-fact>` for cast
  + 5 separate `<bv-fact>` for credits. Use `<bv-structure>` with a `<ul><li>`
  list. Reserve `<bv-fact>` for *discrete, queryable* facts (release date,
  runtime, box office, awards) — not list rows.
- **`related=` without `@` prefix or `.html` suffix.** ❌ `related="movies/x"`.
  v3.x uses **`@path.html`** for file targets, **`@path`** bare for folders.
  Wrong format renders as a dead link in the frontend.
- **Missing `<bv-task>` (or h1+intro).** Required by the topic-structure
  contract. Without it the topic has no anchor describing what it is — facts
  float in space.
- **Missing `<bv-timestamp>`.** If the input has temporal information (release
  date, version date, incident date), it MUST land in `<bv-timestamp>` ISO 8601.
  Not just in prose. The element drives temporal queries.
- **Single-`<bv-fact>` dump.** Pasting a 5KB blob of prose inside one
  `<bv-fact>` is the opposite of structure. Split it.
- **Fake structure.** If you only have a paragraph of notes — no decisions,
  no rules — use a single `<bv-fact>` and accept it. Don't fabricate
  categories to look richer.
- **`<bv-pattern>` for design patterns.** `<bv-pattern>` is for **regex**.
  Use `<bv-structure>` or `<bv-examples>` for design patterns.
- **Duplicating the title.** Don't repeat the `<bv-topic title="...">` value
  inside `<bv-fact>` text. The title attribute carries it.
- **Diagram in prose.** Don't paraphrase a diagram in text — emit
  `<bv-diagram type="...">` and preserve it character-for-character.
- **Single-quoted attributes.** ❌ `<bv-fact subject='thai_title' …>`. Use
  **double quotes** — `<bv-fact subject="thai_title" …>` — to match v3.x
  output and avoid silent style drift.
- **Hyphenated `path`.** ❌ `path="movies/atm-er-rak-error"`. Each path
  segment is snake_case (underscores between words). The writer accepts
  hyphens but they violate the v3.x convention.
- **Custom elements outside `<bv-*>`.** The vocabulary is closed. Inventing
  `<bv-cast>` or `<bv-awards>` won't be recognized by the engine; use
  `<bv-structure>` or `<bv-fact>` instead.
- **Invented attributes.** Don't add attributes outside each element's
  documented schema. `<bv-fact priority="high">` is not a thing; severity
  belongs on `<bv-rule>` / `<bv-bug>`.
- **Authoring system-managed attributes.** ❌ `<bv-topic createdat="…" id="…">`.
  The writer stamps `createdat`, `updatedat`, and `id` itself; LLM-set values
  are overwritten. Same for `importance`, `maturity`, `recency` — those are
  sidecar runtime signals, not topic attributes.
- **`<bv-fix>` nested inside `<bv-bug>`.** Emit them as siblings inside the
  same `<bv-topic>`, not nested. The renderer pairs them by adjacency.
- **CDATA-wrapped diagram body.** Don't wrap `<bv-diagram>` content in
  `<![CDATA[…]]>` — HTML5 treats it as a bogus comment and the first `-->`
  closes early, mangling the diagram.
- **Secret in the topic `title`.** ❌ `title="Production database password
  rotation"`. The title is public-by-contract — every recipient at every
  layer sees it. Use a generic title (`"Database credential rotation"`)
  and put the sensitive specifics in `<bv-fact>` siblings.
- **Secret in prose.** ❌ Putting a credential, a personal medical reason,
  or an internal-only detail inside `<bv-structure>`, `<p>`, `<bv-flow>`,
  `<bv-highlights>`, or any other text-bearing element. Prose is public-by-
  contract — it survives the redacted view verbatim. Move sensitive
  specifics into `<bv-fact>` siblings, which default to restricted.
- **Trusting `<bv-topic visibility>` to make facts public.** ❌
  `<bv-topic visibility="public">…<bv-fact>unmarked note</bv-fact>…`. The
  `visibility` attribute is informational only; the materializer does not
  consult it as a per-fact default. A fact is public ONLY by its own
  `disclosure="public"` — see the **Sensitivity** section.
- **Misspelled `disclosure` value.** ❌ `disclosure="publci"`,
  `disclosure="open"`, `disclosure="yes"`. The schema is closed (`"public"`
  or `"restricted"` only) and coerces any other value to `"restricted"` —
  fail-closed by design. Your typo doesn't accidentally publish; it
  accidentally hides. Double-check the spelling.

## When the content is large

If you're authoring a large topic (research dump, service profile,
changelog), the payoff for using rich elements grows. A 4KB body split
across `<bv-decision>` + `<bv-reason>` + multiple `<bv-fact subject="…">` +
`<bv-files>` is far more queryable than a 4KB single `<bv-fact>`. The engine
doesn't infer structure from prose — it relies on what you author.

## Authoritative reference

The element registry is defined in
[`packages/core/src/render/elements/schemas.ts`](../../packages/core/src/render/elements/schemas.ts).
If this doc and the registry disagree, the registry wins.
