// data_mode=unit_fake; test_kind=source_contract.
/* oxlint-disable no-console -- contract runner emits a concise terminal result. */
// Expected 来源：用户提供的第一个 swiper-item 截图，以及 ui-ux-pro-max 的移动端规则。
// 首屏必须使用可伸缩的内容高度，固定底部 CTA 需要由滚动内容预留空间，列表项和搜索框需要保持触控友好。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/subpackages/care/watering-advisor/components/CatalogPlantSearch.vue',
  'utf8'
)

assert.match(
  source,
  /<scroll-view[\s\S]{0,180}class="box-border h-full w-full px-4 pb-\[112px\] pt-4"/u
)
assert.doesNotMatch(source, /height: calc\(100vh - 132px\)/u)
assert.match(
  source,
  /<text class="block text-\[20px\] font-bold leading-7 text-\[#1f2937\]">选择植物<\/text>/u
)
assert.match(source, /选择已有植物，或搜索植物种类获取浇水建议/u)
assert.match(source, /rounded-\[20px\] border border-\[#dbe7de\] bg-white shadow-\[/u)
assert.match(source, /class="flex min-h-\[72px\] items-center gap-3 px-4 py-3"/u)
assert.match(source, /class="mb-4 flex min-h-\[48px\] items-center gap-2 rounded-xl/u)
assert.match(source, /class="flex min-h-\[56px\] items-center gap-3 border-b/u)
assert.match(source, /hover-class="bg-\[#f7faf5\]"/u)

console.log('watering advisor first swiper item layout contract passed')
