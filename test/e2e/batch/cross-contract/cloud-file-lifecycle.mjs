import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const displaySource = read('src/components/PlantDisplayBase.vue')
const detailSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue'
)
const formSource = read('src/subpackages/plant/user-plant-detail/components/PlantForm.vue')
const catalogCardSource = read('src/subpackages/plant/user-plant-detail/components/PlantCard.vue')
const detailFormSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'
)
const indexSource = read('src/pages/index/index.vue')
const calendarSource = read('src/pages/calendar/calendar.vue')
const reminderSource = read('src/pages/reminder/reminder.vue')

assert.match(displaySource, /plant-display-image-\$\{plant\.id \|\| 'unknown'\}/)
assert.match(displaySource, /@error="handleImageError"/)
assert.match(displaySource, /await refresh\(\)/)
assert.match(detailSource, /id="user-plant-detail-image"/)
assert.match(detailSource, /@error="handleImageError"/)
assert.match(formSource, /photo-preview/)
assert.match(formSource, /@error="handleImageError"/)
assert.match(catalogCardSource, /PlantDisplayBase/)
assert.match(detailFormSource, /v-if="isEditMode && \(loading \|\| !currentPlant\)"/)
assert.match(detailFormSource, /const loading = ref\(true\)/)

for (const pageSource of [indexSource, calendarSource, reminderSource]) {
  assert.doesNotMatch(pageSource, /onShow/)
  assert.doesNotMatch(pageSource, /loadUserPlants\(true\)/)
}

console.log('cloud file lifecycle cross-contract tests passed')
