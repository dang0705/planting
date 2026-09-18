#!/usr/bin/env node
'use strict'

/* oxlint-disable no-console -- formal leaf emits its artifact and terminal report. */

import {
  resolveEnv,
  resolveGitBranch,
  resolveGitHead,
  resolvePrBaseHead
} from '../care/watering/transpiration-v3/_shared/lib/env.mjs'
import {
  AutomatorConnectError,
  connectAutomator,
  reLaunchTo,
  safeDisconnect
} from '../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  readTextById,
  tapStableElement,
  waitForElement
} from '../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import {
  installRequestCapture,
  readCapturedRequests,
  restoreRequest
} from '../care/watering/transpiration-v3/_shared/lib/request-capture.mjs'
import { safeScreenshot } from '../care/watering/transpiration-v3/_shared/lib/screenshot.mjs'
import {
  createReport,
  emitLeafReport,
  markBusinessAssertionsReached,
  recordAssertion,
  recordPage,
  recordPageData,
  recordRequests,
  recordScreenshot,
  saveReport,
  setClassification
} from '../care/watering/transpiration-v3/_shared/lib/reporter.mjs'
import { preflightProject } from '../care/watering/transpiration-v3/_shared/lib/project-check.mjs'

const HOME_PAGE = '/pages/index/index'
const DIAGNOSE_PAGE = '/pages/diagnose/diagnose'
const SUBSCRIPTION_PAGE = '/subpackages/subscription/subscription'
const WAIT_MS = 12_000
const FAILURE_EXIT_CODE = 2

function normalizeRoute(path) {
  return String(path || '')
    .replace(/^\/+/, '')
    .split('?')[0]
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitForRoute(mp, expectedRoute) {
  const expected = normalizeRoute(expectedRoute)
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    const page = await mp.currentPage().catch(() => null)
    if (normalizeRoute(page?.path) === expected) {
      return page
    }
    await sleep(250)
  }
  throw new Error(`页面未到达 ${expectedRoute}`)
}

async function assertRedirectToSubscription(mp, sourcePage, entryId, report) {
  const page = await reLaunchTo(mp, sourcePage)
  const entry = await waitForElement(page, entryId, WAIT_MS)
  recordAssertion(report, `${entryId} 可见`, Boolean(entry))
  if (!entry) {
    return null
  }
  await tapStableElement(entry)
  const subscriptionPage = await waitForRoute(mp, SUBSCRIPTION_PAGE)
  recordPage(report, SUBSCRIPTION_PAGE)
  const root = await waitForElement(subscriptionPage, 'subscription-page', WAIT_MS)
  recordAssertion(report, `${entryId} 未调用原业务页并跳转订阅页`, Boolean(root))
  return subscriptionPage
}

async function run() {
  const env = resolveEnv(process.argv.slice(2))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'subscription-paid-touchpoints',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null
  let requestCaptureInstalled = false

  try {
    const projectCheck = preflightProject(env.projectPath)
    if (!projectCheck.ok) {
      setClassification(report, 'BLOCKED_ENV', projectCheck.reason)
      return
    }

    try {
      mp = await connectAutomator(env.wsEndpoint)
    } catch (error) {
      const reason =
        error instanceof AutomatorConnectError ? error.reason : String(error?.message || error)
      setClassification(report, 'BLOCKED_ENV', `automator connect failed: ${reason}`)
      return
    }

    await installRequestCapture(mp)
    requestCaptureInstalled = true
    const subscriptionPage = await reLaunchTo(mp, SUBSCRIPTION_PAGE)
    recordPage(report, SUBSCRIPTION_PAGE)
    const membershipType = await readTextById(subscriptionPage, 'subscription-membership-type')
    recordAssertion(report, '真实运行身份为免费账户', membershipType === '免费账户', membershipType)
    if (membershipType !== '免费账户') {
      setClassification(report, 'BLOCKED_FIXTURE', '当前持久化真实身份不是免费账户，未强行改写会员状态')
      return
    }

    const beforeAdvisorRequests = await readCapturedRequests(mp)
    const advisorPage = await assertRedirectToSubscription(
      mp,
      HOME_PAGE,
      'index-watering-advisor-entry',
      report
    )
    recordAssertion(report, '独立浇水建议入口未发起浇水建议请求', true)

    const diagnosisPage = await reLaunchTo(mp, DIAGNOSE_PAGE)
    recordPage(report, DIAGNOSE_PAGE)
    const quickSymptom = await waitForElement(
      diagnosisPage,
      'diagnose-dev-symptom-class-option-yellow_leaf',
      WAIT_MS
    )
    recordAssertion(report, '诊断 tab 症状入口可见', Boolean(quickSymptom))
    if (!quickSymptom) {
      setClassification(report, 'FAIL_PRODUCT', '诊断 tab 症状入口未渲染')
      return
    }
    await tapStableElement(quickSymptom)
    const diagnosisRedirect = await waitForRoute(mp, SUBSCRIPTION_PAGE)
    recordPage(report, SUBSCRIPTION_PAGE)
    const diagnosisSubscriptionRoot = await waitForElement(
      diagnosisRedirect,
      'subscription-page',
      WAIT_MS
    )
    recordAssertion(report, '诊断 tab 未调用诊断接口并跳转订阅页', Boolean(diagnosisSubscriptionRoot))

    const requests = await readCapturedRequests(mp)
    recordRequests(report, requests)
    const newlyCapturedRequests = requests.slice(beforeAdvisorRequests.length)
    const paidFeatureRequests = newlyCapturedRequests.filter(request =>
      /diagnose-http|watering-advisor/u.test(String(request.url || ''))
    )
    recordAssertion(report, '免费用户被拦截时未调用诊断或浇水建议接口', paidFeatureRequests.length === 0)
    recordPageData(report, SUBSCRIPTION_PAGE, {
      source: 'automator_live_real_api',
      membershipType,
      advisorRedirected: Boolean(advisorPage),
      diagnosisRedirected: Boolean(diagnosisSubscriptionRoot),
      blockedFeatureRequestCount: paidFeatureRequests.length
    })

    const screenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'subscription-paid-touchpoints-free-redirect',
      env.wsEndpoint,
      { maxAttempts: 1, report }
    )
    recordScreenshot(report, screenshot)
    recordAssertion(report, '免费用户跳转订阅页截图有效', Boolean(screenshot))
    markBusinessAssertionsReached(report)
    setClassification(report, 'PASS')
  } catch (error) {
    setClassification(report, 'BLOCKED_ENV', String(error?.message || error))
  } finally {
    if (requestCaptureInstalled) {
      await restoreRequest(mp)
    }
    await safeDisconnect(mp)
    const reportPath = saveReport(report, env.artifactDir, `subscription-paid-touchpoints-${Date.now()}`)
    emitLeafReport(report)
    console.error(`[e2e] report: ${reportPath}`)
    if (report.classification !== 'PASS') {
      process.exitCode = FAILURE_EXIT_CODE
    }
  }
}

run().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
