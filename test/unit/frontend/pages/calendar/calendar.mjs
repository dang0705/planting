import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.resolve(process.cwd(), 'src/pages/calendar/calendar.vue'),
  'utf8'
)
const taskSection = fs.readFileSync(
  path.resolve(process.cwd(), 'src/pages/calendar/CalendarTaskSection.vue'),
  'utf8'
)

assert.match(source, /usePlantStore\(\)/u)
assert.match(source, /await plantStore\.getUserPlants\(/u)
assert.match(source, /plantStore\.completeWatering\(plantId(?:,|\))/u)
assert.match(source, /saveWateringReminder\(/u)
assert.match(taskSection, /calendar-task-complete-\$\{task\.plantId\}/u)
assert.match(taskSection, /calendar-task-postpone-\$\{task\.plantId\}/u)
assert.match(taskSection, /calendar-task-undo-\$\{item\.plantId\}/u)
assert.match(source, /saveWateringReminder\(/gu)
assert.match(source, /plantStore\.updateUserPlantLocal\(plantId/u)
assert.match(source, /undoWateringReminder\(/u)
assert.match(source, /captureTaskSnapshot\(plant, '完成'\)/u)
assert.match(source, /captureTaskSnapshot\(plant, '推迟'\)/u)
assert.match(source, /mode=create/u)
assert.match(source, /mode=view&id=\$\{plan\.id\}/u)
assert.match(source, /formatPlantingAge\(plan\.plantDate\)/u)
assert.match(source, /resolveHealthStatusPresentation\(plan\.healthStatus\)/u)
assert.match(
  source,
  /function viewSolarTerms\(\) \{\s*if \(!isFeatureAvailable\('calendar'\)\) \{\s*openFeatureUnavailable\('calendar'\)/u
)
assert.doesNotMatch(source, />健康</u)
assert.doesNotMatch(source, /TODO|功能开发中/u)

console.log('calendar page contract passed')
