import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。真实平台手机号授权与匿名 HTTP 权限需在云端/真机验证。
const source = readFileSync('cloudfunctions/platform-phone-bootstrap-http/app.js', 'utf8')
const config = readFileSync(
  'cloudfunctions/platform-phone-bootstrap-http/cloudbase-functions.json',
  'utf8'
)
const service = readFileSync('cloudfunctions/layer/utils/platform-phone-bootstrap.js', 'utf8')

assert.match(source, /action !== 'platformPhoneLogin'/)
assert.match(source, /platform-phone-bootstrap-http action/)
assert.match(source, /const platform = normalizePlatform\(data\.platform\)/)
assert.doesNotMatch(source, /platform === 'wechat_mp'/)
assert.match(source, /resolvedIdentity: null/)
assert.match(source, /assertNoClientIdentityFields\(data\)/)
assert.match(source, /method !== 'POST'/)
assert.doesNotMatch(source, /resolveHttpUserInfo/)
assert.match(source, /function attachHttpIdentityTicket\(result = \{\}\)/)
assert.match(source, /createHttpIdentityTicket\(\{/)
assert.match(source, /httpIdentityTicketExpiresAt: Date\.now\(\) \+ 5 \* 60 \* 1000/)
assert.match(source, /attachHttpIdentityTicket\(\s*await platformPhoneLogin\(/)
assert.match(config, /"path": "\/auth\/platform-phone"/)
assert.match(config, /"path": "\/auth\/platform-phone\/health"/)
assert.match(service, /CREATE TABLE|user_sessions|user_platform_identities/)
assert.match(service, /createSessionToken/)
assert.match(service, /phoneNumber = \{\{verifiedPhone\}\}/)
assert.match(service, /phoneNumber = \{\{verifiedPhone\}\}[\s\S]*LIMIT 20/)
assert.doesNotMatch(service, /phone_country_code = \{\{verifiedCountryCode\}\}/)
assert.match(service, /phoneNumber = NULL/)
assert.match(service, /PLATFORM_PHONE_ACCOUNT_CONFLICT/)
assert.match(service, /wechat_openid, wechat_unionid, douyin_openid, xiaohongshu_openid, union_id/)
assert.match(service, /\{\{username\}\}, NULL, NULL, \{\{verifiedCountryCode\}\}/)

console.log('platform phone bootstrap source-contract tests passed')
