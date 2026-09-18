import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/* oxlint-disable no-console -- source contract emits a concise result. */

// data_mode=unit_fake; test_kind=source_contract。
// 真实微信滚动、元素查询回调和截图仍需 Automator 端上验证，本测试只锁定可复用接口与阈值契约。
const repoRoot = process.cwd()
const headerSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/common/Header.vue'),
  'utf8'
)
const layoutSource = fs.readFileSync(path.join(repoRoot, 'src/Layout.vue'), 'utf8')
const detailSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/plant/catalog-detail/components/PlantCatalogDetailView.vue'),
  'utf8'
)

assert.match(headerSource, /scrollTransition: \{ type: Boolean, default: false \}/u)
assert.match(headerSource, /scrollTransitionTarget: \{ type: String, default: '' \}/u)
assert.match(headerSource, /uni\.createSelectorQuery\?\./u)
assert.match(headerSource, /select\(normalizeSelector\(props\.scrollTransitionTarget\)\)/u)
assert.match(headerSource, /boundingClientRect\(rect =>/u)
assert.match(headerSource, /nextScrolled = bottom <= Number\(props\.scrollTransitionOffset/u)
assert.match(headerSource, /onPageScroll\(\(\) => scheduleScrollStateRefresh\(\)\)/u)
assert.match(headerSource, /leftActionSlotProvided: \{ type: Boolean, default: false \}/u)
assert.match(headerSource, /<slot v-if="leftActionSlotProvided" name="left-action"/u)
assert.match(headerSource, /v-else-if="leftAction === 'back'"/u)
assert.match(headerSource, /@click="emit\('back'\)"/u)
assert.match(
  headerSource,
  /background: isScrolled\.value \? 'rgba\(255, 255, 255, 0\.96\)' : 'transparent'/u
)
assert.match(layoutSource, /headerScrollTransition: \{ type: Boolean, default: false \}/u)
assert.match(layoutSource, /headerTransitionTarget: \{ type: String, default: '' \}/u)
assert.match(layoutSource, /customLeftAction: \{ type: Boolean, default: false \}/u)
assert.match(layoutSource, /left-action-slot-provided="customLeftAction"/u)
assert.match(layoutSource, /<template v-if="customLeftAction" #left-action/u)
assert.match(
  layoutSource,
  /<slot name="left-action" :scrolled="slotProps\.scrolled" :back="goBack" \/>/u
)
assert.match(
  layoutSource,
  /function navigateBackOrHome\(\{ fallbackToHome = true \} = \{\}\)[\s\S]*?delta: 1[\s\S]*?fail: error => \{[\s\S]*?if \(fallbackToHome\) \{[\s\S]*?goHome\(\)/u
)
assert.match(detailSource, /header-scroll-transition/u)
assert.match(detailSource, /header-transition-target="#plant-catalog-detail-banner"/u)
assert.match(detailSource, /left-action="back"/u)
assert.match(detailSource, /left-action-id="plant-catalog-detail-back-button"/u)
assert.match(layoutSource, /<Header[\s\S]*?@back="goBack"/u)

console.log('Header scroll transition contract passed')
