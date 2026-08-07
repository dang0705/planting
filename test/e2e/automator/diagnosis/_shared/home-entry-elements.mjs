import { recordAssertion } from '../../care/airflow/_shared/lib/reporter.mjs'
import { isAutomatorOperationError } from './automator-session-boundary.mjs'

const ACTIVE_PAGE_TIMEOUT_MS = 10000
const READINESS_RETRY_DELAY_MS = 250
const QUESTION_PACKAGE_ROUTE = 'pages/diagnose/question-package'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const normalizePageRoute = page => String(page?.path || '').replace(/^\//, '')

export async function waitForRoute(mp, matches, timeoutMs, options = {}) {
  const now = options.now || Date.now
  const sleepFn = options.sleepFn || sleep
  const retryDelayMs = options.retryDelayMs ?? READINESS_RETRY_DELAY_MS
  const deadline = now() + timeoutMs
  let activePage = null
  while (now() < deadline) {
    activePage = await mp.currentPage()
    if (matches(normalizePageRoute(activePage))) {
      return activePage
    }
    await sleepFn(retryDelayMs)
  }
  return activePage
}

export const waitForActiveQuestionPackagePage = (mp, options = {}) =>
  waitForRoute(
    mp,
    route => route === QUESTION_PACKAGE_ROUTE,
    options.timeoutMs ?? ACTIVE_PAGE_TIMEOUT_MS,
    options
  )

async function queryInteractiveElement(page, selector) {
  const matches = await page.$$(selector)
  const interactive = [...matches].reverse().find(element => {
    return ['tap', 'trigger', 'click'].some(method => typeof element?.[method] === 'function')
  })
  return interactive || matches.at(-1) || null
}

export async function findElementById(page, id, timeoutMs = ACTIVE_PAGE_TIMEOUT_MS, options = {}) {
  const now = options.now || Date.now
  const sleepFn = options.sleepFn || sleep
  const retryDelayMs = options.retryDelayMs ?? READINESS_RETRY_DELAY_MS
  const deadline = now() + timeoutMs
  const selectors = [`#${id}`, `[id$="--${id}"]`, `[id$="${id}"]`]
  while (now() < deadline) {
    for (const selector of selectors) {
      const element = await queryInteractiveElement(page, selector)
      if (element) {
        return element
      }
    }
    await sleepFn(retryDelayMs)
  }
  return null
}

export async function listElementIds(page) {
  const elements = await page.$$('[id]')
  return (await Promise.all(elements.map(element => element.attribute('id'))))
    .filter(Boolean)
    .map(String)
}

export async function tapElementById(page, id, report, assertion) {
  if (!id) {
    recordAssertion(report, assertion, false, 'stable id unavailable')
    return false
  }
  const element = await findElementById(page, id)
  recordAssertion(report, assertion, Boolean(element), element ? undefined : `missing id=${id}`)
  if (!element) {
    return false
  }
  return element.tap().then(
    () => true,
    error => {
      if (isAutomatorOperationError(error)) {
        throw error
      }
      recordAssertion(report, `${assertion}: tap succeeds`, false, String(error?.message || error))
      return false
    }
  )
}
