/* oxlint-disable no-console */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
const pagesJson = read('src/pages.json')
const pageSource = read('src/pages/diagnose/diagnose.vue')
const intakeSource = read('src/pages/diagnose/diagnosis-tab-intake.js')
const intakeViewSource = read('src/components/diagnosis/DiagnoseIntake.vue')
const intakeDraftSource = read('src/pages/diagnose/diagnosis-intake-draft.js')
const diagnosisStartSource = read('src/api/diagnosis-start.js')
const structuredImagesSource = read('src/utils/diagnose-structured-images.js')
const flowSource = read('src/subpackages/diagnosis/flow.vue')
const flowCoreSource = read('src/subpackages/diagnosis/diagnose-flow/DiagnoseFlow.vue')
const layoutSource = read('src/Layout.vue')
const indexSource = read('src/pages/index/index.vue')
const detailSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'
)

const pagesConfig = JSON.parse(pagesJson)
assert.deepEqual(
  pagesConfig.tabBar.list.map(item => item.pagePath),
  [
    'pages/index/index',
    'pages/diagnose/diagnose',
    'pages/profile/profile'
  ]
)
assert.equal(
  pagesConfig.tabBar.list.some(item => item.pagePath === 'pages/calendar/calendar'),
  false
)
assert.equal(
  pagesConfig.tabBar.list.some(item => item.pagePath === 'pages/reminder/reminder'),
  false
)

assert.match(pageSource, /id="diagnose-tab-page"/)
assert.match(pageSource, /id="diagnose-tab-intake"/)
assert.match(pageSource, /<DiagnoseIntake\s+:view="intakeView"/)
assert.match(pageSource, /id="diagnose-submit-button"/)
assert.match(pageSource, /@click="startDiagnosis"/)
assert.match(pageSource, /useDiagnosisTabIntake/)
assert.doesNotMatch(pageSource, /onShow\(/)
assert.doesNotMatch(pageSource, /onLoad\(/)
assert.doesNotMatch(pageSource, /redirectTo\(/)
assert.doesNotMatch(pageSource, /navigateTo\(/)
assert.doesNotMatch(pageSource, /subpackages\/diagnosis/)

assert.match(intakeViewSource, /id="diagnose-upload-stage"/)
assert.match(intakeViewSource, /id="diagnose-profile-full-button"/)
assert.match(intakeViewSource, /id="diagnose-profile-pest-button"/)
assert.match(intakeViewSource, /id="diagnose-no-image-entry-panel"/)
assert.match(intakeViewSource, /diagnose-dev-symptom-class-option-\$\{item\.classKey\}/)
assert.match(intakeViewSource, /@click="handleSymptomClassQuickSelect\(item\)"/)

assert.match(intakeSource, /useCloudImageUploader/)
assert.match(intakeSource, /buildSlotGroups/)
assert.match(intakeSource, /requestDiagnosisQuestionStart/)
assert.match(intakeSource, /requestDiagnosisStart/)
assert.match(intakeSource, /buildStructuredImageInputs/)
assert.match(intakeSource, /buildStandaloneDiagnosisPayload/)
assert.match(intakeSource, /visualInputVersion: 'multi_image_contract_v1'/)
assert.match(intakeSource, /persistDiagnosisQuestionPackageDraft/)
assert.match(intakeSource, /uni\.navigateTo\(/)
assert.match(intakeSource, /\/subpackages\/diagnosis\/question-package\?draftKey=/)
assert.doesNotMatch(intakeSource, /uni\.redirectTo\(/)
assert.doesNotMatch(intakeSource, /\/subpackages\/diagnosis\/entry/)
assert.doesNotMatch(intakeSource, /\/subpackages\/diagnosis\/flow/)
assert.match(intakeSource, /selectedDiagnosisProfile\.value === 'pest'/)
assert.match(intakeSource, /只看虫害需要先上传照片/)
assert.match(intakeSource, /await startDiagnosis\(\)/)

assert.match(intakeDraftSource, /DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX/)
assert.match(intakeDraftSource, /uni\.setStorageSync/)
assert.match(intakeDraftSource, /diagnosisResult/)
assert.match(diagnosisStartSource, /diagnose-http\/diagnosis\/start/)
assert.match(diagnosisStartSource, /diagnose-http\/diagnosis\/question\/start/)
assert.match(diagnosisStartSource, /isRetryableRequestError/)
assert.match(diagnosisStartSource, /attempt <= 1/)
assert.match(structuredImagesSource, /sourceWidth: sourceWidth \|\| null/)

assert.match(pagesJson, /"path": "flow"/)
assert.doesNotMatch(pagesJson, /"path": "entry"/)
assert.equal(fs.existsSync(path.join(repoRoot, 'src/subpackages/diagnosis/entry.vue')), false)
assert.match(flowSource, /id="diagnosis-flow-page"/)
assert.match(flowSource, /uni\.navigateBack\(\{ delta: 1 \}\)/)
assert.doesNotMatch(flowSource, /intakeKey|intake-draft/)
assert.doesNotMatch(flowCoreSource, /consumeDiagnosisTabIntakeDraft/)
assert.doesNotMatch(flowCoreSource, /intakeDraftKey/)
assert.doesNotMatch(flowCoreSource, /diagnosis-flow-starting/)
assert.match(layoutSource, /const DIAGNOSIS_TAB_PAGE_ROUTE = 'pages\/diagnose\/diagnose'/)
assert.match(layoutSource, /previousRoute === DIAGNOSIS_TAB_PAGE_ROUTE/)
assert.match(layoutSource, /uni\.navigateBack\(/)

assert.match(indexSource, /subpackages\/diagnosis\/flow\?plantId=/)
assert.match(detailSource, /subpackages\/diagnosis\/flow\?\$\{query\}/)
assert.doesNotMatch(indexSource, /subpackages\/diagnosis\/entry/)
assert.doesNotMatch(detailSource, /subpackages\/diagnosis\/entry/)

console.log('diagnosis tab thin-shell route contract tests passed')
