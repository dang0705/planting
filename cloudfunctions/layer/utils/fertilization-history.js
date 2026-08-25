'use strict'

const FERTILIZER_TYPES = new Set(['liquid', 'slowRelease'])
const SOURCES = new Set(['reminder_setup', 'reminder_complete', 'manual', 'qa'])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

class FertilizationHistoryUnavailableError extends Error {
  constructor(cause) {
    super('施肥历史暂时无法读取')
    this.name = 'FertilizationHistoryUnavailableError'
    this.code = 'FERTILIZATION_HISTORY_UNAVAILABLE'
    this.cause = cause
  }
}

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
  } catch (error) {
    throw new FertilizationHistoryUnavailableError(error)
  }
}

async function getUserAssertedFertilizationBaseline(models, openid, userPlantId) {
  try {
    const result = await models.$runSQL(
      `SELECT id, user_plant_id, plan_id, fertilizer_type, last_applied_date,
              last_date_source, created_at
       FROM user_fertilization_reminder_events
       WHERE _openid = {{openid}}
         AND user_plant_id = {{userPlantId}}
         AND last_date_source = 'user_asserted'
         AND NOT (last_applied_date <=> NULL)
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      { openid, userPlantId: Number(userPlantId) }
    )
    const row = result?.data?.executeResultList?.[0]
    if (!row) {
      return null
    }
    const date = normalizeDate(row.last_applied_date)
    const fertilizerType = normalizeFertilizerType(row.fertilizer_type)
    if (!date || !fertilizerType) {
      const error = new Error('用户补录的施肥日期无法识别')
      error.code = 'FERTILIZATION_HISTORY_INVALID'
      throw error
    }
    return {
      id: Number(row.id),
      date,
      fertilized: false,
      fertilizerType,
      amount: null,
      amountUnit: null,
      source: 'user_asserted',
      planId: row.plan_id || null,
      createdAt: row.created_at || '',
      isUserAsserted: true
    }
  } catch (error) {
    if (error?.code === 'FERTILIZATION_HISTORY_INVALID') {
      throw error
    }
    throw new FertilizationHistoryUnavailableError(error)
  }
}

async function getUserPlantFertilizationHistory(models, openid, userPlantId, limit = 20) {
  const events = await getUserPlantFertilizationEvents(models, openid, userPlantId, limit)
  if (events.length) {
    return events
  }
  const baseline = await getUserAssertedFertilizationBaseline(models, openid, userPlantId)
  return baseline ? [baseline] : []
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
       ({{openid}}, {{userPlantId}}, {{eventDate}}, {{fertilizerType}},
        NULLIF({{amountValue}}, 'null'), NULLIF({{amountUnit}}, 'null'),
        {{source}}, {{planId}})
     ON DUPLICATE KEY UPDATE id = id`,
    params
  )
  return params
}

module.exports = {
  getUserPlantFertilizationEvents,
  getUserPlantFertilizationHistory,
  getUserAssertedFertilizationBaseline,
  FertilizationHistoryUnavailableError,
  insertFertilizationEvent,
  mapFertilizationEventRow,
  _test: { normalizeDate, normalizeFertilizerType, normalizeSource }
}
