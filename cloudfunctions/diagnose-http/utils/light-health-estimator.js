'use strict'

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

const OVER_PENALTY = {
  全日照: 35,
  半日照: 50,
  '全日照/半日照': 45,
  明亮散射光: 65,
  耐阴: 75
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(Number(value || 0) * factor) / factor
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function mean(values = []) {
  const valid = values.map(toNumber).filter(value => value !== undefined)
  if (!valid.length) {
    return undefined
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEnum(value = '', aliases = {}) {
  const raw = normalizeText(value).toLowerCase()
  return aliases[raw] || aliases[normalizeText(value)] || raw
}

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
  const hasMeaningfulInput = Boolean(
    FACTORS.facing[facing] ||
    FACTORS.windowType[windowType] ||
    FACTORS.position[position] ||
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

function estimateLightHealth({ plantContext = {}, userLightContext = {}, weatherDays = [] } = {}) {
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
  const outdoorEqHours = baseOutdoorHours.value * uvFactor
  const facingFactor = FACTORS.facing[env.facing].factor
  const windowFactor = FACTORS.windowType[env.windowType].factor
  const positionFactor = FACTORS.position[env.position].factor
  const directSunFactor = getDirectSunFactor(env.hasDirectSun)
  const distanceFactor = getDistanceFactor(env.distance)
  const indoorFactor =
    facingFactor * windowFactor * positionFactor * directSunFactor * distanceFactor
  const indoorEqHours = outdoorEqHours * indoorFactor
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
        outdoorEqHours: round(outdoorEqHours, 2)
      },
      factors: {
        facingFactor,
        windowFactor,
        positionFactor,
        directSunFactor,
        distanceFactor: round(distanceFactor, 3),
        indoorFactor: round(indoorFactor, 3)
      },
      calculation: {
        indoorEqHours: round(indoorEqHours, 2),
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
    normalizeWeatherDay,
    getDistanceFactor
  }
}
