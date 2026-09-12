import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const reminderSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/reminder/reminder.vue'),
  'utf8'
)
const plantCardSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/PlantCard.vue'),
  'utf8'
)
const indexSource = fs.readFileSync(path.join(repoRoot, 'src/pages/index/index.vue'), 'utf8')
const pagesConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/pages.json'), 'utf8'))
const reminderTab = pagesConfig.tabBar.list.find(
  item => item.pagePath === 'pages/reminder/reminder'
)

assert.doesNotMatch(reminderSource, /<PlantCard/)
assert.doesNotMatch(reminderSource, /<DiagnosePopup/)
assert.match(reminderSource, /<WateringReminderSheet/)
assert.match(reminderSource, /id="reminder-tab-plant-list"/)
assert.match(reminderSource, /reminder-tab-water-/)
assert.equal(reminderTab, undefined, '提醒页在 MVP 阶段不得出现在 TabBar')
assert.equal(
  pagesConfig.tabBar.list.some(item => item.pagePath === 'pages/calendar/calendar'),
  false,
  '日历页在 MVP 阶段不得出现在 TabBar'
)
assert.match(reminderSource, /<FertilizationMonthlySheet/)
assert.match(reminderSource, /reminder-tab-fertilization-/)
assert.match(plantCardSource, /fertilizeActiveIcon/)
assert.doesNotMatch(indexSource, /getPlantReminderState\(plant\.id, 'fertilize'\)/)
