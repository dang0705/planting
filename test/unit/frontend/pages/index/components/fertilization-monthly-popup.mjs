import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake
// test_kind=source_contract
// 本用例只验证前端源码契约，不验证真实小程序渲染、点击结果或 wx.request。

const indexSource = readFileSync('src/pages/index/index.vue', 'utf8')
const plantCardSource = readFileSync('src/pages/index/components/PlantCard.vue', 'utf8')
const sheetSource = readFileSync('src/pages/index/components/FertilizationMonthlySheet.vue', 'utf8')
const setupSource = readFileSync(
  'src/pages/index/components/FertilizationReminderSetup.vue',
  'utf8'
)
const savedSource = readFileSync(
  'src/pages/index/components/SavedFertilizationReminderState.vue',
  'utf8'
)
const previewSource = readFileSync(
  'src/pages/index/components/FertilizationReminderPreview.vue',
  'utf8'
)
const alertSource = readFileSync(
  'src/pages/index/components/FertilizationReminderAlert.vue',
  'utf8'
)
const calendarDeleteSource = readFileSync(
  'src/pages/index/components/FertilizationReminderCalendarDelete.vue',
  'utf8'
)
const mutationSource = readFileSync(
  'src/vue-query/plants/mutations/fertilization-reminders.js',
  'utf8'
)
const tableSource = readFileSync('src/components/FertilizationMonthlyTable.vue', 'utf8')
const storeSource = readFileSync('src/store/plants.js', 'utf8')

assert.match(
  plantCardSource,
  /:id="`plant-card-fertilization-\$\{plant\.id\}`"/,
  'PlantCard must expose a stable fertilization entry for each plant'
)
assert.ok(
  plantCardSource.indexOf('plant-card-reminder-${plant.id}-water') <
    plantCardSource.indexOf('plant-card-fertilization-${plant.id}'),
  'fertilization entry must render below the watering entry'
)
assert.match(
  plantCardSource,
  /@click\.stop="\$emit\('fertilization', plant\)"/,
  'fertilization entry must emit the plant to the page'
)
assert.match(
  indexSource,
  /@fertilization="openFertilization"/,
  'index must connect the PlantCard fertilization event'
)
assert.match(
  indexSource,
  /<FertilizationMonthlySheet[\s\S]*:plant="currentFertilizationPlant"/,
  'index must mount the shared monthly fertilization sheet with the selected plant'
)
assert.match(
  indexSource,
  /function openFertilization\(plant\) \{[\s\S]*currentFertilizationPlantId\.value = plant\.id[\s\S]*callComponentMethod\(fertilizationMonthlyRef, 'open'\)/,
  'index must select the clicked plant before opening the sheet'
)
assert.match(sheetSource, /<BottomSheet/)
assert.match(sheetSource, /panel-id="plant-card-fertilization-sheet"/)
assert.match(sheetSource, /confirm-id="fertilization-reminder-entry-button"/)
assert.match(sheetSource, /confirm-text="设置下次施肥提醒"/)
assert.match(sheetSource, /:show-confirm="canOpenReminderSetup"/)
assert.match(sheetSource, /:on-confirm="openReminderSetup"/)
assert.match(
  sheetSource,
  /panel-id="fertilization-reminder-setup-sheet"[\s\S]*?title="选择肥料"[\s\S]*?:mask-click=/
)
assert.doesNotMatch(
  sheetSource,
  /panel-id="fertilization-reminder-setup-sheet"[\s\S]*?height-mode="fullHeight"/
)
assert.match(sheetSource, /function openReminderSetup()/)
assert.match(sheetSource, /plant-card-fertilization-monthly-unavailable/)
assert.match(sheetSource, /<FertilizationMonthlyTable/)
assert.match(tableSource, /液体肥/)
assert.match(tableSource, /缓释肥/)
assert.match(tableSource, /适用范围：\{\{ monthly\.scopeLabel \}\}/)
assert.match(tableSource, /monthly\.scopeGuidance/)
assert.doesNotMatch(tableSource, /monthly\.choiceGuidance/)
assert.doesNotMatch(tableSource, /monthly\.publicNote/)
assert.doesNotMatch(tableSource, /monthly\.notes/)
assert.match(tableSource, /数据来源：\{\{ monthly\.sourceNames\.join\('、'\) \}\}/)
assert.match(tableSource, /liquidGroups/)
assert.match(tableSource, /slowReleaseGroups/)
assert.match(tableSource, /schedule: cell\.schedule \|\| null/)
assert.doesNotMatch(tableSource, /cellSignature[\s\S]*sourceNames/)
assert.match(tableSource, /grid-template-rows: repeat\(12, minmax\(0, auto\)\)/)
assert.match(tableSource, /暂无可靠时间间隔/)
assert.doesNotMatch(tableSource, /getCellSourceText|来源：\{\{ row\.(liquid|slowRelease)\./)
assert.doesNotMatch(tableSource, /scroll-view|scroll-x|min-w-\[560px\]/)
assert.doesNotMatch(tableSource, /sourceRefs|evidenceRef|https?:\/\//)
assert.match(setupSource, /fertilization-reminder-preview-button/)
assert.match(setupSource, /设置下次施肥提醒/)
assert.match(setupSource, /previewButtonText/)
assert.doesNotMatch(setupSource, /设置施肥提醒/u)
assert.doesNotMatch(setupSource, /选择肥料后，青花植会先计算日期/u)
assert.doesNotMatch(setupSource, /设置前请确认/u)
assert.match(
  setupSource,
  /fertilizerLabel\(option\.type\)/,
  'fertilization options must display the user-facing fertilizer type from the stable type value'
)
assert.doesNotMatch(
  setupSource,
  /option\.label/,
  'fertilization options must not display an untrusted server label as the fertilizer type'
)
assert.match(setupSource, /preflight\.latestFertilizerType/)
assert.match(setupSource, /preflight\.selectedFertilizerType/)
assert.match(setupSource, /fertilization-reminder-sync-error/)
assert.match(setupSource, /isGrowthCondition/)
assert.doesNotMatch(
  setupSource,
  /本月按表默认不安排施肥/u,
  'growth-condition explanation must not be duplicated in the setup panel when the alert owns it'
)
assert.match(
  sheetSource,
  /@preview="handlePreviewRequest"/,
  'the main CTA must open the growth-condition alert instead of rendering a duplicate inquiry'
)
assert.match(setupSource, /visibleConditionRequirements/)
assert.match(setupSource, /hasVisiblePreflight/)
assert.match(sheetSource, /await createPreview\(\)/)
assert.doesNotMatch(setupSource, /两种肥料仍共用同一条施肥间隔/)
assert.match(previewSource, /fertilization-reminder-alert-info-button/)
assert.match(sheetSource, /showFertilizationAlert/)
assert.match(sheetSource, /formatFertilizationAlertContent/)
assert.match(
  sheetSource,
  /const refreshedResponse = await fetchFertilizationReminderFreshState\(Number\(props\.plant\.id\)\)/,
  'confirming a reminder must read the enriched active state from a fresh network request'
)
assert.match(
  mutationSource,
  /removeQueries\(\{ queryKey: buildFertilizationReminderQueryKey\(payload\.plantId\) \}\)/,
  'confirming a reminder must remove the cached reminder before the enriched read-back'
)
assert.match(
  sheetSource,
  /refreshedResponse\.data\?\.active === true/,
  'the read-back must only replace the local reminder state with an active server response'
)
assert.match(sheetSource, /formatFertilizationAlertContent\(preview\.value\)/)
assert.match(sheetSource, /<FertilizationReminderAlert/)
assert.match(alertSource, /id="fertilization-reminder-alert"/)
assert.match(alertSource, /id="fertilization-reminder-alert-confirm-button"/)
assert.match(alertSource, /设置日历/)
assert.match(alertSource, /confirmText/)
assert.match(sheetSource, /handleConditionChange/)
assert.match(sheetSource, /showGrowthConditionAlert/)
assert.match(sheetSource, /本月按表默认不安排施肥/u)
assert.match(sheetSource, /resolveFertilizationErrorMessage/)
assert.doesNotMatch(sheetSource, /id="fertilization-reminder-calculation-guidance"/)
assert.doesNotMatch(
  sheetSource,
  /FertilizationReminderCalculationTooltip|showCalculationTooltip|formatFertilizationCalculationGuidance/
)
assert.match(previewSource, /首次确认提醒.*下次施肥提醒/)
assert.match(previewSource, /fertilization-reminder-asserted-date-picker/)
assert.match(previewSource, /fertilization-reminder-asserted-date-recalculate-button/)
assert.match(sheetSource, /pendingCalendarPayload/)
assert.match(previewSource, /syncTerminalError/)
assert.match(previewSource, /重试同步/)
assert.match(calendarDeleteSource, /fertilization-reminder-calendar-delete/)
assert.match(calendarDeleteSource, /<BottomSheet/)
assert.match(calendarDeleteSource, /panel-id="fertilization-reminder-calendar-delete"/)
assert.match(calendarDeleteSource, /content-id="fertilization-reminder-calendar-delete-content"/)
assert.match(calendarDeleteSource, /close-id="fertilization-reminder-calendar-delete-close-button"/)
assert.match(calendarDeleteSource, /title="删除日历施肥提醒"/u)
assert.match(calendarDeleteSource, /defineExpose\(\{ open, close \}\)/)
assert.match(calendarDeleteSource, /fertilization-reminder-calendar-delete-group/)
assert.match(calendarDeleteSource, /fertilization-reminder-calendar-delete-ack/)
assert.match(
  calendarDeleteSource,
  /青花植无法删除手机日历中的施肥提醒/u,
  'calendar deletion must explain the mini-program limitation'
)
assert.doesNotMatch(calendarDeleteSource, /v-if="visible"/u)
assert.match(sheetSource, /@change="onCalendarDeleteAcknowledgedChange"/)
assert.match(sheetSource, /ref="calendarDeletePopupRef"/u)
assert.match(sheetSource, /callComponentMethod\(calendarDeletePopupRef, 'open'\)/u)
assert.match(sheetSource, /callComponentMethod\(calendarDeletePopupRef, 'close'\)/u)
assert.match(savedSource, /fertilization-reminder-complete-button/)
assert.match(savedSource, /fertilization-reminder-minimum-interval-ack/)
assert.match(savedSource, /id="fertilization-reminder-minimum-interval-group"/)
assert.match(savedSource, /acknowledgeMinimumInterval/)
assert.match(savedSource, /今天已施肥/)
assert.match(savedSource, /本次跳过/)
assert.match(savedSource, /本月规则：/)
assert.match(savedSource, /fertilization-reminder-current-month-rule/)
assert.match(savedSource, /currentMonthEvaluation\.cell\?\.displayText/)
assert.match(savedSource, /fertilization-reminder-delete-calendar-button/)
assert.match(savedSource, /request-calendar-delete/)
assert.doesNotMatch(savedSource, /calendarDeleteVisible/)
assert.doesNotMatch(savedSource, /青花植无法删除手机日历中的提醒/u)
assert.match(sheetSource, /@request-calendar-delete="openCalendarDelete"/)
assert.match(sheetSource, /function confirmCalendarDelete\(\)/)
assert.match(sheetSource, /reason: 'calendar_deleted'/u)
assert.match(sheetSource, /let reminderLoadSequence = 0/u)
assert.match(sheetSource, /const requestSequence = \+\+reminderLoadSequence/u)
assert.match(
  sheetSource,
  /requestSequence !== reminderLoadSequence || Number\(props\.plant\?\.id\) !== plantId/u
)
assert.doesNotMatch(savedSource, /重新设置提醒/u)
assert.doesNotMatch(savedSource, /取消施肥提醒/u)
assert.match(sheetSource, /fertilization-reminder-no-fixed-period/)
assert.match(sheetSource, /currentMonthOptions\.length/)
assert.doesNotMatch(sheetSource, /fertilization-current-month-conclusion/)
assert.match(sheetSource, /fertilization-reminder-deferred/)
assert.match(mutationSource, /action === 'confirm'/)
assert.match(mutationSource, /response\.data\?\.active/)
assert.match(
  mutationSource,
  /removeQueries\(\{ queryKey: buildFertilizationReminderQueryKey\(payload\.plantId\) \}\)/
)
assert.match(plantCardSource, /fertilizationReminderActive/)
assert.doesNotMatch(plantCardSource, /hasMonthlyFertilization/)
assert.match(storeSource, /fertilizationMonthly: p\.fertilizationMonthly \|\| null/)
assert.match(storeSource, /fertilizationReminder: p\.fertilizationReminder \|\| null/)
assert.match(storeSource, /fertilizationEvents: p\.fertilizationEvents \|\| null/)

console.log('index fertilization monthly popup contract tests passed')
