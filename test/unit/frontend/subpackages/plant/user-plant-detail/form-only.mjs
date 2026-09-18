// data_mode=unit_fake
// test_kind=source_contract
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const pageSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'
)
const routeSource = read('src/subpackages/plant/user-plant-detail/user-plant-detail.vue')

// Expected 来源：用户需求——该路由只承载植物录入/修改；删除旧的搜索、植物表和分页步骤，
// 但直接从花园进入新增时，仍必须有可继续录入植物身份的 AI 入口。
assert.doesNotMatch(pageSource, /PlantSelectionStep|PlantSearchToolbar|add-plant-selection/u)
assert.doesNotMatch(pageSource, /swiper|swiper-item|searchKeyword|loadPlants|handlePlantSelect/u)
assert.doesNotMatch(pageSource, /handleSearchConfirm|handlePlantLoadMore|goInfoStep/u)
assert.match(pageSource, /<PlantInfoStepPanel/u)
assert.match(pageSource, /id="add-plant-identity-section"/u)
assert.match(pageSource, /id="add-plant-ai-identify-button"/u)
assert.match(pageSource, /@click="useAIIdentify"/u)
assert.match(pageSource, /:show-back="false"/u)
assert.doesNotMatch(routeSource, /initial-search-keyword|options\?\.search/u)

console.log(
  'user plant detail form-only contract passed data_mode=unit_fake test_kind=source_contract'
)
