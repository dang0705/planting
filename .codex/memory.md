# Project Memory

## SQL / Schema Default

- Unless the user explicitly specifies otherwise, all SQL-related actions default to `cloud1_dev`.
- This includes:
  - SQL queries
  - table inspection
  - schema verification
  - data backfill / import
  - local diagnose review / H5 debugging validation
- Only switch to `cloud1-2grufevs395a9d5e` when the user explicitly asks for production/online verification, or when the task is clearly about live prod behavior.

## Operational Rule

- Before any diagnose-related SQL debugging, first confirm which schema is being used.
- Default assumption for local work is always `cloud1_dev`.
