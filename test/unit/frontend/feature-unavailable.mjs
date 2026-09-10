import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract。端上点击、无请求与截图属于后续真实平台验收。
const registry = readFileSync('src/utils/feature-registry.js', 'utf8')
const capabilities = readFileSync('src/utils/platform-capabilities.js', 'utf8')
const modal = readFileSync('src/components/FeatureUnavailableModal.vue', 'utf8')
const pages = readFileSync('src/pages.json', 'utf8')
const home = readFileSync('src/pages/index/index.vue', 'utf8')
const diagnosis = readFileSync('src/pages/diagnose/diagnose.vue', 'utf8')
const phoneAuth = readFileSync('src/api/platform-phone-auth.js', 'utf8')
const env = readFileSync('src/api/env.js', 'utf8')
const wechatFrontend = readFileSync('src/api/wechat.js', 'utf8')
const http = readFileSync('src/http-functions/core/httpRequest.js', 'utf8')

for (const message of [
  '当前端暂未开放 AI 植物识别，敬请期待。',
  '当前端暂未开放 AI 植物诊断，敬请期待。',
  '当前端暂未开放浇水提醒，敬请期待。',
  '当前端暂未开放施肥提醒，敬请期待。',
  '当前端暂未开放日历提醒，敬请期待。',
  '当前端暂未开放订阅服务，敬请期待。'
]) {
  assert.match(registry, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
assert.match(modal, /我知道了/)
assert.doesNotMatch(modal, /微信|二维码|搜索|复制|https?:\/\//)
assert.match(capabilities, /isRestrictedMiniProgram/)
assert.match(capabilities, /douyin_mp/)
assert.match(capabilities, /xiaohongshu_mp/)
assert.match(pages, /"path": "pages\/index\/index"/)
assert.match(pages, /"path": "pages\/diagnose\/diagnose"/)
assert.doesNotMatch(pages, /platform-lite\//)
assert.match(home, /index-platform-phone-login-button/)
assert.match(home, /open-type="getPhoneNumber"/)
assert.match(home, /FeatureUnavailableModal/)
assert.match(diagnosis, /FeatureUnavailableModal/)
assert.match(phoneAuth, /function normalizePhoneAuthorizationDetail/)
assert.match(phoneAuth, /uni\.login\(\{/)
assert.doesNotMatch(phoneAuth, /globalThis\[name\]/)
assert.match(phoneAuth, /encryptedData: detail\.encryptedData/)
assert.match(phoneAuth, /platform-phone-bootstrap-http\/auth\/platform-phone/)
assert.match(phoneAuth, /auth: false/)
assert.match(phoneAuth, /PLATFORM_PHONE_BOOTSTRAP_BASE_URL/)
assert.match(phoneAuth, /savePlatformSession\(result\.data\.session\)/)
assert.match(wechatFrontend, /functionPath = IS_LOCAL_API_BASE_URL/)
assert.match(wechatFrontend, /: 'auth\/platform-phone'/)
assert.match(wechatFrontend, /baseUrl: IS_LOCAL_API_BASE_URL \? undefined : PLATFORM_PHONE_BOOTSTRAP_BASE_URL/)
assert.doesNotMatch(
  wechatFrontend,
  /requestHttpFunction\('platform-phone-bootstrap-http\/auth\/platform-phone'/
)
assert.match(wechatFrontend, /platform: 'wechat_mp'/)
assert.match(wechatFrontend, /auth: false/)
assert.match(wechatFrontend, /phoneProof: phoneProfile\.phoneProof/)
assert.match(env, /PLATFORM_PHONE_BOOTSTRAP_BASE_URL/)
assert.match(http, /baseUrlOverride/)

console.log('shared feature-unavailable source-contract tests passed')
