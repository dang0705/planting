// data_mode=unit_fake
// test_kind=source_contract
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const selectionSource = read(
  'src/subpackages/plant/user-plant-detail/components/PlantSelectionStep.vue'
)
const pageSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'
)
const cardSource = read('src/subpackages/plant/user-plant-detail/components/PlantCard.vue')

assert.match(selectionSource, /v-for="plant in plants"/)
assert.match(selectionSource, /class="grid grid-cols-2 gap-3"/)
assert.match(selectionSource, /id="add-plant-load-more-sentinel"/)
assert.match(selectionSource, /uni\.createIntersectionObserver\(componentInstance\.proxy/)
assert.match(selectionSource, /relativeToViewport\(\{ bottom: LOAD_MORE_VIEWPORT_MARGIN_PX \}\)/)
assert.match(selectionSource, /observe\('#add-plant-load-more-sentinel'/)
assert.doesNotMatch(selectionSource, /scroll-x/)
assert.doesNotMatch(selectionSource, /scrolltolower/)
assert.doesNotMatch(selectionSource, /plantGroups/)

assert.match(pageSource, /:plants="defaultPlants"/)
assert.match(pageSource, /@load-more="handlePlantLoadMore"/)
assert.doesNotMatch(pageSource, /:plant-groups=/)
assert.doesNotMatch(pageSource, /@scroll-lower=/)
assert.doesNotMatch(pageSource, /plantListTouching/)

assert.match(cardSource, /h-\[234px\] w-full min-w-0/)
