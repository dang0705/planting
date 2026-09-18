'use strict'

let exposureModule
try {
  exposureModule = require('/opt/utils/light-exposure')
} catch {
  exposureModule = require('../../layer/utils/light-exposure')
}

const {
  clamp,
  normalizeUserLightContext,
  normalizeLightProfile,
  computeLightExposure
} = exposureModule

function resolveLevel(index, minNeed, maxNeed) {
  if (index < minNeed) {
    const shortfall = (minNeed - index) / Math.max(minNeed, 0.01)
    return shortfall >= 0.35 ? '明显不足' : '略不足'
  }
  if (index > maxNeed) {
    const headroom = Math.max(1 - maxNeed, 0.1)
    return (index - maxNeed) / headroom >= 0.35 ? '明显偏强' : '略偏强'
  }
  return '适合'
}

function resolveDirection(level = '') {
  if (String(level).includes('不足')) {
    return 'low'
  }
  if (String(level).includes('偏强')) {
    return 'strong'
  }
  if (level === '适合') {
    return 'suitable'
  }
  return 'unknown'
}

function resolveScore(index, minNeed, maxNeed) {
  if (index < minNeed) {
    return clamp(Math.round((index / Math.max(minNeed, 0.01)) * 100), 0, 100)
  }
  if (index > maxNeed) {
    const excessRatio = (index - maxNeed) / Math.max(1 - maxNeed, 0.1)
    return clamp(Math.round(100 - excessRatio * 60), 0, 100)
  }
  return 100
}

function buildReason({ level, exposure }) {
  if (exposure.confidence === 'low') {
    return '现有证据只能做初步判断，建议重新确认光照环境。'
  }
  if (level.includes('不足')) {
    return '植物实际接收到的光低于这类植物通常需要的水平。'
  }
  if (level.includes('偏强')) {
    return '植物实际接收到的光高于这类植物通常需要的水平。'
  }
  return '植物实际接收到的光与这类植物通常需要的水平基本匹配。'
}

function estimateLightHealth({
  plantContext = {},
  userLightContext = {},
  weatherDays = [],
  plantFeatures = {},
  weatherEvidenceInsufficient = false
} = {}) {
  const normalizedEnvironment = normalizeUserLightContext(userLightContext)
  if (!normalizedEnvironment.hasMeaningfulInput) {
    return null
  }

  const recentLightFactor = Number(plantFeatures?.weatherLightFactor10d)
  const lightEvidenceInsufficient =
    plantFeatures?.lightEvidenceInsufficient === true || weatherEvidenceInsufficient === true
  const exposure = computeLightExposure({
    userLightContext,
    weatherDays,
    weatherLightFactor: Number.isFinite(recentLightFactor) ? recentLightFactor : undefined,
    weatherEvidenceInsufficient: lightEvidenceInsufficient,
    weatherLightConfidence: plantFeatures?.lightConfidence
  })
  if (!exposure) {
    return null
  }

  const profile = normalizeLightProfile(plantContext)
  const migrated = exposure.evidence.captureSource === 'migrated_v1'
  if (migrated) {
    return {
      lightHealthScore: null,
      lightHealthLevel: '待确认',
      lightHealthReason: '这条光照记录来自旧数据，请重新确认植物实际接收到的光。',
      lightHealthEvidence: {
        formulaVersion: exposure.formulaVersion,
        direction: 'unknown',
        confidence: 'low',
        profile,
        exposure
      }
    }
  }

  const [minNeed, maxNeed] = profile.requirementRange
  const index = exposure.estimatedExposureIndex
  const deterministicLevel = resolveLevel(index, minNeed, maxNeed)
  const lowConfidence = exposure.confidence === 'low' || profile.confidence === 'low'
  const level = lowConfidence
    ? deterministicLevel.includes('不足')
      ? '可能偏低'
      : deterministicLevel.includes('偏强')
        ? '可能偏强'
        : '可能适合'
    : deterministicLevel

  return {
    lightHealthScore: lowConfidence ? null : resolveScore(index, minNeed, maxNeed),
    lightHealthLevel: level,
    lightHealthReason: buildReason({ level: deterministicLevel, exposure }),
    lightHealthEvidence: {
      formulaVersion: exposure.formulaVersion,
      direction: lowConfidence ? 'unknown' : resolveDirection(deterministicLevel),
      confidence: lowConfidence ? 'low' : exposure.confidence,
      profile,
      exposure,
      calculation: {
        estimatedExposureIndex: index,
        needRange: profile.requirementRange,
        score: lowConfidence ? null : resolveScore(index, minNeed, maxNeed)
      }
    }
  }
}

module.exports = {
  estimateLightHealth,
  normalizeUserLightContext,
  normalizeLightProfile,
  computeLightExposure,
  resolveLevel,
  resolveDirection,
  resolveScore
}
