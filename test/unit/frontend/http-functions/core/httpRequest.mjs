import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/http-functions/core/httpRequest.js'),
  'utf8'
)

async function loadHttpRequestModule({ isLocal, devOpenid, identity = {} }) {
  const transformed = source
    .replace(
      "import { BASE_URL, IS_LOCAL_API_BASE_URL, shouldAppendWebFunctionFlag } from '@/api/env'",
      `const BASE_URL = 'https://functions.example.com';\nconst IS_LOCAL_API_BASE_URL = ${isLocal};\nconst shouldAppendWebFunctionFlag = () => true`
    )
    .replace(
      "import {\n  getCloudbaseAccessToken,\n  getCloudbaseUserIdentity\n} from '@/utils/cloudbase-auth'",
      `const getCloudbaseUserIdentity = async () => (${JSON.stringify(identity)});\nconst getCloudbaseAccessToken = async () => (${JSON.stringify(identity.accessToken || '')})`
    )
    .replace(
      "import { getRequestAppEnvHeader } from '@/utils/runtime-env'",
      "const getRequestAppEnvHeader = () => 'development'"
    )
    .replace(/import\.meta\.env\.VITE_DEV_OPENID/g, JSON.stringify(devOpenid))
  return import(`data:text/javascript,${encodeURIComponent(transformed)}`)
}

const originalUni = globalThis.uni
const originalWx = globalThis.wx

try {
  globalThis.uni = { getStorageSync: () => ({ openid: 'cached-user' }) }
  delete globalThis.wx
  const localModule = await loadHttpRequestModule({
    isLocal: true,
    devOpenid: 'dev_terminal_mp_local'
  })
  const localHeaders = await localModule.resolveHttpFunctionAuth()
  assert.equal(localHeaders['x-wx-openid'], 'dev_terminal_mp_local')
  assert.equal(localHeaders.Authorization, undefined)

  globalThis.wx = { cloud: {} }
  const localMiniProgramModule = await loadHttpRequestModule({
    isLocal: true,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user', httpIdentityTicket: 'unused-local-ticket' }
  })
  const localMiniProgramHeaders = await localMiniProgramModule.resolveHttpFunctionAuth()
  assert.equal(localMiniProgramHeaders['x-wx-openid'], 'wx_live_user')
  assert.equal(localMiniProgramHeaders.Authorization, undefined)

  const remoteMiniProgramModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: {
      openid: 'wx_live_user',
      httpIdentityTicket: 'planting-http-v1.payload.signature',
      accessToken: 'platform-access-token'
    }
  })
  const remoteHeaders = await remoteMiniProgramModule.resolveHttpFunctionAuth({
    headers: { Authorization: 'Bearer attacker-controlled' }
  })
  assert.equal(remoteHeaders.Authorization, 'Bearer platform-access-token')
  assert.equal(
    remoteHeaders['x-planting-http-identity-ticket'],
    'planting-http-v1.payload.signature'
  )
  assert.equal(remoteHeaders['x-wx-openid'], undefined)
  assert.equal(remoteHeaders['x-openid'], undefined)

  let capturedNativeRequest = null
  globalThis.wx = {
    cloud: {
      callHTTPFunction(options) {
        capturedNativeRequest = options
        options.success({ statusCode: 200, data: { code: 200 } })
        return {}
      }
    }
  }
  const nativeModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user', httpIdentityTicket: 'unused-ticket' }
  })
  const nativeRequest = nativeModule.httpRequest({ auth: true, enableChunked: true })
  await nativeRequest({
    functionPath: 'plant-user-http/user-plants?page=1',
    method: 'GET',
    query: { pageSize: 20 },
    onChunkReceived() {}
  })
  assert.equal(capturedNativeRequest?.name, 'plant-user-http')
  assert.equal(capturedNativeRequest?.path, '/user-plants?page=1&pageSize=20')
  assert.equal(capturedNativeRequest?.method, 'GET')
  assert.equal(capturedNativeRequest?.enableChunked, true)
  assert.equal(typeof capturedNativeRequest?.onChunkedReceived, 'function')
  assert.equal(capturedNativeRequest?.header['x-app-env'], 'development')
  assert.equal(capturedNativeRequest?.header.Authorization, 'Bearer unused-ticket')

  const ticketlessMiniProgramModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user' }
  })
  await assert.rejects(ticketlessMiniProgramModule.resolveHttpFunctionAuth(), /登录态获取失败/)

  delete globalThis.wx
  const remoteH5Module = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local'
  })
  const remoteH5Headers = await remoteH5Module.resolveHttpFunctionAuth()
  assert.equal(remoteH5Headers['x-wx-openid'], undefined)
  assert.equal(remoteH5Headers.Authorization, undefined)

  const noAuthHeaders = await remoteH5Module.resolveHttpFunctionAuth({
    auth: false,
    headers: { 'X-Custom': 'preserved' }
  })
  assert.equal(noAuthHeaders['X-Custom'], 'preserved')

  let capturedRequest = null
  globalThis.uni = {
    request(options) {
      capturedRequest = options
      options.success({ statusCode: 200, data: { code: 200 } })
      return {}
    }
  }
  const request = remoteH5Module.httpRequest({ auth: false })
  await request({
    functionPath: 'plant-user-http/user-plants/watering-advisor?page=1&pageSize=20',
    query: { page: 2 }
  })
  assert.equal(
    capturedRequest?.url,
    'https://functions.example.com/plant-user-http/user-plants/watering-advisor?page=2&pageSize=20&webfn=true'
  )
  assert.equal(capturedRequest?.timeout, 20000, '未显式指定时应使用有限默认超时')

  await remoteH5Module.httpRequest({ auth: true })({
    functionPath: 'plant-catalog-http/catalog/health'
  })
  assert.equal(capturedRequest?.header['x-app-env'], 'development')

  await request({
    functionPath: 'diagnose-http/diagnosis/answer',
    timeout: 65000,
    payload: { answer: 'slow-but-explicit' }
  })
  assert.equal(capturedRequest?.timeout, 65000, '显式诊断长请求超时不能被默认值覆盖')

  await request({
    functionPath: 'plant-catalog-http/catalog/health',
    timeout: 0
  })
  assert.equal(capturedRequest?.timeout, undefined, '显式 0 可关闭超时，兼容已有调用方契约')

  globalThis.uni = {
    request(options) {
      options.fail({ errMsg: 'request:fail timeout' })
      return {}
    }
  }
  await assert.rejects(
    request({ functionPath: 'plant-catalog-http/catalog/health' }),
    error => error?.message === '请求超时，请检查网络后重试' && error?.isRetryable === true,
    '传输层失败必须转换为可理解、可重试的用户提示'
  )
} finally {
  globalThis.uni = originalUni
  globalThis.wx = originalWx
}

console.log('http request identity transport tests passed')
