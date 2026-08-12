import { createHash } from 'node:crypto'
export { captureFormalScreenshot } from './formal-leaf-screenshot.mjs'
import { captureFormalScreenshot as defaultCaptureFormalScreenshot } from './formal-leaf-screenshot.mjs'
import { screenshotStabilityBudget, waitForScreenshotStability } from './screenshot-stability.mjs'

export const FORMAL_LEAF_TIMEOUT_MS = 12_000
const liveSessions = new WeakMap()

function fingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
}

function createResumableSession(raw) {
  const state = { raw }
  const session = new Proxy(
    {},
    {
      get(_target, property) {
        const value = state.raw?.[property]
        return typeof value === 'function' ? value.bind(state.raw) : value
      }
    }
  )
  liveSessions.set(session, state)
  return session
}

function rawSession(session) {
  return liveSessions.get(session)?.raw || session
}

function resumeSession(session, replacement) {
  const state = liveSessions.get(session)
  if (state) {
    state.raw = rawSession(replacement)
  }
  return session
}

export async function connectAutomatorTransport(automator, wsEndpoint) {
  // miniprogram-automator 0.12.x calls checkVersion() after connecting and
  // assumes Tool.getInfo().SDKVersion is always present. Recent WeChat
  // DevTools may omit that optional field for cloned QA projects; the SDK
  // then crashes in cmpVersion with `undefined.split`. The transport
  // connection itself is valid and the project/runtime identity has already
  // been verified by the QA supervisor, so use the launcher's transport-only
  // method when available and keep the package fallback for older releases.
  if (typeof automator?.launcher?.connectTool === 'function') {
    return automator.launcher.connectTool({ wsEndpoint })
  }
  return automator.connect({ wsEndpoint })
}

export function resolveFormalLeafPrincipal(env = process.env) {
  const explicit = String(env.E2E_TEST_OPENID || '').trim()
  const localDefault = String(env.VITE_DEV_OPENID || 'dev_terminal_mp_local').trim()
  const value = explicit || localDefault
  if (!value) {
    const error = new Error('formal leaf principal is unavailable')
    error.code = 'formal_leaf_principal_unavailable'
    throw error
  }
  return {
    value,
    source: explicit ? 'E2E_TEST_OPENID' : 'local_dev_identity_default',
    fingerprint: fingerprint(value)
  }
}

export async function installFormalLeafPrincipal({
  mp,
  env = process.env,
  principal = resolveFormalLeafPrincipal(env),
  storageKey = 'user',
  timeoutMs,
  deadline = withDeadline
} = {}) {
  if (!mp?.callWxMethod) {
    const error = new Error('formal leaf principal requires callWxMethod')
    error.code = 'formal_leaf_principal_install_unavailable'
    throw error
  }
  await deadline({
    name: 'leaf.install_principal',
    timeoutMs,
    operation: () =>
      mp.callWxMethod('setStorageSync', storageKey, {
        openid: principal.value,
        isLoggedIn: true,
        token: ''
      })
  })
  return {
    principal_source: principal.source,
    principal_fingerprint: principal.fingerprint,
    storage_key: storageKey,
    credentials_persisted: false
  }
}

export async function clearFormalLeafPrincipal({
  mp,
  storageKey = 'user',
  timeoutMs,
  deadline = withDeadline
} = {}) {
  if (!mp?.callWxMethod) {
    return { status: 'not_needed' }
  }
  await deadline({
    name: 'leaf.clear_principal',
    timeoutMs,
    operation: () => mp.callWxMethod('removeStorageSync', storageKey)
  })
  return { status: 'cleared', storage_key: storageKey }
}

export function formalAutomatorEndpoint(env = process.env) {
  const endpoint = String(env.MINIPROGRAM_AUTOMATOR_WS ?? '')
  let parsed
  try {
    parsed = new URL(endpoint)
  } catch {
    const error = new Error(
      'formal catalog leaves require a supervisor-provided Automator endpoint'
    )
    error.code = 'formal_automator_endpoint_unverified'
    throw error
  }
  if (
    parsed.protocol !== 'ws:' ||
    parsed.hostname !== '127.0.0.1' ||
    !Number.isInteger(Number(parsed.port)) ||
    Number(parsed.port) <= 0
  ) {
    const error = new Error(
      'formal catalog leaves require a supervisor-provided Automator endpoint'
    )
    error.code = 'formal_automator_endpoint_unverified'
    throw error
  }
  return endpoint
}

export function withDeadline({
  name,
  operation,
  timeoutMs = FORMAL_LEAF_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onLateSettlement
} = {}) {
  const controller = new AbortController()
  let timer
  let timedOut = false
  const operationPromise = Promise.resolve().then(() => operation({ signal: controller.signal }))
  operationPromise.then(
    value => {
      if (timedOut) {
        onLateSettlement?.({ status: 'fulfilled', value })
      }
    },
    error => {
      if (timedOut) {
        onLateSettlement?.({ status: 'rejected', reason: String(error?.message || error) })
      }
    }
  )
  return Promise.race([
    operationPromise,
    new Promise((_, reject) => {
      timer = setTimer(() => {
        timedOut = true
        const error = new Error(`${name} timed out after ${timeoutMs}ms`)
        error.code = 'automator_operation_timeout'
        error.operation = name
        controller.abort(error)
        reject(error)
      }, timeoutMs)
    })
  ]).finally(() => clearTimer(timer))
}

export async function connectFormalLeaf({
  automator,
  env = process.env,
  wsEndpoint: requestedEndpoint,
  timeoutMs,
  deadline = withDeadline
} = {}) {
  const wsEndpoint = formalAutomatorEndpoint({
    ...env,
    MINIPROGRAM_AUTOMATOR_WS: requestedEndpoint ?? env.MINIPROGRAM_AUTOMATOR_WS
  })
  const raw = await deadline({
    name: 'leaf.connect',
    timeoutMs,
    operation: () => connectAutomatorTransport(automator, wsEndpoint)
  })
  return { mp: createResumableSession(raw), wsEndpoint }
}

export async function disconnectFormalLeaf({ mp, timeoutMs, deadline = withDeadline } = {}) {
  if (!mp?.disconnect) {
    return { status: 'not_needed' }
  }
  const current = rawSession(mp)
  await deadline({ name: 'leaf.disconnect', timeoutMs, operation: () => current.disconnect() })
  return { status: 'disconnected' }
}

export async function automatorOperation({
  name,
  operation,
  timeoutMs,
  deadline = withDeadline
} = {}) {
  try {
    return { status: 'passed', value: await deadline({ name, timeoutMs, operation }) }
  } catch (error) {
    return {
      status: 'failed_environment',
      code: error.code ?? 'automator_operation_failed',
      reason: error.message,
      operation: name
    }
  }
}

export async function handoffFormalLeafScreenshot({
  mp,
  automator,
  wsEndpoint,
  outputPath,
  workerPath,
  timeoutMs,
  projectPath,
  expectedRoute = '',
  maxAttempts = 2,
  retryDelayMs = 350,
  captureFormalScreenshot = defaultCaptureFormalScreenshot,
  deadline = withDeadline
} = {}) {
  const verifiedEndpoint = formalAutomatorEndpoint({
    MINIPROGRAM_AUTOMATOR_WS: wsEndpoint ?? process.env.MINIPROGRAM_AUTOMATOR_WS
  })
  let preCaptureStability = { status: 'skipped', reason: 'primary_page_probe_unavailable' }
  if (typeof mp?.currentPage === 'function') {
    try {
      preCaptureStability = await waitForScreenshotStability({
        miniProgram: mp,
        projectPath,
        expectedRoute,
        timeoutMs: screenshotStabilityBudget(Number(timeoutMs) || 10_000)
      })
    } catch (error) {
      // The worker is the authoritative screenshot owner. A primary-session
      // probe may fail during a reload; record it and let the fresh worker
      // perform its own bounded stability gate instead of blocking recovery.
      preCaptureStability = {
        status: 'failed',
        code: error?.code || 'screenshot_stability_failed',
        reason: String(error?.message || error)
      }
    }
  }
  let primaryDisconnect = { status: 'not_attempted' }
  try {
    await disconnectFormalLeaf({ mp, timeoutMs, deadline })
    primaryDisconnect = { status: 'passed' }
  } catch (error) {
    // A page reload or renderer handoff can close the primary transport before
    // the explicit disconnect reaches it. The disposable screenshot worker
    // owns the next connection, so an already-closed primary session is not a
    // reason to skip the worker. Keep the failure visible in evidence.
    primaryDisconnect = {
      status: 'already_closed_or_failed',
      code: error?.code || 'formal_leaf_primary_disconnect_failed',
      reason: String(error?.message || error)
    }
  }
  const screenshot = await captureFormalScreenshot({
    wsEndpoint: verifiedEndpoint,
    outputPath,
    workerPath,
    timeoutMs,
    projectPath,
    expectedRoute,
    maxAttempts,
    retryDelayMs
  })
  let reconnected
  try {
    reconnected = await connectFormalLeaf({
      automator,
      wsEndpoint: verifiedEndpoint,
      timeoutMs,
      deadline
    })
  } catch (error) {
    error.screenshot = screenshot
    error.primaryDisconnect = primaryDisconnect
    throw error
  }
  // Some leaf clients wrap this harness session in their own resumable proxy.
  // That outer proxy is intentionally opaque to this module, so updating only
  // our WeakMap would return a facade that still points at the disconnected
  // pre-screenshot transport. Return the fresh session for opaque wrappers;
  // retain the original facade only when this harness owns its state.
  const resumed = liveSessions.has(mp) ? resumeSession(mp, reconnected.mp) : reconnected.mp
  if (screenshot.status !== 'passed') {
    const error = new Error(screenshot.code || 'formal screenshot worker failed')
    error.code = screenshot.code || 'formal_leaf_screenshot_failed'
    error.screenshot = screenshot
    error.primaryDisconnect = primaryDisconnect
    // Opaque wrappers (for example the transpiration client) cannot be
    // updated through this module's WeakMap. Callers can adopt this fresh
    // session before recording the bounded screenshot failure.
    error.reconnectedMp = resumed
    throw error
  }
  return {
    ...screenshot,
    pre_capture_stability: preCaptureStability,
    primary_disconnect: primaryDisconnect,
    mp: resumed
  }
}

export function formalLeafReport({
  status,
  code = '',
  reason = '',
  assertions = [],
  evidence = {}
} = {}) {
  return {
    version: 1,
    status,
    classification: status,
    code,
    reason,
    business_assertions_reached: assertions.length > 0,
    assertions,
    evidence
  }
}
