'use strict'

function buildPublicStopState(stopState = null) {
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
    stopReasonDetail: String(stopState?.stopReasonDetail || '').trim(),
    stopReasonText: String(stopState?.stopReasonText || '').trim(),
    decisionCauseKey: String(stopState?.decisionCauseKey || '').trim(),
    decisionCauseCategory: String(stopState?.decisionCauseCategory || '').trim(),
    decisionCauseText: String(stopState?.decisionCauseText || '').trim(),
    decisionCauseDetails:
      stopState?.decisionCauseDetails && typeof stopState.decisionCauseDetails === 'object'
        ? stopState.decisionCauseDetails
        : null,
    finalOutputRef: stopState?.finalOutputRef || null,
    allowMoreQuestions: Number(stopState?.allowMoreQuestions || 0) ? 1 : 0
  }
}

function buildPublicOutputEligibility(outputEligibility = null) {
  if (!outputEligibility || typeof outputEligibility !== 'object') {
    return null
  }

  return {
    eligible: Number(outputEligibility?.eligible || 0) ? 1 : 0,
    judgment: String(outputEligibility?.judgment || '').trim(),
    conclusionType: String(outputEligibility?.conclusionType || '').trim(),
    conclusionStatus: String(outputEligibility?.conclusionStatus || '').trim(),
    outputConservatism: String(outputEligibility?.outputConservatism || '').trim(),
    decisionCauseKey: String(outputEligibility?.decisionCauseKey || '').trim(),
    decisionCauseCategory: String(outputEligibility?.decisionCauseCategory || '').trim(),
    keyEvidenceSummary: String(outputEligibility?.keyEvidenceSummary || '').trim(),
    unresolvedRisks: Array.isArray(outputEligibility?.unresolvedRisks) ? outputEligibility.unresolvedRisks : [],
    nextStepHints: Array.isArray(outputEligibility?.nextStepHints) ? outputEligibility.nextStepHints : []
  }
}

function buildPublicSymptomClassPayload(symptomClass = null) {
  if (!symptomClass || typeof symptomClass !== 'object') {
    return null
  }

  return {
    currentClassKey: String(symptomClass.currentClassKey || '').trim(),
    currentGroupKey: String(symptomClass.currentGroupKey || '').trim(),
    primaryClass: symptomClass?.primaryClass && typeof symptomClass.primaryClass === 'object'
      ? {
          classKey: String(symptomClass.primaryClass?.classKey || '').trim(),
          classNameCn: String(symptomClass.primaryClass?.classNameCn || '').trim()
        }
      : null,
    secondaryClasses: Array.isArray(symptomClass.secondaryClasses)
      ? symptomClass.secondaryClasses
          .map(item => ({
            classKey: String(item?.classKey || '').trim(),
            classNameCn: String(item?.classNameCn || '').trim()
          }))
          .filter(item => item.classKey)
      : [],
    classScores: Array.isArray(symptomClass.classScores) ? symptomClass.classScores : [],
    classSwitchHistory: Array.isArray(symptomClass.classSwitchHistory) ? symptomClass.classSwitchHistory : [],
    classConditionDecision: symptomClass?.classConditionDecision && typeof symptomClass.classConditionDecision === 'object'
      ? symptomClass.classConditionDecision
      : null
  }
}

function buildPublicRouteDecisionForReview(routeDecision = null) {
  if (!routeDecision || typeof routeDecision !== 'object') {
    return null
  }

  return {
    mode: String(routeDecision?.mode || '').trim(),
    activeRouteGroupKeys: Array.isArray(routeDecision?.activeRouteGroupKeys)
      ? routeDecision.activeRouteGroupKeys.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    visibleOutcomeKeys: Array.isArray(routeDecision?.visibleOutcomeKeys)
      ? routeDecision.visibleOutcomeKeys.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    requiresQuestion: Boolean(routeDecision?.requiresQuestion),
    conservativePolicy: String(routeDecision?.conservativePolicy || '').trim(),
    decisionCause:
      routeDecision?.decisionCause && typeof routeDecision.decisionCause === 'object'
        ? routeDecision.decisionCause
        : null,
    visibleActionProfileKeys: Array.isArray(routeDecision?.visibleActionProfileKeys)
      ? routeDecision.visibleActionProfileKeys.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    visibleActionConflictGroups: Array.isArray(routeDecision?.visibleActionConflictGroups)
      ? routeDecision.visibleActionConflictGroups.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    candidateOutcomeStates: Array.isArray(routeDecision?.candidateOutcomeStates)
      ? routeDecision.candidateOutcomeStates.map(item => ({
          outcomeKey: String(item?.outcomeKey || '').trim(),
          state: String(item?.state || '').trim(),
          routeKeys: Array.isArray(item?.routeKeys)
            ? item.routeKeys.map(routeKey => String(routeKey || '').trim()).filter(Boolean)
            : [],
          missingConditionKeys: Array.isArray(item?.missingConditionKeys)
            ? item.missingConditionKeys.map(conditionKey => String(conditionKey || '').trim()).filter(Boolean)
            : []
        }))
      : [],
    conditionResults: Array.isArray(routeDecision?.conditionResults)
      ? routeDecision.conditionResults.map(item => ({
          conditionKey: String(item?.conditionKey || '').trim(),
          routeKey: String(item?.routeKey || '').trim(),
          conditionRole: String(item?.conditionRole || '').trim(),
          result: String(item?.result || '').trim(),
          blockerMatched: Boolean(item?.blockerMatched),
          requiredEvidenceMatched: Boolean(item?.requiredEvidenceMatched),
          requiredAnswerEffectsMatched: Boolean(item?.requiredAnswerEffectsMatched)
        }))
      : [],
    routeTrace: Array.isArray(routeDecision?.routeTrace)
      ? routeDecision.routeTrace.map(item => ({
          outcomeKey: String(item?.outcomeKey || '').trim(),
          routeKeys: Array.isArray(item?.routeKeys)
            ? item.routeKeys.map(routeKey => String(routeKey || '').trim()).filter(Boolean)
            : [],
          conditionResults: Array.isArray(item?.conditionResults)
            ? item.conditionResults.map(result => ({
                conditionKey: String(result?.conditionKey || '').trim(),
                conditionRole: String(result?.conditionRole || '').trim(),
                result: String(result?.result || '').trim()
              }))
            : []
        }))
      : []
  }
}

function buildPublicCoreProcess({
  latestVisualCallBatchId = null,
  visualBatchTrace = null,
  visualAggregateSummary = null,
  shadowCompareSummary = null,
  symptomClass = null,
  observedSymptoms = [],
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  diagnosisDirections = [],
  careBaselineSummary = null,
  environmentDeviationHints = [],
  routePrimaryAction = '',
  routeDecision = null,
  stopReason = '',
  stopState = null,
  outputEligibility = null,
  diagnosticTrace = []
} = {}) {
  return {
    visual: {
      latestVisualCallBatchId: latestVisualCallBatchId || null,
      visualBatchTrace: visualBatchTrace || null,
      visualAggregateSummary: visualAggregateSummary || null,
      shadowCompareSummary: shadowCompareSummary || null
    },
    evidence: {
      symptomClass: buildPublicSymptomClassPayload(symptomClass),
      observedSymptomCount: Array.isArray(observedSymptoms) ? observedSymptoms.length : 0,
      observedSymptoms: Array.isArray(observedSymptoms) ? observedSymptoms : [],
      observedEvidenceCount: Array.isArray(observedEvidenceSet) ? observedEvidenceSet.length : 0,
      observedEvidenceSet: Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [],
      derivedEvidenceCount: Array.isArray(derivedEvidenceSet) ? derivedEvidenceSet.length : 0,
      derivedEvidenceSet: Array.isArray(derivedEvidenceSet) ? derivedEvidenceSet : [],
      diagnosisDirectionCount: Array.isArray(diagnosisDirections) ? diagnosisDirections.length : 0,
      diagnosisDirections: Array.isArray(diagnosisDirections) ? diagnosisDirections : [],
      careBaselineSummary: careBaselineSummary || null,
      environmentDeviationHints: Array.isArray(environmentDeviationHints)
        ? environmentDeviationHints
        : []
    },
    question: {
      routePrimaryAction: String(routePrimaryAction || '').trim()
    },
    route: {
      routeDecision: buildPublicRouteDecisionForReview(routeDecision)
    },
    decision: {
      stopReason: String(stopReason || '').trim(),
      stopState: buildPublicStopState(stopState),
      outputEligibility: buildPublicOutputEligibility(outputEligibility),
      diagnosticTrace: Array.isArray(diagnosticTrace) ? diagnosticTrace : []
    }
  }
}

module.exports = {
  buildPublicCoreProcess,
  buildPublicOutputEligibility,
  buildPublicRouteDecisionForReview,
  buildPublicStopState,
  buildPublicSymptomClassPayload
}
