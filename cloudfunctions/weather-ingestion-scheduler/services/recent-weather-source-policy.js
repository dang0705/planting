'use strict'

function isDisallowedHistoricalWeatherSource(value = '') {
  return String(value || '') === 'qweather_historical_weather'
}

function isDisallowedHistoricalRecord(record = {}) {
  return [record.sourceKind, record.source].some(isDisallowedHistoricalWeatherSource)
}

function isDisallowedHistoricalDaily(payload = {}) {
  const daily = payload?.daily || {}
  return [payload.sourceKind, payload.source, daily.sourceKind, daily.source].some(
    isDisallowedHistoricalWeatherSource
  )
}

module.exports = {
  isDisallowedHistoricalDaily,
  isDisallowedHistoricalRecord,
  isDisallowedHistoricalWeatherSource
}
