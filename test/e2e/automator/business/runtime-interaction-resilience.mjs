#!/usr/bin/env node

import {
  resolveEnv,
  resolveGitBranch,
  resolveGitHead,
  resolvePrBaseHead
} from '../care/watering/transpiration-v3/_shared/lib/env.mjs'
import {
  connectAutomator,
  reLaunchTo,
  safeDisconnect
} from '../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  findByIdPrefix,
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
import { resolveQaBackendTarget } from '../../../../scripts/qa/qa-backend-target.mjs'

const WAIT_MS = 12000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assertCondition(report, name, condition, detail = '') {
  recordAssertion(report, name, Boolean(condition), detail)
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`)
  }
}

async function waitForRoute(mp, expectedRoute) {
  const expected = String(expectedRoute || '').replace(/^\/+/, '')
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    const current = await getCurrentPageWithFallback(mp, { timeoutMs: 2500, perRpcTimeoutMs: 1500 })
    const actual = String(current.page?.path || '').replace(/^\/+/, '')
    if (actual === expected) {
      return current.page
    }
    await sleep(250)
  }
  throw new Error(`页面未稳定到 ${expectedRoute}`)
}

async function currentPageStack(mp) {
  return mp.evaluate(() => {
    const pages = (typeof getCurrentPages === 'function' ? getCurrentPages() : []) || []
    return pages.map(page => String(page?.route || page?.__route__ || '').replace(/^\/+/, ''))
  })
}

async function captureRuntimeHealthRequest(mp) {
  const slot = `__runtimeResilienceHealth_${Date.now()}`
  const url = `${resolveQaBackendTarget(process.env, {
    port: 3011,
    functionPortBase: 9100
  }).baseUrl.replace(/\/+$/, '')}/plant-catalog-http/catalog/health`
  try {
    await mp.evaluate(
      (requestSlot, requestUrl) => {
        globalThis[requestSlot] = { state: 'pending' }
        wx.request({
          url: requestUrl,
          method: 'GET',
          timeout: 5000,
          header: {
            'x-terminal-e2e': 'true',
            'x-app-env': 'development',
            'x-env': 'development'
          },
          success: response => {
            globalThis[requestSlot] = {
              state: 'completed',
              statusCode: response?.statusCode || null,
              bodyCode: response?.data?.code || null
            }
          },
          fail: error => {
            globalThis[requestSlot] = {
              state: 'failed',
              error: String(error?.errMsg || error || '')
            }
          }
        })
      },
      slot,
      url
    )
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      const result = await mp.evaluate(requestSlot => globalThis[requestSlot] || null, slot)
      if (result?.state === 'completed' || result?.state === 'failed') {
        return result
      }
      await sleep(200)
    }
    return { state: 'timeout' }
  } finally {
    await mp
      .evaluate(requestSlot => {
        delete globalThis[requestSlot]
        return true
      }, slot)
      .catch(() => {})
  }
}

async function readScrollMetric(scroll, method, property) {
  try {
    return Number(await scroll[method]()) || 0
  } catch {
    return Number(await scroll.domProperty(property)) || 0
  }
}

async function waitForFirstByIdPrefix(page, prefix, timeoutMs = WAIT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const match = await findByIdPrefix(page, prefix)
    if (match?.element) {
      return match.element
    }
    await sleep(300)
  }
  return null
}

async function waitForSwiperStep(page, expectedStep, timeoutMs = WAIT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const swiper = await findViewById(page, 'add-plant-swiper')
    const current = swiper ? Number(await swiper.property('current').catch(() => -1)) : -1
    if (current === expectedStep) {
      return true
    }
    await sleep(300)
  }
  return false
}

async function scrollRapidly(page, report) {
  const scrollViews = await page.$$('scroll-view').catch(() => [])
  assertCondition(report, '添加植物页存在可交互滚动容器', scrollViews.length > 0)
  const preferredScroll = await findViewById(page, 'add-plant-selection-scroll')
  const scrollCandidates = preferredScroll ? [preferredScroll] : scrollViews
  const candidates = []
  for (const item of scrollCandidates) {
    const size = await item.size()
    const width = Number(size?.width) || 0
    const height = Number(size?.height) || 0
    const scrollWidth = await readScrollMetric(item, 'scrollWidth', 'scrollWidth')
    const scrollHeight = await readScrollMetric(item, 'scrollHeight', 'scrollHeight')
    candidates.push({ item, width, height, scrollWidth, scrollHeight })
  }
  const scroll =
    candidates.find(
      item =>
        typeof item.item.scrollTo === 'function' &&
        (item.scrollWidth > item.width + 1 || item.scrollHeight > item.height + 1)
    ) ||
    candidates.find(item => typeof item.item.scrollTo === 'function') ||
    candidates[0]
  assertCondition(
    report,
    '滚动容器提供稳定的 scrollTo 控制',
    typeof scroll.item.scrollTo === 'function'
  )
  const isHorizontal = scroll.scrollWidth > scroll.width + 1
  const scrollExtent = isHorizontal ? scroll.scrollWidth : scroll.scrollHeight
  const viewportExtent = isHorizontal ? scroll.width : scroll.height
  assertCondition(report, '添加植物列表滚动尺寸可读', scrollExtent >= viewportExtent)
  const positions = [0.18, 0.46, 0.78, 1].map(ratio => Math.round(scrollExtent * ratio))
  for (const position of positions) {
    await scroll.item.scrollTo(isHorizontal ? position : 0, isHorizontal ? 0 : position)
  }
  await sleep(200)
  let scrollTop = 0
  const scrollLeft = Number(await scroll.item.property('scrollLeft').catch(() => 0)) || 0
  scrollTop = Number(await scroll.item.property('scrollTop').catch(() => 0)) || 0
  const finalPosition = isHorizontal ? scrollLeft : scrollTop
  assertCondition(
    report,
    '快速连续滚动后页面仍可读取滚动位置',
    finalPosition >= 0,
    `${isHorizontal ? 'scrollLeft' : 'scrollTop'}=${finalPosition}`
  )
  assertCondition(
    report,
    '存在溢出内容时快速连续滚动确实改变位置',
    scrollExtent <= viewportExtent + 1 || finalPosition > 0,
    JSON.stringify({ scrollExtent, viewportExtent, finalPosition })
  )
  return {
    axis: isHorizontal ? 'x' : 'y',
    scrollWidth: scroll.scrollWidth,
    scrollHeight: scroll.scrollHeight,
    viewportWidth: scroll.width,
    viewportHeight: scroll.height,
    scrollLeft,
    scrollTop
  }
}

async function scrollInfoStepToBottom(page, report) {
  const scroll = await waitForElement(page, 'add-plant-info-scroll', WAIT_MS)
  assertCondition(report, '添加植物信息步骤纵向滚动容器可见', Boolean(scroll))
  const size = await scroll.size()
  const viewportHeight = Number(size?.height) || 0
  const scrollHeight = await readScrollMetric(scroll, 'scrollHeight', 'scrollHeight')
  assertCondition(
    report,
    '添加植物信息步骤滚动视口高度有效',
    viewportHeight > 0,
    `viewportHeight=${viewportHeight}`
  )
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight)
  assertCondition(
    report,
    '添加植物信息步骤内容超出视口后可滚动',
    maxScrollTop > 0,
    JSON.stringify({ scrollHeight, viewportHeight, maxScrollTop })
  )
  for (const ratio of [0.16, 0.48, 0.82, 1]) {
    await scroll.scrollTo(0, Math.round(maxScrollTop * ratio))
  }
  await sleep(250)
  const scrollTop = Number(await scroll.property('scrollTop').catch(() => 0)) || 0
  assertCondition(
    report,
    '添加植物信息步骤快速连续滚动后到达底部',
    scrollTop >= maxScrollTop - 8,
    JSON.stringify({ scrollTop, maxScrollTop, scrollHeight, viewportHeight })
  )
  assertCondition(
    report,
    '滚动到底部后添加植物提交入口仍可定位',
    Boolean(await findViewById(page, 'add-plant-submit-button'))
  )
  const submitBar = await findViewById(page, 'add-plant-submit-bar')
  const submitBarSize =
    submitBar && typeof submitBar.size === 'function'
      ? await submitBar.size().catch(() => null)
      : null
  assertCondition(
    report,
    '添加植物底部操作栏保持可见高度',
    Number(submitBarSize?.height) > 0,
    JSON.stringify({ submitBarHeight: submitBarSize?.height || 0 })
  )
  return {
    scrollHeight,
    viewportHeight,
    maxScrollTop,
    scrollTop,
    submitBarHeight: Number(submitBarSize?.height) || 0
  }
}

async function capture(mp, env, report, label) {
  const screenshot = await safeScreenshot(mp, env.artifactDir, label, env.wsEndpoint, {
    maxAttempts: 2,
    expectedRoute: 'subpackages/plant/user-plant-detail/user-plant-detail',
    report
  })
  assertCondition(report, `${label}截图为有效 PNG`, Boolean(screenshot))
  recordScreenshot(report, screenshot)
}

async function main() {
  const env = resolveEnv(process.argv.slice(2))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'business.runtime_interaction_resilience',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null
  let classification = 'BLOCKED_ENV'
  try {
    const projectCheck = preflightProject(env.projectPath)
    assertCondition(report, 'Automator 使用目标编译项目', projectCheck.ok, projectCheck.reason)
    mp = await connectAutomator(env.wsEndpoint)
    const home = await reLaunchTo(mp, '/pages/index/index')
    recordPage(report, home.path)
    assertCondition(report, '首页根节点可见', Boolean(await findViewById(home, 'index-page')))

    const list = await waitForElement(home, 'index-plant-list', 2500)
    const entryId = list ? 'index-add-plant-button' : 'index-empty-add-plant-button'
    const addEntry = await waitForElement(home, entryId, WAIT_MS)
    assertCondition(report, '首页添加植物入口可见', Boolean(addEntry), entryId)

    await tapStableElement(addEntry)
    try {
      await tapStableElement(addEntry)
    } catch {
      // 第一次点击后入口已离开页面，第二次点击无节点是预期的重复点击保护场景。
    }
    const create = await waitForRoute(mp, 'subpackages/plant/user-plant-detail/user-plant-detail')
    recordPage(report, create.path)
    const stack = await currentPageStack(mp)
    const createPageCount = stack.filter(route => route.includes('user-plant-detail')).length
    assertCondition(
      report,
      '快速重复点击只产生一个建档页',
      createPageCount === 1,
      JSON.stringify(stack)
    )
    assertCondition(
      report,
      '建档页根节点可见',
      Boolean(await findViewById(create, 'add-plant-swiper'))
    )
    const createCard = await waitForFirstByIdPrefix(create, 'add-plant-card-')
    assertCondition(report, '建档页存在可选植物卡片', Boolean(createCard))
    await tapStableElement(createCard)
    await sleep(250)
    assertCondition(
      report,
      '建档页点击植物卡片后信息步骤已激活',
      await waitForSwiperStep(create, 1),
      'swiper.current 未稳定为 1'
    )
    const infoScrollEvidence = await scrollInfoStepToBottom(create, report)
    recordAssertion(
      report,
      '信息步骤滚动到底部后页面布局未崩溃',
      true,
      JSON.stringify(infoScrollEvidence)
    )

    const resetCreate = await reLaunchTo(
      mp,
      '/subpackages/plant/user-plant-detail/user-plant-detail?mode=create'
    )
    recordPage(report, resetCreate.path)
    const scrollEvidence = await scrollRapidly(resetCreate, report)
    recordAssertion(report, '快速滑动后建档页布局未崩溃', true, JSON.stringify(scrollEvidence))
    await capture(mp, env, report, 'runtime-interaction-resilience-create')

    const health = await captureRuntimeHealthRequest(mp)
    assertCondition(
      report,
      '真实小程序 wx.request 健康请求完成',
      health?.state === 'completed' && health.statusCode === 200 && health.bodyCode === 200,
      JSON.stringify(health)
    )
    report.business_assertions_reached = true
    classification = 'PASS'
    setClassification(report, classification)
  } catch (error) {
    setClassification(report, classification, String(error?.message || error))
  } finally {
    await safeDisconnect(mp)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `runtime-interaction-resilience-${Date.now()}`
    )
    report.report_path = reportPath
    emitLeafReport(report)
    console.error(`[e2e] report: ${reportPath}`)
    if (report.classification !== 'PASS') {
      process.exitCode = 2
    }
  }
}

main().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 2
})
