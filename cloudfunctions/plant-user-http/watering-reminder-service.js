'use strict'

const { models } = require('/opt/utils/cloudbase')

const ACTIVE_STATUS = 'active'
const REMINDER_TYPE_WATER = 'water'

function parseJsonText(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  if (typeof value === 'object') {
    return value
  }
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
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

function mapReminderRow(row = {}) {
  const plannerResult = parseJsonText(row.planner_result_json_text ?? row.planner_result_json, {})
  const wateringEvents = parseJsonText(
    row.watering_events_json_text ?? row.watering_events_json,
    []
  )
  const calendarPayload = parseJsonText(
    row.calendar_payload_json_text ?? row.calendar_payload_json,
    {}
  )
  const nextTime = row.next_time ? String(row.next_time).replace(' ', 'T') : ''
  return {
    id: row.id,
    plantId: row.user_plant_id,
    planId: row.plan_id || '',
    type: row.reminder_type || REMINDER_TYPE_WATER,
    status: row.status || ACTIVE_STATUS,
    active: row.status === ACTIVE_STATUS && Boolean(nextTime),
    lastWatered: row.last_watered || '',
    nextWaterDate: row.next_water_date || '',
    nextWaterTime: nextTime,
    nextTime,
    nextWaterWindow: plannerResult.nextWaterWindow || null,
    nextWaterReason: plannerResult.nextWaterReason || '',
    amountRangeMl: plannerResult.amountRangeMl || null,
    reasonCodes: Array.isArray(plannerResult.reasonCodes) ? plannerResult.reasonCodes : [],
    wateringEvents: Array.isArray(wateringEvents) ? wateringEvents : [],
    plannerResult,
    calendarPayload,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  }
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
       AND next_time >= CURRENT_TIMESTAMP
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
  return { found: Boolean(reminder), statusCode: 200, data: reminder }
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
         AND next_time >= CURRENT_TIMESTAMP
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

  const nextWaterDate = normalizeDate(body.nextWaterDate)
  const nextTime =
    normalizeIsoLikeTime(body.nextTime) ||
    normalizeNextTime(nextWaterDate, body.nextWaterTime || body.nextTimeOfDay)
  if (!nextWaterDate || !nextTime) {
    return { statusCode: 400, data: null, message: '缺少下次浇水时间' }
  }

  const wateringEvents = Array.isArray(body.wateringEvents) ? body.wateringEvents : []
  const plannerResult =
    body.plannerResult && typeof body.plannerResult === 'object' ? body.plannerResult : {}
  const calendarPayload =
    body.calendarPayload && typeof body.calendarPayload === 'object' ? body.calendarPayload : {}
  const lastWatered = resolveLastWatered({ ...body, wateringEvents })
  const params = {
    openid,
    plantId,
    planId: String(body.planId || plannerResult.planId || `calendar_${Date.now()}`).slice(0, 128),
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

  await models.$runSQL(
    `UPDATE user_watering_reminder_events
     SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}}
       AND user_plant_id = {{plantId}}
       AND reminder_type = 'water'
       AND status = 'active'`,
    params
  )
  await models.$runSQL(
    `INSERT INTO user_watering_reminder_events
       (_openid, user_plant_id, plan_id, reminder_type, status, last_watered, next_water_date,
        next_time, watering_events_json, planner_result_json, calendar_payload_json)
     VALUES
       ({{openid}}, {{plantId}}, {{planId}}, {{reminderType}}, {{status}}, {{lastWatered}},
        {{nextWaterDate}}, {{nextTime}}, {{wateringEventsJson}}, {{plannerResultJson}},
        {{calendarPayloadJson}})`,
    params
  )
  await models.$runSQL(
    `UPDATE user_plant_instances
     SET last_watered = COALESCE({{lastWatered}}, last_watered),
         next_water = {{nextWaterDate}},
         updated_at = CURRENT_TIMESTAMP
     WHERE id = {{plantId}} AND _openid = {{openid}}`,
    params
  )

  const reminder = await getLatestWateringReminder(openid, plantId)
  return { statusCode: 200, data: reminder, message: '保存成功' }
}

module.exports = {
  ACTIVE_STATUS,
  attachWateringReminderStateToList,
  getLatestWateringReminder,
  readWateringReminder,
  saveWateringReminder,
  _test: {
    mapReminderRow,
    normalizeIsoLikeTime,
    normalizeNextTime,
    resolveLastWatered
  }
}
