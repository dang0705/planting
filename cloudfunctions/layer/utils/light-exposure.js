'use strict'

/**
 * 光照暴露共享 Layer —— 诊断与蒸腾共同消费的光照计算。
 *
 * 设计目标：
 *   - 作为项目唯一的光照因子表与归一化事实源（诊断口径，数值 1:1 保留不得调整）。
 *   - 产出结构化光照暴露结果：归一化环境 + 室内因子 + 直射光暴露时长 + 证据标记。
 *   - 不包含诊断评分/等级/文案，保持纯计算可复用。
 *
 * 被 diagnose-http/utils/light-health-estimator.js 和 layer/utils/transpiration.js 共同消费。
 */

/* ---------- 因子表与常量（诊断口径，数值不得调整） ---------- */

const DEFAULT_PROFILE = {
  way: '明亮散射光',
  freq: [4, 6],
  unit: '小时/天',
  source: 'fallback_default_indoor_profile'
}

const WEATHER_SUN_FACTOR = [
  { pattern: /中雨|大雨|暴雨|heavy rain|storm/i, value: 0.08, label: '中到大雨' },
  { pattern: /小雨|阵雨|rain|shower/i, value: 0.15, label: '小雨/阵雨' },
  { pattern: /雪|snow/i, value: 0.1, label: '雪' },
  { pattern: /阴|overcast|cloudy/i, value: 0.25, label: '阴' },
  { pattern: /多云|partly|cloud/i, value: 0.4, label: '多云' },
  { pattern: /晴|sunny|clear/i, value: 0.6, label: '晴' }
]

const FACTORS = {
  facing: {
    south: { label: '南', factor: 1 },
    south_east: { label: '东南', factor: 0.9 },
    south_west: { label: '西南', factor: 0.88 },
    east: { label: '东', factor: 0.8 },
    west: { label: '西', factor: 0.78 },
    north_east: { label: '东北', factor: 0.62 },
    north_west: { label: '西北', factor: 0.55 },
    north: { label: '北', factor: 0.45 },
    balcony: { label: '阳台', factor: 1.1 },
    no_window: { label: '无窗', factor: 0.05 },
    unknown: { label: '不知道', factor: 0.65 }
  },
  windowType: {
    floor_to_ceiling: { label: '落地窗', factor: 1.15 },
    standard: { label: '标准窗', factor: 1 },
    small: { label: '小窗', factor: 0.8 },
    curtain: { label: '有窗帘', factor: 0.78 },
    blocked: { label: '有遮挡', factor: 0.75 },
    grow_light: { label: '补光灯', factor: 0.92 },
    no_window: { label: '无窗', factor: 0.05 },
    unknown: { label: '不知道', factor: 0.9 }
  },
  position: {
    window_side: { label: '窗边', factor: 1 },
    middle: { label: '房间中部', factor: 0.72 },
    deep: { label: '远离窗户', factor: 0.42 },
    unknown: { label: '不知道', factor: 0.7 }
  }
}

const DIRECT_SUN_EXPOSURE_BASE_HOURS = 2.3
const DIRECT_SUN_POSITION_EXPOSURE = {
  window_side: 1,
  middle: 0.45,
  unknown: 0.3,
  deep: 0
}
const DIRECT_SUN_BLOCKED_WINDOWS = new Set(['blocked', 'no_window'])

const DIRECT_SUN_BOOST_FACTOR = 1.08
const DIRECT_SUN_ATTENUATION_FACTOR = 0.92
const DISTANCE_FACTOR_NEAR_MAX = 1
const DISTANCE_FACTOR_MID_BOUNDARY = 3
const DISTANCE_FACTOR_MID_SLOPE = 0.08
const DISTANCE_FACTOR_MID_MIN = 0.82
const DISTANCE_FACTOR_DEEP_SLOPE = 0.06
const DISTANCE_FACTOR_DEEP_MIN = 0.42
const DIRECT_SUN_FACING_CLAMP = [0.35, 1.1]
const DIRECT_SUN_WINDOW_CLAMP = [0.55, 1.2]

/* ---------- 基础工具 ---------- */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEnum(value = '', aliases = {}) {
  const raw = normalizeText(value).toLowerCase()
  return aliases[raw] || aliases[normalizeText(value)] || raw
}

/* ---------- 归一化函数 ---------- */

function normalizeFacing(value = '') {
  return normalizeEnum(value, {
    南: 'south',
    南窗: 'south',
    south: 'south',
    s: 'south',
    东: 'east',
    东窗: 'east',
    east: 'east',
    e: 'east',
    north_east: 'north_east',
    northeast: 'north_east',
    东北: 'north_east',
    south_east: 'south_east',
    southeast: 'south_east',
    东南: 'south_east',
    西: 'west',
    西窗: 'west',
    west: 'west',
    w: 'west',
    north_west: 'north_west',
    northwest: 'north_west',
    西北: 'north_west',
    south_west: 'south_west',
    southwest: 'south_west',
    西南: 'south_west',
    北: 'north',
    北窗: 'north',
    north: 'north',
    n: 'north',
    阳台: 'balcony',
    balcony: 'balcony',
    无窗: 'no_window',
    no_window: 'no_window',
    windowless: 'no_window',
    不知道: 'unknown',
    不确定: 'unknown',
    unknown: 'unknown'
  })
}

function normalizeWindowType(value = '') {
  return normalizeEnum(value, {
    落地窗: 'floor_to_ceiling',
    floor_to_ceiling: 'floor_to_ceiling',
    标准窗: 'standard',
    有窗: 'standard',
    standard: 'standard',
    normal: 'standard',
    小窗: 'small',
    small: 'small',
    有窗帘: 'curtain',
    curtain: 'curtain',
    有遮挡: 'blocked',
    blocked: 'blocked',
    shade: 'blocked',
    补光灯: 'grow_light',
    grow_light: 'grow_light',
    light: 'grow_light',
    无窗: 'no_window',
    no_window: 'no_window',
    不知道: 'unknown',
    不确定: 'unknown',
    unknown: 'unknown'
  })
}

function normalizePosition(value = '') {
  return normalizeEnum(value, {
    窗边: 'window_side',
    靠窗: 'window_side',
    window_side: 'window_side',
    near_window: 'window_side',
    房间中部: 'middle',
    中部: 'middle',
    middle: 'middle',
    远离窗户: 'deep',
    房间深处: 'deep',
    深处: 'deep',
    deep: 'deep',
    far: 'deep',
    不知道: 'unknown',
    不确定: 'unknown',
    unknown: 'unknown'
  })
}

function normalizeDirectSun(value) {
  if (value === true || value === false) {
    return value
  }
  const normalized = normalizeText(value).toLowerCase()
  if (['true', 'yes', 'y', '1', '是', '有', '直射'].includes(normalized)) {
    return true
  }
  if (['false', 'no', 'n', '0', '否', '没有', '无'].includes(normalized)) {
    return false
  }
  return 'unknown'
}

function normalizeDistance(value) {
  const distance = toNumber(value)
  if (distance === undefined) {
    return undefined
  }
  return clamp(distance, 0, 20)
}

function derivePositionFromDistance(distance) {
  if (distance === undefined) {
    return ''
  }
  if (distance <= 1.2) {
    return 'window_side'
  }
  if (distance <= 3.5) {
    return 'middle'
  }
  return 'deep'
}

/**
 * 将多源用户光照环境输入归一为统一枚举。
 * 与 diagnose-http 口径完全一致。
 */
function normalizeUserLightContext(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { hasMeaningfulInput: false }
  }
  const distance = normalizeDistance(
    input.distance ?? input.distanceMeters ?? input.distance_meters
  )
  const rawPosition = normalizePosition(
    input.position || input.roomPosition || input.room_position || ''
  )
  const position = FACTORS.position[rawPosition]
    ? rawPosition
    : derivePositionFromDistance(distance) || 'unknown'
  const windowType = normalizeWindowType(input.windowType || input.window_type || '')
  const facing = normalizeFacing(
    input.facing || input.direction || input.windowFacing || input.window_facing || ''
  )
  const hasDirectSun = normalizeDirectSun(input.hasDirectSun ?? input.has_direct_sun)
  const hasMeaningfulFacing = FACTORS.facing[facing] && facing !== 'unknown'
  const hasMeaningfulWindow = FACTORS.windowType[windowType] && windowType !== 'unknown'
  const hasMeaningfulPosition = FACTORS.position[position] && position !== 'unknown'
  const hasMeaningfulInput = Boolean(
    hasMeaningfulFacing ||
    hasMeaningfulWindow ||
    hasMeaningfulPosition ||
    hasDirectSun !== 'unknown' ||
    distance !== undefined
  )

  if (!hasMeaningfulInput) {
    return { hasMeaningfulInput: false }
  }

  return {
    facing: FACTORS.facing[facing] ? facing : 'unknown',
    windowType: FACTORS.windowType[windowType] ? windowType : 'unknown',
    position: FACTORS.position[position] ? position : 'unknown',
    hasDirectSun,
    distance,
    hasMeaningfulInput
  }
}

/* ---------- 因子计算 ---------- */

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

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(Number(value || 0) * factor) / factor
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
 * 计算光照暴露（纯因子，不含评分）。
 *
 * @param {object} userLightContext - 原始用户光照输入
 * @param {object} [options] - 可选参数
 * @param {number} [options.weatherLightFactor=1.0] - 天气光照因子（缺失证据时保持中性 1.0）
 * @param {number} [options.uvFactor=1.0] - UV 因子（缺失证据时保持中性 1.0）
 * @returns {object|null} 光照暴露结果，缺失有效输入时返回 null
 */
function computeLightExposure(userLightContext = {}, options = {}) {
  const env = normalizeUserLightContext(userLightContext)
  if (!env.hasMeaningfulInput) {
    return null
  }

  const weatherLightFactor = Number.isFinite(options.weatherLightFactor)
    ? Number(options.weatherLightFactor)
    : 1.0
  const uvFactor = Number.isFinite(options.uvFactor) ? Number(options.uvFactor) : 1.0

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

  return {
    env,
    factors: {
      facingFactor,
      windowFactor,
      positionFactor,
      directSunFactor,
      distanceFactor: round(distanceFactor, 3),
      indoorFactor: round(indoorFactor, 3),
      directSunExposureHours,
      weatherLightFactor: round(weatherLightFactor, 3),
      uvFactor: round(uvFactor, 3)
    }
  }
}

module.exports = {
  // 因子表与常量
  DEFAULT_PROFILE,
  WEATHER_SUN_FACTOR,
  FACTORS,
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
  // 工具函数
  clamp,
  toNumber,
  normalizeText,
  normalizeEnum,
  normalizeFacing,
  normalizeWindowType,
  normalizePosition,
  normalizeDirectSun,
  normalizeDistance,
  derivePositionFromDistance,
  normalizeUserLightContext,
  getDirectSunFactor,
  getDistanceFactor,
  getDirectSunExposureHours,
  round,
  // 主入口
  computeLightExposure
}
