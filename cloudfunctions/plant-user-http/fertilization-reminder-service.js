'use strict'

const { models } = require('/opt/utils/cloudbase')
const { getUserPlantInstanceById } = require('/opt/utils/plant-knowledge')
const {
  FertilizationHistoryUnavailableError,
  insertFertilizationEvent
} = require('/opt/utils/fertilization-history')
const {
  evaluateScheduleConditions,
  getMonthlyFertilizerOptions,
  isFertilizationGuardActive
} = require('/opt/utils/fertilization-reminder-planner')
const {
  attachFertilizationReminderStateToList,
  mapReminderRow: mapStoredReminderRow,
  resolveTodayDate
} = require('./fertilization-reminder-storage')
const {
  ACTIVE_STATUS,
  PENDING_STATUS,
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
  resolveReminderConfirmationReasons
} = require('./fertilization-reminder-domain')

function isHistoryReadError(error) {
  return (
    error instanceof FertilizationHistoryUnavailableError ||
    ['FERTILIZATION_HISTORY_UNAVAILABLE', 'FERTILIZATION_HISTORY_INVALID'].includes(error?.code)
  )
}

function isUserAssertedHistory(entry) {
  return entry?.source === 'user_asserted' || entry?.isUserAsserted === true
}

async function assertUserPlant(openid, plantId) {
  const plant = await getUserPlantInstanceById(openid, Number(plantId))
  return plant || null
}

function resolveCurrentMonthConclusion(plant, today, fertilizerType = '') {
  const month = Number(String(today).slice(5, 7))
  const monthly = plant?.fertilizationMonthly
  if (isFertilizationGuardActive(plant?.fertilizationGuard, today)) {
    return {
      status: 'monthly_deferred',
      message: '当前处于暂缓施肥状态，请先等待观察期结束。'
    }
  }
  const historyUnavailable = ['unavailable', 'unknown', 'invalid'].includes(
    plant?.fertilizationHistoryStatus
  )
  if (!monthly?.available) {
    if (historyUnavailable) {
      return {
        status: 'monthly_history_unavailable',
        message: '施肥记录暂时无法读取，暂不能生成提醒。'
      }
    }
    return { status: 'monthly_no_reliable_rule', message: '暂无可靠的月度施肥规则。' }
  }
  const selected = fertilizerType ? currentMonthRule(plant, fertilizerType, today).evaluation : null
  if (selected?.kind === 'pause') {
    return { status: 'monthly_pause', message: '本月按表暂停施肥。' }
  }
  if (selected?.kind === 'avoid') {
    return { status: 'monthly_avoid', message: '本月按表不建议施肥。' }
  }
  const evaluations = selected
    ? [selected]
    : ['liquid', 'slowRelease'].map(type => currentMonthRule(plant, type, today).evaluation)
  const options = getMonthlyFertilizerOptions(monthly, month)
  if (!options.length) {
    const special = evaluations.find(item => ['pause', 'avoid'].includes(item?.kind))
    if (special?.kind === 'pause') {
      return { status: 'monthly_pause', message: '本月按表暂停施肥。' }
    }
    if (special?.kind === 'avoid') {
      return { status: 'monthly_avoid', message: '本月按表不建议施肥。' }
    }
    if (historyUnavailable) {
      return {
        status: 'monthly_history_unavailable',
        message: '施肥记录暂时无法读取，暂不能生成提醒。'
      }
    }
    return { status: 'monthly_no_reliable_rule', message: '本月没有可靠的固定施肥周期。' }
  }
  if (historyUnavailable) {
    return {
      status: 'monthly_history_unavailable',
      message: '施肥记录暂时无法读取，暂不能生成提醒。'
    }
  }
  if (selected && !selected.reliable) {
    return { status: 'monthly_no_reliable_rule', message: '当前选择的肥料没有可靠的固定周期。' }
  }
  if (options.every(option => option.conditionEvaluation?.requirements?.length)) {
    return {
      status: 'monthly_conditions_pending',
      message: '本月按表默认不安排施肥；如仍要设置提醒，请先确认下方条件。'
    }
  }
  return { status: 'monthly_fixed_interval', message: '本月可以设置施肥提醒。' }
}

function resolveCompletionBlockReason({ plant, evaluation, due, conditionStatus = 'none', today }) {
  if (plant?.healthStatus === 'danger') {
    return 'plant_health'
  }
  if (isFertilizationGuardActive(plant?.fertilizationGuard, today)) {
    return 'fertilization_guard'
  }
  if (['unavailable', 'unknown', 'invalid'].includes(plant?.fertilizationHistoryStatus)) {
    return 'monthly_history_unavailable'
  }
  if (!evaluation?.available || !evaluation?.reliable) {
    if (['pause', 'avoid'].includes(evaluation?.kind)) {
      return `monthly_${evaluation.kind}`
    }
    return 'monthly_no_reliable_rule'
  }
  if (conditionStatus === 'unmet') {
    return 'conditions_unmet'
  }
  if (conditionStatus === 'missing') {
    return 'conditions_pending'
  }
  if (!due) {
    return 'monthly_not_due'
  }
  return ''
}

function buildCurrentMonthOptions(plant, today) {
  if (['unavailable', 'unknown', 'invalid'].includes(plant?.fertilizationHistoryStatus)) {
    return []
  }
  const month = Number(String(today).slice(5, 7))
  return getMonthlyFertilizerOptions(plant?.fertilizationMonthly, month).map(option => ({
    type: option.type,
    displayText: option.displayText,
    sourceNames: option.sourceNames,
    schedule: option.schedule,
    conditionRequirements: option.conditionEvaluation?.requirements || [],
    cell: option.cell
  }))
}

async function readFertilizationReminder(openid, plantId) {
  const plant = await assertUserPlant(openid, plantId)
  if (!plant) {
    return { statusCode: 404, message: '植物不存在或无权限', data: null }
  }
  const row = await queryActive(openid, plantId)
  if (!row) {
    const today = resolveTodayDate()
    return {
      statusCode: 200,
      message: '暂无施肥提醒',
      data: {
        active: false,
        plantId: Number(plantId),
        currentMonthConclusion: resolveCurrentMonthConclusion(plant, today),
        currentMonthOptions: buildCurrentMonthOptions(plant, today),
        fertilizationGuard: isFertilizationGuardActive(plant?.fertilizationGuard, today)
          ? plant.fertilizationGuard
          : null
      }
    }
  }
  const today = resolveTodayDate()
  const reminder = mapReminderRow(row, today)
  const rule = currentMonthRule(plant, reminder.fertilizerType, today)
  const conditionRequirements = rule.evaluation.conditionEvaluation?.requirements || []
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
      active: true,
      currentMonthEvaluation: rule.evaluation,
      currentRuleMonth: rule.month,
      currentMonthConclusion: resolveCurrentMonthConclusion(plant, today, reminder.fertilizerType),
      currentMonthOptions: buildCurrentMonthOptions(plant, today),
      conditionRequirements,
      conditionStatus: rule.evaluation.conditionEvaluation?.status || 'none',
      requiresConditionAnswers: conditionRequirements.length > 0,
      requiresMinimumIntervalAcknowledgement:
        reminder.reminderKind === 'first_confirmation' && reminder.isDue,
      requiresFertilizerTypeChangeAcknowledgement: false,
      confirmationReasons,
      completionBlockReason: resolveCompletionBlockReason({
        plant,
        evaluation: rule.evaluation,
        due: reminder.isDue,
        conditionStatus: rule.evaluation.conditionEvaluation?.status || 'none',
        today
      }),
      fertilizationGuard: isFertilizationGuardActive(plant?.fertilizationGuard, today)
        ? plant.fertilizationGuard
        : null,
      canComplete:
        reminder.isDue &&
        rule.evaluation.available &&
        rule.evaluation.reliable &&
        plant?.healthStatus !== 'danger' &&
        !['unavailable', 'unknown', 'invalid'].includes(plant?.fertilizationHistoryStatus) &&
        !isFertilizationGuardActive(plant?.fertilizationGuard, today)
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
  const userAssertedDate = String(body.userAssertedLastAppliedDate || '').trim()
  if (userAssertedDate && !normalizeDate(userAssertedDate)) {
    return { statusCode: 400, message: '上次施肥日期格式不正确', data: null }
  }
  if (userAssertedDate && userAssertedDate > resolveTodayDate()) {
    return { statusCode: 400, message: '上次施肥日期不能晚于今天', data: null }
  }
  const active = await queryActive(openid, plantId)
  if (active) {
    return { statusCode: 409, message: '已有施肥提醒，请先结束或重设旧提醒', data: null }
  }

  let latestEvent
  try {
    latestEvent = await getLatestFertilizationEvent(openid, plantId)
  } catch (error) {
    if (isHistoryReadError(error)) {
      return { statusCode: 503, message: '施肥记录暂时无法读取，请稍后再试', data: null }
    }
    throw error
  }

  const latestHistoryIsUserAsserted = isUserAssertedHistory(latestEvent)
  const hasRecordedHistory = Boolean(latestEvent && !latestHistoryIsUserAsserted)
  // A user-asserted date is only a safety baseline. It does not prove which
  // fertilizer was actually used, so it must not trigger a type-change
  // acknowledgement or be persisted as the last factual fertilizer type.
  const fertilizerTypeChanged = Boolean(
    hasRecordedHistory && latestEvent.fertilizerType !== fertilizerType
  )
  if (hasRecordedHistory && userAssertedDate) {
    return {
      statusCode: 409,
      message: '已有真实施肥记录，请重新计算提醒日期',
      data: { historyAlreadyExists: true, latestEventDate: latestEvent.date }
    }
  }
  if (fertilizerTypeChanged && body.acknowledgeFertilizerTypeChange !== true) {
    return {
      statusCode: 409,
      message: '这次使用的肥料类型与上次不同，请先确认更换肥料',
      data: {
        requiresFertilizerTypeChangeAcknowledgement: true,
        latestFertilizerType: latestEvent.fertilizerType,
        selectedFertilizerType: fertilizerType
      }
    }
  }

  return createPendingPlan({
    openid,
    plant,
    plantId,
    fertilizerType,
    lastAppliedDate: latestEvent?.date || null,
    lastDateSource: latestEvent
      ? latestHistoryIsUserAsserted
        ? 'user_asserted'
        : 'recorded'
      : userAssertedDate
        ? 'user_asserted'
        : 'estimated',
    reminderKind: latestEvent || userAssertedDate ? 'normal' : 'first_confirmation',
    confirmationReasons: [
      ...(fertilizerTypeChanged ? ['fertilizer_type_changed'] : []),
      ...(userAssertedDate ? ['user_asserted_last_date'] : [])
    ],
    conditionAnswers: body.conditionAnswers,
    fertilizerTypeChangeConfirmed:
      !fertilizerTypeChanged || body.acknowledgeFertilizerTypeChange === true,
    historyLastFertilizerType: hasRecordedHistory ? latestEvent?.fertilizerType || '' : '',
    ...(userAssertedDate ? { lastAppliedDate: userAssertedDate } : {})
  })
}

async function buildConfirmedReminderResponse(openid, plantId) {
  const response = await readFertilizationReminder(openid, plantId)
  return {
    ...response,
    message: '施肥提醒已保存'
  }
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
  const plant = await assertUserPlant(openid, existing.user_plant_id)
  if (!plant) {
    return { statusCode: 404, message: '植物不存在或无权限', data: null }
  }
  if (isFertilizationGuardActive(plant.fertilizationGuard, resolveTodayDate())) {
    return {
      statusCode: 422,
      message: '当前处于暂缓施肥状态，暂不保存提醒',
      data: { blockingReason: 'fertilization_guard' }
    }
  }
  if (existing.status === ACTIVE_STATUS) {
    return buildConfirmedReminderResponse(openid, existing.user_plant_id)
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

  // The active-key unique index makes promotion order significant. Retire a
  // previous active row first, then promote this still-valid pending row in a
  // separate conditional update. Keeping the pending predicates on the
  // promotion prevents an expired plan from becoming active after the first
  // query.
  await models.$runSQL(
    `UPDATE user_fertilization_reminder_events
     SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}}
       AND user_plant_id = {{userPlantId}}
       AND status = 'active'`,
    { openid, userPlantId: Number(existing.user_plant_id) }
  )
  await models.$runSQL(
    `UPDATE user_fertilization_reminder_events
     SET status = 'active',
         calendar_payload_json = {{calendarPayloadJson}},
         expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}}
       AND plan_id = {{planId}}
       AND status = 'pending'
       AND expires_at > CURRENT_TIMESTAMP`,
    {
      openid,
      planId,
      calendarPayloadJson: calendarPayload ? JSON.stringify(calendarPayload) : null
    }
  )
  const row = await queryPlan(openid, planId, [ACTIVE_STATUS])
  if (!row) {
    return { statusCode: 409, message: '检查计划已过期，请重新生成', data: null }
  }
  return buildConfirmedReminderResponse(openid, row.user_plant_id)
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
  if (plant?.healthStatus === 'danger') {
    return {
      statusCode: 422,
      message: '植物当前状态异常，暂不能记录施肥',
      data: { currentMonthEvaluation: currentRule.evaluation, blockingReason: 'plant_health' }
    }
  }
  if (isFertilizationGuardActive(plant?.fertilizationGuard, today)) {
    return {
      statusCode: 422,
      message: '当前处于暂缓施肥状态，暂不能记录施肥',
      data: {
        currentMonthEvaluation: currentRule.evaluation,
        blockingReason: 'fertilization_guard'
      }
    }
  }
  if (!currentRule.evaluation.available || !currentRule.evaluation.reliable) {
    return {
      statusCode: 422,
      message: '本月不建议施肥，不能记录为已施肥',
      data: { currentMonthEvaluation: currentRule.evaluation }
    }
  }

  const conditionEvaluation = evaluateScheduleConditions(
    currentRule.evaluation.schedule,
    body.conditionAnswers
  )
  if (!conditionEvaluation.valid) {
    return {
      statusCode: 409,
      message:
        conditionEvaluation.status === 'unmet'
          ? '当前情况不满足本月施肥条件，不能记录施肥'
          : '请先确认本月施肥条件',
      data: {
        currentMonthEvaluation: { ...currentRule.evaluation, conditionEvaluation },
        conditionRequirements: conditionEvaluation.requirements,
        conditionStatus: conditionEvaluation.status,
        missingConditionCodes: conditionEvaluation.missingCodes,
        unmetConditionCodes: conditionEvaluation.unmetCodes,
        unknownConditionCodes: conditionEvaluation.unknownCodes,
        requiresConditionAnswers: true
      }
    }
  }

  let latestEvent
  try {
    latestEvent = await getLatestFertilizationEvent(openid, plantId)
  } catch (error) {
    if (isHistoryReadError(error)) {
      return { statusCode: 503, message: '施肥记录暂时无法读取，请稍后再试', data: null }
    }
    throw error
  }
  const snapshotLastDate = normalizeDate(row.last_applied_date)
  const currentLastDate = normalizeDate(latestEvent?.date)
  const snapshotLastType = snapshotLastDate ? snapshot?.historyLastFertilizerType || '' : ''
  const latestHistoryIsUserAsserted = isUserAssertedHistory(latestEvent)
  const samePlanUserAssertedBaseline =
    latestHistoryIsUserAsserted &&
    String(latestEvent?.planId || '') === planId &&
    snapshotLastDate === currentLastDate
  const historyChanged =
    row.last_date_source === 'user_asserted'
      ? Boolean(latestEvent && !latestHistoryIsUserAsserted) ||
        (latestHistoryIsUserAsserted &&
          !samePlanUserAssertedBaseline &&
          snapshotLastDate !== currentLastDate)
      : snapshotLastDate !== currentLastDate ||
        snapshotLastType !== (latestEvent?.fertilizerType || '')
  if (historyChanged) {
    return {
      statusCode: 409,
      message: '施肥记录已有变化，请重新设置提醒',
      data: { historyChanged: true }
    }
  }
  const latestTypeChanged = Boolean(
    latestEvent &&
    !latestHistoryIsUserAsserted &&
    latestEvent.fertilizerType !== row.fertilizer_type
  )
  if (
    latestTypeChanged &&
    snapshot?.setupConfirmations?.fertilizerTypeChange !== true &&
    body.acknowledgeFertilizerTypeChange !== true
  ) {
    return {
      statusCode: 409,
      message: '这次使用的肥料类型与上次不同，请先确认更换肥料',
      data: {
        requiresFertilizerTypeChangeAcknowledgement: true,
        latestFertilizerType: latestEvent.fertilizerType,
        selectedFertilizerType: row.fertilizer_type
      }
    }
  }
  if (row.reminder_kind === 'first_confirmation' && body.acknowledgeMinimumInterval !== true) {
    return {
      statusCode: 409,
      message: '请确认距离上次施肥至少已达到本表最短间隔',
      data: {
        requiresMinimumIntervalAcknowledgement: true,
        currentMonthEvaluation: currentRule.evaluation
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
    conditionAnswers: body.conditionAnswers,
    historyLastFertilizerType: row.fertilizer_type,
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
  await models.$runSQL(
    `UPDATE user_fertilization_reminder_events
     SET status = {{status}}, updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}} AND user_plant_id = {{plantId}}
       AND plan_id = {{planId}} AND status = 'active'`,
    { openid, plantId, planId, status }
  )
  return { statusCode: 200, message: '本次施肥提醒已跳过', data: { plantId, planId, status } }
}

async function cancelFertilizationReminder(openid, body = {}) {
  const plantId = Number(body.plantId)
  const planId = String(body.planId || '').trim()
  if (!planId) {
    return { statusCode: 400, message: '缺少检查计划', data: null }
  }
  const calendarDeleted = body.reason === 'calendar_deleted'
  const cancelActiveReminder = calendarDeleted || body.reason === 'active_user_cancel'
  if (cancelActiveReminder && !plantId) {
    return { statusCode: 400, message: '缺少植物信息', data: null }
  }
  const status = cancelActiveReminder ? 'active' : 'pending'
  const plantCondition = cancelActiveReminder ? 'AND user_plant_id = {{plantId}}' : ''
  await models.$runSQL(
    `UPDATE user_fertilization_reminder_events
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE _openid = {{openid}} AND plan_id = {{planId}} ${plantCondition} AND status = {{status}}`,
    { openid, planId, plantId, status }
  )
  return {
    statusCode: 200,
    message: calendarDeleted
      ? '施肥日历提醒已移除'
      : cancelActiveReminder
        ? '施肥提醒已取消'
        : '待同步计划已取消',
    data: { plantId: plantId || null, planId, status: 'cancelled' }
  }
}

module.exports = {
  ACTIVE_STATUS,
  attachFertilizationReminderStateToList,
  cancelFertilizationReminder,
  completeFertilizationReminder,
  confirmFertilizationReminder,
  dismissFertilizationReminder,
  mapReminderRow: mapStoredReminderRow,
  previewFertilizationReminder,
  readFertilizationReminder,
  resolveTodayDate,
  _test: {
    buildRuleSnapshot,
    currentMonthRule,
    normalizeDate,
    normalizeFertilizerType,
    normalizeNextTime,
    normalizeReminderKind,
    parseRuleSnapshot
  }
}
