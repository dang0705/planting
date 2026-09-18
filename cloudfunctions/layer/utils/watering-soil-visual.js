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
    standingWater: ['yes', 'no', 'uncertain'].includes(standingWater) ? standingWater : 'uncertain',
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

function fuseWateringPlanWithSoilEvidence(
  plan = {},
  rawEvidence = {},
  {
    manualConfirmed = false,
    forceVisualWetness = false,
    forceDryness = false,
    manualSoilState = ''
  } = {}
) {
  const evidence = normalizeSoilVisualEvidence(rawEvidence)
  const base = {
    ...plan,
    reasonCodes: Array.isArray(plan.reasonCodes) ? [...plan.reasonCodes] : []
  }
  const algorithmWet = base.wateringContext === 'likely_too_wet'
  const trustedWetVisible =
    evidence.trusted && (evidence.surfaceState === 'wet' || evidence.standingWater === 'yes')
  const trustedMoistVisible = evidence.trusted && evidence.surfaceState === 'moist'
  const wetVisible = trustedWetVisible && !forceVisualWetness

  // 明确的视觉干燥、用户手摸判干或用户明确跳过后，都把内部状态按干燥处理。
  // 该分支在算法湿润保护之前执行，是产品明确授权的“干燥结果优先”。
  if (forceDryness) {
    return {
      ...base,
      soilCheck: {
        required: false,
        beforeWatering: false,
        message: '盆土已按干燥处理，建议尽快浇水。',
        reasonCode: VISUAL_DRY_REASON_CODE
      },
      reasonCodes: uniqueReasonCodes(base.reasonCodes, [VISUAL_DRY_REASON_CODE]),
      requiresManualSoilConfirmation: false,
      visualSoilEvidence: buildVisualAudit(evidence, 'dry_trusted', false)
    }
  }

  if (
    ['wet', 'moist'].includes(
      String(manualSoilState || '')
        .trim()
        .toLowerCase()
    )
  ) {
    return {
      ...base,
      wateringContext: 'likely_too_wet',
      action: 'pause_watering_for_manual_soil_wetness',
      nextWaterReason:
        '你确认盆土里面仍有湿度，强烈不建议立即浇水；如需设置日历提醒，保存前请再次确认。',
      stopCondition: '盆土潮湿时强烈不建议立即浇水；如确认仍要浇水，盆底有水流出即可停止',
      soilCheck: {
        required: true,
        beforeWatering: true,
        message: '你确认盆土里面仍有湿度，强烈不建议立即浇水；如需设置日历提醒，保存前请再次确认。',
        reasonCode: VISUAL_WET_REASON_CODE
      },
      reasonCodes: uniqueReasonCodes(base.reasonCodes, [VISUAL_WET_REASON_CODE]),
      visualSoilEvidence: buildVisualAudit(evidence, 'manual_wet_hold', false)
    }
  }

  if (wetVisible) {
    return {
      ...base,
      nextWaterReason:
        '盆土表面仍明显湿润，强烈不建议立即浇水；如需设置日历提醒，保存前请再次确认。',
      wateringContext: 'likely_too_wet',
      action: 'pause_watering_for_visual_soil_wetness',
      // 水量由基础规划统一计算并保留；视觉湿润只负责强提醒和日期保护。
      stopCondition: '盆土潮湿时强烈不建议立即浇水；如确认仍要浇水，盆底有水流出即可停止',
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

  // moist 是可信的视觉初判：明确看到了表层湿度，但它不等同于积水或
  // 整盆过湿。保留原规划器的 wateringContext/action，再要求用户结合
  // 摸土或近期浇水记录确认盆内状态。
  if (trustedMoistVisible) {
    return {
      ...base,
      soilCheck: {
        required: true,
        beforeWatering: true,
        message: '请摸到超过盆深 1/3 确认盆土状态后，再决定是否浇水。',
        reasonCode: VISUAL_UNCERTAIN_REASON_CODE
      },
      reasonCodes: uniqueReasonCodes(base.reasonCodes, [VISUAL_UNCERTAIN_REASON_CODE]),
      requiresManualSoilConfirmation: !manualConfirmed,
      visualSoilEvidence: buildVisualAudit(evidence, 'moist_visible', !manualConfirmed)
    }
  }

  // 算法已经进入过湿保护时，任何“表层偏干”都不能解除保护。
  if (algorithmWet) {
    return {
      ...base,
      visualSoilEvidence: buildVisualAudit(evidence, 'algorithm_wet_protected', false)
    }
  }

  // 用户仅能明确跳过“照片显示潮湿”的本次暂停，不能跳过算法自身的
  // 过湿、盆器或排水保护。仍保留醒目的人工确认提示，避免把水量估算误解为浇水许可。
  if (trustedWetVisible && forceVisualWetness) {
    return {
      ...base,
      soilCheck: {
        required: true,
        beforeWatering: true,
        message: '你已选择继续查看水量建议；盆土表面仍潮湿，实际浇水前请再次确认。',
        reasonCode: VISUAL_UNCERTAIN_REASON_CODE
      },
      reasonCodes: uniqueReasonCodes(base.reasonCodes, [VISUAL_UNCERTAIN_REASON_CODE]),
      requiresManualSoilConfirmation: false,
      visualSoilEvidence: buildVisualAudit(evidence, 'wet_forced', false)
    }
  }

  if (evidence.trusted && evidence.surfaceState === 'dry') {
    return {
      ...base,
      soilCheck: {
        required: true,
        beforeWatering: true,
        message: '盆土表层偏干；请摸到超过盆深 1/3 确认，再决定是否浇水。',
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
      message: '请摸到超过盆深 1/3 确认盆土状态后，再决定是否浇水。',
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
