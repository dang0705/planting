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
// 字段完整性契约（fix #74 / review #18）：
// - 顶层必须包含 outcomeType、resultId，供 session-state-write-service 持久化
// - finalResult 必须包含 problemId（与 problemKey 同值），供 session-state 读取
// - visibleOutcomes 每项必须有 modeKey + outcomeKey + problemKey + outcomeType
//
// 多非虫害匹配契约（review #17）：
// - 当图片同时命中多个高置信非虫害病害时，输出全部 eligible 模式作为 visibleOutcomes
// - finalResult/topProblem 取置信度最高的模式
// - 附加 directionChoices 细分入口，供用户在结果页选择优先处理哪个病害

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
 * 从 normalizedModeCandidates 解析每个 modeKey 的最高 confidence。
 * @param {Array<{modeKey: string, confidence: number}>} normalizedModeCandidates
 * @returns {Map<string, number>} modeKey -> 最高 confidence
 */
function buildCandidateConfidenceMap(normalizedModeCandidates = []) {
  const map = new Map()
  for (const item of Array.isArray(normalizedModeCandidates) ? normalizedModeCandidates : []) {
    if (item?.modeKey !== undefined && Number.isFinite(Number(item?.confidence))) {
      const conf = Number(item.confidence)
      const existing = map.get(item.modeKey)
      if (existing === undefined || conf > existing) {
        map.set(item.modeKey, conf)
      }
    }
  }
  return map
}

/**
 * 构建非虫害 visual_direct_only 模式的直接结果。
 *
 * 支持单模式和多模式（review #17）：当 modeKeys 含多个模式时，visibleOutcomes 输出全部，
 * finalResult/topProblem 取置信度最高的模式，并附加 directionChoices 细分入口。
 *
 * @param {object} params
 * @param {string|string[]} params.modeKeys - 模式 key（如 powdery_mildew）或其数组；兼容旧 modeKey
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
  modeKeys,
  sessionId,
  round,
  plantContext,
  routeResult,
  aggregateResult,
  likelyResult = false,
  resultId = ''
} = {}) {
  // 兼容旧调用：modeKeys 可为单字符串
  const modeKeyList = Array.isArray(modeKeys)
    ? modeKeys.filter(Boolean)
    : [modeKeys].filter(Boolean)
  const normalizedModeCandidates = Array.isArray(routeResult?.normalizedModeCandidates)
    ? routeResult.normalizedModeCandidates
    : []
  const confidenceMap = buildCandidateConfidenceMap(normalizedModeCandidates)

  // 按置信度降序排列：finalResult/topProblem 取首个（最高置信）
  const sortedModes = modeKeyList
    .slice()
    .sort((a, b) => (confidenceMap.get(b) ?? -1) - (confidenceMap.get(a) ?? -1))
  const primaryModeKey = sortedModes[0]
  const entry = DIAGNOSIS_MODE_REGISTRY[primaryModeKey] || {}
  const baseDisplayName = entry.userDisplayName || primaryModeKey
  // likelyResult 时给主结论加"很像"前缀
  const displayName = likelyResult ? prefixLikelyLabel(baseDisplayName) : baseDisplayName
  const confidenceLevel = likelyResult ? 'likely' : 'high'

  // review #18: visibleOutcomes 每项补 outcomeKey + problemKey = modeKey，
  // 与 finalResult/topProblem 一致，避免 resolveOutcomeIdentityKey 回退到 outcome_N 合成 key。
  const visibleOutcomes = sortedModes.map(modeKey => {
    const modeEntry = DIAGNOSIS_MODE_REGISTRY[modeKey] || {}
    const modeDisplayName = modeEntry.userDisplayName || modeKey
    return {
      modeKey,
      outcomeKey: modeKey,
      problemKey: modeKey,
      displayNameCn: modeDisplayName,
      displayName: modeDisplayName,
      outcomeType: 'problematic'
    }
  })

  const response = {
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
      problemId: primaryModeKey,
      problemKey: primaryModeKey,
      problemName: displayName,
      displayName,
      outcomeType: 'problematic',
      confidenceLevel
    },
    visibleOutcomes,
    topProblem: {
      modeKey: primaryModeKey,
      displayName,
      problemKey: primaryModeKey,
      problemId: primaryModeKey
    },
    candidateModes: sortedModes,
    // likelyResult 标记，供 frontend-response.js 的 hasOptionalFollowUp 判断使用
    // review #14: 保留 optionalFollowUp 作为入口（实际问题后续设计），questionCount=0 无实际问题
    ...(likelyResult
      ? {
          uiHints: { optionalFollowUp: true, likelyResult: true },
          questionPackage: { optionalFollowUp: true, likelyResult: true, questionCount: 0 }
        }
      : {})
  }

  // review #17: 多非虫害匹配时附加细分入口（directionChoices），
  // 让用户在结果页可选择优先处理哪个病害。
  if (sortedModes.length > 1) {
    const directionChoices = sortedModes.map(modeKey => {
      const modeEntry = DIAGNOSIS_MODE_REGISTRY[modeKey] || {}
      return {
        modeKey,
        directionKey: modeKey,
        familyKey: 'general',
        problemKey: modeKey,
        category: modeEntry.category || 'general',
        userDisplayName: modeEntry.userDisplayName || modeKey
      }
    })
    response.directionChoices = directionChoices
    response.routePrimaryAction = 'choose_direction'
  }

  return response
}

/**
 * 判断非虫害 visual_direct_only candidate 的 confidence tier。
 * 用于 question_package fall-through 时决定输出 direct result 还是保留 uncertainty。
 *
 * 支持多模式（review #17）：任一候选 eligible 即视为 eligible；likelyResult 取所有候选
 * 中存在 0.90-<0.95 即为 true。
 *
 * @param {string|string[]} modeKeys - 单 modeKey 或其数组
 * @param {object} routeResult
 * @returns {{ eligible: boolean, likelyResult: boolean, reason: string }}
 *   - eligible: 是否可以直接结论（至少一个候选 confidence >= 0.90 或 direct tier）
 *   - likelyResult: 是否存在 0.90-<0.95 very_likely tier 候选
 *   - reason: 不 eligible 时的原因
 */
function resolveNonPestCandidateTier(modeKeys, routeResult = {}) {
  const modeKeyList = Array.isArray(modeKeys)
    ? modeKeys.filter(Boolean)
    : [modeKeys].filter(Boolean)
  const candidateSources = [
    ...(Array.isArray(routeResult.confirmationCandidates) ? routeResult.confirmationCandidates : []),
    ...(Array.isArray(routeResult.provisionalMatches) ? routeResult.provisionalMatches : []),
    ...(Array.isArray(routeResult.normalizedModeCandidates) ? routeResult.normalizedModeCandidates : [])
  ]
  const confidenceByMode = new Map()
  for (const item of candidateSources) {
    if (item?.modeKey !== undefined && Number.isFinite(Number(item?.confidence))) {
      const conf = Number(item.confidence)
      const existing = confidenceByMode.get(item.modeKey)
      if (existing === undefined || conf > existing) {
        confidenceByMode.set(item.modeKey, conf)
      }
    }
  }

  // direct tier 由 routeResult.confidenceTier='direct' 触发，candidate confidence 缺失时也允许（保守：用 tier 判断）
  const tier = String(routeResult.confidenceTier || '').trim().toLowerCase()
  if (tier === 'direct') {
    // very_likely 仍需逐候选判断；direct tier 下 >=0.95 为 direct，0.90-<0.95 为 likely
    let anyLikely = false
    for (const modeKey of modeKeyList) {
      const conf = confidenceByMode.get(modeKey)
      if (conf !== undefined && conf >= 0.90 && conf < 0.95) {
        anyLikely = true
      }
    }
    return { eligible: true, likelyResult: anyLikely, reason: 'direct_tier' }
  }

  let anyEligible = false
  let anyLikely = false
  let hasConfidenceData = false
  for (const modeKey of modeKeyList) {
    const conf = confidenceByMode.get(modeKey)
    if (conf === undefined) {
      continue
    }
    hasConfidenceData = true
    if (conf >= 0.95) {
      anyEligible = true
    } else if (conf >= 0.90) {
      anyEligible = true
      anyLikely = true
    }
  }

  // very_likely tier (0.90-<0.95) 由 tier 标记触发
  if (tier === 'very_likely') {
    return { eligible: true, likelyResult: true, reason: 'very_likely_tier' }
  }

  if (anyEligible) {
    return {
      eligible: true,
      likelyResult: anyLikely,
      reason: anyLikely ? 'likely_confidence' : 'high_confidence'
    }
  }

  // fix #73: <0.90 不应输出 high confidence 病害诊断，保留 uncertainty
  return {
    eligible: false,
    likelyResult: false,
    reason: !hasConfidenceData ? 'no_confidence_data' : 'below_likely_threshold'
  }
}

module.exports = {
  buildNonPestDirectResult,
  prefixLikelyLabel,
  resolveNonPestCandidateTier
}
