import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const flowSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/DiagnoseFlow.vue'),
  'utf8'
)
const flowSetupSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/setup.js'),
  'utf8'
)
const dialogSubmitSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/dialog-submit.js'),
  'utf8'
)
const questionFlowSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/question-flow.js'),
  'utf8'
)
const riskSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/question-risk.js'),
  'utf8'
)
const retakeCardSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/RetakeCard.vue'),
  'utf8'
)
const resultStageSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/DiagnoseResultStage.vue'),
  'utf8'
)
const retakeCopySource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/retake-copy.js'),
  'utf8'
)
const diagnoseStateSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/state.js'),
  'utf8'
)
const diagnoseImagesSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/images.js'),
  'utf8'
)
const structuredImagesSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/structured-images.js'),
  'utf8'
)
const uploaderOptionsSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/image-uploader-options.js'),
  'utf8'
)
const cloudUploaderSource = fs.readFileSync(
  path.join(repoRoot, 'src/composables/useCloudImageUploader.js'),
  'utf8'
)
const retakeRequestSource = fs.readFileSync(
  path.join(repoRoot, 'src/http-functions/diagnose/retake.js'),
  'utf8'
)
const retakeExpirySource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/retake-expiry.js'),
  'utf8'
)
const diagnoseClientSource = fs.readFileSync(
  path.join(repoRoot, 'src/http-functions/diagnose/client.js'),
  'utf8'
)
const directionCardSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/DirectionChoiceCard.vue'),
  'utf8'
)
const uploadStageSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/DiagnoseUploadStage.vue'),
  'utf8'
)
const constantsSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/diagnose-flow/constants.js'),
  'utf8'
)
const answerMutationSource = fs.readFileSync(
  path.join(repoRoot, 'src/vue-query/diagnose/mutations/useDiagnosisAnswerMutation.js'),
  'utf8'
)
const popupSource = fs.readFileSync(path.join(repoRoot, 'src/components/DiagnosePopup.vue'), 'utf8')

assert.match(flowSource, /setupDiagnoseFlowState/)
assert.doesNotMatch(flowSource, /components\/diagnose-popup/)
assert.match(flowSource, /from '\.\/DiagnoseUploadStage\.vue'/)
assert.match(flowSource, /from '\.\/DiagnoseResultStage\.vue'/)
assert.doesNotMatch(flowSource, /\.\.\/diagnose-popup\/style\.css/)
assert.doesNotMatch(flowSetupSource, /diagnose-popup/)
assert.equal(fs.existsSync(path.join(repoRoot, 'src/components/diagnose-popup')), false)
assert.match(flowSource, /diagnosisProfile: \{ type: String, default: 'full' \}/)
assert.match(flowSource, /entrySource: \{ type: String, default: 'diagnose_tab' \}/)
assert.match(flowSource, /id="diagnose-submit-button"/)
assert.ok(
  constantsSource.indexOf("classNameCn: '叶子发黄'") <
    constantsSource.indexOf("classNameCn: '发蔫或下垂'")
)
assert.match(uploadStageSource, /只看虫害需要照片/)
assert.match(dialogSubmitSource, /buildDirectionChoicePayload/)
assert.match(answerMutationSource, /selectedModeKey/)
assert.match(directionCardSource, /图片里发现多个可能方向，建议先处理推荐项。/)
assert.match(retakeCardSource, /diagnose-retake-skip-button/)
assert.match(retakeCardSource, /diagnose-retake-skipped-text/)
assert.match(retakeCardSource, /已跳过补拍/)
assert.match(retakeCardSource, /本次暂不能继续判断，请重新诊断/)
assert.match(retakeCardSource, /v-else-if="retakeSkippedUnknown"/)
assert.match(retakeCardSource, /不敢操作 \/ 跳过/)
assert.match(retakeCardSource, /readableCaptureRegion/)
assert.equal((diagnoseStateSource.match(/\.\.\.DIAGNOSIS_IMAGE_UPLOAD_OPTIONS/g) || []).length, 2)
assert.match(uploaderOptionsSource, /maxImagePixels: 1638400/)
assert.match(uploaderOptionsSource, /minimumCompressionQuality: 68/)
assert.match(cloudUploaderSource, /compressedWidth: dimensions\.width/)
assert.match(cloudUploaderSource, /compressedHeight: dimensions\.height/)
assert.match(diagnoseImagesSource, /from '\.\/structured-images'/)
assert.match(structuredImagesSource, /sourceWidth: sourceWidth \|\| null/)
assert.match(structuredImagesSource, /sourcePixelCount: sourcePixelCount \|\| null/)
assert.match(structuredImagesSource, /estimatedQwenVisualTokens:/)
assert.match(
  retakeCopySource,
  /确认开始后，请在 3 分钟内完成拍摄并提交。超过时间，本次诊断将结束。/
)
assert.match(dialogSubmitSource, /cancelText: '暂不补拍'/)
assert.match(dialogSubmitSource, /requestDiagnosisRetakeSkip/)
assert.match(dialogSubmitSource, /retakeAuthorizationPending/)
assert.match(retakeRequestSource, /diagnosis\/retake\/skip/)
assert.match(dialogSubmitSource, /handleRetakeExpiredUploadError/)
assert.match(retakeExpirySource, /requestDiagnosisResult/)
assert.match(retakeExpirySource, /补拍时间已结束，本次诊断已结束/)
assert.match(diagnoseClientSource, /businessCode/)
assert.match(questionFlowSource, /goNextQuestion\(\)/)
assert.match(questionFlowSource, /await submitQuestionAnswers\(\)/)
assert.match(flowSetupSource, /getQuestionSafetyInstructionsText/)
assert.match(resultStageSource, /getQuestionSafetyInstructionsText\(question\)/)
assert.doesNotMatch(resultStageSource, /\{\{\s*question\.safetyInstructions\s*\}\}/)
assert.match(riskSource, /requiresExplicitConsent/)
assert.match(riskSource, /isQuestionRiskOptionBlocked/)
assert.match(popupSource, /diagnosisProfile: \{ type: String, default: 'full' \}/)
assert.match(popupSource, /entrySource: \{ type: String, default: 'plant_card' \}/)
assert.match(popupSource, /<DiagnoseFlow/)
assert.doesNotMatch(popupSource, /setupDiagnosePopup/)
assert.match(popupSource, /resetDiagnose/)
