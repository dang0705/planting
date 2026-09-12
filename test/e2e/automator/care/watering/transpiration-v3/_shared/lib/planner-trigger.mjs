'use strict'

/**
 * planner 触发链 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 通过真实 UI 交互触发 /user-plants/watering-planner
 *   - 不点击 watering-reminder-confirm-button（会调用 addToCalendar + saveWateringReminder）
 *   - 不直接调用页面业务方法、不写数据库、不保存提醒、不添加系统日历
 *   - 盆型有改动时，允许并记录“查看建议前保存当前植物盆型”的 PATCH
 *
 * 触发链：
 *   1. 点击 plant-card-reminder-{id}-water
 *   2. 等待 watering-reminder-sheet 出现
 *   3. 点击 watering-reminder-last-watering-row
 *   4. 等待 watering-reminder-input-stepper 出现
 *   5. 点击 watering-reminder-input-next-button 进入盆型步骤
 *   6. 再次点击 watering-reminder-input-next-button → 保存盆型（如有改动）→ fetchPlanner
 *
 * 外部副作用边界：
 *   - 不应出现 /watering-reminders 保存接口请求
 *   - 不应触发添加日历后的状态
 *   - /user-plants?_method=PATCH 盆型保存请求属于本流程预期行为，不计入提醒副作用
 */

import { findViewById, collectByIdPrefix, waitForElement } from './element-helpers.mjs'

const WATERING_ENTRY_PREFIX = 'plant-card-reminder-'
const WATERING_ENTRY_SUFFIX = '-water'
const WATERING_SHEET_ID = 'watering-reminder-sheet'
const LAST_WATERING_ROW_ID = 'watering-reminder-last-watering-row'
const INPUT_STEPPER_ID = 'watering-reminder-input-stepper'
const INPUT_NEXT_BUTTON_ID = 'watering-reminder-input-next-button'
const INPUT_POT_STEP_ID = 'watering-reminder-input-step-pot'
const POT_TOP_HANDLE_ID = 'watering-reminder-input-pot-profile-top-handle'
const POT_BOTTOM_HANDLE_ID = 'watering-reminder-input-pot-profile-bottom-handle'
const WATERING_REMINDER_SAVE_API = '/watering-reminders'
const USER_PLANT_PATCH_API = '/user-plants'

function isDisabledValue(value) {
  return value === true || value === 1 || String(value).trim().toLowerCase() === 'true'
}

async function readDisabledState(element) {
  try {
    return isDisabledValue(await element.property('disabled'))
  } catch {
    return isDisabledValue(await element.attribute('disabled'))
  }
}

async function findSelectableUnselectedWateringDate(page) {
  const dateCells = await collectByIdPrefix(
    page,
    'watering-reminder-input-history-care-behavior-date-'
  )
  for (const cell of dateCells) {
    const className = String((await cell.element.attribute('class').catch(() => '')) || '')
    if (
      className.includes('care-behavior-cell--selectable') &&
      !className.includes('care-behavior-cell--selected')
    ) {
      return cell.element
    }
  }
  return null
}

/**
 * 关闭 watering-reminder-sheet（无副作用）。
 */
export async function closeWateringSheet(page) {
  const closeBtn = await findViewById(page, 'watering-reminder-close-button')
  if (closeBtn) {
    await closeBtn.tap()
    await sleep(500)
  }
}

/**
 * 通过真实步骤触发 /user-plants/watering-planner 请求。
 *
 * @param {object} mp - miniProgram 实例
 * @param {object} page - 当前页面
 * @param {string|number} plantId - 目标植物 ID（用于定位 plant-card-reminder-{id}-water）
 * @param {object} options - { captureClear: Function, readRequests: Function, waitForRequest: Function }
 * @returns {Promise<{plannerRequest: object|null, potProfileSaveRequests: Array, triggerChain: Array, sideEffectDetected: boolean}>}
 */
export async function triggerPlannerNoSideEffect(mp, page, plantId, options = {}) {
  const triggerChain = []
  let sideEffectDetected = false

  // 步骤 1：定位并点击 plant-card-reminder-{plantId}-water
  const entryId = `${WATERING_ENTRY_PREFIX}${plantId}${WATERING_ENTRY_SUFFIX}`
  const entryEl = await findViewById(page, entryId)
  if (!entryEl) {
    triggerChain.push({ step: 'click-entry', success: false, reason: `${entryId} not found` })
    return { plannerRequest: null, potProfileSaveRequests: [], triggerChain, sideEffectDetected }
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
    return { plannerRequest: null, potProfileSaveRequests: [], triggerChain, sideEffectDetected }
  }
  triggerChain.push({ step: 'wait-sheet', success: true, id: WATERING_SHEET_ID })

  // 步骤 3：没有历史时，产品会直接进入题包式输入，避免用户再点一次
  // “过往浇水日期”。有历史时才保留从结果页点击该行的路径。
  let inputStepper = await findViewById(page, INPUT_STEPPER_ID)
  if (inputStepper) {
    triggerChain.push({ step: 'required-history-input-already-open', success: true, id: INPUT_STEPPER_ID })
  } else {
    const lastWateringRow = await findViewById(page, LAST_WATERING_ROW_ID)
    if (!lastWateringRow) {
      triggerChain.push({
        step: 'click-last-watering-row',
        success: false,
        reason: `${LAST_WATERING_ROW_ID} not found`
      })
      await closeWateringSheet(page)
      return { plannerRequest: null, potProfileSaveRequests: [], triggerChain, sideEffectDetected }
    }
    await lastWateringRow.tap()
    triggerChain.push({ step: 'click-last-watering-row', success: true, id: LAST_WATERING_ROW_ID })
    await sleep(800)
    inputStepper = await waitForElement(page, INPUT_STEPPER_ID, 5000)
  }

  // 步骤 4：确认题包式浇水输入步骤已出现
  if (!inputStepper) {
    triggerChain.push({
      step: 'wait-input-stepper',
      success: false,
      reason: `${INPUT_STEPPER_ID} not found`
    })
    await closeWateringSheet(page)
    return { plannerRequest: null, potProfileSaveRequests: [], triggerChain, sideEffectDetected }
  }
  triggerChain.push({ step: 'wait-input-stepper', success: true, id: INPUT_STEPPER_ID })

  // 若没有预置历史记录，先选择一个可用日期；已有历史记录则保持原选择，避免误取消。
  const nextButton = await waitForElement(page, INPUT_NEXT_BUTTON_ID, 5000)
  if (!nextButton) {
    triggerChain.push({
      step: 'find-input-next-button',
      success: false,
      reason: `${INPUT_NEXT_BUTTON_ID} not found`
    })
    await closeWateringSheet(page)
    return { plannerRequest: null, potProfileSaveRequests: [], triggerChain, sideEffectDetected }
  }
  let nextDisabled = await readDisabledState(nextButton)
  if (nextDisabled) {
    const dateCell = await findSelectableUnselectedWateringDate(page)
    if (!dateCell) {
      triggerChain.push({
        step: 'select-required-watering-date',
        success: false,
        reason: '没有可选择且尚未选中的过往浇水日期'
      })
      await closeWateringSheet(page)
      return { plannerRequest: null, potProfileSaveRequests: [], triggerChain, sideEffectDetected }
    }
    await dateCell.tap()
    triggerChain.push({ step: 'select-required-watering-date', success: true })
    await sleep(500)
    nextDisabled = await readDisabledState(nextButton)
    if (nextDisabled) {
      triggerChain.push({
        step: 'verify-required-watering-date',
        success: false,
        reason: '选择可用日期后，下一步仍不可用'
      })
      await closeWateringSheet(page)
      return { plannerRequest: null, potProfileSaveRequests: [], triggerChain, sideEffectDetected }
    }
  }

  await nextButton.tap()
  triggerChain.push({ step: 'click-input-next-to-pot', success: true, id: INPUT_NEXT_BUTTON_ID })
  await sleep(500)

  const potStep = await waitForElement(page, INPUT_POT_STEP_ID, 5000)
  if (!potStep) {
    triggerChain.push({
      step: 'wait-pot-step',
      success: false,
      reason: `${INPUT_POT_STEP_ID} not found`
    })
    await closeWateringSheet(page)
    return { plannerRequest: null, potProfileSaveRequests: [], triggerChain, sideEffectDetected }
  }
  triggerChain.push({ step: 'wait-pot-step', success: true, id: INPUT_POT_STEP_ID })

  let potProfileInteraction = null
  if (options.ensurePotProfileByDrag) {
    potProfileInteraction = await ensurePotProfileByDrag(page)
    triggerChain.push({
      step: 'drag-pot-profile-handles',
      success: potProfileInteraction.complete,
      handles: potProfileInteraction.handles
    })
    if (!potProfileInteraction.complete) {
      await closeWateringSheet(page)
      return {
        plannerRequest: null,
        potProfileSaveRequests: [],
        triggerChain,
        sideEffectDetected,
        potProfileInteraction
      }
    }
  }

  const latestNextButton = await waitForElement(page, INPUT_NEXT_BUTTON_ID, 5000)
  if (!latestNextButton) {
    triggerChain.push({
      step: 'find-pot-next-button',
      success: false,
      reason: `${INPUT_NEXT_BUTTON_ID} not found on pot step`
    })
    await closeWateringSheet(page)
    return { plannerRequest: null, potProfileSaveRequests: [], triggerChain, sideEffectDetected }
  }
  await latestNextButton.tap()
  triggerChain.push({ step: 'click-input-next-to-result', success: true, id: INPUT_NEXT_BUTTON_ID })
  await sleep(2000)

  // 步骤 6：等待 planner 请求
  const plannerRequest = await options.waitForRequest(mp, 10000)
  triggerChain.push({
    step: 'wait-planner-request',
    success: !!plannerRequest,
    url: plannerRequest?.url || null
  })

  // 步骤 7：记录预期的盆型 PATCH，并检查真正不应发生的提醒保存
  const allRequests = await options.readRequests(mp)
  const potProfileSaveRequests = allRequests.filter(isUserPlantPatchRequest)
  if (potProfileSaveRequests.length > 0) {
    triggerChain.push({
      step: 'pot-profile-save-check',
      success: true,
      reason: `检测到 ${potProfileSaveRequests.length} 个当前植物盆型保存请求`
    })
  }
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

  // 默认关闭 sheet（清理状态）。持久化场景会在结果页截屏和回显断言后自行关闭。
  if (options.closeAfter !== false) {
    await closeWateringSheet(page)
  }

  return {
    plannerRequest,
    potProfileSaveRequests,
    triggerChain,
    sideEffectDetected,
    potProfileInteraction
  }
}

function isUserPlantPatchRequest(request) {
  if (!request?.url || !request.url.includes(USER_PLANT_PATCH_API)) {
    return false
  }
  const method = String(request.method || '').toUpperCase()
  // 小程序本地 HTTP bridge 会把 PATCH 编码为 POST + _method=PATCH；两种记录都是同一业务写入。
  return method === 'PATCH' || /[?&]_method=PATCH(?:&|$)/.test(request.url)
}

async function ensurePotProfileByDrag(page) {
  const handles = []
  for (const config of [
    { id: POT_TOP_HANDLE_ID, primary: { x: 24, y: -24 }, fallback: { x: -48, y: 48 } },
    { id: POT_BOTTOM_HANDLE_ID, primary: { x: 24, y: 0 }, fallback: { x: -48, y: 0 } }
  ]) {
    const result = await dragHandleInEitherDirection(page, config)
    handles.push({ id: config.id, ...result })
  }
  return {
    complete: handles.every(handle => handle.changed),
    handles
  }
}

async function dragHandleInEitherDirection(page, { id, primary, fallback }) {
  for (const delta of [primary, fallback]) {
    const handle = await waitForElement(page, id, 5000)
    if (!handle) {
      return { changed: false, reason: 'handle_not_found' }
    }
    const before = await readOffset(handle)
    if (!before) {
      return { changed: false, reason: 'offset_unavailable' }
    }
    const start = touchPoint(before.left, before.top)
    const end = touchPoint(before.left + delta.x, before.top + delta.y)
    await handle.touchstart({ touches: [start], changedTouches: [start] })
    await handle.touchmove({ touches: [end], changedTouches: [end] })
    await handle.touchend({ changedTouches: [end] })
    await sleep(450)

    const movedHandle = await waitForElement(page, id, 3000)
    const after = movedHandle ? await readOffset(movedHandle) : null
    if (after && (Math.abs(after.left - before.left) > 1 || Math.abs(after.top - before.top) > 1)) {
      return { changed: true, delta, before, after }
    }
  }
  return { changed: false, reason: 'drag_did_not_change_handle_position' }
}

function touchPoint(left, top) {
  return {
    clientX: left,
    clientY: top,
    pageX: left,
    pageY: top,
    x: left,
    y: top
  }
}

async function readOffset(element) {
  try {
    const offset = await element.offset()
    const left = Number(offset?.left ?? offset?.x)
    const top = Number(offset?.top ?? offset?.y)
    if (Number.isFinite(left) && Number.isFinite(top)) {
      return { left, top }
    }
  } catch {
    // The caller turns this into a visible assertion instead of guessing coordinates.
  }
  return null
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
  // 只需找到少量真实入口供后续逐个完成流程。Nightly 中每张植物卡片都是
  // 独立组件；全量递归几十张卡片会把入口探测放大成无意义等待。
  const entries = await collectByIdPrefix(page, WATERING_ENTRY_PREFIX, { limit: 3 })
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
