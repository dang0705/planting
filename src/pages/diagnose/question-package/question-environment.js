import { getQuestionIdentity as getQuestionId } from '@/utils/diagnose-question-identity.js'
import { extractCareBehaviorTimelineFromQuestion } from '@/utils/care-behavior-timeline.js'
import {
  WEATHER_COORDINATE_PRECISION,
  normalizeWeatherCoordinates
} from '@/utils/weather-coordinate.js'
import {
  createDefaultLightEnvironment,
  isLightEnvironmentQuestion,
  sanitizeLightEnvironment
} from '@/utils/light-environment.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

export function dedupeQuestionsById(questions = []) {
  const seen = new Set()
  return (Array.isArray(questions) ? questions : [])
    .map(item => item || {})
    .filter(item => {
      const questionId = getQuestionId(item)
      if (!questionId || seen.has(questionId)) {
        return false
      }
      seen.add(questionId)
      return true
    })
}

export function buildLightEnvironmentByQuestionIdMap(questions = [], previousByQuestionId = {}) {
  return (Array.isArray(questions) ? questions : [])
    .filter(item => isLightEnvironmentQuestion(item))
    .reduce((acc, item) => {
      const questionId = getQuestionId(item)
      if (!questionId) {
        return acc
      }
      acc[questionId] = sanitizeLightEnvironment(
        previousByQuestionId?.[questionId] || createDefaultLightEnvironment()
      )
      return acc
    }, {})
}

export function getLightEnvironmentForQuestion(question = {}, lightEnvironmentByQuestionId = {}) {
  const questionId = getQuestionId(question)
  return sanitizeLightEnvironment(
    lightEnvironmentByQuestionId?.[questionId] || createDefaultLightEnvironment()
  )
}

export function resolveCareBehaviorReferenceDate(questions = []) {
  for (const question of Array.isArray(questions) ? questions : []) {
    const timeline = extractCareBehaviorTimelineFromQuestion(question)
    const referenceDate =
      question?.referenceDate ||
      question?.reference_date ||
      question?.payload?.referenceDate ||
      question?.payload?.reference_date ||
      timeline?.reference_date ||
      timeline?.referenceDate
    if (referenceDate) {
      return String(referenceDate).slice(0, 10)
    }
  }
  return new Date().toISOString().slice(0, 10)
}

export function resolveCareBehaviorWeatherLocation(location = {}) {
  const normalizedLocation = normalizeWeatherCoordinates(location)
  if (!normalizedLocation || normalizedLocation.lat === 0 || normalizedLocation.lng === 0) {
    return null
  }
  return {
    lat: normalizedLocation.lat,
    lng: normalizedLocation.lng,
    city: normalizeText(location.city),
    province: normalizeText(location.province)
  }
}

export function buildEnvironmentWeatherWindowRequestKey(location = {}, diagnosisDate = '') {
  return [
    Number(location.lat).toFixed(WEATHER_COORDINATE_PRECISION),
    Number(location.lng).toFixed(WEATHER_COORDINATE_PRECISION),
    normalizeText(location.city),
    normalizeText(location.province),
    normalizeText(diagnosisDate)
  ].join('|')
}
