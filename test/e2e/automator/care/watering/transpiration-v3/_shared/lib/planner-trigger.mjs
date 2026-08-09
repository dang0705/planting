'use strict'

/**
 * 无副作用 planner 触发链 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 通过真实 UI 交互触发 /user-plants/watering-planner，不产生外部副作用
 *   - 不点击 watering-reminder-confirm-button（会调用 addToCalendar + saveWateringReminder）
 *   - 不直接调用页面业务方法、不写数据库、不保存提醒、不添加系统日历
 *
 * 无副作用触发链：
 *   1. 点击 plant-card-reminder-{id}-water
 *   2. 等待 watering-reminder-sheet 出现
 *   3. 点击 watering-reminder-last-watering-row
 *   4. 等待 watering-date-picker-sheet 出现
 *   5. 点击 watering-date-picker-confirm-button 确认
 *   6. confirmDatePicker → fetchPlanner → /user-plants/watering-planner wx.request
 *
 * 断言无副作用：
 *   - 不应出现 /watering-reminders 保存接口请求
 *   - 不应触发添加日历后的状态
 */

import {
  findViewById,
  collectByIdPrefix,
  waitForElement
} from './element-helpers.mjs'

const WATERING_ENTRY_PREFIX = 'plant-card-reminder-'
const WATERING_ENTRY_SUFFIX = '-water'
const WATERING_SHEET_ID = 'watering-reminder-sheet'
const LAST_WATERING_ROW_ID = 'watering-reminder-last-watering-row'
const DATE_PICKER_SHEET_ID = 'watering-date-picker-sheet'
const DATE_PICKER_CONFIRM_BUTTON_ID = 'watering-date-picker-confirm-button'
const WATERING_REMINDER_SAVE_API = '/watering-reminders'

/**
 * 关闭 watering-reminder-sheet（无副作用）。
 */
export async function closeWateringSheet(page) {
  const closeBtn = await findViewById(page, 'watering-reminder-close-button')
  if (closeBtn) {
    await closeBtn.tap()
    await sleep(500)
  }
  // 也尝试关闭可能仍打开的 date-picker
  const datePickerClose = await findViewById(page, 'watering-date-picker-close-button')
  if (datePickerClose) {
    await datePickerClose.tap()
    await sleep(300)
  }
}

/**
 * 定位浇水日期选择器的确认按钮。
 *
 * 使用当前组件公开的稳定 ID，不扫描全页面文案或依赖 button 顺序，避免误触。
 *
 * @param {object} page
 * @returns {Promise<{button: object|null, ambiguous: boolean, detail: string}>}
 */
export async function findDatePickerConfirmButton(page) {
  const confirmButton = await findViewById(page, DATE_PICKER_CONFIRM_BUTTON_ID)
  if (confirmButton) {
    return {
      button: confirmButton,
      ambiguous: false,
      detail: `found ${DATE_PICKER_CONFIRM_BUTTON_ID}`
    }
  }
  return {
    button: null,
    ambiguous: true,
    detail: `${DATE_PICKER_CONFIRM_BUTTON_ID} 未找到`
  }
}

/**
 * 通过无副作用触发链触发 /user-plants/watering-planner 请求。
 *
 * @param {object} mp - miniProgram 实例
 * @param {object} page - 当前页面
 * @param {string|number} plantId - 目标植物 ID（用于定位 plant-card-reminder-{id}-water）
 * @param {object} options - { captureClear: Function, readRequests: Function, waitForRequest: Function }
 * @returns {Promise<{plannerRequest: object|null, triggerChain: Array, sideEffectDetected: boolean, confirmButtonAmbiguous: boolean}>}
 */
export async function triggerPlannerNoSideEffect(mp, page, plantId, options) {
  const triggerChain = []
  let sideEffectDetected = false
  let confirmButtonAmbiguous = false

  // 步骤 1：定位并点击 plant-card-reminder-{plantId}-water
  const entryId = `${WATERING_ENTRY_PREFIX}${plantId}${WATERING_ENTRY_SUFFIX}`
  const entryEl = await findViewById(page, entryId)
  if (!entryEl) {
    triggerChain.push({ step: 'click-entry', success: false, reason: `${entryId} not found` })
    return { plannerRequest: null, triggerChain, sideEffectDetected, confirmButtonAmbiguous: false }
  }
  await entryEl.tap()
  triggerChain.push({ step: 'click-entry', success: true, id: entryId })
  await sleep(1500)

  // 步骤 2：等待 watering-reminder-sheet 出现
  const sheetEl = await waitForElement(page, WATERING_SHEET_ID, 5000)
  if (!sheetEl) {
    triggerChain.push({
      step: 'wait-sheet',
      success: false,
      reason: `${WATERING_SHEET_ID} not found`
    })
    return { plannerRequest: null, triggerChain, sideEffectDetected, confirmButtonAmbiguous: false }
  }
  triggerChain.push({ step: 'wait-sheet', success: true, id: WATERING_SHEET_ID })

  // 步骤 3：点击 watering-reminder-last-watering-row
  const lastWateringRow = await findViewById(page, LAST_WATERING_ROW_ID)
  if (!lastWateringRow) {
    triggerChain.push({
      step: 'click-last-watering-row',
      success: false,
      reason: `${LAST_WATERING_ROW_ID} not found`
    })
    await closeWateringSheet(page)
    return { plannerRequest: null, triggerChain, sideEffectDetected, confirmButtonAmbiguous: false }
  }
  await lastWateringRow.tap()
  triggerChain.push({ step: 'click-last-watering-row', success: true, id: LAST_WATERING_ROW_ID })
  await sleep(1500)

  // 步骤 4：等待 watering-date-picker-sheet 出现
  const datePickerSheet = await waitForElement(page, DATE_PICKER_SHEET_ID, 5000)
  if (!datePickerSheet) {
    triggerChain.push({
      step: 'wait-date-picker',
      success: false,
      reason: `${DATE_PICKER_SHEET_ID} not found`
    })
    await closeWateringSheet(page)
    return { plannerRequest: null, triggerChain, sideEffectDetected, confirmButtonAmbiguous: false }
  }
  triggerChain.push({ step: 'wait-date-picker', success: true, id: DATE_PICKER_SHEET_ID })

  // 步骤 5：在 watering-date-picker-content 内定位"确认"按钮并点击
  const confirmResult = await findDatePickerConfirmButton(page)
  const confirmBtn = confirmResult.button
  if (!confirmBtn) {
    confirmButtonAmbiguous = confirmResult.ambiguous
    triggerChain.push({
      step: 'find-confirm-button',
      success: false,
      reason: confirmResult.detail,
      ambiguous: confirmResult.ambiguous
    })
    await closeWateringSheet(page)
    return { plannerRequest: null, triggerChain, sideEffectDetected, confirmButtonAmbiguous }
  }
  await confirmBtn.tap()
  triggerChain.push({ step: 'click-confirm-button', success: true })
  await sleep(2000)

  // 步骤 6：等待 planner 请求
  const plannerRequest = await options.waitForRequest(mp, 10000)
  triggerChain.push({
    step: 'wait-planner-request',
    success: !!plannerRequest,
    url: plannerRequest?.url || null
  })

  // 步骤 7：检测副作用——不应出现 /watering-reminders 保存接口
  const allRequests = await options.readRequests(mp)
  const saveRequests = allRequests.filter(
    r =>
      r.url &&
      r.url.includes(WATERING_REMINDER_SAVE_API) &&
      String(r.method).toUpperCase() === 'POST'
  )
  if (saveRequests.length > 0) {
    sideEffectDetected = true
    triggerChain.push({
      step: 'side-effect-check',
      success: false,
      reason: `检测到 ${saveRequests.length} 个 /watering-reminders POST 请求（saveWateringReminder 副作用）`
    })
  } else {
    triggerChain.push({
      step: 'side-effect-check',
      success: true,
      reason: '未检测到 /watering-reminders 保存请求'
    })
  }

  // 关闭 sheet（清理状态）
  await closeWateringSheet(page)

  return { plannerRequest, triggerChain, sideEffectDetected, confirmButtonAmbiguous }
}

/**
 * 从运行时 DOM 收集所有可用植物入口的 plantId。
 *
 * 兼容构建前缀：使用 stableId（去除 `<scopeId>--` 前缀后的完整稳定 ID）
 * 来提取中间动态 plantId，避免把 scopeId 当成 plantId 的一部分。
 *
 * @param {object} page
 * @returns {Promise<Array<{plantId: string, element: object, id: string, stableId: string}>>}
 */
export async function collectWateringEntries(page) {
  const entries = await collectByIdPrefix(page, WATERING_ENTRY_PREFIX)
  return entries
    .filter(e => e.stableId.endsWith(WATERING_ENTRY_SUFFIX))
    .map(e => ({
      plantId: e.stableId.slice(
        WATERING_ENTRY_PREFIX.length,
        e.stableId.length - WATERING_ENTRY_SUFFIX.length
      ),
      element: e.element,
      id: e.id,
      stableId: e.stableId
    }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
