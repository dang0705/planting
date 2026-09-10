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
  connectAutomator,
  AutomatorConnectError,
  safeDisconnect
} from '../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  findViewById,
  tapStableElement,
  waitForElement
} from '../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import { safeScreenshot } from '../care/watering/transpiration-v3/_shared/lib/screenshot.mjs'
import {
  createReport,
  emitLeafReport,
  recordAssertion,
  recordPage,
  recordScreenshot,
  saveReport,
  setClassification
} from '../care/watering/transpiration-v3/_shared/lib/reporter.mjs'
import { preflightProject } from '../care/watering/transpiration-v3/_shared/lib/project-check.mjs'
import { getCurrentPageWithFallback } from '../_shared/page-probe.mjs'

const PROFILE_PAGE = '/pages/profile/profile'
const HOME_PAGE = '/pages/index/index'
const MISSING_RESULT_PAGE = '/subpackages/diagnosis/result?id=__e2e_missing_diagnosis_result__'
const HIDDEN_PROFILE_IDS = [
  'profile-menu-outOfPoolReview',
  'profile-menu-diagnosisReview',
  'profile-menu-wateringReview',
  'profile-diagnose-history-view-all'
]
const ROUTE_WAIT_MS = 12000
const UI_SETTLE_MS = 700
const FAILURE_EXIT_CODE = 2

class ProductAssertionError extends Error {}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeRoute(path) {
  return String(path || '')
    .replace(/^\/+/, '')
    .split('?')[0]
}

async function waitForRoute(mp, expectedRoute) {
  const expected = normalizeRoute(expectedRoute)
  const deadline = Date.now() + ROUTE_WAIT_MS
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const probe = await getCurrentPageWithFallback(mp, {
        timeoutMs: Math.min(2500, deadline - Date.now()),
        perRpcTimeoutMs: 1500
      })
      if (normalizeRoute(probe.page?.path) === expected) {
        return probe.page
      }
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(
    `route did not settle at ${expectedRoute}${lastError ? `: ${lastError.message}` : ''}`
  )
}

function assertCondition(report, name, condition, detail = null) {
  recordAssertion(report, name, Boolean(condition), detail)
  if (!condition) {
    throw new ProductAssertionError(`${name}${detail ? `: ${detail}` : ''}`)
  }
}

async function run() {
  const env = resolveEnv(process.argv.slice(2))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'profile-mvp-boundaries',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null

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

    await mp.callWxMethod('reLaunch', { url: PROFILE_PAGE })
    const profilePage = await waitForRoute(mp, PROFILE_PAGE)
    recordPage(report, PROFILE_PAGE)
    assertCondition(report, '个人中心页面可见', Boolean(profilePage))

    const historySection = await waitForElement(
      profilePage,
      'profile-diagnose-history-section',
      ROUTE_WAIT_MS
    )
    assertCondition(report, '个人中心诊断历史区域可见', Boolean(historySection))

    const myPlantsEntry = await waitForElement(profilePage, 'profile-menu-myPlants', ROUTE_WAIT_MS)
    assertCondition(report, '个人中心“我的植物”入口可见', Boolean(myPlantsEntry))

    for (const hiddenId of HIDDEN_PROFILE_IDS) {
      const hiddenEntry = await findViewById(profilePage, hiddenId)
      assertCondition(report, `个人中心不展示内部或未闭环入口：${hiddenId}`, !hiddenEntry)
    }

    const screenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'profile-mvp-boundaries',
      env.wsEndpoint,
      { maxAttempts: 1, report }
    )
    recordScreenshot(report, screenshot)
    assertCondition(report, '个人中心截图有效', Boolean(screenshot))

    // safeScreenshot 会断开并重新建立 Automator 会话；截图前取得的元素句柄
    // 绑定旧会话，不能在重连后复用，否则会被误报为 DevTools 断线。
    const profilePageAfterScreenshot = await waitForRoute(mp, PROFILE_PAGE)
    const myPlantsEntryAfterScreenshot = await waitForElement(
      profilePageAfterScreenshot,
      'profile-menu-myPlants',
      ROUTE_WAIT_MS
    )
    assertCondition(
      report,
      '截图重连后“我的植物”入口仍可见',
      Boolean(myPlantsEntryAfterScreenshot)
    )
    await tapStableElement(myPlantsEntryAfterScreenshot)
    await sleep(UI_SETTLE_MS)
    const homePage = await waitForRoute(mp, HOME_PAGE)
    recordPage(report, HOME_PAGE)
    assertCondition(report, '“我的植物”返回首页植物列表', Boolean(homePage))

    await mp.callWxMethod('reLaunch', { url: PROFILE_PAGE })
    const reenteredProfile = await waitForRoute(mp, PROFILE_PAGE)
    recordPage(report, PROFILE_PAGE)
    assertCondition(
      report,
      '个人中心重新进入后诊断历史区域仍可见',
      Boolean(
        await waitForElement(reenteredProfile, 'profile-diagnose-history-section', ROUTE_WAIT_MS)
      )
    )

    await mp.callWxMethod('reLaunch', { url: MISSING_RESULT_PAGE })
    const resultPage = await waitForRoute(mp, '/subpackages/diagnosis/result')
    recordPage(report, '/subpackages/diagnosis/result')
    const retryEntry = await waitForElement(
      resultPage,
      'diagnosis-result-page-retry',
      ROUTE_WAIT_MS
    )
    assertCondition(report, '不存在的诊断记录展示可重试错误态', Boolean(retryEntry))

    await tapStableElement(retryEntry)
    // 点击后页面会先进入 loading，按钮会短暂从 DOM 移除；等待真实请求
    // 完成后的错误态重新渲染，避免把正常的网络时序误判为产品失败。
    const retryAfterTap = await waitForElement(
      resultPage,
      'diagnosis-result-page-retry',
      ROUTE_WAIT_MS
    )
    assertCondition(report, '结果页错误态可重新发起请求', Boolean(retryAfterTap))

    const resultErrorScreenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'diagnosis-result-error',
      env.wsEndpoint,
      { maxAttempts: 1, report }
    )
    recordScreenshot(report, resultErrorScreenshot)
    assertCondition(report, '结果页错误态截图有效', Boolean(resultErrorScreenshot))

    report.business_assertions_reached = true
    setClassification(report, 'PASS')
  } catch (error) {
    setClassification(
      report,
      error instanceof ProductAssertionError ? 'FAIL_PRODUCT' : 'BLOCKED_ENV',
      String(error?.message || error)
    )
  } finally {
    await safeDisconnect(mp)
    const reportPath = saveReport(report, env.artifactDir, `profile-mvp-boundaries-${Date.now()}`)
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
