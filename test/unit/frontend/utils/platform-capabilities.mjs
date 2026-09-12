import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。平台入口行为仍需目标小程序端上复验。
const source = readFileSync('src/utils/platform-capabilities.js', 'utf8').replace(
  "return 'wechat_mp'",
  "return globalThis.__platformCapabilitiesTestPlatform || 'unknown'"
)
const capabilities = await import(`data:text/javascript,${encodeURIComponent(source)}`)
const homeSource = readFileSync('src/pages/index/index.vue', 'utf8')
const detailSource = readFileSync(
  'src/subpackages/plant/user-plant-detail/components/UserPlantDetailView.vue',
  'utf8'
)
const flowSource = readFileSync('src/subpackages/diagnosis/flow.vue', 'utf8')
const resultSource = readFileSync('src/subpackages/diagnosis/result.vue', 'utf8')
const tabIntakeSource = readFileSync('src/pages/diagnose/diagnosis-tab-intake.js', 'utf8')

assert.match(homeSource, /isDiagnosisAvailable\('plant_card'\)/)
assert.match(homeSource, /isDiagnosisAvailable\('plant_history'\)/)
assert.match(homeSource, /entrySource=plant_history/)
assert.match(detailSource, /isDiagnosisAvailable\('plant_detail'\)/)
assert.match(flowSource, /isDiagnosisFlowAvailable\(\)/)
assert.match(
  readFileSync('src/subpackages/diagnosis/question-package.vue', 'utf8'),
  /isDiagnosisFlowAvailable\(\)/
)
assert.match(
  readFileSync('src/subpackages/diagnosis/question-package/page-context.js', 'utf8'),
  /onLoad\(async options =>/
)
assert.doesNotMatch(
  readFileSync('src/subpackages/diagnosis/question-package/page-context.js', 'utf8'),
  /isRestrictedMiniProgram/
)
assert.match(
  readFileSync('src/subpackages/diagnosis/question-package/page-context.js', 'utf8'),
  /if \(!isDiagnosisFlowAvailable\(\)\) \{/
)
assert.match(resultSource, /isDiagnosisAvailable\(entrySource\.value\)/)
assert.match(resultSource, /\['plant_history', 'diagnose_tab'\]/)
assert.match(tabIntakeSource, /isDiagnosisAvailable\('diagnose_tab'\)/)

globalThis.__platformCapabilitiesTestPlatform = 'douyin_mp'
assert.equal(capabilities.isRestrictedMiniProgram(), true)
assert.equal(capabilities.isDiagnosisAvailable('plant_card'), true)
assert.equal(capabilities.isDiagnosisAvailable('plant_detail'), true)
assert.equal(capabilities.isDiagnosisAvailable('plant_history'), true)
assert.equal(capabilities.isDiagnosisAvailable('diagnose_tab'), true)
assert.equal(capabilities.isFeatureAvailable('diagnosis'), true)
assert.equal(capabilities.isFeatureAvailable('watering'), true)
assert.equal(capabilities.isFeatureAvailable('subscription'), true)
assert.equal(capabilities.isFeatureAvailable('storage'), true)
assert.equal(capabilities.isDiagnosisFlowAvailable(), true)

globalThis.__platformCapabilitiesTestPlatform = 'xiaohongshu_mp'
assert.equal(capabilities.isDiagnosisAvailable('plant_card'), false)
assert.equal(capabilities.isDiagnosisAvailable('plant_detail'), false)
assert.equal(capabilities.isDiagnosisAvailable('diagnose_tab'), false)
assert.equal(capabilities.isFeatureAvailable('watering'), false)
assert.equal(capabilities.isFeatureAvailable('subscription'), false)
assert.equal(capabilities.isFeatureAvailable('storage'), false)
assert.equal(capabilities.isDiagnosisFlowAvailable(), false)

globalThis.__platformCapabilitiesTestPlatform = 'wechat_mp'
assert.equal(capabilities.isDiagnosisAvailable('plant_card'), true)
assert.equal(capabilities.isDiagnosisAvailable('diagnose_tab'), true)
assert.equal(capabilities.isFeatureAvailable('diagnosis'), true)
assert.equal(capabilities.isDiagnosisFlowAvailable(), true)

console.log(
  'platform diagnosis capability contracts passed data_mode=unit_fake test_kind=source_contract'
)
