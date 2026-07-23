'use strict'

const {
  DIAGNOSIS_MODE_REGISTRY,
  LOCKED_SPECIFIC_PEST_MODES,
  PEST_CATEGORY,
  PEST_EVIDENCE_RULES,
  PEST_MODE_KEYS
} = require('./diagnosis-mode-registry')
const { buildDirectionChoices, hasCrossFamilyModes } = require('./diagnosis-mode-direction-choice')
const { normalizeCaptureRegion } = require('../utils/capture-region-normalizer')
const {
  CANDIDATE_ADMIT_CONFIDENCE,
  candidateConfidenceTier,
  maxQuestionsForTier,
  normalizeText,
  normalizeKey,
  unique,
  normalizeVisualEvidence,
  normalizeModeCandidates,
  hasSupportingEvidenceForMode,
  supportingEvidenceForMode,
  resolveDirectModeEvidence,
  isFixedQuestionPackageMode,
  isVisualDirectOnlyMode,
  isCandidateAdmissible,
  topCandidateConfidence,
  evidenceGroupForKey,
  stableHash
} = require('./diagnosis-mode-helpers')

const THREE_MINUTES_MS = 3 * 60 * 1000

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
  // full profile 下所有合法候选 mode key（不限 confidence），用于构造 candidateModeKeys；
  // pest profile 仍使用 >=0.60 的 candidateOnlyModeKeys 保持严格边界。
  const allCandidateModeKeys = unique(normalizedModeCandidates.map(item => item.modeKey))
  const candidateAdmissionContext = {
    normalizedModeCandidates,
    candidateOnlyModeKeys,
    confirmationEvidenceItems
  }
  const candidateModeKeys = unique([
    ...(normalizedProfile === 'full' ? allCandidateModeKeys : candidateOnlyModeKeys),
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
  const confirmationCandidates = pestCandidateModeKeys.map(modeKey => ({
    modeKey,
    reason: 'visual_mode_candidate_needs_confirmation',
    matchedEvidence: supportingEvidenceForMode(modeKey, evidenceItems),
    candidateEvidence: supportingEvidenceForMode(modeKey, retainedEvidenceItems)
  }))
  const provisionalMatches = pestCandidateModeKeys.map(modeKey => ({
    modeKey,
    matchType: 'candidate',
    matchedEvidence: supportingEvidenceForMode(modeKey, confirmationEvidenceItems)
  }))
  const topCandidateValue = topCandidateConfidence(candidateModeKeys, normalizedModeCandidates)
  const candidateTier = candidateConfidenceTier(topCandidateValue)
  const directTier = directModeKeys.length ? 'direct' : ''
  const activeTier = directTier || candidateTier || ''
  const questionBudget = maxQuestionsForTier(activeTier)
  const likelyResult = activeTier === 'very_likely'
  const directConclusion = activeTier === 'direct'
  const veryLikelyVisualDirectOnly =
    likelyResult &&
    candidateModeKeys.length > 0 &&
    candidateModeKeys.every(modeKey => isVisualDirectOnlyMode(modeKey))
  // 候选中包含固定题包模式（黄叶/枯萎）：即使置信度高也走固定题包问诊，
  // 因为这些模式本身依赖结构化问诊确认，不适合直接出结论。
  const candidateHasFixedPackageMode = candidateModeKeys.some(modeKey =>
    isFixedQuestionPackageMode(modeKey)
  )
  const candidateAllVisualDirectOnly =
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
  // directConclusion (>=0.95) 时，固定题包模式仍需走问诊路径，
  // 因为这些模式依赖结构化问诊确认。
  // visual_direct_only 模式（如 powdery_mildew）仅在 high+ 置信（very_likely/direct）时
  // 可直接结论；低置信 visual-direct 必须按 3/2/1 问题预算进入可解释路径，不能越过问诊。
  const nextAction = crossFamilyConflict
    ? 'choose_direction'
    : singleFixedQuestionPackageMode
      ? 'question_package'
      : directModeKeys.length
        ? 'direct_result'
        : candidateModeKeys.length
          ? (directConclusion && !candidateHasFixedPackageMode) ||
            (candidateAllVisualDirectOnly && (likelyResult || directConclusion)) ||
            (likelyResult && !candidateHasFixedPackageMode) ||
            confirmationCandidates.some(
              item => item.matchedEvidence.length || item.candidateEvidence.length
            )
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
  // 从 helpers 重新导出，保持调用契约不变
  isCandidateAdmissible,
  isVisualDirectOnlyMode,
  isFixedQuestionPackageMode,
  topCandidateConfidence,
  _test: {
    normalizeVisualEvidence,
    evidenceGroupForKey,
    resolveIndirectDirectCombination: require('./diagnosis-mode-helpers').resolveIndirectDirectCombination,
    resolveDirectModeEvidence,
    isCandidateAdmissible,
    isVisualDirectOnlyMode,
    topCandidateConfidence
  }
}
