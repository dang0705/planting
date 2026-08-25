import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const sourcePath = path.join(repoRoot, 'src/http-functions/core/httpRequest.js')
const source = fs.readFileSync(sourcePath, 'utf8')

/**
 * 加载 httpRequest 模块，将外部依赖替换为可控 mock。
 * identityMode 控制身份函数行为：
 *   - 'ok'        : 返回 { openid: cloudOpenid }
 *   - 'reject'    : 抛出错误
 *   - 'empty'     : 返回 { openid: '' }
 *   - 'no-openid' : 返回 {}
 */
async function loadHttpRequestModule({
  isLocal,
  devOpenid,
  qaLiveRealApi = false,
  cloudOpenid = '',
  identityMode = 'ok'
}) {
  let identityImpl
  if (identityMode === 'reject') {
    identityImpl = `async () => { throw new Error('wechat-identity unreachable') }`
  } else if (identityMode === 'empty') {
    identityImpl = `async () => ({ openid: '' })`
  } else if (identityMode === 'no-openid') {
    identityImpl = `async () => ({})`
  } else {
    identityImpl = `async () => ({ openid: ${JSON.stringify(cloudOpenid)} })`
  }

  const transformed = source
    .replace(
      "import { BASE_URL, IS_LOCAL_API_BASE_URL, shouldAppendWebFunctionFlag } from '@/api/env'",
      `const BASE_URL = 'https://functions.example.com';\nconst IS_LOCAL_API_BASE_URL = ${isLocal};\nconst shouldAppendWebFunctionFlag = () => true`
    )
    .replace(
      "import { getCloudbaseUserIdentity } from '@/utils/cloudbase-auth'",
      `const getCloudbaseUserIdentity = ${identityImpl}`
    )
    .replace(
      "import { getRequestAppEnvHeader } from '@/utils/runtime-env'",
      "const getRequestAppEnvHeader = () => 'development'"
    )
    .replace(/import\.meta\.env\.VITE_DEV_OPENID/g, JSON.stringify(devOpenid))
    .replace(/import\.meta\.env\.VITE_QA_LIVE_REAL_API/g, JSON.stringify(qaLiveRealApi ? '1' : ''))
  return import(`data:text/javascript,${encodeURIComponent(transformed)}`)
}

const originalUni = globalThis.uni
const originalWx = globalThis.wx

try {
  // ---------- 本地开发：使用 VITE_DEV_OPENID，不读取缓存 ----------
  let localStorageReads = 0
  globalThis.uni = {
    getStorageSync: () => {
      localStorageReads += 1
      return { openid: 'cached-wrong-user' }
    }
  }
  delete globalThis.wx
  const localModule = await loadHttpRequestModule({
    isLocal: true,
    devOpenid: 'dev_terminal_mp_local'
  })
  const localHeaders = await localModule.resolveHttpFunctionAuth()
  assert.equal(localHeaders['x-wx-openid'], 'dev_terminal_mp_local')
  assert.equal(localHeaders['x-openid'], 'dev_terminal_mp_local')
  assert.equal(localHeaders.Authorization, undefined)
  assert.equal(
    localStorageReads,
    0,
    'local requests must not read a cached user before VITE_DEV_OPENID'
  )

  // ---------- QA 实时验收：本地 LAN 保留真实微信身份，不注入匿名开发身份 ----------
  globalThis.uni = { getStorageSync: () => ({ openid: 'legacy-cached-user' }) }
  globalThis.wx = { cloud: {} }
  const qaLiveModule = await loadHttpRequestModule({
    isLocal: true,
    devOpenid: 'dev_terminal_mp_local',
    qaLiveRealApi: true,
    cloudOpenid: 'qa-real-wechat-user'
  })
  const qaLiveHeaders = await qaLiveModule.resolveHttpFunctionAuth()
  assert.equal(qaLiveHeaders['x-wx-openid'], 'qa-real-wechat-user')
  assert.equal(qaLiveHeaders['x-openid'], 'qa-real-wechat-user')
  assert.equal(qaLiveHeaders['x-terminal-e2e'], undefined)
  assert.equal(qaLiveHeaders['x-anonymous-dev-identity'], undefined)

  // ---------- 日常 LAN 小程序：同样使用 native 身份，不读取旧缓存 ----------
  const dailyMiniProgramModule = await loadHttpRequestModule({
    isLocal: true,
    devOpenid: 'dev_terminal_mp_local',
    qaLiveRealApi: false,
    cloudOpenid: 'daily-native-wechat-user'
  })
  const dailyMiniProgramHeaders = await dailyMiniProgramModule.resolveHttpFunctionAuth()
  assert.equal(dailyMiniProgramHeaders['x-wx-openid'], 'daily-native-wechat-user')
  assert.equal(dailyMiniProgramHeaders['x-openid'], 'daily-native-wechat-user')
  assert.equal(dailyMiniProgramHeaders['x-terminal-e2e'], undefined)
  assert.equal(dailyMiniProgramHeaders['x-anonymous-dev-identity'], undefined)

  // ---------- 远程且有缓存 openid：直接使用缓存 ----------
  globalThis.uni = {
    getStorageSync: () => ({ openid: 'cached-remote-user' })
  }
  const remoteModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local'
  })
  const remoteHeaders = await remoteModule.resolveHttpFunctionAuth()
  assert.equal(remoteHeaders['x-wx-openid'], 'cached-remote-user')
  assert.equal(remoteHeaders['x-openid'], 'cached-remote-user')
  assert.equal(remoteHeaders.Authorization, undefined, 'must not generate Authorization header')

  // ---------- 远程无缓存 openid：成功身份 fallback ----------
  globalThis.uni = { getStorageSync: () => ({}) }
  globalThis.wx = { cloud: {} }
  const remoteFallbackModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    cloudOpenid: 'cloudbase-remote-user',
    identityMode: 'ok'
  })
  const remoteFallbackHeaders = await remoteFallbackModule.resolveHttpFunctionAuth()
  assert.equal(remoteFallbackHeaders['x-wx-openid'], 'cloudbase-remote-user')
  assert.equal(remoteFallbackHeaders['x-openid'], 'cloudbase-remote-user')
  assert.equal(
    remoteFallbackHeaders.Authorization,
    undefined,
    'fallback must not generate Authorization'
  )

  // ---------- auth=false：不读取身份，保留自定义 headers ----------
  globalThis.uni = { getStorageSync: () => ({ openid: 'should-not-read' }) }
  globalThis.wx = { cloud: {} }
  const noAuthModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    cloudOpenid: 'should-not-call',
    identityMode: 'reject'
  })
  const noAuthHeaders = await noAuthModule.resolveHttpFunctionAuth({
    auth: false,
    headers: { 'X-Custom': '1' }
  })
  assert.equal(noAuthHeaders['x-wx-openid'], undefined)
  assert.equal(noAuthHeaders['x-openid'], undefined)
  assert.equal(noAuthHeaders.Authorization, undefined)
  assert.equal(noAuthHeaders['X-Custom'], '1', 'custom headers must be preserved when auth=false')

  // ---------- 自定义 headers 不被覆盖 ----------
  globalThis.uni = { getStorageSync: () => ({ openid: 'cached-remote-user' }) }
  delete globalThis.wx
  const customHeaderModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local'
  })
  const customHeaders = await customHeaderModule.resolveHttpFunctionAuth({
    auth: true,
    headers: { 'X-Custom': 'keep-me' }
  })
  assert.equal(customHeaders['X-Custom'], 'keep-me', 'custom headers must not be overwritten')
  assert.equal(customHeaders['x-app-env'], 'development')
  assert.equal(customHeaders['x-env'], 'development')
  assert.equal(customHeaders.Authorization, undefined)

  // ---------- 身份函数 reject 时必须 reject，不得匿名降级 ----------
  globalThis.uni = { getStorageSync: () => ({}) }
  globalThis.wx = { cloud: {} }
  const rejectModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identityMode: 'reject'
  })
  await assert.rejects(
    rejectModule.resolveHttpFunctionAuth(),
    /wechat-identity unreachable/,
    'identity rejection must propagate, not degrade to anonymous'
  )

  // ---------- 身份函数返回空 openid 时必须 throw ----------
  const emptyOpenidModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identityMode: 'empty'
  })
  await assert.rejects(
    emptyOpenidModule.resolveHttpFunctionAuth(),
    /未返回有效 openid/,
    'empty openid must throw, not degrade to anonymous'
  )

  // ---------- 身份函数返回无 openid 字段时必须 throw ----------
  const noOpenidModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identityMode: 'no-openid'
  })
  await assert.rejects(
    noOpenidModule.resolveHttpFunctionAuth(),
    /未返回有效 openid/,
    'missing openid field must throw, not degrade to anonymous'
  )

  // ---------- 身份失败时不进入 uni.request ----------
  // httpRequest 在 resolveHttpFunctionAuth 阶段 throw，因此 uni.request 不应被调用
  let requestCalled = false
  globalThis.uni = {
    getStorageSync: () => ({}),
    request: () => {
      requestCalled = true
      return {}
    }
  }
  globalThis.wx = { cloud: {} }
  const guardModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identityMode: 'reject'
  })
  const requestFn = guardModule.httpRequest({ functionPath: 'test-fn' })
  await assert.rejects(
    requestFn,
    /wechat-identity unreachable/,
    'httpRequest must reject on identity failure'
  )
  assert.equal(requestCalled, false, 'uni.request must not be called when identity fails')
} finally {
  globalThis.uni = originalUni
  globalThis.wx = originalWx
}

console.log('http request identity precedence tests passed')
