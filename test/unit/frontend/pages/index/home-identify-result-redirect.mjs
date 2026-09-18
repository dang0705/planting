import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const homeSource = read('src/pages/index/index.vue')
const identifySource = read('src/composables/useUserPlantIdentify.js')
const detailPageSource = read('src/subpackages/plant/user-plant-detail/user-plant-detail.vue')
const detailFormSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'
)

// Expected 来源：用户需求——首页确认“使用识别结果”后，必须进入新增植物页并继续使用已确认的植物、图片和识别上下文。
assert.match(identifySource, /onSelectionApplied/u)
assert.match(identifySource, /onSelectionApplied\?\.\(/u)
assert.match(homeSource, /onSelectionApplied: handleHomeIdentifySelection/u)
assert.match(
  homeSource,
  /function handleHomeIdentifySelection\(identifyResult\)[\s\S]*?uni\.navigateTo\(\{[\s\S]*?user-plant-detail\/user-plant-detail\?mode=create&entrySource=home_ai_identify/u
)
assert.match(homeSource, /eventChannel\?\.emit\('home-ai-identify-result', identifyResult\)/u)
assert.match(detailPageSource, /:initial-identify-result="initialIdentifyResult"/u)
assert.match(detailPageSource, /eventChannel\?\.on\('home-ai-identify-result'/u)
assert.match(detailFormSource, /initialIdentifyResult: \{ type: Object, default: null \}/u)
assert.match(detailFormSource, /applyInitialIdentifyResult\(/u)

console.log(
  'home identify result redirect contract passed data_mode=unit_fake test_kind=source_contract'
)
