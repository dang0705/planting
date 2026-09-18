#!/usr/bin/env node
/**
 * 用户植物浇水提醒：通过真实 UI 拖拽盆型并查询建议后，盆型必须先关联到该用户植物。
 *
 * 这不是组件诊断：只走首页卡片入口、真实 wx.request、真实 QA 登录态与测试账户数据。
 * 唯一持久化动作是测试账户植物的盆型 PATCH；不保存浇水提醒、不添加系统日历。
 */
import {
  resolveEnv,
  resolveGitHead,
  resolveGitBranch,
  resolvePrBaseHead,
  timestampForFilename
} from '../transpiration-v3/_shared/lib/env.mjs'
import {
  connectAutomator,
  AutomatorConnectError,
  reLaunchTo,
  safeDisconnect
} from '../transpiration-v3/_shared/lib/automator-client.mjs'
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
} from '../transpiration-v3/_shared/lib/reporter.mjs'
import { preflightProject } from '../transpiration-v3/_shared/lib/project-check.mjs'
import {
  clearCapturedRequests,
  installRequestCapture,
  readCapturedRequests,
  restoreRequest
} from '../transpiration-v3/_shared/lib/request-capture.mjs'
import { safeScreenshot } from '../transpiration-v3/_shared/lib/screenshot.mjs'
import {
  collectWateringEntries,
  closeWateringSheet,
  triggerPlannerNoSideEffect
} from '../transpiration-v3/_shared/lib/planner-trigger.mjs'
import {
  collectByIdPrefix,
  findViewById,
  readPageDataSummary,
  tapStableElement,
  waitForElement
} from '../transpiration-v3/_shared/lib/element-helpers.mjs'

const INDEX_PAGE = '/pages/index/index'
const RESULT_AMOUNT_ID = 'watering-reminder-result-amount'
const WATERING_SHEET_ID = 'watering-reminder-sheet'
const INPUT_STEPPER_ID = 'watering-reminder-input-stepper'
const INPUT_NEXT_BUTTON_ID = 'watering-reminder-input-next-button'
const INPUT_POT_STEP_ID = 'watering-reminder-input-step-pot'
const HISTORY_DATE_PREFIX = 'watering-reminder-input-history-care-behavior-date-'
const POT_TOP_HANDLE_ID = 'watering-reminder-input-pot-profile-top-handle'
const POT_BOTTOM_HANDLE_ID = 'watering-reminder-input-pot-profile-bottom-handle'
const DAILY_DIAGNOSTIC_MODE = process.env.WATERING_POT_PROFILE_DAILY_DIAGNOSTIC === '1'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function responseData(request) {
  const outer = request?.response?.data
  return outer?.data && typeof outer.data === 'object' ? outer.data : outer
}

function responseBusinessCode(request) {
  const outer = request?.response?.data
  return Number(outer?.code ?? outer?.data?.code ?? request?.response?.statusCode ?? 0)
}

function isPositiveDimension(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0
}

function isSavedPotProfileRequest(request, plantId) {
  const body = request?.data || {}
  return (
    Number(body.id) === Number(plantId) &&
    isPositiveDimension(body.potTopDiameterCm) &&
    isPositiveDimension(body.potBottomDiameterCm) &&
    isPositiveDimension(body.potHeightCm)
  )
}

function hasMatchingPotProfile(potProfile, requestBody) {
  return (
    potProfile &&
    Number(potProfile.potTopDiameterCm) === Number(requestBody.potTopDiameterCm) &&
    Number(potProfile.potBottomDiameterCm) === Number(requestBody.potBottomDiameterCm) &&
    Number(potProfile.potHeightCm) === Number(requestBody.potHeightCm) &&
    String(potProfile.hasDrainageHole || 'unknown') ===
      String(requestBody.hasDrainageHole || 'unknown')
  )
}

function hasVisibleAmountRange(planner) {
  const range = planner?.amountRangeMl
  return (
    Array.isArray(range) &&
    range.length === 2 &&
    Number.isFinite(Number(range[0])) &&
    Number.isFinite(Number(range[1])) &&
    Number(range[1]) > 0 &&
    Number(range[1]) >= Number(range[0])
  )
}

function isDisabledValue(value) {
  return value === true || value === 1 || String(value).trim().toLowerCase() === 'true'
}

async function isDisabled(element) {
  try {
    return isDisabledValue(await element.property('disabled'))
  } catch {
    return isDisabledValue(await element.attribute('disabled'))
  }
}

async function chooseRequiredWateringDate(page) {
  const dateCells = await collectByIdPrefix(page, HISTORY_DATE_PREFIX)
  for (const cell of dateCells) {
    const className = String((await cell.element.attribute('class').catch(() => '')) || '')
    if (
      className.includes('care-behavior-cell--selectable') &&
      !className.includes('care-behavior-cell--selected')
    ) {
      await tapStableElement(cell.element)
      return cell.stableId
    }
  }
  return ''
}

async function reopenToPotStep(page) {
  const stepper = await waitForElement(page, INPUT_STEPPER_ID, 5000)
  if (!stepper) {
    return { opened: false, reason: 'input_stepper_not_opened' }
  }
  const nextButton = await waitForElement(page, INPUT_NEXT_BUTTON_ID, 5000)
  if (!nextButton) {
    return { opened: false, reason: 'history_next_button_not_found' }
  }
  let selectedDate = ''
  if (await isDisabled(nextButton)) {
    selectedDate = await chooseRequiredWateringDate(page)
    await sleep(400)
  }
  if (await isDisabled(nextButton)) {
    return { opened: false, reason: 'required_history_remains_unselected', selectedDate }
  }
  await tapStableElement(nextButton)
  const potStep = await waitForElement(page, INPUT_POT_STEP_ID, 5000)
  return { opened: Boolean(potStep), selectedDate }
}

async function openReminder(page, plantId) {
  const entry = await findViewById(page, `plant-card-reminder-${plantId}-water`)
  if (!entry) {
    return false
  }
  await tapStableElement(entry)
  return Boolean(await waitForElement(page, WATERING_SHEET_ID, 5000))
}

async function runPersistenceScenario(mp, report, artifactDir) {
  await installRequestCapture(mp)
  await clearCapturedRequests(mp)

  recordPage(report, INDEX_PAGE)
  let page = await reLaunchTo(mp, INDEX_PAGE)
  // 同一路由重开不会自动关闭 BottomSheet；先清掉遗留的日常调试面板，
  // 确保后续一定从首页卡片入口进入。
  await closeWateringSheet(page)
  await sleep(500)
  page = await mp.currentPage()
  await sleep(1800)
  recordPageData(report, INDEX_PAGE, await readPageDataSummary(mp))

  const entries = await collectWateringEntries(page)
  recordAssertion(
    report,
    '运行时找到至少一个公开 plant-card-reminder-{id}-water 入口',
    entries.length > 0,
    `found=${entries.map(entry => entry.plantId).join(',')}`
  )
  if (!entries.length) {
    setClassification(report, 'BLOCKED_FIXTURE', '测试账户没有可用的用户植物浇水提醒入口')
    return
  }

  const attempts = []
  let matched = null
  for (const entry of entries) {
    await clearCapturedRequests(mp)
    page = await mp.currentPage()
    const result = await triggerPlannerNoSideEffect(mp, page, entry.plantId, {
      ensurePotProfileByDrag: true,
      closeAfter: false,
      waitForRequest: async (runtime, timeoutMs) => {
        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
          const requests = await readCapturedRequests(runtime)
          const planner = requests.find(
            request =>
              request.url?.includes('/user-plants/watering-planner') &&
              String(request.method).toUpperCase() === 'POST'
          )
          if (planner) {
            return planner
          }
          await sleep(300)
        }
        return null
      },
      readRequests: readCapturedRequests
    })
    const requests = await readCapturedRequests(mp)
    const patch = result.potProfileSaveRequests.find(request =>
      isSavedPotProfileRequest(request, entry.plantId)
    )
    attempts.push({
      plantId: entry.plantId,
      dragComplete: result.potProfileInteraction?.complete === true,
      patchCaptured: Boolean(patch),
      plannerCaptured: Boolean(result.plannerRequest),
      triggerChain: result.triggerChain
    })
    if (patch && result.plannerRequest) {
      matched = { entry, result, requests, patch }
      break
    }
    await closeWateringSheet(await mp.currentPage())
    await sleep(500)
  }

  recordPageData(report, 'persistence-attempts', attempts)
  if (!matched) {
    setClassification(
      report,
      'BLOCKED_FIXTURE',
      '没有可完成“拖拽盆型 → 保存 → 查询建议”的测试账户植物；详见 persistence-attempts'
    )
    return
  }

  const { entry, result, requests, patch } = matched
  const patchBody = patch.data || {}
  const patchProfile = responseData(patch)?.potProfile || null
  const planner = result.plannerRequest
  const plannerData = responseData(planner)
  recordRequests(report, requests)
  markBusinessAssertionsReached(report)

  recordAssertion(
    report,
    '盆口和盆底节点都通过真实 touch 拖拽发生位移',
    result.potProfileInteraction?.complete === true,
    JSON.stringify(result.potProfileInteraction?.handles || [])
  )
  recordAssertion(
    report,
    '查看建议前捕获当前用户植物的盆型 PATCH',
    isSavedPotProfileRequest(patch, entry.plantId),
    `plantId=${entry.plantId}, body=${JSON.stringify(patchBody)}`
  )
  recordAssertion(
    report,
    '盆型 PATCH 返回 200 业务成功',
    patch.response?.statusCode === 200 && responseBusinessCode(patch) === 200,
    `http=${patch.response?.statusCode}, code=${responseBusinessCode(patch)}`
  )
  recordAssertion(
    report,
    'PATCH 返回的用户植物已回显相同盆型',
    hasMatchingPotProfile(patchProfile, patchBody),
    `returned=${JSON.stringify(patchProfile)}`
  )
  recordAssertion(
    report,
    '盆型 PATCH 在 watering-planner 请求之前完成',
    Number(patch.time) <= Number(planner.time),
    `patch=${patch.time}, planner=${planner.time}`
  )
  recordAssertion(
    report,
    '我的植物 planner 请求不携带临时 potProfile 覆盖',
    !Object.hasOwn(planner.data || {}, 'potProfile'),
    `plannerBody=${JSON.stringify(planner.data || {})}`
  )
  recordAssertion(
    report,
    '保存后的 planner 返回可用浇水量范围',
    planner.response?.statusCode === 200 && hasVisibleAmountRange(plannerData),
    `http=${planner.response?.statusCode}, amountRangeMl=${JSON.stringify(plannerData?.amountRangeMl)}`
  )

  const amountElement = await waitForElement(await mp.currentPage(), RESULT_AMOUNT_ID, 5000)
  const amountText = amountElement ? await amountElement.text() : ''
  recordAssertion(
    report,
    '结果页显示浇水量建议',
    Boolean(String(amountText || '').trim()),
    `text=${amountText || ''}`
  )
  const resultScreenshot = await safeScreenshot(
    mp,
    artifactDir,
    'watering-pot-profile-persistence-result',
    report.wsEndpoint,
    { report }
  )
  recordScreenshot(report, resultScreenshot)
  recordAssertion(report, '结果页截图成功保存', Boolean(resultScreenshot), resultScreenshot || '')

  await closeWateringSheet(await mp.currentPage())
  await sleep(600)
  page = await mp.currentPage()
  const reopened = await openReminder(page, entry.plantId)
  recordAssertion(report, '关闭后可从同一植物入口重新打开浇水提醒', reopened)
  const reopenedFlow = reopened ? await reopenToPotStep(await mp.currentPage()) : { opened: false }
  const restoredTopHandle = reopenedFlow.opened
    ? await waitForElement(await mp.currentPage(), POT_TOP_HANDLE_ID, 5000)
    : null
  const restoredBottomHandle = reopenedFlow.opened
    ? await waitForElement(await mp.currentPage(), POT_BOTTOM_HANDLE_ID, 5000)
    : null
  const restoredScreenshot = reopenedFlow.opened
    ? await safeScreenshot(
        mp,
        artifactDir,
        'watering-pot-profile-persistence-reopened',
        report.wsEndpoint,
        { report }
      )
    : null
  recordAssertion(
    report,
    '重新进入盆型步骤后显示已保存的盆型拖拽节点',
    Boolean(restoredTopHandle && restoredBottomHandle),
    `reopened=${reopenedFlow.opened}, selectedDate=${reopenedFlow.selectedDate || ''}`
  )
  recordScreenshot(report, restoredScreenshot)
  recordAssertion(
    report,
    '重开后的盆型回显截图成功保存',
    Boolean(restoredScreenshot),
    restoredScreenshot || ''
  )
  await closeWateringSheet(await mp.currentPage())

  if (report.assertions.every(assertion => assertion.passed)) {
    setClassification(report, 'PASS')
  } else {
    setClassification(report, 'FAIL_PRODUCT', '盆型保存、建议或回显未满足端上契约')
  }
}

async function main() {
  const env = resolveEnv(process.argv.slice(2))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: DAILY_DIAGNOSTIC_MODE
      ? 'pot-profile-persistence-daily-diagnostic'
      : 'pot-profile-persistence',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null
  try {
    const projectCheck = preflightProject(env.projectPath)
    if (!projectCheck.ok && !DAILY_DIAGNOSTIC_MODE) {
      setClassification(report, 'BLOCKED_ENV', projectCheck.reason)
      return
    }
    if (DAILY_DIAGNOSTIC_MODE) {
      report.execution_mode = 'interactive_daily_diagnostic'
      report.formal_qa_eligible = false
      report.project_preflight = {
        ...projectCheck,
        bypass_reason: '日常调试窗口复现仅用于定位真实业务行为；不能作为正式 qa-run 验收结论'
      }
    }
    try {
      mp = await connectAutomator(env.wsEndpoint)
    } catch (error) {
      if (error instanceof AutomatorConnectError) {
        setClassification(report, 'BLOCKED_ENV', `automator connect failed: ${error.reason}`)
        return
      }
      throw error
    }
    await runPersistenceScenario(mp, report, env.artifactDir)
  } catch (error) {
    setClassification(report, 'FAIL_PRODUCT', `unexpected error: ${error?.message || error}`)
  } finally {
    await restoreRequest(mp)
    await safeDisconnect(mp)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `watering-pot-profile-persistence-${timestampForFilename()}`
    )
    console.log(`[e2e] report: ${reportPath}`)
    emitLeafReport(report)
  }
  process.exitCode =
    report.classification === 'PASS' ? 0 : report.classification?.startsWith('BLOCKED') ? 2 : 1
}

main().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
