'use strict'

/**
 * 光照暴露输入归一化 —— 项目唯一事实源。
 *
 * 将多源、多语言（中文/英文/驼峰/下划线）的用户光照环境输入归一为统一枚举。
 * 被 diagnose-http 和 transpiration 共同消费。
 */

const { FACTORS } = require('./light-exposure-factors')

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

module.exports = {
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
  normalizeWeatherDay
}
