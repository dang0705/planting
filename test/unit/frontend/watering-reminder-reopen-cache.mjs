import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync('src/pages/index/index.vue', 'utf8')
const sheetSource = readFileSync('src/pages/index/components/WateringReminderSheet.vue', 'utf8')
const savedStateSource = readFileSync(
  'src/pages/index/components/SavedWateringReminderState.vue',
  'utf8'
)
const optionsSource = readFileSync(
  'src/pages/index/components/watering-reminder-options.js',
  'utf8'
)
const querySource = readFileSync('src/vue-query/plants/queries/watering-reminders.js', 'utf8')
const mutationSource = readFileSync('src/vue-query/plants/mutations/watering-reminders.js', 'utf8')
const FIRST_CAPTURE_GROUP = 1

assert.match(indexSource, /import \{ computed, nextTick, onMounted, reactive, ref \} from 'vue'/)
assert.match(
  indexSource,
  /async function openReminder\(\{ plant, type \}\)[\s\S]+currentReminderPlantId\.value = plant\.id[\s\S]+await nextTick\(\)[\s\S]+callComponentMethod\(wateringReminderRef, 'open'\)/
)

assert.match(sheetSource, /const isSheetOpen = ref\(false\)/)
assert.match(sheetSource, /const pendingReminderReload = ref\(false\)/)
assert.match(sheetSource, /const savedReminderInputSignature = ref\(''\)/)
assert.match(sheetSource, /function currentPlantId\(\)/)
assert.match(
  sheetSource,
  /const requestedPlantId = currentPlantId\(\)[\s\S]+const response = await fetchWateringReminder\(plantId\)[\s\S]+if \(currentPlantId\(\) !== requestedPlantId\)/
)
assert.match(
  sheetSource,
  /watch\([\s\S]+\(\) => props\.plant\?\.id,[\s\S]+async newPlantId =>[\s\S]+resetReminderState\(\)[\s\S]+if \(newPlantId && isSheetOpen\.value\)[\s\S]+await nextTick\(\)[\s\S]+await loadSavedReminder\(\)/
)
assert.match(sheetSource, /plannerResult\.value = normalizeSavedReminderPlannerResult\(reminder\)/)
assert.match(
  sheetSource,
  /selectedWateringEvents\.value = Array\.isArray\(reminder\.wateringEvents\)/
)
assert.match(
  sheetSource,
  /savedReminderInputSignature\.value = currentReminderInputSignature\.value/
)
assert.match(sheetSource, /\(!savedReminderActive\.value \|\| savedReminderChanged\.value\)/)
const confirmDatePickerBody = sheetSource.match(
  /async function confirmDatePicker\(\) \{([\s\S]*?)\n\}/
)?.[FIRST_CAPTURE_GROUP]
assert.ok(confirmDatePickerBody)
assert.doesNotMatch(confirmDatePickerBody, /savedReminder\.value = null/)
assert.match(sheetSource, /<SavedWateringReminderState v-if="savedReminderActive"/)
assert.match(sheetSource, /:display="savedReminderDisplay"/)
assert.match(savedStateSource, /id="watering-reminder-saved-state"/)
assert.match(savedStateSource, /id="watering-reminder-saved-created-at"/)
assert.match(savedStateSource, /id="watering-reminder-saved-next-time"/)
assert.match(savedStateSource, /id="watering-reminder-saved-reason"/)
assert.match(savedStateSource, /display\.createdText/)
assert.match(savedStateSource, /display\.nextText/)
assert.match(savedStateSource, /display\.reasonText/)
assert.match(sheetSource, /fetchWateringPlannerResult\(/)
assert.match(sheetSource, /buildWateringReminderCalendarPayload\(/)
assert.match(sheetSource, /attachPlanIdToWateringEvents\(/)

assert.match(optionsSource, /export function buildSavedReminderDisplay\(reminder\)/)
assert.match(
  optionsSource,
  /export function resolveLastWateringDate\(events = \[\], fallback = ''\)/
)
assert.match(optionsSource, /export function buildWateringReminderInputSignature\(/)
assert.match(optionsSource, /export async function fetchWateringPlannerResult\(/)
assert.match(optionsSource, /export function buildWateringReminderCalendarPayload\(/)
assert.match(optionsSource, /export function attachPlanIdToWateringEvents\(/)
assert.match(optionsSource, /export function reasonCodeLabel\(code\)/)

assert.match(querySource, /export function buildWateringReminderQueryKey\(plantId\)/)
assert.match(
  querySource,
  /return \['http-function', 'plant-user-http', 'watering-reminders', plantId\]/
)
assert.match(mutationSource, /import \{ queryClient \} from '@\/lib\/query-client\.js'/)
assert.match(
  mutationSource,
  /import \{ buildWateringReminderQueryKey \} from '@\/vue-query\/plants\/queries\/watering-reminders\.js'/
)
assert.match(
  mutationSource,
  /queryClient\.setQueryData\(buildWateringReminderQueryKey\(plantId\), response\)/
)
