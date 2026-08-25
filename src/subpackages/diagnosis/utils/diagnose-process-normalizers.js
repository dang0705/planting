import { normalizeStringList } from './diagnose-flow-shared.js'
import {
  normalizeDerivedEvidenceSet,
  normalizeDiagnosisDirections,
  normalizeObservedEvidenceSet,
  normalizeShadowCompareSummary,
  normalizeVisualAggregateSummary,
  normalizeVisualBatchTrace
} from './diagnose-evidence-normalizers.js'

export function normalizeQuestionPackageSnapshot(questionPackageSnapshot = null) {
  if (!questionPackageSnapshot || typeof questionPackageSnapshot !== 'object') {
    return null
  }

  return {
    questionPackageSnapshotId: String(questionPackageSnapshot?.questionPackageSnapshotId || '').trim(),
    sessionId: String(questionPackageSnapshot?.sessionId || '').trim(),
    roundId: String(questionPackageSnapshot?.roundId || '').trim(),
    roundIndex: Number(questionPackageSnapshot?.roundIndex || 1),
    routePrimaryAction: String(questionPackageSnapshot?.routePrimaryAction || '').trim(),
    questionItems: (Array.isArray(questionPackageSnapshot?.questionItems) ? questionPackageSnapshot.questionItems : []).map(item => ({
      questionKey: String(item?.questionKey || '').trim(),
      questionId: String(item?.questionId || '').trim(),
      routeKey: String(item?.routeKey || '').trim(),
      conditionKey: String(item?.conditionKey || '').trim(),
      outcomeKey: String(item?.outcomeKey || '').trim(),
      targetSymptomKey: String(item?.targetSymptomKey || '').trim(),
      questionGroupKey: String(item?.questionGroupKey || '').trim(),
      packageTopic: String(item?.packageTopic || '').trim(),
      packageSection: String(item?.packageSection || '').trim(),
      questionText: String(item?.questionText || item?.text || '').trim(),
      helpText: String(item?.helpText || '').trim(),
      currentPriority: Number(item?.currentPriority || 0),
      estimatedInformationGain: Number(item?.estimatedInformationGain || 0),
      serviceTarget: String(item?.serviceTarget || '').trim(),
      appliesWhen: item?.appliesWhen && typeof item.appliesWhen === 'object' ? item.appliesWhen : null,
      asked: Number(item?.asked || 0) ? 1 : 0,
      answered: Number(item?.answered || 0) ? 1 : 0,
      invalidated: Number(item?.invalidated || 0) ? 1 : 0,
      invalidReason: String(item?.invalidReason || '').trim(),
      status: String(item?.status || '').trim() || 'pending'
    })),
    activeItemCount: Number(questionPackageSnapshot?.activeItemCount || 0),
    askedItemCount: Number(questionPackageSnapshot?.askedItemCount || 0),
    answeredItemCount: Number(questionPackageSnapshot?.answeredItemCount || 0),
    invalidatedItemCount: Number(questionPackageSnapshot?.invalidatedItemCount || 0)
  }
}

export function normalizeStopState(stopState = null) {
  if (!stopState || typeof stopState !== 'object') {
    return null
  }

  return {
    stopStateId: String(stopState?.stopStateId || '').trim(),
    sessionId: String(stopState?.sessionId || '').trim(),
    roundId: String(stopState?.roundId || '').trim(),
    roundIndex: Number(stopState?.roundIndex || 1),
    isStopped: Number(stopState?.isStopped || 0) ? 1 : 0,
    stopReasonType: String(stopState?.stopReasonType || '').trim(),
    stopReason: String(stopState?.stopReason || '').trim(),
    stopReasonText: String(stopState?.stopReasonText || '').trim(),
    finalOutputRef: stopState?.finalOutputRef || null,
    allowMoreQuestions: Number(stopState?.allowMoreQuestions || 0) ? 1 : 0
  }
}

export function normalizeOutputEligibility(outputEligibility = null) {
  if (!outputEligibility || typeof outputEligibility !== 'object') {
    return null
  }

  return {
    eligible: Number(outputEligibility?.eligible || 0) ? 1 : 0,
    judgment: String(outputEligibility?.judgment || '').trim(),
    conclusionType: String(outputEligibility?.conclusionType || '').trim(),
    conclusionStatus: String(outputEligibility?.conclusionStatus || '').trim(),
    outputConservatism: String(outputEligibility?.outputConservatism || '').trim(),
    keyEvidenceSummary: String(outputEligibility?.keyEvidenceSummary || '').trim(),
    unresolvedRisks: normalizeStringList(outputEligibility?.unresolvedRisks),
    nextStepHints: normalizeStringList(outputEligibility?.nextStepHints)
  }
}

export function normalizeDiagnosticTrace(trace = []) {
  return (Array.isArray(trace) ? trace : [])
    .map(item => ({
      eventType: String(item?.eventType || item?.event_type || '').trim(),
      roundId: String(item?.roundId || item?.round_id || '').trim(),
      payload: item?.payload && typeof item.payload === 'object' ? item.payload : null
    }))
    .filter(item => item.eventType)
}

export function normalizeCoreProcess(coreProcess = null, fallback = {}) {
  const normalizedObservedSymptoms = Array.isArray(fallback?.observedSymptoms)
    ? fallback.observedSymptoms
    : []
  const normalizedObservedEvidenceSet = Array.isArray(fallback?.observedEvidenceSet)
    ? fallback.observedEvidenceSet
    : []
  const normalizedDerivedEvidenceSet = Array.isArray(fallback?.derivedEvidenceSet)
    ? fallback.derivedEvidenceSet
    : []
  const normalizedDiagnosisDirections = Array.isArray(fallback?.diagnosisDirections)
    ? fallback.diagnosisDirections
    : []
  const normalizedQuestionPackageSnapshot = fallback?.questionPackageSnapshot || null
  const normalizedStopState = fallback?.stopState || null
  const normalizedOutputEligibility = fallback?.outputEligibility || null
  const normalizedDiagnosticTrace = Array.isArray(fallback?.diagnosticTrace)
    ? fallback.diagnosticTrace
    : []
  const normalizedVisualBatchTrace = fallback?.visualBatchTrace || null
  const normalizedVisualAggregateSummary = fallback?.visualAggregateSummary || null
  const normalizedShadowCompareSummary = fallback?.shadowCompareSummary || null
  const normalizedCareBaselineSummary = fallback?.careBaselineSummary || null
  const normalizedEnvironmentDeviationHints = Array.isArray(fallback?.environmentDeviationHints)
    ? fallback.environmentDeviationHints
    : []
  const questionCore = coreProcess?.questions || coreProcess?.questionPackage || {}
  const questionPackageSnapshotForSummary =
    questionCore?.questionPackageSnapshot && typeof questionCore.questionPackageSnapshot === 'object'
      ? normalizeQuestionPackageSnapshot(questionCore.questionPackageSnapshot)
      : normalizedQuestionPackageSnapshot
  const questionCountSummary =
    questionCore?.questionCountSummary && typeof questionCore.questionCountSummary === 'object'
      ? {
          totalItems: Number(questionCore.questionCountSummary?.totalItems || 0),
          activeItems: Number(questionCore.questionCountSummary?.activeItems || 0),
          askedItems: Number(questionCore.questionCountSummary?.askedItems || 0),
          answeredItems: Number(questionCore.questionCountSummary?.answeredItems || 0),
          invalidatedItems: Number(questionCore.questionCountSummary?.invalidatedItems || 0)
        }
      : {
          totalItems: Array.isArray(questionPackageSnapshotForSummary?.questionItems)
            ? questionPackageSnapshotForSummary.questionItems.length
            : 0,
          activeItems: Number(questionPackageSnapshotForSummary?.activeItemCount || 0),
          askedItems: Number(questionPackageSnapshotForSummary?.askedItemCount || 0),
          answeredItems: Number(questionPackageSnapshotForSummary?.answeredItemCount || 0),
          invalidatedItems: Number(questionPackageSnapshotForSummary?.invalidatedItemCount || 0)
        }

  return {
    visual: {
      latestVisualCallBatchId:
        coreProcess?.visual?.latestVisualCallBatchId ||
        fallback?.latestVisualCallBatchId ||
        null,
      visualBatchTrace:
        normalizeVisualBatchTrace(coreProcess?.visual?.visualBatchTrace) ||
        normalizedVisualBatchTrace,
      visualAggregateSummary:
        normalizeVisualAggregateSummary(coreProcess?.visual?.visualAggregateSummary) ||
        normalizedVisualAggregateSummary,
      shadowCompareSummary:
        normalizeShadowCompareSummary(coreProcess?.visual?.shadowCompareSummary) ||
        normalizedShadowCompareSummary
    },
    evidence: {
      observedSymptomCount: Number(
        coreProcess?.evidence?.observedSymptomCount ?? normalizedObservedSymptoms.length
      ),
      observedSymptoms: Array.isArray(coreProcess?.evidence?.observedSymptoms)
        ? coreProcess.evidence.observedSymptoms
        : normalizedObservedSymptoms,
      observedEvidenceCount: Number(
        coreProcess?.evidence?.observedEvidenceCount ?? normalizedObservedEvidenceSet.length
      ),
      observedEvidenceSet: Array.isArray(coreProcess?.evidence?.observedEvidenceSet)
        ? normalizeObservedEvidenceSet(coreProcess.evidence.observedEvidenceSet)
        : normalizedObservedEvidenceSet,
      derivedEvidenceCount: Number(
        coreProcess?.evidence?.derivedEvidenceCount ?? normalizedDerivedEvidenceSet.length
      ),
      derivedEvidenceSet: Array.isArray(coreProcess?.evidence?.derivedEvidenceSet)
        ? normalizeDerivedEvidenceSet(coreProcess.evidence.derivedEvidenceSet)
        : normalizedDerivedEvidenceSet,
      diagnosisDirectionCount: Number(
        coreProcess?.evidence?.diagnosisDirectionCount ?? normalizedDiagnosisDirections.length
      ),
      diagnosisDirections: Array.isArray(coreProcess?.evidence?.diagnosisDirections)
        ? normalizeDiagnosisDirections(coreProcess.evidence.diagnosisDirections)
        : normalizedDiagnosisDirections,
      careBaselineSummary:
        coreProcess?.evidence?.careBaselineSummary || normalizedCareBaselineSummary,
      environmentDeviationHints: Array.isArray(coreProcess?.evidence?.environmentDeviationHints)
        ? coreProcess.evidence.environmentDeviationHints
        : normalizedEnvironmentDeviationHints
    },
    questions: {
      routePrimaryAction:
        String(questionCore?.routePrimaryAction || fallback?.routePrimaryAction || '').trim(),
      questionPackageSnapshot: questionPackageSnapshotForSummary,
      questionCountSummary
    },
    decision: {
      stopReason:
        String(coreProcess?.decision?.stopReason || fallback?.stopReason || '').trim(),
      stopState:
        normalizeStopState(coreProcess?.decision?.stopState) || normalizedStopState,
      outputEligibility:
        normalizeOutputEligibility(coreProcess?.decision?.outputEligibility) ||
        normalizedOutputEligibility,
      diagnosticTrace: Array.isArray(coreProcess?.decision?.diagnosticTrace)
        ? normalizeDiagnosticTrace(coreProcess.decision.diagnosticTrace)
        : normalizedDiagnosticTrace
    }
  }
}

export function normalizeProblemCausality(items = []) {
  return (Array.isArray(items) ? items : []).map(item => ({
    causeProblemKey: item?.causeProblemKey || item?.cause_problem_key || '',
    effectProblemKey: item?.effectProblemKey || item?.effect_problem_key || '',
    relationType: item?.relationType || item?.relation_type || '',
    relationStrength: Number(item?.relationStrength ?? item?.relation_strength ?? 0),
    note: item?.note || ''
  }))
}
