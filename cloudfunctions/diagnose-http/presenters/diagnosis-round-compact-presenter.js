'use strict'

const {
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
} = require('../utils/diagnosis-contract')
const { buildPublicVisualAggregateSummary } = require('../utils/public-runtime-summary')

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
    urgency: String(outcome?.urgency || '').trim(),
    actionProfileKey: toCompactString(
      outcome?.actionProfileKey,
      outcome?.action_profile_key
    ),
    actionAdviceItems: compactStringList(outcome?.actionAdviceItems),
    avoidAdviceItems: compactStringList(outcome?.avoidAdviceItems)
  }
}

function toCompactFlag(value, conservative = null) {
  if (value === null || typeof value === 'undefined') {
    return conservative
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

function buildCompactVisualEvidenceItem(candidate = {}) {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }
  const symptomKey = toCompactString(candidate.symptomKey, candidate.symptom_key)
  if (!symptomKey) {
    return null
  }
  return {
    symptomKey,
    displayNameCn: toCompactString(
      candidate.displayNameCn,
      candidate.display_name_cn,
      symptomKey
    ),
    supportImageCount: Math.max(
      Number(candidate.supportImageCount ?? candidate.support_image_count ?? 0),
      Array.isArray(candidate.supportImageIds || candidate.support_image_ids)
        ? (candidate.supportImageIds || candidate.support_image_ids).length
        : 0
    ),
    supportOrgans: compactStringList(candidate.supportOrgans || candidate.support_organs),
    primaryCaptureRegion: toCompactString(
      candidate.primaryCaptureRegion,
      candidate.primary_capture_region
    )
  }
}

function buildCompactVisualMissingInfo(item = {}) {
  if (!item || typeof item !== 'object') {
    return null
  }
  const dimensionKey = toCompactString(item.dimensionKey, item.dimension_key)
  const reasonCn = toCompactString(item.reasonCn, item.reason_cn, item.reason)
  return dimensionKey && reasonCn ? { dimensionKey, reasonCn } : null
}

function buildCompactVisualAggregateSummary(visualAggregateSummary = null) {
  if (!visualAggregateSummary || typeof visualAggregateSummary !== 'object') {
    return null
  }

  const publicSummary = buildPublicVisualAggregateSummary(visualAggregateSummary)
  if (!publicSummary) {
    return null
  }
  const visualEvidenceItems = publicSummary.aggregatedSymptomCandidates
    .map(buildCompactVisualEvidenceItem)
    .filter(Boolean)
    .slice(0, 8)
  const visualMissingInfoForPath = publicSummary.aggregateMissingInfoForPath
    .map(buildCompactVisualMissingInfo)
    .filter(Boolean)
    .slice(0, 8)
  const suggestedFollowupCapture = Array.isArray(publicSummary.suggestedFollowupCapture)
    ? compactStringList(publicSummary.suggestedFollowupCapture)
    : buildCompactSuggestedFollowupCapture(publicSummary.suggestedFollowupCapture)

  return {
    visualCallBatchId: publicSummary.visualCallBatchId || '',
    effectiveImageCount: publicSummary.effectiveImageCount,
    aggregateAnalyzability: publicSummary.aggregateAnalyzability,
    organCoverageSummary: publicSummary.organCoverageSummary
      ? {
          coveredOrgans: compactStringList(publicSummary.organCoverageSummary.coveredOrgans),
          requestedImageCount: Number(publicSummary.organCoverageSummary.requestedImageCount || 0),
          effectiveImageCount: Number(publicSummary.organCoverageSummary.effectiveImageCount || 0)
        }
      : null,
    routePrimaryAction: normalizeDiagnosisRoutePrimaryAction(
      publicSummary.routePrimaryAction,
      ''
    ),
    admissionReadyFlag: toCompactFlag(publicSummary.admissionReadyFlag, null),
    decisionSource: toCompactString(publicSummary.decisionSource),
    primaryModelDirectModes: compactStringList(publicSummary.primaryModelDirectModes),
    modelDirectDecisionStatus: toCompactString(publicSummary.modelDirectDecisionStatus),
    visualEvidenceItems,
    visualMissingInfoForPath,
    suggestedFollowupCapture
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
  buildPublicStopState,
  buildPublicOutputEligibility,
  buildCompactActionAdvice,
  buildCompactOutcomeEntry,
  buildCompactVisualBatchTrace,
  buildCompactSuggestedFollowupCapture,
  buildCompactVisualAggregateSummary,
  buildCompactFinalResult
}
