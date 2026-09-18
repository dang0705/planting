import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildWateringSoilPromptPayload
} = require('../../../../../cloudfunctions/diagnose-http/utils/watering-soil-prompt.js')
const {
  DYNAMIC_TASK_MARKER
} = require('../../../../../cloudfunctions/diagnose-http/utils/visual-prompt-cache-contract.js')

const first = buildWateringSoilPromptPayload()
const second = buildWateringSoilPromptPayload()
assert.equal(first.staticPrefix, second.staticPrefix)
assert.equal(first.staticPrefixHash, second.staticPrefixHash)
assert.equal(first.dynamicTail.startsWith(DYNAMIC_TASK_MARKER), true)
assert.match(first.promptText, /请先确认画面是否包含盆土表面/u)
assert.match(first.promptText, /只返回一个 JSON 对象/u)
assert.match(first.dynamicTail, /图片已附上/u)
assert.match(first.dynamicTail, /不要回复未提供图像/u)

console.log('watering soil prompt cache-prefix tests passed')
