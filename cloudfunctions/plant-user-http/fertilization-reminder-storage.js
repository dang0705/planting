'use strict'

const { models } = require('/opt/utils/cloudbase')
const {
  mapReminderRow,
  resolveTodayDate,
  _test: { normalizeDate, normalizeNextTime }
} = require('./fertilization-reminder-mapper')

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
