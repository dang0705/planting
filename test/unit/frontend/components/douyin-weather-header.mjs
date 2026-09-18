import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readSource(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const pagesSource = readSource('../../../../src/pages.json')
const layoutSource = readSource('../../../../src/Layout.vue')
const indexSource = readSource('../../../../src/pages/index/index.vue')
const customNavbarSource = readSource('../../../../src/components/CustomNavbar.vue')
const automationPolicySource = readSource(
  '../../../../docs/ai-rules/frontend-automation-id-policy.md'
)
const EXPECTED_CUSTOM_PAGE_COUNT = 15

assert.match(
  pagesSource,
  /#ifndef MP-TOUTIAO[\s\S]*?"navigationStyle": "custom"[\s\S]*?#endif/,
  '微信自定义导航配置必须保留在非抖音条件编译分支'
)
assert.equal(
  (pagesSource.match(/"navigationStyle": "custom"/g) || []).length,
  EXPECTED_CUSTOM_PAGE_COUNT,
  '所有现有自定义页面都应保留微信侧 custom 配置'
)
assert.match(indexSource, /id="index-common-tools"/)
assert.doesNotMatch(indexSource, /HeaderWeatherInfo|show-weather-header/)
assert.doesNotMatch(
  layoutSource,
  /douyin-weather-header|douyin-weather-trigger|douyin-weather-panel/
)
assert.doesNotMatch(customNavbarSource, /HeaderWeatherInfo|header-weather-info/)
assert.doesNotMatch(
  automationPolicySource,
  /douyin-weather-trigger|header-weather-location-button|header-weather-cache-toggle/
)
