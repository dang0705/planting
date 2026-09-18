import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// 镜像契约：首页只承载常用工具；用户植物卡及其诊断入口统一位于花园 tab 的“我的植物”。
// 植物卡仍必须以真实 userPlants 渲染，并进入 diagnosis 分包的完整诊断页。

const repoRoot = process.cwd()
const indexSource = fs.readFileSync(path.join(repoRoot, 'src/pages/index/index.vue'), 'utf8')
const userPlantsSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/UserPlantsSection.vue'),
  'utf8'
)
const plantCardSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/PlantCard.vue'),
  'utf8'
)
const plantsStoreSource = fs.readFileSync(path.join(repoRoot, 'src/store/plants.js'), 'utf8')

// 契约 1：首页只展示 Figma 设计中的常用工具，不能重新挂载用户植物列表。
assert.match(indexSource, /id="index-common-tools"/)
assert.match(indexSource, /id="index-tool-diagnosis"/)
assert.match(indexSource, /id="index-tool-watering"/)
assert.match(indexSource, /id="index-tool-identify"/)
assert.doesNotMatch(indexSource, /index-plant-list|<PlantCard|loadUserPlants/)

// 契约 2：“我的植物”必须以真实 userPlants 渲染所有植物卡和真实状态。
assert.match(userPlantsSource, /v-else-if="!plantStore\.hasPlants"/)
assert.match(userPlantsSource, /v-else id="garden-my-plants-list"/)
assert.match(
  userPlantsSource,
  /v-for="plant in plantStore\.userPlants"/,
  'profile my plants must iterate the real plantStore.userPlants to render plant cards'
)
assert.match(
  userPlantsSource,
  /<PlantCard[\s\S]*?:plant="plant"[\s\S]*?@diagnose="openDiagnose"/,
  'profile my plants must bind @diagnose on PlantCard to openDiagnose'
)
assert.match(
  userPlantsSource,
  /function openDiagnose\(plant\) \{[\s\S]*?plantId = encodeURIComponent\(String\(plant\.id\)\)[\s\S]*?subpackages\/diagnosis\/flow\?plantId=/,
  'openDiagnose must navigate with the real user plant id to the diagnosis subpackage'
)

// 契约 3：花园 tab 植物卡直接进入承载完整诊断流的分包 flow 页面，并保留目录植物上下文。
assert.match(userPlantsSource, /plantCatalogId = plant\.plantId/)
assert.match(userPlantsSource, /entrySource=plant_card/)
assert.doesNotMatch(userPlantsSource, /DiagnosePopup|diagnosePopupRef/)
// 确保没有平行匿名诊断弹窗。
assert.doesNotMatch(
  userPlantsSource,
  /diagnose_tab_anonymous/,
  'profile my plants must not introduce an anonymous diagnose_tab placeholder plant'
)

// 契约 4：PlantCard 必须为每株真实植物渲染独立的 diagnose-entry-button-<plant.id>，
// 点击 @diagnose 向父级冒泡，不得自行打开平行诊断入口。
assert.match(
  plantCardSource,
  /:id="`diagnose-entry-button-\$\{plant\.id\}`"/,
  'PlantCard must render diagnose-entry-button-<plant.id> for each real plant'
)
assert.match(
  plantCardSource,
  /@click\.stop="\$emit\('diagnose', plant\)"/,
  'PlantCard diagnose button must emit diagnose to parent, not open a parallel entry'
)
assert.match(
  plantCardSource,
  /defineProps\(\{[\s\S]*?plant: \{ type: Object, required: true \}/,
  'PlantCard must require a real plant prop'
)
assert.match(
  plantCardSource,
  /defineEmits\(\['diagnose', 'history', 'edit', 'reminder', 'fertilization'\]\)/,
  'PlantCard must declare both reminder and fertilization actions'
)
assert.match(
  plantCardSource,
  /:class="healthPresentation\.className"[\s\S]*?\{\{ healthPresentation\.label \}\}/,
  'PlantCard must render the actual health-status presentation instead of a fixed healthy label'
)
assert.match(plantCardSource, /label: '状态待评估'/)
assert.match(plantCardSource, /label: '需要关注'/)
assert.doesNotMatch(plantCardSource, /<text>健康<\/text>/)
assert.match(plantCardSource, /v-if="needsWatering"[\s\S]*>\s*<text>需浇水<\/text>/)
assert.match(plantCardSource, /const needsWatering = computed\(\(\) => \{/)
assert.match(plantCardSource, /parsePlantDateTime\(nextWater\)/)
assert.match(plantCardSource, /dueAt\.getTime\(\) <= Date\.now\(\)/)

// 契约 5：plantStore.hasPlants 必须基于真实 userPlants 长度，不得有匿名兜底。
assert.match(
  plantsStoreSource,
  /hasPlants: state => state\.userPlants\.length > 0/,
  'plantStore.hasPlants must be derived from real userPlants length, no anonymous fallback'
)
assert.doesNotMatch(
  plantsStoreSource,
  /diagnose_tab_anonymous/,
  'plantStore must not seed an anonymous diagnose_tab placeholder plant'
)

console.log('index plant card real-plant diagnose entry contract tests passed')
