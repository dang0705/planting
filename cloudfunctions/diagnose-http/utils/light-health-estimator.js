'use strict'

// 光照健康估算主流程
// 暴露公式（归一化 + 因子 + indoorEqHours）已下沉到 layer/utils/light-exposure.js，
// 本文件直接调用 computeLightExposure 消费其结果，只保留诊断特有的：
//   植物需求 profile → 评分 → 等级 → 方向 → 说明文案 → 诊断 evidence 结构。
// 保留现有诊断输出结构与测试不变。

let exposureModule
try {
  exposureModule = require('/opt/utils/light-exposure')
} catch {
  exposureModule = require('../../layer/utils/light-exposure')
}

const {
  FACTORS,
  OVER_PENALTY,
  OVER_PENALTY_FALLBACK,
  SCORE_CLAMP_RANGE,
  SCORE_FULL,
  SCORE_SEVERE_THRESHOLD,
  SCORE_MODERATE_THRESHOLD,
  UNDERLIGHT_PENALTY_WEIGHT,
  clamp,
  normalizeText,
  normalizeUserLightContext,
  normalizeLightProfile,
  computeLightExposure,
  round
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
  const profile = normalizeLightProfile(plantContext)
  const [minNeed, maxNeed] = profile.freq

  // 诊断侧决定 weatherLightFactor 来源：优先使用 plantFeatures 中的 recent10d 因子，
  // 证据不足时回退到 1.0（中性，不擅自放大耗水）。
  const recentLightFactor = plantFeatures?.weatherLightFactor10d
  const lightEvidenceInsufficient = plantFeatures?.lightEvidenceInsufficient === true
  const useRecentLightFactor =
    Number.isFinite(recentLightFactor) && !lightEvidenceInsufficient && !weatherEvidenceInsufficient
  const weatherLightFactor = useRecentLightFactor ? recentLightFactor : 1.0
  const weatherLightConfidence = useRecentLightFactor
    ? String(plantFeatures?.lightConfidence || 'none')
    : 'none'

  // 调用共享 Layer 的唯一暴露公式实现，消费其结构化结果。
  const exposure = computeLightExposure({
    userLightContext,
    weatherDays,
    weatherLightFactor
  })
  if (!exposure) {
    return null
  }

  const {
    env,
    indoorEqHours,
    factors,
    baseOutdoorHours,
    weatherDaysCount,
    avgUv,
    uvFactor,
    outdoorEqHours
  } = exposure

  // 诊断特有：基于植物需求与最终暴露量评分。
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
        days: weatherDaysCount,
        baseOutdoorHours: baseOutdoorHours.value,
        baseOutdoorHoursSource: baseOutdoorHours.source,
        avgUv,
        uvFactor,
        weatherLightFactor,
        weatherLightConfidence,
        outdoorEqHours
      },
      factors,
      calculation: {
        indoorEqHours,
        directSunExposureHours: factors.directSunExposureHours,
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
  computeLightExposure
}
