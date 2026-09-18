// data_mode=unit_fake; test_kind=source_contract. Vue rendering remains covered by Automator live QA.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const stage = fs.readFileSync(
  path.join(process.cwd(), 'src/components/watering/WateringSoilEvidenceStage.vue'),
  'utf8'
)
const intake = fs.readFileSync(
  path.join(process.cwd(), 'src/components/diagnosis/DiagnoseIntake.vue'),
  'utf8'
)

assert.match(stage, /mode="soil-only"/u)
assert.match(stage, /<WateringSoilInteriorCheck[\s\S]*v-if="needsInteriorCheck"/u)
assert.match(stage, /soilMoistureOverride: resolveSoilMoistureOverride\(\)/u)
assert.match(stage, /hasWateringHistoryInput: interiorCheck\.value\.mode === 'history'/u)
assert.match(stage, /review\.surfaceState === 'dry'/u)
assert.match(stage, /props\.enableInteriorCheck/u)
assert.match(stage, /id="watering-soil-continue-button"/u)
assert.match(stage, /showContinue && hasVisualResult && !loading/u)
assert.match(stage, /class="watering-soil-continue-dock"/u)
assert.match(stage, /position: fixed/u)
assert.match(stage, /id="watering-soil-confirm-analysis-button"/u)
assert.match(stage, /id="watering-soil-retry-analysis-button"/u)
assert.match(stage, /const uploading = ref\(false\)/u)
assert.match(stage, /const analyzing = ref\(false\)/u)
assert.match(stage, /analysisStarted\.value = true/u)
assert.match(stage, /startVisualScan\(\)[\s\S]{0,220}await inspectUploadedImage/u)
assert.match(stage, /resolveTempUrl: true/u)
assert.match(stage, /<WateringSoilVisualDecision/u)
assert.match(stage, /temporaryEvidenceHandedOff/u)
assert.match(stage, /const evidenceSubmitting = ref\(false\)/u)
assert.match(stage, /loading\.value \|\| evidenceSubmitting\.value/u)
assert.match(stage, /evidenceSubmitting\.value = true/u)
assert.match(stage, /function resetSubmissionGuard\(\)[\s\S]{0,120}evidenceSubmitting\.value = false/u)
assert.match(stage, /defineExpose\(\{[\s\S]{0,240}resetSubmissionGuard/u)
assert.match(stage, /temporaryFileId/u)
assert.match(stage, /!temporaryEvidenceHandedOff\.value/u)
assert.match(intake, /v-if="soilOnly"/u)
assert.match(intake, /id="watering-soil-upload-zone"/u)
assert.match(intake, /id="watering-soil-replace-button"/u)
assert.match(intake, /id="watering-soil-remove-button"/u)
assert.match(intake, /id="watering-soil-upload-loading"/u)
assert.match(intake, /class="diagnose-upload-spinner"/u)
assert.match(intake, /v-else-if="!isVisualScanning && !soilUploadLoading"/u)
assert.match(intake, /v-else-if="soilUploadLoading"[^>]*id="watering-soil-upload-loading"/u)
assert.doesNotMatch(intake, /watering-soil-upload-progress/u)
assert.doesNotMatch(intake, /图片上传中…/u)
assert.doesNotMatch(intake, /正在上传/u)
assert.doesNotMatch(intake, /visualScanText \? visualScanText/u)
assert.match(intake, /v-if="soilOnlyImage\?\.previewUrl && !soilUploadLoading"/u)
assert.match(intake, /id="watering-soil-analysis-locked-hint"/u)
assert.match(intake, /soilUploadLoading/u)
assert.match(intake, /soilLocked/u)
assert.match(intake, /isSoilInteractionLocked/u)
assert.match(intake, /点击盆土区域上传照片/u)
assert.match(intake, /请俯拍盆土表面/u)
assert.match(intake, /isVisualScanning/u)
assert.match(intake, /diagnose-visual-scan-line/u)
assert.match(intake, /id="watering-soil-scan-overlay"[^>]*class="watering-soil-scan-overlay"/u)
assert.match(
  intake,
  /<template v-if="soilOnlyImage\?\.previewUrl && !soilUploadLoading">[\s\S]*?<image[\s\S]*?class="watering-soil-upload-preview"/u
)
assert.match(intake, /watering-soil-scan-overlay[\s\S]*diagnose-visual-scan-line/u)
assert.match(stage, /resolveInteriorCheckCanContinue\(\)/u)
assert.match(stage, /请选择盆土状态后再继续/u)
assert.match(stage, /请选择至少一个浇水日期后再继续/u)
assert.match(stage, /跳过以上操作后可继续/u)
assert.match(stage, /interiorValidationMessage/u)
assert.match(stage, /id="watering-soil-interior-validation"/u)
assert.equal(
  /v-for="slot in ORGAN_UPLOAD_BUTTONS"[\s\S]{0,1600}watering-soil-upload-zone/u.test(intake),
  false
)

const interior = fs.readFileSync(
  path.join(process.cwd(), 'src/components/watering/WateringSoilInteriorCheck.vue'),
  'utf8'
)
assert.match(interior, /我已摸到超过盆深 1\/3，确认盆土状态/u)
assert.match(interior, /填写过往 10 天的浇水情况/u)
assert.match(interior, /按盆土里面也干处理/u)
assert.match(interior, /CareBehaviorTimeline/u)

const decision = fs.readFileSync(
  path.join(process.cwd(), 'src/components/watering/WateringSoilVisualDecision.vue'),
  'utf8'
)
assert.match(decision, /盆土视觉结果/u)
assert.match(decision, /本次行动/u)

console.log('watering soil-only uploader source-contract tests passed')
