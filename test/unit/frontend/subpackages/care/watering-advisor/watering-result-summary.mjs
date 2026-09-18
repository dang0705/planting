'use strict'

// data_mode=unit_fake; test_kind=source_contract.
/* oxlint-disable no-console -- contract runner emits a concise terminal result. */
// Expected 来源：本轮用户需求：结果页只保留统一的盆土综合结论与浇水建议；
// 独立浇水还要隐藏下一次日期、历史确认和依据等其他结果卡。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = relativePath => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
const advisor = read('src/subpackages/care/watering-advisor/watering-advisor.vue')
const reminderCard = read('src/pages/index/components/WateringReminderResultCard.vue')
const reminderSheet = read('src/pages/index/components/WateringReminderSheet.vue')
const decision = read('src/components/watering/WateringSoilVisualDecision.vue')

assert.match(
  advisor,
  /import \{ buildWateringSoilDecision \} from '@\/utils\/watering-soil-decision\.js'/u
)
assert.match(advisor, /wateringSoilDecision/u)
assert.match(advisor, /result-label="盆土综合判断"/u)
assert.match(advisor, /action-label="浇水建议"/u)
assert.match(advisor, /wateringAction: plannerResult\.value\?\.action/u)
assert.match(advisor, /wateringContext: plannerResult\.value\?\.wateringContext/u)
assert.doesNotMatch(advisor, /id="watering-advisor-result-soil-wet-hold"/u)
assert.match(advisor, /v-if="isUserPlant && !plannerResult\.nextWaterDate && !wateringConfirmed"/u)
assert.match(advisor, /v-if="isUserPlant && !wateringConfirmed && !isOverWateringBlocked"/u)
assert.match(advisor, /v-if="isUserPlant && wateringConfirmed"/u)
assert.match(advisor, /v-if="isUserPlant"\s+class="rounded-\[20px\] border/u)

assert.match(
  reminderCard,
  /import \{ buildWateringSoilDecision \} from '@\/utils\/watering-soil-decision\.js'/u
)
assert.match(reminderCard, /soilDecision/u)
assert.match(reminderCard, /result-label="盆土综合判断"/u)
assert.match(reminderCard, /action-label="浇水建议"/u)
assert.match(reminderCard, /wateringAction: props\.wateringAction/u)
assert.doesNotMatch(reminderCard, /id="watering-reminder-result-soil-wet-warning"/u)
assert.match(reminderSheet, /:watering-context="plannerResult\?\.wateringContext \|\| ''"/u)
assert.match(reminderSheet, /:watering-action="plannerResult\?\.action \|\| ''"/u)

assert.match(decision, /resultLabel: \{ type: String, default: '盆土视觉结果' \}/u)
assert.match(decision, /actionLabel: \{ type: String, default: '本次行动' \}/u)
assert.match(decision, /\{\{ resultLabel \}\}/u)
assert.match(decision, /\{\{ actionLabel \}\}/u)

console.log('watering result combined summary contract passed')
