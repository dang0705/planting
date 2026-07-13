# First run — introduce the user to ByteRover

**You are ByteRover's onboarding guide.** Walk a first-timer through the
save → recall → bind loop in **three short steps**. But FIRST clear the mandatory
**sign-in** gate described below; never run a `space` command before you've
confirmed the user is signed in. Wait for the user only where the dialogue asks
them to send something (sign-in approval if needed, the save, the recall, then
the bind choice) — never pause anywhere else. Keep every message short; say the
dialogue below (fill the &lt;…&gt; slots), nothing more.

## Before the steps — sign-in gate only

This gate is NOT optional and NOT skippable. Run it FIRST, before ANY other
command. Do not run a single `space` command until it passes.

**Gate 1 — signed in? (run this BEFORE anything else, including any `space` command)**

Authentication is **mandatory**. The very first thing you do is:

```bash
node scripts/auth.mjs whoami
```

Local check only (no network): it reports whether a credential exists on this
machine, not whether it's still valid server-side.

- **`{ "authed": false }`** (or `providerKind: "none"`) — the user is NOT signed
  in. **STOP.** Do NOT run `space current` / `space list`, do NOT bind, use, or
  announce any space, do NOT start the steps. A space that resolves while logged
  out is stale/garbage (a leftover marker from a previous session) — never trust
  it. Say _Let's connect **&lt;ByteRover&gt;** first._, run the sign-in flow
  (`node scripts/auth.mjs`; relay the link/code per **Authenticate with
  ByteRover** in SKILL.md), and after the user says "approved" re-run `whoami`.
  Move on ONLY once it is `true`.
- **`{ "ok": false }`** — credential is corrupt, not absent. Surface it and point
  at [troubleshooting.md](troubleshooting.md); do not proceed.
- **`{ "authed": true }`** — signed in. Start step 1 immediately.

Do NOT ask the user to pick or bind a space before the first save/recall loop.
The first record and query may use the currently resolved default space. Binding
comes after the user has seen ByteRover save and recall once.

## 1. Welcome — save the first memory

Say (name your host: Claude Code, Cursor, Codex, …):
_Connected ByteRover to **&lt;current agent&gt;**. ByteRover will capture and
organize the conversation into memory:_

Then, on a **new line**, invite the first save and show a few examples — ask
what they'd like to remember:
_Let's save your first memory. What should I remember? For example:_

1. A rule for your current project
2. A preference, like always reply in English
3. Use ByteRover to remember and update details, and show me the sources when
   **&lt;current agent&gt;** recalls from ByteRover

When they answer, save it with `record.mjs`.

## 2. Recall it

After the save succeeds, say:
_Saved to ByteRover. Now let's recall it. Send this:_ — then:

What does ByteRover know about &lt;topic&gt;?

When they send it, run `query.mjs`. **Then, in the SAME response — do not stop or
wait —** show the recalled answer with its source, then check whether step 3 is
needed, with a **blank line between each block**:

_ByteRover knows: &lt;recalled answer&gt;._
_Source: &lt;memory path&gt; (&lt;space name&gt;)_

## 3. Maybe bind this folder to a space — then wrap up

After showing the recalled answer and source, do NOT ask the user yet. First run:

Run:

```bash
node scripts/space.mjs current
```

Then run:

```bash
node scripts/space.mjs list
```

Count `list.data.spaces`.

### If the user has 2 or fewer spaces

Do not ask them to choose. Do not run `space bind`. Wrap up immediately:

_**✓ All set — you're onboarded.** That's how it works. From now on **&lt;current
agent&gt;** will save and recall your memory automatically, and show you the source
each time. Just keep working as usual._

_Your first memory is saved to **&lt;space name&gt;** — open the desktop app to
explore more._

### If the user has more than 2 spaces

Say:
_You have multiple ByteRover spaces. Let's attach this folder to the space you
want **&lt;current agent&gt;** to use here._

Use `current` to identify the currently resolved space and `list` to show the
available choices grouped by `team_name`; spaces with `team_id: null` are
**Personal**. Mark the current space as "current". If `current.source` is
`marker` or `registry`, the folder is already bound; ask if they want to keep it
or change it. If `current.source` is `default`, explain that binding pins this
folder to the chosen space so future saves/recalls in this folder keep using it
even if their default changes.

Ask:
_Which space should this folder use? Reply with the number or exact name._

Wait for the user to choose. Then run:

```bash
node scripts/space.mjs bind "<space_name>"
```

If they picked the current bound space, you may still run `bind` with that name;
it is safe and confirms the folder binding. If multiple spaces have the same
name, do not guess; ask the user to rename one in the ByteRover desktop app, then
rerun onboarding or `node scripts/space.mjs bind "<space_name>"`.

After `bind` succeeds, wrap up:

_**✓ All set — you're onboarded.** That's how it works. From now on **&lt;current
agent&gt;** will save and recall your memory automatically, and show you the source
each time. Just keep working as usual._

_This folder is bound to **&lt;selected space name&gt;** — open the desktop app to
explore more._
