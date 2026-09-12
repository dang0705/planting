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
  getDiagnosisSessionResultRow
} = require('../repositories/diagnosis-session-read-repository')
const {
  getProblemsByKeys,
  getExplanationsByProblemKeys
} = require('../repositories/problem-repository')
const { getLatestStopStateBySession } = require('../repositories/stop-state-repository')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const { safeJsonParse, normalizeStoredNullableText } = require('../utils/stored-value')
const {
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
} = require('../utils/diagnosis-contract')
const { normalizePublicObservedEvidenceSet } = require('./session-runtime-snapshot-codec')
const { normalizePublicDerivedEvidenceSet } = require('../utils/derived-evidence')
const { normalizePublicDiagnosisDirectionSet } = require('../utils/diagnosis-directions')
const { buildPublicCoreProcess } = require('../utils/public-core-process')
const { assertRetakeAuthorizationActive } = require('../domain/diagnosis-mode-router')
const { upsertDiagnosisSession } = require('./session-state-write-service')

function toPublicProblemId(problemValue = '') {
  const value = String(problemValue || '').trim()
  if (!value) {
    return ''
  }
  if (value.startsWith('p_')) {
    return value
  }
  return toProblemId(value)
}

function toInternalProblemKey(problemValue = '') {
  const value = normalizeStoredNullableText(problemValue, '')
  if (!value) {
    return ''
  }
  return fromProblemId(value) || value
}

function resolveReadStageRecord({
  routePrimaryAction = '',
  sessionStatus = '',
  stopReason = '',
  stopState = null
} = {}) {
  const normalizedStatus = String(sessionStatus || '').trim()
  const normalizedAction = normalizeDiagnosisRoutePrimaryAction(routePrimaryAction, '')
  const normalizedStopReason = String(stopReason || '').trim()
  if (normalizedStatus === 'completed' || normalizedStopReason === 'ended_retake_timeout') {
    return resolveClosedStageRecord({
      explicitStatus: 'closed',
      stopReason: normalizedStopReason,
      stopState
    })
  }
  if (
    ['awaiting_retake', 'awaiting_follow_up'].includes(normalizedStatus) ||
    ['choose_direction', 'request_followup_capture', 'question_package'].includes(normalizedAction)
  ) {
    return {
      stage: normalizedAction === 'question_package' ? 'question' : 'intermediate',
      status: 'active',
      stopReason: ''
    }
  }
  return resolveClosedStageRecord({
    explicitStatus: 'closed',
    stopReason,
    stopState
  })
}

async function expireRuntimeRetakeSnapshotIfNeeded({
  openid = '',
  row = {},
  runtimeSnapshot = {},
  now = Date.now()
} = {}) {
  const state = runtimeSnapshot?.retakeAuthorizationState
  if (!state || state.status !== 'active') {
    return runtimeSnapshot
  }
  try {
    assertRetakeAuthorizationActive(state, now)
    return runtimeSnapshot
  } catch (error) {
    if (error?.code !== 'RETAKE_WINDOW_EXPIRED') {
      return runtimeSnapshot
    }
    const expiredState = { ...state, status: 'ended_retake_timeout', serverNow: now }
    const response = {
      diagnosisSessionId: row.diagnosis_id,
      roundId: runtimeSnapshot.roundId || row.current_round_id || 'round_1',
      plantContext: runtimeSnapshot.plantContext || {},
      routePrimaryAction: 'request_followup_capture',
      questionRequired: false,
      questions: [],
      outcomeType: 'uncertain',
      sessionStatus: 'completed',
      stopReason: 'ended_retake_timeout',
      visualBatchTrace: runtimeSnapshot.visualBatchTrace || null,
      visualAggregateSummary: runtimeSnapshot.visualAggregateSummary || null,
      observedEvidenceSet: runtimeSnapshot.observedEvidenceSet || [],
      retakeAuthorizationState: expiredState,
      retakeRequest: runtimeSnapshot.retakeRequest || null,
      finalResult: {
        resultId: `${row.diagnosis_id || 'diagnosis'}_retake_timeout`,
        summary: '补拍时间已过，本次诊断已结束。请重新开始诊断。',
        outcomeType: 'uncertain',
        visibleOutcomes: []
      },
      visibleOutcomes: []
    }
    await upsertDiagnosisSession({
      sessionId: row.diagnosis_id,
      openid,
      plantContext: response.plantContext,
      response,
      round: Number(row.current_round_index || 1),
      reliabilityScore: 0,
      mode: 'new_v13',
      image: '',
      description: '',
      clientContext: runtimeSnapshot.clientContext || null
    })
    return {
      ...runtimeSnapshot,
      sessionStatus: 'completed',
      stopReason: 'ended_retake_timeout',
      retakeAuthorizationState: expiredState
    }
  }
}

function buildGovernedExplanation(problem = null, explanationRow = null) {
  if (!problem) {
    return null
  }

  return {
    whyItHappens:
      explanationRow?.whyItHappensCn || problem?.userDefinitionCn || problem?.definition || '',
    whatToCheckNext: explanationRow?.whatToCheckNextCn || '',
    firstAid: explanationRow?.firstAidCn || problem?.userActionCn || problem?.defaultAction || '',
    avoid: explanationRow?.avoidCn || problem?.userPreventionCn || problem?.defaultPrevention || '',
    reassurance: explanationRow?.reassuranceCn || ''
  }
}

async function resolveGovernedProblemAdvice(problemValue = '') {
  const problemKey = toInternalProblemKey(problemValue)
  if (!problemKey) {
    return null
  }

  const [problems, explanations] = await Promise.all([
    getProblemsByKeys([problemKey]),
    getExplanationsByProblemKeys([problemKey])
  ])
  const problem = problems.find(item => item.problemKey === problemKey) || null
  if (!problem) {
    return null
  }

  const explanationRow = explanations.find(item => item.problemKey === problemKey) || null
  const explanation = buildGovernedExplanation(problem, explanationRow)
  const nextSteps = explanation?.firstAid
    ? [
        {
          stepId: 'advice_1',
          text: explanation.firstAid,
          type: explanationRow ? 'explanation' : 'problem_conservative'
        }
      ]
    : []
  const whatToAvoid = explanation?.avoid ? [explanation.avoid] : []

  return {
    problemKey,
    explanation,
    nextSteps,
    whatToAvoid
  }
}

function buildProblematicAdviceGovernanceConservative(problemValue = '') {
  const problemKey = toInternalProblemKey(problemValue)
  const firstAid =
    '当前结果暂未匹配到已审核的处理建议。建议先保持养护条件稳定，观察问题是否扩大或重复出现，再结合人工复核结果决定具体处理。'
  const avoid = '不要在缺少已审核处理建议时直接大幅调整浇水、施肥、修剪或用药。'

  return {
    problemKey,
    explanation: {
      whyItHappens: problemKey
        ? `当前问题 ${problemKey} 缺少可用于用户端展示的已审核解释。`
        : '当前问题缺少可用于用户端展示的已审核解释。',
      whatToCheckNext:
        '请优先核对该结果是否已有 audited explanation 或 audited problem action 字段。',
      firstAid,
      avoid,
      reassurance: '这是治理保护文案，用于避免把未审核既有建议当作正式处理建议展示。'
    },
    nextSteps: [
      {
        stepId: 'advice_governance_conservative',
        text: firstAid,
        type: 'governance_conservative'
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
  return normalizePublicObservedEvidenceSet(await listObservedEvidenceRows(sessionId, openid))
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
  return (
    normalizeStoredNullableText(explicitStopReason, '') ||
    normalizeStoredNullableText(stopState?.stopReason, '')
  )
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

function asPlainObject(value = null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function normalizeOutcomeEntry(value = null) {
  return asPlainObject(value)
}

function normalizeOutcomeList(value = []) {
  return (Array.isArray(value) ? value : []).map(normalizeOutcomeEntry).filter(Boolean)
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

function resolveOutcomeIdentityKey(outcome = null, index = 0) {
  const safeOutcome = asPlainObject(outcome)
  if (!safeOutcome) {
    return `outcome_${index}`
  }
  return normalizeStoredNullableText(
    safeOutcome.outcomeKey || safeOutcome.problemKey || safeOutcome.problemId || '',
    `outcome_${index}`
  )
}

function isUncertainOutcome(outcome = null) {
  const safeOutcome = asPlainObject(outcome)
  if (!safeOutcome) {
    return false
  }
  const outcomeKey = normalizeStoredNullableText(
    safeOutcome.outcomeKey || safeOutcome.problemKey || '',
    ''
  )
  const outcomeType = normalizeStoredNullableText(safeOutcome.outcomeType || '', '')
  return outcomeType === 'uncertain' || outcomeKey === 'uncertain_observation'
}

function suppressUncertainWhenConcreteOutcomeExists(outcomes = []) {
  const safeOutcomes = (Array.isArray(outcomes) ? outcomes : []).filter(asPlainObject)
  const hasConcreteOutcome = safeOutcomes.some(outcome => !isUncertainOutcome(outcome))
  return hasConcreteOutcome
    ? safeOutcomes.filter(outcome => !isUncertainOutcome(outcome))
    : safeOutcomes
}

function mergeVisibleOutcomeEntries({
  visibleOutcomes = [],
  primaryOutcomeEntry = null,
  secondaryOutcomeEntries = []
} = {}) {
  const merged = []
  const seen = new Set()
  for (const outcome of [
    ...normalizeOutcomeList(visibleOutcomes),
    ...[normalizeOutcomeEntry(primaryOutcomeEntry)].filter(Boolean),
    ...normalizeOutcomeList(secondaryOutcomeEntries)
  ]) {
    const identityKey = resolveOutcomeIdentityKey(outcome, merged.length)
    if (seen.has(identityKey)) {
      continue
    }
    seen.add(identityKey)
    merged.push(outcome)
  }
  return suppressUncertainWhenConcreteOutcomeExists(merged)
}

function normalizeRouteOutcomeMode(value = '', visibleOutcomes = []) {
  const normalized = normalizeStoredNullableText(value, '')
  if (['primary_with_secondary', 'primary_only'].includes(normalized)) {
    return Array.isArray(visibleOutcomes) && visibleOutcomes.length ? 'visible_outcomes' : ''
  }
  return normalized
}

function buildPublicRouteFinalResult(
  finalResult = null,
  { visibleOutcomes = [], outcomeMode = '', actionAdvice = null } = {}
) {
  const safeFinalResult = asPlainObject(finalResult)
  if (!safeFinalResult) {
    return null
  }

  const publicFinalResult = { ...safeFinalResult }
  delete publicFinalResult.primaryOutcome
  delete publicFinalResult.secondaryOutcomes
  publicFinalResult.visibleOutcomes = mergeVisibleOutcomeEntries({
    visibleOutcomes: publicFinalResult.visibleOutcomes || visibleOutcomes,
    primaryOutcomeEntry: safeFinalResult.primaryOutcome,
    secondaryOutcomeEntries: safeFinalResult.secondaryOutcomes
  })
  publicFinalResult.outcomeMode = normalizeRouteOutcomeMode(
    publicFinalResult.outcomeMode || outcomeMode || '',
    publicFinalResult.visibleOutcomes
  )
  publicFinalResult.actionAdvice = firstPlainObject(publicFinalResult.actionAdvice, actionAdvice)
  return publicFinalResult
}

function resolveRouteOutcomeFields({ snapshot = null, outcomePayload = null } = {}) {
  const snapshotObject = asPlainObject(snapshot) || {}
  const outcomePayloadObject = asPlainObject(outcomePayload) || {}
  const payloadFinalResult = asPlainObject(outcomePayloadObject.finalResult)
  const snapshotFinalResult = asPlainObject(snapshotObject.finalResult)
  const finalResult = mergePlainObjects(snapshotFinalResult, payloadFinalResult)
  const primaryOutcomeEntry = normalizeOutcomeEntry(
    firstPlainObject(
      outcomePayloadObject.primaryOutcome || payloadFinalResult?.primaryOutcome,
      snapshotObject.primaryOutcome,
      snapshotFinalResult?.primaryOutcome
    )
  )
  const secondaryOutcomeEntries = firstOutcomeList(
    outcomePayloadObject.secondaryOutcomes || payloadFinalResult?.secondaryOutcomes,
    snapshotObject.secondaryOutcomes,
    snapshotFinalResult?.secondaryOutcomes
  )
  const rawVisibleOutcomes = firstOutcomeList(
    outcomePayloadObject.visibleOutcomes || payloadFinalResult?.visibleOutcomes,
    snapshotObject.visibleOutcomes,
    snapshotFinalResult?.visibleOutcomes
  )
  const visibleOutcomes = mergeVisibleOutcomeEntries({
    visibleOutcomes: rawVisibleOutcomes,
    primaryOutcomeEntry,
    secondaryOutcomeEntries
  })
  const rawOutcomeMode = normalizeStoredNullableText(
    outcomePayloadObject.outcomeMode ||
      payloadFinalResult?.outcomeMode ||
      snapshotObject.outcomeMode ||
      snapshotFinalResult?.outcomeMode ||
      '',
    ''
  )
  const outcomeMode = normalizeRouteOutcomeMode(rawOutcomeMode, visibleOutcomes)
  const actionAdvice = firstPlainObject(
    outcomePayloadObject.actionAdvice || payloadFinalResult?.actionAdvice,
    snapshotObject.actionAdvice,
    snapshotFinalResult?.actionAdvice
  )
  const routeDecisionCause = firstPlainObject(
    outcomePayloadObject.routeDecisionCause || payloadFinalResult?.routeDecisionCause,
    snapshotObject.routeDecisionCause,
    snapshotFinalResult?.routeDecisionCause,
    snapshotObject.routeDecision?.decisionCause
  )

  return {
    finalResult: buildPublicRouteFinalResult(finalResult, {
      visibleOutcomes,
      outcomeMode,
      actionAdvice
    }),
    visibleOutcomes,
    outcomeMode,
    actionAdvice,
    routeDecisionCause
  }
}

module.exports = {
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
}
