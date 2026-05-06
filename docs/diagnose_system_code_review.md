
# Diagnose System Code Review Report
Date: 2026-03-28
Scope:
- diagnose-http repositories
- schema routing layer
- data-system (import / diff / publish / rollback)
- validator

This report lists all detected issues and assigns a **severity level**.

Severity Levels:
- **CRITICAL** – Can cause incorrect data reads or production errors
- **HIGH** – Functional correctness risk
- **MEDIUM** – Architecture / maintainability issue
- **LOW** – Improvement recommended but not urgent

---

# 1. Schema Routing Not Actually Effective
Severity: **CRITICAL**

## Description
Repositories call:

```js
FROM ${table('problems')}
```

But the helper is designed to accept:

```js
table(env, 'problems')
```

or rely on `AsyncLocalStorage` context.

Currently the repositories **never pass `env`**, and there is no verified
`runWithSchemaEnv()` wrapper at the request entry.

Therefore:

```
resolveSchema(undefined)
→ defaults to DEV schema
```

Result:

```
All queries read cloud1_dev except when NODE_ENV=production
```

Meaning:

- `x-env: prod` header currently **does not work**.
- Runtime environment switching is broken.

## Impact

Possible incorrect behaviour:

- Dev environment always reads dev schema
- Header-based environment switching ineffective
- Potential production misreads during debugging

## Recommended Fix

Either:

### Option A (Recommended)

Wrap request entry:

```js
runWithSchemaEnv(env, () => handler())
```

Then repositories can safely use:

```js
table('problems')
```

### Option B

Pass env explicitly:

```js
table(env, 'problems')
```

---

# 2. Validator Flags Internal Primary Key `id`
Severity: **HIGH**

## Description

Validator reports:

```
db_missing_in_excel: id
```

But system design explicitly requires:

```
id = internal surrogate primary key
```

Therefore validator logic is incorrect.

## Impact

Validator will **always fail** even when schema is correct.

Example tables affected:

- question_library_v5_real
- question_option_mapping_v5_real
- question_strategy_v5_real
- question_generation_engine
- diagnosis_result_explanations

## Recommended Fix

Validator whitelist:

```
id
created_at
updated_at
```

---

# 3. Legacy Columns Trigger False Schema Drift
Severity: **MEDIUM**

## Description

Validator flags columns that exist only in DB:

Examples:

```
_openid
note
weight_basis
base_evidence_weight
symptom_reliability
```

These are **legacy or platform fields**, not part of Excel schema.

## Impact

Validator produces false positives.

## Recommended Fix

Add validator whitelist:

```
_openid
note
weight_basis
base_evidence_weight
symptom_reliability
```

---

# 4. Duplicate DB Helper Implementations
Severity: **MEDIUM**

## Description

Two separate DB helper layers exist:

```
diagnose-http/db/
data-system/db/
```

Both implement MySQL connection logic.

## Impact

Future risk:

- schema resolver duplication
- inconsistent connection pooling
- maintenance overhead

## Recommended Fix

Centralize into:

```
shared/db/
```

---

# 5. Importer Relies Fully on Excel Column Names
Severity: **LOW**

## Description

Importer maps Excel columns directly to DB fields.

While this ensures schema alignment, it creates a risk if:

- Excel headers change
- Column order changes

## Impact

Importer may silently fail if Excel format changes.

## Recommended Fix

Add schema validation step before import.

---

# 6. SQL Helper List Builder Assumes Strict Character Pattern
Severity: **LOW**

## Description

`sqlInList()` allows only:

```
[a-z0-9_:-]
```

This protects against SQL injection but may reject legitimate keys if
future identifiers include other characters.

## Impact

Possible edge-case failures.

## Recommended Fix

Keep current rule but document constraints in schema spec.

---

# 7. Data-System and Diagnose Runtime Share Schema but Not Validation
Severity: **LOW**

## Description

Validator checks schema vs Excel vs repository fields,
but runtime repositories do not perform validation.

## Impact

Schema drift could still break runtime queries.

## Recommended Fix

Run validator automatically in CI pipeline.

---

# 8. Rollback Strategy Deactivates Instead of Deleting
Severity: **LOW**

## Description

Rollback for `added` records uses:

```
is_active = 0
```

instead of deleting.

## Impact

Database retains inactive rows.

This is intentional but should be documented.

## Recommended Fix

Add documentation note in publish system spec.

---

# Overall Assessment

System status:

```
Data Import Pipeline:        Stable
Diff Engine:                 Stable
Publish Engine:              Stable
Rollback Engine:             Stable
Schema Validator:            Needs adjustment
Schema Routing:              Requires fix
```

Final readiness:

```
Production Ready After Fixing Issue #1
```

Estimated fix size:

```
~30 lines of code
```

Once Issue #1 is corrected, the system architecture is considered **production-safe**.
