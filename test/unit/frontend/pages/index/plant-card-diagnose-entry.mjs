import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// 镜像契约：首页植物卡诊断入口必须以真实、确定性的植物前置条件进入。
// 只有 plantStore.hasPlants 为真（真实植物存在）时才渲染 PlantCard 与
// diagnose-entry-button-<plantId>；点击后进入 diagnosis 分包的完整诊断页。
// 不得改成无植物也显示匿名卡片，也不得在主包重新挂载完整诊断流。

const repoRoot = process.cwd()
const indexSource = fs.readFileSync(path.join(repoRoot, 'src/pages/index/index.vue'), 'utf8')
const plantCardSource = fs.readFileSync(
  path.join(repoRoot, 'src/pages/index/components/PlantCard.vue'),
  'utf8'
)
const plantsStoreSource = fs.readFileSync(path.join(repoRoot, 'src/store/plants.js'), 'utf8')

// 契约 1：首页必须用 plantStore.hasPlants 作为真实植物前置条件渲染植物列表区域。
assert.match(
  indexSource,
  /v-else-if="!plantStore\.hasPlants"/,
  'index must gate the empty-state on plantStore.hasPlants (no real plants => no plant card)'
)
assert.match(
  indexSource,
  /v-else id="index-plant-list"/,
  'index must render the plant list only when hasPlants is true'
)
// 确保植物列表仅在已认证且有植物时渲染，未认证走登录引导，不得出现匿名植物卡。
assert.match(
  indexSource,
  /<template v-if="userStore\.isAuthenticated">[\s\S]*?v-else-if="!plantStore\.hasPlants"/,
  'plant list must stay behind isAuthenticated + hasPlants, no anonymous plant card'
)

// 契约 2：首页必须 v-for 真实 userPlants 渲染 PlantCard，并通过 @diagnose 进入诊断分包。
assert.match(
  indexSource,
  /v-for="plant in plantStore\.userPlants"/,
  'index must iterate the real plantStore.userPlants to render plant cards'
)
assert.match(
  indexSource,
  /<PlantCard[\s\S]*?:plant="plant"[\s\S]*?@diagnose="openDiagnose"/,
  'index must bind @diagnose on PlantCard to openDiagnose'
)
assert.match(
  indexSource,
  /function openDiagnose\(plant\) \{[\s\S]*?plantId = encodeURIComponent\(String\(plant\.id\)\)[\s\S]*?subpackages\/diagnosis\/flow\?plantId=/,
  'openDiagnose must navigate with the real user plant id to the diagnosis subpackage'
)

// 契约 3：首页直接进入承载完整诊断流的分包 flow 页面，并保留目录植物上下文。
assert.match(indexSource, /plantCatalogId = plant\.plantId/)
assert.match(indexSource, /entrySource=plant_card/)
assert.doesNotMatch(indexSource, /DiagnosePopup|diagnosePopupRef/)
// 确保没有平行匿名诊断弹窗。
assert.doesNotMatch(
  indexSource,
  /diagnose_tab_anonymous/,
  'index must not introduce an anonymous diagnose_tab placeholder plant'
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
