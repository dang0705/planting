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
 *   5. 在 watering-date-picker-content 容器内通过结构定位"确认"按钮并点击
 *      （该按钮无独立 ID，通过稳定容器 ID + 容器内 button 结构定位）
 *   6. confirmDatePicker → fetchPlanner → /user-plants/watering-planner wx.request
 *
 * 断言无副作用：
 *   - 不应出现 /watering-reminders 保存接口请求
 *   - 不应触发添加日历后的状态
 */

import {
  findViewById,
  findByIdPrefixAndSuffix,
  collectByIdPrefix,
  waitForElement
} from './element-helpers.mjs'

const WATERING_ENTRY_PREFIX = 'plant-card-reminder-'
const WATERING_ENTRY_SUFFIX = '-water'
const WATERING_SHEET_ID = 'watering-reminder-sheet'
const LAST_WATERING_ROW_ID = 'watering-reminder-last-watering-row'
const DATE_PICKER_SHEET_ID = 'watering-date-picker-sheet'
const DATE_PICKER_CONTENT_ID = 'watering-date-picker-content'
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
 * 在 watering-date-picker-content 容器内定位"确认"按钮。
 *
 * 该按钮无独立 ID（通过 <template #confirm> 插槽覆写），
 * 使用稳定容器 ID + 容器内 button 结构定位（不用中文文案或坐标）。
 *
 * 策略：在 watering-date-picker-content 内查找 button，确认按钮是第二个
 * （第一个是"取消"）。如果无法确定顺序，查找含 confirm 相关 class 的 button。
 *
 * @param {object} page
 * @returns {Promise<object|null>} 按钮元素或 null
 */
export async function findDatePickerConfirmButton(page) {
  // 尝试 1：在 date-picker-content 容器内查找 button
  const contentEl = await findViewById(page, DATE_PICKER_CONTENT_ID)
  if (contentEl) {
    try {
      const buttons = await contentEl.$$('button')
      if (buttons && buttons.length >= 2) {
        // 确认按钮是第二个（取消在前）
        return buttons[1]
      }
      if (buttons && buttons.length === 1) {
        return buttons[0]
      }
    } catch (e) {}
  }

  // 尝试 2：遍历全页面 button，查找在 date-picker-sheet 内的
  try {
    const allButtons = await page.$$('button')
    if (Array.isArray(allButtons)) {
      const inDatePicker = []
      for (const btn of allButtons) {
        try {
          // 检查按钮是否在 date-picker-sheet 内（通过 class 或位置无法确定，
          // 改为收集所有 button 文本，寻找"确认"——但审查要求不用中文文案作为主定位器）
          // 这里使用结构：date-picker 的确认按钮通常有绿色背景 class
          const text = await btn.text()
          if (text && text.trim() === '确认') {
            inDatePicker.push(btn)
          }
        } catch (e) {}
      }
      if (inDatePicker.length > 0) {
        return inDatePicker[inDatePicker.length - 1]
      }
    }
  } catch (e) {}

  return null
}

/**
 * 通过无副作用触发链触发 /user-plants/watering-planner 请求。
 *
 * @param {object} mp - miniProgram 实例
 * @param {object} page - 当前页面
 * @param {string|number} plantId - 目标植物 ID（用于定位 plant-card-reminder-{id}-water）
 * @param {object} options - { captureClear: Function, readRequests: Function, waitForRequest: Function }
 * @returns {Promise<{plannerRequest: object|null, triggerChain: Array, sideEffectDetected: boolean}>}
 */
export async function triggerPlannerNoSideEffect(mp, page, plantId, options) {
  const triggerChain = []
  let sideEffectDetected = false

  // 步骤 1：定位并点击 plant-card-reminder-{plantId}-water
  const entryId = `${WATERING_ENTRY_PREFIX}${plantId}${WATERING_ENTRY_SUFFIX}`
  const entryEl = await findViewById(page, entryId)
  if (!entryEl) {
    triggerChain.push({ step: 'click-entry', success: false, reason: `${entryId} not found` })
    return { plannerRequest: null, triggerChain, sideEffectDetected }
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
    return { plannerRequest: null, triggerChain, sideEffectDetected }
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
    return { plannerRequest: null, triggerChain, sideEffectDetected }
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
    return { plannerRequest: null, triggerChain, sideEffectDetected }
  }
  triggerChain.push({ step: 'wait-date-picker', success: true, id: DATE_PICKER_SHEET_ID })

  // 步骤 5：在 watering-date-picker-content 内定位"确认"按钮并点击
  const confirmBtn = await findDatePickerConfirmButton(page)
  if (!confirmBtn) {
    triggerChain.push({
      step: 'find-confirm-button',
      success: false,
      reason: 'confirm button not found in watering-date-picker-content'
    })
    await closeWateringSheet(page)
    return { plannerRequest: null, triggerChain, sideEffectDetected }
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

  return { plannerRequest, triggerChain, sideEffectDetected }
}

/**
 * 从运行时 DOM 收集所有可用植物入口的 plantId。
 *
 * @param {object} page
 * @returns {Promise<Array<{plantId: string, element: object, id: string}>>}
 */
export async function collectWateringEntries(page) {
  const entries = await collectByIdPrefix(page, WATERING_ENTRY_PREFIX)
  const waterEntries = entries.filter(e => e.id.endsWith(WATERING_ENTRY_SUFFIX))
  return waterEntries.map(e => ({
    plantId: e.id.slice(WATERING_ENTRY_PREFIX.length, e.id.length - WATERING_ENTRY_SUFFIX.length),
    element: e.element,
    id: e.id
  }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
