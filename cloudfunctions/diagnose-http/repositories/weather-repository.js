'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../db/table-helper')
const { safeJsonParse } = require('../utils/stored-value')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeNumber(value, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
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
          AND (cache_scope = 'user' OR cache_scope IS NULL)
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      { openid: normalizedOpenid }
    )
    const row = result?.data?.executeResultList?.[0] || null
    if (!row) {return null}

    const weatherData = safeJsonParse(row.weather_data, null)
    if (!weatherData || typeof weatherData !== 'object') {return null}

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

module.exports = {
  getFreshCachedWeatherContext
}
