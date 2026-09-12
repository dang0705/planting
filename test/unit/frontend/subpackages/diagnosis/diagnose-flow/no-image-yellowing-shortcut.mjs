import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// 镜像契约：症状模式只负责选择，按设计稿由底部“开始诊断”统一提交。
// 无图时点击 diagnose-dev-symptom-class-option-yellowing_mode 后保持在当前页，
// 点击底部按钮再复用 startQuestionDiagnosisFromSymptomClass。

const repoRoot = process.cwd()
const popupActionsSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/diagnosis/diagnose-flow/popup-actions.js'),
  'utf8'
)
const constantsSource = fs.readFileSync(
  path.join(repoRoot, 'src/constants/diagnosis-intake.js'),
  'utf8'
)
const uploadStageSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnosis/DiagnoseIntake.vue'),
  'utf8'
)
const questionStartMutationSource = fs.readFileSync(
  path.join(
    repoRoot,
    'src/subpackages/diagnosis/vue-query/diagnose/mutations/useDiagnosisQuestionStartMutation.js'
  ),
  'utf8'
)
const diagnoseClientSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/diagnosis/http-functions/diagnose/client.js'),
  'utf8'
)

// 契约 1：黄叶快捷项点击事件只更新本地选中态，不得绕过设计稿底部按钮自动提交。
assert.match(
  popupActionsSource,
  /function handleSymptomClassQuickSelect[\s\S]*?selectDevSymptomClass\(option\?\.classKey \|\| ''\)/,
  'handleSymptomClassQuickSelect must set the local selected class key'
)
// 锁定选择函数只改变状态；真正的 question/start 仍由开始诊断按钮触发。
const quickSelectBodyMatch = popupActionsSource.match(
  /function handleSymptomClassQuickSelect\(option = null\) \{([\s\S]*?)\n\s{2}\}\n\n\s{2}async function startQuestionDiagnosisFromSymptomClass/
)
assert.ok(quickSelectBodyMatch, 'handleSymptomClassQuickSelect body must be locatable')
const quickSelectBody = quickSelectBodyMatch[1]
assert.match(
  quickSelectBody,
  /selectDevSymptomClass\(option\?\.classKey \|\| ''\)/,
  'handleSymptomClassQuickSelect must set the local selected class key'
)
assert.doesNotMatch(
  quickSelectBody,
  /startQuestionDiagnosisFromSymptomClass\(\)/,
  'handleSymptomClassQuickSelect must wait for the bottom submit button'
)
assert.match(
  popupActionsSource,
  /async function startQuestionDiagnosisFromSymptomClass[\s\S]*?questionStartMutation\.mutateAsync\(/,
  'bottom submit path must still start the question package'
)

// 契约 2：startQuestionDiagnosisFromSymptomClass 必须调用 questionStartMutation.mutateAsync，
// payload 含 symptomClassKey 与 diagnosisProfile，不得调用视觉诊断 start mutation。
assert.match(
  popupActionsSource,
  /async function startQuestionDiagnosisFromSymptomClass[\s\S]*?questionStartMutation\.mutateAsync\(\{[\s\S]*?symptomClassKey: option\.classKey[\s\S]*?diagnosisProfile: selectedDiagnosisProfile\.value/,
  'startQuestionDiagnosisFromSymptomClass must call questionStartMutation.mutateAsync with symptomClassKey and diagnosisProfile'
)
assert.doesNotMatch(
  popupActionsSource,
  /diagnoseMutation\.mutateAsync/,
  'no-image shortcut path must not invoke visual diagnosis start mutation'
)

// 契约 3：有图时点击症状仍只更新本地选中态，开始诊断按钮走图片诊断路径。

// 契约 4：只看虫害模式下黄叶快捷项必须拒绝并提示需要照片。
assert.match(
  popupActionsSource,
  /function handleSymptomClassQuickSelect[\s\S]*?if \(selectedDiagnosisProfile\.value === 'pest'\) \{[\s\S]*?uni\.showToast\(\{ title: '只看虫害需要先上传照片'/,
  'pest profile must reject no-image yellowing shortcut with a toast'
)

// 契约 5：黄叶快捷项的 payload 不得包含 image/images 字段。
// 通过确认 mutateAsync 调用块内未出现 image/images 字段来锁定。
const mutateAsyncBlockMatch = popupActionsSource.match(
  /questionStartMutation\.mutateAsync\(\{([\s\S]*?)\}\)/
)
assert.ok(mutateAsyncBlockMatch, 'questionStartMutation.mutateAsync call block must exist')
const mutateAsyncBlock = mutateAsyncBlockMatch[1]
assert.doesNotMatch(
  mutateAsyncBlock,
  /\bimage:/,
  'yellowing shortcut mutateAsync payload must not include image field'
)
assert.doesNotMatch(
  mutateAsyncBlock,
  /\bimages:/,
  'yellowing shortcut mutateAsync payload must not include images field'
)
assert.match(mutateAsyncBlock, /symptomClassKey: option\.classKey/)
assert.match(mutateAsyncBlock, /diagnosisProfile: selectedDiagnosisProfile\.value/)
assert.match(mutateAsyncBlock, /entrySource: props\.entrySource \|\| 'plant_card'/)

// 契约 6：onFinish 必须导航到 question-package 页面。
assert.match(
  popupActionsSource,
  /onFinish: diagnosisResult => \{[\s\S]*?navigateToDiagnosisQuestionPackagePage\(diagnosisResult\)/,
  'yellowing shortcut onFinish must navigate to question-package page'
)

// 契约 7：constants.js 必须提供 yellowing_mode 与独立的 wilting_droop_mode 两个快捷项。
assert.match(constantsSource, /classKey: 'yellowing_mode'/)
assert.match(constantsSource, /classKey: 'wilting_droop_mode'/)
assert.ok(
  constantsSource.indexOf("classKey: 'yellowing_mode'") <
    constantsSource.indexOf("classKey: 'wilting_droop_mode'"),
  'yellowing_mode must be declared before wilting_droop_mode so both stay independent'
)

// 契约 8：共享 DiagnoseIntake 必须为每个快捷项渲染独立的语义化 id，并绑定设计稿选择处理函数。
assert.match(
  uploadStageSource,
  /:id="`diagnose-dev-symptom-class-option-\$\{item\.classKey\}`"/,
  'each symptom class quick option must carry a stable semantic id keyed by classKey'
)
assert.match(
  uploadStageSource,
  /@click="handleSymptomModeSelect\(item\)"/,
  'quick option click must bind the design-state selection handler'
)
assert.match(
  uploadStageSource,
  /id="diagnose-no-image-entry-panel"/,
  'no-image entry panel must keep its semantic id'
)

// 契约 9：questionStartMutation 必须调用 diagnose-http/diagnosis/question/start，
// 并把 symptomClassKey 与 diagnosisProfile 透传到请求 payload。
assert.match(
  questionStartMutationSource,
  /diagnosisProfile/,
  'question start mutation must accept diagnosisProfile'
)
assert.match(
  questionStartMutationSource,
  /symptomClassKey: normalizedSymptomClassKey/,
  'question start mutation must forward symptomClassKey to the request payload'
)
assert.match(
  questionStartMutationSource,
  /requestDiagnosisQuestionStart\(requestPayload\)/,
  'question start mutation must call requestDiagnosisQuestionStart'
)
assert.match(
  diagnoseClientSource,
  /functionPath: 'diagnose-http\/diagnosis\/question\/start'/,
  'diagnose client must target diagnose-http/diagnosis/question/start'
)
// 确保 question/start 与视觉 diagnosis/start 是两个独立路径。
assert.match(
  diagnoseClientSource,
  /functionPath: 'diagnose-http\/diagnosis\/start'/,
  'visual diagnosis start must remain a separate path from question/start'
)

console.log('diagnose flow no-image yellowing shortcut contract tests passed')
