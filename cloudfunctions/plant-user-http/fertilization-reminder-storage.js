'use strict'

const { models } = require('/opt/utils/cloudbase')
const { parseDate } = require('/opt/utils/fertilization-reminder-planner')

const ACTIVE_STATUS = 'active'
const NEXT_TIME = '09:00:00'

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
  return parseDate(text) ? text : ''
}

function resolveTodayDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function normalizeNextTime(date) {
  return `${date} ${NEXT_TIME}`
}

function mapReminderRow(row = {}, today = resolveTodayDate()) {
  const ruleSnapshot = parseJsonText(row.rule_snapshot_json_text ?? row.rule_snapshot_json, {})
  const calendarPayload = parseJsonText(
    row.calendar_payload_json_text ?? row.calendar_payload_json,
    null
  )
  const nextCheckDate = normalizeDate(row.next_check_date)
  return {
    id: Number(row.id),
    plantId: Number(row.user_plant_id),
    planId: String(row.plan_id || ''),
    status: String(row.status || ''),
    reminderKind:
      row.reminder_kind === 'first_confirmation' ||
      ruleSnapshot.reminderKind === 'first_confirmation'
        ? 'first_confirmation'
        : 'normal',
    fertilizerType: String(row.fertilizer_type || ''),
    ruleMonth: Number(row.rule_month || ruleSnapshot.ruleMonth || 0) || null,
    ruleSnapshot,
    lastAppliedDate: normalizeDate(row.last_applied_date) || null,
    lastDateSource: row.last_date_source || null,
    nextCheckDate,
    nextTime: row.next_time
      ? String(row.next_time).replace(' ', 'T')
      : normalizeNextTime(nextCheckDate),
    completedDate: normalizeDate(row.completed_date) || null,
    calendarPayload,
    expiresAt: row.expires_at || null,
    active: row.status === ACTIVE_STATUS,
    isDue: Boolean(nextCheckDate && nextCheckDate <= today),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  }
}

async function attachFertilizationReminderStateToList(openid, data = {}) {
  const list = Array.isArray(data.list) ? data.list : []
  const ids = list.map(item => Number(item.id)).filter(Boolean)
  if (!ids.length) {
    return data
  }
  try {
    const result = await models.$runSQL(
      `SELECT
         id, user_plant_id, plan_id, status, reminder_kind, fertilizer_type, rule_month,
         CAST(rule_snapshot_json AS CHAR) AS rule_snapshot_json_text,
         last_applied_date, last_date_source, next_check_date, next_time,
         completed_date, CAST(calendar_payload_json AS CHAR) AS calendar_payload_json_text,
         expires_at, created_at, updated_at
       FROM user_fertilization_reminder_events
       WHERE _openid = {{openid}}
         AND user_plant_id IN (${ids.join(',')})
         AND status = 'active'
       ORDER BY created_at DESC`,
      { openid }
    )
    const byPlant = new Map()
    const today = resolveTodayDate()
    for (const row of result?.data?.executeResultList || []) {
      const plantId = Number(row.user_plant_id)
      if (!byPlant.has(plantId)) {
        byPlant.set(plantId, mapReminderRow(row, today))
      }
    }
    return {
      ...data,
      list: list.map(item => ({
        ...item,
        fertilizationReminder: byPlant.get(Number(item.id)) || null
      }))
    }
  } catch (error) {
    console.warn('fertilization reminder list state unavailable:', error?.message || error)
    return data
  }
}

module.exports = {
  attachFertilizationReminderStateToList,
  mapReminderRow,
  resolveTodayDate,
  _test: { normalizeDate, normalizeNextTime }
}
