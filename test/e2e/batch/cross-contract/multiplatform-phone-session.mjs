import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=cross_contract。只验证源码和迁移合同，不伪造平台 API 响应。
const migration = readFileSync(
  'scripts/sql/ensure-multiplatform-phone-session-20260831.sql',
  'utf8'
)
const manifest = readFileSync('src/manifest.json', 'utf8')
const pages = readFileSync('src/pages.json', 'utf8')
const http = readFileSync('cloudfunctions/layer/utils/http.js', 'utf8')
const platformSession = readFileSync('cloudfunctions/layer/utils/platform-session.js', 'utf8')
const bootstrap = readFileSync('cloudfunctions/platform-phone-bootstrap-http/app.js', 'utf8')
const wechat = readFileSync('src/api/wechat.js', 'utf8')
const authUser = readFileSync('cloudfunctions/auth-user-http/app.js', 'utf8')

assert.match(migration, /user_sessions/)
assert.match(migration, /phone_proof_hash/)
assert.match(migration, /owner_user_id/)
assert.match(migration, /record_version/)
assert.match(migration, /uk_platform_app_user/)
assert.match(manifest, /tt79ef0f52e78e857401/)
assert.match(manifest, /69b9576cdb45760001d82e15/)
assert.match(pages, /"path": "pages\/index\/index"/)
assert.match(pages, /"path": "pages\/diagnose\/diagnose"/)
assert.doesNotMatch(pages, /platform-lite\//)
assert.match(http, /resolvePersistentSession/)
assert.match(platformSession, /storage_openid/)
assert.match(platformSession, /LEFT JOIN users u ON BINARY u\._id = BINARY s\.user_id/)
assert.doesNotMatch(migration, /SET _openid = owner_user_id/)
assert.doesNotMatch(migration, /_openid = _id/)
assert.match(bootstrap, /action !== 'platformPhoneLogin'/)
assert.match(bootstrap, /resolvedIdentity: null/)
assert.doesNotMatch(bootstrap, /resolveHttpUserInfo/)
assert.match(wechat, /functionPath = IS_LOCAL_API_BASE_URL/)
assert.match(wechat, /: 'auth\/platform-phone'/)
assert.match(wechat, /baseUrl: IS_LOCAL_API_BASE_URL \? undefined : PLATFORM_PHONE_BOOTSTRAP_BASE_URL/)
assert.doesNotMatch(
  wechat,
  /requestHttpFunction\('platform-phone-bootstrap-http\/auth\/platform-phone'/
)
assert.match(wechat, /auth: false/)
assert.match(authUser, /auth-user-http action/)
assert.match(authUser, /allowRuntimeIdentity: \['phoneLogin', 'getUserByOpenid'\]\.includes\(action\)/)
assert.match(authUser, /'cloudbase-runtime-header'/)

console.log('multiplatform phone session cross-contract tests passed')
