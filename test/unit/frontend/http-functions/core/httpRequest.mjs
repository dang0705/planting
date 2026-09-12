import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/http-functions/core/httpRequest.js'),
  'utf8'
)

assert.doesNotMatch(
  source,
  /['"]Accept-Encoding['"]\s*:\s*['"]identity['"]/u,
  '公开 HTTPS 函数响应允许标准 gzip 协商，不能强制用户植物响应走 identity'
)
assert.doesNotMatch(
  source,
  /callHTTPFunction/u,
  '业务 HTTP 请求不得再被全量改写为 CloudBase 内部流式调用'
)

async function loadHttpRequestModule({
  isLocal,
  devOpenid,
  identity = {},
  refreshedIdentity = {}
}) {
  const transformed = source
    .replace(
      /import \{[\s\S]*?\} from '@\/api\/env'/u,
      `const BASE_URL = 'https://functions.example.com';\nconst IS_LOCAL_API_BASE_URL = ${isLocal};\nconst PUBLIC_HTTP_FUNCTION_BASE_URL = 'https://public.example.com';\nconst shouldAppendWebFunctionFlag = (baseUrl = BASE_URL) => /api\\.tcloudbasegateway\\.com\\/v1\\/functions$/u.test(String(baseUrl).replace(/\\/+$/u, ''))`
    )
    .replace(
      /import \{[\s\S]*?\} from '@\/api\/platform-session'/u,
      `const getActivePlatformAccessToken = () => {\n  const session = globalThis.uni?.getStorageSync?.('planting-platform-session')\n  return session?.accessToken || ''\n}; const getActivePlatformIdentityTicket = () => {\n  const session = globalThis.uni?.getStorageSync?.('planting-platform-session')\n  const ticket = session?.httpIdentityTicket || ''\n  const expiresAt = Number(session?.httpIdentityTicketExpiresAt || 0)\n  return ticket && expiresAt > Date.now() ? ticket : ''\n}`
    )
    .replace(
      "import { getCloudbaseUserIdentity, refreshPlatformHttpIdentity } from '@/utils/cloudbase-auth'",
      `const getCloudbaseUserIdentity = async () => (${JSON.stringify(identity)}); const refreshPlatformHttpIdentity = async () => { globalThis.__httpRequestIdentityRefreshCalls = (globalThis.__httpRequestIdentityRefreshCalls || 0) + 1; return (${JSON.stringify(refreshedIdentity)}) }`
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
  globalThis.uni = { getStorageSync: () => null }
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

  globalThis.wx = { cloud: { callHTTPFunction() {} } }

  const remoteMiniProgramModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: {
      openid: 'wx_live_user',
      httpIdentityTicket: 'planting-http-v1.payload.signature'
    }
  })
  const remoteMiniProgramHeaders = await remoteMiniProgramModule.resolveHttpFunctionAuth({
    headers: { Authorization: 'Bearer attacker-controlled' }
  })
  assert.equal(remoteMiniProgramHeaders.Authorization, 'Bearer planting-http-v1.payload.signature')

  let capturedUnauthenticatedRequest = null
  globalThis.uni = {
    getStorageSync: () => null,
    request(options) {
      capturedUnauthenticatedRequest = options
      options.success({ statusCode: 200, data: { code: 200 } })
      return {}
    }
  }
  const unauthenticatedModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user', httpIdentityTicket: 'runtime-ticket' }
  })
  const unauthenticatedRequest = unauthenticatedModule.httpRequest({
    auth: true,
    enableChunked: true,
    requireSignedIdentityTicket: true
  })
  await unauthenticatedRequest({
    functionPath: 'plant-user-http/user-plants?page=1',
    method: 'GET',
    query: { pageSize: 20 },
    onChunkReceived() {}
  })
  assert.match(capturedUnauthenticatedRequest?.url, /plant-user-http\/user-plants/u)
  assert.equal(capturedUnauthenticatedRequest?.method, 'GET')
  assert.equal(capturedUnauthenticatedRequest?.enableChunked, true)
  assert.equal(capturedUnauthenticatedRequest?.header['x-app-env'], 'development')
  assert.equal(
    capturedUnauthenticatedRequest?.header['x-planting-http-identity-ticket'],
    'runtime-ticket'
  )
  assert.equal(capturedUnauthenticatedRequest?.header.Authorization, 'Bearer runtime-ticket')

  let capturedPublicRequest = null
  globalThis.uni = {
    getStorageSync(key) {
      return key === 'planting-platform-session'
        ? { accessToken: 'app-session-token-for-public-request' }
        : null
    },
    request(options) {
      capturedPublicRequest = options
      options.success({ statusCode: 200, data: { code: 200 } })
      return {}
    }
  }
  const directModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user', httpIdentityTicket: 'direct-ticket' }
  })
  await directModule.httpRequest({ auth: false })({
    functionPath: 'diagnose-http/diagnosis/answer',
    method: 'POST',
    payload: { answer: 'public-remote' }
  })
  assert.equal(capturedPublicRequest?.url, 'https://public.example.com/diagnose-http/diagnosis/answer')
  assert.equal(capturedPublicRequest?.method, 'POST')
  assert.equal(capturedPublicRequest?.header.Authorization, undefined)

  await directModule.httpRequest({ auth: true, requirePlatformSession: true })({
    functionPath: 'diagnosis-answer-http/diagnosis/answer',
    method: 'POST',
    baseUrl: 'https://public.example.com',
    payload: { answer: 'authenticated-remote' }
  })
  assert.equal(
    capturedPublicRequest?.url,
    'https://public.example.com/diagnosis-answer-http/diagnosis/answer'
  )
  assert.equal(
    capturedPublicRequest?.header.Authorization,
    'Bearer app-session-token-for-public-request'
  )
  assert.equal(
    capturedPublicRequest?.header['x-planting-platform-session'],
    'app-session-token-for-public-request',
    '公网 HTTPS 请求必须传递持久会话，供诊断等写入口解析'
  )

  const sessionHeaders = await directModule.resolveHttpFunctionAuth({
    requirePlatformSession: true,
    headers: {
      Authorization: 'Bearer attacker-controlled',
      'x-planting-platform-session': 'attacker-controlled'
    }
  })
  assert.equal(sessionHeaders.Authorization, 'Bearer app-session-token-for-public-request')
  assert.equal(
    sessionHeaders['x-planting-platform-session'],
    'app-session-token-for-public-request',
    '调用方不能覆盖当前持久平台会话，并且必须携带当前会话'
  )

  globalThis.__httpRequestIdentityRefreshCalls = 0
  const ticketRefreshingModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    refreshedIdentity: { httpIdentityTicket: 'refreshed-identity-ticket' }
  })
  await ticketRefreshingModule.httpRequest({
    auth: true,
    requireSignedIdentityTicket: true
  })({
    functionPath: 'plant-user-http/user-plants',
    method: 'GET',
    baseUrl: 'https://public.example.com',
    payload: { answer: 'ticket-refreshed-remote' }
  })
  assert.equal(globalThis.__httpRequestIdentityRefreshCalls, 1)
  assert.equal(capturedPublicRequest?.header['x-planting-http-identity-ticket'], 'refreshed-identity-ticket')
  assert.equal(capturedPublicRequest?.header.Authorization, 'Bearer refreshed-identity-ticket')
  assert.equal(capturedPublicRequest?.header['x-planting-platform-session'], undefined)

  let signedTicketRequestHeaders = []
  globalThis.__httpRequestIdentityRefreshCalls = 0
  globalThis.uni = {
    getStorageSync(key) {
      return key === 'planting-platform-session'
        ? {
            accessToken: 'app-session-token-for-retry',
            httpIdentityTicket: 'server-rejected-identity-ticket',
            httpIdentityTicketExpiresAt: Date.now() + 60_000
          }
        : null
    },
    request(options) {
      signedTicketRequestHeaders.push(options.header)
      const isFirstAttempt = signedTicketRequestHeaders.length === 1
      options.success({
        statusCode: isFirstAttempt ? 401 : 200,
        data: { code: isFirstAttempt ? 401 : 200 }
      })
      return {}
    }
  }
  const serverRejectedTicketModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    refreshedIdentity: { httpIdentityTicket: 'retried-identity-ticket' }
  })
  const retriedResponse = await serverRejectedTicketModule.httpRequest({
    auth: true,
    requireSignedIdentityTicket: true
  })({
    functionPath: 'plant-user-http/user-plants',
    baseUrl: 'https://public.example.com'
  })
  assert.equal(retriedResponse.statusCode, 200)
  assert.equal(signedTicketRequestHeaders.length, 2, '服务端拒绝短票据时只重试一次')
  assert.equal(
    signedTicketRequestHeaders[0]['x-planting-http-identity-ticket'],
    'server-rejected-identity-ticket'
  )
  assert.equal(
    signedTicketRequestHeaders[1]['x-planting-http-identity-ticket'],
    'retried-identity-ticket'
  )
  assert.equal(globalThis.__httpRequestIdentityRefreshCalls, 1)

  // 客户端本地缓存的短票据过期时，读请求必须先刷新一次，不能把过期票据
  // 发到服务端后才依赖 401 兜底。
  let expiredTicketRequestHeaders = null
  globalThis.__httpRequestIdentityRefreshCalls = 0
  globalThis.uni = {
    getStorageSync(key) {
      return key === 'planting-platform-session'
        ? {
            accessToken: 'app-session-token-for-expired-ticket',
            httpIdentityTicket: 'expired-identity-ticket',
            httpIdentityTicketExpiresAt: Date.now() - 1
          }
        : null
    },
    request(options) {
      expiredTicketRequestHeaders = options.header
      options.success({ statusCode: 200, data: { code: 200 } })
      return {}
    }
  }
  const expiredTicketModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    refreshedIdentity: { httpIdentityTicket: 'refreshed-after-expiry-ticket' }
  })
  await expiredTicketModule.httpRequest({
    auth: true,
    requireSignedIdentityTicket: true
  })({
    functionPath: 'plant-user-http/user-plants',
    baseUrl: 'https://public.example.com'
  })
  assert.equal(globalThis.__httpRequestIdentityRefreshCalls, 1)
  assert.equal(
    expiredTicketRequestHeaders?.['x-planting-http-identity-ticket'],
    'refreshed-after-expiry-ticket'
  )
  assert.equal(
    expiredTicketRequestHeaders?.Authorization,
    'Bearer refreshed-after-expiry-ticket'
  )

  globalThis.uni = {
    getStorageSync(key) {
      return key === 'planting-platform-session'
        ? {
            accessToken: 'app-session-token-for-public-request',
            expiresAt: Date.now() + 60_000,
            httpIdentityTicket: 'cached-http-identity-ticket',
            httpIdentityTicketExpiresAt: Date.now() + 60_000
          }
        : null
    },
    request(options) {
      capturedPublicRequest = options
      options.success({ statusCode: 200, data: { code: 200 } })
      return {}
    }
  }
  await directModule.httpRequest({ auth: true })({
    functionPath: 'diagnosis-answer-http/diagnosis/answer',
    method: 'POST',
    baseUrl: 'https://public.example.com',
    payload: { answer: 'ticket-authenticated-remote' }
  })
  assert.equal(capturedPublicRequest?.header['x-planting-http-identity-ticket'], undefined)
  assert.equal(
    capturedPublicRequest?.header.Authorization,
    'Bearer app-session-token-for-public-request'
  )
  assert.equal(
    capturedPublicRequest?.header['x-planting-platform-session'],
    'app-session-token-for-public-request',
    '公网 HTTPS 请求必须保留业务会话请求头，供诊断等写入口解析持久会话'
  )
  assert.equal(
    globalThis.__httpRequestIdentityRefreshCalls,
    1,
    '默认认证请求不应因已有短票据再次刷新身份'
  )

  const preferredSessionHeaders = await directModule.resolveHttpFunctionAuth({
    preferPlatformSession: true
  })
  assert.equal(preferredSessionHeaders.Authorization, 'Bearer app-session-token-for-public-request')
  assert.equal(
    preferredSessionHeaders['x-planting-platform-session'],
    'app-session-token-for-public-request'
  )
  assert.equal(preferredSessionHeaders['x-planting-http-identity-ticket'], undefined)

  // 非目标 HTTP 函数也必须走公开 HTTPS，避免 Network 将业务路由折叠为
  // 不可读的 CloudBase 内部流式调用地址。
  globalThis.uni = {
    getStorageSync: () => null,
    request(options) {
      capturedPublicNativeRequest = options
      options.success({ statusCode: 200, data: { code: 200 } })
      return {}
    }
  }

  let capturedPublicNativeRequest = null
  const publicNativeModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user', httpIdentityTicket: 'runtime-ticket' }
  })
  await publicNativeModule.httpRequest({ auth: true })({
    functionPath: 'plant-catalog-http/catalog/health'
  })
  assert.equal(
    capturedPublicNativeRequest?.url,
    'https://public.example.com/plant-catalog-http/catalog/health'
  )
  assert.equal(capturedPublicNativeRequest?.header.Authorization, 'Bearer runtime-ticket')
  assert.equal(capturedPublicNativeRequest?.header['x-app-env'], 'development')
  assert.equal(
    capturedPublicNativeRequest?.header['x-planting-http-identity-ticket'],
    'runtime-ticket'
  )

  globalThis.uni = { getStorageSync: () => ({ openid: 'cached-user' }) }
  const ticketlessMiniProgramModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user' }
  })
  await assert.rejects(
    () => ticketlessMiniProgramModule.resolveHttpFunctionAuth(),
    /有效 HTTP 身份票据/u
  )

  const sessionRequiredModule = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local',
    identity: { openid: 'wx_live_user', httpIdentityTicket: 'runtime-ticket' }
  })
  await assert.rejects(
    () => sessionRequiredModule.resolveHttpFunctionAuth({ requirePlatformSession: true }),
    /当前登录会话已失效/u,
    '题包远端请求缺少手机号会话时不得触发原生 HTTP 云函数身份通道'
  )

  delete globalThis.wx
  const remoteH5Module = await loadHttpRequestModule({
    isLocal: false,
    devOpenid: 'dev_terminal_mp_local'
  })
  assert.deepEqual(remoteH5Module.normalizeJsonResponseData('{"code":400,"data":null}', 'json'), {
    code: 400,
    data: null
  })
  assert.equal(
    remoteH5Module.normalizeJsonResponseData('not-json-error-page', 'json'),
    'not-json-error-page'
  )
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
    'https://public.example.com/plant-user-http/user-plants/watering-advisor?page=2&pageSize=20'
  )
  assert.equal(capturedRequest?.timeout, 20000, '未显式指定时应使用有限默认超时')

  await remoteH5Module.httpRequest({ auth: true })({
    functionPath: 'plant-catalog-http/catalog/health'
  })
  assert.equal(capturedRequest?.header['x-app-env'], 'development')

  await remoteH5Module.httpRequest({ auth: false })({
    functionPath: 'plant-user-http/user-plants',
    baseUrl: 'https://cloud1.api.tcloudbasegateway.com/v1/functions'
  })
  assert.equal(
    capturedRequest?.url,
    'https://cloud1.api.tcloudbasegateway.com/v1/functions/plant-user-http/user-plants?webfn=true'
  )

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
