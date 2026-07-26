'use strict'

// 非虫害 visual_direct_only 模式（如 powdery_mildew / sooty_mold）的直接结果构建器，
// 从 pest-visual-orchestrator.js 拆分。
//
// 与 pest 路径的差异：
// - 固定题包模式（yellow_leaf/wilting_droop）不在此列，必须走问诊路径
// - visual_direct_only 模式无动态问诊 blueprint，direct tier (>=0.95) 直接结论
// - very_likely tier (0.90-<0.95) 加"很像"前缀 + optionalFollowUp 标记
// - below-likely tier (<0.90) 保留 uncertainty，不输出 high confidence 病害诊断（fix #73）
//
// 字段完整性契约（fix #74）：
// - 顶层必须包含 outcomeType、resultId，供 session-state-write-service 持久化
// - finalResult 必须包含 problemId（与 problemKey 同值），供 session-state 读取
// - visibleOutcomes 每项必须有 modeKey + outcomeType

const { DIAGNOSIS_MODE_REGISTRY } = require('../domain/diagnosis-mode-registry')

// 给 displayName 加"很像"前缀，避免重复前缀
function prefixLikelyLabel(label = '') {
  const text = String(label || '').trim()
  if (!text) {
    return text
  }
  if (text.startsWith('很像') || text.startsWith('可能是')) {
    return text
  }
  return `很像${text}`
}

/**
 * 构建非虫害 visual_direct_only 模式的直接结果。
 *
 * @param {object} params
 * @param {string} params.modeKey - 模式 key（如 powdery_mildew）
 * @param {string} params.sessionId
 * @param {number} params.round
 * @param {object} params.plantContext
 * @param {object} params.routeResult
 * @param {object|null} params.aggregateResult
 * @param {boolean} params.likelyResult - true=0.90-<0.95 very_likely tier；false=>=0.95 direct tier
 * @param {string} params.resultId - 结果 ID（用于 session 持久化）
 * @returns {object} 完整的诊断响应对象
 */
function buildNonPestDirectResult({
  modeKey,
  sessionId,
  round,
  plantContext,
  routeResult,
  aggregateResult,
  likelyResult = false,
  resultId = ''
} = {}) {
  const entry = DIAGNOSIS_MODE_REGISTRY[modeKey] || {}
  const baseDisplayName = entry.userDisplayName || modeKey
  // likelyResult 时加"很像"前缀
  const displayName = likelyResult ? prefixLikelyLabel(baseDisplayName) : baseDisplayName
  const confidenceLevel = likelyResult ? 'likely' : 'high'

  // fix #74: 补全 problemId（session-state-write-service 读 problemId 而非 problemKey）
  // fix #74: 顶层补全 outcomeType + resultId，供 session 持久化与 frontend-response 输出
  return {
    diagnosisSessionId: sessionId,
    resultId,
    roundId: `round_${round}`,
    plantContext,
    routePrimaryAction: 'finalize',
    diagnosisModeRouteResult: routeResult,
    visualAggregateResult: aggregateResult,
    stage: 'final',
    status: 'closed',
    outcomeType: 'problematic',
    finalResult: {
      resultId,
      problemId: modeKey,
      problemKey: modeKey,
      problemName: displayName,
      displayName,
      outcomeType: 'problematic',
      confidenceLevel
    },
    visibleOutcomes: [
      {
        modeKey,
        displayNameCn: displayName,
        displayName,
        outcomeType: 'problematic'
      }
    ],
    topProblem: {
      modeKey,
      displayName,
      problemKey: modeKey,
      problemId: modeKey
    },
    candidateModes: [modeKey],
    // likelyResult 标记，供 frontend-response.js 的 hasOptionalFollowUp 判断使用
    ...(likelyResult
      ? {
          uiHints: { optionalFollowUp: true, likelyResult: true },
          questionPackage: { optionalFollowUp: true, likelyResult: true, questionCount: 0 }
        }
      : {})
  }
}

/**
 * 判断非虫害 visual_direct_only candidate 的 confidence tier。
 * 用于 question_package fall-through 时决定输出 direct result 还是保留 uncertainty。
 *
 * @param {string} modeKey
 * @param {object} routeResult
 * @returns {{ eligible: boolean, likelyResult: boolean, reason: string }}
 *   - eligible: 是否可以直接结论（confidence >= 0.90）
 *   - likelyResult: 是否为 0.90-<0.95 very_likely tier
 *   - reason: 不 eligible 时的原因
 */
function resolveNonPestCandidateTier(modeKey, routeResult = {}) {
  // 从 routeResult 各候选源查 modeKey 的 confidence
  const candidateSources = [
    ...(Array.isArray(routeResult.confirmationCandidates) ? routeResult.confirmationCandidates : []),
    ...(Array.isArray(routeResult.provisionalMatches) ? routeResult.provisionalMatches : []),
    ...(Array.isArray(routeResult.normalizedModeCandidates) ? routeResult.normalizedModeCandidates : [])
  ]
  let maxConfidence = -1
  for (const item of candidateSources) {
    if (item?.modeKey === modeKey && Number.isFinite(Number(item?.confidence))) {
      const conf = Number(item.confidence)
      if (conf > maxConfidence) {
        maxConfidence = conf
      }
    }
  }

  // direct tier 由 routeResult.confidenceTier='direct' 触发，candidate confidence 缺失时也允许（保守：用 tier 判断）
  const tier = String(routeResult.confidenceTier || '').trim().toLowerCase()
  if (tier === 'direct') {
    return { eligible: true, likelyResult: false, reason: 'direct_tier' }
  }
  // very_likely tier (0.90-<0.95)
  if (tier === 'very_likely' || (maxConfidence >= 0.90 && maxConfidence < 0.95)) {
    return { eligible: true, likelyResult: true, reason: 'very_likely_tier' }
  }
  // >=0.95 confidence（即使 tier 不是 direct，也按 direct 处理）
  if (maxConfidence >= 0.95) {
    return { eligible: true, likelyResult: false, reason: 'high_confidence' }
  }
  // 0.90-<0.95
  if (maxConfidence >= 0.90) {
    return { eligible: true, likelyResult: true, reason: 'likely_confidence' }
  }
  // fix #73: <0.90 不应输出 high confidence 病害诊断，保留 uncertainty
  return {
    eligible: false,
    likelyResult: false,
    reason: maxConfidence < 0 ? 'no_confidence_data' : 'below_likely_threshold'
  }
}

module.exports = {
  buildNonPestDirectResult,
  prefixLikelyLabel,
  resolveNonPestCandidateTier
}
