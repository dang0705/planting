'use strict'

const { NATURAL_LIGHT_TYPES, ENTRY_METHODS } = require('./light-exposure-factors')

const SCHEMA_VERSION = 2
const CAPTURE_SOURCES = new Set(['user', 'migrated_v1'])

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
}

function normalizeNaturalLightType(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  const aliases = {
    direct: 'direct',
    直射光: 'direct',
    bright_diffuse: 'bright_diffuse',
    明亮散射光: 'bright_diffuse',
    weak_diffuse: 'weak_diffuse',
    较弱散射光: 'weak_diffuse',
    弱散射光: 'weak_diffuse',
    almost_none: 'almost_none',
    几乎无自然光: 'almost_none'
  }
  const resolved = aliases[normalized] || aliases[normalizeText(value)] || ''
  return NATURAL_LIGHT_TYPES[resolved] ? resolved : ''
}

function normalizeEntryMethod(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  const aliases = {
    through_glass: 'through_glass',
    glass: 'through_glass',
    阳光透过窗玻璃: 'through_glass',
    open_environment: 'open_environment',
    open: 'open_environment',
    开放环境: 'open_environment'
  }
  const resolved = aliases[normalized] || aliases[normalizeText(value)] || ''
  return ENTRY_METHODS[resolved] ? resolved : ''
}

function normalizeBoolean(value) {
  if (value === true || value === false) {
    return value
  }
  const normalized = normalizeText(value).toLowerCase()
  return ['true', '1', 'yes', 'y', '是', '有'].includes(normalized)
}

function isV2LightEnvironment(input = {}) {
  return (
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    Number(input.schemaVersion) === SCHEMA_VERSION &&
    Boolean(normalizeNaturalLightType(input.naturalLightType))
  )
}

function migrateLegacyLightEnvironment(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null
  }

  const windowType = normalizeText(input.windowType || input.window_type).toLowerCase()
  const facing = normalizeText(input.facing || input.direction).toLowerCase()
  const position = normalizeText(input.position || input.roomPosition).toLowerCase()
  const distance = toNumber(input.distance ?? input.distanceMeters ?? input.distance_meters)
  const hasDirectSun = normalizeBoolean(input.hasDirectSun ?? input.has_direct_sun)
  const hasLegacySignal = [
    windowType,
    facing,
    position,
    distance !== undefined,
    input.hasDirectSun !== undefined,
    input.has_direct_sun !== undefined
  ].some(Boolean)

  if (!hasLegacySignal) {
    return null
  }

  const isGrowLight = ['grow_light', '补光灯'].includes(windowType)
  const isNoWindow =
    ['no_window', 'windowless', '无窗'].includes(windowType) ||
    ['no_window', 'windowless', '无窗'].includes(facing)
  const isNearWindow =
    ['window_side', 'near_window', '窗边', '靠窗'].includes(position) ||
    (distance !== undefined && distance <= 1.2)

  let naturalLightType = 'weak_diffuse'
  if (hasDirectSun) {
    naturalLightType = 'direct'
  } else if (isNoWindow || isGrowLight) {
    naturalLightType = 'almost_none'
  } else if (isNearWindow) {
    naturalLightType = 'bright_diffuse'
  }

  const isOpenEnvironment = ['balcony', '阳台'].includes(facing)
  return {
    schemaVersion: SCHEMA_VERSION,
    naturalLightType,
    entryMethod:
      naturalLightType === 'almost_none'
        ? null
        : isOpenEnvironment
          ? 'open_environment'
          : 'through_glass',
    hasSupplementalLight: isGrowLight,
    captureSource: 'migrated_v1'
  }
}

function normalizeUserLightContext(input = {}) {
  const v2Input = isV2LightEnvironment(input)
  const migrated = v2Input ? null : migrateLegacyLightEnvironment(input)
  const source = migrated || input
  const naturalLightType = normalizeNaturalLightType(source?.naturalLightType)
  if (!naturalLightType) {
    return { hasMeaningfulInput: false }
  }

  const captureSource = CAPTURE_SOURCES.has(normalizeText(source.captureSource))
    ? normalizeText(source.captureSource)
    : 'migrated_v1'
  const normalizedEntryMethod = normalizeEntryMethod(source.entryMethod)
  const entryMethod =
    naturalLightType === 'almost_none' ? null : normalizedEntryMethod || 'through_glass'
  const hasMissingRequiredField = Boolean(
    v2Input &&
    ((naturalLightType !== 'almost_none' && !normalizedEntryMethod) ||
      typeof source.hasSupplementalLight !== 'boolean' ||
      !CAPTURE_SOURCES.has(normalizeText(source.captureSource)))
  )

  return {
    schemaVersion: SCHEMA_VERSION,
    naturalLightType,
    entryMethod,
    hasSupplementalLight: normalizeBoolean(source.hasSupplementalLight),
    captureSource,
    hasMeaningfulInput: true,
    wasMigratedFromLegacy: Boolean(migrated),
    hasMissingRequiredField
  }
}

module.exports = {
  SCHEMA_VERSION,
  clamp,
  toNumber,
  normalizeText,
  normalizeNaturalLightType,
  normalizeEntryMethod,
  normalizeBoolean,
  isV2LightEnvironment,
  migrateLegacyLightEnvironment,
  normalizeUserLightContext
}
