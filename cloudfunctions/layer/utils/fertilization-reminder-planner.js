'use strict'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SUPPORTED_UNITS = new Set(['week', 'month'])
const FERTILIZER_TYPES = Object.freeze(['liquid', 'slowRelease'])
const EXPLICIT_PAUSE_LABEL_PATTERN = /^(?:暂停施肥|暂停追加|暂停)(?:$|[（(；，。])/u
const FERTILIZING_ACTIONS = Object.freeze({
  FIXED_INTERVAL: 'monthly_fixed_interval',
  NOT_DUE: 'monthly_not_due',
  DUE_CHECK: 'monthly_due_check',
  FIRST_CONFIRMATION: 'monthly_first_confirmation',
  CONDITIONS_PENDING: 'monthly_conditions_pending',
  PAUSE: 'monthly_pause',
  AVOID: 'monthly_avoid',
  HISTORY_UNAVAILABLE: 'monthly_history_unavailable',
  HISTORY_NOT_AVAILABLE: 'monthly_history_not_available',
  NO_RELIABLE_RULE: 'monthly_no_reliable_rule',
  DEFERRED: 'monthly_deferred'
})
const FERTILIZATION_GUARD_DAYS = 7
const ROOT_STRESS_PROBLEM_KEY = 'overwatering_root_pressure'
// 青花植当前施肥提醒只服务于用户植物卡中的容器植物。
// 月表保留 container_context 是为了保留来源适用范围，但不应再向用户提问。
const AUTO_SATISFIED_CONDITION_CODES = new Set(['container_context'])
const CONDITION_PROMPTS = Object.freeze({
  active_growth: '最近有长新叶或新芽吗？',
  new_leaves_or_shoots: '近期有长出新叶或新芽吗？',
  container_context: '这株植物现在栽在花盆或其他容器里吗？',
  warm_season: '现在是当地温暖的生长季吗？',
  aquatic_context: '这株植物现在是水培或水生环境吗？',
  bud_break: '现在正处于开始萌芽的阶段吗？',
  post_bloom: '现在已经完成开花了吗？',
  dormancy: '这株植物现在处于休眠期吗？',
  low_temperature: '这株植物现在正受到低温影响吗？',
  no_new_leaves_or_shoots: '近期没有长出新叶或新芽吗？',
  emergence_to_flowering: '现在处于出苗到开花阶段吗？',
  sprout_to_leaf_senescence: '现在处于萌芽到叶片衰老前的阶段吗？',
  none: ''
})
const REGISTERED_CONDITION_CODES = new Set(Object.keys(CONDITION_PROMPTS))

function parseDate(value) {
  const text = String(value || '').trim()
  if (!DATE_PATTERN.test(text)) {
    return null
  }
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function addMonthsClamped(date, value) {
  const targetMonth = date.getUTCMonth() + value
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const day = Math.min(date.getUTCDate(), daysInMonth(targetYear, normalizedMonth))
  return new Date(Date.UTC(targetYear, normalizedMonth, day))
}

function addInterval(date, interval) {
  const value = Number(interval?.value)
  const unit = String(interval?.unit || '').trim()
  if (!(date instanceof Date) || !Number.isInteger(value) || value <= 0) {
    return null
  }
  if (unit === 'week') {
    return new Date(date.getTime() + value * 7 * 24 * 60 * 60 * 1000)
  }
  if (unit === 'month') {
    return addMonthsClamped(date, value)
  }
  return null
}

function midpointDate(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    return null
  }
  const startMs = start.getTime()
  const endMs = end.getTime()
  if (endMs < startMs) {
    return null
  }
  const days = Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000) / 2)
  return new Date(startMs + days * 24 * 60 * 60 * 1000)
}

function normalizeIntervalSchedule(schedule) {
  if (!schedule || Number(schedule.schemaVersion) !== 1 || schedule.kind !== 'interval') {
    return null
  }
  const min = normalizeInterval(schedule.interval?.min)
  const max = normalizeInterval(schedule.interval?.max)
  if (!min || !max) {
    return null
  }
  return {
    schemaVersion: 1,
    kind: 'interval',
    interval: { min, max },
    conditionCodes: Array.isArray(schedule.conditionCodes) ? schedule.conditionCodes : [],
    modifiers: Array.isArray(schedule.modifiers) ? schedule.modifiers : []
  }
}

function normalizeInterval(value) {
  const amount = Number(value?.value)
  const unit = String(value?.unit || '').trim()
  if (!Number.isInteger(amount) || amount <= 0 || !SUPPORTED_UNITS.has(unit)) {
    return null
  }
  return { value: amount, unit }
}

function normalizeConditionAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, answer]) => typeof answer === 'boolean')
      .map(([code, answer]) => [String(code).trim(), answer])
      .filter(([code]) => Boolean(code))
  )
}

function getConditionRequirements(schedule) {
  const conditionCodes = Array.from(
    new Set(
      (Array.isArray(schedule?.conditionCodes) ? schedule.conditionCodes : [])
        .map(code => String(code || '').trim())
        .filter(code => code && code !== 'none')
    )
  )
  const unknownCodes = conditionCodes.filter(code => !REGISTERED_CONDITION_CODES.has(code))
  const autoSatisfiedCodes = conditionCodes.filter(code => AUTO_SATISFIED_CONDITION_CODES.has(code))
  const requirements = conditionCodes
    .filter(
      code => REGISTERED_CONDITION_CODES.has(code) && !AUTO_SATISFIED_CONDITION_CODES.has(code)
    )
    .map(code => ({ code, prompt: CONDITION_PROMPTS[code] }))
  return { conditionCodes, autoSatisfiedCodes, unknownCodes, requirements }
}

function evaluateScheduleConditions(schedule, answers = {}) {
  const { conditionCodes, autoSatisfiedCodes, unknownCodes, requirements } =
    getConditionRequirements(schedule)
  const normalizedAnswers = normalizeConditionAnswers(answers)
  const missingCodes = requirements
    .map(item => item.code)
    .filter(code => !Object.prototype.hasOwnProperty.call(normalizedAnswers, code))
  const unmetCodes = requirements
    .map(item => item.code)
    .filter(code => normalizedAnswers[code] === false)
  const status = unknownCodes.length
    ? 'unknown'
    : missingCodes.length
      ? 'missing'
      : unmetCodes.length
        ? 'unmet'
        : 'met'
  return {
    status,
    valid: status === 'met',
    conditionCodes,
    autoSatisfiedCodes,
    unknownCodes,
    missingCodes,
    unmetCodes,
    requirements
  }
}

function calculateFertilizationCheck({
  schedule,
  lastAppliedDate = null,
  lastDateSource = 'recorded',
  referenceDate
} = {}) {
  const normalizedSchedule = normalizeIntervalSchedule(schedule)
  const today = parseDate(referenceDate) || parseDate(formatDate(new Date()))
  if (!normalizedSchedule || !today) {
    return { valid: false, reason: 'invalid_interval_or_reference_date' }
  }

  const earliestFrom = parseDate(lastAppliedDate)
  const hasKnownDate =
    ['recorded', 'user_asserted'].includes(lastDateSource) && Boolean(earliestFrom)
  const minDate = addInterval(today, normalizedSchedule.interval.min)
  const maxDate = addInterval(today, normalizedSchedule.interval.max)
  if (!minDate || !maxDate) {
    return { valid: false, reason: 'invalid_interval' }
  }

  if (!hasKnownDate) {
    const normalCheck = midpointDate(minDate, maxDate)
    // 首次确认不能早于本表最短间隔。它仍然是“确认提醒”，不是自动施肥许可，
    // 但把提醒放在最早允许施肥的日期可以避免用户把提前提醒误解成可直接施肥。
    const firstCheck = minDate
    const todayText = formatDate(today)
    const calculatedCheckDate = formatDate(firstCheck)
    const nextCheckDate =
      calculatedCheckDate && calculatedCheckDate < todayText ? todayText : calculatedCheckDate
    return {
      valid: Boolean(nextCheckDate),
      nextCheckDate,
      dueNow: Boolean(nextCheckDate && nextCheckDate <= todayText),
      lastAppliedDate: null,
      lastDateSource: 'estimated',
      earliestDate: formatDate(minDate),
      latestDate: formatDate(maxDate),
      normalCheckDate: formatDate(normalCheck)
    }
  }

  const earliest = addInterval(earliestFrom, normalizedSchedule.interval.min)
  const latest = addInterval(earliestFrom, normalizedSchedule.interval.max)
  const nextCheck = midpointDate(earliest, latest)
  const calculatedCheckDate = formatDate(nextCheck)
  const todayText = formatDate(today)
  const dueNow = Boolean(calculatedCheckDate && calculatedCheckDate <= todayText)
  const nextCheckDate = dueNow ? todayText : calculatedCheckDate
  return {
    valid: Boolean(nextCheckDate),
    nextCheckDate,
    dueNow,
    lastAppliedDate: formatDate(earliestFrom),
    lastDateSource: ['recorded', 'user_asserted'].includes(lastDateSource)
      ? lastDateSource
      : 'recorded',
    earliestDate: formatDate(earliest),
    latestDate: formatDate(latest),
    normalCheckDate: calculatedCheckDate
  }
}

function resolveMonthlyCell(monthly, fertilizerType, month) {
  const rows = Array.isArray(monthly?.rows) ? monthly.rows : []
  const targetMonth = Number(month)
  const cell = rows.find(row => Number(row?.month) === targetMonth)?.[fertilizerType] || null
  if (!cell) {
    return { kind: 'unavailable', cell: null, schedule: null }
  }
  const rawSchedule = cell.schedule || null
  const displayText = String(cell.displayText || '').trim()
  // 月表文案是用户可见的安全提示。历史数据中若出现“暂停施肥/暂停追加”
  // 与 interval 结构不一致，必须按更保守的暂停处理，不能因为结构脏数据
  // 把该肥料放行。
  if (EXPLICIT_PAUSE_LABEL_PATTERN.test(displayText)) {
    return {
      kind: 'pause',
      cell,
      schedule: {
        ...(rawSchedule && typeof rawSchedule === 'object' ? rawSchedule : {}),
        schemaVersion: 1,
        kind: 'pause',
        interval: null
      }
    }
  }
  const schedule = rawSchedule
  if (schedule?.kind === 'interval') {
    return {
      kind: normalizeIntervalSchedule(schedule) ? 'interval' : 'manual_review',
      cell,
      schedule: normalizeIntervalSchedule(schedule)
    }
  }
  if (['pause', 'avoid'].includes(schedule?.kind)) {
    return { kind: schedule.kind, cell, schedule }
  }
  if (
    ['conditional', 'event', 'constraint', 'annual_count', 'unspecified'].includes(schedule?.kind)
  ) {
    return { kind: schedule.kind, cell, schedule }
  }
  return { kind: 'manual_review', cell, schedule }
}

function evaluateMonthlyRule(monthly, fertilizerType, month) {
  const result = resolveMonthlyCell(monthly, fertilizerType, month)
  const conditionEvaluation = evaluateScheduleConditions(result.schedule)
  const sourceNames = Array.isArray(result.cell?.sourceNames) ? result.cell.sourceNames : []
  return {
    ...result,
    available: result.kind === 'interval',
    reliable: result.kind === 'interval' && sourceNames.length > 0,
    conditionEvaluation,
    displayText: result.cell?.displayText || '',
    sourceNames
  }
}

function normalizeFertilizerType(value) {
  const type = String(value || '').trim()
  return FERTILIZER_TYPES.includes(type) ? type : ''
}

function getMonthlyFertilizerOptions(monthly, month) {
  return FERTILIZER_TYPES.map(type => {
    const evaluation = evaluateMonthlyRule(monthly, type, month)
    if (!evaluation.reliable) {
      return null
    }
    return { type, ...evaluation }
  }).filter(Boolean)
}

function isFertilizationGuardActive(guard, referenceDate) {
  if (!guard || guard.status !== 'deferred') {
    return false
  }
  const today = parseDate(referenceDate) || parseDate(formatDate(new Date()))
  const expiresAt = parseDate(String(guard.expiresAt || '').slice(0, 10))
  return Boolean(today && expiresAt && formatDate(today) < formatDate(expiresAt))
}

function addDays(date, days) {
  if (!(date instanceof Date) || !Number.isInteger(days)) {
    return null
  }
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function resolveDiagnosisFertilizationGuard({
  response = {},
  diagnosisId = '',
  referenceDate
} = {}) {
  if (response?.questionRequired === true || response?.outcomeType !== 'problematic') {
    return null
  }
  const keys = [
    response?.topProblem?.problemId,
    response?.topProblem?.problemKey,
    response?.finalResult?.problemId,
    response?.finalResult?.problemKey,
    response?.finalProblemKey
  ]
    .map(value =>
      String(value || '')
        .trim()
        .replace(/^problem_/, '')
    )
    .filter(Boolean)
  if (!keys.includes(ROOT_STRESS_PROBLEM_KEY)) {
    return null
  }
  const createdDate =
    formatDate(parseDate(referenceDate)) || formatDate(parseDate(formatDate(new Date())))
  const expiresAt = formatDate(addDays(parseDate(createdDate), FERTILIZATION_GUARD_DAYS))
  if (!createdDate || !expiresAt) {
    return null
  }
  return {
    schemaVersion: 1,
    status: 'deferred',
    reasonCode: 'root_stress',
    source: 'diagnosis',
    sourceDiagnosisId: String(diagnosisId || response?.diagnosisSessionId || '').trim(),
    createdDate,
    expiresAt
  }
}

function buildFertilizationDecision({
  plantContext = {},
  fertilizerType = '',
  referenceDate
} = {}) {
  const monthly = plantContext.fertilizationMonthly
  const historyStatus = String(plantContext.fertilizationHistoryStatus || '').trim()
  const history = Array.isArray(plantContext.fertilizationHistory)
    ? plantContext.fertilizationHistory
    : []
  const reference = String(
    referenceDate || plantContext.diagnosisDate || new Date().toISOString().slice(0, 10)
  ).slice(0, 10)
  const parsedReference = parseDate(reference)
  const month = parsedReference ? parsedReference.getUTCMonth() + 1 : 0
  const requestedType = normalizeFertilizerType(fertilizerType)
  const historyType = normalizeFertilizerType(history[0]?.fertilizerType)
  const preferredType = requestedType || historyType
  const contextLastDate = String(
    plantContext.lastAppliedDate || plantContext.last_applied_date || history[0]?.date || ''
  ).slice(0, 10)
  const contextLastDateSource = ['recorded', 'user_asserted', 'estimated'].includes(
    plantContext.lastDateSource
  )
    ? plantContext.lastDateSource
    : history[0]?.date
      ? 'recorded'
      : 'estimated'
  const options = parsedReference ? getMonthlyFertilizerOptions(monthly, month) : []
  let selectedType = preferredType
  let evaluation = selectedType ? evaluateMonthlyRule(monthly, selectedType, month) : null
  const reasons = []

  if (!selectedType && options.length === 1) {
    selectedType = options[0].type
    evaluation = options[0]
  }

  const base = {
    status: FERTILIZING_ACTIONS.NO_RELIABLE_RULE,
    action: FERTILIZING_ACTIONS.NO_RELIABLE_RULE,
    fertilizerType: selectedType,
    ruleMonth: month,
    evaluation: evaluation || { kind: 'unavailable', available: false, reliable: false },
    options,
    historyStatus,
    lastAppliedDate: contextLastDate || null,
    lastDateSource: contextLastDateSource,
    dueNow: false,
    nextCheckDate: null,
    reasons,
    requiresFertilizerType: false,
    fertilizationGuard: plantContext.fertilizationGuard || null
  }
  const finish = (status, extra = {}) => ({
    ...base,
    ...extra,
    status,
    action: status,
    reasons: Array.from(new Set([...(base.reasons || []), ...(extra.reasons || [])]))
  })

  if (!parsedReference || !monthly?.available) {
    return finish(FERTILIZING_ACTIONS.NO_RELIABLE_RULE, { reasons: ['monthly_rule_unreliable'] })
  }
  if (isFertilizationGuardActive(plantContext.fertilizationGuard, reference)) {
    return finish(FERTILIZING_ACTIONS.DEFERRED, { reasons: ['fertilization_guard_active'] })
  }
  if (
    historyStatus === 'unavailable' ||
    historyStatus === 'unknown' ||
    historyStatus === 'invalid'
  ) {
    return finish(FERTILIZING_ACTIONS.HISTORY_UNAVAILABLE, {
      reasons: ['fertilization_history_unavailable']
    })
  }
  if (!selectedType && options.length > 1) {
    return finish(FERTILIZING_ACTIONS.NO_RELIABLE_RULE, {
      reasons: ['fertilizer_type_required'],
      requiresFertilizerType: true,
      fertilizerType: ''
    })
  }
  if (!selectedType) {
    const firstKnownRule = FERTILIZER_TYPES.map(type =>
      evaluateMonthlyRule(monthly, type, month)
    ).find(result => result.kind !== 'unavailable')
    evaluation = firstKnownRule || base.evaluation
  }
  if (evaluation?.kind === 'pause') {
    return finish(FERTILIZING_ACTIONS.PAUSE, { reasons: ['monthly_pause'] })
  }
  if (evaluation?.kind === 'avoid') {
    return finish(FERTILIZING_ACTIONS.AVOID, { reasons: ['monthly_avoid'] })
  }
  if (!evaluation?.reliable) {
    return finish(FERTILIZING_ACTIONS.NO_RELIABLE_RULE, {
      reasons: [selectedType ? 'fertilizer_type_rule_unreliable' : 'monthly_rule_unreliable'],
      evaluation: evaluation || base.evaluation
    })
  }
  if (evaluation.kind !== 'interval') {
    return finish(FERTILIZING_ACTIONS.NO_RELIABLE_RULE, {
      reasons: ['monthly_rule_not_fixed_interval']
    })
  }
  if (historyStatus === 'not_applicable' || !plantContext.userPlantId) {
    return finish(FERTILIZING_ACTIONS.HISTORY_NOT_AVAILABLE, {
      reasons: ['user_plant_not_linked']
    })
  }
  const conditionEvaluation = evaluateScheduleConditions(evaluation.schedule)
  if (conditionEvaluation.unknownCodes.length) {
    return finish(FERTILIZING_ACTIONS.NO_RELIABLE_RULE, {
      reasons: ['unknown_condition_code'],
      conditionEvaluation
    })
  }
  if (!conditionEvaluation.valid) {
    return finish(FERTILIZING_ACTIONS.CONDITIONS_PENDING, {
      reasons: ['condition_answers_required'],
      conditionEvaluation
    })
  }
  if (historyStatus === 'empty') {
    const check = calculateFertilizationCheck({
      schedule: evaluation.schedule,
      lastAppliedDate: contextLastDate || null,
      lastDateSource: contextLastDateSource,
      referenceDate: reference
    })
    const hasUserDate = contextLastDateSource === 'user_asserted' && Boolean(contextLastDate)
    return finish(
      hasUserDate
        ? check.dueNow
          ? FERTILIZING_ACTIONS.DUE_CHECK
          : FERTILIZING_ACTIONS.NOT_DUE
        : FERTILIZING_ACTIONS.FIRST_CONFIRMATION,
      {
        reasons: [hasUserDate ? 'user_asserted_last_date' : 'no_fertilization_history'],
        conditionEvaluation,
        nextCheckDate: check.nextCheckDate,
        dueNow: check.dueNow,
        firstConfirmation: !hasUserDate,
        calculation: check
      }
    )
  }
  if (historyStatus !== 'available' || !history[0]?.date) {
    return finish(FERTILIZING_ACTIONS.HISTORY_UNAVAILABLE, {
      reasons: ['fertilization_history_unknown']
    })
  }
  const check = calculateFertilizationCheck({
    schedule: evaluation.schedule,
    lastAppliedDate: history[0].date,
    lastDateSource: history[0].source === 'user_asserted' ? 'user_asserted' : 'recorded',
    referenceDate: reference
  })
  return finish(check.dueNow ? FERTILIZING_ACTIONS.DUE_CHECK : FERTILIZING_ACTIONS.NOT_DUE, {
    reasons: [check.dueNow ? 'monthly_interval_due' : 'monthly_interval_not_due'],
    conditionEvaluation,
    nextCheckDate: check.nextCheckDate,
    dueNow: check.dueNow,
    calculation: check
  })
}

module.exports = {
  addInterval,
  buildFertilizationDecision,
  calculateFertilizationCheck,
  evaluateMonthlyRule,
  evaluateScheduleConditions,
  FERTILIZER_TYPES,
  FERTILIZING_ACTIONS,
  FERTILIZATION_GUARD_DAYS,
  formatDate,
  getMonthlyFertilizerOptions,
  getConditionRequirements,
  isFertilizationGuardActive,
  resolveDiagnosisFertilizationGuard,
  midpointDate,
  normalizeFertilizerType,
  normalizeIntervalSchedule,
  normalizeConditionAnswers,
  parseDate,
  _test: {
    addMonthsClamped,
    daysInMonth,
    normalizeInterval,
    conditionPrompts: CONDITION_PROMPTS,
    registeredConditionCodes: REGISTERED_CONDITION_CODES
  }
}
