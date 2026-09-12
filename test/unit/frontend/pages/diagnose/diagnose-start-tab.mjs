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
const uploadIllustrationSource = read('src/assets/diagnosis/diagnosis-plant-upload.svg')
const intakeDraftSource = read('src/pages/diagnose/diagnosis-intake-draft.js')
const diagnosisStartSource = read('src/api/diagnosis-start.js')
const structuredImagesSource = read('src/utils/diagnose-structured-images.js')
const flowSource = read('src/subpackages/diagnosis/flow.vue')
const flowCoreSource = read('src/subpackages/diagnosis/diagnose-flow/DiagnoseFlow.vue')
const flowComputedSource = read('src/subpackages/diagnosis/diagnose-flow/computed.js')
const flowSetupSource = read('src/subpackages/diagnosis/diagnose-flow/setup.js')
const flowStateSource = read('src/subpackages/diagnosis/diagnose-flow/state.js')
const flowImagesSource = read('src/subpackages/diagnosis/diagnose-flow/images.js')
const flowDialogSubmitSource = read('src/subpackages/diagnosis/diagnose-flow/dialog-submit.js')
const flowViewDefaultsSource = read('src/subpackages/diagnosis/diagnose-flow/view-defaults.js')
const layoutSource = read('src/Layout.vue')
const indexSource = read('src/pages/index/index.vue')
const detailSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'
)
const entryConfirmSource = read('src/utils/diagnosis-entry-confirm.js')

const pagesConfig = JSON.parse(pagesJson.replace(/^\s*\/\/\s*#(?:if|endif|else).*$/gm, ''))
assert.deepEqual(
  pagesConfig.tabBar.list.map(item => item.pagePath),
  ['pages/index/index', 'pages/diagnose/diagnose', 'pages/profile/profile']
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
assert.doesNotMatch(intakeViewSource, /id="diagnose-profile-full-button"/)
assert.doesNotMatch(intakeViewSource, /id="diagnose-profile-pest-button"/)
assert.match(intakeViewSource, /id="diagnose-symptom-mode-toggle"/)
assert.match(intakeViewSource, /id="diagnose-upload-toggle"/)
assert.match(intakeViewSource, /expandedSection === 'symptom'/)
assert.match(intakeViewSource, /expandedSection === 'upload'/)
assert.match(
  intakeViewSource,
  /expandedSection\.value === sectionKey[\s\S]*sectionKey === 'symptom'[\s\S]*'upload'[\s\S]*'symptom'/
)
assert.match(intakeViewSource, /id="diagnose-no-image-entry-panel"/)
assert.match(intakeViewSource, /diagnose-dev-symptom-class-option-\$\{item\.classKey\}/)
assert.match(intakeViewSource, /@click="handleSymptomModeSelect\(item\)"/)
for (const label of ['叶子发黄', '枯萎', '黑斑', '褐斑', '长势不佳']) {
  assert.match(intakeViewSource, new RegExp(label))
}
assert.match(intakeViewSource, /diagnosisOrganUpload/)
assert.match(intakeViewSource, /id="diagnose-organ-upload-board"/)
assert.match(intakeViewSource, /isVisualScanning \? '正在扫描分析植物状态…'/)
assert.match(intakeViewSource, /id="diagnose-visual-scan-line"/)
assert.match(intakeViewSource, /<template v-else>[\s\S]*v-for="slot in ORGAN_UPLOAD_BUTTONS"/)
assert.match(intakeViewSource, /animation: diagnose-visual-scan 1\.8s ease-in-out infinite alternate;/)
assert.match(intakeViewSource, /box-shadow: 0 0 12px 2px rgba\(45, 122, 79, 0\.6\);/)
assert.match(intakeViewSource, /translateY\(414px\)/)
assert.match(intakeViewSource, /:id="`diagnose-upload-\$\{slot\.slotType\}-button`"/)
for (const slotType of ['whole_plant', 'leaf', 'stem', 'soil', 'root_crown']) {
  assert.match(intakeViewSource, new RegExp(`slotType: '${slotType}'`))
}
for (const label of ["label: '全株图'", "label: '叶'", "label: '茎'", "label: '土表'", "label: '根'"]) {
  assert.match(intakeViewSource, new RegExp(label))
}
assert.match(intakeViewSource, /\.diagnose-organ-slot--whole_plant\s*\{[\s\S]*?left: 108px;[\s\S]*?width: 112px;/)
assert.match(intakeViewSource, /\.diagnose-organ-slot--leaf\s*\{[\s\S]*?top: 64px;[\s\S]*?left: 12px;/)
assert.match(intakeViewSource, /\{ slotType: 'leaf', label: '叶', icon: diagnosisUploadIcon \}/)
assert.match(intakeViewSource, /\.diagnose-organ-slot--soil\s*\{[\s\S]*?top: 210px;/)
assert.match(intakeViewSource, /\.diagnose-organ-slot\s*\{[\s\S]*?border: 2px dashed rgba\(45, 122, 79, 0\.82\);/)
assert.doesNotMatch(intakeViewSource, /\.diagnose-organ-slot-label\s*\{[\s\S]*?text-overflow: ellipsis;/)
assert.doesNotMatch(uploadIllustrationSource, /id="Vector" d="M147\.494 81\.3725/)
assert.doesNotMatch(uploadIllustrationSource, /id="Vector_2" d="M201\.742 109\.294/)
assert.match(uploadIllustrationSource, /id="Vector_4" d="M137\.921 286\.5C123\.5 271 109\.5 247 96\.5 234\.5/)
assert.equal((uploadIllustrationSource.match(/stroke-dasharray=/g) || []).length, 3)
assert.equal((uploadIllustrationSource.match(/stroke-opacity="0\.45" stroke-width="2\.4"/g) || []).length, 3)
assert.doesNotMatch(intakeViewSource, /diagnose-upload-count/)

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
assert.match(intakeSource, /await startDiagnosis\(\)/)
assert.match(entryConfirmSource, /uni\.showModal\(/)
assert.match(entryConfirmSource, /confirm \? 'pest' : DIAGNOSIS_PROFILE_FULL/)
assert.match(entryConfirmSource, /fail: \(\) => resolve\(DIAGNOSIS_PROFILE_FULL\)/)
assert.match(intakeSource, /confirmDiagnosisProfile/)
assert.match(intakeSource, /selectedDiagnosisProfile\.value = await confirmDiagnosisProfile\(\)/)
assert.match(indexSource, /confirmDiagnosisProfile/)
assert.match(indexSource, /diagnosisProfile=\$\{diagnosisProfile\}/)
assert.match(detailSource, /confirmDiagnosisProfile/)
assert.match(detailSource, /diagnosisProfile=\$\{diagnosisProfile\}/)
assert.match(flowSource, /诊断 - \$\{plantName\}/)
assert.match(flowSource, /diagnosis-flow-header-back-button/)
assert.match(flowSource, /background: '#F8FAF9'/)
assert.match(flowCoreSource, /class="flex-1 pb-3 pt-4"/)
assert.match(flowCoreSource, /class="h-12 w-full rounded-xl bg-primary/)
assert.match(flowCoreSource, /:disabled="isVisualScanning"/)
assert.match(flowCoreSource, /:class="\{ 'opacity-70': isVisualScanning \}"/)
assert.match(flowCoreSource, /\{\{ isVisualScanning \? '扫描中…' : '开始诊断' \}\}/)
assert.match(flowCoreSource, /diagnose-flow-content--with-sticky-footer/)
assert.match(flowCoreSource, /diagnose-flow-footer--sticky/)
assert.doesNotMatch(flowCoreSource, /:disabled="!canStartDiagnoseNow"/)
assert.match(flowComputedSource, /const isVisualScanning = computed\(/)
assert.match(
  flowComputedSource,
  /diagnoseMutation\.isPending\?\.value/
)
assert.match(flowComputedSource, /diagnoseMutation\.isLoading\?\.value/)
assert.match(flowStateSource, /const visualScanning = ref\(false\)/)
assert.match(flowImagesSource, /visualScanning\.value = true/)
assert.match(flowImagesSource, /finally \{\s*visualScanning\.value = false/)
assert.match(flowDialogSubmitSource, /visualScanning\.value = true/)
assert.match(flowDialogSubmitSource, /finishVisualScan/)
assert.match(flowSetupSource, /isVisualScanning: ctx\.isVisualScanning/)
assert.match(flowViewDefaultsSource, /isVisualScanning: false/)

assert.match(intakeDraftSource, /DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX/)
assert.match(intakeDraftSource, /uni\.setStorageSync/)
assert.match(intakeDraftSource, /diagnosisResult/)
assert.match(diagnosisStartSource, /diagnose-http\/diagnosis\/start/)
assert.match(diagnosisStartSource, /diagnosis-question-start-http\/diagnosis\/question\/start/)
assert.match(diagnosisStartSource, /DIAGNOSIS_HTTP_BASE_URL/)
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

console.log('diagnosis tab common-ui route contract tests passed')
