function normalizeDateValue(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) {
    return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join(
      '-'
    )
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0')
  ].join('-')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function resolveWeatherWindowPayload(weatherWindow = {}) {
  return weatherWindow?.data && typeof weatherWindow.data === 'object'
    ? weatherWindow.data
    : weatherWindow
}

function hasHistoricalWeatherEvidence(day = {}) {
  if (day?.missing || String(day?.quality || '').trim() === 'missing') {
    return false
  }
  return [day?.tempMaxC, day?.tempMinC, day?.humidity, day?.textDay, day?.text].some(
    value => value !== undefined && value !== null && value !== ''
  )
}

export function resolveEnvironmentWeatherWindowNotice(weatherWindow = {}) {
  const payload = resolveWeatherWindowPayload(weatherWindow)
  const historicalDays = Array.isArray(payload?.historicalDays)
    ? payload.historicalDays
    : Array.isArray(payload?.historical_days)
      ? payload.historical_days
      : []
  const weatherEvidenceInsufficient =
    weatherWindow.weatherEvidenceInsufficient === true ||
    weatherWindow.meta?.weatherEvidenceInsufficient === true ||
    payload.weatherEvidenceInsufficient === true ||
    payload.meta?.weatherEvidenceInsufficient === true
  const missingDays = historicalDays.filter(day => !hasHistoricalWeatherEvidence(day))
  if (weatherEvidenceInsufficient || !historicalDays.length) {
    return '最近 10 天的天气记录暂未准备好，养护记录仍可继续填写。'
  }
  if (
    String(payload?.quality || payload?.meta?.quality || '').trim() === 'partial' ||
    missingDays.length > 0 ||
    historicalDays.length < 10
  ) {
    return '最近 10 天有部分天气记录缺失，日期仍可继续填写。'
  }
  return ''
}

function normalizeWeatherRecord(record = {}, fallbackSource = '') {
  if (!record || typeof record !== 'object') {
    return null
  }
  const date = normalizeDateValue(record.date || record.fxDate || record.day || record.dayKey)
  if (!date) {
    return null
  }
  return {
    ...record,
    date,
    weather:
      record.weather ||
      record.weatherText ||
      record.text ||
      record.textDay ||
      record.textNight ||
      '',
    source: record.source || fallbackSource
  }
}

export function buildWeatherByDateFromEnvironmentWeatherWindow(environmentWeatherWindow = null) {
  if (!environmentWeatherWindow || typeof environmentWeatherWindow !== 'object') {
    return {}
  }

  const windowPayload = resolveWeatherWindowPayload(environmentWeatherWindow)
  const historicalFallbackSource = String(
    windowPayload.meta?.sourceKind || windowPayload.sourceKind || ''
  ).startsWith('weather_cache')
    ? 'weather_cache_recent_10d'
    : 'qweather_historical_weather'
  const records = [
    ...asArray(windowPayload.historicalDays).map(item =>
      normalizeWeatherRecord(item, historicalFallbackSource)
    ),
    ...asArray(windowPayload.historical_days).map(item =>
      normalizeWeatherRecord(item, historicalFallbackSource)
    ),
    ...asArray(windowPayload.forecastDays).map(item =>
      normalizeWeatherRecord(item, 'qweather_forecast_15d')
    ),
    ...asArray(windowPayload.forecast_days).map(item =>
      normalizeWeatherRecord(item, 'qweather_forecast_15d')
    ),
    ...asArray(windowPayload.daily).map(item => normalizeWeatherRecord(item, 'weather_daily')),
    ...asArray(windowPayload.dailyRecords).map(item =>
      normalizeWeatherRecord(item, 'weather_daily')
    ),
    ...asArray(windowPayload.daily_records).map(item =>
      normalizeWeatherRecord(item, 'weather_daily')
    )
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
  const currentWeatherSource = String(windowPayload.todayWeatherSource || '').trim()
  const currentWeather = windowPayload.currentWeather
  const currentWeatherDate = normalizeDateValue(
    currentWeather?.weatherDate ||
      currentWeather?.weather_date ||
      currentWeather?.obsTime ||
      currentWeather?.observedAt ||
      currentWeather?.updatedAt ||
      ''
  )
  const currentWeatherIsDateSafe =
    currentWeatherSource === 'day_latest_sample' ||
    (currentWeatherDate && currentWeatherDate === todayDate)
  if (
    todayDate &&
    currentWeatherIsDateSafe &&
    currentWeather &&
    typeof currentWeather === 'object'
  ) {
    weatherByDate[todayDate] = {
      ...weatherByDate[todayDate],
      ...currentWeather,
      date: todayDate,
      temp: currentWeather.temp ?? currentWeather.tempC ?? weatherByDate[todayDate]?.temp,
      temperature:
        currentWeather.temperature ??
        currentWeather.temp ??
        currentWeather.tempC ??
        weatherByDate[todayDate]?.temperature,
      weather:
        currentWeather.weather ||
        currentWeather.text ||
        currentWeather.weatherText ||
        weatherByDate[todayDate]?.weather ||
        '',
      source:
        currentWeather.source ||
        windowPayload.meta?.todaySource ||
        weatherByDate[todayDate]?.source ||
        'weather_now'
    }
  }
  return weatherByDate
}

export function hasEnvironmentWeatherWindowRecords(environmentWeatherWindow = null) {
  return (
    Object.keys(buildWeatherByDateFromEnvironmentWeatherWindow(environmentWeatherWindow)).length > 0
  )
}

export function mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
  timeline = {},
  environmentWeatherWindow = null
) {
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
