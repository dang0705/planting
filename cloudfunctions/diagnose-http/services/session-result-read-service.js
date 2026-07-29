'use strict'

const {
  fromResultId,
  toResultId,
  getDiagnosisSessionResultRow,
  getLatestStopStateBySession,
  resolveLatestVisualCallBatchId,
  safeJsonParse,
  normalizeStoredNullableText,
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction,
  normalizePublicObservedEvidenceSet,
  normalizePublicDerivedEvidenceSet,
  normalizePublicDiagnosisDirectionSet,
  buildPublicCoreProcess,
  toPublicProblemId,
  getObservedSymptomsBySession,
  getObservedEvidenceSetBySession,
  getFinalDiagnosisSnapshot,
  resolveReadStageRecord,
  expireRuntimeRetakeSnapshotIfNeeded,
  resolveGovernedProblemAdvice,
  buildProblematicAdviceGovernanceConservative,
  resolveClosedStageRecord,
  mergeRuntimeDecisionObject,
  asPlainObject,
  normalizeOutcomeEntry,
  normalizeOutcomeList,
  suppressUncertainWhenConcreteOutcomeExists,
  firstPlainObject,
  mergePlainObjects,
  firstOutcomeList,
  resolveRouteOutcomeFields
} = require('./session-result-read-helpers')

async function getResultById(openid, { resultId = '', sessionId = '' } = {}) {
  const parsed = resultId ? fromResultId(resultId) : { sessionId: '', round: null }
  const finalSessionId = sessionId || parsed.sessionId || resultId
  if (!finalSessionId) {
    return null
  }

  const snapshot = await getFinalDiagnosisSnapshot(openid, finalSessionId)
  const persistedObservedEvidenceSet = await getObservedEvidenceSetBySession(finalSessionId, openid)
  const persistedStopStateBundle = await getLatestStopStateBySession(finalSessionId, openid)

  if (snapshot) {
    const routeOutcomeFields = resolveRouteOutcomeFields({ snapshot })
    const normalizedSnapshotOutcomeType = normalizeOutcomeType(snapshot?.outcomeType, '')
    const normalizedSnapshotRoutePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
      snapshot?.routePrimaryAction,
      ''
    )
    const observedSymptoms =
      Array.isArray(snapshot?.observedSymptoms) && snapshot.observedSymptoms.length
        ? snapshot.observedSymptoms
        : await getObservedSymptomsBySession(finalSessionId)
    const observedEvidenceSet = persistedObservedEvidenceSet.length
      ? persistedObservedEvidenceSet
      : normalizePublicObservedEvidenceSet(snapshot?.observedEvidenceSet)
    const derivedEvidenceSet = normalizePublicDerivedEvidenceSet(snapshot?.derivedEvidenceSet)
    const diagnosisDirections = normalizePublicDiagnosisDirectionSet(snapshot?.diagnosisDirections)
    const persistedStopState = mergeRuntimeDecisionObject(
      persistedStopStateBundle?.stopState || null,
      snapshot?.stopState || null
    )
    const closedStageRecord = resolveClosedStageRecord({
      explicitStatus: snapshot?.status,
      stopReason: snapshot?.stopReason,
      stopState: persistedStopState
    })
    const latestVisualCallBatchId = resolveLatestVisualCallBatchId(snapshot)
    const visualAggregateSummary = snapshot?.visualAggregateSummary || null
    const shadowCompareSummary =
      snapshot?.shadowCompareSummary ||
      snapshot?.visualAggregateSummary?.shadowCompareSummary ||
      null
    const outputEligibility = mergeRuntimeDecisionObject(
      persistedStopStateBundle?.outputEligibility || null,
      snapshot?.outputEligibility || null
    )
    const diagnosticTrace = Array.isArray(snapshot?.diagnosticTrace) ? snapshot.diagnosticTrace : []
    const governedAdvice =
      normalizedSnapshotOutcomeType === 'problematic'
        ? await resolveGovernedProblemAdvice(
            snapshot?.finalResult?.problemId ||
              snapshot?.finalResult?.problemKey ||
              snapshot?.topProblem?.problemId ||
              snapshot?.topProblem?.problemKey ||
              ''
          )
        : null
    const effectiveGovernedAdvice =
      normalizedSnapshotOutcomeType === 'problematic'
        ? governedAdvice ||
          buildProblematicAdviceGovernanceConservative(
            snapshot?.finalResult?.problemId ||
              snapshot?.finalResult?.problemKey ||
              snapshot?.topProblem?.problemId ||
              snapshot?.topProblem?.problemKey ||
              ''
          )
        : null
    const coreProcess = buildPublicCoreProcess({
      latestVisualCallBatchId,
      visualBatchTrace: snapshot?.visualBatchTrace || null,
      visualAggregateSummary,
      shadowCompareSummary,
      observedSymptoms,
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections,
      careBaselineSummary: snapshot?.careBaselineSummary || null,
      environmentDeviationHints: Array.isArray(snapshot?.environmentDeviationHints)
        ? snapshot.environmentDeviationHints
        : [],
      routePrimaryAction: normalizedSnapshotRoutePrimaryAction,
      stopReason: closedStageRecord.stopReason,
      stopState: persistedStopState,
      outputEligibility,
      diagnosticTrace
    })

    return {
      resultId: resultId || toResultId(finalSessionId, parsed.round || 1),
      diagnosisSessionId: finalSessionId,
      plantId: snapshot?.plantContext?.userPlantId || snapshot?.plantContext?.plantId || '',
      userPlantId: snapshot?.plantContext?.userPlantId || null,
      plantCatalogId: snapshot?.plantContext?.plantId || null,
      plantIdentityId: snapshot?.plantContext?.plantIdentityId || '',
      latestVisualCallBatchId,
      stage: closedStageRecord.stage,
      status: closedStageRecord.status,
      outcomeType: normalizedSnapshotOutcomeType,
      nonProblematicType: snapshot?.nonProblematicType || '',
      nonProblematicLabel: snapshot?.nonProblematicLabel || '',
      observedSymptoms,
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections,
      careBaselineSummary: snapshot?.careBaselineSummary || null,
      environmentDeviationHints: Array.isArray(snapshot?.environmentDeviationHints)
        ? snapshot.environmentDeviationHints
        : [],
      stopReason: closedStageRecord.stopReason,
      routePrimaryAction: normalizedSnapshotRoutePrimaryAction,
      identityResolutionStatus: snapshot?.identityResolutionStatus || '',
      visualBatchTrace: snapshot?.visualBatchTrace || null,
      visualAggregateSummary,
      shadowCompareSummary,
      stopState: persistedStopState,
      outputEligibility,
      diagnosticTrace,
      coreProcess,
      finalResult: routeOutcomeFields.finalResult || null,
      visibleOutcomes: routeOutcomeFields.visibleOutcomes,
      outcomeMode: routeOutcomeFields.outcomeMode,
      actionAdvice: routeOutcomeFields.actionAdvice,
      routeDecisionCause: routeOutcomeFields.routeDecisionCause,
      explanation: effectiveGovernedAdvice?.explanation || snapshot.explanation || {},
      resultExplanation: effectiveGovernedAdvice?.explanation || snapshot.explanation || {},
      contributingFactors: Array.isArray(snapshot.contributingFactors)
        ? snapshot.contributingFactors
        : [],
      intermediateStates: Array.isArray(snapshot.intermediateStates)
        ? snapshot.intermediateStates
        : [],
      confidenceLevel: snapshot.confidenceLevel || 'normal',
      needHumanReview: Boolean(snapshot.needHumanReview),
      nextSteps: effectiveGovernedAdvice?.nextSteps?.length
        ? effectiveGovernedAdvice.nextSteps
        : Array.isArray(snapshot.nextSteps)
          ? snapshot.nextSteps
          : [],
      whatToAvoid: effectiveGovernedAdvice?.whatToAvoid?.length
        ? effectiveGovernedAdvice.whatToAvoid
        : Array.isArray(snapshot.whatToAvoid)
          ? snapshot.whatToAvoid
          : [],
      questions: Array.isArray(snapshot.askedQuestions) ? snapshot.askedQuestions : [],
      versionMetadata: snapshot.versionMetadata || {},
      timeline: {
        createdAt: ''
      }
    }
  }

  const row = await getDiagnosisSessionResultRow(openid, finalSessionId)
  if (!row) {
    return null
  }
  let runtimeSnapshot = safeJsonParse(row.runtime_snapshot_json, {}) || {}
  runtimeSnapshot = await expireRuntimeRetakeSnapshotIfNeeded({ openid, row, runtimeSnapshot })
  const outcomePayload = safeJsonParse(row.outcome_payload_json, {}) || {}
  const routeOutcomeFields = resolveRouteOutcomeFields({
    snapshot: runtimeSnapshot,
    outcomePayload
  })
  const normalizedOutcomeType = normalizeOutcomeType(row.outcome_type, '')
  const normalizedRoutePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
    row.current_route_primary_action,
    ''
  )
  const governedAdvice =
    normalizedOutcomeType === 'problematic'
      ? await resolveGovernedProblemAdvice(row.final_problem_key || row.top_problem_key || '')
      : null
  const effectiveGovernedAdvice =
    normalizedOutcomeType === 'problematic'
      ? governedAdvice ||
        buildProblematicAdviceGovernanceConservative(
          row.final_problem_key || row.top_problem_key || ''
        )
      : null
  const observedEvidenceSet = persistedObservedEvidenceSet.length
    ? persistedObservedEvidenceSet
    : normalizePublicObservedEvidenceSet(runtimeSnapshot?.observedEvidenceSet)
  const derivedEvidenceSet = normalizePublicDerivedEvidenceSet(runtimeSnapshot?.derivedEvidenceSet)
  const diagnosisDirections = normalizePublicDiagnosisDirectionSet(
    runtimeSnapshot?.diagnosisDirections
  )
  const persistedStopState = mergeRuntimeDecisionObject(
    persistedStopStateBundle?.stopState || null,
    runtimeSnapshot?.stopState || null
  )
  const closedStageRecord = resolveReadStageRecord({
    routePrimaryAction: normalizedRoutePrimaryAction,
    sessionStatus: runtimeSnapshot?.sessionStatus || row.session_status || '',
    stopReason: runtimeSnapshot?.stopReason,
    stopState: persistedStopState
  })
  const latestVisualCallBatchId = resolveLatestVisualCallBatchId(
    row.latest_visual_call_batch_id,
    runtimeSnapshot
  )
  const visualAggregateSummary = runtimeSnapshot?.visualAggregateSummary || null
  const shadowCompareSummary =
    runtimeSnapshot?.shadowCompareSummary ||
    runtimeSnapshot?.visualAggregateSummary?.shadowCompareSummary ||
    null
  const outputEligibility = mergeRuntimeDecisionObject(
    persistedStopStateBundle?.outputEligibility || null,
    runtimeSnapshot?.outputEligibility || null
  )
  const diagnosticTrace = Array.isArray(runtimeSnapshot?.diagnosticTrace)
    ? runtimeSnapshot.diagnosticTrace
    : []
  const coreProcess = buildPublicCoreProcess({
    latestVisualCallBatchId,
    visualBatchTrace: runtimeSnapshot?.visualBatchTrace || null,
    visualAggregateSummary,
    shadowCompareSummary,
    observedSymptoms: [],
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    careBaselineSummary: runtimeSnapshot?.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(runtimeSnapshot?.environmentDeviationHints)
      ? runtimeSnapshot.environmentDeviationHints
      : [],
    routePrimaryAction: normalizedRoutePrimaryAction,
    stopReason: closedStageRecord.stopReason,
    stopState: persistedStopState,
    outputEligibility,
    diagnosticTrace
  })

  const conservativeFinalResult = {
    problemId:
      normalizedOutcomeType === 'problematic'
        ? toPublicProblemId(normalizeStoredNullableText(row.final_problem_key, ''))
        : '',
    displayName:
      normalizedOutcomeType === 'non_problematic'
        ? '暂未见明显问题'
        : normalizedOutcomeType === 'uncertain'
          ? '暂不能稳定判断'
          : normalizeStoredNullableText(row.final_problem_cn, null) ||
            normalizeStoredNullableText(row.final_problem_key, null) ||
            '待确认',
    summary: row.ai_summary || '',
    severity: ['uncertain', 'non_problematic'].includes(normalizedOutcomeType) ? 'low' : 'medium',
    urgency: normalizedOutcomeType === 'non_problematic' ? 'low' : 'medium'
  }
  const finalResult = routeOutcomeFields.finalResult || conservativeFinalResult

  return {
    resultId: resultId || toResultId(finalSessionId, parsed.round || 1),
    diagnosisSessionId: row.diagnosis_id,
    stage: closedStageRecord.stage,
    status: closedStageRecord.status,
    plantId: row.user_plant_id || normalizeStoredNullableText(row.plant_id, null),
    userPlantId: row.user_plant_id || null,
    plantCatalogId: normalizeStoredNullableText(row.plant_id, null),
    plantIdentityId: normalizeStoredNullableText(row.current_plant_identity_id, ''),
    latestVisualCallBatchId,
    outcomeType: normalizedOutcomeType,
    nonProblematicType:
      normalizedOutcomeType === 'non_problematic'
        ? normalizeStoredNullableText(
            outcomePayload?.nonProblematicType || runtimeSnapshot?.nonProblematicType || '',
            ''
          )
        : '',
    stopReason: closedStageRecord.stopReason,
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    careBaselineSummary: runtimeSnapshot?.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(runtimeSnapshot?.environmentDeviationHints)
      ? runtimeSnapshot.environmentDeviationHints
      : [],
    routePrimaryAction: normalizedRoutePrimaryAction,
    identityResolutionStatus: normalizeStoredNullableText(
      row.current_identity_resolution_status,
      ''
    ),
    visualBatchTrace: runtimeSnapshot?.visualBatchTrace || null,
    visualAggregateSummary,
    shadowCompareSummary,
    stopState: persistedStopState,
    outputEligibility,
    diagnosticTrace,
    coreProcess,
    finalResult,
    visibleOutcomes: routeOutcomeFields.visibleOutcomes,
    outcomeMode: routeOutcomeFields.outcomeMode,
    actionAdvice: routeOutcomeFields.actionAdvice,
    routeDecisionCause:
      routeOutcomeFields.routeDecisionCause ||
      asPlainObject(runtimeSnapshot?.routeDecision?.decisionCause),
    retakeRequest: runtimeSnapshot?.retakeRequest || null,
    retakeAuthorizationState: runtimeSnapshot?.retakeAuthorizationState || null,
    directionChoices: Array.isArray(runtimeSnapshot?.directionChoices)
      ? runtimeSnapshot.directionChoices
      : [],
    recommendedDirection: runtimeSnapshot?.recommendedDirection || '',
    recommendedMode: runtimeSnapshot?.recommendedMode || '',
    directMatches: Array.isArray(runtimeSnapshot?.directMatches)
      ? runtimeSnapshot.directMatches
      : [],
    evidenceLedger: Array.isArray(runtimeSnapshot?.evidenceLedger)
      ? runtimeSnapshot.evidenceLedger
      : [],
    pendingDirectPestSnapshot: runtimeSnapshot?.pendingDirectPestSnapshot || null,
    questionPackage: runtimeSnapshot?.questionPackageSnapshot || null,
    explanation: {
      whyItHappens: effectiveGovernedAdvice?.explanation?.whyItHappens || row.ai_summary || '',
      whatToCheckNext: effectiveGovernedAdvice?.explanation?.whatToCheckNext || '',
      firstAid: effectiveGovernedAdvice?.explanation?.firstAid || row.treatment || '',
      avoid: effectiveGovernedAdvice?.explanation?.avoid || row.prevention || '',
      reassurance: effectiveGovernedAdvice?.explanation?.reassurance || ''
    },
    resultExplanation: {
      whyItHappens: effectiveGovernedAdvice?.explanation?.whyItHappens || row.ai_summary || '',
      whatToCheckNext: effectiveGovernedAdvice?.explanation?.whatToCheckNext || '',
      firstAid: effectiveGovernedAdvice?.explanation?.firstAid || row.treatment || '',
      avoid: effectiveGovernedAdvice?.explanation?.avoid || row.prevention || '',
      reassurance: effectiveGovernedAdvice?.explanation?.reassurance || ''
    },
    nextSteps: effectiveGovernedAdvice?.nextSteps || [],
    whatToAvoid: effectiveGovernedAdvice?.whatToAvoid || [],
    contributingFactors: [],
    intermediateStates: [],
    questions: Array.isArray(runtimeSnapshot?.questionPackageSnapshot?.packageQuestions)
      ? runtimeSnapshot.questionPackageSnapshot.packageQuestions
      : [],
    versionMetadata: {},
    timeline: {
      createdAt: row.created_at
    }
  }
}

module.exports = {
  toPublicProblemId,
  getObservedSymptomsBySession,
  getObservedEvidenceSetBySession,
  getFinalDiagnosisSnapshot,
  mergeRuntimeDecisionObject,
  getResultById,
  _test: {
    asPlainObject,
    normalizeOutcomeEntry,
    normalizeOutcomeList,
    suppressUncertainWhenConcreteOutcomeExists,
    firstPlainObject,
    mergePlainObjects,
    firstOutcomeList,
    resolveRouteOutcomeFields
  }
}
