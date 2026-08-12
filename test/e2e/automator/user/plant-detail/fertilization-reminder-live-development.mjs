#!/usr/bin/env node
'use strict'

/* oxlint-disable no-console -- CLI leaf writes its artifact location and terminal failure. */

import {
  resolveEnv,
  resolveGitBranch,
  resolveGitHead,
  resolvePrBaseHead
} from '../../care/watering/transpiration-v3/_shared/lib/env.mjs'
import {
  connectAutomator,
  AutomatorConnectError,
  reLaunchTo,
  safeDisconnect
} from '../../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  collectByIdPrefix,
  findViewById,
  tapStableElement,
  waitForElement
} from '../../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import {
  findRequestByUrl,
  installRequestCapture,
  readCapturedRequests,
  restoreRequest
} from '../../care/watering/transpiration-v3/_shared/lib/request-capture.mjs'
import { safeScreenshot } from '../../care/watering/transpiration-v3/_shared/lib/screenshot.mjs'
import {
  createReport,
  emitLeafReport,
  recordAssertion,
  recordRequests,
  recordScreenshot,
  saveReport,
  setClassification
} from '../../care/watering/transpiration-v3/_shared/lib/reporter.mjs'
import { preflightProject } from '../../care/watering/transpiration-v3/_shared/lib/project-check.mjs'
import {
  scrollFertilizationSheetToActions,
  textOf
} from '../../_shared/fertilization-reminder-e2e-helpers.mjs'

const INDEX_PAGE = '/pages/index/index'
const LIVE_QA_PLANT_ID = Number(process.env.FERTILIZATION_LIVE_PLANT_ID || 0)
const UI_WAIT_MS = 500
const ELEMENT_WAIT_MS = 10000
const CLI_ARGUMENT_START_INDEX = 2
const FAILURE_EXIT_CODE = 2
const ZERO = 0
const HTTP_OK = 200
const MIN_REMINDER_READS = 1
const CALCULATION_TOOLTIP_AUTO_CLOSE_MS = 10000
const TOOLTIP_CLOSE_BUFFER_MS = 500
const LAST_INDEX = -1
const PREVIEW_PATH = 'plant-user-http/user-plants/fertilization-reminders/preview'
const CANCEL_PATH = 'plant-user-http/user-plants/fertilization-reminders/cancel'
const REMINDER_PATH = 'plant-user-http/user-plants/fertilization-reminders?plantId='

class ProductAssertionError extends Error {}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assertCondition(report, name, condition, detail = null) {
  recordAssertion(report, name, Boolean(condition), detail)
  if (!condition) {
    throw new ProductAssertionError(`${name}${detail ? `: ${detail}` : ''}`)
  }
}

async function tapCurrent(mp, id) {
  const page = await mp.currentPage()
  const element = await waitForElement(page, id, ELEMENT_WAIT_MS)
  if (!element) {
    throw new ProductAssertionError(`未找到交互元素：${id}`)
  }
  await tapStableElement(element)
  await sleep(UI_WAIT_MS)
}

function extractPlantId(stableId) {
  const match = String(stableId || '').match(/^plant-card-fertilization-(\d+)$/u)
  return match ? Number(match[1]) : 0
}

async function closeSheetIfOpen(mp) {
  const page = await mp.currentPage()
  const close = await findViewById(page, 'plant-card-fertilization-close-button')
  if (close) {
    await tapStableElement(close)
    await sleep(UI_WAIT_MS)
  }
}

async function collectRealFertilizationEntries(page) {
  const deadline = Date.now() + ELEMENT_WAIT_MS
  while (Date.now() < deadline) {
    const entries = await collectByIdPrefix(page, 'plant-card-fertilization-')
    if (entries.length) {
      return entries
    }
    await sleep(UI_WAIT_MS)
  }
  return []
}

async function ensureRealMiniProgramLogin(mp, page, report) {
  const loginButton = await findViewById(page, 'index-quick-login-button')
  if (!loginButton) {
    recordAssertion(report, '真实小程序用户已登录或无需再次登录', true)
    return page
  }

  await tapStableElement(loginButton)
  const deadline = Date.now() + ELEMENT_WAIT_MS
  while (Date.now() < deadline) {
    const currentPage = await mp.currentPage()
    const stillNeedsLogin = await findViewById(currentPage, 'index-quick-login-button')
    if (!stillNeedsLogin) {
      recordAssertion(report, '真实小程序完成用户登录', true)
      return currentPage
    }
    await sleep(UI_WAIT_MS)
  }

  recordAssertion(report, '真实小程序完成用户登录', false, '快速登录按钮仍可见')
  throw new ProductAssertionError('真实小程序登录未完成')
}

async function findRealPlantWithFixedInterval(mp, page, report) {
  const discoveredEntries = await collectRealFertilizationEntries(page)
  const discoveredPlantIds = discoveredEntries
    .map(item => extractPlantId(item.stableId))
    .filter(Boolean)
  const candidatePlantIds = LIVE_QA_PLANT_ID
    ? [LIVE_QA_PLANT_ID]
    : [...new Set(discoveredPlantIds)]

  for (const plantId of candidatePlantIds) {
    const entryId = `plant-card-fertilization-${plantId}`
    const entry = await findViewById(page, entryId)
    if (!entry) {
      continue
    }

    await tapStableElement(entry)
    await sleep(UI_WAIT_MS)
    const currentPage = await mp.currentPage()
    const sheet = await waitForElement(
      currentPage,
      'plant-card-fertilization-sheet',
      ELEMENT_WAIT_MS
    )
    if (!sheet) {
      await closeSheetIfOpen(mp)
      continue
    }

    await scrollFertilizationSheetToActions(mp)
    const setup = await findViewById(
      await mp.currentPage(),
      'fertilization-reminder-section'
    )
    if (setup) {
      recordAssertion(
        report,
        '真实开发账户存在可设置施肥提醒的植物入口',
        true,
        `plantId=${plantId}; discovered=${discoveredPlantIds.join(',')}`
      )
      return { plantId, entryId }
    }

    await closeSheetIfOpen(mp)
    page = await mp.currentPage()
  }

  recordAssertion(
    report,
    '真实开发账户存在可设置施肥提醒的植物入口',
    false,
    `discovered plantIds=${discoveredPlantIds.join(',') || 'none'}`
  )
  throw new ProductAssertionError(
    `真实账户没有可设置固定周期施肥提醒的植物：${discoveredPlantIds.join(',') || 'none'}`
  )
}

function requestSucceeded(request) {
  return (
    Number(request?.response?.statusCode) === HTTP_OK &&
    Number(request?.response?.data?.code) === HTTP_OK
  )
}

async function run() {
  const env = resolveEnv(process.argv.slice(CLI_ARGUMENT_START_INDEX))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'fertilization-reminder-live-development',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null
  let previewVisible = false

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
    let page = await reLaunchTo(mp, INDEX_PAGE)
    page = await ensureRealMiniProgramLogin(mp, page, report)
    const selectedPlant = await findRealPlantWithFixedInterval(mp, page, report)
    const livePlantId = selectedPlant.plantId
    const entryId = selectedPlant.entryId
    let currentPage = await mp.currentPage()
    const sheet = await waitForElement(
      currentPage,
      'plant-card-fertilization-sheet',
      ELEMENT_WAIT_MS
    )
    assertCondition(report, '真实植物卡片打开施肥时间表', Boolean(sheet))

    const scroll = await scrollFertilizationSheetToActions(mp)
    assertCondition(
      report,
      '真实施肥弹框操作区在可见范围或已滚动到操作区',
      !scroll.isScrollable || scroll.scrollTop > ZERO,
      JSON.stringify(scroll)
    )
    const setup = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-section',
      ELEMENT_WAIT_MS
    )
    assertCondition(report, '真实属级月表提供当前月固定周期提醒入口', Boolean(setup))

    const screenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'fertilization-reminder-live-development-setup'
    )
    recordScreenshot(report, screenshot)
    assertCondition(report, '真实施肥提醒设置截图有效', Boolean(screenshot))

    const setupButton = await findViewById(
      await mp.currentPage(),
      'fertilization-reminder-preview-button'
    )
    const setupButtonText = await textOf(setupButton)
    assertCondition(
      report,
      '施肥提醒入口合并为设置下次施肥提醒',
      Boolean(setupButton) && setupButtonText.includes('设置下次施肥提醒'),
      setupButtonText
    )

    await tapCurrent(mp, 'fertilization-reminder-preview-button')
    currentPage = await mp.currentPage()
    const preview = await waitForElement(
      currentPage,
      'fertilization-reminder-preview',
      ELEMENT_WAIT_MS
    )
    previewVisible = Boolean(preview)
    const calculationTooltip = await findViewById(
      currentPage,
      'fertilization-reminder-calculation-tooltip'
    )
    const calculationInfoButton = await findViewById(
      currentPage,
      'fertilization-reminder-calculation-info-button'
    )
    const previewText = await textOf(preview)
    assertCondition(
      report,
      '首次无历史施肥记录可通过真实 API 生成首次确认提醒',
      previewVisible &&
        Boolean(calculationTooltip) &&
        Boolean(calculationInfoButton) &&
        previewText.includes('首次确认提醒') &&
        !previewText.includes('没有可靠的上次施肥日期') &&
        previewText.includes('确认并添加到手机日历'),
      previewText
    )

    const tooltipScreenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'fertilization-reminder-calculation-tooltip'
    )
    recordScreenshot(report, tooltipScreenshot)
    assertCondition(report, '施肥提醒算法说明 Tooltip 截图有效', Boolean(tooltipScreenshot))

    await tapCurrent(mp, 'fertilization-reminder-calculation-tooltip-dismiss-layer')
    const tooltipAfterBlankTap = await findViewById(
      await mp.currentPage(),
      'fertilization-reminder-calculation-tooltip'
    )
    assertCondition(report, '点击 Tooltip 空白区域后关闭说明', !tooltipAfterBlankTap)

    await tapCurrent(mp, 'fertilization-reminder-calculation-info-button')
    const reopenedTooltip = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-calculation-tooltip',
      ELEMENT_WAIT_MS
    )
    assertCondition(
      report,
      '点击提醒信息 icon 后重新打开算法说明 Tooltip',
      Boolean(reopenedTooltip) && (await textOf(reopenedTooltip)).includes('没有可靠的上次施肥日期')
    )
    await sleep(CALCULATION_TOOLTIP_AUTO_CLOSE_MS + TOOLTIP_CLOSE_BUFFER_MS)
    const tooltipAfterTimeout = await findViewById(
      await mp.currentPage(),
      'fertilization-reminder-calculation-tooltip'
    )
    assertCondition(report, '算法说明 Tooltip 10 秒后自动关闭', !tooltipAfterTimeout)

    await tapCurrent(mp, 'fertilization-reminder-cancel-button')
    previewVisible = false
    const setupAfterCancel = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-section',
      ELEMENT_WAIT_MS
    )
    assertCondition(report, '取消设置后回到真实提醒设置区', Boolean(setupAfterCancel))

    const close = await findViewById(
      await mp.currentPage(),
      'plant-card-fertilization-close-button'
    )
    if (close) {
      await tapStableElement(close)
      await sleep(UI_WAIT_MS)
    }
    await tapCurrent(mp, entryId)
    await scrollFertilizationSheetToActions(mp)
    const setupAfterReopen = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-section',
      ELEMENT_WAIT_MS
    )
    assertCondition(
      report,
      '重新打开后真实开发库没有遗留 active 施肥提醒',
      Boolean(setupAfterReopen)
    )

    const requests = await readCapturedRequests(mp)
    recordRequests(report, requests)
    const previewRequest = findRequestByUrl(requests, PREVIEW_PATH, 'POST')
    const cancelRequest = findRequestByUrl(requests, CANCEL_PATH, 'POST')
    const reminderReads = requests.filter(request =>
      String(request.url || '').includes(`${REMINDER_PATH}${livePlantId}`)
    )
    assertCondition(
      report,
      '小程序运行时真实调用 preview API 并收到 200',
      requestSucceeded(previewRequest),
      JSON.stringify(previewRequest?.response || null)
    )
    assertCondition(
      report,
      '小程序运行时真实调用 cancel API 并收到 200',
      requestSucceeded(cancelRequest),
      JSON.stringify(cancelRequest?.response || null)
    )
    const latestReminderRead = reminderReads.at(LAST_INDEX)
    assertCondition(
      report,
      '重新打开后通过真实 GET 读回无 active 状态',
      reminderReads.length >= MIN_REMINDER_READS &&
        requestSucceeded(latestReminderRead) &&
        latestReminderRead?.response?.data?.data === null,
      JSON.stringify(latestReminderRead?.response || null)
    )
    report.business_assertions_reached = true
    setClassification(report, 'PASS')
  } catch (error) {
    setClassification(
      report,
      error instanceof ProductAssertionError ? 'FAIL_PRODUCT' : 'BLOCKED_ENV',
      String(error?.message || error)
    )
  } finally {
    if (mp && previewVisible) {
      try {
        await tapCurrent(mp, 'fertilization-reminder-cancel-button')
      } catch {
        // The report remains failed; this best-effort cleanup only protects the QA plant.
      }
    }
    if (mp) {
      const requests = await readCapturedRequests(mp).catch(() => [])
      if (!report.capturedRequests.length) {
        recordRequests(report, requests)
      }
    }
    await restoreRequest(mp)
    await safeDisconnect(mp)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `fertilization-reminder-live-development-${Date.now()}`
    )
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
