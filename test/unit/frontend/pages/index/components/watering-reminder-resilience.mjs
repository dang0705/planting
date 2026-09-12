import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/WateringReminderSheet.vue'),
  'utf8'
)
const stepperSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/WateringReminderInputStepper.vue'),
  'utf8'
)
const inputFlowSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/useWateringReminderInputFlow.js'),
  'utf8'
)
const indexSource = fs.readFileSync(path.join(repoRoot, 'src/pages/index/index.vue'), 'utf8')
const calendarSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/useWateringReminderCalendar.js'),
  'utf8'
)
const inputSectionSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/WateringReminderInputSection.vue'),
  'utf8'
)
const resultCardSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/WateringReminderResultCard.vue'),
  'utf8'
)
const plannerOptionsSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/watering-reminder-options.js'),
  'utf8'
)
const bottomSheetSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/common/BottomSheet.vue'),
  'utf8'
)
const timelineGridSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/care-behavior-timeline/CareBehaviorTimelineGrid.vue'),
  'utf8'
)
const timelineSkeletonSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/care-behavior-timeline/CareBehaviorTimelineSkeleton.vue'),
  'utf8'
)
const potFormSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/pot-profile/PotProfileFormCore.vue'),
  'utf8'
)
const potCanvasSource = fs.readFileSync(path.join(repoRoot, 'src/components/PotCanvas.vue'), 'utf8')
assert.match(calendarSource, /return addToCalendarAction\.run\(/)
assert.match(calendarSource, /await addPhoneCalendar\(calendarPayload\)/)
assert.match(source, /:confirm-loading="loading"|confirm-loading/)
assert.match(source, /pendingReminderSavePayload\.value/)
assert.match(source, /hasRequiredWateringHistory\.value/)
assert.match(source, /WateringReminderInputStepper/)
assert.match(source, /:loading="reminderLoading"/)
assert.doesNotMatch(source, /:loading="reminderLoading \|\| weatherLoading"/)
assert.match(source, /id="watering-reminder-input-error"/)
assert.match(calendarSource, /不要重复添加日历/)
assert.match(source, /panel-id="watering-reminder-sheet"[\s\S]*height-mode="fullHeight"/)
assert.match(source, /content-id="watering-reminder-sheet-content"/)
assert.match(stepperSource, /<CareBehaviorTimeline[\s\S]*:loading="loading"[\s\S]*:error="''"/)
assert.match(
  timelineGridSource,
  /CareBehaviorTimelineSkeleton[\s\S]*:id="`\$\{idPrefix\}-care-behavior-skeleton`"/
)
assert.match(timelineSkeletonSource, /:id="id"/)
const sheetPlannerSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/useWateringReminderPlanner.js'),
  'utf8'
)
assert.match(
  sheetPlannerSource,
  /const weatherError = ref\(''\)[\s\S]*resolveEnvironmentWeatherWindowNotice\(window\)/
)
assert.match(sheetPlannerSource, /weatherError\.value = '暂时无法获取天气，日期仍可继续填写。'/)
assert.match(bottomSheetSource, /v-if="isFullHeightMode"[\s\S]*:scroll-y="true"/)
assert.match(calendarSource, /当前盆型信息不完整，这个日期是暂估。仍要添加提醒吗？/)
assert.match(source, /先填写过往浇水日期/)
assert.match(source, /继续同步/)
assert.match(source, /if \(event\?\.show === false\)/)
assert.match(source, /if \(event\?\.show === true\)/)
assert.match(potFormSource, /value: 'false'/)
assert.match(potFormSource, /value: 'unknown'/)
assert.match(potFormSource, /\$\{idPrefix\}-drainage-\$\{option\.value\}/)
assert.match(potFormSource, /基质信息（可选）/)
assert.match(potFormSource, /拖动绿色节点调整盆型尺寸。/)
assert.match(potFormSource, /示例尺寸仅作参考，拖动后才会纳入。/)
assert.doesNotMatch(potFormSource, /top-diameter-input|height-input|bottom-diameter-input/)
assert.doesNotMatch(potFormSource, /也可以直接填写厘米数/)
assert.match(potFormSource, /function updateDimension\(field, value\)/)
assert.match(potFormSource, /function setDrainageOption\(value\)/)
assert.match(potFormSource, /emit\('change', getPayload\(\)\)/)
assert.match(potFormSource, /potTopDiameterCm: ''/)
assert.match(potCanvasSource, /v-if="shouldRenderCanvas"/)
assert.match(potCanvasSource, /pot-canvas-drag-handle/)
assert.match(potCanvasSource, /pot-canvas-handle-breathe/)
assert.match(potCanvasSource, /@keyframes pot-canvas-handle-breathe/)
assert.match(potCanvasSource, /@touchmove\.stop\.prevent="onTopHandleTouchMove"/)
assert.match(potCanvasSource, /function getTouchPoint\(event\)/)
assert.match(potCanvasSource, /event\?\.changedTouches\?\.\[0\]/)
assert.match(potCanvasSource, /props\.previewOnly \|\| hasAnyDimensions\.value/)
assert.match(potCanvasSource, /watch\(\s*shouldRenderCanvas/)
assert.match(potCanvasSource, /setupRequestId \+= 1/)
assert.match(potCanvasSource, /:id="canvasId"/)
assert.match(potCanvasSource, /select\(`#\$\{canvasId\.value\}`\)/)
assert.match(potCanvasSource, /Array\.isArray\(props\.substrateComposition\)/)
assert.match(potCanvasSource, /Number\.isFinite\(ratio\) && ratio > 0/)
assert.match(potFormSource, /Array\.isArray\(parsed\) \? parsed : \[\]/)
assert.match(potFormSource, /function initCanvas\(\)/)
assert.match(potFormSource, /potCanvasRef\.value\?\.initCanvas\?\./)
assert.match(stepperSource, /ButtonStepTrack/)
assert.match(stepperSource, /:fill="false"/)
assert.match(stepperSource, /watering-reminder-input/)
assert.match(stepperSource, /function getPotFormTargets\(\)/)
assert.match(stepperSource, /@change="handlePotProfileChange"/)
assert.match(stepperSource, /const potProfileDraft = ref\(null\)/)
assert.match(stepperSource, /function handlePotProfileChange\(payload\)/)
assert.match(stepperSource, /return potProfileDraft\.value \|\| invokePotFormMethod\('getPayload'\)/)
assert.match(stepperSource, /const hasTop = Number\(payload\.potTopDiameterCm\) > 0/)
assert.match(stepperSource, /Array\.isArray\(value\)/)
assert.match(stepperSource, /function invokePotFormMethod\(methodName, \.\.\.args\)/)
assert.match(stepperSource, /watch\(\s*safeActiveStep[\s\S]*invokePotFormMethod\('initCanvas'\)/)
assert.match(stepperSource, /resolveComponentMethod\(target, methodName\)/)
assert.match(stepperSource, /return invokePotFormMethod\('getProfileState'\)/)
assert.match(stepperSource, /label: '过往浇水日期'/)
assert.match(stepperSource, /lastHistorySignature/)
assert.match(stepperSource, /nextSignature === lastHistorySignature\.value/)
assert.match(inputFlowSource, /inputFlowHistorySignature/)
assert.match(inputFlowSource, /nextSignature === inputFlowHistorySignature\.value/)
assert.match(inputFlowSource, /resolveComponentMethod/)
assert.match(inputFlowSource, /function resolveStepperMethod\(methodName\)/)
assert.match(inputFlowSource, /invokeStepperMethod\('getPotProfileState'\)/)
assert.match(inputFlowSource, /invokeStepperMethod\('getPotProfilePayload'\)/)
assert.match(inputFlowSource, /invokeStepperMethod\('commitPotProfile'\)/)
const persistPotProfileIndex = inputFlowSource.indexOf('await plantStore.savePotProfile')
const closeInputFlowIndex = inputFlowSource.indexOf(
  'inputFlowOpen.value = false',
  persistPotProfileIndex
)
assert.ok(
  persistPotProfileIndex >= 0 && persistPotProfileIndex < closeInputFlowIndex,
  '查看浇水建议前必须先保存盆型到当前植物'
)
assert.match(inputFlowSource, /if \(!props\.plant\?\.id\)/)
assert.match(inputFlowSource, /当前植物未加载，请关闭后重试/)
assert.match(inputFlowSource, /盆型信息未读取，请返回重新拖动/)
assert.match(indexSource, /Number\(plant\.id\) === Number\(currentReminderPlantId\.value\)/)
assert.match(inputSectionSource, /过往浇水日期/)
assert.match(inputSectionSource, /需要填写过往日期/)
assert.doesNotMatch(inputSectionSource, /让建议更贴近你的花盆|可修改或补充更多日期/)
assert.match(resultCardSource, /浇水量/)
assert.match(resultCardSource, /compactSoilCheckMessage/)
assert.doesNotMatch(resultCardSource, /为什么这样建议|plannerEvidenceText|plannerSummaryRows|reasonCodes/)
assert.match(plannerOptionsSource, /returnErrorResponse: true/)
assert.match(plannerOptionsSource, /requiresWateringHistory/)

console.log(
  'watering reminder resilience contracts passed data_mode=unit_fake test_kind=source_contract'
)
