import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const homeSource = read('src/pages/index/index.vue')
const detailFormSource = read(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailForm.vue'
)
const sharedSourcePath = path.join(repoRoot, 'src/composables/useUserPlantIdentify.js')

// Expected 来源：微信小程序主包不能直接加载分包内模块；首页和植物分包都必须依赖主包公共模块。
assert.equal(fs.existsSync(sharedSourcePath), true, '识别逻辑必须位于主包公共 composables 目录')
assert.match(homeSource, /from ['"]@\/composables\/useUserPlantIdentify\.js['"]/u)
assert.match(detailFormSource, /from ['"]@\/composables\/useUserPlantIdentify\.js['"]/u)
assert.doesNotMatch(
  homeSource,
  /from ['"]@\/subpackages\/plant\/user-plant-detail\/composables\/useUserPlantIdentify\.js['"]/u
)
assert.doesNotMatch(detailFormSource, /from ['"]\.\.\/composables\/useUserPlantIdentify\.js['"]/u)

console.log(
  'home identify package boundary contract passed data_mode=unit_fake test_kind=source_contract'
)
