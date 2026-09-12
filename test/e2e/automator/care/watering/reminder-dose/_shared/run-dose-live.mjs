'use strict'

/* oxlint-disable no-console -- formal live leaf emits a machine-readable report. */

import path from 'node:path'
import automator from 'miniprogram-automator'
import { handoffFormalLeafScreenshot } from '../../../../_shared/formal-leaf-harness.mjs'
import {
  connectAutomator,
  AutomatorConnectError,
  reLaunchTo,
  safeDisconnect
} from '../../transpiration-v3/_shared/lib/automator-client.mjs'
import {
  createReport,
  emitLeafReport,
  markBusinessAssertionsReached,
  recordAssertion,
  recordPage,
  recordPageData,
  recordRequests,
  recordScreenshot,
  recordScreenshotAttempts,
  saveReport,
  setClassification
} from '../../transpiration-v3/_shared/lib/reporter.mjs'
import {
  clearCapturedRequests,
  findRequestByUrl,
  installRequestCapture,
  readCapturedRequests,
  restoreRequest
} from '../../transpiration-v3/_shared/lib/request-capture.mjs'
import {
  findViewById,
  waitForElement
} from '../../transpiration-v3/_shared/lib/element-helpers.mjs'
import {
  resolveEnv,
  resolveGitBranch,
  resolveGitHead,
  resolvePrBaseHead,
  timestampForFilename
} from '../../transpiration-v3/_shared/lib/env.mjs'
import { preflightProject } from '../../transpiration-v3/_shared/lib/project-check.mjs'

const INDEX_PAGE = '/pages/index/index'
const PLANNER_API = '/user-plants/watering-planner'
const INPUT_STEPPER_ID = 'watering-reminder-input-stepper'
const INPUT_NEXT_BUTTON_ID = 'watering-reminder-input-next-button'
const INPUT_POT_STEP_ID = 'watering-reminder-input-step-pot'
const ELEMENT_WAIT_MS = 10_000

const VARIANTS = new Set([
  'bottle_text',
  'dose_dynamic',
  'dose_label_layout',
  'unit_alignment_final',
  'unit_alignment_v4'
])

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function textOf(element) {
  try {
    return String((await element?.text()) || '').trim()
  } catch {
    return ''
  }
}

async function collectTexts(page) {
  const result = []
  for (const element of await page.$$('text')) {
    const text = await textOf(element)
    if (text) {
      result.push(text)
    }
  }
  return result
}

async function findWaterEntry(page) {
  for (const button of await page.$$('button')) {
    const id = String((await button.attribute('id')) || '')
    if (/plant-card-reminder-\d+-water/u.test(id)) {
      return { button, id, plantId: id.match(/plant-card-reminder-(\d+)-water/u)?.[1] || null }
    }
  }
  return null
}

async function findDateCell(page) {
  for (const view of await page.$$('view')) {
    const id = String((await view.attribute('id')) || '')
    if (id.includes('care-behavior-date')) {
      return view
    }
  }
  return null
}

function extractWeatherWindow(request = {}) {
  const responseData = request?.response?.data
  if (!responseData || typeof responseData !== 'object') {
    return null
  }
  const candidates = [responseData?.data?.data, responseData?.data, responseData]
  return (
    candidates.find(
      value =>
        value &&
        typeof value === 'object' &&
        (Array.isArray(value.historicalDays) || Array.isArray(value.historical_days))
    ) || null
  )
}

async function waitForWeatherRequest(mp, timeoutMs = ELEMENT_WAIT_MS) {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const requests = await readCapturedRequests(mp)
    const request = findRequestByUrl(requests, 'weather-http/weather/environment-context', 'POST')
    if (request) {
      return request
    }
    await sleep(250)
  }
  return null
}

function extractDoseUnits(texts) {
  const doseTexts = texts.filter(text => /约\s*\d+(?:\.\d+)?\s*(?:瓶|桶)/u.test(text))
  const units = [
    ...new Set(doseTexts.flatMap(text => [...text.matchAll(/(瓶|桶)/gu)].map(match => match[1])))
  ]
  return { doseTexts, units }
}

function extractReferenceUnit(texts) {
  const referenceText = texts.find(text => /参照/u.test(text)) || ''
  if (/油桶|桶/u.test(referenceText)) {
    return '桶'
  }
  if (/瓶/u.test(referenceText)) {
    return '瓶'
  }
  return null
}

function extractResultUnit(texts) {
  const resultText = texts.find(text => /建议水量/u.test(text))
  const resultIndex = resultText ? texts.indexOf(resultText) : -1
  const nearby = resultIndex >= 0 ? texts.slice(resultIndex, resultIndex + 8) : texts
  const match = nearby.join(' ').match(/约\s*\d+(?:\.\d+)?\s*(瓶|桶)/u)
  return match?.[1] || null
}

function isLikelyFixtureMissing(error) {
  return /未找到.*plant-card-reminder|没有.*植物|没有.*浇水|fixture|plantId/u.test(
    String(error?.message || error)
  )
}

export async function runDoseLive({ variant }) {
  if (!VARIANTS.has(variant)) {
    throw new Error(`unknown dose variant: ${variant}`)
  }
  const env = resolveEnv()
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: `reminder-dose-${variant}`,
    wsEndpoint: env.wsEndpoint
  })
  let mp = null

  try {
    const projectCheck = preflightProject(env.projectPath)
    if (!projectCheck.ok) {
      setClassification(report, 'BLOCKED_ENV', projectCheck.reason)
      return report
    }
    try {
      mp = await connectAutomator(env.wsEndpoint)
    } catch (error) {
      const reason =
        error instanceof AutomatorConnectError ? error.reason : String(error?.message || error)
      setClassification(report, 'BLOCKED_ENV', `automator connect failed: ${reason}`)
      return report
    }

    await installRequestCapture(mp)
    await clearCapturedRequests(mp)
    let page = await reLaunchTo(mp, INDEX_PAGE)
    recordPage(report, INDEX_PAGE)
    await sleep(1_500)

    const entry = await findWaterEntry(page)
    recordAssertion(report, '浇水提醒入口可触达', Boolean(entry), entry?.id || 'no watering entry')
    if (!entry) {
      setClassification(report, 'BLOCKED_FIXTURE', '未找到任何 plant-card-reminder-{id}-water 入口')
      return report
    }
    await entry.button.tap()
    await sleep(700)
    page = await mp.currentPage()
    const reminderRow = await waitForElement(
      page,
      'watering-reminder-last-watering-row',
      ELEMENT_WAIT_MS
    )
    recordAssertion(report, '浇水提醒弹框可打开', Boolean(reminderRow), entry.id)
    if (!reminderRow) {
      setClassification(report, 'FAIL_PRODUCT', '浇水提醒入口打开后未找到过往浇水日期行')
      return report
    }

    await reminderRow.tap()
    await sleep(700)
    page = await mp.currentPage()
    const inputStepper = await waitForElement(page, INPUT_STEPPER_ID, ELEMENT_WAIT_MS)
    recordAssertion(report, '过往浇水日期步骤可打开', Boolean(inputStepper))
    const dateCell = await findDateCell(page)
    recordAssertion(report, '历史浇水日期格可选择', Boolean(dateCell))
    if (!inputStepper || !dateCell) {
      setClassification(report, 'FAIL_PRODUCT', '过往浇水步骤或历史日期格不可用')
      return report
    }

    // 天气窗口必须是真实接口返回，且当前天气只能按响应中的诊断日期落格；
    // 若 D0 缓存缺失，页面必须明确提示，而不能把旧日期冒充今天。
    const weatherRequest = await waitForWeatherRequest(mp)
    const weatherWindow = extractWeatherWindow(weatherRequest)
    const diagnosisDate = String(
      weatherWindow?.meta?.diagnosisDate || weatherWindow?.diagnosisDate || ''
    ).slice(0, 10)
    const currentWeather = weatherWindow?.currentWeather
    const currentWeatherDate = String(
      currentWeather?.weatherDate ||
        currentWeather?.weather_date ||
        currentWeather?.obsTime ||
        currentWeather?.observedAt ||
        currentWeather?.updatedAt ||
        ''
    ).slice(0, 10)
    const pageTextsBeforeDateTap = await collectTexts(page)
    const hasWeatherDegradedNotice = pageTextsBeforeDateTap.some(text =>
      /天气记录暂未准备好|天气记录缺失|暂时无法获取天气|日期仍可继续填写/u.test(text)
    )
    recordPageData(report, 'watering-weather-window', {
      status_code: weatherRequest?.response?.statusCode || null,
      diagnosis_date: diagnosisDate,
      current_weather_date: currentWeatherDate,
      today_weather_source:
        weatherWindow?.todayWeatherSource || weatherWindow?.meta?.todaySource || null,
      historical_days: Array.isArray(weatherWindow?.historicalDays)
        ? weatherWindow.historicalDays.length
        : Array.isArray(weatherWindow?.historical_days)
          ? weatherWindow.historical_days.length
          : 0,
      degraded_notice_visible: hasWeatherDegradedNotice
    })
    recordAssertion(
      report,
      '浇水日历使用真实天气窗口请求',
      Boolean(
        weatherRequest && Number(weatherRequest?.response?.statusCode || 0) === 200 && weatherWindow
      ),
      weatherRequest
        ? `status=${weatherRequest?.response?.statusCode || 'unknown'}`
        : '未捕获 weather/environment-context 请求'
    )
    recordAssertion(
      report,
      '浇水日历当天天气按日期安全显示或明确降级',
      Boolean(
        (diagnosisDate && currentWeatherDate === diagnosisDate) ||
        (!currentWeather && hasWeatherDegradedNotice)
      ),
      `diagnosis=${diagnosisDate || 'none'}, current=${currentWeatherDate || 'none'}, degraded=${hasWeatherDegradedNotice}`
    )
    await dateCell.tap()
    await sleep(500)

    const doseTextsBeforeConfirm = await collectTexts(page)
    const doseEvidence = extractDoseUnits(doseTextsBeforeConfirm)
    const doseUnit =
      extractReferenceUnit(doseTextsBeforeConfirm) ||
      (doseEvidence.units.length === 1 ? doseEvidence.units[0] : null)
    recordPageData(report, 'dose-options', {
      plant_id: entry.plantId,
      texts: doseEvidence.doseTexts,
      units: doseEvidence.units,
      reference_unit: doseUnit
    })
    recordAssertion(
      report,
      '浇水剂量选项文案存在',
      doseEvidence.doseTexts.length > 0,
      doseEvidence.doseTexts.join(' | ')
    )
    recordAssertion(
      report,
      '浇水剂量单位为瓶或桶',
      doseEvidence.units.length > 0 &&
        doseEvidence.units.every(unit => ['瓶', '桶'].includes(unit)),
      doseEvidence.units.join(',')
    )
    recordAssertion(
      report,
      '大盆剂量档位按盆体积动态生成',
      doseEvidence.doseTexts.length >= 2,
      `dose_count=${doseEvidence.doseTexts.length}`
    )
    recordAssertion(report, '历史浇水剂量列表可见', doseEvidence.doseTexts.length > 0)

    const doseScreenshot = await handoffFormalLeafScreenshot({
      mp,
      automator,
      wsEndpoint: env.wsEndpoint,
      outputPath: path.join(env.artifactDir, `dose-${variant}-options.png`),
      projectPath: env.projectPath,
      expectedRoute: INDEX_PAGE.slice(1),
      maxAttempts: 1
    })
    mp = doseScreenshot.mp
    recordScreenshotAttempts(report, 'dose-options', doseScreenshot.attempts)
    recordScreenshot(report, doseScreenshot.output_path)
    recordAssertion(report, '剂量列表截图成功保存', Boolean(doseScreenshot.output_path))
    page = await mp.currentPage()

    const nextButton = await findViewById(page, INPUT_NEXT_BUTTON_ID)
    recordAssertion(report, '过往浇水步骤下一步按钮可触达', Boolean(nextButton))
    if (!nextButton) {
      setClassification(report, 'FAIL_PRODUCT', '过往浇水步骤缺少下一步按钮')
      return report
    }
    await clearCapturedRequests(mp)
    await nextButton.tap()
    await sleep(700)
    page = await mp.currentPage()
    const potStep = await waitForElement(page, INPUT_POT_STEP_ID, ELEMENT_WAIT_MS)
    recordAssertion(report, '盆型设置步骤可打开', Boolean(potStep))
    const potNextButton = await findViewById(page, INPUT_NEXT_BUTTON_ID)
    recordAssertion(report, '盆型设置步骤下一步按钮可触达', Boolean(potNextButton))
    if (!potStep || !potNextButton) {
      setClassification(report, 'FAIL_PRODUCT', '盆型设置步骤不可用')
      return report
    }
    await potNextButton.tap()
    await sleep(3_000)
    page = await mp.currentPage()
    const requests = await readCapturedRequests(mp)
    recordRequests(report, requests)
    const plannerRequest = findRequestByUrl(requests, PLANNER_API, 'POST')
    recordAssertion(report, '真实浇水规划请求已发出', Boolean(plannerRequest))
    if (!plannerRequest) {
      setClassification(report, 'FAIL_PRODUCT', '未捕获到真实浇水规划请求')
      return report
    }
    markBusinessAssertionsReached(report)
    const plannerWateringEvents = plannerRequest?.data?.wateringEvents
    if (
      doseEvidence.doseTexts.length === 0 &&
      Array.isArray(plannerWateringEvents) &&
      plannerWateringEvents.length === 0
    ) {
      recordPageData(report, 'dose-fixture-precondition', {
        plant_id: entry.plantId,
        watering_events_count: plannerWateringEvents.length,
        required: '至少一条历史浇水记录'
      })
      recordAssertion(
        report,
        '浇水剂量测试数据具备历史记录前置条件',
        false,
        '真实植物没有历史浇水记录，无法验证剂量选项'
      )
      setClassification(
        report,
        'BLOCKED_FIXTURE',
        '真实植物没有历史浇水记录，剂量列表不应出现；请提供满足叶子前置条件的测试植物'
      )
      return report
    }
    const resultTexts = await collectTexts(page)
    const resultUnit = extractResultUnit(resultTexts)
    recordPageData(report, 'planner-result', {
      result_unit: resultUnit,
      texts: resultTexts.slice(-30)
    })
    recordAssertion(
      report,
      '大盆浇水剂量结果存在',
      resultUnit !== null,
      resultUnit || 'result unit missing'
    )
    recordAssertion(report, '剂量滑块单位存在', doseUnit !== null, doseUnit || 'dose unit missing')
    recordAssertion(
      report,
      '建议水量与剂量滑块单位一致',
      Boolean(resultUnit) && Boolean(doseUnit) && resultUnit === doseUnit,
      `result=${resultUnit || 'none'}, dose=${doseUnit || 'none'}`
    )
    const resultScreenshot = await handoffFormalLeafScreenshot({
      mp,
      automator,
      wsEndpoint: env.wsEndpoint,
      outputPath: path.join(env.artifactDir, `dose-${variant}-result.png`),
      projectPath: env.projectPath,
      expectedRoute: INDEX_PAGE.slice(1),
      maxAttempts: 1
    })
    mp = resultScreenshot.mp
    recordScreenshotAttempts(report, 'dose-result', resultScreenshot.attempts)
    recordScreenshot(report, resultScreenshot.output_path)
    recordAssertion(report, '浇水规划结果截图成功保存', Boolean(resultScreenshot.output_path))
    markBusinessAssertionsReached(report)
    setClassification(
      report,
      report.assertions.some(assertion => !assertion.passed) ? 'FAIL_PRODUCT' : 'PASS'
    )
    return report
  } catch (error) {
    setClassification(
      report,
      isLikelyFixtureMissing(error) ? 'BLOCKED_FIXTURE' : 'BLOCKED_ENV',
      String(error?.message || error)
    )
    return report
  } finally {
    await restoreRequest(mp).catch(() => {})
    await safeDisconnect(mp)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `reminder-dose-${variant}-${timestampForFilename()}`
    )
    report.report_path = reportPath
    emitLeafReport(report)
    if (report.classification !== 'PASS') {
      process.exitCode = report.classification === 'FAIL_PRODUCT' ? 1 : 2
    }
  }
}
