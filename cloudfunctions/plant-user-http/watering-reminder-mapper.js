'use strict'

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
    nextWaterTime: nextTime ? nextTime.split('T')[1] || '' : '',
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

module.exports = { mapReminderRow }
