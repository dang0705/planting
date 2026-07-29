function normalizeDateValue(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {return ''}
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) {
    return [
      match[1],
      String(match[2]).padStart(2, '0'),
      String(match[3]).padStart(2, '0')
    ].join('-')
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {return ''}
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0')
  ].join('-')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeWeatherRecord(record = {}, fallbackSource = '') {
  if (!record || typeof record !== 'object') {return null}
  const date = normalizeDateValue(record.date || record.fxDate || record.day || record.dayKey)
  if (!date) {return null}
  return {
    ...record,
    date,
    weather: record.weather || record.weatherText || record.text || record.textDay || record.textNight || '',
    source: record.source || fallbackSource
  }
}

export function buildWeatherByDateFromEnvironmentWeatherWindow(environmentWeatherWindow = null) {
  if (!environmentWeatherWindow || typeof environmentWeatherWindow !== 'object') {
    return {}
  }

  const windowPayload = environmentWeatherWindow.data && typeof environmentWeatherWindow.data === 'object'
    ? environmentWeatherWindow.data
    : environmentWeatherWindow
  const records = [
    ...asArray(windowPayload.historicalDays).map(item => normalizeWeatherRecord(item, 'qweather_historical_weather')),
    ...asArray(windowPayload.historical_days).map(item => normalizeWeatherRecord(item, 'qweather_historical_weather')),
    ...asArray(windowPayload.forecastDays).map(item => normalizeWeatherRecord(item, 'qweather_forecast_15d')),
    ...asArray(windowPayload.forecast_days).map(item => normalizeWeatherRecord(item, 'qweather_forecast_15d')),
    ...asArray(windowPayload.daily).map(item => normalizeWeatherRecord(item, 'weather_daily')),
    ...asArray(windowPayload.dailyRecords).map(item => normalizeWeatherRecord(item, 'weather_daily')),
    ...asArray(windowPayload.daily_records).map(item => normalizeWeatherRecord(item, 'weather_daily'))
  ].filter(Boolean)
  const weatherByDate = records.reduce((entries, record) => {
    entries[record.date] = record
    return entries
  }, {})
  const todayDate = normalizeDateValue(
    windowPayload.meta?.diagnosisDate ||
      windowPayload.meta?.diagnosis_date ||
      windowPayload.diagnosisDate ||
      windowPayload.diagnosis_date
  )
  if (todayDate && windowPayload.currentWeather && typeof windowPayload.currentWeather === 'object') {
    weatherByDate[todayDate] = {
      ...weatherByDate[todayDate],
      ...windowPayload.currentWeather,
      date: todayDate,
      temp: windowPayload.currentWeather.temp ?? windowPayload.currentWeather.tempC ?? weatherByDate[todayDate]?.temp,
      temperature:
        windowPayload.currentWeather.temperature ??
        windowPayload.currentWeather.tempC ??
        weatherByDate[todayDate]?.temperature,
      weather:
        windowPayload.currentWeather.weather ||
        windowPayload.currentWeather.text ||
        windowPayload.currentWeather.weatherText ||
        weatherByDate[todayDate]?.weather ||
        '',
      source: windowPayload.currentWeather.source || windowPayload.meta?.todaySource || weatherByDate[todayDate]?.source || 'weather_now'
    }
  }
  return weatherByDate
}

export function hasEnvironmentWeatherWindowRecords(environmentWeatherWindow = null) {
  return Object.keys(buildWeatherByDateFromEnvironmentWeatherWindow(environmentWeatherWindow)).length > 0
}

export function mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(timeline = {}, environmentWeatherWindow = null) {
  if (!environmentWeatherWindow || typeof environmentWeatherWindow !== 'object') {
    return timeline || {}
  }

  const weatherByDate = buildWeatherByDateFromEnvironmentWeatherWindow(environmentWeatherWindow)
  if (!Object.keys(weatherByDate).length) {
    return timeline || {}
  }

  const sourceTimeline = timeline && typeof timeline === 'object' ? timeline : {}
  return {
    ...sourceTimeline,
    environmentWeatherWindow,
    weatherByDate: {
      ...(sourceTimeline.weatherByDate || {}),
      ...weatherByDate
    }
  }
}
