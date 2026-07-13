'use strict'

// 光照健康估算主流程
// 因子表、归一化、暴露计算已下沉到 layer/utils/light-exposure*.js（项目唯一事实源）。
// 本文件聚焦诊断特有逻辑：评分 → 等级 → 方向 → 说明文案。
// 保留现有诊断输出结构与测试不变。

let exposureModule
try {
  exposureModule = require('/opt/utils/light-exposure')
} catch {
  exposureModule = require('../../layer/utils/light-exposure')
}

const {
  FACTORS,
  DEFAULT_PROFILE,
  OVER_PENALTY,
  OVER_PENALTY_FALLBACK,
  SCORE_CLAMP_RANGE,
  SCORE_FULL,
  SCORE_MODERATE_THRESHOLD,
  SCORE_SEVERE_THRESHOLD,
  UNDERLIGHT_PENALTY_WEIGHT,
  UV_FACTOR_CLAMP,
  UV_FACTOR_SLOPE,
  UV_REFERENCE,
  clamp,
  toNumber,
  normalizeText,
  normalizeUserLightContext,
  normalizeWeatherDay,
  normalizeLightProfile,
  estimateBaseOutdoorHours,
  getDirectSunFactor,
  getDistanceFactor,
  getDirectSunExposureHours,
  round,
  mean
} = exposureModule

function resolveLevel({ score, indoorEqHours, minNeed, maxNeed }) {
  if (indoorEqHours < minNeed) {
    if (score < SCORE_SEVERE_THRESHOLD) {
      return '严重不足'
    }
    if (score < SCORE_MODERATE_THRESHOLD) {
      return '明显不足'
    }
    return '略不足'
  }
  if (indoorEqHours > maxNeed) {
    if (score < SCORE_SEVERE_THRESHOLD) {
      return '严重偏强'
    }
    if (score < SCORE_MODERATE_THRESHOLD) {
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

function getOverPenalty(way = '') {
  return OVER_PENALTY[normalizeText(way)] || OVER_PENALTY_FALLBACK
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
  const uvFactor =
    avgUv === undefined
      ? 1
      : clamp(1 + UV_FACTOR_SLOPE * ((avgUv - UV_REFERENCE) / UV_REFERENCE), ...UV_FACTOR_CLAMP)
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
  let score = SCORE_FULL
  if (indoorEqHours < minNeed) {
    score = SCORE_FULL - ((minNeed - indoorEqHours) / minNeed) * UNDERLIGHT_PENALTY_WEIGHT
  } else if (indoorEqHours > maxNeed) {
    score = SCORE_FULL - ((indoorEqHours - maxNeed) / maxNeed) * getOverPenalty(profile.way)
  }
  score = clamp(Math.round(score), ...SCORE_CLAMP_RANGE)
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
