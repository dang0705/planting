import {
  recordAssertion,
  recordScreenshot,
  setClassification
} from '../../care/airflow/_shared/lib/reporter.mjs'
import { captureFormalScreenshot } from '../../_shared/formal-leaf-harness.mjs'
import { resolveWithinDeadline } from './fixture-async-deadline.mjs'

const DEFAULT_OPERATION_TIMEOUT_MS = 12000
const SCREENSHOT_RETRY_DELAY_MS = 500
const SCREENSHOT_ATTEMPTS = 2
const SCREENSHOT_RENDER_SETTLE_MS = 1200
const rawSessions = new WeakMap()
const normalizeRoute = page => String(page?.path || '').replace(/^\//, '')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export class AutomatorOperationError extends Error {
  constructor(operation, detail, timedOut = false) {
    super(`automator operation ${operation} ${timedOut ? 'timed out' : 'failed'}: ${detail}`)
    this.name = 'AutomatorOperationError'
    this.operation = operation
    this.detail = detail
    this.timedOut = timedOut
  }
}

export const isAutomatorOperationError = error => error instanceof AutomatorOperationError

export function isSuccessfulLanResponse(request) {
  const statusCode = Number(request?.response?.statusCode || 0)
  const responseCode = request?.response?.data?.code
  return (
    request?.passthrough === true &&
    !request?.failure &&
    statusCode >= 200 &&
    statusCode < 300 &&
    (typeof responseCode === 'undefined' || Number(responseCode) === 200)
  )
}

export async function runBoundedAutomatorOperation({
  operation,
  action,
  timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
  setTimer,
  clearTimer
}) {
  const result = await resolveWithinDeadline({ action, timeoutMs, setTimer, clearTimer })
  if (result.timedOut) {
    throw new AutomatorOperationError(operation, `${result.timeoutMs}ms deadline`, true)
  }
  if (result.error) {
    throw new AutomatorOperationError(operation, result.error)
  }
  return result.value
}

function wrapValue(value, scope, options) {
  if (!value || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => wrapValue(item, scope, options))
  }
  return new Proxy(value, {
    get(target, property, receiver) {
      if (property === 'then') {
        return undefined
      }
      const member = Reflect.get(target, property, receiver)
      if (typeof member !== 'function') {
        return member
      }
      if (property === 'native') {
        return (...args) => wrapValue(member.apply(target, args), `${scope}.native`, options)
      }
      return (...args) =>
        runBoundedAutomatorOperation({
          operation: `${scope}.${String(property)}`,
          action: () => member.apply(target, args),
          ...options
        }).then(result => wrapValue(result, `${scope}.${String(property)}`, options))
    }
  })
}

export function createBoundedAutomatorSession(session, options = {}) {
  const wrapped = wrapValue(session, options.scope || 'automator', options)
  rawSessions.set(wrapped, session)
  return wrapped
}

export async function disconnectBoundedAutomatorSession({
  session,
  operation = 'automator.disconnect',
  timeoutMs,
  setTimer,
  clearTimer
} = {}) {
  const raw = rawSessions.get(session) || session
  if (!raw?.disconnect) {
    return { status: 'skipped' }
  }
  await runBoundedAutomatorOperation({
    operation,
    action: () => raw.disconnect(),
    timeoutMs,
    setTimer,
    clearTimer
  })
  return { status: 'disconnected' }
}

function block(report, stage, error) {
  const detail = String(error?.message || error)
  setClassification(report, 'BLOCKED_ENV', `automator session ${stage}: ${detail}`)
  return { ok: false, stage, error: detail, workerStarted: false, session: null, page: null }
}

export async function handoffQuestionPackageScreenshot({
  session,
  page,
  wsEndpoint,
  outputPath,
  report,
  connect,
  expectedRoute = 'pages/diagnose/question-package',
  captureScreenshot = captureFormalScreenshot,
  timeoutMs,
  renderSettleMs = SCREENSHOT_RENDER_SETTLE_MS,
  setTimer,
  clearTimer
}) {
  if (normalizeRoute(page) !== expectedRoute) {
    return block(
      report,
      'pre_screenshot_page',
      `expected ${expectedRoute}, got ${normalizeRoute(page)}`
    )
  }
  // The active-question marker can become observable before the track transform,
  // scroll-view layout, and card entrance transition have settled. Taking the
  // renderer snapshot in that gap is a known source of App.captureScreenshot
  // no-response failures, so the handoff has an explicit visual-stability edge.
  if (renderSettleMs > 0) {
    await sleep(renderSettleMs)
  }
  try {
    await disconnectBoundedAutomatorSession({
      session,
      operation: 'primary_session_disconnect_before_screenshot',
      timeoutMs,
      setTimer,
      clearTimer
    })
  } catch (error) {
    return block(report, 'primary_session_disconnect_before_screenshot', error)
  }
  let worker = null
  const screenshotAttempts = []
  for (let attempt = 1; attempt <= SCREENSHOT_ATTEMPTS; attempt += 1) {
    worker = await captureScreenshot({ wsEndpoint, outputPath, timeoutMs }).catch(error => ({
      status: 'failed',
      validPng: false,
      detail: String(error?.message || error)
    }))
    screenshotAttempts.push({
      attempt,
      status: worker.status,
      code: worker.code || null,
      detail: worker.detail || worker.reason || null
    })
    if (worker.status === 'passed' && worker.validPng === true) {
      break
    }
    if (attempt < SCREENSHOT_ATTEMPTS) {
      await sleep(SCREENSHOT_RETRY_DELAY_MS)
    }
  }
  worker = { ...worker, attempts: screenshotAttempts }
  let rawSession
  let resumedSession
  let resumedPage
  try {
    rawSession = await runBoundedAutomatorOperation({
      operation: 'post_screenshot_connect',
      action: () => connect(wsEndpoint),
      timeoutMs,
      setTimer,
      clearTimer
    })
    resumedSession = createBoundedAutomatorSession(rawSession, {
      scope: 'post_screenshot',
      timeoutMs,
      setTimer,
      clearTimer
    })
    resumedPage = await resumedSession.currentPage()
  } catch (error) {
    const blocked = block(report, 'post_screenshot_reacquire', error)
    return resumedSession ? { ...blocked, session: resumedSession } : blocked
  }
  if (normalizeRoute(resumedPage) !== expectedRoute) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `automator session post_screenshot_page: expected ${expectedRoute}, got ${normalizeRoute(resumedPage)}`
    )
    return {
      ok: false,
      stage: 'post_screenshot_page',
      worker,
      session: resumedSession,
      page: resumedPage
    }
  }
  if (worker.status !== 'passed' || worker.validPng !== true) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `screenshot worker ${worker.status || 'failed'}: ${
        worker.detail ||
        worker.reason ||
        worker.code ||
        'worker did not produce a valid PNG'
      }`
    )
    return {
      ok: false,
      stage: 'screenshot_worker',
      worker,
      session: resumedSession,
      page: resumedPage
    }
  }
  recordScreenshot(report, outputPath)
  return { ok: true, stage: 'reacquired', worker, session: resumedSession, page: resumedPage }
}

export function recordLanRequestEvidence({
  report,
  requests,
  symptoms,
  matches,
  isSuccessful,
  detail
}) {
  for (const symptom of symptoms) {
    const questionStart = requests.find(
      request => matches(request, 'question/start') && request?.data?.symptomClassKey === symptom
    )
    recordAssertion(
      report,
      `${symptom}: formal no-image question-start response is observable`,
      isSuccessful(questionStart),
      detail(questionStart)
    )
  }
  if (symptoms.includes('wilting_droop_mode')) {
    const directInput = requests
      .filter(request => matches(request, 'answer'))
      .map(request => request?.data?.airEnvironmentByQuestionId?.q_wilting_droop__air_environment)
      .find(input => input?.deviceAirflow?.mode === 'direct')
    recordAssertion(
      report,
      'wilting answer submits a direct-airflow sidecar through the actual LAN request',
      directInput?.deviceAirflow?.mode === 'direct',
      JSON.stringify(directInput || null)
    )
  }
}
