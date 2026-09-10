import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readSource(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const pagesSource = readSource('../../../../src/pages.json')
const layoutSource = readSource('../../../../src/Layout.vue')
const indexSource = readSource('../../../../src/pages/index/index.vue')
const weatherSource = readSource('../../../../src/components/HeaderWeatherInfo.vue')
const automationPolicySource = readSource(
  '../../../../docs/ai-rules/frontend-automation-id-policy.md'
)
const EXPECTED_CUSTOM_PAGE_COUNT = 16

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
assert.match(
  layoutSource,
  /id="douyin-weather-header"[\s\S]*?bg-\[#2D7A4F\][\s\S]*?id="douyin-weather-trigger"[\s\S]*?id="douyin-weather-panel"[\s\S]*?<HeaderWeatherInfo \/>/,
  'Layout 必须提供与原生头部同色、默认收起的抖音天气下拉区'
)
assert.match(layoutSource, /id="douyin-weather-dismiss-area"[\s\S]*?@click="closeDouyinWeather"/)
assert.match(layoutSource, /id="douyin-weather-trigger"[\s\S]*?@click\.stop="toggleDouyinWeather"/)
assert.match(
  automationPolicySource,
  /douyin-weather-trigger.*douyin-weather-trigger-row.*douyin-weather-dismiss-area/
)
assert.match(
  layoutSource,
  /showWeatherHeader: \{ type: Boolean, default: false \}/,
  '天气条必须由页面显式开启，避免扩散到不需要的页面'
)
assert.match(
  layoutSource,
  /props\.showWeatherHeader && platformNavigationChrome/,
  '天气条只能在抖音平台 chrome 模式下渲染'
)
assert.match(indexSource, /<Layout title="青花植" :show-weather-header="true">/)
assert.match(weatherSource, /id="header-weather-location-button"/)
assert.match(weatherSource, /id-prefix="header-weather-city-option"/)
