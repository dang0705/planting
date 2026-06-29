'use strict'

// 光照健康估算主流程
// 输入归一化拆分到 light-health-normalize.js，因子常量拆分到 light-health-factors.js。
// 本文件聚焦估算核心：户外等效时长 → 室内因子 → 直射光 → 评分 → 等级与说明。

const {
  DEFAULT_PROFILE,
  DIRECT_SUN_BLOCKED_WINDOWS,
  DIRECT_SUN_EXPOSURE_BASE_HOURS,
  DIRECT_SUN_POSITION_EXPOSURE,
  FACTORS,
  OVER_PENALTY,
  WEATHER_SUN_FACTOR
} = require('./light-health-factors')
const {
  clamp,
  normalizeText,
  normalizeUserLightContext,
  toNumber
} = require('./light-health-normalize')

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(Number(value || 0) * factor) / factor
}

function mean(values = []) {
  const valid = values.map(toNumber).filter(value => value !== undefined)
  if (!valid.length) {
    return undefined
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function normalizeLightProfile(plantContext = {}) {
  const sunning =
    plantContext?.sunning || plantContext?.lightProfile || plantContext?.light_profile || {}
  const freq = Array.isArray(sunning.freq)
    ? sunning.freq
    : Array.isArray(sunning.frequency)
      ? sunning.frequency
      : []
  const min = toNumber(freq[0])
  const max = toNumber(freq[1])
  if (min !== undefined && max !== undefined && min > 0 && max >= min) {
    return {
      way:
        normalizeText(sunning.way || sunning.type || plantContext.lightRequirement || '') ||
        DEFAULT_PROFILE.way,
      freq: [min, max],
      unit: normalizeText(sunning.unit || '小时/天'),
      source: 'plant_context_sunning_freq'
    }
  }
  return { ...DEFAULT_PROFILE }
}

function normalizeWeatherDay(record = {}) {
  const weatherText = normalizeText(
    record.weatherText ||
      record.weather_text ||
      record.textDay ||
      record.text_day ||
      record.weather ||
      record.text ||
      ''
  )
  return {
    date: normalizeText(record.date || record.day || ''),
    uvIndex: toNumber(record.uvIndex ?? record.uv_index ?? record.uv),
    sunshineHours: toNumber(record.sunshineHours ?? record.sunshine_hours),
    daylightHours: toNumber(record.daylightHours ?? record.daylight_hours),
    weatherText
  }
}

function resolveWeatherFactor(weatherText = '') {
  const normalized = normalizeText(weatherText)
  const matched = WEATHER_SUN_FACTOR.find(item => item.pattern.test(normalized))
  return matched || { value: 0.35, label: '未知' }
}

function estimateBaseOutdoorHours(weatherDays = []) {
  const days = (Array.isArray(weatherDays) ? weatherDays : []).map(normalizeWeatherDay)
  const sunshineHours = days.map(day => day.sunshineHours).filter(value => value !== undefined)
  if (sunshineHours.length >= Math.ceil(Math.max(days.length, 1) * 0.5)) {
    return { value: mean(sunshineHours) || 0, source: 'sunshine_hours_mean' }
  }
  const estimated = days.length
    ? days.map(day => {
        const daylight = day.daylightHours ?? 12
        return daylight * resolveWeatherFactor(day.weatherText).value
      })
    : [12 * 0.35]
  return {
    value: mean(estimated) || 0,
    source: days.length ? 'daylight_weather_factor_mean' : 'fallback_unknown_weather'
  }
}

function getDirectSunFactor(value) {
  if (value === true) {
    return 1.08
  }
  if (value === false) {
    return 0.92
  }
  return 1
}

function getDistanceFactor(distance) {
  if (distance === undefined) {
    return 1
  }
  if (distance <= 1) {
    return 1
  }
  if (distance <= 3) {
    return clamp(1 - (distance - 1) * 0.08, 0.82, 1)
  }
  return clamp(0.82 - (distance - 3) * 0.06, 0.42, 0.82)
}

function getDirectSunExposureHours({
  env = {},
  facingFactor = 1,
  windowFactor = 1,
  distanceFactor = 1,
  uvFactor = 1
} = {}) {
  if (env.hasDirectSun !== true) {
    return 0
  }
  if (env.facing === 'no_window' || DIRECT_SUN_BLOCKED_WINDOWS.has(env.windowType)) {
    return 0
  }

  const positionExposure = DIRECT_SUN_POSITION_EXPOSURE[env.position] ?? 0
  if (positionExposure <= 0) {
    return 0
  }

  const exposureHours =
    DIRECT_SUN_EXPOSURE_BASE_HOURS *
    uvFactor *
    clamp(facingFactor, 0.35, 1.1) *
    clamp(windowFactor, 0.55, 1.2) *
    positionExposure *
    distanceFactor
  return round(exposureHours, 2)
}

function getOverPenalty(way = '') {
  return OVER_PENALTY[normalizeText(way)] || 45
}

function resolveLevel({ score, indoorEqHours, minNeed, maxNeed }) {
  if (indoorEqHours < minNeed) {
    if (score < 40) {
      return '严重不足'
    }
    if (score < 65) {
      return '明显不足'
    }
    return '略不足'
  }
  if (indoorEqHours > maxNeed) {
    if (score < 40) {
      return '严重偏强'
    }
    if (score < 65) {
      return '明显偏强'
    }
    return '略偏强'
  }
  return '满足'
}

function resolveDirection(level = '') {
  if (String(level).includes('不足')) {
    return 'low'
  }
  if (String(level).includes('偏强')) {
    return 'strong'
  }
  return 'suitable'
}

function buildReason({ profile, env, indoorEqHours, minNeed, maxNeed }) {
  const envLabels = [
    FACTORS.facing[env.facing]?.label,
    FACTORS.windowType[env.windowType]?.label,
    FACTORS.position[env.position]?.label,
    env.distance !== undefined ? `${round(env.distance, 1)}米` : ''
  ]
    .filter(Boolean)
    .join(' / ')
  if (indoorEqHours < minNeed) {
    return `按属级光照需求 ${minNeed}-${maxNeed} 小时/天估算，当前 ${envLabels || '室内位置'} 约 ${round(indoorEqHours, 1)} 小时，偏低。`
  }
  if (indoorEqHours > maxNeed) {
    return `按属级光照需求 ${minNeed}-${maxNeed} 小时/天估算，当前 ${envLabels || '室内位置'} 约 ${round(indoorEqHours, 1)} 小时，偏强。`
  }
  return `按属级光照需求 ${minNeed}-${maxNeed} 小时/天估算，当前约 ${round(indoorEqHours, 1)} 小时，基本满足 ${profile.way} 需求。`
}

function estimateLightHealth({
  plantContext = {},
  userLightContext = {},
  weatherDays = [],
  plantFeatures = {},
  weatherEvidenceInsufficient = false
} = {}) {
  const env = normalizeUserLightContext(userLightContext)
  if (!env.hasMeaningfulInput) {
    return null
  }
  const profile = normalizeLightProfile(plantContext)
  const [minNeed, maxNeed] = profile.freq
  const baseOutdoorHours = estimateBaseOutdoorHours(weatherDays)
  const normalizedWeatherDays = (Array.isArray(weatherDays) ? weatherDays : []).map(
    normalizeWeatherDay
  )
  const avgUv = mean(normalizedWeatherDays.map(day => day.uvIndex))
  const uvFactor = avgUv === undefined ? 1 : clamp(1 + 0.35 * ((avgUv - 8) / 8), 0.75, 1.15)
  // recent-10d 天气光照因子：证据不足或缺失时保持中性 1.00，仅降低 confidence（不视为低光）
  const recentLightFactor = plantFeatures?.weatherLightFactor10d
  const lightEvidenceInsufficient = plantFeatures?.lightEvidenceInsufficient === true
  const useRecentLightFactor =
    Number.isFinite(recentLightFactor) && !lightEvidenceInsufficient && !weatherEvidenceInsufficient
  const weatherLightFactor = useRecentLightFactor ? recentLightFactor : 1.0
  const weatherLightConfidence = useRecentLightFactor
    ? String(plantFeatures?.lightConfidence || 'none')
    : 'none'
  const outdoorEqHours = baseOutdoorHours.value * uvFactor * weatherLightFactor
  const facingFactor = FACTORS.facing[env.facing].factor
  const windowFactor = FACTORS.windowType[env.windowType].factor
  const positionFactor = FACTORS.position[env.position].factor
  const directSunFactor = getDirectSunFactor(env.hasDirectSun)
  const distanceFactor = getDistanceFactor(env.distance)
  const indoorFactor =
    facingFactor * windowFactor * positionFactor * directSunFactor * distanceFactor
  const directSunExposureHours = getDirectSunExposureHours({
    env,
    facingFactor,
    windowFactor,
    distanceFactor,
    uvFactor
  })
  const indoorEqHours = outdoorEqHours * indoorFactor + directSunExposureHours
  let score = 100
  if (indoorEqHours < minNeed) {
    score = 100 - ((minNeed - indoorEqHours) / minNeed) * 120
  } else if (indoorEqHours > maxNeed) {
    score = 100 - ((indoorEqHours - maxNeed) / maxNeed) * getOverPenalty(profile.way)
  }
  score = clamp(Math.round(score), 0, 100)
  const level = resolveLevel({ score, indoorEqHours, minNeed, maxNeed })
  const direction = resolveDirection(level)
  const reason = buildReason({ profile, env, indoorEqHours, minNeed, maxNeed })

  return {
    lightHealthScore: score,
    lightHealthLevel: level,
    lightHealthReason: reason,
    lightHealthEvidence: {
      formulaVersion: 'light_health_estimator_v1',
      direction,
      profile,
      userLightContext: {
        facing: env.facing,
        facingLabel: FACTORS.facing[env.facing].label,
        windowType: env.windowType,
        windowTypeLabel: FACTORS.windowType[env.windowType].label,
        position: env.position,
        positionLabel: FACTORS.position[env.position].label,
        hasDirectSun: env.hasDirectSun,
        distance: env.distance
      },
      weather: {
        days: normalizedWeatherDays.length,
        baseOutdoorHours: round(baseOutdoorHours.value, 2),
        baseOutdoorHoursSource: baseOutdoorHours.source,
        avgUv: avgUv === undefined ? null : round(avgUv, 2),
        uvFactor: round(uvFactor, 3),
        weatherLightFactor: round(weatherLightFactor, 3),
        weatherLightConfidence,
        outdoorEqHours: round(outdoorEqHours, 2)
      },
      factors: {
        facingFactor,
        windowFactor,
        positionFactor,
        directSunFactor,
        distanceFactor: round(distanceFactor, 3),
        indoorFactor: round(indoorFactor, 3),
        directSunExposureHours
      },
      calculation: {
        indoorEqHours: round(indoorEqHours, 2),
        directSunExposureHours,
        needRange: profile.freq,
        score
      }
    }
  }
}

module.exports = {
  estimateLightHealth,
  normalizeUserLightContext,
  normalizeLightProfile,
  _test: {
    estimateBaseOutdoorHours,
    getDirectSunExposureHours,
    normalizeWeatherDay,
    getDistanceFactor
  }
}
