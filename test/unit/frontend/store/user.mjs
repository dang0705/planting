import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

// data_mode=unit_fake; test_kind=module_logic。平台手机号授权由真机验收覆盖。
const repoRoot = process.cwd()
const source = fs.readFileSync(path.join(repoRoot, 'src/store/user.js'), 'utf8')
let sequence = 0

async function loadUserStoreModule({
  loginWithPhone,
  getUserById,
  getCloudbaseUserIdentity
}) {
  const transformed = source
    .replace(
      /import \{ defineStore, getActivePinia \} from 'pinia'/,
      "import { defineStore } from 'pinia'; const getActivePinia = () => ({ _s: { get: () => ({ $reset: () => { globalThis.__plantStoreReset = (globalThis.__plantStoreReset || 0) + 1 } }) } })"
    )
    .replace(
      /import \{ loginWithPhone, getUserById \} from '@\/api\/wechat'/,
      `const loginWithPhone = ${loginWithPhone};\nconst getUserById = ${getUserById}`
    )
    .replace(
      /import \{ clearPlatformSession, getActivePlatformAccessToken \} from '@\/api\/platform-session'/,
      "const getActivePlatformAccessToken = () => globalThis.__activePlatformToken || ''; const clearPlatformSession = () => { globalThis.__activePlatformToken = ''; globalThis.__activePlatformTicket = '' }"
    )
    .replace(
      /import \{ normalizeWeatherCoordinates \} from '@\/utils\/weather-coordinate\.js'/,
      'const normalizeWeatherCoordinates = loc => loc ? { latitude: loc.latitude, longitude: loc.longitude } : null'
    )
    .replace(
      /import \{ getCloudbaseUserIdentity \} from '@\/utils\/cloudbase-auth'/,
      `const getCloudbaseUserIdentity = ${getCloudbaseUserIdentity}`
    )
    .replace(
      /import \{ ANALYTICS_EVENTS, reportAnalyticsEvent \} from '@\/utils\/analytics\.js'/,
      "const ANALYTICS_EVENTS = { USER_LOGIN_SUCCESS: 'user_login_success' }; const reportAnalyticsEvent = () => {}"
    )
    .replace(
      /import \{ queryClient \} from '@\/lib\/query-client\.js'/,
      'const queryClient = { removeQueries: (...args) => { globalThis.__queryRemovals = (globalThis.__queryRemovals || []).concat(args) } }'
    )
    .replace(
      /import \{ USER_PLANTS_QUERY_KEY \} from '@\/vue-query\/plants\/queries\/user-plants\.js'/,
      "const USER_PLANTS_QUERY_KEY = ['user-plants']"
    )
    .replace(
      /import \{ DIAGNOSIS_HISTORY_QUERY_KEY \} from '@\/constants\/query-keys\.js'/,
      "const DIAGNOSIS_HISTORY_QUERY_KEY = ['diagnosis-history']"
    )

  const tmpDir = path.join(repoRoot, '.tmp', 'unit')
  fs.mkdirSync(tmpDir, { recursive: true })
  sequence += 1
  const file = path.join(tmpDir, `user-store-${process.pid}-${Date.now()}-${sequence}.mjs`)
  fs.writeFileSync(file, transformed, 'utf8')
  try {
    return await import(`file://${file}`)
  } finally {
    fs.rmSync(file, { force: true })
  }
}

const originalUni = globalThis.uni
const originalWx = globalThis.wx

try {
  globalThis.uni = {
    getStorageSync: () => '',
    setStorageSync: () => {},
    removeStorageSync: () => {}
  }
  globalThis.__activePlatformToken = ''
  globalThis.__activePlatformTicket = ''

  globalThis.__legacyUserReads = 0
  globalThis.wx = { cloud: { callFunction: () => {} } }

  const module = await loadUserStoreModule({
    loginWithPhone: "async () => { globalThis.__activePlatformToken = 'phone-flow-token'; return { token: 'phone-flow-token', user: { _id: 'u-phone', wechat_openid: 'wx-native', subscription_plan: 'premium' } } }",
    getUserById: "async () => { globalThis.__legacyUserReads += 1; return { _id: 'u-phone', wechat_openid: 'wx-native', subscription_plan: 'premium' } }",
    getCloudbaseUserIdentity: 'async () => ({ openid: "wx-native" })'
  })
  const pinia = createPinia()
  createApp({}).use(pinia)
  const store = module.useUserStore()

  assert.equal(store.isAuthenticated, false)
  await store.phoneLogin('platform-phone-code')
  assert.equal(store.userId, 'u-phone')
  assert.equal(store.openid, 'wx-native')
  assert.equal(store.token, 'phone-flow-token')
  assert.equal(store.isAuthenticated, true, '仅已保存的 Bearer 会话可视为登录')
  assert.equal(store.membership.type, 'premium')
  assert.equal(await store.ensureLogin(), true, '会话与微信运行时身份一致时可继续使用')
  assert.equal(await store.ensureLogin(), true, '重复登录校验应保持当前用户读取路径')
  assert.equal(globalThis.__legacyUserReads, 1, '短时间内重复登录校验应复用已有身份校验结果')

  store.logout()
  assert.equal(store.isAuthenticated, false)
  assert.equal(globalThis.__activePlatformToken, '')
  assert.equal(globalThis.__plantStoreReset, 1)
  assert.equal(globalThis.__queryRemovals.length, 2)

  const staleModule = await loadUserStoreModule({
    loginWithPhone: 'async () => { throw new Error("not expected") }',
    getUserById: 'async () => ({ _id: "u-other", wechat_openid: "wx-other" })',
    getCloudbaseUserIdentity: 'async () => ({ openid: "wx-native" })'
  })
  const stalePinia = createPinia()
  createApp({}).use(stalePinia)
  const staleStore = staleModule.useUserStore()
  globalThis.__activePlatformToken = 'old-session'
  staleStore.setLoginInfo({ token: 'old-session', user: { _id: 'u-old', wechat_openid: 'legacy-openid' } })
  globalThis.wx = { cloud: { callFunction: () => {} } }
  assert.equal(await staleStore.ensureLogin(), false, '运行时身份变化时不得自动走旧 OpenID 快速登录')
  assert.equal(globalThis.__activePlatformToken, '', '身份不匹配必须清除旧会话')
} finally {
  delete globalThis.__activePlatformToken
  delete globalThis.__activePlatformTicket
  delete globalThis.__legacyUserReads
  delete globalThis.__plantStoreReset
  delete globalThis.__queryRemovals
  globalThis.uni = originalUni
  globalThis.wx = originalWx
}

console.log('user store phone-session tests passed')
