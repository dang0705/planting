import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
assert.match(sheetSource, /plant-card-fertilization-monthly-unavailable/)
assert.match(sheetSource, /<FertilizationMonthlyTable/)
assert.match(tableSource, /液体肥/)
assert.match(tableSource, /缓释肥/)
assert.match(tableSource, /monthly\.scopeLabel/)
assert.match(tableSource, /适用范围：\{\{ monthly\.scopeLabel \}\}/)
assert.match(tableSource, /monthly\.scopeGuidance/)
assert.match(tableSource, /monthly\.choiceGuidance/)
assert.match(tableSource, /monthly\.publicNote/)
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
assert.match(sheetSource, /fertilization-reminder-calculation-info-button/)
assert.match(sheetSource, /FertilizationReminderCalculationTooltip/)
assert.match(sheetSource, /showCalculationTooltipForTenSeconds/)
assert.match(sheetSource, /@close="hideCalculationTooltip"/)
assert.doesNotMatch(sheetSource, /id="fertilization-reminder-calculation-guidance"/)
assert.match(sheetSource, /formatFertilizationCalculationGuidance/)
assert.match(sheetSource, /确认并添加到手机日历/)
assert.doesNotMatch(
  setupSource,
  /fertilization-reminder-date-picker|fertilization-reminder-unknown-date/
)
assert.match(sheetSource, /pendingCalendarPayload/)
assert.match(sheetSource, /syncTerminalError/)
assert.match(sheetSource, /重试同步/)
assert.match(sheetSource, /fertilization-reminder-reconfigure-ack/)
assert.match(sheetSource, /id="fertilization-reminder-reconfigure-ack-group"/)
assert.match(sheetSource, /@change="onReconfigureAcknowledgedChange"/)
assert.match(savedSource, /fertilization-reminder-complete-button/)
assert.match(savedSource, /fertilization-reminder-extra-confirmation-checkbox/)
assert.match(savedSource, /id="fertilization-reminder-extra-confirmation-group"/)
assert.match(savedSource, /@change="onExtraConfirmationChange"/)
assert.match(savedSource, /今天已施肥/)
assert.match(savedSource, /本次跳过/)
assert.match(savedSource, /本月规则：/)
assert.match(savedSource, /fertilization-reminder-current-month-rule/)
assert.match(savedSource, /currentMonthEvaluation\.cell\?\.displayText/)
assert.match(savedSource, /fertilization-reminder-reconfigure-button/)
assert.match(sheetSource, /fertilization-reminder-no-fixed-period/)
assert.match(sheetSource, /currentMonthOptions\.length && !reminder && !preview/)
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
