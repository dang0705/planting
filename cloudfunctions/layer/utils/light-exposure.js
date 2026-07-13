'use strict'

/**
 * 光照暴露共享 Layer —— 诊断与蒸腾共同消费的光照计算。
 *
 * 产出结构化光照暴露结果：归一化环境 + 户外等效时长 + 室内因子 + 直射光暴露 + indoorEqHours。
 * indoorEqHours = outdoorEqHours * indoorFactor + directSunExposureHours，
 * 包含天气/UV 证据的最终暴露量，是光照强弱的正确度量。
 *
 * 因子表拆分到 light-exposure-factors.js，归一化拆分到 light-exposure-normalize.js。
 * diagnose-http/utils/light-health-*.js 通过 re-export 代理本模块，不保留第二套常量。
 */

const {
  DEFAULT_PROFILE,
  DIRECT_SUN_BLOCKED_WINDOWS,
  DIRECT_SUN_EXPOSURE_BASE_HOURS,
  DIRECT_SUN_POSITION_EXPOSURE,
  DIRECT_SUN_ATTENUATION_FACTOR,
  DIRECT_SUN_BOOST_FACTOR,
  DIRECT_SUN_FACING_CLAMP,
  DIRECT_SUN_WINDOW_CLAMP,
  DISTANCE_FACTOR_DEEP_MIN,
  DISTANCE_FACTOR_DEEP_SLOPE,
  DISTANCE_FACTOR_MID_BOUNDARY,
  DISTANCE_FACTOR_MID_MIN,
  DISTANCE_FACTOR_MID_SLOPE,
  DISTANCE_FACTOR_NEAR_MAX,
  FACTORS,
  OVER_PENALTY,
  OVER_PENALTY_FALLBACK,
  SCORE_CLAMP_RANGE,
  SCORE_FULL,
  SCORE_MODERATE_THRESHOLD,
  SCORE_SEVERE_THRESHOLD,
  UNDERLIGHT_PENALTY_WEIGHT,
  WEATHER_FACTOR_UNKNOWN,
  WEATHER_SUN_FACTOR,
  DAYLIGHT_FALLBACK_HOURS,
  UV_FACTOR_CLAMP,
  UV_FACTOR_SLOPE,
  UV_REFERENCE,
  SUNSHINE_COVERAGE_RATIO
} = require('./light-exposure-factors')
const {
  clamp,
  toNumber,
  normalizeText,
  normalizeUserLightContext,
  normalizeWeatherDay
} = require('./light-exposure-normalize')

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

function resolveWeatherFactor(weatherText = '') {
  const normalized = normalizeText(weatherText)
  const matched = WEATHER_SUN_FACTOR.find(item => item.pattern.test(normalized))
  return matched || { value: WEATHER_FACTOR_UNKNOWN, label: '未知' }
}

function estimateBaseOutdoorHours(weatherDays = []) {
  const days = (Array.isArray(weatherDays) ? weatherDays : []).map(normalizeWeatherDay)
  const sunshineHours = days.map(day => day.sunshineHours).filter(value => value !== undefined)
  if (sunshineHours.length >= Math.ceil(Math.max(days.length, 1) * SUNSHINE_COVERAGE_RATIO)) {
    return { value: mean(sunshineHours) || 0, source: 'sunshine_hours_mean' }
  }
  const estimated = days.length
    ? days.map(day => {
        const daylight = day.daylightHours ?? DAYLIGHT_FALLBACK_HOURS
        return daylight * resolveWeatherFactor(day.weatherText).value
      })
    : [DAYLIGHT_FALLBACK_HOURS * WEATHER_FACTOR_UNKNOWN]
  return {
    value: mean(estimated) || 0,
    source: days.length ? 'daylight_weather_factor_mean' : 'fallback_unknown_weather'
  }
}

function getDirectSunFactor(value) {
  if (value === true) {
    return DIRECT_SUN_BOOST_FACTOR
  }
  if (value === false) {
    return DIRECT_SUN_ATTENUATION_FACTOR
  }
  return 1
}

function getDistanceFactor(distance) {
  if (distance === undefined) {
    return 1
  }
  if (distance <= DISTANCE_FACTOR_NEAR_MAX) {
    return 1
  }
  if (distance <= DISTANCE_FACTOR_MID_BOUNDARY) {
    return clamp(
      1 - (distance - DISTANCE_FACTOR_NEAR_MAX) * DISTANCE_FACTOR_MID_SLOPE,
      DISTANCE_FACTOR_MID_MIN,
      1
    )
  }
  return clamp(
    DISTANCE_FACTOR_MID_MIN -
      (distance - DISTANCE_FACTOR_MID_BOUNDARY) * DISTANCE_FACTOR_DEEP_SLOPE,
    DISTANCE_FACTOR_DEEP_MIN,
    DISTANCE_FACTOR_MID_MIN
  )
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
    clamp(facingFactor, ...DIRECT_SUN_FACING_CLAMP) *
    clamp(windowFactor, ...DIRECT_SUN_WINDOW_CLAMP) *
    positionExposure *
    distanceFactor
  return round(exposureHours, 2)
}

/**
 * 计算光照暴露（含天气/UV 证据的最终暴露量）。
 *
 * @param {object} params
 * @param {object} params.userLightContext - 原始用户光照输入
 * @param {Array} [params.weatherDays] - 逐日天气记录（含 uvIndex/sunshineHours/daylightHours/weatherText）
 * @param {number} [params.weatherLightFactor] - 天气光照因子（缺失证据时 1.0）
 * @param {number} [params.uvFactor] - UV 因子（缺失证据时 1.0）
 * @returns {object|null} 光照暴露结果，缺失有效输入时返回 null
 */
function computeLightExposure({
  userLightContext = {},
  weatherDays = [],
  weatherLightFactor: explicitWeatherLightFactor,
  uvFactor: explicitUvFactor
} = {}) {
  const env = normalizeUserLightContext(userLightContext)
  if (!env.hasMeaningfulInput) {
    return null
  }

  const normalizedWeatherDays = (Array.isArray(weatherDays) ? weatherDays : []).map(
    normalizeWeatherDay
  )
  const baseOutdoorHours = estimateBaseOutdoorHours(normalizedWeatherDays)
  const avgUv = mean(normalizedWeatherDays.map(day => day.uvIndex))
  const uvFactor =
    explicitUvFactor !== undefined && Number.isFinite(explicitUvFactor)
      ? Number(explicitUvFactor)
      : avgUv === undefined
        ? 1
        : clamp(1 + UV_FACTOR_SLOPE * ((avgUv - UV_REFERENCE) / UV_REFERENCE), ...UV_FACTOR_CLAMP)
  const weatherLightFactor =
    explicitWeatherLightFactor !== undefined && Number.isFinite(explicitWeatherLightFactor)
      ? Number(explicitWeatherLightFactor)
      : 1.0

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

  return {
    env,
    profile: null,
    baseOutdoorHours: { value: round(baseOutdoorHours.value, 2), source: baseOutdoorHours.source },
    weatherDaysCount: normalizedWeatherDays.length,
    avgUv: avgUv === undefined ? null : round(avgUv, 2),
    uvFactor: round(uvFactor, 3),
    weatherLightFactor: round(weatherLightFactor, 3),
    outdoorEqHours: round(outdoorEqHours, 2),
    factors: {
      facingFactor,
      windowFactor,
      positionFactor,
      directSunFactor,
      distanceFactor: round(distanceFactor, 3),
      indoorFactor: round(indoorFactor, 3),
      directSunExposureHours
    },
    indoorEqHours: round(indoorEqHours, 2)
  }
}

module.exports = {
  // 因子表与常量（re-export）
  DEFAULT_PROFILE,
  WEATHER_SUN_FACTOR,
  FACTORS,
  OVER_PENALTY,
  OVER_PENALTY_FALLBACK,
  DIRECT_SUN_EXPOSURE_BASE_HOURS,
  DIRECT_SUN_POSITION_EXPOSURE,
  DIRECT_SUN_BLOCKED_WINDOWS,
  DIRECT_SUN_BOOST_FACTOR,
  DIRECT_SUN_ATTENUATION_FACTOR,
  DISTANCE_FACTOR_NEAR_MAX,
  DISTANCE_FACTOR_MID_BOUNDARY,
  DISTANCE_FACTOR_MID_SLOPE,
  DISTANCE_FACTOR_MID_MIN,
  DISTANCE_FACTOR_DEEP_SLOPE,
  DISTANCE_FACTOR_DEEP_MIN,
  DIRECT_SUN_FACING_CLAMP,
  DIRECT_SUN_WINDOW_CLAMP,
  SCORE_CLAMP_RANGE,
  SCORE_FULL,
  SCORE_MODERATE_THRESHOLD,
  SCORE_SEVERE_THRESHOLD,
  UNDERLIGHT_PENALTY_WEIGHT,
  WEATHER_FACTOR_UNKNOWN,
  DAYLIGHT_FALLBACK_HOURS,
  UV_REFERENCE,
  UV_FACTOR_SLOPE,
  UV_FACTOR_CLAMP,
  SUNSHINE_COVERAGE_RATIO,
  // 工具函数
  clamp,
  toNumber,
  normalizeText,
  normalizeUserLightContext,
  normalizeWeatherDay,
  normalizeLightProfile,
  resolveWeatherFactor,
  estimateBaseOutdoorHours,
  getDirectSunFactor,
  getDistanceFactor,
  getDirectSunExposureHours,
  round,
  mean,
  // 主入口
  computeLightExposure
}
