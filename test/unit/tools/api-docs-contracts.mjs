/* oxlint-disable no-console, no-magic-numbers */
import assert from 'node:assert/strict'
import { apiDocument } from '../../../tools/api-docs/contracts.mjs'

assert.ok(apiDocument.endpoints.length >= 50, '接口目录应覆盖当前主要 HTTP 接口')
assert.equal(new Set(apiDocument.endpoints.map(item => `${item.method} ${item.path}`)).size, apiDocument.endpoints.length, '接口路径和方法不可重复')
for (const endpoint of apiDocument.endpoints) {
  assert.ok(endpoint.category && endpoint.name && endpoint.description, `${endpoint.path} 缺少业务说明`)
  assert.ok(Array.isArray(endpoint.response) && endpoint.response.length, `${endpoint.path} 缺少返回说明`)
}
console.log(JSON.stringify({ data_mode: 'unit_fake', test_kind: 'source_contract', endpoints: apiDocument.endpoints.length }))
