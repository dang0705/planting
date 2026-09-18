'use strict'

/**
 * 分类光照共享计算。
 * 输出是 0-1 的相对估算指数，不代表小时、PPFD、DLI 或真实光量。
 */

const {
  FORMULA_VERSION,
  CALCULATION_MODE,
  NATURAL_LIGHT_TYPES,
  ENTRY_METHODS,
  WEATHER_MODIFIERS,
  LIGHT_REQUIREMENT_RANGES
} = require('./light-exposure-factors')
const {
  clamp,
  toNumber,
  normalizeText,
  normalizeUserLightContext
} = require('./light-exposure-normalize')

function round(value, digits = 3) {
  const factor = 10 ** digits
  return Math.round(Number(value || 0) * factor) / factor
}

function readPrecomputedDayLightFactor(day = {}) {
  const features = day?.dailyRollup?.lightFeatures || day?.lightFeatures
  const factor = toNumber(features?.weatherLightFactor)
  return factor === undefined ? undefined : clamp(factor, 0, 1)
}

function resolveWeatherLightEvidence({
  weatherLightFactor,
  weatherDays = [],
  weatherEvidenceInsufficient = false,
  weatherLightConfidence = ''
} = {}) {
  const explicit = toNumber(weatherLightFactor)
  if (explicit !== undefined && weatherEvidenceInsufficient !== true) {
    return {
      factor: clamp(explicit, 0, 1),
      sufficient: true,
      confidence: normalizeText(weatherLightConfidence) || 'medium',
      source: 'weather_light_factor_10d'
    }
  }

  const factors = (Array.isArray(weatherDays) ? weatherDays : [])
    .filter(day => day && day.missing !== true)
    .map(readPrecomputedDayLightFactor)
    .filter(value => value !== undefined)
  if (factors.length >= 3 && weatherEvidenceInsufficient !== true) {
    return {
      factor: factors.reduce((sum, value) => sum + value, 0) / factors.length,
      sufficient: true,
      confidence: factors.length >= 7 ? 'high' : 'medium',
      source: 'precomputed_daily_light_features'
    }
  }
  return {
    factor: 1,
    sufficient: false,
    confidence: 'none',
    source: 'neutral_missing_weather_evidence'
  }
}

function resolveRequirementKey(way = '') {
  const normalized = normalizeText(way)
  if (!normalized) {
    return ''
  }
  if (/全日照\s*[\/或、]\s*半日照/.test(normalized)) {
    return 'full_or_partial_sun'
  }
  if (/明亮散射|明亮间接|bright.*indirect/i.test(normalized)) {
    return 'bright_diffuse'
  }
  if (/耐阴|shade.?tolerant/i.test(normalized)) {
    return 'shade_tolerant'
  }
  if (/半日照|partial.*sun/i.test(normalized)) {
    return 'partial_sun'
  }
  if (/全日照|full.*sun/i.test(normalized)) {
    return 'full_sun'
  }
  return 'unknown'
}

function resolveRequirementFromFrequency(freq = []) {
  const min = toNumber(Array.isArray(freq) ? freq[0] : undefined)
  if (min === undefined) {
    return 'unknown'
  }
  if (min >= 6) {
    return 'full_sun'
  }
  if (min >= 4) {
    return 'bright_diffuse'
  }
  return 'shade_tolerant'
}

function normalizeLightProfile(plantContext = {}) {
  const sunning =
    plantContext?.sunning || plantContext?.lightProfile || plantContext?.light_profile || {}
  const way = normalizeText(sunning.way || sunning.type || plantContext.lightRequirement)
  const freq = Array.isArray(sunning.freq)
    ? sunning.freq
    : Array.isArray(sunning.frequency)
      ? sunning.frequency
      : []
  const requirementKey = way ? resolveRequirementKey(way) : resolveRequirementFromFrequency(freq)
  const range = LIGHT_REQUIREMENT_RANGES[requirementKey] || LIGHT_REQUIREMENT_RANGES.unknown
  return {
    way: way || range.label,
    requirementKey,
    requirementRange: [range.min, range.max],
    source: way ? 'sunning_way' : freq.length ? 'sunning_freq_fallback' : 'fallback_unknown',
    confidence: way && requirementKey !== 'unknown' ? 'medium' : 'low',
    freq
  }
}

function computeLightExposure({
  userLightContext = {},
  weatherDays = [],
  weatherLightFactor,
  weatherEvidenceInsufficient = false,
  weatherLightConfidence = ''
} = {}) {
  const env = normalizeUserLightContext(userLightContext)
  if (!env.hasMeaningfulInput) {
    return null
  }

  const weather = resolveWeatherLightEvidence({
    weatherLightFactor,
    weatherDays,
    weatherEvidenceInsufficient,
    weatherLightConfidence
  })
  const typeFactor = NATURAL_LIGHT_TYPES[env.naturalLightType]
  const weatherFormula = WEATHER_MODIFIERS[env.naturalLightType]
  const weatherModifier =
    weatherFormula.intercept + weatherFormula.slope * clamp(weather.factor, 0, 1)
  const entryModifier =
    env.naturalLightType === 'almost_none'
      ? 1
      : ENTRY_METHODS[env.entryMethod]?.modifier || ENTRY_METHODS.through_glass.modifier
  const estimatedExposureIndex = clamp(typeFactor.baseIndex * weatherModifier * entryModifier, 0, 1)

  const confidenceReasons = ['分类模型缺少持续时长证据']
  let confidence = 'medium'
  if (env.captureSource === 'migrated_v1') {
    confidence = 'low'
    confidenceReasons.push('光照环境来自旧数据迁移，尚未由用户确认')
  }
  if (env.hasMissingRequiredField) {
    confidence = 'low'
    confidenceReasons.push('光照记录缺少必要字段，已使用保守默认值')
  }
  if (!weather.sufficient) {
    confidence = 'low'
    confidenceReasons.push('近期天气光照证据不足，天气修正保持中性')
  }

  return {
    formulaVersion: FORMULA_VERSION,
    calculationMode: CALCULATION_MODE,
    estimatedExposureIndex: round(estimatedExposureIndex),
    confidence,
    confidenceReasons,
    evidence: {
      naturalLightType: env.naturalLightType,
      typeBaseIndex: typeFactor.baseIndex,
      weatherLightFactor: round(weather.factor),
      weatherModifier: round(weatherModifier),
      entryModifier,
      hasSupplementalLight: env.hasSupplementalLight,
      captureSource: env.captureSource
    }
  }
}

module.exports = {
  FORMULA_VERSION,
  CALCULATION_MODE,
  NATURAL_LIGHT_TYPES,
  ENTRY_METHODS,
  WEATHER_MODIFIERS,
  LIGHT_REQUIREMENT_RANGES,
  clamp,
  toNumber,
  normalizeText,
  normalizeUserLightContext,
  normalizeLightProfile,
  resolveWeatherLightEvidence,
  resolveRequirementKey,
  resolveRequirementFromFrequency,
  round,
  computeLightExposure
}
