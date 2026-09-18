#!/usr/bin/env node
'use strict'

/* oxlint-disable no-console, no-magic-numbers -- formal leaf emits an auditable report. */

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
  findRequestByUrl,
  installRequestCapture,
  readCapturedRequests,
  restoreRequest
} from '../care/watering/transpiration-v3/_shared/lib/request-capture.mjs'
import { safeScreenshot } from '../care/watering/transpiration-v3/_shared/lib/screenshot.mjs'
import {
  createReport,
  emitLeafReport,
  recordAssertion,
  recordPage,
  recordPageData,
  recordRequests,
  recordScreenshot,
  saveReport,
  setClassification
} from '../care/watering/transpiration-v3/_shared/lib/reporter.mjs'
import { preflightProject } from '../care/watering/transpiration-v3/_shared/lib/project-check.mjs'
import { textOf } from '../_shared/fertilization-reminder-live-helpers.mjs'

const GARDEN_PAGE = '/pages/garden/garden'
const HISTORY_BUTTON_PREFIX = 'garden-my-plants-plant-card-history-'
const HISTORY_TOGGLE_PREFIX = 'garden-my-plants-history-toggle-'
const HISTORY_PANEL_PREFIX = 'garden-my-plants-history-panel-'
const HISTORY_TIMELINE_PREFIX = 'garden-my-plants-history-timeline-'
const HISTORY_EMPTY_PREFIX = 'garden-my-plants-history-empty-'
const HISTORY_RECORD_PREFIX = 'garden-my-plants-diagnose-record-'
const WAIT_MS = 12000
const FAILURE_EXIT_CODE = 2

class ProductAssertionError extends Error {}
class FixtureBlockedError extends Error {
  constructor(message) {
    super(message)
    this.classification = 'BLOCKED_FIXTURE'
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assertCondition(report, name, condition, detail = '') {
  recordAssertion(report, name, Boolean(condition), detail)
  if (!condition) {
    throw new ProductAssertionError(`${name}${detail ? `: ${detail}` : ''}`)
  }
}

async function waitForHistoryBranch(page, plantId) {
  const timelineId = `${HISTORY_TIMELINE_PREFIX}${plantId}`
  const emptyId = `${HISTORY_EMPTY_PREFIX}${plantId}`
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    const timeline = await findViewById(page, timelineId)
    if (timeline) {
      return { timeline, empty: null }
    }
    const empty = await findViewById(page, emptyId)
    if (empty) {
      return { timeline: null, empty }
    }
    await sleep(250)
  }
  return { timeline: null, empty: null }
}

async function waitForPageRoute(mp, expectedRoute) {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    const page = await mp.currentPage()
    const route = String(page?.path || '')
      .replace(/^\/+/, '')
      .split('?')[0]
    if (route === expectedRoute.replace(/^\/+/, '')) {
      return page
    }
    await sleep(250)
  }
  return null
}

async function readScrollMetric(element, method, property) {
  try {
    return Number(await element[method]()) || 0
  } catch {
    return Number(await element.domProperty(property)) || 0
  }
}

async function main() {
  const env = resolveEnv(process.argv.slice(2))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'plants.garden.diagnosis_history_timeline',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null
  let captureInstalled = false
  let classification = 'BLOCKED_ENV'

  try {
    const projectCheck = preflightProject(env.projectPath)
    assertCondition(report, 'Automator 使用目标编译项目', projectCheck.ok, projectCheck.reason)

    try {
      mp = await connectAutomator(env.wsEndpoint)
    } catch (error) {
      const reason =
        error instanceof AutomatorConnectError ? error.reason : String(error?.message || error)
      throw new Error(`automator connect failed: ${reason}`)
    }

    await installRequestCapture(mp)
    captureInstalled = true
    const gardenPage = await reLaunchTo(mp, GARDEN_PAGE)
    recordPage(report, GARDEN_PAGE)
    assertCondition(
      report,
      '花园页根容器可见',
      Boolean(await findViewById(gardenPage, 'garden-tab-page'))
    )
    const plantList = await waitForElement(gardenPage, 'garden-my-plants-list', WAIT_MS)
    assertCondition(report, '花园页真实植物列表可见', Boolean(plantList))

    const historyButtons = await collectByIdPrefix(gardenPage, HISTORY_BUTTON_PREFIX, { limit: 1 })
    assertCondition(report, '至少一株植物提供历史入口', historyButtons.length > 0)
    const historyButton = historyButtons[0]
    const plantId = historyButton.stableId.slice(HISTORY_BUTTON_PREFIX.length)
    assertCondition(report, '历史入口包含可识别的植物范围', Boolean(plantId))
    await tapStableElement(historyButton.element)

    const historyBranch = await waitForHistoryBranch(gardenPage, plantId)
    if (historyBranch.empty) {
      throw new FixtureBlockedError('当前真实测试账号没有可展示的诊断历史，无法验收时间线节点')
    }
    assertCondition(report, '点击历史入口后时间线可见', Boolean(historyBranch.timeline))

    const historyToggle = await findViewById(gardenPage, `${HISTORY_TOGGLE_PREFIX}${plantId}`)
    assertCondition(report, '历史区域提供展开/收起入口', Boolean(historyToggle))

    const timelineText = await textOf(historyBranch.timeline)
    assertCondition(report, '时间线展示用户可见日期、时间或结果信息', timelineText.length > 0)
    assertCondition(
      report,
      '时间线展示日期节点',
      /\d{2}月\d{2}日/u.test(timelineText),
      timelineText
    )
    assertCondition(
      report,
      '时间线展示用户可理解的 outcome 类别',
      ['有问题', '可能存在问题', '未见明确问题', '仍需谨慎观察', '已生成结论'].some(label =>
        timelineText.includes(label)
      ),
      timelineText
    )

    const recordNodes = await collectByIdPrefix(gardenPage, HISTORY_RECORD_PREFIX)
    assertCondition(report, '时间线至少渲染一个可查看的历史节点', recordNodes.length > 0)

    const size = await historyBranch.timeline.size()
    const scrollWidth = await readScrollMetric(historyBranch.timeline, 'scrollWidth', 'scrollWidth')
    const scrollLeftBefore = Number(
      await historyBranch.timeline.property('scrollLeft').catch(() => 0)
    )
    assertCondition(
      report,
      '历史时间线滚动容器尺寸可读',
      scrollWidth >= Number(size?.width || 0),
      JSON.stringify({ scrollWidth, viewportWidth: size?.width || 0 })
    )
    if (scrollWidth > Number(size?.width || 0) + 1) {
      await historyBranch.timeline.scrollTo(Math.max(0, scrollWidth - Number(size.width)), 0)
    }
    await sleep(200)
    const scrollLeftAfter = Number(
      await historyBranch.timeline.property('scrollLeft').catch(() => 0)
    )
    assertCondition(
      report,
      '历史时间线支持横向滚动',
      scrollWidth <= Number(size?.width || 0) + 1 || scrollLeftAfter > scrollLeftBefore,
      JSON.stringify({ scrollWidth, viewportWidth: size?.width || 0, scrollLeftAfter })
    )

    await tapStableElement(historyToggle)
    await sleep(300)
    const historyPanel = await findViewById(gardenPage, `${HISTORY_PANEL_PREFIX}${plantId}`)
    assertCondition(
      report,
      '点击收起后历史内容隐藏',
      String(await historyPanel?.attribute('aria-hidden').catch(() => '')) === 'true'
    )
    await tapStableElement(historyToggle)
    await sleep(300)
    assertCondition(
      report,
      '点击展开后历史内容恢复',
      String(await historyPanel?.attribute('aria-hidden').catch(() => '')) === 'false'
    )

    recordPageData(report, GARDEN_PAGE, {
      historyTimelineVisible: true,
      historyNodeCount: recordNodes.length,
      historyTimelineOverflow: scrollWidth > Number(size?.width || 0) + 1,
      scrollLeftAfter
    })

    const screenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'garden-diagnosis-history-timeline',
      env.wsEndpoint,
      { maxAttempts: 1, expectedRoute: 'pages/garden/garden', report }
    )
    recordScreenshot(report, screenshot)
    assertCondition(report, '花园诊断时间线截图有效', Boolean(screenshot))

    const capturedRequests = await readCapturedRequests(mp)
    recordRequests(report, capturedRequests)
    const historyRequest = findRequestByUrl(capturedRequests, '/diagnosis/history', 'GET')
    assertCondition(
      report,
      '真实小程序 wx.request 命中诊断历史接口并成功返回',
      Boolean(historyRequest?.response?.statusCode === 200),
      JSON.stringify({ statusCode: historyRequest?.response?.statusCode || null })
    )

    const freshGardenPage = await mp.currentPage()
    const freshRecordNodes = await collectByIdPrefix(freshGardenPage, HISTORY_RECORD_PREFIX, {
      limit: 1
    })
    assertCondition(report, '截图重连后历史节点仍可见', freshRecordNodes.length > 0)
    await tapStableElement(freshRecordNodes[0].element)
    await sleep(700)
    const detailPage = await mp.currentPage()
    assertCondition(
      report,
      '点击历史节点进入诊断结果详情',
      String(detailPage?.path || '').includes('subpackages/diagnosis/question-package'),
      detailPage?.path || ''
    )
    const detailBack = await findViewById(detailPage, 'layout-left-action')
    assertCondition(report, '诊断历史详情 Header 提供返回控件', Boolean(detailBack))
    await tapStableElement(detailBack)
    const returnedGardenPage = await waitForPageRoute(mp, 'pages/garden/garden')
    assertCondition(
      report,
      '诊断历史详情 Header 直接回退到花园页',
      Boolean(returnedGardenPage),
      returnedGardenPage?.path || ''
    )
    const returnedHistoryBranch = await waitForHistoryBranch(returnedGardenPage, plantId)
    assertCondition(
      report,
      '返回花园后已打开的诊断历史面板仍可见',
      Boolean(returnedHistoryBranch.timeline)
    )
    const returnedHistoryToggle = await findViewById(
      returnedGardenPage,
      `${HISTORY_TOGGLE_PREFIX}${plantId}`
    )
    assertCondition(
      report,
      '返回花园后诊断历史仍保持展开状态',
      String(await returnedHistoryToggle?.attribute('aria-expanded').catch(() => '')) === 'true'
    )
    classification = 'PASS'
    setClassification(report, classification)
  } catch (error) {
    classification = error?.classification || classification
    setClassification(report, classification, String(error?.message || error))
  } finally {
    if (captureInstalled) {
      await restoreRequest(mp)
    }
    await safeDisconnect(mp)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `garden-diagnosis-history-timeline-${Date.now()}`
    )
    report.report_path = reportPath
    emitLeafReport(report)
    console.error(`[e2e] report: ${reportPath}`)
    if (report.classification !== 'PASS') {
      process.exitCode = FAILURE_EXIT_CODE
    }
  }
}

main().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = FAILURE_EXIT_CODE
})
