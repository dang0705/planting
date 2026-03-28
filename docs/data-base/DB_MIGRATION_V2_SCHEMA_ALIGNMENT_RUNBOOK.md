# DB_MIGRATION_V2_SCHEMA_ALIGNMENT_RUNBOOK

## Goal
Apply the reusable migration for v2 schema alignment:

1. Enforce internal `id` primary key for `problems` and `symptoms`
2. Keep business unique keys
3. Remove legacy columns not in Excel truth source
4. Enable `problem_causality.is_active` for soft-delete publish flow
5. Verify `validate-schema` passes on both dev/prod schemas

The executable SQL is:

- `docs/data-base/DB_MIGRATION_V2_SCHEMA_ALIGNMENT.sql`

## 1. Pre-check
Run schema validator first (expect may fail before migration):

```bash
DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
npm run validate-schema -- \
  --file=docs/plants_v13_user_friendly_full_v7.xlsx \
  --schema=cloud1_dev \
  --output=schema-diff-report.before.json
```

## 2. Execute SQL Migration
Use your DB client and run:

```sql
SOURCE docs/data-base/DB_MIGRATION_V2_SCHEMA_ALIGNMENT.sql;
```

If your client does not support `SOURCE`, copy-paste the whole SQL file and execute it.

## 3. Post-check
Validate both schemas:

```bash
DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
npm run validate-schema -- \
  --file=docs/plants_v13_user_friendly_full_v7.xlsx \
  --schema=cloud1_dev \
  --output=schema-diff-report.dev.after.json

DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
npm run validate-schema -- \
  --file=docs/plants_v13_user_friendly_full_v7.xlsx \
  --schema=cloud1-2grufevs395a9d5e \
  --output=schema-diff-report.prod.after.json
```

Expected:

- `summary.ok = true`
- `summary.errorCount = 0`

## 4. Recommended Smoke Test
Run one full batch in real DB:

```bash
DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
npm run import-data -- --file=docs/plants_v13_user_friendly_full_v7.xlsx --batch=batch_YYYYMMDD_test_001

DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
npm run diff-data -- --batch=batch_YYYYMMDD_test_001

# approve diffs in cloud1_dev.publish_diffs, then:
DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
npm run publish-data -- --batch=batch_YYYYMMDD_test_001

DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... \
npm run rollback-data -- --batch=batch_YYYYMMDD_test_001
```

## 5. Notes

- This migration follows `DATABASE_SCHEMA_SPEC_v2.md` and `CODEX_IMPLEMENTATION_PLAN_v2.md`.
- The script is idempotent for the target changes (safe to rerun).
- Keep foreign keys unchanged; this migration only touches PK/unique and legacy column cleanup.
