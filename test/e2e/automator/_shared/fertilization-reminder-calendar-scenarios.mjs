'use strict'

import {
  findViewById,
  waitForElement
} from '../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import {
  dismissFertilizationCalculationTooltip,
  scrollFertilizationSheetToActions
} from './fertilization-reminder-e2e-helpers.mjs'

const ZERO = 0
const ONE = 1
const POPUP_CLOSE_TIMEOUT_MS = 5000
const POPUP_CLOSE_POLL_INTERVAL_MS = 120
const UI_TRANSITION_WAIT_MS = 360
const PREVIEW_WAIT_MS = 300
const CALENDAR_FAILURE_WAIT_MS = 420
const ELEMENT_WAIT_TIMEOUT_MS = 10000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function textOf(element) {
  return String((await element?.text?.()) || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function requestMatches(requests, pattern) {
  return requests.some(request => pattern.test(String(request?.url || '')))
}

async function waitForElementGone(mp, id, timeoutMs = POPUP_CLOSE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = await mp.currentPage()
    const element = await findViewById(page, id)
    if (!element) {
      return page
    }
    await sleep(POPUP_CLOSE_POLL_INTERVAL_MS)
  }
  return null
}

export async function verifyFertilizationCalendarScenarios({
  mp,
  report,
  recordAssertion,
  readFixtureState,
  resetFixtureReminder,
  fixtureSlot,
  plantId
}) {
  let page = await mp.currentPage()
  await dismissFertilizationCalculationTooltip(mp)
  const confirmButton = await findViewById(page, 'fertilization-reminder-calendar-confirm-button')
  recordAssertion(report, '施肥提醒可调用系统日历写入', Boolean(confirmButton))
  if (!confirmButton) {
    throw new Error('施肥提醒预览未渲染日历确认按钮')
  }

  await confirmButton.tap()
  await sleep(UI_TRANSITION_WAIT_MS)
  page = await mp.currentPage()
  const savedState = await waitForElement(
    page,
    'fertilization-reminder-saved-state',
    ELEMENT_WAIT_TIMEOUT_MS
  )
  const savedText = await textOf(savedState)
  const successState = await readFixtureState(mp, fixtureSlot)
  const failureRequestStart = Array.isArray(successState?.requests)
    ? successState.requests.length
    : ZERO
  const calendarPayload = successState?.calendarCalls?.[ZERO]?.payload || null
  recordAssertion(
    report,
    '模拟系统日历成功后应用内提醒保存',
    Boolean(savedState) && savedText.includes('首次确认提醒已设置')
  )
  recordAssertion(
    report,
    '系统日历写入使用正确的施肥检查事件',
    Boolean(calendarPayload) &&
      calendarPayload.title === '龟背竹首次确认提醒' &&
      Number(calendarPayload.startTime) > ZERO &&
      Number(calendarPayload.endTime) > Number(calendarPayload.startTime) &&
      String(calendarPayload.description || '').includes('打开青花植查看当月施肥规则')
  )
  recordAssertion(
    report,
    '日历成功后 confirm 同步带回日历 payload',
    requestMatches(
      successState?.requests || [],
      /plant-user-http\/user-plants\/fertilization-reminders\/confirm/u
    ) && Boolean(successState?.reminder?.calendarPayload)
  )

  await resetFixtureReminder(mp, fixtureSlot, { calendarMode: 'fail' })
  page = await mp.currentPage()
  const closeButton = await findViewById(page, 'plant-card-fertilization-close-button')
  if (!closeButton) {
    throw new Error('施肥提醒已保存态缺少弹框关闭按钮')
  }
  await closeButton.tap()
  page = await waitForElementGone(mp, 'plant-card-fertilization-sheet')
  if (!page) {
    throw new Error('日历失败场景中施肥弹框未完成关闭')
  }
  const entry = await findViewById(page, `plant-card-fertilization-${plantId}`)
  if (!entry) {
    throw new Error('日历失败场景无法重新打开施肥弹框')
  }
  await entry.tap()
  await sleep(UI_TRANSITION_WAIT_MS)
  page = await mp.currentPage()
  const reopenedSheet = await waitForElement(
    page,
    'plant-card-fertilization-sheet',
    ELEMENT_WAIT_TIMEOUT_MS
  )
  if (!reopenedSheet) {
    throw new Error('日历失败场景无法重新挂载施肥弹框')
  }
  await scrollFertilizationSheetToActions(mp)
  const previewButton = await waitForElement(
    page,
    'fertilization-reminder-preview-button',
    ELEMENT_WAIT_TIMEOUT_MS
  )
  if (!previewButton) {
    throw new Error('日历失败场景未恢复施肥提醒设置区')
  }
  await previewButton.tap()
  await sleep(PREVIEW_WAIT_MS)
  await dismissFertilizationCalculationTooltip(mp)
  page = await mp.currentPage()
  const failedConfirmButton = await waitForElement(
    page,
    'fertilization-reminder-calendar-confirm-button',
    ELEMENT_WAIT_TIMEOUT_MS
  )
  if (!failedConfirmButton) {
    throw new Error('日历失败场景未生成待确认提醒')
  }
  await failedConfirmButton.tap()
  await sleep(CALENDAR_FAILURE_WAIT_MS)
  page = await mp.currentPage()
  const setupAfterFailure = await waitForElement(
    page,
    'fertilization-reminder-section',
    ELEMENT_WAIT_TIMEOUT_MS
  )
  const activeAfterFailure = await findViewById(page, 'fertilization-reminder-saved-state')
  const failureState = await readFixtureState(mp, fixtureSlot)
  const failureRequests = (failureState?.requests || []).slice(failureRequestStart)
  recordAssertion(
    report,
    '模拟系统日历失败后不保存 active 提醒',
    Boolean(setupAfterFailure) && !activeAfterFailure && !failureState?.reminder
  )
  recordAssertion(
    report,
    '系统日历失败会取消 pending 计划且不调用 confirm',
    failureState?.cancelledPlanIds?.length === ONE &&
      !requestMatches(
        failureRequests,
        /plant-user-http\/user-plants\/fertilization-reminders\/confirm/u
      )
  )
}
