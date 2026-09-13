'use strict'

/**
 * 盆土视觉证据与浇水规划融合。
 *
 * 视觉只能提供表层可见证据，不能推断根区含水量；因此这里仅允许它阻止
 * 明显的误浇，或把建议降级为“先手动摸土确认”。本模块保持纯函数，便于
 * 在两条浇水入口和单元测试中复用。
 */

const SOIL_EVIDENCE_TTL_MS = 24 * 60 * 60 * 1000
const VISUAL_WET_REASON_CODE = 'VISUAL_SOIL_WET_HOLD'
const VISUAL_DRY_REASON_CODE = 'VISUAL_SOIL_DRY_MANUAL_CHECK'
const VISUAL_UNCERTAIN_REASON_CODE = 'VISUAL_SOIL_MANUAL_CHECK'

function text(value = '') {
  return String(value || '').trim()
}

function numberInRange(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback
}

function parseJson(value, fallback = null) {
  if (!value) {
    return fallback
  }
  if (typeof value === 'object') {
    return value
  }
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

function isFresh(timestamp, now = Date.now()) {
  const time = new Date(timestamp || 0).getTime()
  return Number.isFinite(time) && time > 0 && time <= now && now - time <= SOIL_EVIDENCE_TTL_MS
}

function normalizeSoilVisualEvidence(value = {}, { now = Date.now() } = {}) {
  const raw = parseJson(value, {}) || {}
  const review = raw.review && typeof raw.review === 'object' ? raw.review : raw
  const surfaceState = text(review.surfaceState).toLowerCase()
  const standingWater = text(review.standingWater).toLowerCase()
  const visibility = text(review.visibility).toLowerCase()
  const accepted = review.accepted === true
  const analyzedAt = review.analyzedAt || raw.analyzedAt || raw.analyzed_at || ''
  const confidence = numberInRange(review.confidence)
  const fresh = isFresh(analyzedAt, now)
  const clear = visibility === 'clear'
  const trusted = accepted && fresh && clear && confidence >= 0.72

  return {
    accepted,
    fresh,
    trusted,
    analyzedAt,
    source: text(review.source || raw.source),
    surfaceState: ['wet', 'moist', 'dry', 'uncertain'].includes(surfaceState)
      ? surfaceState
      : 'uncertain',
    standingWater: ['yes', 'no', 'uncertain'].includes(standingWater)
      ? standingWater
      : 'uncertain',
    visibility: ['clear', 'limited', 'unusable'].includes(visibility) ? visibility : 'unusable',
    confidence,
    visibleBasisCn: text(review.visibleBasisCn).slice(0, 120)
  }
}

function uniqueReasonCodes(...groups) {
  return Array.from(
    new Set(groups.flatMap(group => (Array.isArray(group) ? group : [])).filter(Boolean))
  )
}

function buildVisualAudit(evidence, outcome, requiresManualSoilConfirmation) {
  return {
    outcome,
    source: evidence.source || 'photo',
    surfaceState: evidence.surfaceState,
    standingWater: evidence.standingWater,
    visibility: evidence.visibility,
    confidence: evidence.confidence,
    fresh: evidence.fresh,
    trusted: evidence.trusted,
    visibleBasisCn: evidence.visibleBasisCn,
    requiresManualSoilConfirmation: Boolean(requiresManualSoilConfirmation)
  }
}

function fuseWateringPlanWithSoilEvidence(plan = {}, rawEvidence = {}, { manualConfirmed = false } = {}) {
  const evidence = normalizeSoilVisualEvidence(rawEvidence)
  const base = {
    ...plan,
    reasonCodes: Array.isArray(plan.reasonCodes) ? [...plan.reasonCodes] : []
  }
  const algorithmWet = base.wateringContext === 'likely_too_wet'
  const wetVisible = evidence.trusted && (evidence.surfaceState === 'wet' || evidence.standingWater === 'yes')

  if (wetVisible) {
    return {
      ...base,
      nextWaterDate: null,
      nextWaterWindow: null,
      nextWaterReason: '盆土表面仍明显湿润，本次先不要浇水，也不安排浇水提醒。',
      wateringContext: 'likely_too_wet',
      action: 'pause_watering_for_visual_soil_wetness',
      amountRangeMl: [0, 0],
      stopCondition: '等盆土干一些后，再重新拍照并手动摸土确认。',
      soilCheck: {
        required: true,
        beforeWatering: true,
        message: '盆土表面仍湿润或可见积水，本次先不要浇水。',
        reasonCode: VISUAL_WET_REASON_CODE
      },
      reasonCodes: uniqueReasonCodes(base.reasonCodes, [VISUAL_WET_REASON_CODE]),
      visualSoilEvidence: buildVisualAudit(evidence, 'wet_hold', false)
    }
  }

  // 算法已经进入过湿保护时，任何“表层偏干”都不能解除保护。
  if (algorithmWet) {
    return {
      ...base,
      visualSoilEvidence: buildVisualAudit(evidence, 'algorithm_wet_protected', false)
    }
  }

  if (evidence.trusted && evidence.surfaceState === 'dry') {
    return {
      ...base,
      soilCheck: {
        required: true,
        beforeWatering: true,
        message: '盆土表层偏干；请用手摸入约 2–3 厘米确认，再决定是否浇水。',
        reasonCode: VISUAL_DRY_REASON_CODE
      },
      reasonCodes: uniqueReasonCodes(base.reasonCodes, [VISUAL_DRY_REASON_CODE]),
      requiresManualSoilConfirmation: !manualConfirmed,
      visualSoilEvidence: buildVisualAudit(evidence, 'dry_manual_check', !manualConfirmed)
    }
  }

  return {
    ...base,
    soilCheck: {
      required: true,
      beforeWatering: true,
      message: '请用手摸入约 2–3 厘米确认盆土状态后，再决定是否浇水。',
      reasonCode: VISUAL_UNCERTAIN_REASON_CODE
    },
    reasonCodes: uniqueReasonCodes(base.reasonCodes, [VISUAL_UNCERTAIN_REASON_CODE]),
    requiresManualSoilConfirmation: !manualConfirmed,
    visualSoilEvidence: buildVisualAudit(evidence, 'manual_check', !manualConfirmed)
  }
}

module.exports = {
  SOIL_EVIDENCE_TTL_MS,
  VISUAL_WET_REASON_CODE,
  VISUAL_DRY_REASON_CODE,
  VISUAL_UNCERTAIN_REASON_CODE,
  normalizeSoilVisualEvidence,
  fuseWateringPlanWithSoilEvidence
}
