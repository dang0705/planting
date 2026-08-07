'use strict'

const AIR_EXCHANGE_SOURCES = new Set(['window', 'fresh_air', 'unknown'])
const WINDOW_DIRECTIONS = new Set(['one', 'two_or_more', 'closed'])
const WINDOW_FREQUENCIES = new Set(['daily', 'every_other_day', 'weekly_1_2'])
const CANOPY_OPENNESS = new Set(['open', 'partial', 'enclosed', 'unknown'])
const DEVICE_AIRFLOW_MODES = new Set(['none', 'circulating', 'direct', 'unknown'])
const DEVICE_AIRFLOW_SOURCES = new Set(['fan', 'air_conditioner', 'fresh_air'])
const AIR_ENVIRONMENT_RECORDED_OPTION_KEY = 'air_environment_recorded'
const AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY = 'air_environment_unknown'
const WILTING_DROOP_AIR_ENVIRONMENT_QUESTION_KEY = 'q_wilting_droop__air_environment'
const DIAGNOSIS_AIR_ENVIRONMENT_SOURCES = new Set([
  'saved_profile',
  'temporary',
  'temporary_save_succeeded',
  'temporary_save_failed'
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeAirExchange(value = {}) {
  const source = normalizeText(value?.source)
  if (!AIR_EXCHANGE_SOURCES.has(source)) {
    return null
  }
  if (source !== 'window') {
    return { source, windowDirectionCount: null, windowOpenFrequency: null }
  }
  const windowDirectionCount = normalizeText(value?.windowDirectionCount)
  if (!WINDOW_DIRECTIONS.has(windowDirectionCount)) {
    return null
  }
  if (windowDirectionCount === 'closed') {
    return { source, windowDirectionCount, windowOpenFrequency: null }
  }
  const windowOpenFrequency = normalizeText(value?.windowOpenFrequency)
  if (!WINDOW_FREQUENCIES.has(windowOpenFrequency)) {
    return null
  }
  return { source, windowDirectionCount, windowOpenFrequency }
}

function normalizeDeviceAirflow(value = {}, airExchange = null) {
  const mode = normalizeText(value?.mode)
  if (!DEVICE_AIRFLOW_MODES.has(mode)) {
    return null
  }
  const sources = Array.from(
    new Set(
      (Array.isArray(value?.sources) ? value.sources : [])
        .map(normalizeText)
        .filter(source => DEVICE_AIRFLOW_SOURCES.has(source))
        .filter(source => source !== 'fresh_air' || airExchange?.source === 'fresh_air')
    )
  )
  if ((mode === 'direct' || mode === 'circulating') && !sources.length) {
    return null
  }
  return { mode, sources: mode === 'none' || mode === 'unknown' ? [] : sources }
}

function normalizeAirEnvironmentInput(value = {}) {
  const airExchange = normalizeAirExchange(value?.airExchange)
  const canopyOpenness = normalizeText(value?.canopyOpenness)
  const deviceAirflow = normalizeDeviceAirflow(value?.deviceAirflow, airExchange)
  if (!airExchange || !CANOPY_OPENNESS.has(canopyOpenness) || !deviceAirflow) {
    return null
  }
  return { airExchange, canopyOpenness, deviceAirflow }
}

function resolveAirExchangeLevel(airExchange = {}) {
  if (airExchange.source === 'fresh_air') {
    return 'medium'
  }
  if (airExchange.source === 'unknown') {
    return 'unknown'
  }
  if (airExchange.windowDirectionCount === 'closed') {
    return 'low'
  }
  if (airExchange.windowOpenFrequency === 'weekly_1_2') {
    return 'low'
  }
  if (
    airExchange.windowDirectionCount === 'two_or_more' &&
    airExchange.windowOpenFrequency === 'daily'
  ) {
    return 'high'
  }
  return 'medium'
}

function resolveAirEnvironmentEvidence(value = {}) {
  const input = normalizeAirEnvironmentInput(value)
  if (!input) {
    return null
  }
  const directAirflow = input.deviceAirflow.mode === 'direct'
  const localAirflowPresent =
    input.deviceAirflow.mode === 'unknown'
      ? 'unknown'
      : input.deviceAirflow.mode === 'none'
        ? false
        : true
  const stagnationRisk =
    input.canopyOpenness === 'unknown'
      ? 'unknown'
      : input.canopyOpenness === 'enclosed' && input.deviceAirflow.mode === 'none'
        ? true
        : false
  return {
    air_exchange_level: resolveAirExchangeLevel(input.airExchange),
    local_airflow_present: localAirflowPresent,
    stagnation_risk: stagnationRisk,
    direct_airflow: directAirflow
  }
}

function isAirEnvironmentQuestion(question = {}) {
  return (
    normalizeText(question?.uiVariant) === 'air_environment' ||
    normalizeText(question?.packageTopic) === 'air_environment' ||
    normalizeText(question?.questionKey).includes('air_environment')
  )
}

function getAnswerOptionKey(answer = {}) {
  return normalizeText(answer?.optionKey || answer?.answerValue).toLowerCase()
}

function normalizeLocationBinding(value = {}) {
  return {
    careLocationId: normalizeText(value?.careLocationId),
    locationKey: normalizeText(value?.locationKey)
  }
}

function normalizeDiagnosisAirEnvironmentSnapshot(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const input = normalizeAirEnvironmentInput(value.input)
  const source = normalizeText(value.source)
  if (!input || !DIAGNOSIS_AIR_ENVIRONMENT_SOURCES.has(source)) {
    return null
  }
  return {
    input,
    source,
    profileUpdatedAt: normalizeText(value.profileUpdatedAt),
    locationBinding: normalizeLocationBinding(value.locationBinding)
  }
}

function getAirEnvironmentQuestionKeys(questionPackageSnapshot = null) {
  const questions = Array.isArray(questionPackageSnapshot?.packageQuestions)
    ? questionPackageSnapshot.packageQuestions
    : []
  return questions
    .filter(isAirEnvironmentQuestion)
    .map(question => normalizeText(question?.questionKey || question?.questionId || question?.id))
    .filter(Boolean)
}

function parseDiagnosisAirEnvironmentSidecar({
  questionPackageSnapshot = null,
  answers = [],
  payload = {}
} = {}) {
  const questionKeys = getAirEnvironmentQuestionKeys(questionPackageSnapshot)
  const airEnvironmentByQuestionId =
    payload?.airEnvironmentByQuestionId && typeof payload.airEnvironmentByQuestionId === 'object'
      ? payload.airEnvironmentByQuestionId
      : {}
  const snapshotsByQuestionId =
    payload?.airEnvironmentSnapshotsByQuestionId &&
    typeof payload.airEnvironmentSnapshotsByQuestionId === 'object'
      ? payload.airEnvironmentSnapshotsByQuestionId
      : {}
  const expectedKeys = new Set(questionKeys)
  const extraKeys = [
    ...Object.keys(airEnvironmentByQuestionId),
    ...Object.keys(snapshotsByQuestionId)
  ].filter(key => !expectedKeys.has(normalizeText(key)))
  if (extraKeys.length) {
    return { ok: false, error: '空气环境信息不属于当前问题' }
  }
  const answerByQuestionId = new Map(
    (Array.isArray(answers) ? answers : []).map(answer => [
      normalizeText(answer?.questionKey),
      answer
    ])
  )
  const byQuestionId = {}
  const snapshots = {}
  const sourceByQuestionId = {}
  const evidenceByQuestionId = {}
  for (const questionKey of questionKeys) {
    const answer = answerByQuestionId.get(questionKey)
    const optionKey = getAnswerOptionKey(answer)
    if (optionKey === AIR_ENVIRONMENT_RECORDED_OPTION_KEY) {
      const snapshot = normalizeDiagnosisAirEnvironmentSnapshot(snapshotsByQuestionId[questionKey])
      const input = normalizeAirEnvironmentInput(airEnvironmentByQuestionId[questionKey])
      if (!snapshot || !input || JSON.stringify(snapshot.input) !== JSON.stringify(input)) {
        return { ok: false, error: '空气环境记录不完整' }
      }
      byQuestionId[questionKey] = input
      snapshots[questionKey] = snapshot
      sourceByQuestionId[questionKey] = snapshot.source
      evidenceByQuestionId[questionKey] = resolveAirEnvironmentEvidence(input)
      continue
    }
    if (optionKey === AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY) {
      if (airEnvironmentByQuestionId[questionKey] || snapshotsByQuestionId[questionKey]) {
        return { ok: false, error: '不确定的空气环境不能附带记录' }
      }
      continue
    }
    return { ok: false, error: '空气环境答案无效' }
  }
  const evidence = Object.keys(evidenceByQuestionId).length ? evidenceByQuestionId : null
  return {
    ok: true,
    byQuestionId,
    snapshotsByQuestionId: snapshots,
    sourceByQuestionId,
    evidence,
    routeAnswers: buildAirEnvironmentRouteAnswers(byQuestionId)
  }
}

function buildAirEnvironmentRouteAnswers(airEnvironmentByQuestionId = {}) {
  const answers = []
  for (const [questionKey, input] of Object.entries(airEnvironmentByQuestionId || {})) {
    const evidence = resolveAirEnvironmentEvidence(input)
    // 直吹只复用发蔫固定题包既有的 move_from_direct_airflow outcome；
    // 黄叶题只把空气环境保留为证据，不能由直吹单独定因。
    if (questionKey === WILTING_DROOP_AIR_ENVIRONMENT_QUESTION_KEY && evidence?.direct_airflow) {
      answers.push({
        questionKey: `${questionKey}__evidence`,
        optionKey: 'direct_airflow',
        answerValue: 'direct_airflow',
        selectionSource: 'air_environment_sidecar'
      })
    }
  }
  return answers
}

module.exports = {
  normalizeAirEnvironmentInput,
  resolveAirEnvironmentEvidence,
  isAirEnvironmentQuestion,
  AIR_ENVIRONMENT_RECORDED_OPTION_KEY,
  AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY,
  WILTING_DROOP_AIR_ENVIRONMENT_QUESTION_KEY,
  DIAGNOSIS_AIR_ENVIRONMENT_SOURCES,
  normalizeDiagnosisAirEnvironmentSnapshot,
  getAirEnvironmentQuestionKeys,
  parseDiagnosisAirEnvironmentSidecar,
  buildAirEnvironmentRouteAnswers,
  _test: {
    normalizeAirExchange,
    normalizeDeviceAirflow,
    resolveAirExchangeLevel
  }
}
