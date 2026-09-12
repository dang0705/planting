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
} from '../../_shared/fertilization-reminder-live-helpers.mjs'
import {
  cleanupTemporaryFertilizationPlant,
  createTemporaryFertilizationPlant
} from '../../_shared/fertilization-reminder-fixture.mjs'

const INDEX_PAGE = '/pages/index/index'
const LIVE_QA_COMPLETE_PLANT_ID = Number(
  process.env.FERTILIZATION_LIVE_COMPLETE_PLANT_ID || process.env.FERTILIZATION_LIVE_PLANT_ID || 0
)
const LIVE_QA_SKIP_PLANT_ID = Number(process.env.FERTILIZATION_LIVE_SKIP_PLANT_ID || 0)
const LIVE_QA_PAUSE_PLANT_ID = Number(process.env.FERTILIZATION_LIVE_PAUSE_PLANT_ID || 0)
const LIVE_QA_RULE_ONLY = process.env.FERTILIZATION_LIVE_RULE_ONLY === '1'
const UI_WAIT_MS = 500
const ELEMENT_WAIT_MS = 10000
const DISMISS_REQUEST_WAIT_MS = 2000
const ELEMENT_TAP_FALLBACK_TIMEOUT_MS = 3000
const CLI_ARGUMENT_START_INDEX = 2
const FAILURE_EXIT_CODE = 2
const ZERO = 0
const HTTP_OK = 200
const MIN_REMINDER_READS = 1
const ASSERTED_LAST_APPLIED_DATE = '2026-07-01'
const LAST_INDEX = -1
const PREVIEW_PATH = 'plant-user-http/user-plants/fertilization-reminders/preview'
const CANCEL_PATH = 'plant-user-http/user-plants/fertilization-reminders/cancel'
const REMINDER_PATH = 'plant-user-http/user-plants/fertilization-reminders?plantId='

class ProductAssertionError extends Error {}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function readDisabledState(element) {
  if (!element) {
    return null
  }
  try {
    return Boolean(await element.property('disabled'))
  } catch {
    try {
      return String((await element.attribute('disabled')) || '') === 'true'
    } catch {
      return null
    }
  }
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

async function waitForSettledPreview(mp, timeoutMs = ELEMENT_WAIT_MS) {
  const deadline = Date.now() + timeoutMs
  let preview = null
  let previewText = ''
  while (Date.now() < deadline) {
    const page = await mp.currentPage()
    preview = await findViewById(page, 'fertilization-reminder-preview')
    previewText = await textOf(preview)
    if (preview && !previewText.includes('保存中')) {
      return { preview, previewText }
    }
    await sleep(UI_WAIT_MS)
  }
  return { preview, previewText }
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

async function waitForRoute(mp, expectedPath, timeoutMs = ELEMENT_WAIT_MS) {
  const deadline = Date.now() + timeoutMs
  const normalizedExpectedPath = String(expectedPath).replace(/^\/+/, '')
  while (Date.now() < deadline) {
    const page = await mp.currentPage()
    const normalizedPath = String(page?.path || '')
      .replace(/^\/+/, '')
      .split('?')[0]
    if (normalizedPath === normalizedExpectedPath) {
      return page
    }
    await sleep(UI_WAIT_MS)
  }
  return null
}

async function refreshIndexAfterPlantMutation(mp, plantId) {
  const entryId = `plant-card-fertilization-${plantId}`
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await mp.callWxMethod('navigateTo', {
      url: `/subpackages/plant/user-plant-detail/user-plant-detail?mode=create&qaRefresh=${Date.now()}`
    })
    await waitForRoute(mp, '/subpackages/plant/user-plant-detail/user-plant-detail')
    await mp.callWxMethod('reLaunch', { url: INDEX_PAGE })
    const page = await waitForRoute(mp, INDEX_PAGE)
    if (!page) {
      throw new Error('真实小程序重启回首页失败，无法刷新临时植物卡片')
    }
    if (await waitForElement(page, entryId, ELEMENT_WAIT_MS)) {
      return page
    }
  }
  return mp.currentPage()
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
  const loginButton = await findViewById(page, 'index-phone-login-button')
  if (!loginButton) {
    recordAssertion(report, '真实小程序用户已登录或无需再次登录', true)
    return page
  }

  recordAssertion(
    report,
    '真实小程序完成手机号登录',
    false,
    'BLOCKED_ENV：手机号授权必须由真机用户主动确认，自动化不会模拟或绕过该授权'
  )
  throw new ProductAssertionError('BLOCKED_ENV：请先在真机完成手机号授权后再运行此 live 用例')
}

async function findRealPlantWithFixedInterval(
  mp,
  page,
  report,
  preferredPlantId = 0,
  excludedPlantIds = [],
  assertionName = '真实开发账户存在可设置施肥提醒的植物入口'
) {
  const discoveredEntries = await collectRealFertilizationEntries(page)
  const discoveredPlantIds = discoveredEntries
    .map(item => extractPlantId(item.stableId))
    .filter(Boolean)
  const excluded = new Set(excludedPlantIds.map(Number))
  const preferredIsAvailable =
    preferredPlantId &&
    discoveredPlantIds.includes(Number(preferredPlantId)) &&
    !excluded.has(Number(preferredPlantId))
  if (preferredPlantId && !preferredIsAvailable) {
    recordAssertion(
      report,
      assertionName,
      false,
      `requested=${preferredPlantId}; excluded=${[...excluded].join(',') || 'none'}; discovered plantIds=${discoveredPlantIds.join(',') || 'none'}`
    )
    throw new ProductAssertionError(
      `真实指定植物未出现在首页卡片，禁止回退到其他植物：requested=${preferredPlantId}; discovered=${discoveredPlantIds.join(',') || 'none'}`
    )
  }
  const candidatePlantIds = [
    ...(preferredIsAvailable ? [Number(preferredPlantId)] : []),
    ...discoveredPlantIds.filter(plantId => !excluded.has(Number(plantId)))
  ].filter((plantId, index, ids) => ids.indexOf(plantId) === index)

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
    const reminderEntry = await findViewById(
      await mp.currentPage(),
      'fertilization-reminder-entry-button'
    )
    if (reminderEntry) {
      recordAssertion(
        report,
        assertionName,
        true,
        `plantId=${plantId}; requested=${preferredPlantId || 'none'}; discovered=${discoveredPlantIds.join(',')}`
      )
      return { plantId, entryId }
    }

    await closeSheetIfOpen(mp)
    page = await mp.currentPage()
  }

  recordAssertion(
    report,
    assertionName,
    false,
    `requested=${preferredPlantId || 'none'}; excluded=${[...excluded].join(',') || 'none'}; discovered plantIds=${discoveredPlantIds.join(',') || 'none'}`
  )
  throw new ProductAssertionError(
    `真实账户没有可设置固定周期施肥提醒的植物：${discoveredPlantIds.join(',') || 'none'}`
  )
}

async function openRealPlantSheet(mp, page, plantId) {
  const entry = await findViewById(page, `plant-card-fertilization-${plantId}`)
  if (!entry) {
    throw new ProductAssertionError(`未找到真实植物卡片：${plantId}`)
  }
  await tapStableElement(entry)
  await sleep(UI_WAIT_MS)
  const currentPage = await mp.currentPage()
  const sheet = await waitForElement(currentPage, 'plant-card-fertilization-sheet', ELEMENT_WAIT_MS)
  if (!sheet) {
    throw new ProductAssertionError(`真实植物施肥弹框未打开：${plantId}`)
  }
  await scrollFertilizationSheetToActions(mp)
  return mp.currentPage()
}

async function verifyRealPausePlant(mp, page, plantId, report, artifactDir) {
  const currentPage = await openRealPlantSheet(mp, page, plantId)
  const sheet = await findViewById(currentPage, 'plant-card-fertilization-sheet')
  const sheetText = await textOf(sheet)
  assertCondition(
    report,
    '真实暂停月份同时展示液体肥和缓释肥的暂停规则',
    sheetText.includes('暂停施肥') && sheetText.includes('不建议追加'),
    sheetText
  )

  const reminderEntry = await findViewById(currentPage, 'fertilization-reminder-entry-button')
  const setup = await findViewById(currentPage, 'fertilization-reminder-section')
  const noFixedPeriod = await findViewById(currentPage, 'fertilization-reminder-no-fixed-period')
  const previewButton = await findViewById(currentPage, 'fertilization-reminder-preview-button')
  assertCondition(
    report,
    '真实暂停月份不展示施肥提醒设置或提交入口',
    !reminderEntry && !setup && Boolean(noFixedPeriod) && !previewButton,
    `entry=${Boolean(reminderEntry)}; setup=${Boolean(setup)}; noFixedPeriod=${Boolean(noFixedPeriod)}; preview=${Boolean(previewButton)}`
  )

  const screenshot = await safeScreenshot(
    mp,
    artifactDir,
    'fertilization-reminder-live-development-pause-month',
    undefined,
    { maxAttempts: 1, report }
  )
  recordScreenshot(report, screenshot)
  assertCondition(report, '真实暂停月份施肥表截图有效', Boolean(screenshot))

  const requests = await readCapturedRequests(mp)
  const reminderRead = requests
    .filter(request => String(request.url || '').includes(`${REMINDER_PATH}${plantId}`))
    .at(LAST_INDEX)
  const reminderData = reminderRead?.response?.data?.data || null
  assertCondition(
    report,
    '真实暂停月份提醒接口返回无可用施肥周期',
    requestSucceeded(reminderRead) &&
      reminderData?.active === false &&
      reminderData?.currentMonthConclusion?.status === 'monthly_pause' &&
      Array.isArray(reminderData?.currentMonthOptions) &&
      reminderData.currentMonthOptions.length === ZERO,
    JSON.stringify(reminderData)
  )

  await closeSheetIfOpen(mp)
}

async function prepareDueReminder(mp, page, plantId, report, assertionPrefix) {
  await openRealPlantSheet(mp, page, plantId)
  await tapCurrent(mp, 'fertilization-reminder-entry-button')
  const setup = await waitForElement(
    await mp.currentPage(),
    'fertilization-reminder-section',
    ELEMENT_WAIT_MS
  )
  assertCondition(report, `${assertionPrefix}存在施肥提醒设置入口`, Boolean(setup))
  await tapCurrent(mp, 'fertilization-reminder-preview-button')
  let currentPage = await mp.currentPage()
  let preview = await waitForElement(currentPage, 'fertilization-reminder-preview', ELEMENT_WAIT_MS)
  assertCondition(report, `${assertionPrefix}首次预览由真实 API 返回`, Boolean(preview))
  await tapCurrent(mp, 'fertilization-reminder-alert-cancel-button')

  const assertedDatePicker = await findViewById(
    await mp.currentPage(),
    'fertilization-reminder-asserted-date-picker'
  )
  if (assertedDatePicker) {
    await assertedDatePicker.trigger('change', { value: ASSERTED_LAST_APPLIED_DATE })
    await sleep(UI_WAIT_MS)
    const recalculateButton = await findViewById(
      await mp.currentPage(),
      'fertilization-reminder-asserted-date-recalculate-button'
    )
    assertCondition(
      report,
      `${assertionPrefix}提供补录日期后的重新计算入口`,
      Boolean(recalculateButton)
    )
    await tapStableElement(recalculateButton)
    const settled = await waitForSettledPreview(mp)
    currentPage = await mp.currentPage()
    preview = settled.preview
    await tapCurrent(mp, 'fertilization-reminder-alert-cancel-button')
  }

  const previewText = await textOf(preview)
  const previewRequest = latestPreviewRequest(await readCapturedRequests(mp), plantId)
  const previewData = previewResponseData(previewRequest)
  assertCondition(
    report,
    `${assertionPrefix}真实 API 返回的提醒日期不早于今天`,
    requestSucceeded(previewRequest) &&
      Boolean(previewData?.nextCheckDate) &&
      Boolean(previewData?.dueNow),
    JSON.stringify(previewData)
  )
  assertCondition(
    report,
    `${assertionPrefix}得到可执行的到期施肥提醒`,
    Boolean(preview) && previewText.includes('下次施肥提醒'),
    previewText
  )
  return { page: currentPage, preview }
}

function requestSucceeded(request) {
  return (
    Number(request?.response?.statusCode) === HTTP_OK &&
    Number(request?.response?.data?.code) === HTTP_OK
  )
}

async function waitForCapturedRequest(mp, predicate, timeoutMs = ELEMENT_WAIT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const requests = await readCapturedRequests(mp)
    const match = requests.find(predicate)
    if (match) {
      return match
    }
    await sleep(UI_WAIT_MS)
  }
  return null
}

async function waitForElementAbsent(mp, id, timeoutMs = ELEMENT_WAIT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await findViewById(await mp.currentPage(), id))) {
      return true
    }
    await sleep(UI_WAIT_MS)
  }
  return false
}

function requestDataForPlant(request, plantId) {
  return Number(request?.data?.plantId) === Number(plantId)
}

function latestPreviewRequest(requests, plantId) {
  return requests
    .filter(
      request =>
        String(request.url || '').includes(PREVIEW_PATH) &&
        String(request.method || '').toUpperCase() === 'POST' &&
        requestDataForPlant(request, plantId)
    )
    .at(LAST_INDEX)
}

function previewResponseData(request) {
  return request?.response?.data?.data || null
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
  let temporaryCompletionPlantId = 0
  let temporarySkipPlantId = 0
  let completionEvidence = false
  let cleanupFailed = false

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
    if (LIVE_QA_PAUSE_PLANT_ID) {
      await verifyRealPausePlant(mp, page, LIVE_QA_PAUSE_PLANT_ID, report, env.artifactDir)
      report.business_assertions_reached = true
      setClassification(report, 'PASS')
      return
    }
    if (!LIVE_QA_COMPLETE_PLANT_ID) {
      temporaryCompletionPlantId = await createTemporaryFertilizationPlant(mp, {
        nickname: 'QA施肥完成'
      })
      page = await refreshIndexAfterPlantMutation(mp, temporaryCompletionPlantId)
    }
    const selectedPlant = await findRealPlantWithFixedInterval(
      mp,
      page,
      report,
      temporaryCompletionPlantId || LIVE_QA_COMPLETE_PLANT_ID
    )
    const livePlantId = selectedPlant.plantId
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
    const reminderEntry = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-entry-button',
      ELEMENT_WAIT_MS
    )
    assertCondition(report, '真实属级月表提供当前月固定周期提醒入口', Boolean(reminderEntry))
    if (reminderEntry) {
      await tapStableElement(reminderEntry)
      await sleep(UI_WAIT_MS)
    }
    const setup = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-section',
      ELEMENT_WAIT_MS
    )
    const setupText = await textOf(setup)
    assertCondition(
      report,
      '真实施肥提醒选项显示液体肥和缓释肥',
      Boolean(setup) && setupText.includes('液体肥') && setupText.includes('缓释肥'),
      setupText
    )
    assertCondition(report, '真实属级月表提供当前月固定周期提醒入口', Boolean(setup))

    const slowReleaseOption = await findViewById(
      await mp.currentPage(),
      'fertilization-reminder-option-slow-release'
    )
    assertCondition(report, '真实页面可选择缓释肥以检查条件问询', Boolean(slowReleaseOption))
    if (slowReleaseOption) {
      await tapStableElement(slowReleaseOption)
      await sleep(UI_WAIT_MS)
      let conditionPreflight = await findViewById(
        await mp.currentPage(),
        'fertilization-reminder-preflight'
      )
      let conditionPreflightText = await textOf(conditionPreflight)
      if (!conditionPreflight) {
        const conditionPreviewButton = await findViewById(
          await mp.currentPage(),
          'fertilization-reminder-preview-button'
        )
        if (conditionPreviewButton && (await readDisabledState(conditionPreviewButton)) === false) {
          await tapStableElement(conditionPreviewButton)
        }
        conditionPreflight = await waitForElement(
          await mp.currentPage(),
          'fertilization-reminder-preflight',
          ELEMENT_WAIT_MS
        )
        conditionPreflightText = await textOf(conditionPreflight)
      }
      if (conditionPreflightText.includes('更换肥料类型')) {
        const typeChangeAcknowledgement = await findViewById(
          await mp.currentPage(),
          'fertilization-reminder-fertilizer-type-change-ack'
        )
        assertCondition(
          report,
          '更换肥料类型时真实页面提供确认控件',
          Boolean(typeChangeAcknowledgement)
        )
        if (typeChangeAcknowledgement) {
          await tapStableElement(typeChangeAcknowledgement)
          await tapCurrent(mp, 'fertilization-reminder-preview-button')
          const conditionDeadline = Date.now() + ELEMENT_WAIT_MS
          while (Date.now() < conditionDeadline) {
            const refreshedPreflight = await findViewById(
              await mp.currentPage(),
              'fertilization-reminder-preflight'
            )
            conditionPreflightText = await textOf(refreshedPreflight)
            if (conditionPreflightText.includes('最近有长新叶或新芽吗？')) {
              break
            }
            await sleep(UI_WAIT_MS)
          }
        }
      }
      assertCondition(
        report,
        '缓释肥条件问询只保留用户无法替代判断的生长状态',
        Boolean(conditionPreflight) &&
          conditionPreflightText.includes('最近有长新叶或新芽吗？') &&
          !conditionPreflightText.includes('目前仍在正常生长吗？') &&
          !conditionPreflightText.includes('花盆或其他容器'),
        conditionPreflightText
      )
      const conditionPreviewButton = await findViewById(
        await mp.currentPage(),
        'fertilization-reminder-preview-button'
      )
      assertCondition(
        report,
        '条件型固定周期继续设置入口可见且需经过条件警示',
        Boolean(conditionPreviewButton) &&
          (await readDisabledState(conditionPreviewButton)) === false,
        await textOf(conditionPreviewButton)
      )
      const growthContinueButton = await findViewById(
        await mp.currentPage(),
        'fertilization-reminder-condition-active_growth-yes'
      )
      if (growthContinueButton) {
        await tapStableElement(growthContinueButton)
        const growthAlert = await waitForElement(
          await mp.currentPage(),
          'fertilization-reminder-alert',
          ELEMENT_WAIT_MS
        )
        const growthAlertText = await textOf(growthAlert)
        assertCondition(
          report,
          '继续设置生长条件前显示暂停默认警示',
          Boolean(growthAlert) && growthAlertText.includes('本月按表默认不安排施肥'),
          growthAlertText
        )
        await tapCurrent(mp, 'fertilization-reminder-alert-cancel-button')
      }
      const liquidOption = await findViewById(
        await mp.currentPage(),
        'fertilization-reminder-option-liquid'
      )
      assertCondition(report, '条件检查后可切回液体肥继续设置', Boolean(liquidOption))
      if (liquidOption) {
        await tapStableElement(liquidOption)
        await sleep(UI_WAIT_MS)
        const liquidPreflight = await findViewById(
          await mp.currentPage(),
          'fertilization-reminder-preflight'
        )
        assertCondition(
          report,
          '固定周期液体肥不额外要求生长条件确认',
          !liquidPreflight,
          await textOf(liquidPreflight)
        )
      }
    }

    const screenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'fertilization-reminder-live-development-setup',
      undefined,
      { maxAttempts: 1, report }
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

    if (LIVE_QA_RULE_ONLY) {
      const requests = await readCapturedRequests(mp)
      recordRequests(report, requests)
      const reminderRead = requests
        .filter(request => String(request.url || '').includes(`${REMINDER_PATH}${livePlantId}`))
        .at(LAST_INDEX)
      assertCondition(
        report,
        '规则专测通过真实提醒接口读取当前月肥料规则',
        requestSucceeded(reminderRead) &&
          Array.isArray(reminderRead?.response?.data?.data?.currentMonthOptions) &&
          reminderRead.response.data.data.currentMonthOptions.length >= 2,
        JSON.stringify(reminderRead?.response?.data?.data || null)
      )
      await closeSheetIfOpen(mp)
      report.business_assertions_reached = true
      setClassification(report, 'PASS')
      return
    }

    await tapCurrent(mp, 'fertilization-reminder-preview-button')
    currentPage = await mp.currentPage()
    const preview = await waitForElement(
      currentPage,
      'fertilization-reminder-preview',
      ELEMENT_WAIT_MS
    )
    previewVisible = Boolean(preview)
    const calculationInfoButton = await findViewById(
      currentPage,
      'fertilization-reminder-alert-info-button'
    )
    const previewText = await textOf(preview)
    // The app-owned Alert is part of the real page tree, so its screenshot and
    // both visible actions are verified through the same runtime surface.
    const alertScreenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'fertilization-reminder-alert',
      undefined,
      { maxAttempts: 1, report }
    )
    recordScreenshot(report, alertScreenshot)
    assertCondition(
      report,
      '首次无历史施肥记录可通过真实 API 生成提醒预览并触发 Alert 流程',
      previewVisible &&
        Boolean(calculationInfoButton) &&
        Boolean(alertScreenshot) &&
        /(首次确认提醒|下次施肥提醒)/u.test(previewText) &&
        !previewText.includes('算法') &&
        !previewText.includes('首次设置'),
      `preview=${previewText}; alertScreenshot=${Boolean(alertScreenshot)}`
    )
    assertCondition(report, 'Alert 触发后的施肥预览页面截图有效', Boolean(alertScreenshot))

    await tapCurrent(mp, 'fertilization-reminder-alert-cancel-button')

    const assertedDateSection = await findViewById(
      await mp.currentPage(),
      'fertilization-reminder-asserted-date-section'
    )
    if (assertedDateSection) {
      const assertedDatePicker = await findViewById(
        await mp.currentPage(),
        'fertilization-reminder-asserted-date-picker'
      )
      assertCondition(report, '首次确认提醒提供补充上次施肥日期入口', Boolean(assertedDatePicker))
      if (assertedDatePicker) {
        await assertedDatePicker.trigger('change', { value: ASSERTED_LAST_APPLIED_DATE })
        await sleep(UI_WAIT_MS)
        const recalculateButton = await findViewById(
          await mp.currentPage(),
          'fertilization-reminder-asserted-date-recalculate-button'
        )
        assertCondition(report, '补充日期后提供重新计算入口', Boolean(recalculateButton))
        if (recalculateButton) {
          await tapStableElement(recalculateButton)
          const settled = await waitForSettledPreview(mp)
          const recalculatedPreview = settled.preview
          await tapCurrent(mp, 'fertilization-reminder-alert-cancel-button')
          assertCondition(
            report,
            '补充上次施肥日期后通过真实 API 重新计算提醒',
            Boolean(recalculatedPreview) && settled.previewText.includes('下次施肥提醒'),
            settled.previewText
          )
        }
      }
    } else {
      recordAssertion(
        report,
        '首次确认提醒提供补充上次施肥日期入口',
        true,
        '当前真实账户已有施肥历史，本次路径不适用'
      )
      recordAssertion(
        report,
        '补充日期后提供重新计算入口',
        true,
        '当前真实账户已有施肥历史，本次路径不适用'
      )
      recordAssertion(
        report,
        '补充上次施肥日期后通过真实 API 重新计算提醒',
        true,
        '当前真实账户已有施肥历史，本次路径不适用'
      )
    }

    await tapCurrent(mp, 'fertilization-reminder-alert-info-button')
    const reopenedAlertScreenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'fertilization-reminder-alert-reopened',
      undefined,
      { maxAttempts: 1, report }
    )
    recordScreenshot(report, reopenedAlertScreenshot)
    assertCondition(
      report,
      '点击提醒信息 icon 后重新触发施肥提醒 Alert 流程',
      Boolean(reopenedAlertScreenshot)
    )
    await tapCurrent(mp, 'fertilization-reminder-alert-confirm-button')
    const savedAfterConfirm = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-saved-state',
      ELEMENT_WAIT_MS
    )
    assertCondition(report, '真实页面保存到期施肥提醒后显示已设置状态', Boolean(savedAfterConfirm))
    const savedScroll = await scrollFertilizationSheetToActions(mp)
    assertCondition(
      report,
      '保存提醒后今天已施肥操作区在可见范围或已滚动到操作区',
      !savedScroll.isScrollable || savedScroll.scrollTop > ZERO,
      JSON.stringify(savedScroll)
    )
    const savedStateScreenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'fertilization-reminder-live-development-saved-state',
      undefined,
      { maxAttempts: 1, report }
    )
    recordScreenshot(report, savedStateScreenshot)
    assertCondition(report, '保存提醒后的施肥操作区截图有效', Boolean(savedStateScreenshot))
    previewVisible = false

    const completeButton = await findViewById(
      await mp.currentPage(),
      'fertilization-reminder-complete-button'
    )
    assertCondition(report, '到期真实页面显示今天已施肥操作', Boolean(completeButton))
    const completeButtonDisabled = await readDisabledState(completeButton)
    recordAssertion(
      report,
      '今天已施肥按钮在当前无附加确认时可提交',
      completeButtonDisabled === false,
      JSON.stringify({
        disabled: completeButtonDisabled,
        tagName: completeButton?.tagName || null,
        text: await textOf(completeButton)
      })
    )
    await tapStableElement(completeButton)
    const completeRequest = await waitForCapturedRequest(
      mp,
      request =>
        String(request.url || '').includes(
          'plant-user-http/user-plants/fertilization-reminders/complete'
        ) &&
        String(request.method || '').toUpperCase() === 'POST' &&
        requestDataForPlant(request, livePlantId) &&
        requestSucceeded(request)
    )
    assertCondition(
      report,
      '点击今天已施肥后真实 API 写入当天施肥记录',
      Boolean(completeRequest),
      JSON.stringify(completeRequest?.response || null)
    )
    completionEvidence = true
    const completeResponseData = completeRequest?.response?.data?.data || null
    assertCondition(
      report,
      '今天已施肥响应返回下一次提醒预览',
      Boolean(completeResponseData?.nextPreview?.planId),
      JSON.stringify(completeResponseData)
    )
    const nextPreview = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-preview',
      ELEMENT_WAIT_MS
    )
    assertCondition(
      report,
      '今天已施肥后真实页面生成下一次待确认预览',
      Boolean(nextPreview),
      await textOf(nextPreview)
    )
    previewVisible = Boolean(nextPreview)
    await tapCurrent(mp, 'fertilization-reminder-cancel-button')
    previewVisible = false

    const close = await findViewById(
      await mp.currentPage(),
      'plant-card-fertilization-close-button'
    )
    if (close) {
      await tapStableElement(close)
      await sleep(UI_WAIT_MS)
    }

    page = await mp.currentPage()
    if (!LIVE_QA_SKIP_PLANT_ID) {
      temporarySkipPlantId = await createTemporaryFertilizationPlant(mp, {
        nickname: 'QA施肥跳过'
      })
      page = await refreshIndexAfterPlantMutation(mp, temporarySkipPlantId)
    }
    const skipCandidate = await findRealPlantWithFixedInterval(
      mp,
      page,
      report,
      temporarySkipPlantId || LIVE_QA_SKIP_PLANT_ID,
      [livePlantId],
      '第二株真实植物存在可设置施肥提醒的入口'
    )
    const skipPlantId = skipCandidate.plantId
    await closeSheetIfOpen(mp)
    await openRealPlantSheet(mp, await mp.currentPage(), skipPlantId)
    await tapCurrent(mp, 'fertilization-reminder-entry-button')
    const skipSetup = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-section',
      ELEMENT_WAIT_MS
    )
    assertCondition(report, '第二株真实植物存在施肥提醒设置入口', Boolean(skipSetup))
    await prepareDueReminder(mp, await mp.currentPage(), skipPlantId, report, '跳过路径')
    await tapCurrent(mp, 'fertilization-reminder-alert-info-button')
    await tapCurrent(mp, 'fertilization-reminder-alert-confirm-button')
    const savedBeforeDismiss = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-saved-state',
      ELEMENT_WAIT_MS
    )
    assertCondition(report, '本次跳过路径真实页面显示已设置状态', Boolean(savedBeforeDismiss))
    const skipSavedScroll = await scrollFertilizationSheetToActions(mp)
    assertCondition(
      report,
      '跳过路径操作区在可见范围或已滚动到操作区',
      !skipSavedScroll.isScrollable || skipSavedScroll.scrollTop > ZERO,
      JSON.stringify(skipSavedScroll)
    )
    const skipButton = await findViewById(
      await mp.currentPage(),
      'fertilization-reminder-dismiss-button'
    )
    assertCondition(report, '到期真实页面显示本次跳过操作', Boolean(skipButton))
    // 先向当前渲染节点派发真实 tap，避免滚动容器内 Element.tap 在 DevTools
    // 偶发悬挂；若事件未到达，再回退到物理点击。
    await Promise.race([
      skipButton.trigger('tap', {}),
      sleep(ELEMENT_TAP_FALLBACK_TIMEOUT_MS)
    ])
    let dismissRequest = await waitForCapturedRequest(
      mp,
      request =>
        String(request.url || '').includes(
          'plant-user-http/user-plants/fertilization-reminders/dismiss'
        ) &&
        String(request.method || '').toUpperCase() === 'POST' &&
        Number(request.data?.plantId) === Number(skipPlantId) &&
        requestSucceeded(request),
      DISMISS_REQUEST_WAIT_MS
    )
    if (!dismissRequest) {
      await Promise.race([
        tapStableElement(skipButton),
        sleep(ELEMENT_TAP_FALLBACK_TIMEOUT_MS)
      ])
      dismissRequest = await waitForCapturedRequest(
        mp,
        request =>
          String(request.url || '').includes(
            'plant-user-http/user-plants/fertilization-reminders/dismiss'
          ) &&
          String(request.method || '').toUpperCase() === 'POST' &&
          Number(request.data?.plantId) === Number(skipPlantId) &&
          requestSucceeded(request),
        DISMISS_REQUEST_WAIT_MS
      )
    }
    assertCondition(
      report,
      '本次跳过通过真实 API 结束提醒',
      Boolean(dismissRequest),
      JSON.stringify(dismissRequest?.response || null)
    )
    const setupAfterSkip = await waitForElement(
      await mp.currentPage(),
      'fertilization-reminder-entry-button',
      ELEMENT_WAIT_MS
    )
    const savedAfterSkip = await waitForElementAbsent(
      mp,
      'fertilization-reminder-saved-state',
      ELEMENT_WAIT_MS
    )
    assertCondition(
      report,
      '本次跳过后真实页面回到施肥表入口',
      Boolean(setupAfterSkip) && savedAfterSkip
    )

    const skipClose = await findViewById(
      await mp.currentPage(),
      'plant-card-fertilization-close-button'
    )
    if (skipClose) {
      await tapStableElement(skipClose)
      await sleep(UI_WAIT_MS)
    }

    const requests = await readCapturedRequests(mp)
    recordRequests(report, requests)
    const previewRequest = findRequestByUrl(requests, PREVIEW_PATH, 'POST')
    const cancelRequest = findRequestByUrl(requests, CANCEL_PATH, 'POST')
    const completedRequest = requests.find(
      request =>
        String(request.url || '').includes(
          'plant-user-http/user-plants/fertilization-reminders/complete'
        ) &&
        String(request.method || '').toUpperCase() === 'POST' &&
        requestDataForPlant(request, livePlantId)
    )
    const capturedDismissRequest = requests.find(
      request =>
        String(request.url || '').includes(
          'plant-user-http/user-plants/fertilization-reminders/dismiss'
        ) &&
        String(request.method || '').toUpperCase() === 'POST' &&
        Number(request.data?.plantId) === Number(skipPlantId)
    )
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
    assertCondition(
      report,
      '小程序运行时真实调用 complete API 并收到 200',
      requestSucceeded(completedRequest),
      JSON.stringify(completedRequest?.response || null)
    )
    assertCondition(
      report,
      '小程序运行时真实调用 dismiss API 并收到 200',
      requestSucceeded(capturedDismissRequest),
      JSON.stringify(capturedDismissRequest?.response || null)
    )
    const latestReminderRead = reminderReads.at(LAST_INDEX)
    assertCondition(
      report,
      '完成后通过真实 GET 读回下一次 active 提醒',
      reminderReads.length >= MIN_REMINDER_READS &&
        requestSucceeded(latestReminderRead) &&
        latestReminderRead?.response?.data?.data?.active === true &&
        Boolean(latestReminderRead?.response?.data?.data?.nextCheckDate),
      JSON.stringify(latestReminderRead?.response || null)
    )
    const skipReminderReads = requests.filter(request =>
      String(request.url || '').includes(`${REMINDER_PATH}${skipPlantId}`)
    )
    const latestSkipReminderRead = skipReminderReads.at(LAST_INDEX)
    assertCondition(
      report,
      '跳过后通过真实 GET 读回无 active 状态',
      skipReminderReads.length >= MIN_REMINDER_READS &&
        requestSucceeded(latestSkipReminderRead) &&
        latestSkipReminderRead?.response?.data?.data?.active === false,
      JSON.stringify(latestSkipReminderRead?.response || null)
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
    if (mp && temporarySkipPlantId) {
      try {
        await cleanupTemporaryFertilizationPlant(mp, temporarySkipPlantId)
      } catch (error) {
        cleanupFailed = true
        recordAssertion(
          report,
          '临时跳过植物通过真实接口清理',
          false,
          String(error?.message || error)
        )
      }
    }
    if (mp && temporaryCompletionPlantId && !completionEvidence) {
      try {
        await cleanupTemporaryFertilizationPlant(mp, temporaryCompletionPlantId)
      } catch (error) {
        cleanupFailed = true
        recordAssertion(
          report,
          '临时完成植物通过真实接口清理',
          false,
          String(error?.message || error)
        )
      }
    }
    if (cleanupFailed && report.classification === 'PASS') {
      // setClassification(PASS) performs the canonical failed-assertion
      // downgrade to FAIL_PRODUCT. Never let a cleanup assertion be hidden by
      // the business-path PASS recorded before finally.
      setClassification(report, 'PASS', 'QA 临时数据未能通过真实接口清理')
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
