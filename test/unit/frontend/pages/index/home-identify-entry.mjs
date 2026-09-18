import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const homeSource = read('src/pages/index/index.vue')
const detailFormSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'
)
const identifySource = read('src/composables/useUserPlantIdentify.js')

// Expected 来源：用户需求——首页“植物识别”复用新增植物表单已有的 AI 拍照识别动作，
// 不打开新增植物页。这里验证首页入口是否经过真实识别编排，而不是只检查某个字符串存在。
assert.match(detailFormSource, /id="add-plant-ai-identify-button"/u)
assert.match(detailFormSource, /@click="useAIIdentify"/u)
assert.doesNotMatch(detailFormSource, /@ai-identify="useAIIdentify"/u)
assert.match(identifySource, /export function useUserPlantIdentify\(/u)
assert.match(homeSource, /import \{ useUserPlantIdentify \} from/u)
assert.match(homeSource, /useAIIdentify: runHomeAiIdentify/u)
assert.match(
  homeSource,
  /async function openIdentifyTool\(\)[\s\S]*?await runHomeAiIdentify\(\)[\s\S]*?\n\}/u
)
assert.match(
  homeSource,
  /async function openHomeAiIdentify\(\)[\s\S]*?await runHomeAiIdentify\(\)[\s\S]*?\n\}/u
)

const identifyToolBody = homeSource.match(
  /async function openIdentifyTool\(\)[\s\S]*?\n\}\n\nfunction addPlant/u
)?.[0]
const toolbarIdentifyBody = homeSource.match(
  /async function openHomeAiIdentify\(\)[\s\S]*?\n\}\n\nconst handleOpenDiagnosisTool/u
)?.[0]

assert.ok(identifyToolBody, '首页植物识别入口函数必须存在')
assert.ok(toolbarIdentifyBody, '首页 AI 识别入口函数必须存在')
assert.doesNotMatch(identifyToolBody, /uni\.navigateTo\(/u)
assert.doesNotMatch(toolbarIdentifyBody, /uni\.navigateTo\(/u)

console.log(
  'home identify direct-action contract passed data_mode=unit_fake test_kind=source_contract'
)
