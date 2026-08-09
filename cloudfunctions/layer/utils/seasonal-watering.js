'use strict'

const SEASONAL_FACTOR_MIN = 0.85
const SEASONAL_FACTOR_MAX = 1.15

function clampFactor(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return 1
  }
  return Math.max(
    SEASONAL_FACTOR_MIN,
    Math.min(SEASONAL_FACTOR_MAX, Math.round(number * 100) / 100)
  )
}

function resolveSeason(dateValue = '') {
  const date = new Date(dateValue || Date.now())
  if (Number.isNaN(date.getTime())) {
    return null
  }
  const month = date.getMonth() + 1
  if (month >= 3 && month <= 5) {
    return 'spring'
  }
  if (month >= 6 && month <= 8) {
    return 'summer'
  }
  if (month >= 9 && month <= 11) {
    return 'autumn'
  }
  return 'winter'
}

/**
 * Seasonal correction is deliberately opt-in. Existing genus profiles without
 * seasonalGate keep the current baseline exactly, so adding this layer cannot
 * silently change old plants.
 *
 * Supported minimal shape:
 * { seasonalGate: { intervalFactors: { summer: 0.95, winter: 1.05 } } }
 * or { seasonalGate: { summer: { intervalFactor: 0.95 } } }.
 */
function resolveSeasonalIntervalFactor({ referenceDate = '', wateringQuantization = null } = {}) {
  const gate = wateringQuantization?.seasonalGate
  if (!gate || typeof gate !== 'object' || gate.enabled === false) {
    return 1
  }

  const season = resolveSeason(referenceDate)
  if (!season) {
    return 1
  }
  const configured = gate.intervalFactors?.[season] ?? gate[season]
  const rawFactor =
    configured && typeof configured === 'object' ? configured.intervalFactor : configured
  if (rawFactor === undefined || rawFactor === null || rawFactor === '') {
    return 1
  }
  return clampFactor(rawFactor)
}

module.exports = {
  resolveSeasonalIntervalFactor,
  resolveSeason,
  SEASONAL_FACTOR_MIN,
  SEASONAL_FACTOR_MAX
}
