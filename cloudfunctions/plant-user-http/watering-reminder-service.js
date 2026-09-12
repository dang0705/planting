'use strict'

const { models } = require('/opt/utils/cloudbase')
const { getUserPlantWateringEvents } = require('/opt/utils/plant-knowledge')
const { resolveServerWateringPlan } = require('./watering-reminder-plan-service')
const { mapReminderRow } = require('./watering-reminder-mapper')

const ACTIVE_STATUS = 'active'
const REMINDER_TYPE_WATER = 'water'

function runInNativeTransaction(handler) {
  const { withNativeTransaction } = require('/opt/utils/native-mysql')
  return withNativeTransaction(handler)
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return ''
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? text
    : ''
}

function normalizeTime(value) {
  const text = String(value || '').trim()
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) {
    return text.length === 5 ? `${text}:00` : text
  }
  return '09:00:00'
}

function normalizeNextTime(nextWaterDate, nextWaterTime) {
  const date = normalizeDate(nextWaterDate)
  if (!date) {
    return ''
  }
  return `${date} ${normalizeTime(nextWaterTime)}`
}

function normalizeIsoLikeTime(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::(\d{2}))?/)
  if (!match) {
    return ''
  }
  return `${match[1]} ${match[2]}:${match[3] || '00'}`
}

function resolveLastWatered(body = {}) {
  const explicit = normalizeDate(body.lastWatered)
  if (explicit) {
    return explicit
  }
  const events = Array.isArray(body.wateringEvents) ? body.wateringEvents : []
  return (
    events
      .map(event => normalizeDate(event?.date))
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] || ''
  )
}

function resolveWateredDate(body = {}) {
  const supplied = String(body.wateredDate || body.lastWatered || '').trim()
  if (supplied) {
    return normalizeDate(supplied)
  }
  return getTodayInChina()
}

function getTodayInChina() {
  const chinaNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return chinaNow.toISOString().slice(0, 10)
}

async function assertUserPlantOwned(openid, plantId) {
  const result = await models.$runSQL(
    'SELECT id FROM user_plant_instances WHERE id = {{plantId}} AND _openid = {{openid}} LIMIT 1',
    { openid, plantId: Number(plantId) }
  )
  return Boolean(result?.data?.executeResultList?.[0]?.id)
}

async function getLatestWateringReminder(openid, plantId) {
  const result = await models.$runSQL(
    `SELECT
       id,
       user_plant_id,
       plan_id,
       reminder_type,
       status,
       last_watered,
       next_water_date,
       next_time,
       CAST(watering_events_json AS CHAR) AS watering_events_json_text,
       CAST(planner_result_json AS CHAR) AS planner_result_json_text,
       CAST(calendar_payload_json AS CHAR) AS calendar_payload_json_text,
       created_at,
       updated_at
     FROM user_watering_reminder_events
     WHERE _openid = {{openid}}
       AND user_plant_id = {{plantId}}
       AND reminder_type = 'water'
       AND status = 'active'
     ORDER BY next_time DESC, created_at DESC
     LIMIT 1`,
    { openid, plantId: Number(plantId) }
  )
  const row = result?.data?.executeResultList?.[0]
  return row ? mapReminderRow(row) : null
}

async function readWateringReminder(openid, plantId) {
  const owned = await assertUserPlantOwned(openid, plantId)
  if (!owned) {
    return { found: false, statusCode: 404, data: null }
  }
  const reminder = await getLatestWateringReminder(openid, plantId)
  const persistedEvents = await getUserPlantWateringEvents(openid, plantId, 30)
  const wateringEvents = Array.isArray(persistedEvents) ? persistedEvents : []
  if (!reminder) {
    return {
      found: false,
      statusCode: 200,
      data: wateringEvents.length ? { wateringEvents } : null
    }
  }
  // 保留提醒自身保存的事件，另返回服务端最新历史，供前端识别旧提醒是否需要重算。
  // 这样不会在 GET 读取动作中偷偷改写提醒或植物状态。
  return {
    found: true,
    statusCode: 200,
    data: { ...reminder, persistedWateringEvents: wateringEvents }
  }
}

async function attachWateringReminderStateToList(openid, data = {}) {
  const list = Array.isArray(data.list) ? data.list : []
  if (!list.length) {
    return data
  }
  const ids = list.map(item => Number(item.id)).filter(Boolean)
  if (!ids.length) {
    return data
  }
  try {
    const result = await models.$runSQL(
      `SELECT
         id,
         user_plant_id,
         plan_id,
         reminder_type,
         status,
         last_watered,
         next_water_date,
         next_time,
         CAST(watering_events_json AS CHAR) AS watering_events_json_text,
         CAST(planner_result_json AS CHAR) AS planner_result_json_text,
         CAST(calendar_payload_json AS CHAR) AS calendar_payload_json_text,
         created_at,
         updated_at
       FROM user_watering_reminder_events
       WHERE _openid = {{openid}}
         AND user_plant_id IN (${ids.map(id => Number(id)).join(',')})
         AND reminder_type = 'water'
         AND status = 'active'
       ORDER BY next_time DESC, created_at DESC`,
      { openid }
    )
    const reminderByPlantId = new Map()
    for (const row of result?.data?.executeResultList || []) {
      const plantId = Number(row.user_plant_id)
      if (!reminderByPlantId.has(plantId)) {
        reminderByPlantId.set(plantId, mapReminderRow(row))
      }
    }
    return {
      ...data,
      list: list.map(item => ({
        ...item,
        wateringReminder: reminderByPlantId.get(Number(item.id)) || null
      }))
    }
  } catch (error) {
    console.warn('watering reminder list state unavailable:', error?.message || error)
    return data
  }
}

async function saveWateringReminder(openid, body = {}) {
  const plantId = Number(body.plantId)
  if (!plantId) {
    return { statusCode: 400, data: null, message: '缺少植物ID' }
  }
  const owned = await assertUserPlantOwned(openid, plantId)
  if (!owned) {
    return { statusCode: 404, data: null, message: '植物不存在或无权限' }
  }

  const { timeline, plan } = await resolveServerWateringPlan(openid, plantId, body)
  const nextWaterDate = normalizeDate(plan.nextWaterDate)
  const nextTime = normalizeNextTime(nextWaterDate, '09:00:00')
  const wateringEvents = timeline.wateringEvents10d || []
  const planId = String(body.planId || `server_plan_${Date.now()}`).slice(0, 128)
  const plannerResult = { ...plan, planId }
  const calendarPayload =
    body.calendarPayload && typeof body.calendarPayload === 'object' ? body.calendarPayload : {}
  // lastWatered 只从服务端重新归一化的事件得到，不接受客户端直接覆盖。
  const lastWatered = resolveLastWatered({ wateringEvents })
  const params = {
    openid,
    plantId,
    planId,
    reminderType: REMINDER_TYPE_WATER,
    status: ACTIVE_STATUS,
    lastWatered: lastWatered || null,
    nextWaterDate,
    nextTime,
    wateringEventsJson: JSON.stringify(wateringEvents),
    plannerResultJson: JSON.stringify(plannerResult),
    calendarPayloadJson: JSON.stringify({
      ...calendarPayload,
      createdBy: 'uni.addPhoneCalendar',
      status: 'created'
    })
  }

  await runInNativeTransaction(async connection => {
    const [ownedRows] = await connection.execute(
      `SELECT id
       FROM user_plant_instances
       WHERE id = ? AND _openid = ?
       FOR UPDATE`,
      [plantId, openid]
    )
    if (!ownedRows?.[0]) {
      const error = new Error('植物不存在或无权限')
      error.statusCode = 404
      throw error
    }

    await connection.execute(
      `UPDATE user_watering_reminder_events
       SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
       WHERE _openid = ?
         AND user_plant_id = ?
         AND reminder_type = 'water'
         AND status = 'active'`,
      [openid, plantId]
    )
    await connection.execute(
      `INSERT INTO user_watering_reminder_events
         (_openid, user_plant_id, plan_id, reminder_type, status, last_watered, next_water_date,
          next_time, watering_events_json, planner_result_json, calendar_payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        openid,
        plantId,
        params.planId,
        params.reminderType,
        params.status,
        params.lastWatered,
        params.nextWaterDate,
        params.nextTime,
        params.wateringEventsJson,
        params.plannerResultJson,
        params.calendarPayloadJson
      ]
    )
    await connection.execute(
      `UPDATE user_plant_instances
       SET last_watered = COALESCE(?, last_watered),
           next_water = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND _openid = ?`,
      [params.lastWatered, params.nextWaterDate, plantId, openid]
    )
  })

  const reminder = await getLatestWateringReminder(openid, plantId)
  return { statusCode: 200, data: reminder, message: '保存成功' }
}

async function completeWateringReminder(openid, body = {}) {
  const plantId = Number(body.plantId)
  if (!plantId) {
    return { statusCode: 400, data: null, message: '缺少植物ID' }
  }
  const owned = await assertUserPlantOwned(openid, plantId)
  if (!owned) {
    return { statusCode: 404, data: null, message: '植物不存在或无权限' }
  }

  const wateredDate = resolveWateredDate(body)
  if (!wateredDate) {
    return { statusCode: 400, data: null, message: '浇水日期无效' }
  }
  if (wateredDate > getTodayInChina()) {
    return { statusCode: 400, data: null, message: '浇水日期不能晚于今天' }
  }
  const requestedPlanId = String(body.planId || '').trim().slice(0, 128)
  let completedPlanId = requestedPlanId
  let completedDate = ''
  await runInNativeTransaction(async connection => {
    const [plantRows] = await connection.execute(
      `SELECT id
       FROM user_plant_instances
       WHERE id = ? AND _openid = ?
       FOR UPDATE`,
      [plantId, openid]
    )
    if (!plantRows?.[0]) {
      const error = new Error('植物不存在或无权限')
      error.statusCode = 404
      throw error
    }

    const [reminderRows] = await connection.execute(
      `SELECT id, plan_id
       FROM user_watering_reminder_events
       WHERE _openid = ?
         AND user_plant_id = ?
         AND reminder_type = ?
         AND status = ?
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [openid, plantId, REMINDER_TYPE_WATER, ACTIVE_STATUS]
    )
    const reminder = reminderRows?.[0] || null
    // 同一计划的重复提交必须返回第一次结果，不能被第二次点击改写成新的浇水日期。
    if (!reminder && requestedPlanId) {
      const [completedRows] = await connection.execute(
        `SELECT event_date
         FROM user_watering_events
         WHERE _openid = ? AND user_plant_id = ?
           AND source = 'reminder_complete'
           AND plan_id = ?
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [openid, plantId, requestedPlanId]
      )
      if (completedRows?.[0]?.event_date) {
        completedPlanId = requestedPlanId
        completedDate = String(completedRows[0].event_date)
        return
      }
    }
    completedPlanId = String(
      requestedPlanId || reminder?.plan_id || `manual_${plantId}_${wateredDate}_${Date.now()}`
    ).slice(0, 128)

    await connection.execute(
      `UPDATE user_plant_instances
       SET last_watered = ?, next_water = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND _openid = ?`,
      [wateredDate, plantId, openid]
    )
    if (reminder) {
      await connection.execute(
        `UPDATE user_watering_reminder_events
         SET status = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND _openid = ?`,
        [reminder.id, openid]
      )
    }
    await connection.execute(
      `INSERT INTO user_watering_events
         (_openid, user_plant_id, event_date, amount_label, amount_ml, source, plan_id)
       VALUES (?, ?, ?, NULL, NULL, 'reminder_complete', ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [openid, plantId, wateredDate, completedPlanId]
    )
  })

  return {
    statusCode: 200,
    data: {
      plantId,
      lastWatered: completedDate || wateredDate,
      nextWater: null,
      wateringReminder: null,
      planId: completedPlanId
    },
    message: '浇水已记录'
  }
}

async function undoWateringReminder(openid, body = {}) {
  const plantId = Number(body.plantId)
  if (!plantId) {
    return { statusCode: 400, data: null, message: '缺少植物ID' }
  }
  const requestedPlanId = String(body.planId || '').trim().slice(0, 128)
  let restoredDate = null
  let restoredReminder = null
  await runInNativeTransaction(async connection => {
    const [plantRows] = await connection.execute(
      `SELECT id
       FROM user_plant_instances
       WHERE id = ? AND _openid = ?
       FOR UPDATE`,
      [plantId, openid]
    )
    if (!plantRows?.[0]) {
      const error = new Error('植物不存在或无权限')
      error.statusCode = 404
      throw error
    }
    const reminderParams = requestedPlanId
      ? [openid, plantId, requestedPlanId]
      : [openid, plantId]
    const reminderWhere = requestedPlanId
      ? `AND plan_id = ? AND status = 'completed'`
      : `AND status = 'completed'`
    const [reminderRows] = await connection.execute(
      `SELECT id, plan_id, last_watered, next_water_date
       FROM user_watering_reminder_events
       WHERE _openid = ? AND user_plant_id = ? ${reminderWhere}
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      reminderParams
    )
    const reminder = reminderRows?.[0]
    if (!reminder) {
      const error = new Error('没有可撤销的浇水记录')
      error.statusCode = 409
      throw error
    }
    const planId = String(reminder.plan_id || '').slice(0, 128)
    const [completionEvents] = await connection.execute(
      `SELECT event_date
       FROM user_watering_events
       WHERE _openid = ? AND user_plant_id = ?
         AND source = 'reminder_complete'
         AND plan_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [openid, plantId, reminder.plan_id]
    )
    const completedDate = completionEvents?.[0]?.event_date || getTodayInChina()
    restoredDate = reminder.last_watered || null
    restoredReminder = {
      planId,
      nextWaterDate: reminder.next_water_date || null
    }
    await connection.execute(
      `UPDATE user_watering_reminder_events
       SET status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND _openid = ?`,
      [reminder.id, openid]
    )
    await connection.execute(
      `UPDATE user_plant_instances
       SET last_watered = ?, next_water = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND _openid = ?`,
      [restoredDate, reminder.next_water_date || null, plantId, openid]
    )
    await connection.execute(
      `INSERT INTO user_watering_events
         (_openid, user_plant_id, event_date, amount_label, amount_ml, source, plan_id)
       VALUES (?, ?, ?, NULL, NULL, 'reminder_undo', ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [openid, plantId, completedDate, planId]
    )
  })
  return {
    statusCode: 200,
    data: {
      plantId,
      lastWatered: restoredDate,
      nextWater: restoredReminder.nextWaterDate,
      planId: restoredReminder.planId
    },
    message: '已撤销这次浇水记录，后续建议会重新计算'
  }
}

module.exports = {
  ACTIVE_STATUS,
  attachWateringReminderStateToList,
  completeWateringReminder,
  undoWateringReminder,
  getLatestWateringReminder,
  mapReminderRow,
  readWateringReminder,
  saveWateringReminder,
  _test: {
    mapReminderRow,
    normalizeIsoLikeTime,
    normalizeNextTime,
    resolveLastWatered,
    resolveWateredDate,
    getTodayInChina
  }
}
