'use strict'

const {
  normalizeCareBehaviorTimeline,
  buildEnvironmentCareContextV7
} = require('../utils/environment-context-v7')

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasMeaningfulTimeline(timeline = {}) {
  if (!isPlainObject(timeline)) {return false}
  const normalized = normalizeCareBehaviorTimeline(timeline)
  if (normalized.dailyRecords.length > 0) {return true}
  if (normalized.wateringEvents10d.length > 0) {return true}
  if (normalized.fertilizingEvents10d.length > 0) {return true}
  if (normalized.lightChangeEvents10d.length > 0) {return true}
  return normalized.lastFertilizedBucket !== 'unknown'
}

function pickPayloadValue(payload = {}, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      return payload[key]
    }
  }
  return undefined
}

function resolveSnapshot(sessionState = {}) {
  return isPlainObject(sessionState.runtimeSnapshot) ? sessionState.runtimeSnapshot : {}
}

function normalizeRouteAnswerKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isWateringContextRouteQuestion(questionKey = '') {
  const normalizedQuestionKey = normalizeRouteAnswerKey(questionKey)
  return (
    normalizedQuestionKey.includes('watering_frequency_context') ||
    normalizedQuestionKey.includes('watering_context')
  )
}

function resolveWateringRouteOptionKey(wateringContext = '') {
  switch (normalizeRouteAnswerKey(wateringContext)) {
    case 'likely_too_wet':
      return 'often_wet'
    case 'likely_too_dry':
      return 'often_dry'
    case 'keep_baseline_or_check_soil':
      return 'normal_or_stable'
    default:
      return ''
  }
}

function buildRouteAnswersFromRuntimeEnvironmentCarePayload({
  answers = [],
  runtimeEnvironmentCarePayload = null,
  environmentCareContext = null
} = {}) {
  const safeAnswers = Array.isArray(answers) ? answers : []
  const resolvedPayload = isPlainObject(runtimeEnvironmentCarePayload)
    ? runtimeEnvironmentCarePayload
    : {}
  const resolvedContext = isPlainObject(resolvedPayload.environmentCareContext)
    ? resolvedPayload.environmentCareContext
    : (isPlainObject(environmentCareContext) ? environmentCareContext : null)
  const wateringContext = String(resolvedContext?.outputs?.wateringContext || '').trim()
  const routeOptionKey = resolveWateringRouteOptionKey(wateringContext)

  if (!safeAnswers.length || !resolvedContext || !routeOptionKey) {
    return safeAnswers
  }

  let changed = false
  const bridgedAnswers = safeAnswers.map(answer => {
    const questionKey = String(answer?.questionKey || '').trim()
    const optionKey = String(answer?.optionKey || '').trim()
    if (
      !questionKey ||
      optionKey !== 'care_behavior_timeline' ||
      !isWateringContextRouteQuestion(questionKey)
    ) {
      return answer
    }

    changed = true
    return {
      ...answer,
      optionKey: routeOptionKey
    }
  })

  return changed ? bridgedAnswers : safeAnswers
}

function resolveRuntimeEnvironmentCarePayload({
  payload = {},
  sessionState = {},
  plantContext = {}
} = {}) {
  const safePayload = isPlainObject(payload) ? payload : {}
  const snapshot = resolveSnapshot(sessionState)
  const incomingTimeline = pickPayloadValue(
    safePayload,
    'careBehaviorTimeline',
    'care_behavior_timeline',
    'timeline'
  )
  const incomingWeatherWindow = pickPayloadValue(
    safePayload,
    'environmentWeatherWindow',
    'environment_weather_window',
    'weatherWindow',
    'weather_window'
  )
  const incomingHasMeaningfulTimeline = hasMeaningfulTimeline(incomingTimeline)
  const snapshotTimeline = isPlainObject(snapshot.careBehaviorTimeline)
    ? snapshot.careBehaviorTimeline
    : null
  const snapshotContext = isPlainObject(snapshot.environmentCareContext)
    ? snapshot.environmentCareContext
    : null

  if (!incomingHasMeaningfulTimeline && !incomingWeatherWindow) {
    return {
      careBehaviorTimeline: snapshotTimeline,
      environmentCareContext: snapshotContext,
      restoredFromSnapshot: Boolean(snapshotTimeline || snapshotContext)
    }
  }

  if (!incomingHasMeaningfulTimeline && snapshotTimeline && snapshotContext) {
    return {
      careBehaviorTimeline: snapshotTimeline,
      environmentCareContext: snapshotContext,
      restoredFromSnapshot: true
    }
  }

  const careBehaviorTimeline = incomingHasMeaningfulTimeline
    ? normalizeCareBehaviorTimeline(incomingTimeline)
    : snapshotTimeline
  const environmentWeatherWindow =
    incomingWeatherWindow ||
    snapshot.environmentWeatherWindow ||
    snapshotContext?.environmentWeatherWindow ||
    null

  const environmentCareContext = environmentWeatherWindow || careBehaviorTimeline
    ? buildEnvironmentCareContextV7({
        diagnosisDate:
          safePayload.diagnosisDate ||
          safePayload.diagnosis_date ||
          environmentWeatherWindow?.meta?.diagnosisDate ||
          environmentWeatherWindow?.meta?.diagnosis_date ||
          careBehaviorTimeline?.referenceDate,
        plantContext,
        environmentWeatherWindow: environmentWeatherWindow || {},
        careBehaviorTimeline: careBehaviorTimeline || {}
      })
    : snapshotContext

  return {
    careBehaviorTimeline,
    environmentCareContext,
    restoredFromSnapshot: false
  }
}

module.exports = {
  resolveRuntimeEnvironmentCarePayload,
  hasMeaningfulTimeline,
  buildRouteAnswersFromRuntimeEnvironmentCarePayload,
  isWateringContextRouteQuestion,
  resolveWateringRouteOptionKey
}
