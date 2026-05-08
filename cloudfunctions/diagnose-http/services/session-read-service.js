'use strict'

const {
  fromProblemId,
  fromResultId,
  toResultId,
  toProblemId
} = require('../mappers/public-id-mapper')
const {
  listObservedSymptomRows,
  listObservedEvidenceRows,
  getDiagnosisSnapshotRow,
  getDiagnosisSessionStateRow,
  listDiagnosisSessionHistoryRows,
  countDiagnosisSessionHistoryRows,
  getDiagnosisSessionResultRow
} = require('../repositories/diagnosis-session-read-repository')
const {
  getVisualAggregateResultByBatchId
} = require('../repositories/visual-aggregate-repository')
const { getProblemsByKeys, getExplanationsByProblemKeys } = require('../repositories/problem-repository')
const { getLatestQueueBySession } = require('../repositories/question-queue-repository')
const { listFollowUpRows } = require('../repositories/session-follow-up-repository')
const { getLatestStopStateBySession } = require('../repositories/stop-state-repository')
const {
  readQuestionGroupKeyFromRationale,
  readQuestionKeyFromRationale,
  readRoundFromRationale
} = require('./session-follow-up-service')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const {
  safeJsonParse,
  normalizeStoredNullableText
} = require('../utils/stored-value')
const {
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
} = require('../utils/diagnosis-contract')
const {
  mapSeverityHintToLevel
} = require('./session-service-helpers')
const {
  normalizePublicObservedEvidenceSet,
  normalizePublicSymptomClassRuntime
} = require('./session-runtime-snapshot-codec')
const {
  normalizePublicDerivedEvidenceSet
} = require('../utils/derived-evidence')
const {
  normalizePublicDiagnosisDirectionSet
} = require('../utils/diagnosis-directions')
const {
  buildPublicCoreProcess
} = require('../utils/public-core-process')
const {
  buildPublicQuestionQueue
} = require('../presenters/diagnosis-round-presenter')

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
  return {
    ...snapshot,
    ...persisted
  }
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
    merged.queueDecision = {
      ...snapshot.queueDecision,
      ...merged.queueDecision
    }
  }

  return merged
}

async function getSessionState(openid, sessionId) {
  const session = await getDiagnosisSessionStateRow(openid, sessionId)
  if (!session) {return null}
  const runtimeSnapshot = safeJsonParse(session.runtime_snapshot_json, {}) || {}
  const latestVisualCallBatchId = resolveLatestVisualCallBatchId(
    session.latest_visual_call_batch_id,
    runtimeSnapshot
  )
  const hasSnapshotQuestionQueue =
    runtimeSnapshot && Number(runtimeSnapshot?.questionQueue?.roundIndex || 0) > 0
  const hasSnapshotStopState = Boolean(
    runtimeSnapshot && (runtimeSnapshot?.stopState || runtimeSnapshot?.outputEligibility)
  )
  const snapshotObservedEvidenceSet = normalizePublicObservedEvidenceSet(runtimeSnapshot?.observedEvidenceSet || [])
  const snapshotHasObservedEvidenceSet = Array.isArray(runtimeSnapshot?.observedEvidenceSet)
  const snapshotVisualAggregateSummary = runtimeSnapshot?.visualAggregateSummary || null
  const shouldLoadObservedEvidenceSet = !snapshotHasObservedEvidenceSet
  const shouldLoadVisualAggregateResult = !snapshotVisualAggregateSummary && Boolean(
    latestVisualCallBatchId
  )
  const [
    persistedQuestionQueue,
    persistedStopStateBundle,
    followUpRows,
    persistedObservedEvidenceSet,
    persistedVisualAggregateResult
  ] = await Promise.all([
    hasSnapshotQuestionQueue ? Promise.resolve(null) : getLatestQueueBySession(sessionId, openid),
    hasSnapshotStopState ? Promise.resolve(null) : getLatestStopStateBySession(sessionId, openid),
    listFollowUpRows(sessionId),
    shouldLoadObservedEvidenceSet
      ? getObservedEvidenceSetBySession(sessionId, openid)
      : Promise.resolve(snapshotObservedEvidenceSet),
    shouldLoadVisualAggregateResult
      ? getVisualAggregateResultByBatchId(latestVisualCallBatchId)
      : Promise.resolve(snapshotVisualAggregateSummary)
  ])
  const mergedQuestionQueue = mergeRuntimeQueue(
    persistedQuestionQueue,
    runtimeSnapshot?.questionQueue || null
  )
  const mergedStopState = mergeRuntimeDecisionObject(
    persistedStopStateBundle?.stopState || null,
    runtimeSnapshot?.stopState || null
  )
  const mergedOutputEligibility = mergeRuntimeDecisionObject(
    persistedStopStateBundle?.outputEligibility || null,
    runtimeSnapshot?.outputEligibility || null
  )

  const askedQuestionKeys = []
  const answeredQuestionGroupKeys = []
  const answeredAnswerMap = new Map()
  const unknownStreakByGroup = {}
  let maxRound = 1

  for (const row of followUpRows) {
    const questionKey = readQuestionKeyFromRationale(row.rationale) || String(row.symptom_key || '').trim()
    const groupKey = readQuestionGroupKeyFromRationale(row.rationale)
    if (Number(row.asked || 0) === 1 && questionKey) {
      askedQuestionKeys.push(questionKey)
    }
    const round = readRoundFromRationale(row.rationale)
    if (round > maxRound) {maxRound = round}

    const answered = Number(row.asked || 0) === 1
    if (!answered) {continue}

    const answerValue = String(row.answer_value || '').trim().toLowerCase()
    if (questionKey && answerValue) {
      answeredAnswerMap.set(questionKey, {
        questionKey,
        optionKey: answerValue
      })
    }

    if (groupKey && groupKey !== '__default__') {
      answeredQuestionGroupKeys.push(groupKey)
    }

    if (String(row.status || '').toLowerCase() === 'skipped') {
      unknownStreakByGroup[groupKey] = Number(unknownStreakByGroup[groupKey] || 0) + 1
    } else {
      unknownStreakByGroup[groupKey] = 0
    }
  }

  return {
    sessionId,
    userPlantId: session.user_plant_id || null,
    plantId: normalizeStoredNullableText(session.plant_id, null),
    plantContext: {
      userPlantId: session.user_plant_id || null,
      plantId: normalizeStoredNullableText(session.plant_id, null),
      plantIdentityId: normalizeStoredNullableText(session.current_plant_identity_id, ''),
      identityResolutionStatus: normalizeStoredNullableText(session.current_identity_resolution_status, ''),
      latestVisualCallBatchId,
      genus: session.plant_genus || '',
      family: session.plant_family || '',
      category: session.plant_category || '',
      watering: runtimeSnapshot?.plantContext?.watering || null,
      fertilization: runtimeSnapshot?.plantContext?.fertilization || null,
      sunning: runtimeSnapshot?.plantContext?.sunning || null,
      ventilation: runtimeSnapshot?.plantContext?.ventilation || null,
      careAuditStatus: runtimeSnapshot?.plantContext?.careAuditStatus || '',
      varianceLevel: runtimeSnapshot?.plantContext?.varianceLevel || ''
    },
    runtimeSnapshot,
    visualBatchTrace: runtimeSnapshot?.visualBatchTrace || null,
    visualAggregateSummary: runtimeSnapshot?.visualAggregateSummary || null,
    visualAggregateResult: persistedVisualAggregateResult || null,
    shadowCompareSummary:
      runtimeSnapshot?.shadowCompareSummary ||
      runtimeSnapshot?.visualAggregateSummary?.shadowCompareSummary ||
      null,
    questionQueue: mergedQuestionQueue,
    stopState: mergedStopState,
    outputEligibility: mergedOutputEligibility,
    diagnosticTrace: Array.isArray(runtimeSnapshot?.diagnosticTrace)
      ? runtimeSnapshot.diagnosticTrace
      : [],
    observedEvidenceSet: persistedObservedEvidenceSet,
    derivedEvidenceSet: normalizePublicDerivedEvidenceSet(runtimeSnapshot?.derivedEvidenceSet),
    diagnosisDirections: normalizePublicDiagnosisDirectionSet(runtimeSnapshot?.diagnosisDirections),
    symptomClassRuntime: normalizePublicSymptomClassRuntime(runtimeSnapshot?.symptomClassRuntime),
    careBaselineSummary: runtimeSnapshot?.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(runtimeSnapshot?.environmentDeviationHints)
      ? runtimeSnapshot.environmentDeviationHints
      : [],
    plantIdentityId: normalizeStoredNullableText(session.current_plant_identity_id, ''),
    identityResolutionStatus: normalizeStoredNullableText(session.current_identity_resolution_status, ''),
    routePrimaryAction: normalizeDiagnosisRoutePrimaryAction(
      session.current_route_primary_action,
      ''
    ),
    currentRoundId: normalizeStoredNullableText(session.current_round_id, ''),
    currentRoundIndex: Number(session.current_round_index || 0),
    latestVisualCallBatchId,
    followUpRows,
    outcomeType: normalizeOutcomeType(session.outcome_type, ''),
    sessionStatus: normalizeStoredNullableText(session.session_status, ''),
    askedQuestionKeys: Array.from(new Set(askedQuestionKeys)),
    answeredAnswers: Array.from(answeredAnswerMap.values()),
    answeredQuestionGroupKeys: Array.from(new Set(answeredQuestionGroupKeys)),
    unknownCountByGroup: unknownStreakByGroup,
    primaryClassKey: normalizeStoredNullableText(
      runtimeSnapshot?.symptomClassRuntime?.primaryClass?.classKey,
      ''
    ),
    secondaryClassKeys: Array.isArray(runtimeSnapshot?.symptomClassRuntime?.secondaryClasses)
      ? runtimeSnapshot.symptomClassRuntime.secondaryClasses
        .map(item => normalizeStoredNullableText(item?.classKey, ''))
        .filter(Boolean)
      : [],
    currentClassKey: normalizeStoredNullableText(runtimeSnapshot?.symptomClassRuntime?.currentClassKey, ''),
    currentGroupKey: normalizeStoredNullableText(runtimeSnapshot?.symptomClassRuntime?.currentGroupKey, ''),
    classScores: Array.isArray(runtimeSnapshot?.symptomClassRuntime?.classScores)
      ? runtimeSnapshot.symptomClassRuntime.classScores
      : [],
    classSwitchHistory: Array.isArray(runtimeSnapshot?.symptomClassRuntime?.classSwitchHistory)
      ? runtimeSnapshot.symptomClassRuntime.classSwitchHistory
      : [],
    nextRound: Math.max(maxRound + 1, Number(session.follow_up_round || 1) + 1),
    hasPendingFollowUp: Number(session.needs_follow_up || 0) === 1
  }
}

async function listDiagnosisHistory(openid, { userPlantId = null, plantId = null, page = 1, pageSize = 20 } = {}) {
  const limit = Math.max(1, Number(pageSize || 20))
  const currentPage = Math.max(1, Number(page || 1))
  const offset = (currentPage - 1) * limit
  const resolvedUserPlantId = userPlantId || plantId || null
  const [rows, total] = await Promise.all([
    listDiagnosisSessionHistoryRows(openid, {
      userPlantId: resolvedUserPlantId,
      limit,
      offset
    }),
    countDiagnosisSessionHistoryRows(openid, {
      userPlantId: resolvedUserPlantId
    })
  ])
  const problemKeys = Array.from(
    new Set(
      rows
        .map(row => fromProblemId(normalizeStoredNullableText(row.top_problem_key, '')))
        .filter(Boolean)
    )
  )
  const problems = await getProblemsByKeys(problemKeys)
  const problemMap = new Map(problems.map(item => [item.problemKey, item]))

  const items = rows.map(row => {
    const normalizedPlantCatalogId = normalizeStoredNullableText(row.plant_id, null)
    const normalizedPlantIdentityId = normalizeStoredNullableText(row.current_plant_identity_id, '')
    const normalizedBatchId = normalizeStoredNullableText(row.latest_visual_call_batch_id, null)
    const normalizedOutcomeType = normalizeOutcomeType(row.outcome_type, '')
    const outcomePayload = safeJsonParse(row.outcome_payload_json, {}) || {}
    const normalizedFinalProblemCn = normalizeStoredNullableText(row.final_problem_cn, null)
    const normalizedTopProblemKey = normalizeStoredNullableText(row.top_problem_key, null)
    const internalProblemKey = fromProblemId(normalizedTopProblemKey || '')
    const problemMeta = internalProblemKey ? problemMap.get(internalProblemKey) : null
    const normalizedProblemDisplayName = normalizeStoredNullableText(problemMeta?.displayNameCn, null)
    const normalizedSeverityHint = mapSeverityHintToLevel(problemMeta?.severityHintCn)
    const historyRound = Math.max(
      1,
      Number(row.current_round_index || 0),
      Number(row.follow_up_round || 0)
    )

    return {
      historyId: row.diagnosis_id,
      resultId: toResultId(row.diagnosis_id, historyRound),
      plantId: row.user_plant_id || normalizedPlantCatalogId || null,
      userPlantId: row.user_plant_id || null,
      plantCatalogId: normalizedPlantCatalogId,
      plantIdentityId: normalizedPlantIdentityId,
      latestVisualCallBatchId: normalizedBatchId,
      outcomeType: normalizedOutcomeType,
      nonProblematicType:
        normalizedOutcomeType === 'non_problematic'
          ? normalizeStoredNullableText(outcomePayload?.nonProblematicType, '')
          : '',
      nonProblematicLabel:
        normalizedOutcomeType === 'non_problematic'
          ? normalizeStoredNullableText(outcomePayload?.nonProblematicLabel, '')
          : '',
      createdAt: row.created_at,
      summary: {
        problemId:
          normalizedOutcomeType === 'problematic'
            ? toPublicProblemId(normalizedTopProblemKey)
            : '',
        displayName:
          normalizedOutcomeType === 'problematic'
            ? (normalizedFinalProblemCn || normalizedProblemDisplayName || normalizedTopProblemKey || '待确认')
            : normalizedOutcomeType === 'non_problematic'
              ? '暂未见明显问题'
              : normalizedOutcomeType === 'uncertain'
                ? '暂不能稳定判断'
                : '待确认',
        severity:
          !normalizedOutcomeType
            ? 'low'
            : normalizedOutcomeType === 'uncertain'
              ? 'low'
              : normalizedOutcomeType === 'non_problematic'
                ? 'low'
                : normalizedSeverityHint === 'high'
                  ? 'high'
                  : row.health_status === 'danger'
                    ? 'high'
                    : normalizedSeverityHint || 'medium'
      }
    }
  })

  return {
    items,
    page: currentPage,
    pageSize: limit,
    hasMore: offset + items.length < total
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
      finalResult: snapshot.finalResult || null,
      explanation: effectiveGovernedAdvice?.explanation || snapshot.explanation || {},
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
  const observedEvidenceSet =
    persistedObservedEvidenceSet.length
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
    finalResult: {
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
    },
    explanation: {
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
  getSessionState,
  getObservedSymptomsBySession,
  getObservedEvidenceSetBySession,
  getFinalDiagnosisSnapshot,
  listDiagnosisHistory,
  getResultById
}
