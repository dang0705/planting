'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../db/table-helper')
const { safeJsonParse } = require('../utils/stored-value')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeNumber(value, conservative = null) {
  const number = Number(value)
  return Number.isFinite(number) ? number : conservative
}

function formatSqlDateTime(value = null) {
  if (!value) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '')
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function resolveEnvironmentWeatherWindow(response = {}) {
  if (!isPlainObject(response)) {
    return null
  }
  if (isPlainObject(response.environmentWeatherWindow)) {
    return response.environmentWeatherWindow
  }
  if (isPlainObject(response.environment_weather_window)) {
    return response.environment_weather_window
  }
  const environmentCareContext = isPlainObject(response.environmentCareContext)
    ? response.environmentCareContext
    : isPlainObject(response.environment_care_context)
      ? response.environment_care_context
      : null
  if (isPlainObject(environmentCareContext?.environmentWeatherWindow)) {
    return environmentCareContext.environmentWeatherWindow
  }
  if (isPlainObject(environmentCareContext?.environment_weather_window)) {
    return environmentCareContext.environment_weather_window
  }
  return null
}

function buildDiagnosisWeatherEvidenceReference({ sessionId = '', response = {} } = {}) {
  const normalizedSessionId = normalizeText(sessionId || response?.diagnosisSessionId)
  const weatherWindow = resolveEnvironmentWeatherWindow(response)
  if (!normalizedSessionId || !weatherWindow) {
    return null
  }

  const meta = isPlainObject(weatherWindow.meta) ? weatherWindow.meta : {}
  const location = isPlainObject(weatherWindow.location) ? weatherWindow.location : {}
  const weatherObjectPath = normalizeText(
    weatherWindow.weatherObjectPath || weatherWindow.weather_object_path || meta.weatherObjectPath
  )
  if (!weatherObjectPath) {
    return null
  }

  return {
    diagnosisSessionId: normalizedSessionId,
    locationKey: normalizeText(
      weatherWindow.locationKey ||
        weatherWindow.location_key ||
        location.locationKey ||
        meta.locationKey
    ),
    weatherObjectPath,
    sourceKind: normalizeText(
      weatherWindow.sourceKind || weatherWindow.source_kind || meta.sourceKind
    ),
    quality: normalizeText(weatherWindow.quality || meta.quality),
    generatedAt: formatSqlDateTime(
      weatherWindow.generatedAt || weatherWindow.generated_at || meta.generatedAt
    )
  }
}

async function getFreshCachedWeatherContext(openid = '') {
  const normalizedOpenid = normalizeText(openid)
  if (!normalizedOpenid || normalizedOpenid === 'anonymous') {
    return null
  }

  try {
    const result = await models.$runSQL(
      `
        SELECT weather_data, updated_at, expires_at
        FROM ${table('weather_cache')}
        WHERE _openid = {{openid}}
          AND (cache_scope = 'user' OR cache_scope <=> NULL)
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      { openid: normalizedOpenid }
    )
    const row = result?.data?.executeResultList?.[0] || null
    if (!row) {
      return null
    }

    const weatherData = safeJsonParse(row.weather_data, null)
    if (!weatherData || typeof weatherData !== 'object') {
      return null
    }

    return {
      temperature: normalizeNumber(weatherData.temperature),
      humidity: normalizeNumber(weatherData.humidity),
      weather: normalizeText(weatherData.weather),
      updateTime: normalizeText(weatherData.updateTime || row.updated_at),
      expiresAt: normalizeText(row.expires_at),
      source: 'weather_cache'
    }
  } catch (error) {
    console.error('diagnose-http read weather cache failed:', error)
    return null
  }
}

async function saveDiagnosisWeatherEvidenceReference({ sessionId = '', response = {} } = {}) {
  const evidence = buildDiagnosisWeatherEvidenceReference({ sessionId, response })
  if (!evidence) {
    return null
  }

  await models.$runSQL(
    `
      INSERT INTO ${table('diagnosis_weather_evidence')} (
        diagnosis_session_id, location_key, weather_object_path, source_kind,
        quality, generated_at, referenced_at, created_at
      ) VALUES (
        {{diagnosisSessionId}}, {{locationKey}}, {{weatherObjectPath}}, {{sourceKind}},
        {{quality}}, {{generatedAt}}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `,
    evidence
  )
  return evidence
}

module.exports = {
  buildDiagnosisWeatherEvidenceReference,
  getFreshCachedWeatherContext,
  saveDiagnosisWeatherEvidenceReference
}
