'use strict'

const {
  fromProblemId,
  toResultId
} = require('../mappers/public-id-mapper')
const {
  getDiagnosisSessionStateRow,
  listDiagnosisSessionHistoryRows,
  countDiagnosisSessionHistoryRows
} = require('../repositories/diagnosis-session-read-repository')
const {
  getVisualAggregateResultByBatchId
} = require('../repositories/visual-aggregate-repository')
const { getProblemsByKeys } = require('../repositories/problem-repository')
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
  getObservedSymptomsBySession,
  getObservedEvidenceSetBySession,
  getFinalDiagnosisSnapshot,
  mergeRuntimeDecisionObject,
  mergeRuntimeQueue,
  toPublicProblemId,
  getResultById
} = require('./session-result-read-service')

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

module.exports = {
  getSessionState,
  getObservedSymptomsBySession,
  getObservedEvidenceSetBySession,
  getFinalDiagnosisSnapshot,
  listDiagnosisHistory,
  getResultById
}
