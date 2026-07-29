# Consolidation ("dream")

Over time, topics drift toward duplication, redundancy, and stale entries.
`dream` surfaces those drift patterns as *proposals* — it never executes them.
Four modes, four ways to look for drift:

| Mode | What it proposes |
| --- | --- |
| `merge` (default) | Pairs of topics that cover the same ground, ranked by term overlap |
| `link` | Pairs that should reference each other via `related=` but don't |
| `prune` | Topics that look stale (low importance, low recency) and may no longer earn shelf space |
| `synthesize` | Clusters of small topics in the same domain that read better as one consolidated topic |

Run from inside the project — the engine resolves the right tree from your
working directory:

```bash
node scripts/dream.mjs --mode merge --min-score 0.3
```

Returns:

```json
{ "ok": true, "data": { "candidates": [
  { "type": "merge", "a": "auth/login.html", "b": "auth/oauth.html", "score": 0.42, "shared": ["oauth","token","session"] }
] } }
```

## Acting on candidates

`dream` does no file ops. For each candidate worth acting on, run the matching
executor — each one bundles its destructive step internally:

| Dream proposal | Action you take |
| --- | --- |
| `merge` candidate | `node scripts/merge.mjs <survivor> <loser>` — folds loser into survivor + removes loser, all atomic |
| `link` candidate | `node scripts/record.mjs <path> --html '<bv-topic ... related="@other.html">…</bv-topic>' --overwrite` — adds the missing reference; non-destructive |
| `prune` candidate | `node scripts/prune.mjs <path1> <path2>...` — removes the topics atomically (aborts on first failure with a partial report) |
| `synthesize` cluster | `node scripts/synthesize.mjs <new-path> --html '<bv-topic …>…</bv-topic>' --absorb a.html,b.html,c.html` — writes the consolidated topic AND removes the absorbed inputs in one shot |

**Read the source topics first** (`node scripts/brv.mjs read "<path>"`) and
**write the consolidated content yourself**. The executors run pure logic on the
paths you pass — they don't reason about what to keep or how to combine.

Run dream periodically (after a burst of curation, before a planning round) —
not on every task. The signal degrades when you act on too-low-scoring
proposals.

When you author the consolidated content, see [vocabulary.md](vocabulary.md)
for the `<bv-*>` element types so the new topic uses the right structure
rather than collapsing everything into a flat `<bv-fact>`.
