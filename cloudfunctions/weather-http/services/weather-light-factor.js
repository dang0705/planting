// weather-light-factor: 室内植物光照因子计算 helper
// 基于 recent-10d / day-now-sample 聚合模型，不新增顶层 lightFeatures，不重构缓存 schema。
'use strict'

const {
  DAYLIGHT_SLOT_NAMES,
  classifyLowLightProxy,
  dominantText,
  max,
  mean,
  percentile
} = require('./now-sample-rollup-helpers')

const LIGHT_CATEGORY_FACTOR = {
  clear: 1.0,
  partly_cloudy: 0.88,
  cloudy: 0.75,
  overcast: 0.55,
  light_rain: 0.45,
  moderate_rain: 0.36,
  heavy_rain: 0.25,
  snow: 0.35,
  fog_haze_dust: 0.35,
  unknown: 0.75
}

const ICON_TO_LIGHT_CATEGORY = {
  '100': 'clear',
  '150': 'clear',
  '102': 'partly_cloudy',
  '152': 'partly_cloudy',
  '103': 'partly_cloudy',
  '153': 'partly_cloudy',
  '101': 'cloudy',
  '151': 'cloudy',
  '104': 'overcast',
  '300': 'light_rain',
  '305': 'light_rain',
  '309': 'light_rain',
  '314': 'light_rain',
  '350': 'light_rain',
  '301': 'moderate_rain',
  '302': 'moderate_rain',
  '306': 'moderate_rain',
  '315': 'moderate_rain',
  '351': 'moderate_rain',
  '399': 'moderate_rain',
  '303': 'heavy_rain',
  '304': 'heavy_rain',
  '307': 'heavy_rain',
  '308': 'heavy_rain',
  '310': 'heavy_rain',
  '311': 'heavy_rain',
  '312': 'heavy_rain',
  '313': 'heavy_rain',
  '316': 'heavy_rain',
  '317': 'heavy_rain',
  '318': 'heavy_rain',
  '400': 'snow',
  '401': 'snow',
  '402': 'snow',
  '403': 'snow',
  '404': 'snow',
  '405': 'snow',
  '406': 'snow',
  '407': 'snow',
  '408': 'snow',
  '409': 'snow',
  '410': 'snow',
  '456': 'snow',
  '457': 'snow',
  '499': 'snow',
  '500': 'fog_haze_dust',
  '501': 'fog_haze_dust',
  '502': 'fog_haze_dust',
  '503': 'fog_haze_dust',
  '504': 'fog_haze_dust',
  '507': 'fog_haze_dust',
  '508': 'fog_haze_dust',
  '509': 'fog_haze_dust',
  '510': 'fog_haze_dust',
  '511': 'fog_haze_dust',
  '512': 'fog_haze_dust',
  '513': 'fog_haze_dust',
  '514': 'fog_haze_dust',
  '515': 'fog_haze_dust',
  '900': 'unknown',
  '901': 'unknown',
  '999': 'unknown'
}

const TEXT_TO_LIGHT_CATEGORY = [
  { pattern: /暴雨|大雨|heavy rain|storm/i, category: 'heavy_rain' },
  { pattern: /中雨/i, category: 'moderate_rain' },
  { pattern: /小雨|阵雨|雨|rain|shower/i, category: 'light_rain' },
  { pattern: /雪|snow/i, category: 'snow' },
  { pattern: /雾|霾|沙|dust|haze|fog/i, category: 'fog_haze_dust' },
  { pattern: /阴|overcast/i, category: 'overcast' },
  { pattern: /少云|晴间多云/i, category: 'partly_cloudy' },
  { pattern: /多云|partly|cloud/i, category: 'cloudy' },
  { pattern: /晴|sunny|clear/i, category: 'clear' }
]

function resolveIconLightCategory(icon) {
  return ICON_TO_LIGHT_CATEGORY[String(icon || '').trim()] || null
}

function resolveTextLightCategory(text) {
  const value = String(text || '').trim()
  if (!value) {
    return null
  }
  const matched = TEXT_TO_LIGHT_CATEGORY.find(item => item.pattern.test(value))
  return matched ? matched.category : null
}

function resolveCloudLightCategory(cloud) {
  const value = Number(cloud)
  if (!Number.isFinite(value)) {
    return null
  }
  if (value <= 20) {
    return 'clear'
  }
  if (value <= 50) {
    return 'partly_cloudy'
  }
  if (value <= 80) {
    return 'cloudy'
  }
  return 'overcast'
}

function iconToLightFactor(icon) {
  const category = resolveIconLightCategory(icon)
  return category ? LIGHT_CATEGORY_FACTOR[category] : null
}

function textToLightFactor(text) {
  const category = resolveTextLightCategory(text)
  return category ? LIGHT_CATEGORY_FACTOR[category] : null
}

function clampNumber(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value))
}

// 单样本光照因子，优先级 cloud -> icon -> text -> unknown
// cloud 存在时不可再用 icon/text 重复扣分
function computeSampleLightFactor(sample = {}) {
  if (sample === null || typeof sample !== 'object') {
    return { factor: 1.0, source: 'unknown', category: 'unknown', hasEvidence: false }
  }
  const cloud = Number(sample.cloud)
  if (Number.isFinite(cloud)) {
    // cloud 0 -> 1.0，cloud 100 -> 0.4
    return {
      factor: clampNumber(1 - (cloud / 100) * 0.6, 0.25, 1.0),
      source: 'cloud',
      category: resolveCloudLightCategory(cloud),
      hasEvidence: true
    }
  }
  const iconFactor = iconToLightFactor(sample.icon ?? sample.iconDay)
  if (iconFactor !== null) {
    return {
      factor: iconFactor,
      source: 'icon',
      category: resolveIconLightCategory(sample.icon ?? sample.iconDay),
      hasEvidence: true
    }
  }
  const textFactor = textToLightFactor(sample.text ?? sample.textDay)
  if (textFactor !== null) {
    return {
      factor: textFactor,
      source: 'text',
      category: resolveTextLightCategory(sample.text ?? sample.textDay),
      hasEvidence: true
    }
  }
  return { factor: 1.0, source: 'unknown', category: 'unknown', hasEvidence: false }
}

function parseTimeMs(value) {
  if (!value) {
    return null
  }
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

// obsTime 明显落在 sunWindow 之外的样本不参与；无 obsTime/sunWindow 时保留
function isWithinSunWindow(obsTime, sunWindow = {}) {
  const obsMs = parseTimeMs(obsTime)
  if (obsMs === null) {
    return true
  }
  const sunriseMs = parseTimeMs(sunWindow.sunrise)
  const sunsetMs = parseTimeMs(sunWindow.sunset)
  if (sunriseMs === null || sunsetMs === null) {
    return true
  }
  const halfHour = 30 * 60 * 1000
  // 日出前 30min ~ 日落后 30min 视为有效日照窗口
  return obsMs >= sunriseMs - halfHour && obsMs <= sunsetMs + halfHour
}

function getDailyLightConfidence(validLightSampleCount = 0) {
  if (validLightSampleCount >= 3) {
    return 'high'
  }
  if (validLightSampleCount === 2) {
    return 'medium'
  }
  if (validLightSampleCount === 1) {
    return 'low'
  }
  return 'none'
}

function getRecent10dLightConfidence(validLightDayCount = 0) {
  if (validLightDayCount >= 7) {
    return 'high'
  }
  if (validLightDayCount >= 4) {
    return 'medium'
  }
  if (validLightDayCount >= 1) {
    return 'low'
  }
  return 'none'
}

function pruneNullish(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    )
  )
}

function dominantValue(values = []) {
  const counts = new Map()
  for (const value of values) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  let dominant = ''
  let maxCount = 0
  for (const [value, count] of counts.entries()) {
    if (count > maxCount) {
      dominant = value
      maxCount = count
    }
  }
  return dominant
}

// 构造日级 lightFeatures：仅使用 sourceKind==='weather_now_sample' 的 daylight 样本
function buildDayLightFeatures({ samples = [], sunWindow = {}, date = '' } = {}) {
  const valid = (Array.isArray(samples) ? samples : []).filter(
    sample => sample && !sample.missing && sample.sourceKind === 'weather_now_sample'
  )
  const daylightSamples = valid.filter(
    sample => DAYLIGHT_SLOT_NAMES.includes(sample.slotName) && isWithinSunWindow(sample.obsTime, sunWindow)
  )

  const clouds = daylightSamples.map(s => s.cloud).filter(Number.isFinite)
  const visibilities = daylightSamples.map(s => s.visibilityKm).filter(Number.isFinite)
  const icons = daylightSamples.map(s => s.icon || s.iconDay).filter(Boolean)

  const daylightCloudMean = mean(clouds)
  const daylightCloudP75 = percentile(clouds)
  const daylightCloudMax = max(clouds)
  const visibilityMean = mean(visibilities)
  const visibilityMin = visibilities.length ? Math.min(...visibilities) : null

  const lightResults = daylightSamples.map(sample => computeSampleLightFactor(sample))
  const evidenceResults = lightResults.filter(result => result.hasEvidence && Number.isFinite(result.factor))
  const rawFactor = evidenceResults.length
    ? evidenceResults.reduce((sum, result) => sum + result.factor, 0) / evidenceResults.length
    : null

  // visibility 弱修正：仅降低，不提升
  let visibilityCorrection = 1.0
  if (visibilityMean !== null && Number.isFinite(visibilityMean)) {
    if (visibilityMean < 2) {
      visibilityCorrection = 0.9
    } else if (visibilityMean < 5) {
      visibilityCorrection = 0.95
    }
  }
  const weatherLightFactor =
    rawFactor !== null && Number.isFinite(rawFactor)
      ? Math.round(clampNumber(rawFactor * visibilityCorrection, 0.25, 1.0) * 1000) / 1000
      : null

  const confidence = getDailyLightConfidence(evidenceResults.length)

  return pruneNullish({
    date,
    daylightCloudMean,
    daylightCloudP75,
    daylightCloudMax,
    lowLightProxy: classifyLowLightProxy(daylightCloudMean),
    visibilityMin,
    visibilityMean,
    dominantWeatherIcon: dominantValue(icons),
    dominantWeatherText: dominantText(daylightSamples),
    weatherLightFactor,
    confidence,
    weatherLightCategory: evidenceResults.length
      ? dominantValue(evidenceResults.map(result => result.category))
      : 'unknown'
  })
}

// 从单日记录读取 lightFeatures：优先 nested dailyRollup.lightFeatures，否则 flat 兜底
function readDayLightFeatures(day = {}) {
  const nested = day?.dailyRollup?.lightFeatures || day?.lightFeatures
  if (nested && typeof nested === 'object' && Object.keys(nested).length) {
    return nested
  }
  // flat 兜底：不重构 schema，仅从既有平铺字段推导
  const pseudoSample = {
    cloud: day?.cloud,
    icon: day?.iconDay,
    text: day?.textDay,
    visibilityKm: day?.visibilityKm
  }
  const sampleResult = computeSampleLightFactor(pseudoSample)
  if (!sampleResult.hasEvidence || sampleResult.factor === null) {
    return null
  }
  let visibilityCorrection = 1.0
  const visibilityKm = Number(day?.visibilityKm)
  if (Number.isFinite(visibilityKm)) {
    if (visibilityKm < 2) {
      visibilityCorrection = 0.9
    } else if (visibilityKm < 5) {
      visibilityCorrection = 0.95
    }
  }
  const weatherLightFactor = Math.round(
    clampNumber(sampleResult.factor * visibilityCorrection, 0.25, 1.0) * 1000
  ) / 1000
  return pruneNullish({
    weatherLightFactor,
    weatherLightCategory: sampleResult.category || 'unknown',
    dominantWeatherIcon: day?.iconDay || '',
    dominantWeatherText: day?.textDay || '',
    confidence: 'low'
  })
}

// 聚合 recent-10d 光照特征：消费 historicalDays[].dailyRollup.lightFeatures
function aggregateRecentLightFeatures(days = [], options = {}) {
  const safeDays = Array.isArray(days) ? days : []
  const weatherEvidenceInsufficient = options.weatherEvidenceInsufficient === true
  const validDays = safeDays.filter(day => day && !day?.missing)

  const dayFeatures = validDays.map(day => readDayLightFeatures(day))
  const validLightFeatures = dayFeatures.filter(
    features => Number.isFinite(Number(features?.weatherLightFactor))
  )
  const factors = validLightFeatures
    .map(features => (features ? Number(features.weatherLightFactor) : NaN))
    .filter(value => Number.isFinite(value))

  const validLightDayCount = factors.length
  const missingLightDayCount = Math.max(0, validDays.length - validLightDayCount)
  const lightEvidenceInsufficient = validLightDayCount < 3

  const cloudMeans = validLightFeatures.map(f => f?.daylightCloudMean).filter(Number.isFinite)
  const cloudP75s = validLightFeatures.map(f => f?.daylightCloudP75).filter(Number.isFinite)
  const cloudMaxs = validLightFeatures.map(f => f?.daylightCloudMax).filter(Number.isFinite)
  const visMeans = validLightFeatures.map(f => f?.visibilityMean).filter(Number.isFinite)
  const visMins = validLightFeatures.map(f => f?.visibilityMin).filter(Number.isFinite)
  const icons = validLightFeatures.map(f => f?.dominantWeatherIcon).filter(Boolean)
  const texts = validLightFeatures.map(f => f?.dominantWeatherText).filter(Boolean)
  const categories = validLightFeatures.map(f => f?.weatherLightCategory).filter(Boolean)

  // 证据不足或天气证据缺失：因子保持中性 1.00，仅降低 confidence（不视为低光）
  let weatherLightFactor10d = 1.0
  const lightConfidence = getRecent10dLightConfidence(validLightDayCount)
  if (!lightEvidenceInsufficient && !weatherEvidenceInsufficient) {
    weatherLightFactor10d =
      Math.round((factors.reduce((a, b) => a + b, 0) / factors.length) * 1000) / 1000
  }

  const lowLightDays = factors.filter(value => value < 0.6).length
  const veryLowLightDays = factors.filter(value => value < 0.4).length

  return pruneNullish({
    validLightDayCount,
    missingLightDayCount,
    weatherLightFactor10d,
    lightConfidence,
    lightEvidenceInsufficient,
    daylightFactor10d: 1.0,
    daylightCloudMean10d: mean(cloudMeans),
    daylightCloudP75Mean10d: mean(cloudP75s),
    daylightCloudMax10d: max(cloudMaxs),
    visibilityMean10d: mean(visMeans),
    visibilityMin10d: visMins.length ? Math.min(...visMins) : null,
    lowLightDays,
    veryLowLightDays,
    dominantWeatherIcon10d: dominantValue(icons),
    dominantWeatherText10d: dominantValue(texts),
    dominantWeatherLightCategory10d: dominantValue(categories)
  })
}

module.exports = {
  computeSampleLightFactor,
  buildDayLightFeatures,
  aggregateRecentLightFeatures,
  readDayLightFeatures,
  getDailyLightConfidence,
  getRecent10dLightConfidence
}
