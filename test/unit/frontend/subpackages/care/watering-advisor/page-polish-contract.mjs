// data_mode=unit_fake; test_kind=source_contract.
/* oxlint-disable no-console -- contract runner emits a concise terminal result. */
// Expected 来源：ui-ux-pro-max 的移动端规则（禁止 emoji 作为结构图标、触控区域不小于 44px）
// 与项目已有 SVG 资产。这里只约束可观察的视觉/触控语义，不改变业务流程。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = relative => readFileSync(relative, 'utf8')
const page = read('src/subpackages/care/watering-advisor/watering-advisor.vue')
const catalog = read('src/subpackages/care/watering-advisor/components/CatalogPlantSearch.vue')

assert.match(page, /import plantLeafIcon from '@\/assets\/diagnosis\/diagnosis-leaf\.svg'/u)
assert.match(page, /v-else[\s\S]{0,180}<image\s+:src="plantLeafIcon"/u)
assert.doesNotMatch(page, /[🌿🌱🔍🔎]/u)

assert.match(catalog, /import searchIcon from '@\/assets\/icons\/search\.svg'/u)
assert.match(catalog, /import plantLeafIcon from '@\/assets\/diagnosis\/diagnosis-leaf\.svg'/u)
assert.match(catalog, /<image\s+:src="searchIcon"/u)
assert.match(catalog, /<image\s+:src="plantLeafIcon"/u)
assert.doesNotMatch(catalog, /[🌿🌱🔍🔎]/u)
assert.doesNotMatch(catalog, />✓</u)
assert.match(
  catalog,
  /id="watering-advisor-search-clear"\s+class="flex h-\[44px\] w-\[44px\] shrink-0 items-center justify-center/u
)

console.log('watering advisor page polish contract passed')
