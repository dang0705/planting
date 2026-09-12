'use strict'

const { createQWeatherAdapter } = require('../adapters/qweather-adapter')
const { buildLocationKey } = require('./weather-cache-paths')

const FORECAST_15D_CACHE_TTL_MS = 5 * 60 * 1000
const forecast15dCache = new Map()

function normalizeDate(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {
    return new Date().toISOString().slice(0, 10)
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!match) {
    return raw.slice(0, 10)
  }
  return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join('-')
}

function addDays(dateText = '', offset = 0) {
  const date = new Date(`${normalizeDate(dateText)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function buildDateRange(startDate = '', count = 0) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDays(startDate, index))
}

function hasLocation({ lat, lng } = {}) {
  return (
    lat !== undefined &&
    lat !== null &&
    lat !== '' &&
    lng !== undefined &&
    lng !== null &&
    lng !== ''
  )
}

function pruneUndefined(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

function buildLocalDevWeatherWindow({ diagnosisDate = '', lat, lng } = {}) {
  const d0 = normalizeDate(diagnosisDate)
  const historicalDates = buildDateRange(addDays(d0, -10), 10)
  const forecastDates = buildDateRange(d0, 15)
  const historicalDays = historicalDates.map((date, index) =>
    pruneUndefined({
      date,
      tempMaxC: index < 4 ? 24 : 27,
      tempMinC: index < 4 ? 18 : 21,
      humidity: index < 4 ? 78 : 62,
      precipMm: index < 2 ? 1 : 0,
      textDay: index < 2 ? '小雨' : '多云',
      source: 'local_dev_fallback'
    })
  )
  const forecastDays = forecastDates.map((date, index) =>
    pruneUndefined({
      date,
      tempMaxC: index < 3 ? 33 : 29,
      tempMinC: index < 3 ? 25 : 22,
      humidity: index < 3 ? 35 : 60,
      precipMm: 0,
      uvIndex: index < 3 ? 8 : 4,
      textDay: index < 3 ? '晴' : '多云',
      source: 'local_dev_fallback'
    })
  )

  // 本地开发无 qweather id / hot city，locationKey 走 coord 兜底，便于前端 D0 day file 查询一致。
  const locationKey = buildLocationKey({ lat, lng })
  return {
    locationKey,
    meta: {
      diagnosisDate: d0,
      historicalWindow: {
        start: historicalDates[0],
        end: historicalDates[historicalDates.length - 1]
      },
      forecastWindow: {
        start: forecastDates[0],
        end: forecastDates[forecastDates.length - 1]
      },
      todaySource: 'local_dev_fallback',
      recordCounts: {
        historicalDays: historicalDays.length,
        forecastDays: forecastDays.length,
        totalDailyRecords: historicalDays.length + forecastDays.length
      },
      lat,
      lng,
      warnings: ['local_dev_missing_qweather_api_key']
    },
    historicalDays,
    forecastDays,
    currentWeather: {
      tempC: forecastDays[0]?.tempMaxC,
      humidity: forecastDays[0]?.humidity,
      text: forecastDays[0]?.textDay,
      weatherDate: d0,
      source: 'local_dev_fallback'
    }
  }
}

function normalizeAdapterDaily(record = {}, fallback = {}) {
  return pruneUndefined({
    date: normalizeDate(record.date || record.fxDate || fallback.date),
    tempMaxC: record.tempMaxC ?? record.tempMax,
    tempMinC: record.tempMinC ?? record.tempMin,
    humidity: record.humidity,
    precipMm: record.precipMm ?? record.precip,
    uvIndex: record.uvIndex ?? record.uv,
    textDay: record.textDay,
    textNight: record.textNight,
    source: record.source || fallback.source,
    sourceKind: record.sourceKind || fallback.sourceKind,
    quality: record.quality,
    weatherObjectPath: record.weatherObjectPath,
    warning: record.warning,
    missing: record.missing
  })
}

function normalizeCachedHistoricalDays(cacheWindow = {}, diagnosisDate = '') {
  const candidates = Array.isArray(cacheWindow?.historicalDays)
    ? cacheWindow.historicalDays
    : Array.isArray(cacheWindow?.historical_days)
      ? cacheWindow.historical_days
      : []
  const fallbackStart = addDays(diagnosisDate, -10)
  return candidates.slice(0, 10).map((record, index) =>
    normalizeAdapterDaily(record, {
      date: addDays(fallbackStart, index),
      source: 'weather_cache_recent_10d',
      sourceKind: 'weather_cache_recent_10d'
    })
  )
}

function normalizeCachedCurrentDaily(currentWeather = null, diagnosisDate = '') {
  if (!currentWeather || typeof currentWeather !== 'object') {
    return null
  }
  return normalizeAdapterDaily(
    {
      ...currentWeather,
      tempMaxC: currentWeather.tempMaxC ?? currentWeather.tempC ?? currentWeather.temperature,
      tempMinC: currentWeather.tempMinC ?? currentWeather.tempC ?? currentWeather.temperature,
      textDay: currentWeather.textDay || currentWeather.text || currentWeather.weather
    },
    {
      date: diagnosisDate,
      source: 'weather_cache_day_latest_sample',
      sourceKind: 'weather_now_sample'
    }
  )
}

async function fetchHistoricalDays({ adapter, lat, lng, dates }) {
  const results = await Promise.all(
    dates.map(async date => {
      try {
        return normalizeAdapterDaily(await adapter.fetchHistoricalWeather({ lat, lng, date }), {
          date,
          source: 'qweather_historical_weather'
        })
      } catch (error) {
        return {
          date,
          source: 'qweather_historical_error',
          missing: true,
          warning: error.message || '历史天气读取失败'
        }
      }
    })
  )
  return results.slice(0, 10)
}

async function fetchForecastDays({ adapter, lat, lng, diagnosisDate, cacheKey = '' }) {
  const readForecast = async () => {
    const forecastDays = await adapter.fetchForecast15d({ lat, lng, diagnosisDate })
    return (Array.isArray(forecastDays) ? forecastDays : [])
      .map((record, index) =>
        normalizeAdapterDaily(record, {
          date: addDays(diagnosisDate, index),
          source: 'qweather_forecast_15d'
        })
      )
      .slice(0, 15)
  }

  // Only real QWeather requests are cached. Injected adapters in unit tests and
  // maintenance callers retain their exact call semantics. The five-minute TTL
  // matches the client query freshness and is short enough not to cross a normal
  // forecast refresh boundary unnoticed.
  if (!cacheKey) {
    return readForecast()
  }
  const cached = forecast15dCache.get(cacheKey)
  if (cached?.promise) {
    return cached.promise
  }
  if (cached?.value && Date.now() - cached.cachedAt <= FORECAST_15D_CACHE_TTL_MS) {
    return cached.value
  }
  forecast15dCache.delete(cacheKey)

  const promise = readForecast()
  forecast15dCache.set(cacheKey, { promise, cachedAt: Date.now() })
  promise.then(
    value => {
      const current = forecast15dCache.get(cacheKey)
      if (current?.promise === promise) {
        forecast15dCache.set(cacheKey, { value, cachedAt: Date.now() })
      }
    },
    () => {
      const current = forecast15dCache.get(cacheKey)
      if (current?.promise === promise) {
        forecast15dCache.delete(cacheKey)
      }
    }
  )
  return promise
}

function prefetchEnvironmentForecast({
  lat,
  lng,
  diagnosisDate = '',
  apiKey = '',
  baseUrl = '',
  adapter = null
} = {}) {
  const qweatherAdapter = adapter || createQWeatherAdapter({ apiKey, baseUrl })
  return fetchForecastDays({
    adapter: qweatherAdapter,
    lat,
    lng,
    diagnosisDate: normalizeDate(diagnosisDate),
    cacheKey: adapter ? '' : `${String(lat)}:${String(lng)}`
  })
}

async function buildEnvironmentWeatherWindow({
  lat,
  lng,
  diagnosisDate = '',
  appEnv = 'production',
  apiKey = '',
  baseUrl = '',
  adapter = null,
  locationKey = '',
  qweatherLocationId = '',
  cityName = '',
  city = '',
  cacheWindow = null,
  forecastDaysPromise = null
} = {}) {
  if (!hasLocation({ lat, lng })) {
    throw new Error('缺少位置参数：lat 和 lng')
  }

  const d0 = normalizeDate(diagnosisDate)
  const hasCacheWindow = cacheWindow && typeof cacheWindow === 'object'
  if (!adapter && !apiKey && appEnv === 'development' && !hasCacheWindow) {
    return buildLocalDevWeatherWindow({ diagnosisDate: d0, lat, lng })
  }

  const qweatherAdapter =
    adapter ||
    (!forecastDaysPromise || !hasCacheWindow ? createQWeatherAdapter({ apiKey, baseUrl }) : null)
  const historicalDates = buildDateRange(addDays(d0, -10), 10)
  const forecastDates = buildDateRange(d0, 15)
  const warnings = []
  const cachedHistoricalDays = hasCacheWindow
    ? normalizeCachedHistoricalDays(cacheWindow, d0)
    : null
  const historicalDays = hasCacheWindow
    ? cachedHistoricalDays
    : await fetchHistoricalDays({
        adapter: qweatherAdapter,
        lat,
        lng,
        dates: historicalDates
      })
  let forecastDays = []
  let currentWeather = null

  try {
    forecastDays = await (forecastDaysPromise ||
      fetchForecastDays({
        adapter: qweatherAdapter,
        lat,
        lng,
        diagnosisDate: d0,
        cacheKey: adapter ? '' : `${String(lat)}:${String(lng)}`
      }))
  } catch (error) {
    warnings.push(`forecast_15d_failed:${error.message || error}`)
    // 本地开发没有 QWeather 凭据时，只为未来日期保留明确标记的开发预报；
    // 历史日期与 D0 仍不得用合成数据覆盖缓存缺失。
    if (!adapter && !apiKey && appEnv === 'development') {
      forecastDays = buildLocalDevWeatherWindow({ diagnosisDate: d0, lat, lng }).forecastDays
      warnings.push('local_dev_missing_qweather_api_key')
    }
  }

  if (hasCacheWindow) {
    currentWeather = cacheWindow.currentWeather || null
  } else {
    try {
      currentWeather = await qweatherAdapter.fetchCurrentWeather({ lat, lng })
    } catch (error) {
      warnings.push(`current_weather_failed:${error.message || error}`)
    }
  }

  // 缓存模式下 D0 已由当天 day archive 提供：响应保留缓存 D0，并过滤掉 QWeather 的同日预报，
  // 未来只返回 D+1..D+14，浇水 planner 可以直接消费完整的 D0..D+14 窗口。
  if (hasCacheWindow) {
    const cachedCurrentDaily = normalizeCachedCurrentDaily(cacheWindow.currentWeather, d0)
    const futureForecastDays = forecastDays
      .filter(record => normalizeDate(record?.date) !== d0)
      .slice(0, 14)
    forecastDays = cachedCurrentDaily
      ? [cachedCurrentDaily, ...futureForecastDays]
      : futureForecastDays
  }

  // 暴露 locationKey：前端 catalog 植物 D0 注入需要用它查 day file latestSample；
  // 缺失时前端 plannerLocationKey 为空，后端 todayWeatherReason='location_key_missing'。
  // 优先用前端传入的显式 key，其次 qweather id / hot city / coord 兜底。
  const resolvedLocationKey = buildLocationKey({
    locationKey,
    qweatherLocationId,
    cityName,
    city,
    lat,
    lng
  })

  const cacheMeta =
    hasCacheWindow && cacheWindow.meta && typeof cacheWindow.meta === 'object'
      ? cacheWindow.meta
      : {}
  const cacheHistoricalWindow = cacheMeta.historicalWindow || {}
  const historicalWindow = hasCacheWindow
    ? {
        start: cacheHistoricalWindow.start || historicalDays[0]?.date || historicalDates[0],
        end:
          cacheHistoricalWindow.end ||
          historicalDays[historicalDays.length - 1]?.date ||
          historicalDates[historicalDates.length - 1]
      }
    : {
        start: historicalDates[0],
        end: historicalDates[historicalDates.length - 1]
      }
  const weatherEvidenceInsufficient = hasCacheWindow
    ? Boolean(
        cacheWindow.weatherEvidenceInsufficient === true ||
        cacheMeta.weatherEvidenceInsufficient === true
      )
    : undefined
  const cacheQuality = hasCacheWindow
    ? cacheMeta.quality || cacheWindow.quality || (historicalDays.length ? 'partial' : 'missing')
    : undefined
  const todayWeatherSource = hasCacheWindow
    ? cacheWindow.todayWeatherSource || (currentWeather ? 'day_latest_sample' : 'missing')
    : currentWeather
      ? 'forecast_15d_with_weather_now'
      : 'forecast_15d'
  const todayWeatherReason = hasCacheWindow
    ? cacheWindow.todayWeatherReason || (currentWeather ? todayWeatherSource : 'missing')
    : ''
  const cacheSourceKind = hasCacheWindow
    ? cacheMeta.sourceKind ||
      cacheWindow.cacheSourceKind ||
      cacheWindow.sourceKind ||
      'weather_cache_recent_10d'
    : undefined
  if (hasCacheWindow && Array.isArray(cacheMeta.warnings)) {
    warnings.push(...cacheMeta.warnings)
  }
  if (hasCacheWindow && !historicalDays.length) {
    warnings.push('weather_cache_recent_10d_missing')
  }
  const responseForecastDates = hasCacheWindow
    ? buildDateRange(
        forecastDays.some(record => normalizeDate(record?.date) === d0) ? d0 : addDays(d0, 1),
        forecastDays.some(record => normalizeDate(record?.date) === d0) ? 15 : 14
      )
    : forecastDates

  return {
    locationKey: resolvedLocationKey,
    ...(hasCacheWindow ? { weatherEvidenceInsufficient } : {}),
    ...(hasCacheWindow && cacheWindow.todayWeatherFallbackDate
      ? { todayWeatherFallbackDate: cacheWindow.todayWeatherFallbackDate }
      : {}),
    meta: {
      diagnosisDate: d0,
      mode: 'environment',
      sourceKind: cacheSourceKind,
      quality: cacheQuality,
      ...(cacheMeta.weatherObjectPath ? { weatherObjectPath: cacheMeta.weatherObjectPath } : {}),
      ...(cacheMeta.cacheHit !== undefined ? { cacheHit: cacheMeta.cacheHit } : {}),
      ...(cacheMeta.cacheSourceKind ? { cacheSourceKind: cacheMeta.cacheSourceKind } : {}),
      ...(hasCacheWindow ? { weatherEvidenceInsufficient } : {}),
      historicalWindow,
      forecastWindow: {
        start: responseForecastDates[0],
        end: responseForecastDates[responseForecastDates.length - 1]
      },
      todaySource: todayWeatherSource,
      todayWeatherSource,
      ...(todayWeatherReason ? { todayWeatherReason } : {}),
      recordCounts: {
        historicalDays: historicalDays.length,
        forecastDays: forecastDays.length,
        totalDailyRecords: historicalDays.length + forecastDays.length
      },
      lat,
      lng,
      warnings
    },
    historicalDays,
    forecastDays,
    currentWeather
  }
}

module.exports = {
  addDays,
  buildDateRange,
  buildEnvironmentWeatherWindow,
  buildLocalDevWeatherWindow,
  fetchForecastDays,
  prefetchEnvironmentForecast
}
