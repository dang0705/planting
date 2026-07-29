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
  resolveModelDirectModeKeys,
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
  // 模型直判模式优先（dispatch-20260726-model-mode-precedence-zcode）：
  // 模型以 >=0.95 返回的具体 mode key 是模型对具体问题的高置信判断，
  // 必须作为唯一主路由集合。禁止把任何未由模型以直判置信度返回的
  // evidence-derived mode（如 leaf_yellowing 证据派生的 yellow_leaf）加入集合。
  // 该规则对 aphid / yellow_leaf / wilting_droop / powdery_mildew 等所有已注册模式统一生效。
  const modelDirectModeKeys = resolveModelDirectModeKeys(normalizedModeCandidates)
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
  let candidateModeKeys = unique([
    ...(normalizedProfile === 'full' ? allCandidateModeKeys : candidateOnlyModeKeys),
    ...evidenceDerivedModeKeys
  ])
    .filter(modeKey => !directModeKeys.includes(modeKey))
    .filter(modeKey =>
      isCandidateAdmissible(modeKey, normalizedProfile, candidateAdmissionContext)
    )
  // 模型直判优先：当存在 >=0.95 模型模式时，这些 mode 成为唯一主路由集合。
  // 清空 evidence-derived directMatches（避免 leaf_yellowing 证据派生的 yellow_leaf
  // 污染 aphid 模型直判），candidateModeKeys 也仅保留模型直判模式。
  // 模型直判模式直接进入 candidateModeKeys，绕过 profile 严格 admission：
  // pest profile 多候选无证据时 isCandidateAdmissible 会拒绝，但模型 >=0.95
  // 高置信判断必须保留，不能被 profile 严格逻辑剔除。
  let effectiveDirectMatches = directMatches
  let effectiveDirectModeKeys = directModeKeys
  if (modelDirectModeKeys.length > 0) {
    const modelDirectSet = new Set(modelDirectModeKeys)
    effectiveDirectMatches = directMatches.filter(item => modelDirectSet.has(item.modeKey))
    effectiveDirectModeKeys = effectiveDirectMatches.map(item => item.modeKey)
    candidateModeKeys = modelDirectModeKeys.filter(
      modeKey => !effectiveDirectModeKeys.includes(modeKey)
    )
  }
  const associatedModes = unique([...effectiveDirectModeKeys, ...candidateModeKeys])
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
  const directTier = effectiveDirectModeKeys.length ? 'direct' : ''
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
    directMatches: effectiveDirectMatches,
    confirmationCandidates
  })
  const crossFamilyConflict = hasCrossFamilyModes(associatedModes)
  const pestDirectMatches = effectiveDirectMatches.filter(item =>
    PEST_MODE_KEYS.includes(item.modeKey)
  )
  const singleFixedQuestionPackageMode =
    effectiveDirectModeKeys.length === 1 &&
    candidateModeKeys.length === 0 &&
    isFixedQuestionPackageMode(effectiveDirectModeKeys[0])
  // directMatches 中含固定题包模式（黄叶/枯萎）时优先走问诊路径，
  // 即使同时有其他非虫害 visual_direct_only 模式（如白粉病）也不能走 direct_result，
  // 因为固定题包模式依赖结构化问诊确认。
  const directHasFixedPackageMode = effectiveDirectModeKeys.some(modeKey =>
    isFixedQuestionPackageMode(modeKey)
  )
  // directMatches 中同时含固定题包与视觉直达模式时（如 yellow_leaf + powdery_mildew），
  // 固定题包 outcome resolver 会过滤掉非题包模式，直接进题包会让视觉直达结果丢失。
  // 此时走 choose_direction，让用户在题包与直达结论之间显式选择。
  const directHasVisualDirectOnlyMode = effectiveDirectModeKeys.some(modeKey =>
    isVisualDirectOnlyMode(modeKey)
  )
  const directMixedFixedAndVisualDirectOnly =
    directHasFixedPackageMode && directHasVisualDirectOnlyMode
  // dispatch-20260726 consolidated rework: 多个固定题包模式（如 yellow_leaf + wilting_droop
  // 都由模型 >=0.95 返回）时，routeFixedQuestionPackageMode 只能选取一个进题包，
  // 另一个会被静默丢弃。此时走 choose_direction，让用户显式选择先走哪个题包，
  // 不静默丢弃任何固定题包模式。
  // 仅对模型直判场景生效：非模型直判的多固定题包模式（如 0.8/0.75 候选 + 证据）
  // 保留原有 question_package 行为（选取第一个进题包），不改变既有契约。
  const fixedPackageModesInAssociated = associatedModes.filter(modeKey =>
    isFixedQuestionPackageMode(modeKey)
  )
  const modelDirectFixedPackageModes = fixedPackageModesInAssociated.filter(modeKey =>
    modelDirectModeKeys.includes(modeKey)
  )
  const multipleModelDirectFixedPackageModes =
    modelDirectFixedPackageModes.length > 1
  // dispatch-20260726 consolidated rework: recommendedDirection 对单一虫害模式时
  // 指向具体 mode（如 spider_mite），而非通用 pest 大类；多虫害模式时仍用 pest 大类。
  const pestModesInAssociated = associatedModes.filter(modeKey =>
    PEST_MODE_KEYS.includes(modeKey)
  )
  const recommendedDirection =
    pestModesInAssociated.length === 1
      ? pestModesInAssociated[0]
      : pestModesInAssociated.length > 1
        ? PEST_CATEGORY
        : effectiveDirectModeKeys[0] || candidateModeKeys[0] || ''
  // directConclusion (>=0.95) 时，固定题包模式仍需走问诊路径，
  // 因为这些模式依赖结构化问诊确认。
  // visual_direct_only 模式（如 powdery_mildew）仅在 high+ 置信（very_likely/direct）时
  // 可直接结论；低置信 visual-direct 必须按 3/2/1 问题预算进入可解释路径，不能越过问诊。
  const nextAction = crossFamilyConflict
    ? 'choose_direction'
    : multipleModelDirectFixedPackageModes
      ? 'choose_direction'
      : singleFixedQuestionPackageMode
        ? 'question_package'
        : directMixedFixedAndVisualDirectOnly
        ? 'choose_direction'
        : directHasFixedPackageMode
          ? 'question_package'
          : effectiveDirectModeKeys.length
            ? 'direct_result'
            : candidateModeKeys.length
            ? (directConclusion && !candidateHasFixedPackageMode) ||
              (candidateAllVisualDirectOnly && (likelyResult || directConclusion)) ||
              (likelyResult && !candidateHasFixedPackageMode) ||
              (!candidateHasFixedPackageMode &&
                confirmationCandidates.some(
                  item => item.matchedEvidence.length || item.candidateEvidence.length
                ))
              ? 'direct_result'
              : 'question_package'
            : 'uncertain'
  const snapshotSeed = JSON.stringify({
    profile: normalizedProfile,
    directModeKeys: effectiveDirectModeKeys,
    candidateModeKeys,
    evidenceDerivedModeKeys,
    modelDirectModeKeys,
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
    directMatches: effectiveDirectMatches,
    provisionalMatches,
    confirmationCandidates,
    // 透传 normalizedModeCandidates（含每候选 confidence），供 directEvidenceLedgerForDirectResult
    // 与 resolveNonPestCandidateTier 按候选 confidence 过滤，避免回退到"全部提升"。
    normalizedModeCandidates,
    // 模型直判模式审计字段（dispatch-20260726-model-mode-precedence-zcode）：
    // 记录模型以 >=0.95 返回的具体 mode key，供下游显式判断"模型模式优先"。
    // 下游消费方（orchestrator / non-pest-direct-result）应优先消费此字段，
    // 不能把模型模式伪装成普通 symptom evidence。
    modelDirectModeKeys,
    associatedModes,
    directionChoices,
    recommendedDirection,
    recommendedMode: effectiveDirectModeKeys[0] || candidateModeKeys[0] || '',
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
  resolveModelDirectModeKeys,
  _test: {
    normalizeVisualEvidence,
    evidenceGroupForKey,
    resolveIndirectDirectCombination: require('./diagnosis-mode-helpers').resolveIndirectDirectCombination,
    resolveDirectModeEvidence,
    isCandidateAdmissible,
    isVisualDirectOnlyMode,
    topCandidateConfidence,
    resolveModelDirectModeKeys
  }
}
