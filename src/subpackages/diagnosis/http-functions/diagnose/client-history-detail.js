import {
  normalizeHistoryList,
  normalizeStringList,
  normalizeObservedEvidenceSet,
  normalizeVisualBatchTrace,
  normalizeShadowCompareSummary,
  normalizeVisualAggregateSummary,
  normalizeDerivedEvidenceSet,
  normalizeDiagnosisDirections,
  normalizeQuestionPackageSnapshot,
  normalizeStopState,
  normalizeOutputEligibility,
  normalizeDiagnosticTrace,
  normalizeCoreProcess
} from './client-normalizers'

function normalizeHistoryAdviceSteps(detail = {}, explanation = {}) {
  const directSteps = Array.isArray(detail.nextSteps) ? detail.nextSteps : []
  const texts = normalizeStringList([
    ...directSteps.map(item =>
      typeof item === 'string' ? item : item?.text || item?.title || item?.label || ''
    ),
    detail.treatmentText,
    detail.treatment,
    explanation?.firstAid
  ])

  return texts.map((text, index) => ({
    stepId: directSteps[index]?.stepId || `advice_${index + 1}`,
    text,
    type: directSteps[index]?.type || ''
  }))
}

function normalizeHistoryAvoidAdvice(detail = {}, explanation = {}) {
  return normalizeStringList([
    ...(Array.isArray(detail.whatToAvoid)
      ? detail.whatToAvoid.map(item =>
          typeof item === 'string' ? item : item?.text || item?.title || item?.label || ''
        )
      : []),
    detail.preventionText,
    detail.prevention,
    explanation?.avoid
  ])
}

function normalizeHistoryDetail(detail) {
  if (!detail || typeof detail !== 'object') {
    return null
  }

  const hasActiveIntermediate =
    ['intermediate', 'question', 'question_package'].includes(
      String(detail.stage || '').toLowerCase()
    ) ||
    ['active', 'awaiting_retake', 'awaiting_follow_up'].includes(
      String(detail.status || '').toLowerCase()
    ) ||
    Boolean(detail.retakeRequest) ||
    Boolean(detail.retakeAuthorizationState) ||
    Boolean(detail.questionPackage) ||
    (Array.isArray(detail.directionChoices) && detail.directionChoices.length > 0)

  if (detail?.diagnosisSessionId && (detail?.finalResult || hasActiveIntermediate)) {
    const questions = Array.isArray(detail.questions) ? detail.questions : []
    const hasActiveQuestions =
      String(detail.stage || '').toLowerCase() === 'question_package' ||
      questions.some(item => String(item?.status || '').toLowerCase() === 'pending')
    const observedEvidenceSet = normalizeObservedEvidenceSet(detail.observedEvidenceSet)
    const derivedEvidenceSet = normalizeDerivedEvidenceSet(detail.derivedEvidenceSet)
    const diagnosisDirections = normalizeDiagnosisDirections(detail.diagnosisDirections)
    const questionPackageSnapshot = normalizeQuestionPackageSnapshot(detail.questionPackageSnapshot)
    const stopState = normalizeStopState(detail.stopState)
    const outputEligibility = normalizeOutputEligibility(detail.outputEligibility)
    const diagnosticTrace = normalizeDiagnosticTrace(detail.diagnosticTrace)
    const visualBatchTrace = normalizeVisualBatchTrace(detail.visualBatchTrace)
    const visualAggregateSummary = normalizeVisualAggregateSummary(detail.visualAggregateSummary)
    const explanation = detail.explanation || detail.resultExplanation || {}
    const nextSteps = normalizeHistoryAdviceSteps(detail, explanation)
    const whatToAvoid = normalizeHistoryAvoidAdvice(detail, explanation)
    const shadowCompareSummary =
      normalizeShadowCompareSummary(detail.shadowCompareSummary) ||
      normalizeVisualAggregateSummary(detail.visualAggregateSummary)?.shadowCompareSummary ||
      null
    const coreProcess = normalizeCoreProcess(detail.coreProcess, {
      latestVisualCallBatchId: detail.latestVisualCallBatchId || null,
      observedSymptoms: Array.isArray(detail.observedSymptoms) ? detail.observedSymptoms : [],
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections,
      careBaselineSummary: detail.careBaselineSummary || null,
      environmentDeviationHints: Array.isArray(detail.environmentDeviationHints)
        ? detail.environmentDeviationHints
        : [],
      routePrimaryAction: detail.routePrimaryAction || '',
      questionPackageSnapshot,
      stopReason: detail.stopReason || '',
      stopState,
      outputEligibility,
      diagnosticTrace,
      visualBatchTrace,
      visualAggregateSummary,
      shadowCompareSummary
    })

    return {
      ...detail,
      resultId: detail.resultId || detail.diagnosisSessionId || '',
      diagnosisSessionId: detail.diagnosisSessionId || '',
      plantId: detail.plantId || detail.userPlantId || detail.plantCatalogId || '',
      userPlantId: detail.userPlantId || null,
      plantCatalogId: detail.plantCatalogId || null,
      plantIdentityId: detail.plantIdentityId || '',
      latestVisualCallBatchId: detail.latestVisualCallBatchId || null,
      stage: detail.stage || (hasActiveQuestions ? 'question_package' : 'final'),
      status: detail.status || (hasActiveQuestions ? 'active' : 'closed'),
      outcomeType: detail.outcomeType || '',
      nonProblematicType: detail.nonProblematicType || '',
      nonProblematicLabel: detail.nonProblematicLabel || '',
      routePrimaryAction: detail.routePrimaryAction || '',
      identityResolutionStatus: detail.identityResolutionStatus || '',
      explanation,
      observedSymptoms: Array.isArray(detail.observedSymptoms) ? detail.observedSymptoms : [],
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections,
      careBaselineSummary: detail.careBaselineSummary || null,
      environmentDeviationHints: Array.isArray(detail.environmentDeviationHints)
        ? detail.environmentDeviationHints
        : [],
      questions,
      hasActiveQuestions: hasActiveQuestions || Boolean(detail.questionPackage && questions.length),
      retakeRequest:
        detail.retakeRequest && typeof detail.retakeRequest === 'object'
          ? detail.retakeRequest
          : null,
      retakeAuthorizationState:
        detail.retakeAuthorizationState && typeof detail.retakeAuthorizationState === 'object'
          ? detail.retakeAuthorizationState
          : null,
      directionChoices: Array.isArray(detail.directionChoices) ? detail.directionChoices : [],
      recommendedDirection: detail.recommendedDirection || '',
      recommendedMode: detail.recommendedMode || '',
      directMatches: Array.isArray(detail.directMatches) ? detail.directMatches : [],
      contributingFactors: Array.isArray(detail.contributingFactors)
        ? detail.contributingFactors
        : [],
      intermediateStates: Array.isArray(detail.intermediateStates) ? detail.intermediateStates : [],
      nextSteps,
      whatToAvoid,
      treatmentText:
        detail.treatmentText ||
        detail.treatment ||
        explanation?.firstAid ||
        nextSteps
          .map(item => item?.text)
          .filter(Boolean)
          .join('\n'),
      preventionText:
        detail.preventionText || detail.prevention || explanation?.avoid || whatToAvoid.join('\n'),
      questionPackageSnapshot,
      stopState,
      outputEligibility,
      diagnosticTrace,
      coreProcess,
      visualBatchTrace,
      visualAggregateSummary,
      shadowCompareSummary,
      confidenceLevel: detail.confidenceLevel || 'normal',
      needHumanReview: Boolean(detail.needHumanReview),
      timeline: detail.timeline || { createdAt: '' },
      versionMetadata: detail.versionMetadata || {}
    }
  }

  const diagnosisSessionId = detail._id || detail.diagnosisSessionId || ''
  const summary = String(detail.summary || '').trim()

  return {
    resultId: diagnosisSessionId,
    diagnosisSessionId,
    plantId: detail.plantId || detail.userPlantId || detail.plantCatalogId || '',
    userPlantId: detail.userPlantId || null,
    plantCatalogId: detail.plantCatalogId || null,
    plantIdentityId: detail.plantIdentityId || '',
    latestVisualCallBatchId: detail.latestVisualCallBatchId || null,
    stage: 'final',
    status: 'closed',
    finalResult: {
      problemId: detail.topProblemKey || '',
      displayName: detail.finalProblemCn || detail.topProblemKey || '待进一步确认',
      summary,
      severity: detail.healthStatus === 'danger' ? 'high' : 'medium',
      urgency: 'medium'
    },
    explanation: {
      whyItHappens: summary,
      whatToCheckNext: '',
      firstAid: detail.treatment || '',
      avoid: detail.prevention || ''
    },
    observedSymptoms: Array.isArray(detail.symptoms)
      ? detail.symptoms.map(item => ({
          symptomKey: item?.symptomKey || '',
          symptomCn: item?.symptomCn || item?.symptomKey || '',
          confidence: Number(item?.confidence || 0),
          source: item?.evidenceSource || 'history'
        }))
      : [],
    observedEvidenceSet: [],
    derivedEvidenceSet: [],
    diagnosisDirections: [],
    careBaselineSummary: null,
    environmentDeviationHints: [],
    questions: [],
    hasActiveQuestions: false,
    contributingFactors: [],
    intermediateStates: [],
    nextSteps: detail.treatment ? [{ stepId: 'step_1', text: detail.treatment }] : [],
    whatToAvoid: detail.prevention ? [detail.prevention] : [],
    treatmentText: detail.treatment || '',
    preventionText: detail.prevention || '',
    questionPackageSnapshot: null,
    stopState: null,
    outputEligibility: null,
    diagnosticTrace: [],
    coreProcess: normalizeCoreProcess(null, {
      latestVisualCallBatchId: detail.latestVisualCallBatchId || null,
      observedSymptoms: Array.isArray(detail.symptoms)
        ? detail.symptoms.map(item => ({
            symptomKey: item?.symptomKey || '',
            symptomCn: item?.symptomCn || item?.symptomKey || '',
            confidence: Number(item?.confidence || 0),
            source: item?.evidenceSource || 'history'
          }))
        : [],
      observedEvidenceSet: [],
      derivedEvidenceSet: [],
      diagnosisDirections: [],
      careBaselineSummary: null,
      environmentDeviationHints: [],
      routePrimaryAction: '',
      questionPackageSnapshot: null,
      stopReason: '',
      stopState: null,
      outputEligibility: null,
      diagnosticTrace: [],
      visualBatchTrace: null,
      visualAggregateSummary: null,
      shadowCompareSummary: null
    }),
    visualBatchTrace: null,
    visualAggregateSummary: null,
    shadowCompareSummary: null,
    timeline: {
      createdAt: detail.createdAt || ''
    }
  }
}

export { normalizeHistoryList, normalizeHistoryDetail }
