import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。支付回调不接受客户端会话，故不施加平台门禁。
const source = readFileSync('cloudfunctions/subscription-http/app.js', 'utf8')

assert.match(source, /assertPlatformFeature/)
assert.match(source, /path\.includes\('\/subscription\/plans'\)/)
assert.match(source, /path\.includes\('\/subscription\/orders'\)/)
assert.match(source, /unavailableFeatureResponse/)
assert.match(source, /path\.includes\('\/subscription\/notify'\)/)

console.log('subscription platform capability source-contract tests passed')
