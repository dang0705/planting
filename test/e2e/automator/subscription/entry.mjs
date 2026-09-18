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
  collectByIdPrefix,
  findViewById,
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

const PROFILE_PAGE = '/pages/profile/profile'
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

async function waitForPlanState(page) {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    const [planList, plansError, plansEmpty] = await Promise.all([
      findViewById(page, 'subscription-plan-list'),
      findViewById(page, 'subscription-plans-error'),
      findViewById(page, 'subscription-plans-empty')
    ])
    if (planList || plansError || plansEmpty) {
      return { planList, plansError, plansEmpty }
    }
    await sleep(250)
  }
  return { planList: null, plansError: null, plansEmpty: null }
}

async function run() {
  const env = resolveEnv(process.argv.slice(2))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'subscription-entry',
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
    const profilePage = await reLaunchTo(mp, PROFILE_PAGE)
    recordPage(report, PROFILE_PAGE)
    const entry = await waitForElement(profilePage, 'profile-subscription-entry', WAIT_MS)
    recordAssertion(report, '个人中心订阅入口可见', Boolean(entry))
    if (!entry) {
      setClassification(report, 'FAIL_PRODUCT', '个人中心未渲染订阅入口')
      return
    }

    await tapStableElement(entry)
    const subscriptionPage = await waitForRoute(mp, SUBSCRIPTION_PAGE)
    recordPage(report, SUBSCRIPTION_PAGE)
    const pageRoot = await waitForElement(subscriptionPage, 'subscription-page', WAIT_MS)
    recordAssertion(report, '订阅会员分包页面可见', Boolean(pageRoot))
    if (!pageRoot) {
      setClassification(report, 'FAIL_PRODUCT', '订阅分包页面根节点未渲染')
      return
    }

    const planState = await waitForPlanState(subscriptionPage)
    const { planList, plansError, plansEmpty } = planState
    const capturedRequests = await readCapturedRequests(mp)
    recordRequests(report, capturedRequests)
    const plansRequest = capturedRequests.find(
      request =>
        String(request.url || '').includes('/subscription-http/subscription/plans') &&
        String(request.method || '').toUpperCase() === 'GET'
    )
    if (plansError || plansEmpty) {
      recordAssertion(report, '服务端至少下发一个可购买套餐', false, '套餐未配置或服务端不可用')
      recordAssertion(report, '订阅页面通过真实运行时请求加载套餐', Boolean(plansRequest))
      setClassification(report, 'BLOCKED_FIXTURE', '真实订阅套餐配置或接口尚未就绪')
      return
    }

    const payButtons = (await collectByIdPrefix(subscriptionPage, 'subscription-plan-')).filter(
      item => item.stableId.endsWith('-pay-button')
    )
    recordAssertion(report, '服务端订阅套餐列表可见', Boolean(planList))
    recordAssertion(report, '至少一个订阅套餐具备立即订阅入口', payButtons.length > 0)
    recordAssertion(report, '订阅页面通过真实运行时请求加载套餐', Boolean(plansRequest))
    recordPageData(report, SUBSCRIPTION_PAGE, {
      source: 'public_page_and_real_api',
      planListVisible: Boolean(planList),
      payButtonCount: payButtons.length,
      payButtonIds: payButtons.map(item => item.stableId),
      plansRequestCaptured: Boolean(plansRequest)
    })
    if (!planList || payButtons.length === 0 || !plansRequest) {
      setClassification(report, 'FAIL_PRODUCT', '订阅套餐或支付入口未渲染')
      return
    }

    const screenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'subscription-entry',
      env.wsEndpoint,
      { maxAttempts: 1, report }
    )
    recordScreenshot(report, screenshot)
    recordAssertion(report, '订阅会员页面截图有效', Boolean(screenshot))

    // 不点击真实支付按钮，避免在正式验收中产生真实支付订单或扣款。
    recordPageData(report, SUBSCRIPTION_PAGE, {
      paymentInvocation: 'not_run_external_payment_guard'
    })
    markBusinessAssertionsReached(report)
    setClassification(report, 'PASS')
  } catch (error) {
    setClassification(report, 'BLOCKED_ENV', String(error?.message || error))
  } finally {
    if (requestCaptureInstalled) {
      await restoreRequest(mp)
    }
    await safeDisconnect(mp)
    const reportPath = saveReport(report, env.artifactDir, `subscription-entry-${Date.now()}`)
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
