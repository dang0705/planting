---
related: [architecture/backend/cloudbase_mysql_ddl_execution.md]
---
# Source-Verified Backend Facts

Status: active  
Owner: architecture  
Verified: 2026-06-06  
Review after: 90d

## Facts

- id: F-BACKEND-DIAG-ENTRY-001
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/app.js
      lines: 3-17
      symbol: module.exports.main
  statement: `diagnose-http/app.js` is a thin entry wrapper: it reads HTTP request data, resolves app/schema environment, then calls `app/http-router.main(event, context)` inside `runWithRequestAppEnv` and `runWithSchemaEnv`.

- id: F-BACKEND-DIAG-EXPORTS-002
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/app.js
      lines: 20-25
      symbol: module.exports.runStartDiagnosis / runAnswerDiagnosis / buildFrontendDiagnosisResponse
  statement: `diagnose-http/app.js` re-exports `runStartDiagnosis`, `runAnswerDiagnosis`, and `buildFrontendDiagnosisResponse` from internal runner/formatter modules.

- id: F-BACKEND-DIAG-ROUTES-003
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/app/http-router.js
      lines: 66-228
      symbol: main
  statement: `diagnose-http` routes `/health`, `/diagnosis/start`, `/diagnosis/question/start`, `/diagnosis/answer`, `/diagnosis/result`, `/diagnosis/history`, `/diagnosis/review/*`, `/diagnosis/feedback`, `/visual/out-of-pool/*`, `/stream/diagnose`, and session `/diagnose` through `app/http-router.main`.

- id: F-BACKEND-DIAG-REVIEW-ROUTES-004
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/app/http-router.js
      lines: 137-165
      symbol: diagnosis review routes
    - file: cloudfunctions/diagnose-http/handlers/review-handlers.js
      lines: 1-80
      symbol: review handler module
  statement: Diagnosis review list/images/detail/import routes are handled through `getReviewHandlers()` and the review handler module rather than the main diagnosis handlers.

- id: F-BACKEND-DIAG-PACKAGE-005
  type: fact
  status: verified
  confidence: high
  source_kind: package
  source:
    - file: cloudfunctions/diagnose-http/package.json
      lines: 1-15
      symbol: diagnose-http package
  statement: The provided backend source package includes a `diagnose-http` CloudBase HTTP function package whose main entry is `app.js` and whose local `start` script runs CloudBase functions-framework on port 9000.

## Observations

- id: O-BACKEND-SOURCE-SCOPE-001
  type: observation
  status: observation
  confidence: high
  source_kind: archive_inventory
  source:
    - file: planting-brv-review-source.zip
      lines: n/a
      symbol: source package inventory
  statement: The current review package includes `cloudfunctions/diagnose-http` but does not include separate `identify-http`, `storage-http`, `weather-http`, `plant-catalog-http`, or `plant-user-http` function source directories. Session facts that referenced those directories are not active source-verified facts in this package.
