import assert from 'node:assert/strict'
import { HEALTH_REQUEST_TIMEOUT_MS } from '../../../../../scripts/dev/local-api-env-config.mjs'
import {
  assertLocalBusinessRoutesReady,
  fetchJsonWithTimeout
} from '../../../../../scripts/dev/local-api-env-gateway-health.mjs'

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout

const abortError = () => Object.assign(new Error('request aborted'), { name: 'AbortError' })
const jsonResponse = body => ({ text: async () => JSON.stringify(body) })
const probeResponse = (status, body, statusText = '') => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: statusText || (status === 401 ? 'Unauthorized' : 'OK'),
  headers: { get: () => '' },
  text: async () => JSON.stringify(body)
})

async function slowResponseUsesNumericTimeoutAndClearsTimer() {
  const timers = []
  const cleared = []
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay }
    timers.push(timer)
    if (!Number.isFinite(delay)) {
      queueMicrotask(callback)
    }
    return timer
  }
  globalThis.clearTimeout = timer => cleared.push(timer)
  globalThis.fetch = async (_url, { signal }) => {
    await Promise.resolve()
    if (signal.aborted) {
      throw abortError()
    }
    return jsonResponse({ status: 'ok' })
  }

  const result = await fetchJsonWithTimeout('http://127.0.0.1/health', { timeoutMs: 25 })
  assert.deepEqual(result.body, { status: 'ok' })
  assert.equal(timers.length, 1)
  assert.equal(timers[0].delay, 25)
  assert.deepEqual(cleared, [timers[0]])
}

async function timeoutUsesExistingErrorAndClearsTimer() {
  const timers = []
  const cleared = []
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay }
    timers.push(timer)
    return timer
  }
  globalThis.clearTimeout = timer => cleared.push(timer)
  globalThis.fetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(abortError()), { once: true })
    })

  const pending = fetchJsonWithTimeout('http://127.0.0.1/health', { timeoutMs: 40 })
  assert.equal(timers.length, 1)
  assert.equal(timers[0].delay, 40)
  timers[0].callback()
  await assert.rejects(pending, error => error?.code === 'LOCAL_GATEWAY_TIMEOUT')
  assert.deepEqual(cleared, [timers[0]])
}

async function missingTimeoutUsesConfiguredDefault() {
  const timers = []
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay }
    timers.push(timer)
    return timer
  }
  globalThis.clearTimeout = () => {}
  globalThis.fetch = async () => jsonResponse({ status: 'ok' })

  await fetchJsonWithTimeout('http://127.0.0.1/health')
  assert.equal(timers[0].delay, HEALTH_REQUEST_TIMEOUT_MS)
}

async function businessProbeRespectsAuthenticationBoundary() {
  const requests = []
  globalThis.fetch = async (url, request) => {
    requests.push({ url, request })
    return probeResponse(401, { code: 401, message: '请先登录' })
  }
  await assert.doesNotReject(() =>
    assertLocalBusinessRoutesReady('http://127.0.0.1:3010', {
      requiredFunctions: ['plant-user-http', 'weather-http']
    })
  )
  assert.equal(requests.length, 2, 'unauthenticated business probes should still be sent')
  assert.equal(
    requests[0].request.headers.Authorization,
    undefined,
    'startup probes must not invent a bearer token'
  )

  globalThis.fetch = async () =>
    probeResponse(503, { code: 503, message: '服务暂未就绪' }, 'Service Unavailable')
  await assert.rejects(
    assertLocalBusinessRoutesReady('http://127.0.0.1:3010', {
      requiredFunctions: ['plant-user-http']
    }),
    error => error?.code === 'LOCAL_FUNCTION_BUSINESS_ROUTES_NOT_READY'
  )

  requests.length = 0
  globalThis.fetch = async (url, request) => {
    requests.push({ url, request })
    return probeResponse(200, { code: 200 })
  }
  await assert.doesNotReject(() =>
    assertLocalBusinessRoutesReady('http://127.0.0.1:3010', {
      requiredFunctions: ['plant-user-http'],
      sessionToken: 'session-token-for-probe'
    })
  )
  assert.equal(
    requests[0].request.headers.Authorization,
    'Bearer session-token-for-probe',
    'strict business probes must use the supplied bearer session'
  )

  globalThis.fetch = async () => probeResponse(401, { code: 401, message: '请先登录' })
  await assert.rejects(
    assertLocalBusinessRoutesReady('http://127.0.0.1:3010', {
      requiredFunctions: ['plant-user-http'],
      sessionToken: 'expired-session-token'
    }),
    error => error?.code === 'LOCAL_FUNCTION_BUSINESS_ROUTES_NOT_READY'
  )
}

try {
  await slowResponseUsesNumericTimeoutAndClearsTimer()
  await timeoutUsesExistingErrorAndClearsTimer()
  await missingTimeoutUsesConfiguredDefault()
  await businessProbeRespectsAuthenticationBoundary()
} finally {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
}
