'use strict'

const { fromProblemId, fromResultId, toResultId, toProblemId } = require('../mappers/public-id-mapper')
const {
  listObservedSymptomRows,
  listObservedEvidenceRows,
  getDiagnosisSnapshotRow,
  getDiagnosisSessionResultRow
} = require('../repositories/diagnosis-session-read-repository')
const { getProblemsByKeys, getExplanationsByProblemKeys } = require('../repositories/problem-repository')
const { getLatestQueueBySession } = require('../repositories/question-queue-repository')
const { getLatestStopStateBySession } = require('../repositories/stop-state-repository')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const { safeJsonParse, normalizeStoredNullableText } = require('../utils/stored-value')
const { normalizeOutcomeType, normalizeDiagnosisRoutePrimaryAction } = require('../utils/diagnosis-contract')
const { normalizePublicObservedEvidenceSet } = require('./session-runtime-snapshot-codec')
const { normalizePublicDerivedEvidenceSet } = require('../utils/derived-evidence')
const { normalizePublicDiagnosisDirectionSet } = require('../utils/diagnosis-directions')
const { buildPublicCoreProcess } = require('../utils/public-core-process')
const { buildPublicQuestionQueue } = require('../presenters/diagnosis-round-presenter')

function toPublicProblemId(problemValue = '') {
  const value = String(problemValue || '').trim()
  if (!value) {return ''}
  if (value.startsWith('p_')) {return value}
  return toProblemId(value)
}

function toInternalProblemKey(problemValue = '') {
  const value = normalizeStoredNullableText(problemValue, '')
  if (!value) {return ''}
  return fromProblemId(value) || value
}

function buildGovernedExplanation(problem = null, explanationRow = null) {
  if (!problem) {return null}

  return {
    whyItHappens:
      explanationRow?.whyItHappensCn ||
      problem?.userDefinitionCn ||
      problem?.definition ||
      '',
    whatToCheckNext: explanationRow?.whatToCheckNextCn || '',
    firstAid:
      explanationRow?.firstAidCn ||
      problem?.userActionCn ||
      problem?.defaultAction ||
      '',
    avoid:
      explanationRow?.avoidCn ||
      problem?.userPreventionCn ||
      problem?.defaultPrevention ||
      '',
    reassurance: explanationRow?.reassuranceCn || ''
  }
}

async function resolveGovernedProblemAdvice(problemValue = '') {
  const problemKey = toInternalProblemKey(problemValue)
  if (!problemKey) {return null}

  const [problems, explanations] = await Promise.all([
    getProblemsByKeys([problemKey]),
    getExplanationsByProblemKeys([problemKey])
  ])
  const problem = problems.find(item => item.problemKey === problemKey) || null
  if (!problem) {return null}

  const explanationRow = explanations.find(item => item.problemKey === problemKey) || null
  const explanation = buildGovernedExplanation(problem, explanationRow)
  const nextSteps = explanation?.firstAid
    ? [{ stepId: 'advice_1', text: explanation.firstAid, type: explanationRow ? 'explanation' : 'problem_fallback' }]
    : []
  const whatToAvoid = explanation?.avoid ? [explanation.avoid] : []

  return {
    problemKey,
    explanation,
    nextSteps,
    whatToAvoid
  }
}

function buildProblematicAdviceGovernanceFallback(problemValue = '') {
  const problemKey = toInternalProblemKey(problemValue)
  const firstAid = '当前结果暂未匹配到已审核的处理建议。建议先保持养护条件稳定，观察问题是否扩大或重复出现，再结合人工复核结果决定具体处理。'
  const avoid = '不要在缺少已审核处理建议时直接大幅调整浇水、施肥、修剪或用药。'

  return {
    problemKey,
    explanation: {
      whyItHappens: problemKey
        ? `当前问题 ${problemKey} 缺少可用于用户端展示的已审核解释。`
        : '当前问题缺少可用于用户端展示的已审核解释。',
      whatToCheckNext: '请优先核对该结果是否已有 audited explanation 或 audited problem action 字段。',
      firstAid,
      avoid,
      reassurance: '这是治理兜底文案，用于避免把未审核旧建议当作正式处理建议展示。'
    },
    nextSteps: [
      {
        stepId: 'advice_governance_fallback',
        text: firstAid,
        type: 'governance_fallback'
      }
    ],
    whatToAvoid: [avoid]
  }
}

async function getObservedSymptomsBySession(sessionId) {
  return (await listObservedSymptomRows(sessionId)).map(row => ({
    symptomKey: row.symptom_key,
    symptomCn: row.symptom_cn || row.symptom_key,
    confidence: Number(row.confidence || 0),
    source: row.evidence_source || 'history'
  }))
}

async function getObservedEvidenceSetBySession(sessionId, openid = '') {
  return normalizePublicObservedEvidenceSet(
    await listObservedEvidenceRows(sessionId, openid)
  )
}

async function getFinalDiagnosisSnapshot(openid, sessionId) {
  try {
    const snapshotText = (await getDiagnosisSnapshotRow(openid, sessionId))?.snapshot_json
    const snapshot = safeJsonParse(snapshotText, null)
    return snapshot && typeof snapshot === 'object' ? snapshot : null
  } catch (error) {
    console.warn('读取 diagnosis_result_snapshots 失败（已降级忽略）:', error.message)
    return null
  }
}

function resolvePersistedStopReason({ explicitStopReason = '', stopState = null } = {}) {
  return normalizeStoredNullableText(explicitStopReason, '') ||
    normalizeStoredNullableText(stopState?.stopReason, '')
}

function resolveClosedStageRecord({ explicitStatus = '', stopReason = '', stopState = null } = {}) {
  const normalizedStatus = normalizeStoredNullableText(explicitStatus, '')
  const normalizedStopReason = resolvePersistedStopReason({
    explicitStopReason: stopReason,
    stopState
  })

  return {
    stage: 'final',
    status: normalizedStatus || 'closed',
    stopReason: normalizedStopReason
  }
}

function mergeRuntimeDecisionObject(persisted = null, snapshot = null) {
  if (!persisted || typeof persisted !== 'object') {
    return snapshot && typeof snapshot === 'object' ? snapshot : null
  }
  if (!snapshot || typeof snapshot !== 'object') {
    return persisted
  }
  return { ...snapshot, ...persisted }
}

function mergeRuntimeQueue(persisted = null, snapshot = null) {
  const merged = mergeRuntimeDecisionObject(persisted, snapshot)
  if (!merged || typeof merged !== 'object') {
    return null
  }

  if (
    merged.queueDecision &&
    typeof merged.queueDecision === 'object' &&
    snapshot?.queueDecision &&
    typeof snapshot.queueDecision === 'object'
  ) {
    merged.queueDecision = { ...snapshot.queueDecision, ...merged.queueDecision }
  }

  return merged
}

function asPlainObject(value = null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function normalizeOutcomeEntry(value = null) {
  return asPlainObject(value)
}

function normalizeOutcomeList(value = []) {
  return (Array.isArray(value) ? value : [])
    .map(normalizeOutcomeEntry)
    .filter(Boolean)
}

function firstPlainObject(...values) {
  return values.map(asPlainObject).find(Boolean) || null
}

function mergePlainObjects(...values) {
  const objects = values.map(asPlainObject).filter(Boolean)
  return objects.length ? Object.assign({}, ...objects) : null
}

function firstOutcomeList(...values) {
  for (const value of values) {
    const list = normalizeOutcomeList(value)
    if (list.length) {
      return list
    }
  }
  return []
}

function resolveRouteOutcomeFields({ snapshot = null, outcomePayload = null } = {}) {
  const snapshotObject = asPlainObject(snapshot) || {}
  const outcomePayloadObject = asPlainObject(outcomePayload) || {}
  const payloadFinalResult = asPlainObject(outcomePayloadObject.finalResult)
  const snapshotFinalResult = asPlainObject(snapshotObject.finalResult)
  const finalResult = mergePlainObjects(snapshotFinalResult, payloadFinalResult)
  const primaryOutcome = normalizeOutcomeEntry(firstPlainObject(
    outcomePayloadObject.primaryOutcome ||
      payloadFinalResult?.primaryOutcome,
    snapshotObject.primaryOutcome,
    snapshotFinalResult?.primaryOutcome
  ))
  const secondaryOutcomes = firstOutcomeList(
    outcomePayloadObject.secondaryOutcomes ||
      payloadFinalResult?.secondaryOutcomes,
    snapshotObject.secondaryOutcomes,
    snapshotFinalResult?.secondaryOutcomes
  )
  const visibleOutcomes = firstOutcomeList(
    outcomePayloadObject.visibleOutcomes ||
      payloadFinalResult?.visibleOutcomes,
    snapshotObject.visibleOutcomes,
    snapshotFinalResult?.visibleOutcomes
  )
  const outcomeMode = normalizeStoredNullableText(
    outcomePayloadObject.outcomeMode ||
      payloadFinalResult?.outcomeMode ||
      snapshotObject.outcomeMode ||
      snapshotFinalResult?.outcomeMode ||
      '',
    ''
  )
  const actionAdvice = firstPlainObject(
    outcomePayloadObject.actionAdvice ||
      payloadFinalResult?.actionAdvice,
    snapshotObject.actionAdvice,
    snapshotFinalResult?.actionAdvice
  )
  const routeDecisionCause = firstPlainObject(
    outcomePayloadObject.routeDecisionCause ||
      payloadFinalResult?.routeDecisionCause,
    snapshotObject.routeDecisionCause,
    snapshotFinalResult?.routeDecisionCause,
    snapshotObject.routeDecision?.decisionCause
  )

  return {
    finalResult,
    primaryOutcome,
    secondaryOutcomes,
    visibleOutcomes,
    outcomeMode,
    actionAdvice,
    routeDecisionCause
  }
}

async function getResultById(openid, { resultId = '', sessionId = '' } = {}) {
  const parsed = resultId ? fromResultId(resultId) : { sessionId: '', round: null }
  const finalSessionId = sessionId || parsed.sessionId || resultId
  if (!finalSessionId) {return null}

  const snapshot = await getFinalDiagnosisSnapshot(openid, finalSessionId)
  const persistedObservedEvidenceSet = await getObservedEvidenceSetBySession(finalSessionId, openid)
  const [persistedQuestionQueue, persistedStopStateBundle] = await Promise.all([
    getLatestQueueBySession(finalSessionId, openid),
    getLatestStopStateBySession(finalSessionId, openid)
  ])

  if (snapshot) {
    const routeOutcomeFields = resolveRouteOutcomeFields({ snapshot })
    const normalizedSnapshotOutcomeType = normalizeOutcomeType(snapshot?.outcomeType, '')
    const normalizedSnapshotRoutePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
      snapshot?.routePrimaryAction,
      ''
    )
    const observedSymptoms = Array.isArray(snapshot?.observedSymptoms) && snapshot.observedSymptoms.length
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
    const questionQueue = buildPublicQuestionQueue(
      mergeRuntimeQueue(
        persistedQuestionQueue || null,
        snapshot?.questionQueue || null
      )
    )
    const outputEligibility = mergeRuntimeDecisionObject(
      persistedStopStateBundle?.outputEligibility || null,
      snapshot?.outputEligibility || null
    )
    const diagnosticTrace = Array.isArray(snapshot?.diagnosticTrace)
      ? snapshot.diagnosticTrace
      : []
    const governedAdvice = normalizedSnapshotOutcomeType === 'problematic'
      ? await resolveGovernedProblemAdvice(
          snapshot?.finalResult?.problemId ||
            snapshot?.finalResult?.problemKey ||
            snapshot?.topProblem?.problemId ||
            snapshot?.topProblem?.problemKey ||
            ''
        )
      : null
    const effectiveGovernedAdvice = normalizedSnapshotOutcomeType === 'problematic'
      ? governedAdvice || buildProblematicAdviceGovernanceFallback(
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
      questionQueue,
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
      questionQueue,
      stopState: persistedStopState,
      outputEligibility,
      diagnosticTrace,
      coreProcess,
      finalResult: routeOutcomeFields.finalResult || null,
      primaryOutcome: routeOutcomeFields.primaryOutcome,
      secondaryOutcomes: routeOutcomeFields.secondaryOutcomes,
      visibleOutcomes: routeOutcomeFields.visibleOutcomes,
      outcomeMode: routeOutcomeFields.outcomeMode,
      actionAdvice: routeOutcomeFields.actionAdvice,
      routeDecisionCause: routeOutcomeFields.routeDecisionCause,
      explanation: effectiveGovernedAdvice?.explanation || snapshot.explanation || {},
      resultExplanation: effectiveGovernedAdvice?.explanation || snapshot.explanation || {},
      contributingFactors: Array.isArray(snapshot.contributingFactors) ? snapshot.contributingFactors : [],
      intermediateStates: Array.isArray(snapshot.intermediateStates) ? snapshot.intermediateStates : [],
      confidenceLevel: snapshot.confidenceLevel || 'normal',
      needHumanReview: Boolean(snapshot.needHumanReview),
      nextSteps:
        effectiveGovernedAdvice?.nextSteps?.length
          ? effectiveGovernedAdvice.nextSteps
          : Array.isArray(snapshot.nextSteps)
            ? snapshot.nextSteps
            : [],
      whatToAvoid:
        effectiveGovernedAdvice?.whatToAvoid?.length
          ? effectiveGovernedAdvice.whatToAvoid
          : Array.isArray(snapshot.whatToAvoid)
            ? snapshot.whatToAvoid
            : [],
      followUps: Array.isArray(snapshot.askedQuestions) ? snapshot.askedQuestions : [],
      versionMetadata: snapshot.versionMetadata || {},
      timeline: {
        createdAt: ''
      }
    }
  }

  const row = await getDiagnosisSessionResultRow(openid, finalSessionId)
  if (!row) {return null}
  const runtimeSnapshot = safeJsonParse(row.runtime_snapshot_json, {}) || {}
  const outcomePayload = safeJsonParse(row.outcome_payload_json, {}) || {}
  const routeOutcomeFields = resolveRouteOutcomeFields({ snapshot: runtimeSnapshot, outcomePayload })
  const normalizedOutcomeType = normalizeOutcomeType(row.outcome_type, '')
  const normalizedRoutePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
    row.current_route_primary_action,
    ''
  )
  const governedAdvice = normalizedOutcomeType === 'problematic'
    ? await resolveGovernedProblemAdvice(row.final_problem_key || row.top_problem_key || '')
    : null
  const effectiveGovernedAdvice = normalizedOutcomeType === 'problematic'
    ? governedAdvice || buildProblematicAdviceGovernanceFallback(row.final_problem_key || row.top_problem_key || '')
    : null
  const observedEvidenceSet = persistedObservedEvidenceSet.length
    ? persistedObservedEvidenceSet
    : normalizePublicObservedEvidenceSet(runtimeSnapshot?.observedEvidenceSet)
  const derivedEvidenceSet = normalizePublicDerivedEvidenceSet(runtimeSnapshot?.derivedEvidenceSet)
  const diagnosisDirections = normalizePublicDiagnosisDirectionSet(runtimeSnapshot?.diagnosisDirections)
  const persistedStopState = mergeRuntimeDecisionObject(
    persistedStopStateBundle?.stopState || null,
    runtimeSnapshot?.stopState || null
  )
  const closedStageRecord = resolveClosedStageRecord({
    explicitStatus: 'closed',
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
  const questionQueue = buildPublicQuestionQueue(
    mergeRuntimeQueue(
      persistedQuestionQueue || null,
      runtimeSnapshot?.questionQueue || null
    )
  )
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
    questionQueue,
    stopReason: closedStageRecord.stopReason,
    stopState: persistedStopState,
    outputEligibility,
    diagnosticTrace
  })

  const fallbackFinalResult = {
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
    severity:
      ['uncertain', 'non_problematic'].includes(normalizedOutcomeType)
        ? 'low'
        : 'medium',
    urgency:
      normalizedOutcomeType === 'non_problematic'
        ? 'low'
        : 'medium'
  }
  const finalResult = routeOutcomeFields.finalResult || fallbackFinalResult

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
            outcomePayload?.nonProblematicType ||
              runtimeSnapshot?.nonProblematicType ||
              '',
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
    identityResolutionStatus: normalizeStoredNullableText(row.current_identity_resolution_status, ''),
    visualBatchTrace: runtimeSnapshot?.visualBatchTrace || null,
    visualAggregateSummary,
    shadowCompareSummary,
    questionQueue,
    stopState: persistedStopState,
    outputEligibility,
    diagnosticTrace,
    coreProcess,
    finalResult,
    primaryOutcome: routeOutcomeFields.primaryOutcome,
    secondaryOutcomes: routeOutcomeFields.secondaryOutcomes,
    visibleOutcomes: routeOutcomeFields.visibleOutcomes,
    outcomeMode: routeOutcomeFields.outcomeMode,
    actionAdvice: routeOutcomeFields.actionAdvice,
    routeDecisionCause:
      routeOutcomeFields.routeDecisionCause ||
      asPlainObject(runtimeSnapshot?.routeDecision?.decisionCause),
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
  mergeRuntimeQueue,
  getResultById,
  _test: {
    asPlainObject,
    normalizeOutcomeEntry,
    normalizeOutcomeList,
    firstPlainObject,
    mergePlainObjects,
    firstOutcomeList,
    resolveRouteOutcomeFields
  }
}
