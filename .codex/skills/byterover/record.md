# Recording knowledge

After finishing something worth remembering, write it back with `record`.
**You** decide what matters and phrase the fact; the engine just persists it
deterministically.

> **Language reminder:** match the user's language for body text + `title` /
> `summary`; keep the schema (tag names, attribute names, enum values, `path`)
> in English. See SKILL.md → Language for the full rule.

## What to record

- Decisions and the reasoning behind them ("we use X because Y").
- Non-obvious gotchas and constraints discovered while working.
- Reusable patterns and where they apply.

Do **not** record what the code/git already makes obvious.

## Pick the form that matches the topic

- **Single-fact topic** ("we use OAuth 2.0 with PKCE") → use the simple
  `--title --body` form below. Wrapping a single fact in `<bv-decision>` +
  `<bv-reason>` is theater.
- **Multi-element topic** (decisions + reasoning + rules + files + bugs) →
  use the rich `--html` form. The simple form's single-`<bv-fact>` wrapper
  is structurally wrong for this case.

## How (rich form — structured `<bv-*>` HTML)

Topics are HTML built from 19 element types. Use the element that matches the
kind of knowledge — that's how the engine indexes, ranks, and surfaces it.
Read [vocabulary.md](vocabulary.md) for the full registry; the most common
combinations are `<bv-decision>` + `<bv-reason>` + `<bv-rule>` + `<bv-fact>`.

Run from inside the project — the engine resolves the right tree from your
current directory. Pass the topic as a single `--html` argument:

```bash
node scripts/record.mjs "auth/login" --html '
<bv-topic path="auth/login"
          title="Login flow"
          summary="How users authenticate"
          keywords="oauth,session,tokens"
          related="@security/cookies.html">
  <bv-task>End-user authentication design — provider, refresh, session handling.</bv-task>
  <bv-decision id="d-oauth">Use OAuth 2.0 for end-user authentication.</bv-decision>
  <bv-reason>
    Third-party identity providers handle credential storage; the gateway
    handles refresh so client apps stay simple.
  </bv-reason>
  <bv-rule severity="must">Tokens MUST be short-lived; refresh handled by the gateway, not the client.</bv-rule>
  <bv-fact subject="auth_provider" category="project" value="OAuth 2.0 with PKCE">Production uses OAuth 2.0 with PKCE for end-user authentication.</bv-fact>
  <bv-files>
    <li>src/auth/middleware.ts</li>
  </bv-files>
</bv-topic>'
```

Recording updates the topic (preserving `createdAt`) and rebuilds the manifest.

### Authoring tips

- **Topic path is a logical name.** No extension. The writer appends `.html`.
  Stable paths matter — they're the topic's identity for future queries
  and merges.
- **One element per kind of knowledge.** Don't put a rule inside a `<bv-fact>`;
  use `<bv-rule>` so structural search can find it.
- **Pair `<bv-decision>` with `<bv-reason>`.** A decision without a reason rots
  fast — future agents won't know if it still applies.
- **`<bv-fact>` is structured.** `subject` is snake_case, `category` is one
  of the seven enum values, `value=` holds the extracted form, and the body
  is the canonical natural-language statement. Don't put a label in the body
  and the statement in `value=`. See [vocabulary.md](vocabulary.md#facts).
- **Mark facts you intend to share with `disclosure="public"`.** Unmarked
  facts default to restricted (fail-closed) and are stripped from a redacted-
  view share. The topic `title` and all prose are public-by-contract — never
  put a secret in them. See
  [vocabulary.md](vocabulary.md#sensitivity-and-the-disclosure-model).
- **Cross-references use `@path.html`.** `related="@security/cookies.html"`
  for file targets, `related="@ops"` bare for folder/domain targets.
- **You can embed images by URL.** `<img>` is allowed inside any
  block-content element (`<bv-highlights>`, `<bv-structure>`, `<bv-topic>`,
  etc.). Use an absolute `https://` `src` and always set a descriptive
  `alt` — the reader indexes both the `alt` text and the `src` URL into
  search, so a good `alt` makes the topic findable. Example:

  ```html
  <bv-highlights>
    <p><img src="https://mintcdn.com/byterover-d775e347/bilxWUswopsRO7Ve/logo/dark.svg?fit=max&auto=format&n=bilxWUswopsRO7Ve&q=85&s=699fcf3c8f8da0ca3930f90173b99bfc"
            alt="ByteRover logo" width="140"/>
       <em>ByteRover — durable project memory.</em></p>
  </bv-highlights>
  ```

  Keep the `<img>` inside a `<p>` (or `<li>`) with caption text nearby.
  Self-close the tag (`/>`). No local file paths — the tree is portable,
  so only URLs that resolve anywhere are useful.
- **Topic structure is required.** Every topic needs `<bv-task>` (or h1+intro)
  + at least one of `<bv-changes>` / `<bv-files>` / `<bv-flow>` /
  `<bv-structure>` / `<bv-dependencies>` / `<bv-highlights>` /
  `<bv-decision>` / `<bv-bug>` / `<bv-fix>`. The schema accepts a topic
  missing them; the search experience does not.

## How (simple form — single-fact topics)

When the topic is one durable fact and forcing it into `<bv-decision>` +
`<bv-reason>` is theater, use the simple form:

```bash
node scripts/record.mjs "ops/scratch-note" \
  --title "Quick note" \
  --body "A single sentence or short paragraph of unstructured prose."
```

This wraps the body in a single `<bv-fact>`. Perfect for single-fact topics;
structurally wrong for multi-element topics (use the rich form for those).

## Guidelines

- One topic per stable subject; keep the body concise and self-contained.
- Prefer updating an existing topic over creating a near-duplicate — query first.
- Use precise `keywords` so future queries find it.
- If the topic carries decisions, rules, files, bugs, etc. mixed together,
  use the rich form so search can narrow on each kind. If it's a single
  fact, use the simple form.
