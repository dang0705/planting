/* data_mode=unit_fake; test_kind=source_contract */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const source = fs.readFileSync(path.join(repoRoot, 'src/api/subscription.js'), 'utf8')

assert.match(source, /subscription-http\/subscription\/plans/u)
assert.match(source, /subscription-http\/subscription\/orders/u)
assert.match(source, /auth: false/u)
assert.match(source, /returnErrorResponse: true/u)
assert.match(source, /planId, clientRequestId/u)
assert.match(source, /outTradeNo/u)
assert.match(source, /data\?\.payment/u)
assert.match(source, /return unwrapResponse\(response, '支付订单状态暂时无法查询'\) \|\| null/u)
assert.match(source, /response\?\.code !== HTTP_OK/u)
assert.doesNotMatch(source, /amountFen|amountYuan|durationDays/u)

console.log('subscription API source contract passed data_mode=unit_fake')
