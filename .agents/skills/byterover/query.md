# Retrieving knowledge

Before doing non-trivial work, retrieve relevant prior knowledge. Run from
inside the project — the engine resolves the right tree from your current
directory:

```bash
node scripts/query.mjs "how does authentication work" --limit 5
```

Returns JSON:

```json
{ "ok": true, "data": { "query": "...", "hits": [
  { "path": "auth/login.html", "title": "Login flow", "score": 7.2, "snippet": "Users authenticate via OAuth ..." }
] } }
```

## How to use the results

1. Read the top hits' `snippet`. If a hit looks relevant, open the full topic:
   `node scripts/brv.mjs read "<path>"`.
2. Treat recorded decisions/patterns as **constraints**: align with them or
   explicitly note why you're diverging.
3. If nothing relevant comes back, that's a signal this knowledge doesn't exist
   yet — plan to curate it once you've done the work.

## Tips

- Query with the concrete terms you'd expect in the answer (entities, file
  names, error strings) — search is BM25 over title/summary/keywords/body.
- Retrieval bumps each hit's runtime-usage signal, so frequently-useful topics
  surface more strongly over time.
- Topics authored with rich `<bv-*>` elements (per [vocabulary.md](vocabulary.md))
  rank better than flat single-`<bv-fact>` topics. If query results feel
  shallow, the issue is usually the source topic's structure, not the query.
