'use strict'

const { asArray, buildMissingDailyRecord, isPlainObject } = require('./recent-weather-payloads')
const { isDisallowedHistoricalRecord } = require('./recent-weather-source-policy')

function normalizeRecentHistoricalDays(payload = {}) {
  if (!isPlainObject(payload)) {
    return []
  }

  const candidates = [
    payload.historicalDays,
    payload.historical_days,
    payload.dailyRecords,
    payload.daily_records,
    payload.daily,
    payload.days,
    payload.data?.historicalDays,
    payload.data?.historical_days,
    payload.data?.dailyRecords,
    payload.data?.daily_records,
    payload.data?.daily,
    payload.data?.days
  ]
  const records = candidates.find(value => asArray(value).length)
  return asArray(records).map(day => {
    if (!isDisallowedHistoricalRecord(day)) {
      return day
    }
    return buildMissingDailyRecord({
      date: day.date || day.fxDate,
      dailyObjectPath: day.weatherObjectPath || '',
      reason: 'qweather_historical_weather_disallowed'
    })
  })
}

function normalizeRecentPayload(payload = {}) {
  const historicalDays = normalizeRecentHistoricalDays(payload)
  return {
    ...payload,
    historicalDays,
    meta: {
      ...(isPlainObject(payload.meta) ? payload.meta : {}),
      recordCounts: {
        ...(isPlainObject(payload.meta?.recordCounts) ? payload.meta.recordCounts : {}),
        historicalDays: historicalDays.length,
        forecastDays: 0,
        totalDailyRecords: historicalDays.length
      }
    }
  }
}

module.exports = {
  normalizeRecentHistoricalDays,
  normalizeRecentPayload
}
