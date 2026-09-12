'use strict'

const AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY = 'air_environment_unknown'
const AIR_ENVIRONMENT_RECORDED_OPTION_KEY = 'air_environment_recorded'

function text(value = '') {
  return String(value || '').trim()
}

function normalizeAirEnvironmentInput(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const airExchange = value.airExchange
  const deviceAirflow = value.deviceAirflow
  const airSource = text(airExchange?.source)
  const windowDirectionCount = text(airExchange?.windowDirectionCount)
  const windowOpenFrequency = text(airExchange?.windowOpenFrequency)
  const canopyOpenness = text(value.canopyOpenness)
  const airflowMode = text(deviceAirflow?.mode)
  if (
    !['window', 'fresh_air', 'unknown'].includes(airSource) ||
    !['open', 'partial', 'enclosed', 'unknown'].includes(canopyOpenness) ||
    !['none', 'circulating', 'direct', 'unknown'].includes(airflowMode)
  ) {
    return null
  }
  if (
    airSource === 'window' &&
    (!['one', 'two_or_more', 'closed'].includes(windowDirectionCount) ||
      (windowDirectionCount !== 'closed' &&
        !['daily', 'every_other_day', 'weekly_1_2', 'almost_never'].includes(
          windowOpenFrequency
        )))
  ) {
    return null
  }
  const normalizedAirExchange = airSource === 'window'
    ? {
        source: airSource,
        windowDirectionCount: windowDirectionCount === 'closed' ? 'one' : windowDirectionCount,
        windowOpenFrequency: windowDirectionCount === 'closed' ? 'almost_never' : windowOpenFrequency
      }
    : { source: airSource, windowDirectionCount: null, windowOpenFrequency: null }
  const sources = Array.from(
    new Set(
      (Array.isArray(deviceAirflow.sources) ? deviceAirflow.sources : [])
        .map(text)
        .filter(source => ['fan', 'air_conditioner', 'fresh_air'].includes(source))
        .filter(source => source !== 'fresh_air' || airSource === 'fresh_air')
    )
  )
  const directSources = Array.from(
    new Set(
      (Array.isArray(deviceAirflow.directSources) ? deviceAirflow.directSources : [])
        .map(text)
        .filter(source => sources.includes(source))
    )
  )
  const sourceModes =
    deviceAirflow.sourceModes &&
    typeof deviceAirflow.sourceModes === 'object' &&
    !Array.isArray(deviceAirflow.sourceModes)
      ? Object.fromEntries(
          Object.entries(deviceAirflow.sourceModes)
            .map(([source, mode]) => [text(source), text(mode)])
            .filter(
              ([source, mode]) =>
                sources.includes(source) && ['circulating', 'direct'].includes(mode)
            )
        )
      : null
  const normalizedSources = ['none', 'unknown'].includes(airflowMode) ? [] : sources
  const normalizedSourceModes = ['none', 'unknown'].includes(airflowMode)
    ? {}
    : sourceModes ||
      Object.fromEntries(
        normalizedSources.map(source => [
          source,
          directSources.includes(source) ? 'direct' : 'circulating'
        ])
      )
  const effectiveSources = Object.keys(normalizedSourceModes)
  const effectiveDirectSources = effectiveSources.filter(
    source => normalizedSourceModes[source] === 'direct'
  )
  const derivedMode = effectiveDirectSources.length
    ? 'direct'
    : effectiveSources.length
      ? 'circulating'
      : airflowMode
  if (['direct', 'circulating'].includes(derivedMode) && !effectiveSources.length) {
    return null
  }
  return {
    airExchange: normalizedAirExchange,
    canopyOpenness,
    deviceAirflow: {
      mode: derivedMode,
      sources: effectiveSources,
      directSources: effectiveDirectSources,
      sourceModes: normalizedSourceModes
    }
  }
}

function resolveAirEnvironmentEvidence(input = {}) {
  if (!input) {
    return null
  }
  const airExchange = input.airExchange
  const airExchangeLevel =
    airExchange?.source === 'fresh_air'
      ? 'medium'
      : airExchange?.source === 'unknown'
        ? 'unknown'
        : ['weekly_1_2', 'almost_never'].includes(airExchange?.windowOpenFrequency)
          ? 'low'
          : airExchange?.windowDirectionCount === 'two_or_more' &&
              airExchange?.windowOpenFrequency === 'daily'
            ? 'high'
            : 'medium'
  const airflowMode = input.deviceAirflow?.mode
  return {
    air_exchange_level: airExchangeLevel,
    local_airflow_present: airflowMode === 'unknown' ? 'unknown' : airflowMode !== 'none',
    stagnation_risk:
      input.canopyOpenness === 'unknown'
        ? 'unknown'
        : input.canopyOpenness === 'enclosed' && airflowMode === 'none',
    direct_airflow: airflowMode === 'direct',
    direct_airflow_sources: input.deviceAirflow?.directSources || []
  }
}

function parseDiagnosisAirEnvironmentSidecar({ questionPackageSnapshot = {}, answers = [], payload = {} } = {}) {
  const questionKeys = (Array.isArray(questionPackageSnapshot.packageQuestions)
    ? questionPackageSnapshot.packageQuestions
    : [])
    .filter(
      question =>
        text(question?.uiVariant) === 'air_environment' ||
        text(question?.packageTopic) === 'air_environment' ||
        text(question?.questionKey).includes('air_environment')
    )
    .map(question => text(question?.questionKey || question?.questionId || question?.id))
    .filter(Boolean)
  const byQuestion =
    payload.airEnvironmentByQuestionId && typeof payload.airEnvironmentByQuestionId === 'object'
      ? payload.airEnvironmentByQuestionId
      : {}
  const snapshots =
    payload.airEnvironmentSnapshotsByQuestionId &&
    typeof payload.airEnvironmentSnapshotsByQuestionId === 'object'
      ? payload.airEnvironmentSnapshotsByQuestionId
      : {}
  const expected = new Set(questionKeys)
  if (
    [...Object.keys(byQuestion), ...Object.keys(snapshots)].some(
      key => !expected.has(text(key))
    )
  ) {
    return { ok: false, error: '空气环境信息不属于当前问题' }
  }
  const answerByQuestion = new Map(
    (Array.isArray(answers) ? answers : []).map(answer => [text(answer?.questionKey), answer])
  )
  const result = {}
  const resultSnapshots = {}
  const sourceByQuestionId = {}
  const evidenceByQuestionId = {}
  for (const questionKey of questionKeys) {
    const optionKey = text(answerByQuestion.get(questionKey)?.optionKey).toLowerCase()
    if (optionKey === AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY) {
      if (byQuestion[questionKey] || snapshots[questionKey]) {
        return { ok: false, error: '不确定的空气环境不能附带记录' }
      }
      continue
    }
    if (optionKey !== AIR_ENVIRONMENT_RECORDED_OPTION_KEY) {
      return { ok: false, error: '空气环境答案无效' }
    }
    const input = normalizeAirEnvironmentInput(byQuestion[questionKey])
    const snapshot = snapshots[questionKey]
    if (
      !input ||
      !snapshot ||
      typeof snapshot !== 'object' ||
      JSON.stringify(snapshot.input) !== JSON.stringify(input)
    ) {
      return { ok: false, error: '空气环境记录不完整' }
    }
    result[questionKey] = input
    resultSnapshots[questionKey] = {
      input,
      source: text(snapshot.source),
      profileUpdatedAt: text(snapshot.profileUpdatedAt),
      locationBinding: snapshot.locationBinding || { careLocationId: '', locationKey: '' }
    }
    sourceByQuestionId[questionKey] = text(snapshot.source)
    evidenceByQuestionId[questionKey] = resolveAirEnvironmentEvidence(input)
  }
  return {
    ok: true,
    byQuestionId: result,
    snapshotsByQuestionId: resultSnapshots,
    sourceByQuestionId,
    evidence: Object.keys(evidenceByQuestionId).length ? evidenceByQuestionId : null
  }
}

module.exports = { parseDiagnosisAirEnvironmentSidecar }
