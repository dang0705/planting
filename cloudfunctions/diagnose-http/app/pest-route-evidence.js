'use strict'

// 路由证据 ledger 与固定题包模式识别工具，从 pest-visual-orchestrator.js 拆分。
// 本文件处理 routeResult → evidence ledger 的转换，以及 direct tier 下候选模式的角色提升。

const STATIC_ROUTE_MODE_OPTIONS = Object.freeze({
  yellow_leaf: Object.freeze({
    classKey: 'yellowing_mode',
    modeKey: 'yellow_leaf',
    classNameCn: '黄叶模式',
    symptomKey: 'uniform_yellowing',
    symptomCn: '整叶黄化'
  }),
  wilting_droop: Object.freeze({
    classKey: 'wilting_droop_mode',
    modeKey: 'wilting_droop',
    classNameCn: '枯萎 / 发蔫模式',
    symptomKey: 'wilting_droop',
    symptomCn: '枯萎 / 发蔫'
  })
})

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

// 从 routeResult 构建证据 ledger：directMatches → direct_match，confirmationCandidates → confirmation_support，
// provisionalMatches → candidate_match。同 mode+evidence+group 去重。
function routeEvidenceLedger(routeResult = {}) {
  const sources = [
    ...(Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []).map(item => ({
      ...item,
      routeEvidenceRole: 'direct_match'
    })),
    ...(Array.isArray(routeResult.confirmationCandidates)
      ? routeResult.confirmationCandidates
      : []
    ).map(item => ({ ...item, routeEvidenceRole: 'confirmation_support' })),
    ...(Array.isArray(routeResult.provisionalMatches) ? routeResult.provisionalMatches : []).map(
      item => ({ ...item, routeEvidenceRole: 'candidate_match' })
    )
  ]
  const seen = new Set()
  return sources.flatMap(item =>
    (Array.isArray(item.matchedEvidence) ? item.matchedEvidence : []).flatMap(evidence => {
      const key = `${item.modeKey}::${evidence.evidenceKey || evidence.symptomKey || ''}::${evidence.evidenceGroup || ''}`
      if (seen.has(key)) {
        return []
      }
      seen.add(key)
      return {
        ...evidence,
        diagnosisMode: item.modeKey,
        modeKey: item.modeKey,
        routeEvidenceRole: item.routeEvidenceRole,
        sourceType: 'visual_mode_router'
      }
    })
  )
}

function directEvidence(routeResult = {}) {
  return routeEvidenceLedger({
    directMatches: Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []
  })
}

// >=0.95 direct tier（来自 confidence，无 evidence-based direct match）下，
// 候选模式即使没有视觉证据锁定也应被视为 direct_match，
// 确保 resolveSpecificPestAnswerResult 输出 direct 级置信度和不带"可能是"的文案。
//
// 关键守卫（fix #72）：当 routeResult 含不同 confidence 的候选（如 aphid=0.96 + whitefly=0.20）时，
// 不能把所有 pestCandidateModes 都提升为 direct_match。只提升 confidence>=0.95 的候选，
// 低于 0.95 的候选保留 confirmation/candidate 角色，避免低置信候选被错误展示为已确认。
function directEvidenceLedgerForDirectResult(routeResult = {}, pestCandidateModes = [], tier = '') {
  const baseLedger = routeEvidenceLedger(routeResult)
  if (normalizeKey(tier) !== 'direct') {
    return baseLedger
  }
  const directModeKeys = (Array.isArray(routeResult.directMatches)
    ? routeResult.directMatches
    : []
  )
    .map(item => item.modeKey)
    .filter(Boolean)
  // direct tier 由 evidence-based direct match 触发时，候选应保留各自的
  // confirmation/candidate 角色，不在此处提升为 direct_match。
  if (directModeKeys.length > 0) {
    return baseLedger
  }
  const lockedSet = new Set(
    baseLedger
      .filter(item => normalizeKey(item.routeEvidenceRole) === 'direct_match')
      .map(item => normalizeKey(item.diagnosisMode || item.modeKey))
      .filter(Boolean)
  )

  // fix #72: 按 candidate confidence 过滤，只提升 >=0.95 的候选为 direct_match。
  // 候选 confidence 来自 routeResult.confirmationCandidates / provisionalMatches / normalizedModeCandidates。
  // 当 routeResult 中候选不带 confidence 字段时（router 未透传 visualModeCandidates.confidence），
  // 不能保守地全部不提升——这会破坏 direct tier 的原有行为。
  // 此时回退到原逻辑：所有 pestCandidateModes 都提升为 direct_match（信任 confidenceTier=direct）。
  const candidateConfidenceMap = new Map()
  for (const item of [
    ...(Array.isArray(routeResult.confirmationCandidates) ? routeResult.confirmationCandidates : []),
    ...(Array.isArray(routeResult.provisionalMatches) ? routeResult.provisionalMatches : []),
    ...(Array.isArray(routeResult.normalizedModeCandidates) ? routeResult.normalizedModeCandidates : [])
  ]) {
    if (item?.modeKey !== undefined && Number.isFinite(Number(item?.confidence))) {
      const existing = candidateConfidenceMap.get(item.modeKey)
      const conf = Number(item.confidence)
      if (existing === undefined || conf > existing) {
        candidateConfidenceMap.set(item.modeKey, conf)
      }
    }
  }
  const hasAnyConfidenceData = candidateConfidenceMap.size > 0
  const DIRECT_TIER_CONFIDENCE_THRESHOLD = 0.95
  const additional = pestCandidateModes
    .filter(mode => !lockedSet.has(normalizeKey(mode)))
    .filter(mode => {
      // routeResult 未透传 confidence 时回退到原行为（全部提升）
      if (!hasAnyConfidenceData) {
        return true
      }
      const conf = candidateConfidenceMap.get(mode)
      // 仅提升 confidence>=0.95 的候选；缺失 confidence 时不提升（保守）
      return conf !== undefined && conf >= DIRECT_TIER_CONFIDENCE_THRESHOLD
    })
    .map(mode => ({
      evidenceKey: mode,
      symptomKey: mode,
      diagnosisMode: mode,
      modeKey: mode,
      routeEvidenceRole: 'direct_match',
      sourceType: 'visual_mode_router',
      currentStatus: 'active',
      suppressEquivalentQuestion: true,
      lockedInQuestionnaire: true
    }))
  return [...baseLedger, ...additional]
}

// 识别 routeResult 中的固定题包模式（yellow_leaf / wilting_droop），按优先级选取第一个。
function routeFixedQuestionPackageMode(routeResult = {}) {
  const modeKeys = Array.from(
    new Set([
      ...(Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []).map(
        item => item.modeKey
      ),
      ...(Array.isArray(routeResult.associatedModes) ? routeResult.associatedModes : [])
    ])
  ).filter(modeKey => Object.prototype.hasOwnProperty.call(STATIC_ROUTE_MODE_OPTIONS, modeKey))

  // 多固定题包模式时按优先级选取第一个（directMatches 优先于 associatedModes）。
  // 同时识别黄叶+枯萎的概率极低，选取一个走题包不阻塞用户。
  return modeKeys.length >= 1 ? modeKeys[0] : ''
}

module.exports = {
  STATIC_ROUTE_MODE_OPTIONS,
  directEvidence,
  directEvidenceLedgerForDirectResult,
  normalizeKey,
  routeEvidenceLedger,
  routeFixedQuestionPackageMode
}
