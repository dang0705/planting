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
const imagePreviewSource = read('src/utils/diagnosis-image-preview.js')
const flowSource = read('src/subpackages/diagnosis/flow.vue')
const flowCoreSource = read('src/subpackages/diagnosis/diagnose-flow/DiagnoseFlow.vue')
const flowStyleSource = read('src/subpackages/diagnosis/diagnose-flow/style.css')
const flowComputedSource = read('src/subpackages/diagnosis/diagnose-flow/computed.js')
const flowSetupSource = read('src/subpackages/diagnosis/diagnose-flow/setup.js')
const flowStateSource = read('src/subpackages/diagnosis/diagnose-flow/state.js')
const flowImagesSource = read('src/subpackages/diagnosis/diagnose-flow/images.js')
const flowDialogSubmitSource = read('src/subpackages/diagnosis/diagnose-flow/dialog-submit.js')
const flowViewDefaultsSource = read('src/subpackages/diagnosis/diagnose-flow/view-defaults.js')
const layoutSource = read('src/Layout.vue')
const userPlantsSource = read('src/components/UserPlantsSection.vue')
const detailSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'
)

const pagesConfig = JSON.parse(pagesJson.replace(/^\s*\/\/\s*#(?:if|endif|else).*$/gm, ''))
assert.deepEqual(
  pagesConfig.tabBar.list.map(item => item.pagePath),
  [
    'pages/index/index',
    'pages/garden/garden',
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
assert.match(pageSource, /import \{ onShow \} from '@dcloudio\/uni-app'/)
assert.match(pageSource, /requestPhoneLogin\(\{ message: '登录后才能继续使用植物状况检查' \}\)/)
assert.match(pageSource, /if \(!userStore\.isAuthenticated\)/)
assert.match(pageSource, /id="diagnose-tab-intake"/)
assert.match(pageSource, /<DiagnoseIntake :view="intakeView" \/>/)
assert.doesNotMatch(pageSource, /section-change|handleIntakeSectionChange/)
assert.match(pageSource, /id="diagnose-submit-button"/)
assert.match(pageSource, /@click="startDiagnosis"/)
assert.match(pageSource, /useDiagnosisTabIntake/)
assert.match(pageSource, /onShow\(/)
assert.doesNotMatch(pageSource, /onLoad\(/)
assert.doesNotMatch(pageSource, /redirectTo\(/)
assert.doesNotMatch(pageSource, /navigateTo\(/)
assert.doesNotMatch(pageSource, /subpackages\/diagnosis/)

assert.match(intakeViewSource, /id="diagnose-upload-stage"/)
assert.doesNotMatch(intakeViewSource, /id="diagnose-profile-full-button"/)
assert.doesNotMatch(intakeViewSource, /id="diagnose-profile-pest-button"/)
assert.match(intakeViewSource, /id="diagnose-symptom-mode-toggle"/)
assert.match(intakeViewSource, /id="diagnose-upload-toggle"/)
assert.match(intakeViewSource, /常见明显症状/)
assert.match(intakeViewSource, /AI诊断/)
assert.doesNotMatch(intakeViewSource, /section-change|expandedSection|toggleSection/)
assert.match(intakeViewSource, /isSymptomDisabled/)
assert.match(intakeViewSource, /isAiDisabled/)
assert.match(intakeViewSource, /resetImageUploads\(\)/)
assert.match(intakeViewSource, /view\.clearDevSymptomClass\(\)/)
assert.match(intakeViewSource, /id="diagnose-no-image-entry-panel"/)
assert.match(intakeViewSource, /diagnose-dev-symptom-class-option-\$\{item\.classKey\}/)
assert.match(intakeViewSource, /@click="handleSymptomModeSelect\(item\)"/)
assert.match(
  intakeViewSource,
  /const selectedDevSymptomClassKey = computed\(\(\) =>[\s\S]*view\.selectedDevSymptomClassKey/
)
assert.match(
  intakeViewSource,
  /const selectedDevSymptomClassOption = computed\([\s\S]*view\.selectedDevSymptomClassOption/
)
assert.match(
  intakeViewSource,
  /return \{[\s\S]*\.\.\.view,[\s\S]*selectedDevSymptomClassKey,[\s\S]*selectedDevSymptomClassOption,/
)
assert.match(intakeViewSource, /\.diagnose-quick-select\s*\{[\s\S]*?height: 43px;/)
assert.doesNotMatch(intakeViewSource, /\.diagnose-quick-option:nth-child\((3|4|5)\)/)
assert.match(intakeViewSource, /\.diagnose-quick-option--active\s*\{[\s\S]*?border-color: #2d7a4f;/)
for (const label of ['叶子发黄', '枯萎']) {
  assert.match(intakeViewSource, new RegExp(label))
}
for (const label of ['黑斑', '褐斑', '长势不佳']) {
  assert.doesNotMatch(intakeViewSource, new RegExp(`label: '${label}'`))
}
assert.match(intakeViewSource, /diagnosisOrganUpload/)
assert.match(intakeViewSource, /@\/constants\/diagnosis-intake\.js/)
assert.doesNotMatch(intakeViewSource, /@\/subpackages\/diagnosis\/diagnose-flow\/constants\.js/)
assert.match(intakeViewSource, /id="diagnose-organ-upload-board"/)
assert.match(intakeViewSource, /isVisualScanning \? visualScanText/)
assert.match(
  intakeViewSource,
  /const visualScanText = computed\(\(\) =>[\s\S]*view\.visualScanText \|\| VISUAL_SCAN_LOADING_TEXT/
)
assert.match(
  intakeViewSource,
  /return \{[\s\S]*\.\.\.view,[\s\S]*isVisualScanning,[\s\S]*visualScanText,/
)
assert.match(intakeViewSource, /diagnose-section-help--scanning/)
assert.match(intakeViewSource, /\.diagnose-section-help--scanning\s*\{[\s\S]*?white-space: normal;/)
assert.match(intakeViewSource, /id="diagnose-visual-scan-line"/)
assert.match(intakeViewSource, /<template v-else>[\s\S]*v-for="slot in ORGAN_UPLOAD_BUTTONS"/)
assert.match(
  intakeViewSource,
  /animation: diagnose-visual-scan 1\.8s ease-in-out infinite alternate;/
)
assert.match(intakeViewSource, /box-shadow: 0 0 12px 2px rgba\(45, 122, 79, 0\.6\);/)
assert.match(intakeViewSource, /translateY\(414px\)/)
assert.match(intakeViewSource, /:id="`diagnose-upload-\$\{slot\.slotType\}-button`"/)
for (const slotType of ['whole_plant', 'leaf', 'stem', 'soil', 'root_crown']) {
  assert.match(intakeViewSource, new RegExp(`slotType: '${slotType}'`))
}
for (const label of [
  "label: '全株图'",
  "label: '叶'",
  "label: '茎'",
  "label: '土表'",
  "label: '根'"
]) {
  assert.match(intakeViewSource, new RegExp(label))
}
for (const label of [
  "uploadedLabel: '全株图'",
  "uploadedLabel: '叶片'",
  "uploadedLabel: '茎'",
  "uploadedLabel: '土表'",
  "uploadedLabel: '根部'"
]) {
  assert.match(intakeViewSource, new RegExp(label))
}
assert.match(intakeViewSource, /getSlotImage\(slot\.slotType\)/)
assert.match(intakeViewSource, /previewDiagnosisImage\(slotImage, view\.imageFiles\)/)
assert.match(intakeViewSource, /diagnose-organ-slot-preview/)
assert.match(intakeViewSource, /diagnose-organ-slot-remove/)
assert.match(
  intakeViewSource,
  /\.diagnose-organ-slot--whole_plant\s*\{[\s\S]*?left: 108px;[\s\S]*?width: 112px;/
)
assert.match(
  intakeViewSource,
  /\.diagnose-organ-slot--leaf\s*\{[\s\S]*?top: 64px;[\s\S]*?left: 12px;[\s\S]*?width: 85px;/
)
assert.match(intakeViewSource, /\{ slotType: 'leaf', label: '叶', uploadedLabel: '叶片'/)
assert.match(
  intakeViewSource,
  /\.diagnose-organ-slot--soil\s*\{[\s\S]*?top: 210px;[\s\S]*?left: 12px;[\s\S]*?width: 85px;/
)
assert.match(
  intakeViewSource,
  /\.diagnose-organ-slot--root_crown\s*\{[\s\S]*?top: 316px;[\s\S]*?left: 230px;[\s\S]*?width: 85px;/
)
assert.match(
  intakeViewSource,
  /\.diagnose-organ-slot\s*\{[\s\S]*?border: 2px dashed rgba\(45, 122, 79, 0\.82\);/
)
assert.doesNotMatch(
  intakeViewSource,
  /\.diagnose-organ-slot-label\s*\{[\s\S]*?text-overflow: ellipsis;/
)
assert.doesNotMatch(uploadIllustrationSource, /id="Vector" d="M147\.494 81\.3725/)
assert.doesNotMatch(uploadIllustrationSource, /id="Vector_2" d="M201\.742 109\.294/)
assert.match(
  uploadIllustrationSource,
  /id="Vector_4" d="M137\.921 286\.5C123\.5 271 109\.5 247 96\.5 234\.5/
)
assert.equal((uploadIllustrationSource.match(/stroke-dasharray=/g) || []).length, 3)
assert.equal(
  (uploadIllustrationSource.match(/stroke-opacity="0\.45" stroke-width="2\.4"/g) || []).length,
  3
)
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
assert.match(intakeSource, /uploader\.hasPendingUploads\.value/)
assert.match(intakeSource, /uploader\.hasUploadErrors\.value/)
assert.match(
  intakeSource,
  /return imageFiles\.value\.length > NO_IMAGES \|\| Boolean\(selectedDevSymptomClassOption\.value\)/
)
assert.match(intakeSource, /resetImages: resetImageUploads/)
assert.doesNotMatch(intakeSource, /activeIntakeSection|handleIntakeSectionChange/)
assert.match(intakeSource, /function handleSymptomClassQuickSelect\(option = null\)/)
assert.match(intakeSource, /diagnosisProfile: DIAGNOSIS_PROFILE_FULL/)
assert.doesNotMatch(intakeSource, /confirmDiagnosisProfile|selectedDiagnosisProfile|虫害诊断/)
assert.match(flowImagesSource, /diagnosisProfile: selectedDiagnosisProfile\.value/)
assert.doesNotMatch(flowImagesSource, /confirmDiagnosisProfile/)
assert.match(flowSource, /const diagnosisProfile = ref\('full'\)/)
assert.match(flowSource, /normalizeDiagnosisProfile\(options\?\.diagnosisProfile\)/)
assert.doesNotMatch(
  userPlantsSource,
  /confirmDiagnosisProfile|diagnosisProfile=\$\{diagnosisProfile\}/
)
assert.doesNotMatch(detailSource, /confirmDiagnosisProfile|diagnosisProfile=\$\{diagnosisProfile\}/)
assert.match(flowSource, /诊断 - \$\{plantName\.value\}/)
assert.match(flowSource, /diagnosis-flow-header-back-button/)
assert.match(flowSource, /background: '#f8faf9'/)
assert.match(flowSource, /class="diagnosis-flow-page bg-\[#F8FAF9\]"/)
assert.match(flowSource, /height: calc\(100vh - var\(--app-header-height\)\)/)
assert.match(flowCoreSource, /class="diagnose-flow-root flex flex-col"/)
assert.match(flowCoreSource, /'diagnose-flow-root--intake': !result/)
assert.match(flowCoreSource, /class="flex-1 min-h-0"/)
assert.match(flowCoreSource, /'diagnose-flow-content--intake': !embedded && !result/)
assert.doesNotMatch(flowCoreSource, /section-change|handleIntakeSectionChange|activeIntakeSection/)
assert.match(flowCoreSource, /!isVisualScanning && imageFiles\.length/)
assert.match(flowCoreSource, /id="diagnose-uploaded-image-list"/)
assert.match(flowCoreSource, /diagnose-preview-image-\$\{index\}-button/)
assert.match(flowCoreSource, /@click="previewUploadedImage\(item\)"/)
assert.match(flowCoreSource, /previewDiagnosisImage\(item, state\.imageFiles\?\.value\)/)
assert.match(flowCoreSource, /getUploadedImageLabel\(item\)/)
assert.match(flowCoreSource, /class="diagnose-submit-button-label"/)
assert.match(flowCoreSource, /class="h-12 w-full rounded-xl bg-primary/)
assert.match(flowCoreSource, /:disabled="!canStartCurrentIntake"/)
assert.match(flowCoreSource, /:class="\{ 'opacity-70': !canStartCurrentIntake \}"/)
assert.match(flowCoreSource, /\{\{ isVisualScanning \? '扫描中…' : '开始诊断' \}\}/)
assert.doesNotMatch(flowCoreSource, /AIStreamDialog/)
assert.match(flowCoreSource, /diagnose-flow-content--with-sticky-footer/)
assert.match(flowCoreSource, /diagnose-flow-footer--sticky/)
assert.match(
  flowStyleSource,
  /\.diagnose-flow-root\s*\{[\s\S]*?height: 100%;[\s\S]*?min-height: 0;/
)
assert.match(flowStyleSource, /\.diagnose-flow-root--intake\s*\{[\s\S]*?overflow: hidden;/)
assert.match(
  flowStyleSource,
  /\.diagnose-flow-content--intake\s*\{[\s\S]*?padding-top: calc\(80px - var\(--app-header-height\)\);/
)
assert.match(
  flowStyleSource,
  /\.diagnose-flow-content--with-sticky-footer\s*\{[\s\S]*?overflow: hidden;[\s\S]*?padding-bottom: 0;/
)
assert.match(
  flowStyleSource,
  /\.diagnose-submit-button-label\s*\{[\s\S]*?align-items: center;[\s\S]*?height: 48px;/
)
assert.doesNotMatch(flowStyleSource, /\.diagnose-flow-footer--sticky\s*\{[\s\S]*?position:\s*fixed/)
assert.match(flowCoreSource, /const canStartCurrentIntake = computed\(/)
assert.match(flowCoreSource, /state\.canStartDiagnoseNow\?\.value/)
assert.match(flowSetupSource, /resetImages: \(\) => ctx\.uploader\.reset\(\)/)
assert.match(flowComputedSource, /const isVisualScanning = computed\(/)
assert.match(flowComputedSource, /diagnoseMutation\.isPending\?\.value/)
assert.match(flowComputedSource, /diagnoseMutation\.isLoading\?\.value/)
assert.match(flowStateSource, /const visualScanning = ref\(false\)/)
assert.match(flowStateSource, /const visualScanText = ref\(VISUAL_SCAN_LOADING_TEXT\)/)
assert.match(flowImagesSource, /visualScanning\.value = true/)
assert.match(flowImagesSource, /finally \{\s*visualScanning\.value = false/)
assert.match(flowImagesSource, /visualScanText\.value = VISUAL_SCAN_LOADING_TEXT/)
assert.match(flowImagesSource, /onText: updateVisualScanText/)
assert.match(flowImagesSource, /visualScanText\.value = VISUAL_SCAN_ERROR_TEXT/)
assert.match(flowImagesSource, /onText: updateVisualScanText/)
assert.match(flowImagesSource, /ctx\.completeVisualDiagnosis\?\.\(diagnosisResult\)/)
assert.doesNotMatch(flowImagesSource, /正在整理诊断结果/)
assert.doesNotMatch(flowImagesSource, /aiStreamDialogRef/)
assert.doesNotMatch(flowImagesSource, /showAIDialog\.value = true/)
assert.match(flowDialogSubmitSource, /function completeVisualDiagnosis\(/)
assert.doesNotMatch(flowDialogSubmitSource, /handleAIRetry/)
assert.doesNotMatch(flowDialogSubmitSource, /aiStreamDialogRef/)
assert.match(flowSetupSource, /isVisualScanning: ctx\.isVisualScanning/)
assert.match(flowSetupSource, /visualScanText: ctx\.visualScanText/)
assert.match(flowViewDefaultsSource, /isVisualScanning: false/)
assert.match(flowViewDefaultsSource, /visualScanText: ''/)

assert.match(intakeDraftSource, /DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX/)
assert.match(intakeDraftSource, /uni\.setStorageSync/)
assert.match(intakeDraftSource, /diagnosisResult/)
assert.match(diagnosisStartSource, /diagnose-http\/diagnosis\/start/)
assert.match(diagnosisStartSource, /diagnosis-question-start-http\/diagnosis\/question\/start/)
assert.match(diagnosisStartSource, /DIAGNOSIS_HTTP_BASE_URL/)
assert.match(diagnosisStartSource, /isRetryableRequestError/)
assert.match(diagnosisStartSource, /attempt <= 1/)
assert.match(structuredImagesSource, /sourceWidth: sourceWidth \|\| null/)
assert.match(imagePreviewSource, /uni\.previewImage\(\{ current, urls \}\)/)

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

assert.match(userPlantsSource, /subpackages\/diagnosis\/flow\?plantId=/)
assert.match(detailSource, /subpackages\/diagnosis\/flow\?\$\{query\}/)
assert.doesNotMatch(userPlantsSource, /subpackages\/diagnosis\/entry/)
assert.doesNotMatch(detailSource, /subpackages\/diagnosis\/entry/)

console.log('diagnosis tab common-ui route contract tests passed')
