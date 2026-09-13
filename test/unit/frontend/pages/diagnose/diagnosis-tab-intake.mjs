import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const SYMPTOM_HANDLER_BODY_INDEX = 1

const source = fs.readFileSync(
  path.join(repoRoot, 'src/pages/diagnose/diagnosis-tab-intake.js'),
  'utf8'
)
assert.match(source, /const startDiagnosisAction = createAsyncActionGuard\(\)/)
assert.match(source, /return startDiagnosisAction\.run\(/)
assert.match(source, /requireMvpAccess\(userStore, \{[\s\S]*source: 'diagnose_tab'/)
assert.match(source, /isStartingDiagnosis\.value = true/)
assert.match(source, /finally \{\s*uni\.hideLoading\(\)/)
assert.match(
  source,
  /return imageFiles\.value\.length > NO_IMAGES \|\| Boolean\(selectedDevSymptomClassOption\.value\)/
)
assert.match(source, /const DIAGNOSIS_PROFILE_FULL = 'full'/)
assert.match(source, /diagnosisProfile: DIAGNOSIS_PROFILE_FULL/)
assert.doesNotMatch(source, /confirmDiagnosisProfile|selectedDiagnosisProfile|虫害诊断/)
assert.match(source, /function resetImageUploads\(\)/)
assert.match(source, /resetImages: resetImageUploads/)
assert.doesNotMatch(source, /activeIntakeSection|handleIntakeSectionChange/)
const symptomHandlerMatch = source.match(
  /function handleSymptomClassQuickSelect\(option = null\) \{([\s\S]*?)\n  \}\n\n  return/
)
assert.ok(symptomHandlerMatch, 'symptom mode selection handler must be locatable')
assert.doesNotMatch(symptomHandlerMatch[SYMPTOM_HANDLER_BODY_INDEX], /startDiagnosis\(\)/)

console.log(
  'diagnosis tab intake interaction guard contracts passed data_mode=unit_fake test_kind=source_contract'
)
