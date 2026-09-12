import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。支付回调需要微信真实签名与真实数据库，端到端验收另行执行。
const source = readFileSync('cloudfunctions/subscription-notify-http/app.js', 'utf8')

assert.match(source, /user_id, payer_openid/)
assert.match(source, /order\.payer_openid/)
assert.match(source, /WHERE _id = \?/)
assert.doesNotMatch(source, /WHERE _openid = \?/)

console.log('subscription notify owner/payer contract passed')
