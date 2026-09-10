import assert from 'node:assert/strict'
import fs from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。
// 一期短票据只允许植物列表，详情仍须通过持久平台会话，不能因性能改造
// 扩大为可延迟吊销的详情授权。
const source = fs.readFileSync('src/api/plants-http.js', 'utf8')
const detailFunction = source.match(
  /export function fetchUserPlant\(id\) \{([\s\S]*?)\n\}/u
)

assert.ok(detailFunction, '必须保留 fetchUserPlant 详情读取入口')
assert.match(detailFunction[1], /requirePlatformSession:\s*true/u)
assert.doesNotMatch(detailFunction[1], /requireSignedIdentityTicket/u)

console.log('user plant detail auth scope passed data_mode=unit_fake test_kind=source_contract')
