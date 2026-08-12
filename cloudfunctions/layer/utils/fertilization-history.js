'use strict'

const FERTILIZER_TYPES = new Set(['liquid', 'slowRelease'])
const SOURCES = new Set(['reminder_setup', 'reminder_complete', 'manual', 'qa'])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function normalizeDate(value) {
  const text = String(value || '').trim()
  return DATE_PATTERN.test(text) ? text : ''
}

function normalizeFertilizerType(value) {
  const type = String(value || '').trim()
  return FERTILIZER_TYPES.has(type) ? type : ''
}

function normalizeSource(value) {
  const source = String(value || '').trim()
  return SOURCES.has(source) ? source : 'manual'
}

function mapFertilizationEventRow(row = {}) {
  return {
    id: Number(row.id),
    date: normalizeDate(row.event_date),
    fertilized: true,
    fertilizerType: normalizeFertilizerType(row.fertilizer_type),
    amount:
      row.amount_value === null || row.amount_value === undefined ? null : Number(row.amount_value),
    amountUnit: row.amount_unit || null,
    source: normalizeSource(row.source),
    planId: row.plan_id || null,
    createdAt: row.created_at || ''
  }
}

async function getUserPlantFertilizationEvents(models, openid, userPlantId, limit = 20) {
  try {
    const result = await models.$runSQL(
      `SELECT id, event_date, fertilizer_type, amount_value, amount_unit, source, plan_id, created_at
       FROM user_fertilization_events
       WHERE _openid = {{openid}} AND user_plant_id = {{userPlantId}}
       ORDER BY event_date DESC, id DESC LIMIT {{limit}}`,
      { openid, userPlantId: Number(userPlantId), limit: Number(limit) }
    )
    return (result?.data?.executeResultList || []).map(mapFertilizationEventRow)
  } catch {
    // 允许历史表尚未迁移的旧环境继续读取植物详情。
    return null
  }
}

async function insertFertilizationEvent(models, openid, userPlantId, event = {}) {
  const eventDate = normalizeDate(event.date || event.event_date)
  const fertilizerType = normalizeFertilizerType(event.fertilizerType || event.fertilizer_type)
  if (!eventDate || !fertilizerType) {
    return null
  }

  const planId = String(event.planId || event.plan_id || '').trim() || null
  const amountValue =
    event.amountValue === null || event.amountValue === undefined || event.amountValue === ''
      ? null
      : Number(event.amountValue)
  const normalizedAmount = Number.isFinite(amountValue) && amountValue >= 0 ? amountValue : null
  const amountUnit = String(event.amountUnit || event.amount_unit || '').trim() || null
  const source = normalizeSource(event.source)

  const params = {
    openid,
    userPlantId: Number(userPlantId),
    eventDate,
    fertilizerType,
    amountValue: normalizedAmount,
    amountUnit,
    source,
    planId
  }
  await models.$runSQL(
    `INSERT INTO user_fertilization_events
       (_openid, user_plant_id, event_date, fertilizer_type, amount_value, amount_unit, source, plan_id)
     VALUES
       ({{openid}}, {{userPlantId}}, {{eventDate}}, {{fertilizerType}}, {{amountValue}},
        {{amountUnit}}, {{source}}, {{planId}})
     ON DUPLICATE KEY UPDATE id = id`,
    params
  )
  return params
}

module.exports = {
  getUserPlantFertilizationEvents,
  insertFertilizationEvent,
  mapFertilizationEventRow,
  _test: { normalizeDate, normalizeFertilizerType, normalizeSource }
}
