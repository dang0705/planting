'use strict'

const { models } = require('/opt/utils/cloudbase')
const fertilizationHistory = require('/opt/utils/fertilization-history')
const {
  calculateFertilizationCheck,
  evaluateScheduleConditions,
  evaluateMonthlyRule,
  isFertilizationGuardActive,
  normalizeConditionAnswers,
  parseDate
} = require('/opt/utils/fertilization-reminder-planner')
const { mapReminderRow, resolveTodayDate } = require('./fertilization-reminder-storage')

const ACTIVE_STATUS = 'active'
const PENDING_STATUS = 'pending'
const PENDING_TTL_MINUTES = 15
const NEXT_TIME = '09:00:00'
const FERTILIZER_TYPES = new Set(['liquid', 'slowRelease'])
const REMINDER_KINDS = new Set(['normal', 'first_confirmation'])

function normalizeDate(value) {
  const text = String(value || '').trim()
  return parseDate(text) ? text : ''
}

function normalizeFertilizerType(value) {
  const type = String(value || '').trim()
  return FERTILIZER_TYPES.has(type) ? type : ''
}

function normalizeReminderKind(value) {
  const kind = String(value || '').trim()
  return REMINDER_KINDS.has(kind) ? kind : 'normal'
}

function normalizeNextTime(date) {
  return `${date} ${NEXT_TIME}`
}

function buildPlanId(plantId) {
  return `fertilization_check_${Number(plantId)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildRuleSnapshot({
  plant,
  fertilizerType,
  ruleMonth,
  rule,
  reminderKind,
  confirmationReasons = [],
  conditionAnswers = {},
  fertilizerTypeChangeConfirmed = false,
  historyLastFertilizerType = '',
  lastDateSource = ''
}) {
  return {
    schemaVersion: 1,
    genus: plant?.genus || '',
    plantName: plant?.displayName || plant?.canonicalName || '',
    ruleMonth,
    fertilizerType,
    reminderKind: normalizeReminderKind(reminderKind),
    confirmationReasons: Array.isArray(confirmationReasons) ? confirmationReasons : [],
    conditionCodes: rule?.schedule?.conditionCodes || [],
    setupConfirmations: {
      conditions: true,
      fertilizerTypeChange: Boolean(fertilizerTypeChangeConfirmed)
    },
    conditionAnswers: normalizeConditionAnswers(conditionAnswers),
    historyLastFertilizerType: String(historyLastFertilizerType || '').trim(),
    lastDateSource: String(lastDateSource || '').trim(),
    displayText: rule.displayText,
    schedule: rule.schedule,
    sourceNames: Array.isArray(rule.sourceNames) ? rule.sourceNames : []
  }
}

function parseRuleSnapshot(row = {}) {
  if (row.rule_snapshot_json && typeof row.rule_snapshot_json === 'object') {
    return row.rule_snapshot_json
  }
  try {
    return JSON.parse(String(row.rule_snapshot_json_text || row.rule_snapshot_json || '{}'))
  } catch {
    return {}
  }
}

function resolveReminderConfirmationReasons({ plant, reminderKind, snapshot, evaluation }) {
  const reasons = new Set(
    Array.isArray(snapshot?.confirmationReasons) ? snapshot.confirmationReasons : []
  )
  if (normalizeReminderKind(reminderKind || snapshot?.reminderKind) === 'first_confirmation') {
    reasons.add('first_confirmation')
  }
  if (evaluation?.conditionEvaluation?.requirements?.length) {
    reasons.add('condition_rule')
  }
  if (plant?.healthStatus === 'danger') {
    reasons.add('plant_health')
  }
  return [...reasons]
}

async function getLatestFertilizationEvent(openid, plantId) {
  const events =
    typeof fertilizationHistory.getUserPlantFertilizationHistory === 'function'
      ? await fertilizationHistory.getUserPlantFertilizationHistory(models, openid, plantId, 20)
      : await fertilizationHistory.getUserPlantFertilizationEvents(models, openid, plantId, 20)
  if (!Array.isArray(events)) {
    return null
  }
  const invalidEvent = events.find(event => !event?.date || !event?.fertilizerType)
  if (invalidEvent) {
    const error = new Error('施肥历史存在无法识别的记录')
    error.code = 'FERTILIZATION_HISTORY_INVALID'
    throw error
  }
  return events[0] || null
}

function currentMonthRule(plant, fertilizerType, today) {
  const month = Number(String(today).slice(5, 7))
  const monthly = plant?.fertilizationMonthly
  if (!monthly?.available) {
    return { month, evaluation: { kind: 'unavailable', available: false } }
  }
  const evaluation = evaluateMonthlyRule(monthly, fertilizerType, month)
  if (evaluation.available && !evaluation.reliable) {
    return {
      month,
      evaluation: { ...evaluation, kind: 'unavailable', available: false, reason: 'source_missing' }
    }
  }
  return { month, evaluation }
}

async function queryActive(openid, plantId) {
  const result = await models.$runSQL(
    `SELECT
       id, user_plant_id, plan_id, status, reminder_kind, fertilizer_type, rule_month,
       CAST(rule_snapshot_json AS CHAR) AS rule_snapshot_json_text,
       last_applied_date, last_date_source, next_check_date, next_time,
       completed_date, CAST(calendar_payload_json AS CHAR) AS calendar_payload_json_text,
       expires_at, created_at, updated_at
     FROM user_fertilization_reminder_events
     WHERE _openid = {{openid}}
       AND user_plant_id = {{plantId}}
       AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    { openid, plantId: Number(plantId) }
  )
  return result?.data?.executeResultList?.[0] || null
}

async function queryPlan(openid, planId, statuses = []) {
  const statusSql = statuses.length
    ? `AND status IN (${statuses.map(status => `'${status}'`).join(',')})`
    : ''
  const result = await models.$runSQL(
    `SELECT
       id, user_plant_id, plan_id, status, reminder_kind, fertilizer_type, rule_month,
       CAST(rule_snapshot_json AS CHAR) AS rule_snapshot_json_text,
       last_applied_date, last_date_source, next_check_date, next_time,
       completed_date, CAST(calendar_payload_json AS CHAR) AS calendar_payload_json_text,
       expires_at, created_at, updated_at
     FROM user_fertilization_reminder_events
     WHERE _openid = {{openid}}
       AND plan_id = {{planId}}
       ${statusSql}
     ORDER BY created_at DESC
     LIMIT 1`,
    { openid, planId: String(planId || '').slice(0, 160) }
  )
  return result?.data?.executeResultList?.[0] || null
}

async function createPendingPlan({
  openid,
  plant,
  plantId,
  fertilizerType,
  lastAppliedDate,
  lastDateSource,
  reminderKind,
  confirmationReasons,
  conditionAnswers = {},
  fertilizerTypeChangeConfirmed = false,
  historyLastFertilizerType = '',
  today = resolveTodayDate()
}) {
  const { month, evaluation } = currentMonthRule(plant, fertilizerType, today)
  if (plant?.healthStatus === 'danger') {
    return {
      statusCode: 422,
      data: {
        currentMonthEvaluation: evaluation,
        ruleMonth: month,
        blockingReason: 'plant_health'
      },
      message: '植物当前状态异常，暂不安排施肥提醒'
    }
  }
  if (isFertilizationGuardActive(plant?.fertilizationGuard, today)) {
    return {
      statusCode: 422,
      data: {
        currentMonthEvaluation: evaluation,
        ruleMonth: month,
        blockingReason: 'fertilization_guard',
        fertilizationGuard: plant.fertilizationGuard
      },
      message: '当前处于暂缓施肥状态，暂不安排施肥提醒'
    }
  }
  if (evaluation.kind === 'pause') {
    return {
      statusCode: 422,
      data: {
        currentMonthEvaluation: evaluation,
        ruleMonth: month,
        blockingReason: 'monthly_pause'
      },
      message: '本月按表暂停施肥，暂不创建提醒'
    }
  }
  if (evaluation.kind === 'avoid') {
    return {
      statusCode: 422,
      data: {
        currentMonthEvaluation: evaluation,
        ruleMonth: month,
        blockingReason: 'monthly_avoid'
      },
      message: '本月按表不建议施肥，暂不创建提醒'
    }
  }
  if (!evaluation.available) {
    return {
      statusCode: 422,
      data: {
        currentMonthEvaluation: evaluation,
        ruleMonth: month,
        conditionRequirements: [],
        confirmationReasons: []
      },
      message: '本月没有可用于设置提醒的固定施肥周期'
    }
  }

  const conditionEvaluation = evaluateScheduleConditions(evaluation.schedule, conditionAnswers)
  if (!conditionEvaluation.valid) {
    return {
      statusCode: 422,
      data: {
        currentMonthEvaluation: { ...evaluation, conditionEvaluation },
        ruleMonth: month,
        conditionRequirements: conditionEvaluation.requirements,
        conditionStatus: conditionEvaluation.status,
        missingConditionCodes: conditionEvaluation.missingCodes,
        unmetConditionCodes: conditionEvaluation.unmetCodes,
        unknownConditionCodes: conditionEvaluation.unknownCodes,
        confirmationReasons: ['condition_rule']
      },
      message:
        conditionEvaluation.status === 'unmet'
          ? '当前情况不满足本月施肥条件，暂不创建提醒'
          : '请先确认本月施肥条件'
    }
  }

  const calculation = calculateFertilizationCheck({
    schedule: evaluation.schedule,
    lastAppliedDate,
    lastDateSource,
    referenceDate: today
  })
  if (!calculation.valid || !calculation.nextCheckDate) {
    return { statusCode: 422, data: null, message: '施肥周期无法生成提醒日期' }
  }

  const planId = buildPlanId(plantId)
  const snapshot = buildRuleSnapshot({
    plant,
    fertilizerType,
    ruleMonth: month,
    rule: evaluation.cell,
    reminderKind,
    confirmationReasons,
    conditionAnswers,
    fertilizerTypeChangeConfirmed,
    historyLastFertilizerType,
    lastDateSource: calculation.lastDateSource
  })
  const params = {
    openid,
    plantId: Number(plantId),
    planId,
    status: PENDING_STATUS,
    fertilizerType,
    ruleMonth: month,
    ruleSnapshotJson: JSON.stringify(snapshot),
    lastAppliedDate: calculation.lastAppliedDate || '',
    lastDateSource: calculation.lastDateSource,
    nextCheckDate: calculation.nextCheckDate,
    nextTime: normalizeNextTime(calculation.nextCheckDate)
  }
  await models.$runSQL(
    `UPDATE user_fertilization_reminder_events
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}} AND user_plant_id = {{plantId}} AND status = 'pending'`,
    params
  )
  await models.$runSQL(
    `INSERT INTO user_fertilization_reminder_events
       (_openid, user_plant_id, plan_id, status, reminder_kind, fertilizer_type, rule_month,
        rule_snapshot_json, last_applied_date, last_date_source, next_check_date, next_time, expires_at)
     VALUES
       ({{openid}}, {{plantId}}, {{planId}}, {{status}}, {{reminderKind}}, {{fertilizerType}}, {{ruleMonth}},
        {{ruleSnapshotJson}}, NULLIF({{lastAppliedDate}}, ''), {{lastDateSource}}, {{nextCheckDate}},
        {{nextTime}}, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE))`,
    { ...params, reminderKind: normalizeReminderKind(reminderKind) }
  )
  return {
    statusCode: 200,
    message: '施肥提醒日期已生成',
    data: {
      planId,
      plantId: Number(plantId),
      fertilizerType,
      reminderKind: normalizeReminderKind(reminderKind),
      confirmationReasons: Array.isArray(confirmationReasons) ? confirmationReasons : [],
      ruleMonth: month,
      ruleSnapshot: snapshot,
      nextCheckDate: calculation.nextCheckDate,
      nextTime: `${calculation.nextCheckDate}T${NEXT_TIME}`,
      dueNow: calculation.dueNow,
      lastAppliedDate: calculation.lastAppliedDate,
      lastDateSource: calculation.lastDateSource,
      earliestDate: calculation.earliestDate,
      latestDate: calculation.latestDate,
      normalCheckDate: calculation.normalCheckDate,
      pendingExpiresInMinutes: PENDING_TTL_MINUTES
    }
  }
}

module.exports = {
  ACTIVE_STATUS,
  PENDING_STATUS,
  PENDING_TTL_MINUTES,
  buildRuleSnapshot,
  createPendingPlan,
  currentMonthRule,
  getLatestFertilizationEvent,
  mapReminderRow,
  normalizeDate,
  normalizeFertilizerType,
  normalizeNextTime,
  normalizeReminderKind,
  parseRuleSnapshot,
  queryActive,
  queryPlan,
  resolveReminderConfirmationReasons,
  resolveTodayDate
}
