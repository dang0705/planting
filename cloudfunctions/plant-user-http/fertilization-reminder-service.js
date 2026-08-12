'use strict'

const { models } = require('/opt/utils/cloudbase')
const { getUserPlantInstanceById } = require('/opt/utils/plant-knowledge')
const {
  getUserPlantFertilizationEvents,
  insertFertilizationEvent
} = require('/opt/utils/fertilization-history')
const {
  calculateFertilizationCheck,
  evaluateMonthlyRule,
  parseDate
} = require('/opt/utils/fertilization-reminder-planner')
const {
  attachFertilizationReminderStateToList,
  mapReminderRow,
  resolveTodayDate
} = require('./fertilization-reminder-storage')

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
  confirmationReasons = []
}) {
  return {
    schemaVersion: 1,
    genus: plant?.genus || '',
    plantName: plant?.displayName || plant?.canonicalName || '',
    ruleMonth,
    fertilizerType,
    reminderKind: normalizeReminderKind(reminderKind),
    confirmationReasons: Array.isArray(confirmationReasons) ? confirmationReasons : [],
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
  if (['conditional', 'event'].includes(evaluation?.kind)) {
    reasons.add(`${evaluation.kind}_rule`)
  }
  if (plant?.healthStatus === 'danger') {
    reasons.add('plant_health')
  }
  return [...reasons]
}

async function getLatestFertilizationEvent(openid, plantId) {
  const events = await getUserPlantFertilizationEvents(models, openid, plantId, 1)
  return Array.isArray(events) && events.length ? events[0] : null
}

function currentMonthRule(plant, fertilizerType, today) {
  const month = Number(String(today).slice(5, 7))
  const monthly = plant?.fertilizationMonthly
  if (!monthly?.available) {
    return { month, evaluation: { kind: 'unavailable', available: false } }
  }
  const evaluation = evaluateMonthlyRule(monthly, fertilizerType, month)
  if (evaluation.available && !evaluation.sourceNames.length) {
    return {
      month,
      evaluation: { ...evaluation, kind: 'unavailable', available: false, reason: 'source_missing' }
    }
  }
  return { month, evaluation }
}

async function assertUserPlant(openid, plantId) {
  const plant = await getUserPlantInstanceById(openid, Number(plantId))
  return plant || null
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
  today = resolveTodayDate()
}) {
  const { month, evaluation } = currentMonthRule(plant, fertilizerType, today)
  if (!evaluation.available) {
    const requiresExtraConfirmation = ['conditional', 'event'].includes(evaluation.kind)
    return {
      statusCode: 422,
      data: {
        currentMonthEvaluation: evaluation,
        ruleMonth: month,
        requiresExtraConfirmation,
        confirmationReasons: requiresExtraConfirmation ? [`${evaluation.kind}_rule`] : []
      },
      message: requiresExtraConfirmation
        ? '本月规则需要额外确认，暂不能自动计算提醒日期'
        : '本月没有可用于设置提醒的固定施肥周期'
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
    confirmationReasons
  })
  const params = {
    openid,
    plantId: Number(plantId),
    planId,
    status: PENDING_STATUS,
    fertilizerType,
    ruleMonth: month,
    ruleSnapshotJson: JSON.stringify(snapshot),
    // CloudBase SQL template bindings stringify null. Keep the nullable DATE
    // value as an empty binding and let SQL turn it into a real NULL instead.
    lastAppliedDate: calculation.lastAppliedDate || '',
    lastDateSource: calculation.lastDateSource,
    nextCheckDate: calculation.nextCheckDate,
    nextTime: normalizeNextTime(calculation.nextCheckDate)
  }
  await models.$runSQL(
    `UPDATE user_fertilization_reminder_events
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}}
       AND user_plant_id = {{plantId}}
       AND status = 'pending'`,
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

async function readFertilizationReminder(openid, plantId) {
  const plant = await assertUserPlant(openid, plantId)
  if (!plant) {
    return { statusCode: 404, message: '植物不存在或无权限', data: null }
  }
  const row = await queryActive(openid, plantId)
  if (!row) {
    return { statusCode: 200, message: '暂无施肥提醒', data: null }
  }
  const today = resolveTodayDate()
  const reminder = mapReminderRow(row, today)
  const rule = currentMonthRule(plant, reminder.fertilizerType, today)
  const confirmationReasons = resolveReminderConfirmationReasons({
    plant,
    reminderKind: reminder.reminderKind,
    snapshot: reminder.ruleSnapshot,
    evaluation: rule.evaluation
  })
  return {
    statusCode: 200,
    message: '读取成功',
    data: {
      ...reminder,
      currentMonthEvaluation: rule.evaluation,
      currentRuleMonth: rule.month,
      requiresExtraConfirmation: confirmationReasons.length > 0,
      confirmationReasons
    }
  }
}

async function previewFertilizationReminder(openid, body = {}) {
  const plantId = Number(body.plantId)
  const fertilizerType = normalizeFertilizerType(body.fertilizerType)
  if (!plantId || !fertilizerType) {
    return { statusCode: 400, message: '请选择肥料类型', data: null }
  }
  const plant = await assertUserPlant(openid, plantId)
  if (!plant) {
    return { statusCode: 404, message: '植物不存在或无权限', data: null }
  }
  const active = await queryActive(openid, plantId)
  if (active) {
    return { statusCode: 409, message: '已有施肥提醒，请先结束或重设旧提醒', data: null }
  }
  const latestEvent = await getLatestFertilizationEvent(openid, plantId)
  const lastAppliedDate = latestEvent?.date || null
  const lastDateSource = latestEvent ? 'recorded' : 'estimated'
  const reminderKind = latestEvent ? 'normal' : 'first_confirmation'
  const confirmationReasons = []
  if (latestEvent && latestEvent.fertilizerType !== fertilizerType) {
    confirmationReasons.push('fertilizer_type_changed')
  }
  return createPendingPlan({
    openid,
    plant,
    plantId,
    fertilizerType,
    lastAppliedDate: lastAppliedDate || null,
    lastDateSource,
    reminderKind,
    confirmationReasons
  })
}

async function confirmFertilizationReminder(openid, body = {}) {
  const planId = String(body.planId || '').trim()
  if (!planId) {
    return { statusCode: 400, message: '缺少检查计划', data: null }
  }
  const existing = await queryPlan(openid, planId, [PENDING_STATUS, ACTIVE_STATUS])
  if (!existing) {
    return { statusCode: 409, message: '检查计划已过期，请重新生成', data: null }
  }
  if (body.plantId && Number(body.plantId) !== Number(existing.user_plant_id)) {
    return { statusCode: 403, message: '检查计划与植物不匹配', data: null }
  }
  if (existing.status === ACTIVE_STATUS) {
    return { statusCode: 200, message: '已同步', data: mapReminderRow(existing) }
  }
  if (
    existing.expires_at &&
    new Date(String(existing.expires_at).replace(' ', 'T')) <= new Date()
  ) {
    return { statusCode: 409, message: '检查计划已过期，请重新生成', data: null }
  }
  const dueNow = normalizeDate(existing.next_check_date) <= resolveTodayDate()
  const calendarPayload =
    body.calendarPayload && typeof body.calendarPayload === 'object'
      ? { ...body.calendarPayload, createdBy: 'uni.addPhoneCalendar', status: 'created' }
      : null
  if (!dueNow && !calendarPayload) {
    return { statusCode: 400, message: '请先添加到手机日历', data: null }
  }
  const params = {
    openid,
    planId,
    calendarPayloadJson: calendarPayload ? JSON.stringify(calendarPayload) : null
  }
  await models.$runSQL(
    `UPDATE user_fertilization_reminder_events
     SET status = CASE
           WHEN status = 'pending' AND plan_id = {{planId}} THEN 'active'
           WHEN status = 'active' AND user_plant_id = (
             SELECT user_plant_id FROM (
               SELECT user_plant_id FROM user_fertilization_reminder_events
               WHERE _openid = {{openid}} AND plan_id = {{planId}} LIMIT 1
             ) AS pending_plan
           ) THEN 'superseded'
           ELSE status
         END,
         calendar_payload_json = CASE
           WHEN status = 'pending' AND plan_id = {{planId}} THEN {{calendarPayloadJson}}
           ELSE calendar_payload_json
         END,
         expires_at = CASE
           WHEN status = 'pending' AND plan_id = {{planId}} THEN NULL
           ELSE expires_at
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}}
       AND EXISTS (
         SELECT id FROM (
           SELECT id FROM user_fertilization_reminder_events
           WHERE _openid = {{openid}}
             AND plan_id = {{planId}}
             AND status = 'pending'
             AND expires_at > CURRENT_TIMESTAMP
         ) AS valid_pending
       )
       AND (
         (status = 'pending' AND plan_id = {{planId}})
         OR (
           status = 'active' AND user_plant_id = (
             SELECT user_plant_id FROM (
               SELECT user_plant_id FROM user_fertilization_reminder_events
               WHERE _openid = {{openid}} AND plan_id = {{planId}} LIMIT 1
             ) AS pending_plan_for_active
           )
         )
       )`,
    params
  )
  if (existing.last_date_source === 'recorded' && existing.last_applied_date) {
    await insertFertilizationEvent(models, openid, existing.user_plant_id, {
      date: existing.last_applied_date,
      fertilizerType: existing.fertilizer_type,
      source: 'reminder_setup',
      planId: `${planId}:setup`
    })
  }
  const row = await queryPlan(openid, planId, [ACTIVE_STATUS])
  if (!row) {
    return { statusCode: 409, message: '检查计划已过期，请重新生成', data: null }
  }
  return { statusCode: 200, message: '施肥提醒已保存', data: mapReminderRow(row) }
}

async function completeFertilizationReminder(openid, body = {}) {
  const plantId = Number(body.plantId)
  const planId = String(body.planId || '').trim()
  if (!plantId || !planId) {
    return { statusCode: 400, message: '缺少提醒信息', data: null }
  }
  const plant = await assertUserPlant(openid, plantId)
  const row = await queryPlan(openid, planId, [ACTIVE_STATUS, 'completed'])
  if (!plant || !row || Number(row.user_plant_id) !== plantId) {
    return { statusCode: 404, message: '提醒不存在或无权限', data: null }
  }
  if (row.status === 'completed') {
    return {
      statusCode: 200,
      message: '这次施肥已经记录过了',
      data: {
        completedDate: normalizeDate(row.completed_date),
        alreadyCompleted: true,
        nextPreview: null,
        nextPreviewStatus: 409,
        nextPreviewMessage: '这次提醒已经完成'
      }
    }
  }
  const today = resolveTodayDate()
  if (normalizeDate(row.next_check_date) > today) {
    return { statusCode: 409, message: '还没到施肥提醒日期', data: null }
  }
  const currentRule = currentMonthRule(plant, row.fertilizer_type, today)
  const snapshot = parseRuleSnapshot(row)
  const confirmationReasons = resolveReminderConfirmationReasons({
    plant,
    reminderKind: row.reminder_kind,
    snapshot,
    evaluation: currentRule.evaluation
  })
  const canRecordForRule = ['interval', 'conditional', 'event'].includes(
    currentRule.evaluation.kind
  )
  if (!canRecordForRule) {
    return {
      statusCode: 422,
      message: '本月不建议施肥，不能记录为已施肥',
      data: { currentMonthEvaluation: currentRule.evaluation }
    }
  }
  if (confirmationReasons.length && body.extraConfirmation !== true) {
    return {
      statusCode: 409,
      message: '请先确认当前植物状态和本月规则，再记录施肥',
      data: {
        currentMonthEvaluation: currentRule.evaluation,
        requiresExtraConfirmation: true,
        confirmationReasons
      }
    }
  }
  await insertFertilizationEvent(models, openid, plantId, {
    date: today,
    fertilizerType: row.fertilizer_type,
    source: 'reminder_complete',
    planId
  })
  await models.$runSQL(
    `UPDATE user_fertilization_reminder_events
     SET status = 'completed', completed_date = {{today}}, updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}} AND plan_id = {{planId}} AND status = 'active'`,
    { openid, planId, today }
  )
  const nextPreview = await createPendingPlan({
    openid,
    plant,
    plantId,
    fertilizerType: row.fertilizer_type,
    lastAppliedDate: today,
    lastDateSource: 'recorded',
    reminderKind: 'normal',
    confirmationReasons: [],
    today
  })
  return {
    statusCode: 200,
    message: '已记录今天施肥',
    data: {
      completedDate: today,
      nextPreview: nextPreview.statusCode === 200 ? nextPreview.data : null,
      nextPreviewStatus: nextPreview.statusCode,
      nextPreviewMessage: nextPreview.message
    }
  }
}

async function dismissFertilizationReminder(openid, body = {}) {
  const plantId = Number(body.plantId)
  const planId = String(body.planId || '').trim()
  if (!plantId || !planId) {
    return { statusCode: 400, message: '缺少提醒信息', data: null }
  }
  const status = body.reason === 'reconfigure' ? 'superseded' : 'dismissed'
  const result = await models.$runSQL(
    `UPDATE user_fertilization_reminder_events
     SET status = {{status}}, updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}} AND user_plant_id = {{plantId}}
       AND plan_id = {{planId}} AND status = 'active'`,
    { openid, plantId, planId, status }
  )
  return {
    statusCode: 200,
    message: result ? '本次施肥提醒已跳过' : '本次施肥提醒已跳过',
    data: { plantId, planId, status }
  }
}

async function cancelFertilizationReminder(openid, body = {}) {
  const planId = String(body.planId || '').trim()
  if (!planId) {
    return { statusCode: 400, message: '缺少检查计划', data: null }
  }
  await models.$runSQL(
    `UPDATE user_fertilization_reminder_events
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}} AND plan_id = {{planId}} AND status = 'pending'`,
    { openid, planId }
  )
  return { statusCode: 200, message: '待同步计划已取消', data: { planId, status: 'cancelled' } }
}

module.exports = {
  ACTIVE_STATUS,
  attachFertilizationReminderStateToList,
  cancelFertilizationReminder,
  completeFertilizationReminder,
  confirmFertilizationReminder,
  dismissFertilizationReminder,
  mapReminderRow,
  previewFertilizationReminder,
  readFertilizationReminder,
  resolveTodayDate,
  _test: {
    buildRuleSnapshot,
    currentMonthRule,
    normalizeDate,
    normalizeFertilizerType,
    normalizeNextTime
  }
}
