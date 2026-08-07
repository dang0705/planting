import assert from 'node:assert/strict'
import { HEALTH_REQUEST_TIMEOUT_MS } from '../../../../../scripts/dev/local-api-env-config.mjs'
import { fetchJsonWithTimeout } from '../../../../../scripts/dev/local-api-env-gateway-health.mjs'

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout

const abortError = () => Object.assign(new Error('request aborted'), { name: 'AbortError' })
const jsonResponse = body => ({ text: async () => JSON.stringify(body) })

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

try {
  await slowResponseUsesNumericTimeoutAndClearsTimer()
  await timeoutUsesExistingErrorAndClearsTimer()
  await missingTimeoutUsesConfiguredDefault()
} finally {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
}
