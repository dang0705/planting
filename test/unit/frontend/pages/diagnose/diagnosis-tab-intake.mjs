import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/pages/diagnose/diagnosis-tab-intake.js'),
  'utf8'
)
assert.match(source, /const startDiagnosisAction = createAsyncActionGuard\(\)/)
assert.match(source, /return startDiagnosisAction\.run\(/)
assert.match(source, /requireMvpAccess\(userStore, \{[\s\S]*source: 'diagnose_tab'/)
assert.match(source, /isStartingDiagnosis\.value = true/)
assert.match(source, /finally \{\s*uni\.hideLoading\(\)/)

console.log(
  'diagnosis tab intake interaction guard contracts passed data_mode=unit_fake test_kind=source_contract'
)
