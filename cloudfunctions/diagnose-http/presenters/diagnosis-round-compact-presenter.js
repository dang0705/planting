'use strict'

const {
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
} = require('../utils/diagnosis-contract')

function buildPublicQuestionQueue(questionQueue = null) {
  if (!questionQueue || typeof questionQueue !== 'object') {
    return null
  }

  return {
    questionQueueId: String(questionQueue?.questionQueueId || '').trim(),
    sessionId: String(questionQueue?.sessionId || '').trim(),
    roundId: String(questionQueue?.roundId || '').trim(),
    roundIndex: Number(questionQueue?.roundIndex || 1),
    routePrimaryAction: normalizeDiagnosisRoutePrimaryAction(questionQueue?.routePrimaryAction, ''),
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

function toCompactString(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) {return text}
  }
  return ''
}

function compactStringList(items = []) {
  return Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

function buildCompactActionAdvice(actionAdvice = null) {
  if (!actionAdvice || typeof actionAdvice !== 'object') {return null}

  const compact = {
    todayActions: compactStringList(actionAdvice.todayActions),
    threeDayActions: compactStringList(actionAdvice.threeDayActions),
    sevenDayObserve: compactStringList(actionAdvice.sevenDayObserve),
    avoidActions: compactStringList(actionAdvice.avoidActions),
    retakeOrEscalate: compactStringList(actionAdvice.retakeOrEscalate),
    conflictDetected: Boolean(actionAdvice.conflictDetected)
  }
  const hasText =
    compact.todayActions.length ||
    compact.threeDayActions.length ||
    compact.sevenDayObserve.length ||
    compact.avoidActions.length ||
    compact.retakeOrEscalate.length
  return hasText || compact.conflictDetected ? compact : null
}

function buildCompactOutcomeEntry(outcome = null) {
  if (!outcome || typeof outcome !== 'object') {return null}
  return {
    outcomeKey: String(outcome?.outcomeKey || outcome?.problemKey || '').trim(),
    problemKey: String(outcome?.problemKey || outcome?.outcomeKey || '').trim(),
    outcomeType: String(outcome?.outcomeType || '').trim(),
    outcomeCategory: String(outcome?.outcomeCategory || '').trim(),
    displayNameCn: String(outcome?.displayNameCn || outcome?.displayName || '').trim(),
    summary: String(outcome?.summary || '').trim(),
    severity: String(outcome?.severity || '').trim(),
    urgency: String(outcome?.urgency || '').trim()
  }
}

function toCompactFlag(value, fallback = null) {
  if (value === null || typeof value === 'undefined') {
    return fallback
  }
  return Number(value) ? 1 : 0
}

function buildCompactVisualBatchTrace(visualBatchTrace = null) {
  if (!visualBatchTrace || typeof visualBatchTrace !== 'object') {
    return null
  }

  return {
    currentVisualCallBatchId: toCompactString(
      visualBatchTrace.currentVisualCallBatchId,
      visualBatchTrace.current_visual_call_batch_id
    ),
    originVisualCallBatchId: toCompactString(
      visualBatchTrace.originVisualCallBatchId,
      visualBatchTrace.origin_visual_call_batch_id
    ),
    supersedeApplied: toCompactFlag(
      visualBatchTrace.supersedeApplied ?? visualBatchTrace.supersede_applied,
      0
    )
  }
}

function buildCompactSuggestedFollowupCapture(suggestedFollowupCapture = null) {
  if (!suggestedFollowupCapture || typeof suggestedFollowupCapture !== 'object') {
    return null
  }

  return {
    needed: toCompactFlag(
      suggestedFollowupCapture.needed ?? suggestedFollowupCapture.isNeeded,
      0
    ),
    reason: toCompactString(suggestedFollowupCapture.reason),
    slotKey: toCompactString(suggestedFollowupCapture.slotKey, suggestedFollowupCapture.slot_key),
    locationKey: toCompactString(
      suggestedFollowupCapture.locationKey,
      suggestedFollowupCapture.location_key
    ),
    title: toCompactString(suggestedFollowupCapture.title, suggestedFollowupCapture.captureTitle),
    instruction: toCompactString(
      suggestedFollowupCapture.instruction,
      suggestedFollowupCapture.captureInstruction
    ),
    helpText: toCompactString(suggestedFollowupCapture.helpText, suggestedFollowupCapture.help_text),
    maxImages: Number(suggestedFollowupCapture.maxImages || suggestedFollowupCapture.max_images || 0)
  }
}

function buildCompactVisualAggregateSummary(visualAggregateSummary = null) {
  if (!visualAggregateSummary || typeof visualAggregateSummary !== 'object') {
    return null
  }

  return {
    visualCallBatchId: toCompactString(
      visualAggregateSummary.visualCallBatchId,
      visualAggregateSummary.visual_call_batch_id,
      visualAggregateSummary.callBatchId,
      visualAggregateSummary.call_batch_id
    ),
    routePrimaryAction: normalizeDiagnosisRoutePrimaryAction(
      visualAggregateSummary.routePrimaryAction || visualAggregateSummary.route_primary_action,
      ''
    ),
    admissionReadyFlag: toCompactFlag(
      visualAggregateSummary.admissionReadyFlag ?? visualAggregateSummary.admission_ready_flag,
      null
    ),
    suggestedFollowupCapture: buildCompactSuggestedFollowupCapture(
      visualAggregateSummary.suggestedFollowupCapture ||
        visualAggregateSummary.suggested_followup_capture ||
        null
    )
  }
}

function buildCompactFinalResult(roundResult = {}) {
  const finalResult = roundResult?.finalResult || {}
  const outcomeType = normalizeOutcomeType(roundResult?.outcomeType, '')

  if (outcomeType === 'uncertain') {
    return {
      resultId: finalResult.resultId || roundResult?.resultId || '',
      problemId: '',
      displayName:
        (finalResult.problemId ? '' : finalResult.displayName) ||
        '暂不能稳定判断',
      summary: finalResult.summary || '',
      severity: finalResult.severity || 'low',
      urgency: finalResult.urgency || 'medium'
    }
  }

  return {
    resultId: finalResult.resultId || roundResult?.resultId || '',
    problemId: finalResult.problemId || '',
    displayName: finalResult.displayName || roundResult?.topProblem?.displayName || '',
    summary: finalResult.summary || roundResult?.topProblem?.summary || '',
    severity: finalResult.severity || roundResult?.topProblem?.severity || 'medium',
    urgency: finalResult.urgency || roundResult?.topProblem?.urgency || 'medium',
    nonProblematicType:
      outcomeType === 'non_problematic'
        ? finalResult.nonProblematicType || roundResult?.nonProblematicType || ''
        : '',
    nonProblematicLabel:
      outcomeType === 'non_problematic'
        ? finalResult.nonProblematicLabel || roundResult?.nonProblematicLabel || ''
        : ''
  }
}

module.exports = {
  buildPublicQuestionQueue,
  buildPublicStopState,
  buildPublicOutputEligibility,
  buildCompactActionAdvice,
  buildCompactOutcomeEntry,
  buildCompactVisualBatchTrace,
  buildCompactSuggestedFollowupCapture,
  buildCompactVisualAggregateSummary,
  buildCompactFinalResult
}
