'use strict'

const crypto = require('crypto')
const {
  DIAGNOSIS_MODE_REGISTRY,
  GENERIC_EVIDENCE_GROUP_KEYS,
  LOCKED_SPECIFIC_PEST_MODES,
  PEST_CATEGORY,
  PEST_EVIDENCE_RULES,
  PEST_MODE_KEYS
} = require('./diagnosis-mode-registry')
const { buildDirectionChoices, hasCrossFamilyModes } = require('./diagnosis-mode-direction-choice')
const { normalizeCaptureRegion } = require('../utils/capture-region-normalizer')

const THREE_MINUTES_MS = 3 * 60 * 1000
const HIGH_BAND = 'high'
const STRONG_LEVEL = 'strong'
const MEDIUM_BAND = 'medium'
const MEDIUM_LEVEL = 'medium'

// 置信度分档：决定候选模式能否进入问诊路径以及最多提问数。
// 0.60 为候选进入路由的最低门槛；<0.60 视为弱候选，仅在无更强候选时兜底使用。
// 0.60/0.80/0.90/0.95 四档分别对应 3/2/1/0 题（0.90-<0.95 仍保留 1 个可选排查问题）。
const CANDIDATE_ADMIT_CONFIDENCE = 0.6
const STRONG_CANDIDATE_CONFIDENCE = 0.8
const VERY_LIKELY_CANDIDATE_CONFIDENCE = 0.9
const DIRECT_CONCLUSION_CONFIDENCE = 0.95

// 候选模式对应的最大问诊题数（按候选最高置信度档位决定）。
// low (<0.60) 兜底也走 3 题；very_likely (0.90-<0.95) 走 1 个可选排查题；direct (>=0.95) 不问。
const TIER_MAX_QUESTIONS = Object.freeze({
  low: 3,
  medium: 2,
  high: 1,
  very_likely: 1,
  direct: 0
})

function candidateConfidenceTier(confidence = 0) {
  const value = Number(confidence) || 0
  if (value >= DIRECT_CONCLUSION_CONFIDENCE) {
    return 'direct'
  }
  if (value >= VERY_LIKELY_CANDIDATE_CONFIDENCE) {
    return 'very_likely'
  }
  if (value >= STRONG_CANDIDATE_CONFIDENCE) {
    return 'high'
  }
  if (value >= CANDIDATE_ADMIT_CONFIDENCE) {
    return 'medium'
  }
  return 'low'
}

function maxQuestionsForTier(tier = '') {
  return TIER_MAX_QUESTIONS[normalizeKey(tier)] ?? 0
}

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function normalizeKey(value = '') {
  return normalizeText(value, '').toLowerCase()
}

function unique(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map(normalizeKey).filter(Boolean)))
}

function rankBand(value = '') {
  return { low: 1, medium: 2, high: 3 }[normalizeKey(value)] || 0
}

function rankStrength(value = '') {
  return { weak: 1, medium: 2, strong: 3 }[normalizeKey(value)] || 0
}

function isStrongHighEvidence(item = {}) {
  return (
    rankBand(item.confidenceBand) >= rankBand(HIGH_BAND) &&
    rankStrength(item.strengthLevel) >= rankStrength(STRONG_LEVEL)
  )
}

function isAtLeastMediumEvidence(item = {}) {
  return (
    rankBand(item.confidenceBand) >= rankBand(MEDIUM_BAND) &&
    rankStrength(item.strengthLevel) >= rankStrength(MEDIUM_LEVEL)
  )
}

function evidenceGroupForKey(evidenceKey = '') {
  const key = normalizeKey(evidenceKey)
  if (GENERIC_EVIDENCE_GROUP_KEYS.has(key)) {
    return key
  }
  for (const rule of Object.values(PEST_EVIDENCE_RULES)) {
    for (const group of [...rule.directGroups, ...rule.indirectGroups]) {
      if (group.includes(key)) {
        return group[0]
      }
    }
  }
  return key
}

function stableHash(value = '') {
  return crypto
    .createHash('sha1')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 16)
}

function normalizeVisualEvidence(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => {
      const evidenceKey = normalizeKey(
        item?.evidenceKey || item?.evidence_key || item?.symptomKey || item?.symptom_key
      )
      const symptomKey = normalizeKey(item?.symptomKey || item?.symptom_key || evidenceKey)
      if (!evidenceKey && !symptomKey) {
        return null
      }
      const group = evidenceGroupForKey(
        item?.evidenceGroup || item?.evidence_group || evidenceKey || symptomKey
      )
      return {
        evidenceKey: evidenceKey || symptomKey,
        symptomKey: symptomKey || evidenceKey,
        evidenceGroup: group,
        confidenceBand: normalizeKey(item?.confidenceBand || item?.confidence_band || 'low'),
        strengthLevel: normalizeKey(item?.strengthLevel || item?.strength_level || 'weak'),
        imageId: normalizeText(item?.imageId || item?.image_id || item?.supportImageId || ''),
        regionRef: normalizeCaptureRegion(
          item?.regionRef || item?.region_ref || item?.captureRegion || item?.capture_region
        ),
        sourceRecordId: normalizeText(item?.sourceRecordId || item?.source_record_id || ''),
        currentStatus: normalizeKey(item?.currentStatus || item?.current_status || 'active')
      }
    })
    .filter(item => item && item.currentStatus === 'active')
}

function normalizeModeCandidates(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({
      modeKey: normalizeModeKey(
        item?.modeKey || item?.mode || item?.diagnosisMode || item?.diagnosis_mode
      ),
      confidence: Number(item?.confidence || 0),
      imageId: normalizeText(item?.imageId || item?.image_id || ''),
      regionRef: normalizeCaptureRegion(item?.regionRef || item?.region_ref || item?.captureRegion)
    }))
    .filter(item => DIAGNOSIS_MODE_REGISTRY[item.modeKey])
}

function hasSupportingEvidenceForMode(modeKey = '', evidenceItems = []) {
  return supportingEvidenceForMode(modeKey, evidenceItems).length > 0
}

function supportingEvidenceForMode(modeKey = '', evidenceItems = []) {
  const candidateGroups = PEST_EVIDENCE_RULES[modeKey]?.candidateGroups || []
  const classified = classifyModeEvidence(modeKey, evidenceItems)
  return [...classified.direct, ...classified.indirect]
    .filter(isAtLeastMediumEvidence)
    .filter(item => candidateGroups.some(group => groupIncludesEvidence(group, item)))
}

function normalizeModeKey(value = '') {
  const key = normalizeKey(value)
  const aliases = {
    spider_mites: 'spider_mite',
    scale_insects: 'scale_insect',
    whiteflies: 'whitefly',
    aphids: 'aphid',
    mealybugs: 'mealybug',
    leafminer: 'leaf_miner',
    leaf_miner_mode: 'leaf_miner',
    fungus_gnats: 'fungus_gnat'
  }
  return aliases[key] || key
}

function isFixedQuestionPackageMode(modeKey = '') {
  const entry = DIAGNOSIS_MODE_REGISTRY[modeKey]
  return ['fixed_yellow_leaf', 'fixed_wilting_droop'].includes(entry?.questionPackageKind)
}

function isVisualDirectOnlyMode(modeKey = '') {
  const entry = DIAGNOSIS_MODE_REGISTRY[modeKey]
  return entry?.questionPackageKind === 'visual_direct_only'
}

function isModeAllowedForProfile(modeKey = '', profile = 'full') {
  const entry = DIAGNOSIS_MODE_REGISTRY[modeKey]
  if (!entry) {
    return false
  }
  return entry.allowedProfiles.includes(profile)
}

// 判断候选模式是否可进入路由。
// pest profile 保持原严格逻辑：虫害候选需证据支撑或单候选 >=0.60。
// full profile 放宽：合法候选（在 REGISTRY 且 allowedProfiles 含 full）且 >=0.60 即可进入，
// 不强制要求 hasSupportingEvidenceForMode——证据只用于问题锁定和跳题。
function isCandidateAdmissible(modeKey = '', profile = 'full', context = {}) {
  const { normalizedModeCandidates = [], candidateOnlyModeKeys = [], confirmationEvidenceItems = [] } = context
  if (!isModeAllowedForProfile(modeKey, profile)) {
    return false
  }
  const hasCandidate = normalizedModeCandidates.some(
    item => item.modeKey === modeKey && item.confidence >= CANDIDATE_ADMIT_CONFIDENCE
  )
  const hasEvidence = hasSupportingEvidenceForMode(modeKey, confirmationEvidenceItems)
  if (PEST_MODE_KEYS.includes(modeKey)) {
    if (profile === 'full') {
      return hasCandidate || hasEvidence
    }
    return hasEvidence || (hasCandidate && candidateOnlyModeKeys.length === 1)
  }
  // 非虫害候选只在 full profile 处理
  if (profile !== 'full') {
    return false
  }
  return hasCandidate || hasEvidence
}

// 取候选列表中的最高置信度，用于决定分档
function topCandidateConfidence(modeKeys = [], normalizedModeCandidates = []) {
  const keySet = new Set(unique(modeKeys))
  let top = 0
  for (const item of normalizedModeCandidates) {
    if (keySet.has(item.modeKey) && item.confidence > top) {
      top = item.confidence
    }
  }
  return top
}

function classifyModeEvidence(modeKey = '', evidenceItems = []) {
  const rule = PEST_EVIDENCE_RULES[modeKey]
  if (!rule) {
    return {
      direct: [],
      indirect: []
    }
  }
  const classifyGroups = (groups, kind) =>
    groups.flatMap(group => {
      const matchedByGroup = new Map()
      for (const item of evidenceItems) {
        if (!group.includes(item.evidenceKey) && !group.includes(item.symptomKey)) {
          continue
        }
        const current = matchedByGroup.get(item.evidenceGroup)
        if (!current || rankBand(item.confidenceBand) > rankBand(current.confidenceBand)) {
          matchedByGroup.set(item.evidenceGroup, {
            ...item,
            evidenceKind: kind
          })
        }
      }
      return Array.from(matchedByGroup.values())
    })

  return {
    direct: classifyGroups(rule.directGroups, 'direct'),
    indirect: classifyGroups(rule.indirectGroups, 'indirect')
  }
}

function groupIncludesEvidence(group = [], item = {}) {
  return group.includes(item.evidenceKey) || group.includes(item.symptomKey)
}

function resolveIndirectDirectCombination(rule = {}, indirect = []) {
  if (!rule.allowIndirectDirect || !Array.isArray(rule.directCombinationGroups)) {
    return null
  }
  const eligible = indirect.filter(isAtLeastMediumEvidence)
  for (const combination of rule.directCombinationGroups) {
    if (!Array.isArray(combination) || !combination.length) {
      continue
    }
    const matchesByGroup = combination.map(group =>
      eligible.filter(item => Array.isArray(group) && groupIncludesEvidence(group, item))
    )
    if (matchesByGroup.some(matches => !matches.length)) {
      continue
    }
    const evidenceByPair = new Map()
    for (const matches of matchesByGroup) {
      for (const item of matches) {
        const imageId = normalizeText(item.imageId || '')
        const regionRef = normalizeKey(item.regionRef || '')
        if (!imageId || !regionRef || regionRef === 'unknown') {
          continue
        }
        const pairKey = `${imageId}::${regionRef}`
        const list = evidenceByPair.get(pairKey) || []
        list.push(item)
        evidenceByPair.set(pairKey, list)
      }
    }
    for (const pairEvidence of evidenceByPair.values()) {
      const coversAllGroups = matchesByGroup.every(matches =>
        matches.some(match =>
          pairEvidence.some(
            item =>
              item.evidenceKey === match.evidenceKey && item.evidenceGroup === match.evidenceGroup
          )
        )
      )
      if (coversAllGroups && pairEvidence.some(isStrongHighEvidence)) {
        return Array.from(
          new Map(
            pairEvidence.map(item => [`${item.evidenceKey}::${item.evidenceGroup}`, item])
          ).values()
        )
      }
    }
  }
  return null
}

function resolveDirectModeEvidence(modeKey = '', evidenceItems = []) {
  const rule = PEST_EVIDENCE_RULES[modeKey]
  const classified = classifyModeEvidence(modeKey, evidenceItems)
  const directMatch = classified.direct.find(isStrongHighEvidence)
  if (directMatch) {
    return {
      modeKey,
      matchType: 'direct',
      matchedEvidence: [directMatch]
    }
  }
  const combinationMatch = resolveIndirectDirectCombination(rule, classified.indirect)
  if (combinationMatch) {
    return {
      modeKey,
      matchType: 'indirect',
      matchedEvidence: combinationMatch
    }
  }
  return null
}

function buildRetakeAuthorization({
  authorizationId = '',
  now = Date.now(),
  durationMs = THREE_MINUTES_MS,
  originVisualCallBatchId = '',
  requestedCaptureRegion = ''
} = {}) {
  const serverNow = Number(now || Date.now())
  return {
    retakeAuthorizationId:
      authorizationId || `retake_${serverNow}_${Math.random().toString(36).slice(2, 10)}`,
    retakeStartedAt: serverNow,
    retakeExpiresAt: serverNow + Math.max(1, Number(durationMs || THREE_MINUTES_MS)),
    serverNow,
    originVisualCallBatchId: normalizeText(originVisualCallBatchId, ''),
    requestedCaptureRegion: normalizeCaptureRegion(requestedCaptureRegion),
    status: 'active'
  }
}

function assertRetakeAuthorizationActive(auth = {}, now = Date.now()) {
  const serverNow = Number(now || Date.now())
  const expiresAt = Number(auth?.retakeExpiresAt || auth?.expiresAt || auth?.expires_at || 0)
  const status = normalizeKey(auth?.status || 'active')
  if (!expiresAt || status !== 'active' || serverNow >= expiresAt) {
    const error = new Error('RETAKE_WINDOW_EXPIRED')
    error.code = 'RETAKE_WINDOW_EXPIRED'
    error.statusCode = 409
    error.terminalState = 'ended_retake_timeout'
    throw error
  }
  return {
    retakeAuthorizationId: normalizeText(
      auth?.retakeAuthorizationId || auth?.authorizationId || auth?.authorization_id || ''
    ),
    serverNow,
    retakeExpiresAt: expiresAt,
    originVisualCallBatchId: normalizeText(auth?.originVisualCallBatchId || '', ''),
    requestedCaptureRegion: normalizeCaptureRegion(auth?.requestedCaptureRegion || ''),
    status: 'active'
  }
}

function resolveDiagnosisModeRoute({
  diagnosisProfile = 'full',
  admittedVisualEvidence = [],
  admittedEvidence = [],
  retainedVisualEvidence = [],
  visualModeCandidates = [],
  modeCandidates = [],
  priorEvidenceLedger = [],
  imageContext = {},
  aggregateAnalyzability = ''
} = {}) {
  const normalizedProfile = normalizeKey(diagnosisProfile) === 'pest' ? 'pest' : 'full'
  const analyzability = normalizeKey(
    aggregateAnalyzability ||
      imageContext?.aggregateAnalyzability ||
      imageContext?.analyzability ||
      ''
  )
  if (analyzability === 'low') {
    const snapshotSeed = JSON.stringify({
      profile: normalizedProfile,
      action: 'request_followup_capture',
      reason: 'low_visual_quality',
      origin: imageContext?.originVisualCallBatchId || ''
    })
    return {
      diagnosisProfile: normalizedProfile,
      directMatches: [],
      confirmationCandidates: [],
      associatedModes: [],
      directionChoices: [],
      nextAction: 'request_followup_capture',
      followupCapturePlan: {
        reason: 'low_visual_quality',
        requestedCaptureRegion: normalizeText(
          normalizeCaptureRegion(imageContext?.requestedCaptureRegion, 'other_local')
        ),
        riskLevel: 'low',
        riskNotice: '这次只需要补一张更清楚的照片。',
        safetyInstructions: ['保持手机稳定，拍清楚可疑位置。'],
        requiresExplicitConsent: false,
        skipOptionEnabled: false,
        skipAnswerValue: 'unknown'
      },
      evidenceSnapshotId: `evidence_snapshot_${stableHash(snapshotSeed)}`,
      routePrimaryAction: 'request_followup_capture'
    }
  }

  const evidenceItems = normalizeVisualEvidence([
    ...admittedVisualEvidence,
    ...admittedEvidence,
    ...priorEvidenceLedger
  ])
  const retainedEvidenceItems = normalizeVisualEvidence(retainedVisualEvidence)
  const confirmationEvidenceItems = [...evidenceItems, ...retainedEvidenceItems]
  const directModeScope = Object.keys(PEST_EVIDENCE_RULES).filter(modeKey =>
    normalizedProfile === 'pest' ? PEST_MODE_KEYS.includes(modeKey) : true
  )
  const directMatches = directModeScope
    // Direct thresholds must be evaluated against both formally admitted and
    // retained visual evidence. A candidate marked cautious is not enough to
    // route by itself, but it must still be allowed to complete a hard,
    // same-image/same-region combination with another strong cue.
    .map(modeKey => resolveDirectModeEvidence(modeKey, confirmationEvidenceItems))
    .filter(Boolean)
  const directModeKeys = directMatches.map(item => item.modeKey)
  const evidenceDerivedModeKeys = directModeScope.filter(modeKey =>
    hasSupportingEvidenceForMode(modeKey, confirmationEvidenceItems)
  )
  const normalizedModeCandidates = normalizeModeCandidates([
    ...visualModeCandidates,
    ...modeCandidates
  ])
  const candidateOnlyModeKeys = unique(
    normalizedModeCandidates
      .filter(item => item.confidence >= CANDIDATE_ADMIT_CONFIDENCE)
      .map(item => item.modeKey)
  )
  const directConclusionPestModeKeys = unique(
    normalizedModeCandidates
      .filter(
        item =>
          PEST_MODE_KEYS.includes(item.modeKey) &&
          item.confidence >= DIRECT_CONCLUSION_CONFIDENCE
      )
      .map(item => item.modeKey)
  )
  const candidateAdmissionContext = {
    normalizedModeCandidates,
    candidateOnlyModeKeys,
    confirmationEvidenceItems
  }
  const candidateModeKeys = unique([
    ...candidateOnlyModeKeys,
    ...evidenceDerivedModeKeys
  ])
    .filter(modeKey => !directModeKeys.includes(modeKey))
    .filter(modeKey =>
      isCandidateAdmissible(modeKey, normalizedProfile, candidateAdmissionContext)
    )
  const associatedModes = unique([...directModeKeys, ...candidateModeKeys])
  const pestCandidateModeKeys = candidateModeKeys.filter(modeKey =>
    PEST_MODE_KEYS.includes(modeKey)
  )
  const hasExplicitPestCandidate = normalizedModeCandidates.some(item =>
    PEST_MODE_KEYS.includes(item.modeKey)
  )
  const confirmationCandidates = pestCandidateModeKeys.map(modeKey => ({
    modeKey,
    reason: 'visual_mode_candidate_needs_confirmation',
    matchedEvidence: supportingEvidenceForMode(modeKey, evidenceItems),
    candidateEvidence: supportingEvidenceForMode(modeKey, retainedEvidenceItems)
  }))
  const candidateOnlyNeedsQuestion =
    confirmationCandidates.length > 0 &&
    !confirmationCandidates.some(item =>
      directConclusionPestModeKeys.includes(item.modeKey)
    ) &&
    confirmationCandidates.every(
      item => !item.matchedEvidence.length && !item.candidateEvidence.length
    )
  const provisionalMatches = pestCandidateModeKeys.map(modeKey => ({
    modeKey,
    matchType: 'candidate',
    matchedEvidence: supportingEvidenceForMode(modeKey, confirmationEvidenceItems)
  }))
  // 置信度分档：取候选模式中的最高置信度决定 tier 与 questionBudget。
  // directModeKeys（直接证据匹配）视为 direct tier；否则按候选最高置信度分档。
  const topCandidateValue = topCandidateConfidence(candidateModeKeys, normalizedModeCandidates)
  const candidateTier = candidateConfidenceTier(topCandidateValue)
  const directTier = directModeKeys.length ? 'direct' : ''
  const activeTier = directTier || candidateTier || ''
  const questionBudget = maxQuestionsForTier(activeTier)
  const likelyResult = activeTier === 'very_likely'
  const directConclusion = activeTier === 'direct'
  // 0.90-<0.95 且候选模式均为 visual_direct_only（如白粉病）：直接出"很像"结论，无疑问。
  const veryLikelyVisualDirectOnly =
    likelyResult &&
    candidateModeKeys.length > 0 &&
    candidateModeKeys.every(modeKey => isVisualDirectOnlyMode(modeKey))
  const directionChoices = buildDirectionChoices({
    associatedModes,
    directMatches,
    confirmationCandidates
  })
  const crossFamilyConflict = hasCrossFamilyModes(associatedModes)
  const pestDirectMatches = directMatches.filter(item => PEST_MODE_KEYS.includes(item.modeKey))
  const singleFixedQuestionPackageMode =
    directModeKeys.length === 1 &&
    candidateModeKeys.length === 0 &&
    isFixedQuestionPackageMode(directModeKeys[0])
  const recommendedDirection = associatedModes.some(modeKey => PEST_MODE_KEYS.includes(modeKey))
    ? PEST_CATEGORY
    : directModeKeys[0] || candidateModeKeys[0] || ''
  const nextAction = crossFamilyConflict
    ? 'choose_direction'
    : singleFixedQuestionPackageMode
      ? 'question_package'
      : directModeKeys.length
        ? 'direct_result'
        : candidateModeKeys.length
          ? directConclusion ||
            likelyResult ||
            confirmationCandidates.some(item => item.matchedEvidence.length)
            ? 'direct_result'
            : 'question_package'
          : 'uncertain'
  const snapshotSeed = JSON.stringify({
    profile: normalizedProfile,
    directModeKeys,
    candidateModeKeys,
    evidenceDerivedModeKeys,
    evidence: evidenceItems.map(item => [
      item.evidenceKey,
      item.evidenceGroup,
      item.confidenceBand,
      item.strengthLevel,
      item.imageId,
      item.regionRef
    ]),
    retainedEvidence: retainedEvidenceItems.map(item => [
      item.evidenceKey,
      item.evidenceGroup,
      item.confidenceBand,
      item.strengthLevel
    ])
  })

  return {
    diagnosisProfile: normalizedProfile,
    directMatches,
    provisionalMatches,
    confirmationCandidates,
    associatedModes,
    directionChoices,
    recommendedDirection,
    recommendedMode: directModeKeys[0] || candidateModeKeys[0] || '',
    pendingDirectPestSnapshot:
      crossFamilyConflict && pestDirectMatches.length
        ? {
            directMatches: pestDirectMatches,
            evidenceSnapshotId: `evidence_snapshot_${stableHash(
              JSON.stringify({
                profile: normalizedProfile,
                directModeKeys: pestDirectMatches.map(item => item.modeKey),
                evidence: evidenceItems.map(item => [
                  item.evidenceKey,
                  item.evidenceGroup,
                  item.imageId,
                  item.regionRef
                ])
              })
            )}`
          }
        : null,
    nextAction,
    confidenceTier: activeTier,
    questionBudget,
    likelyResult,
    directConclusion,
    veryLikelyVisualDirectOnly,
    followupCapturePlan: confirmationCandidates.length
      ? {
          reason: 'specific_pest_confirmation_needed',
          requestedCaptureRegion: normalizeText(
            normalizeCaptureRegion(
              imageContext?.requestedCaptureRegion || imageContext?.captureRegion,
              'other_local'
            )
          ),
          riskLevel: 'medium',
          riskNotice: '需要靠近可疑位置补拍，可能要轻轻翻看叶背或茎节。',
          safetyInstructions: ['动作放轻，避免折断叶片。', '如果不方便靠近或翻看，可以选择跳过。'],
          requiresExplicitConsent: true,
          skipOptionEnabled: true,
          skipAnswerValue: 'unknown'
        }
      : null,
    evidenceSnapshotId: `evidence_snapshot_${stableHash(snapshotSeed)}`,
    routePrimaryAction: nextAction
  }
}

module.exports = {
  DIAGNOSIS_MODE_REGISTRY,
  LOCKED_SPECIFIC_PEST_MODES,
  PEST_MODE_KEYS,
  resolveDiagnosisModeRoute,
  buildRetakeAuthorization,
  evidenceGroupForKey,
  assertRetakeAuthorizationActive,
  candidateConfidenceTier,
  maxQuestionsForTier,
  _test: {
    normalizeVisualEvidence,
    evidenceGroupForKey,
    resolveIndirectDirectCombination,
    resolveDirectModeEvidence,
    isCandidateAdmissible,
    isVisualDirectOnlyMode,
    topCandidateConfidence
  }
}
