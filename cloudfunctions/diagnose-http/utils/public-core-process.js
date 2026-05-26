'use strict'

function buildQuestionCountSummary(questionQueue = null) {
  if (!questionQueue || typeof questionQueue !== 'object') {
    return {
      totalItems: 0,
      activeItems: 0,
      askedItems: 0,
      answeredItems: 0,
      invalidatedItems: 0
    }
  }

  const questionItems = Array.isArray(questionQueue?.questionItems)
    ? questionQueue.questionItems
    : []
  const askedItems = questionItems.filter(item => Number(item?.asked || 0) ? 1 : 0).length
  const answeredItems = questionItems.filter(item => Number(item?.answered || 0) ? 1 : 0).length
  const invalidatedItems = questionItems.filter(item => Number(item?.invalidated || 0) ? 1 : 0).length
  const activeItems = questionItems.filter(item => {
    const status = String(item?.status || '').trim().toLowerCase()
    return Number(item?.asked || 0) && !Number(item?.answered || 0) && !Number(item?.invalidated || 0) && status !== 'answered' && status !== 'invalidated'
  }).length

  return {
    totalItems: questionItems.length,
    activeItems: Number(questionQueue?.activeItemCount || activeItems || 0),
    askedItems: Number(questionQueue?.askedItemCount || askedItems || 0),
    answeredItems: Number(questionQueue?.answeredItemCount || answeredItems || 0),
    invalidatedItems: Number(questionQueue?.invalidatedItemCount || invalidatedItems || 0)
  }
}

function buildPublicQuestionQueue(questionQueue = null) {
  if (!questionQueue || typeof questionQueue !== 'object') {
    return null
  }

  return {
    questionQueueId: String(questionQueue?.questionQueueId || '').trim(),
    sessionId: String(questionQueue?.sessionId || '').trim(),
    roundId: String(questionQueue?.roundId || '').trim(),
    roundIndex: Number(questionQueue?.roundIndex || 1),
    routePrimaryAction: String(questionQueue?.routePrimaryAction || '').trim(),
    queueStatus: String(questionQueue?.queueStatus || '').trim(),
    queueDecision: questionQueue?.queueDecision && typeof questionQueue.queueDecision === 'object'
      ? {
          hasActionableItems: Number(questionQueue.queueDecision?.hasActionableItems || 0) ? 1 : 0,
          exhaustedReason: String(questionQueue.queueDecision?.exhaustedReason || '').trim(),
          serviceTarget: String(questionQueue.queueDecision?.serviceTarget || '').trim(),
          decisionCauseKey: String(questionQueue.queueDecision?.decisionCauseKey || '').trim(),
          decisionCauseCategory: String(questionQueue.queueDecision?.decisionCauseCategory || '').trim(),
          decisionCauseText: String(questionQueue.queueDecision?.decisionCauseText || '').trim(),
          decisionCauseDetails:
            questionQueue.queueDecision?.decisionCauseDetails &&
            typeof questionQueue.queueDecision.decisionCauseDetails === 'object'
              ? questionQueue.queueDecision.decisionCauseDetails
              : null
        }
      : null,
    questionItems: (Array.isArray(questionQueue?.questionItems) ? questionQueue.questionItems : []).map(item => ({
      questionKey: String(item?.questionKey || '').trim(),
      questionId: String(item?.questionId || '').trim(),
      targetSymptomKey: String(item?.targetSymptomKey || '').trim(),
      questionGroupKey: String(item?.questionGroupKey || '').trim(),
      targetDimension: String(item?.targetDimension || '').trim(),
      routingScope: String(item?.routingScope || '').trim(),
      questionText: String(item?.questionText || '').trim(),
      helpText: String(item?.helpText || '').trim(),
      currentPriority: Number(item?.currentPriority || 0),
      estimatedInformationGain: Number(item?.estimatedInformationGain || 0),
      serviceTarget: String(item?.serviceTarget || '').trim(),
      appliesWhen: item?.appliesWhen || null,
      asked: Number(item?.asked || 0) ? 1 : 0,
      answered: Number(item?.answered || 0) ? 1 : 0,
      invalidated: Number(item?.invalidated || 0) ? 1 : 0,
      invalidReason: String(item?.invalidReason || '').trim(),
      status: String(item?.status || '').trim() || 'pending'
    })),
    activeItemCount: Number(questionQueue?.activeItemCount || 0),
    askedItemCount: Number(questionQueue?.askedItemCount || 0),
    answeredItemCount: Number(questionQueue?.answeredItemCount || 0),
    invalidatedItemCount: Number(questionQueue?.invalidatedItemCount || 0)
  }
}

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
    classGateDecision: symptomClass?.classGateDecision && typeof symptomClass.classGateDecision === 'object'
      ? symptomClass.classGateDecision
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
    requiresFollowUp: Boolean(routeDecision?.requiresFollowUp),
    nextQuestionKeys: Array.isArray(routeDecision?.nextQuestionKeys)
      ? routeDecision.nextQuestionKeys.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    fallbackPolicy: String(routeDecision?.fallbackPolicy || '').trim(),
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
          missingGateKeys: Array.isArray(item?.missingGateKeys)
            ? item.missingGateKeys.map(gateKey => String(gateKey || '').trim()).filter(Boolean)
            : [],
          nextQuestionKeys: Array.isArray(item?.nextQuestionKeys)
            ? item.nextQuestionKeys.map(questionKey => String(questionKey || '').trim()).filter(Boolean)
            : []
        }))
      : [],
    gateResults: Array.isArray(routeDecision?.gateResults)
      ? routeDecision.gateResults.map(item => ({
          gateKey: String(item?.gateKey || '').trim(),
          routeKey: String(item?.routeKey || '').trim(),
          gateRole: String(item?.gateRole || '').trim(),
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
          gateResults: Array.isArray(item?.gateResults)
            ? item.gateResults.map(result => ({
                gateKey: String(result?.gateKey || '').trim(),
                gateRole: String(result?.gateRole || '').trim(),
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
  questionQueue = null,
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
    followUp: {
      routePrimaryAction: String(routePrimaryAction || '').trim(),
      questionQueue: buildPublicQuestionQueue(questionQueue),
      questionCountSummary: buildQuestionCountSummary(questionQueue)
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
  buildPublicQuestionQueue,
  buildPublicRouteDecisionForReview,
  buildPublicStopState,
  buildPublicSymptomClassPayload
}
