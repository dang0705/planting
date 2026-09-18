// data_mode=unit_fake; test_kind=source_contract.
/* oxlint-disable no-console -- contract runner emits a concise terminal result. */
// Expected 来源：用户提供的浇水建议页截图（样例级视觉目标）与本轮布局要求。
// 重点是页面层级而非业务文案：主建议突出，状态/行动/依据降级为紧凑的信息组，
// 步骤条在不同步骤数量下仍保持可伸缩，长水量文案仍可换行显示。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/subpackages/care/watering-advisor/watering-advisor.vue', 'utf8')

assert.match(source, /class="flex items-start px-5 pt-4 pb-2"/u)
assert.match(source, /class="mx-1 mt-3 h-\[1px\] flex-1 bg-\[#dbe7de\]"/u)
assert.match(
  source,
  /id="watering-advisor-result-amount"\s+class="rounded-\[24px\] border border-\[#d7e6dc\] bg-white px-5 py-6 text-center/u
)
assert.match(
  source,
  /id="watering-advisor-result-amount"[\s\S]{0,260}class="block break-words text-\[30px\] font-bold leading-\[1\.35\] text-\[#2d7a4f\]"/u
)
assert.match(source, /v-else-if="plannerResult" class="flex flex-col gap-3 pb-6"/u)
assert.match(source, /result-label="盆土综合判断"/u)
assert.match(source, /action-label="浇水建议"/u)
assert.doesNotMatch(source, /id="watering-advisor-result-soil-wet-hold"/u)
assert.match(
  source,
  /id="watering-advisor-result-confirm-watered"\s+class="rounded-\[20px\] border border-\[#d7e6dc\] bg-white px-4 py-4/u
)
assert.match(
  source,
  /v-else-if="activeStep === resultStep"\s+class="fixed bottom-0[\s\S]{0,180}bg-white[\s\S]{0,180}shadow-\[0_-6px_18px/u
)

console.log('watering advisor result layout hierarchy contract passed')
