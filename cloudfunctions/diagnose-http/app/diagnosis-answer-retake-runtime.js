'use strict'

const {
  assertRetakeUploadAuthorized,
  consumeRetakeAuthorization
} = require('./retake-authorization')
const { buildPestRouteResponse } = require('./pest-visual-orchestrator')
const { resolveSpecificPestAnswerResult } = require('./specific-pest-answer-resolver')
const { normalizeRequestMode } = require('./request-normalizers')
const { extractVisualSymptomsSafely } = require('./visual-runtime')
const { DIAGNOSIS_MODE_REGISTRY } = require('../domain/diagnosis-mode-router')
const { normalizeCaptureRegion } = require('../utils/capture-region-normalizer')

const DIAGNOSIS_MODE_KEYS = new Set(Object.keys(DIAGNOSIS_MODE_REGISTRY || {}))

function isCompleteQuestionPackageSnapshotAnswerSubmit({
  requestMode = '',
  questionPackageSnapshot = null,
  answers = []
} = {}) {
  if (normalizeRequestMode(requestMode) !== 'answer_submit') {
    return false
  }
  const packageQuestionKeys = new Set(
    (Array.isArray(questionPackageSnapshot?.packageQuestions)
      ? questionPackageSnapshot.packageQuestions
      : []
    )
      .map(item => String(item?.questionKey || '').trim())
      .filter(Boolean)
  )
  if (!packageQuestionKeys.size) {
    return false
  }
  const answerQuestionKeys = new Set(
    (Array.isArray(answers) ? answers : [])
      .map(item => String(item?.questionKey || '').trim())
      .filter(Boolean)
  )
  return Array.from(packageQuestionKeys).every(questionKey => answerQuestionKeys.has(questionKey))
}

function buildPriorAdmittedEvidenceDigest(observedEvidenceSet = []) {
  return JSON.stringify(
    (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []).map(item => ({
      evidenceKey: item?.evidenceKey || item?.evidence_key || item?.symptomKey || '',
      diagnosisMode: item?.diagnosisMode || item?.diagnosis_mode || '',
      sourceType: item?.sourceType || item?.source_type || '',
      imageId: item?.imageId || item?.image_id || '',
      captureRegion: item?.regionRef || item?.region_ref || item?.captureRegion || ''
    }))
  ).slice(0, 1200)
}

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeKey(value = '', fallback = '') {
  return normalizeText(value, fallback).toLowerCase()
}

function readArray(source = {}, snakeKey = '', camelKey = '') {
  if (Array.isArray(source?.[snakeKey])) {
    return source[snakeKey]
  }
  if (Array.isArray(source?.[camelKey])) {
    return source[camelKey]
  }
  return []
}

function normalizePriorEvidenceItem(item = {}, defaults = {}) {
  const evidenceKey = normalizeKey(
    item?.evidenceKey || item?.evidence_key || item?.symptomKey || item?.symptom_key || ''
  )
  const sourceType = normalizeKey(item?.sourceType || item?.source_type || defaults.sourceType)
  const evidenceType = normalizeKey(item?.evidenceType || item?.evidence_type || '')
  if (
    !evidenceKey ||
    sourceType === 'diagnosis_mode' ||
    evidenceType === 'diagnosis_mode' ||
    DIAGNOSIS_MODE_KEYS.has(evidenceKey)
  ) {
    return null
  }
  return {
    evidenceKey,
    symptomKey: evidenceKey,
    evidenceGroup: normalizeKey(
      item?.evidenceGroup || item?.evidence_group || item?.symptomGroup || '',
      evidenceKey
    ),
    confidenceBand: normalizeKey(item?.confidenceBand || item?.confidence_band || '', 'medium'),
    strengthLevel: normalizeKey(item?.strengthLevel || item?.strength_level || '', 'medium'),
    imageId: normalizeText(item?.imageId || item?.image_id || defaults.imageId || ''),
    regionRef: normalizeCaptureRegion(
      item?.regionRef || item?.region_ref || item?.captureRegion || item?.capture_region || ''
    ),
    sourceRecordId: normalizeText(
      item?.sourceRecordId || item?.source_record_id || defaults.sourceRecordId || ''
    ),
    currentStatus: normalizeKey(item?.currentStatus || item?.current_status || '', 'active'),
    sourceType: sourceType || 'visual_admitted',
    diagnosisMode: normalizeKey(item?.diagnosisMode || item?.diagnosis_mode || '')
  }
}

function buildPriorEvidenceFromVisualAggregate(visualAggregateResult = null) {
  if (!visualAggregateResult || typeof visualAggregateResult !== 'object') {
    return []
  }
  const candidatesByKey = new Map(
    readArray(
      visualAggregateResult,
      'aggregated_symptom_candidates',
      'aggregatedSymptomCandidates'
    ).map(candidate => [
      normalizeKey(candidate?.symptom_key || candidate?.symptomKey || ''),
      candidate
    ])
  )
  return readArray(visualAggregateResult, 'admission_records', 'admissionRecords')
    .filter(
      record =>
        normalizeKey(record?.admission_result || record?.admissionResult || '') ===
        'formally_admitted'
    )
    .map(record => {
      const evidenceKey = normalizeKey(record?.object_key || record?.objectKey || '')
      const candidate = record?.candidate || candidatesByKey.get(evidenceKey) || {}
      return normalizePriorEvidenceItem(
        {
          evidenceKey,
          evidenceGroup: candidate?.evidence_group || candidate?.evidenceGroup || evidenceKey,
          confidenceBand: candidate?.confidence_band || candidate?.confidenceBand,
          strengthLevel: candidate?.strength_level || candidate?.strengthLevel,
          imageId: candidate?.primary_support_image_id || candidate?.primarySupportImageId,
          regionRef:
            candidate?.primary_capture_region ||
            candidate?.primaryCaptureRegion ||
            candidate?.region_ref ||
            candidate?.regionRef ||
            candidate?.capture_region ||
            candidate?.captureRegion,
          sourceRecordId:
            record?.visual_admission_record_id ||
            record?.visualAdmissionRecordId ||
            record?.visual_normalized_image_result_id ||
            record?.visualNormalizedImageResultId,
          sourceType: 'visual_admitted'
        },
        { sourceType: 'visual_admitted' }
      )
    })
    .filter(Boolean)
}

function collectRetakePriorEvidenceSources(state = {}) {
  const snapshot = state?.runtimeSnapshot || {}
  return [
    ...buildPriorEvidenceFromVisualAggregate(
      state?.visualAggregateResult ||
        state?.visualAggregateSummary ||
        snapshot.visualAggregateSummary
    ),
    ...(Array.isArray(snapshot?.questionPackageSnapshot?.hiddenPrefilledEvidence)
      ? snapshot.questionPackageSnapshot.hiddenPrefilledEvidence
      : []),
    ...(Array.isArray(state?.questionPackage?.hiddenPrefilledEvidence)
      ? state.questionPackage.hiddenPrefilledEvidence
      : []),
    ...(Array.isArray(snapshot?.evidenceLedger) ? snapshot.evidenceLedger : []),
    ...(Array.isArray(state?.evidenceLedger) ? state.evidenceLedger : []),
    ...(Array.isArray(state?.observedEvidenceSet) ? state.observedEvidenceSet : [])
  ]
}

function buildRetakePriorEvidenceLedger({ refreshedSessionState = {}, sessionState = {} } = {}) {
  const seen = new Set()
  return [refreshedSessionState, sessionState]
    .flatMap(collectRetakePriorEvidenceSources)
    .map(item => normalizePriorEvidenceItem(item))
    .filter(item => {
      if (!item) {
        return false
      }
      const key = `${item.evidenceKey}::${item.imageId}::${item.regionRef}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

function normalizeAnswerQuestionKey(answer = {}) {
  return String(answer?.questionKey || answer?.question_key || '').trim()
}

function normalizeQuestionKey(question = {}) {
  return String(question?.questionKey || question?.question_key || '').trim()
}

function buildSpecificPestContinuationRoundResult({
  sessionId = '',
  answerRound = 1,
  questionPackage = null,
  routeRuntimeAnswers = [],
  plantContext = {},
  visualAggregateResult = null
} = {}) {
  const packageQuestions = Array.isArray(questionPackage?.packageQuestions)
    ? questionPackage.packageQuestions
    : []
  if (!packageQuestions.length) {
    return null
  }

  const answeredQuestionKeys = new Set(
    (Array.isArray(routeRuntimeAnswers) ? routeRuntimeAnswers : [])
      .map(normalizeAnswerQuestionKey)
      .filter(Boolean)
  )
  const remainingQuestions = packageQuestions.filter(question => {
    const questionKey = normalizeQuestionKey(question)
    return questionKey && !answeredQuestionKeys.has(questionKey)
  })

  if (!remainingQuestions.length) {
    return null
  }

  const fullQuestionPackage = {
    ...questionPackage,
    questionCount: packageQuestions.length,
    packageQuestions
  }
  const activeQuestionPackage = {
    ...questionPackage,
    questionCount: remainingQuestions.length,
    packageTopics: remainingQuestions.map(question => question.packageTopic).filter(Boolean),
    packageQuestions: remainingQuestions
  }

  return {
    diagnosisSessionId: sessionId,
    roundId: `round_${answerRound}`,
    plantContext,
    selectedModeKey: 'pest',
    routePrimaryAction: 'question_package',
    sessionStatus: 'awaiting_follow_up',
    status: 'active',
    questionRequired: true,
    questions: remainingQuestions,
    questionPackage: activeQuestionPackage,
    questionPackageSnapshot: fullQuestionPackage,
    visualAggregateResult,
    uiHints: {
      canUploadMoreImages: false,
      maxQuestionsThisRound: remainingQuestions.length,
      questionDisplayMode: 'package',
      answerSubmitMode: 'package',
      optionLayout: 'vertical',
      transition: 'swiper'
    },
    __skipQuestionRowWrite: true,
    reuseAnswerRoundForQuestionPackage: true
  }
}

async function runRetakeImageFollowup({
  payload = {},
  sessionId = '',
  openid = '',
  answerRound = 1,
  sessionQuestionProgress = null,
  refreshedSessionState = {},
  sessionState = {},
  imageInputs = [],
  clientContext = {}
} = {}) {
  const retakeAuthorizationId = String(
    payload.retakeAuthorizationId ||
      payload.retake_authorization_id ||
      payload.retakeAuthorization?.retakeAuthorizationId ||
      ''
  ).trim()
  const retakeAuthorizationRuntime = await assertRetakeUploadAuthorized({
    diagnosisSessionId: sessionId,
    openid,
    authorizationId: retakeAuthorizationId,
    requestedCaptureRegion:
      payload.requestedCaptureRegion ||
      payload.requested_capture_region ||
      refreshedSessionState.runtimeSnapshot?.retakeAuthorizationState?.requestedCaptureRegion ||
      '',
    originVisualCallBatchId: '',
    now: Date.now()
  })
  await require('./session-image-input-runtime').prepareSessionImageInputRuntime({
    sessionId,
    openid,
    answerRound,
    sessionQuestionProgress,
    visualBatchTrace: refreshedSessionState.visualBatchTrace || null
  })
  const priorEvidenceLedger = buildRetakePriorEvidenceLedger({
    refreshedSessionState,
    sessionState
  })
  const visualExtraction = await extractVisualSymptomsSafely({
    sessionId,
    openid,
    imageInputs,
    originVisualCallBatchId:
      retakeAuthorizationRuntime.retakeAuthorizationState?.originVisualCallBatchId || '',
    supersedeSource: 'diagnosis_package_image',
    llmOptions: {
      diagnosisProfile: clientContext?.diagnosisProfile || 'full',
      entrySource: clientContext?.entrySource || '',
      analysisRound: 'followup',
      plantContext: refreshedSessionState.plantContext || sessionState.plantContext || {},
      priorEvidenceLedger,
      priorAdmittedEvidenceDigest: buildPriorAdmittedEvidenceDigest(priorEvidenceLedger),
      requestedCaptureRegion:
        retakeAuthorizationRuntime.retakeAuthorizationState?.requestedCaptureRegion || '',
      originVisualCallBatchId:
        retakeAuthorizationRuntime.retakeAuthorizationState?.originVisualCallBatchId || ''
    }
  })
  return { retakeAuthorizationRuntime, visualExtraction }
}

function resolveSpecificPestRoundResult({
  isTerminalQuestionPackageSubmit = false,
  wiltingDroopRoundResult = null,
  yellowLeafRoundResult = null,
  questionPackageSnapshot = null,
  questionPackage = null,
  routeRuntimeAnswers = [],
  sessionId = '',
  answerRound = 1,
  round = 2,
  refreshedSessionState = {},
  sessionState = {}
} = {}) {
  const effectiveQuestionPackage =
    questionPackageSnapshot?.mode === 'specific_pest_visual'
      ? questionPackageSnapshot
      : questionPackage?.mode === 'specific_pest_visual'
        ? questionPackage
        : null
  const hasSpecificPestAnswers =
    Array.isArray(routeRuntimeAnswers) && routeRuntimeAnswers.length > 0
  const visualAggregateResult =
    refreshedSessionState.visualAggregateResult ||
    refreshedSessionState.visualAggregateSummary ||
    refreshedSessionState.runtimeSnapshot?.visualAggregateSummary ||
    sessionState.visualAggregateResult ||
    sessionState.visualAggregateSummary ||
    sessionState.runtimeSnapshot?.visualAggregateSummary ||
    null
  if (
    (!isTerminalQuestionPackageSubmit && !hasSpecificPestAnswers) ||
    wiltingDroopRoundResult ||
    yellowLeafRoundResult ||
    !effectiveQuestionPackage
  ) {
    return null
  }
  if (!isTerminalQuestionPackageSubmit && hasSpecificPestAnswers) {
    const continuationRoundResult = buildSpecificPestContinuationRoundResult({
      sessionId,
      answerRound,
      questionPackage: effectiveQuestionPackage,
      routeRuntimeAnswers,
      plantContext: refreshedSessionState.plantContext || sessionState.plantContext || {},
      visualAggregateResult
    })
    if (continuationRoundResult) {
      return continuationRoundResult
    }
  }
  return resolveSpecificPestAnswerResult({
    sessionId,
    round,
    answers: routeRuntimeAnswers,
    questionPackage: effectiveQuestionPackage,
    plantContext: refreshedSessionState.plantContext || sessionState.plantContext || {},
    visualAggregateResult
  })
}

async function resolvePestVisualRouteRoundResult({
  visualExtraction = null,
  sessionId = '',
  round = 2,
  refreshedSessionState = {},
  sessionState = {},
  clientContext = {}
} = {}) {
  return visualExtraction?.aggregateResult
    ? await buildPestRouteResponse({
        sessionId,
        round,
        plantContext: refreshedSessionState.plantContext || sessionState.plantContext || {},
        aggregateResult: visualExtraction.aggregateResult,
        diagnosisProfile: clientContext?.diagnosisProfile || 'full'
      })
    : null
}

function applyConsumedRetakeState(roundResult = {}, retakeAuthorizationRuntime = null) {
  if (!retakeAuthorizationRuntime?.retakeAuthorizationState) {
    return
  }
  roundResult.retakeAuthorizationState = consumeRetakeAuthorization(
    retakeAuthorizationRuntime.retakeAuthorizationState,
    Date.now()
  )
}

module.exports = {
  applyConsumedRetakeState,
  isCompleteQuestionPackageSnapshotAnswerSubmit,
  resolvePestVisualRouteRoundResult,
  resolveSpecificPestRoundResult,
  runRetakeImageFollowup,
  _test: {
    buildPriorAdmittedEvidenceDigest,
    buildPriorEvidenceFromVisualAggregate,
    buildRetakePriorEvidenceLedger,
    buildSpecificPestContinuationRoundResult
  }
}
