'use strict'

const ACTIVE_STATUS = 'active'
const NEXT_TIME = '09:00:00'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

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

function parseDate(value) {
  const text = String(value || '').trim()
  if (!DATE_PATTERN.test(text)) {
    return null
  }
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null
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

module.exports = {
  mapReminderRow,
  resolveTodayDate,
  _test: { normalizeDate, normalizeNextTime, parseDate }
}
