'use strict'

const {
  DIAGNOSIS_MODE_REGISTRY,
  PEST_CATEGORY,
  PEST_EVIDENCE_RULES,
  PEST_MODE_KEYS
} = require('../domain/diagnosis-mode-registry')
const { evidenceGroupForKey } = require('../domain/diagnosis-mode-router')
const {
  buildSpecificPestQuestionPackage,
  buildSpecificPestObservedEvidenceSet,
  PEST_MODE_LABELS
} = require('./pest-question-package')
const { routeEvidenceLedger, routeFromAggregate } = require('./pest-visual-orchestrator')
const { resolveSpecificPestAnswerResult } = require('./specific-pest-answer-resolver')
const { normalizeCaptureRegion } = require('../utils/capture-region-normalizer')

function getDiagnosisEngine() {
  return require('../domain/diagnosis-engine')
}

function getBuildStaticQuestionPackageStartRoundResult() {
  return require('./static-question-package-start').buildStaticQuestionPackageStartRoundResult
}

const STATIC_MODE_OPTIONS = Object.freeze({
  yellow_leaf: Object.freeze({
    classKey: 'yellowing_mode',
    modeKey: 'yellow_leaf',
    classNameCn: '黄叶模式',
    symptomKey: 'uniform_yellowing',
    symptomCn: '整叶黄化'
  }),
  wilting_droop: Object.freeze({
    classKey: 'wilting_droop_mode',
    modeKey: 'wilting_droop',
    classNameCn: '枯萎 / 发蔫模式',
    symptomKey: 'wilting_droop',
    symptomCn: '枯萎 / 发蔫'
  })
})
const SINGLE_SELECTED_MODE_COUNT = 1

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function normalizeDirectionChoiceMode(payload = {}) {
  const choice = payload?.directionChoice || payload?.direction_choice || {}
  return normalizeText(
    payload.selectedModeKey ||
      payload.selected_mode_key ||
      payload.modeKey ||
      payload.mode_key ||
      choice.modeKey ||
      choice.mode_key ||
      choice.problemKey ||
      choice.problem_key ||
      ''
  )
}

function selectedDirectionKey(payload = {}) {
  return normalizeDirectionChoiceMode(payload)
}

function isDirectionChoicePayload({ requestMode = '', payload = {} } = {}) {
  return (
    normalizeText(requestMode) === 'direction_choice' ||
    Boolean(normalizeDirectionChoiceMode(payload))
  )
}

function directionChoicesFromRoute(routeResult = {}) {
  return Array.isArray(routeResult?.directionChoices) ? routeResult.directionChoices : []
}

function directionChoicesFromState(...states) {
  const merged = []
  const seen = new Set()
  for (const state of states) {
    const choices = Array.isArray(state?.directionChoices) ? state.directionChoices : []
    for (const choice of choices) {
      const key = normalizeText(choice?.modeKey || choice?.directionKey || choice?.problemKey || '')
      if (!key || seen.has(key)) {
        continue
      }
      seen.add(key)
      merged.push(choice)
    }
  }
  return merged
}

function findDirectionChoice(routeResult = {}, selectedKey = '') {
  return directionChoicesFromRoute(routeResult).find(
    item =>
      normalizeText(item?.modeKey || '') === selectedKey ||
      normalizeText(item?.directionKey || '') === selectedKey
  )
}

function findDirectionChoiceInList(choices = [], selectedKey = '') {
  return (Array.isArray(choices) ? choices : []).find(
    item =>
      normalizeText(item?.modeKey || '') === selectedKey ||
      normalizeText(item?.directionKey || '') === selectedKey
  )
}

function assertAllowedDirectionChoice(routeResult = {}, selectedKey = '', fallbackChoices = []) {
  const choices = directionChoicesFromRoute(routeResult)
  if (
    !findDirectionChoice(routeResult, selectedKey) &&
    !findDirectionChoiceInList(fallbackChoices, selectedKey)
  ) {
    throw Object.assign(new Error('所选诊断方向不属于当前会话'), { statusCode: 400 })
  }
  return choices
}

function normalizePestModeKeys(items = []) {
  return Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map(item => normalizeText(item))
        .filter(modeKey => PEST_MODE_KEYS.includes(modeKey))
    )
  )
}

function normalizeKey(value = '', conservative = '') {
  return normalizeText(value, conservative).toLowerCase()
}

function readArray(source = {}, snakeKey = '', camelKey = '') {
  if (Array.isArray(source?.[snakeKey])) {
    return source[snakeKey]
  }
  if (Array.isArray(source?.[camelKey])) {
    return source[camelKey]
  }
  return []
}

function mergeAggregateSources(...sources) {
  const merged = {}
  for (const source of sources) {
    if (source && typeof source === 'object') {
      Object.assign(merged, source)
    }
  }
  return Object.keys(merged).length ? merged : null
}

function resolveAggregateForDirectionChoice(refreshedSessionState = {}, sessionState = {}) {
  return mergeAggregateSources(
    refreshedSessionState.visualAggregateResult,
    sessionState.visualAggregateResult,
    refreshedSessionState.visualAggregateSummary,
    sessionState.visualAggregateSummary,
    refreshedSessionState.runtimeSnapshot?.visualAggregateResult,
    sessionState.runtimeSnapshot?.visualAggregateResult,
    refreshedSessionState.runtimeSnapshot?.visualAggregateSummary,
    sessionState.runtimeSnapshot?.visualAggregateSummary
  )
}

function candidateMapFromAggregate(aggregateResult = null) {
  const candidates = readArray(
    aggregateResult,
    'aggregated_symptom_candidates',
    'aggregatedSymptomCandidates'
  )
  return new Map(
    candidates
      .map(candidate => [
        normalizeKey(candidate?.symptom_key || candidate?.symptomKey || ''),
        candidate
      ])
      .filter(([key]) => key)
  )
}

function evidenceMatchesRuleGroup(group = [], evidenceKey = '') {
  const key = normalizeKey(evidenceKey)
  return Array.isArray(group) && group.map(normalizeKey).includes(key)
}

function pestModesForEvidenceKey(evidenceKey = '', selectedModeKeys = []) {
  const selectedSet = new Set(normalizePestModeKeys(selectedModeKeys))
  const matched = []
  for (const modeKey of PEST_MODE_KEYS) {
    if (selectedSet.size && !selectedSet.has(modeKey)) {
      continue
    }
    const rule = PEST_EVIDENCE_RULES[modeKey]
    if (!rule) {
      continue
    }
    const groups = [
      ...(Array.isArray(rule.directGroups) ? rule.directGroups : []),
      ...(Array.isArray(rule.candidateGroups) ? rule.candidateGroups : []),
      ...(Array.isArray(rule.indirectGroups) ? rule.indirectGroups : [])
    ]
    if (groups.some(group => evidenceMatchesRuleGroup(group, evidenceKey))) {
      matched.push(modeKey)
    }
  }
  return matched
}

function normalizeAdmittedVisualEvidenceLedgerItem({
  record = {},
  candidate = {},
  evidenceKey = '',
  modeKey = ''
} = {}) {
  const key = normalizeKey(
    evidenceKey ||
      record?.object_key ||
      record?.objectKey ||
      candidate?.symptom_key ||
      candidate?.symptomKey ||
      ''
  )
  const diagnosisMode = normalizeKey(modeKey)
  if (!key || !PEST_MODE_KEYS.includes(diagnosisMode)) {
    return null
  }
  const regionRef = normalizeCaptureRegion(
    candidate?.primary_capture_region ||
      candidate?.primaryCaptureRegion ||
      candidate?.region_ref ||
      candidate?.regionRef ||
      candidate?.capture_region ||
      candidate?.captureRegion ||
      record?.region_ref ||
      record?.regionRef ||
      ''
  )
  const imageId =
    normalizeText(candidate?.primary_support_image_id || candidate?.primarySupportImageId || '') ||
    normalizeText(
      Array.isArray(candidate?.support_image_ids) ? candidate.support_image_ids[0] : ''
    ) ||
    normalizeText(Array.isArray(candidate?.supportImageIds) ? candidate.supportImageIds[0] : '') ||
    normalizeText(record?.image_id || record?.imageId || '')
  return {
    evidenceKey: key,
    symptomKey: key,
    evidenceGroup: evidenceGroupForKey(
      candidate?.evidence_group || candidate?.evidenceGroup || key
    ),
    confidenceBand: normalizeKey(
      candidate?.confidence_band || candidate?.confidenceBand || 'medium'
    ),
    strengthLevel: normalizeKey(candidate?.strength_level || candidate?.strengthLevel || 'medium'),
    imageId,
    regionRef,
    sourceRecordId: normalizeText(
      record?.visual_admission_record_id ||
        record?.visualAdmissionRecordId ||
        record?.visual_normalized_image_result_id ||
        record?.visualNormalizedImageResultId ||
        candidate?.source_record_id ||
        candidate?.sourceRecordId ||
        ''
    ),
    currentStatus: 'active',
    evidenceKind: normalizeKey(candidate?.evidenceKind || candidate?.evidence_kind || 'indirect'),
    diagnosisMode,
    modeKey: diagnosisMode,
    routeEvidenceRole: 'confirmation_support',
    sourceType: 'visual_mode_router',
    suppressEquivalentQuestion: true,
    lockedInQuestionnaire: true,
    requiresUserConfirmation: false
  }
}

function buildVisualAdmittedEvidenceLedger({ aggregateResult = null, selectedModeKeys = [] } = {}) {
  if (!aggregateResult || typeof aggregateResult !== 'object') {
    return []
  }
  const candidatesByKey = candidateMapFromAggregate(aggregateResult)
  const result = []
  for (const record of readArray(aggregateResult, 'admission_records', 'admissionRecords')) {
    if (
      normalizeKey(record?.admission_result || record?.admissionResult || '') !==
      'formally_admitted'
    ) {
      continue
    }
    const evidenceKey = normalizeKey(record?.object_key || record?.objectKey || '')
    if (!evidenceKey) {
      continue
    }
    const candidate = record?.candidate || candidatesByKey.get(evidenceKey) || {}
    for (const modeKey of pestModesForEvidenceKey(evidenceKey, selectedModeKeys)) {
      const item = normalizeAdmittedVisualEvidenceLedgerItem({
        record,
        candidate,
        evidenceKey,
        modeKey
      })
      if (item) {
        result.push(item)
      }
    }
  }
  return mergeEvidenceLedgers(result)
}

function mergeEvidenceLedgers(...ledgers) {
  const merged = new Map()
  for (const item of ledgers.flat()) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const evidenceKey = normalizeKey(item.evidenceKey || item.evidence_key || item.symptomKey)
    const modeKey = normalizeKey(item.diagnosisMode || item.diagnosis_mode || item.modeKey)
    const role = normalizeKey(item.routeEvidenceRole || item.route_evidence_role || '')
    if (!evidenceKey && !modeKey) {
      continue
    }
    const key = `${modeKey || '__mode__'}::${evidenceKey || '__evidence__'}::${role}`
    if (!merged.has(key)) {
      merged.set(key, {
        ...item,
        evidenceKey: evidenceKey || item.evidenceKey,
        symptomKey: normalizeKey(item.symptomKey || item.symptom_key || evidenceKey),
        evidenceGroup: evidenceGroupForKey(
          item.evidenceGroup || item.evidence_group || evidenceKey
        ),
        diagnosisMode: modeKey || item.diagnosisMode,
        modeKey: modeKey || item.modeKey
      })
    }
  }
  return Array.from(merged.values())
}

function selectedPestModeKeysFromChoice(choice = {}, routeResult = {}) {
  const choiceModes = normalizePestModeKeys([
    ...(Array.isArray(choice?.directModeKeys) ? choice.directModeKeys : []),
    ...(Array.isArray(choice?.confirmationModeKeys) ? choice.confirmationModeKeys : []),
    ...(Array.isArray(choice?.pestModeKeys) ? choice.pestModeKeys : [])
  ])
  if (choiceModes.length) {
    return choiceModes
  }
  return normalizePestModeKeys(routeResult.associatedModes)
}

function buildPestFallbackRouteResultFromChoice(choice = {}) {
  const directModeKeys = normalizePestModeKeys(choice?.directModeKeys)
  const confirmationModeKeys = normalizePestModeKeys(
    Array.isArray(choice?.confirmationModeKeys) && choice.confirmationModeKeys.length
      ? choice.confirmationModeKeys
      : choice?.pestModeKeys
  ).filter(modeKey => !directModeKeys.includes(modeKey))
  const associatedModes = normalizePestModeKeys([
    ...directModeKeys,
    ...confirmationModeKeys,
    ...(Array.isArray(choice?.pestModeKeys) ? choice.pestModeKeys : [])
  ])
  if (!associatedModes.length) {
    return null
  }
  return {
    nextAction: 'choose_direction',
    routePrimaryAction: 'choose_direction',
    directMatches: directModeKeys.map(modeKey => ({ modeKey, decisionLevel: 'direct' })),
    confirmationCandidates: confirmationModeKeys.map(modeKey => ({
      modeKey,
      decisionLevel: 'confirm'
    })),
    associatedModes,
    directionChoices: [choice]
  }
}

function buildSelectedModeAggregate(aggregateResult = null, selectedModeKeys = []) {
  const routeResult = routeFromAggregate(aggregateResult) || {}
  const selectedSet = new Set(
    (Array.isArray(selectedModeKeys) ? selectedModeKeys : []).filter(Boolean)
  )
  const selectedDirectMatches = (
    Array.isArray(routeResult.directMatches) ? routeResult.directMatches : []
  ).filter(item => selectedSet.has(item?.modeKey))
  const selectedConfirmationCandidates = (
    Array.isArray(routeResult.confirmationCandidates) ? routeResult.confirmationCandidates : []
  ).filter(item => selectedSet.has(item?.modeKey))
  return {
    ...(aggregateResult && typeof aggregateResult === 'object' ? aggregateResult : {}),
    diagnosis_mode_route_result: {
      ...routeResult,
      nextAction: selectedDirectMatches.length ? 'direct_result' : 'question_package',
      routePrimaryAction: selectedDirectMatches.length ? 'direct_result' : 'question_package',
      directMatches: selectedDirectMatches,
      confirmationCandidates: selectedConfirmationCandidates,
      associatedModes: Array.from(selectedSet),
      directionChoices: directionChoicesFromRoute(routeResult)
    }
  }
}

async function buildStaticModeDirectionResult({
  selectedModeKey = '',
  sessionId = '',
  round = 1,
  plantContext = {},
  aggregateResult = null
} = {}) {
  const option = STATIC_MODE_OPTIONS[selectedModeKey]
  if (!option) {
    return null
  }
  const response = await getBuildStaticQuestionPackageStartRoundResult()({
    sessionId,
    option,
    plantContext,
    round
  })
  return {
    ...response,
    selectedModeKey,
    routePrimaryAction: 'direction_choice_selected',
    visualAggregateResult: aggregateResult,
    diagnosisModeRouteResult: routeFromAggregate(aggregateResult)
  }
}

function buildPestModeDirectionResult({
  selectedModeKeys = [],
  sessionId = '',
  round = 1,
  plantContext = {},
  aggregateResult = null,
  completedResultRefinement = false
} = {}) {
  const selectedAggregate = buildSelectedModeAggregate(aggregateResult, selectedModeKeys)
  const selectedRoute = routeFromAggregate(selectedAggregate) || {}
  const directModeKeys = (
    Array.isArray(selectedRoute.directMatches) ? selectedRoute.directMatches : []
  )
    .map(item => item.modeKey)
    .filter(Boolean)
  const confirmationModeKeys = (
    Array.isArray(selectedRoute.confirmationCandidates) ? selectedRoute.confirmationCandidates : []
  )
    .map(item => item.modeKey)
    .filter(modeKey => modeKey && !directModeKeys.includes(modeKey))
  const hiddenPrefilledEvidence = mergeEvidenceLedgers(
    routeEvidenceLedger(selectedRoute),
    buildVisualAdmittedEvidenceLedger({
      aggregateResult: selectedAggregate,
      selectedModeKeys
    })
  )
  const hiddenDirectModes = new Set(
    hiddenPrefilledEvidence
      .filter(item => item?.routeEvidenceRole === 'direct_match')
      .map(item => item?.diagnosisMode || item?.diagnosis_mode || item?.modeKey)
      .filter(Boolean)
  )
  for (const modeKey of directModeKeys) {
    if (hiddenDirectModes.has(modeKey)) {
      continue
    }
    hiddenPrefilledEvidence.push({
      evidenceKey: modeKey,
      symptomKey: modeKey,
      diagnosisMode: modeKey,
      modeKey,
      routeEvidenceRole: 'direct_match',
      sourceType: 'visual_mode_router',
      currentStatus: 'active',
      suppressEquivalentQuestion: true,
      lockedInQuestionnaire: true
    })
  }
  if (completedResultRefinement && selectedModeKeys.length <= SINGLE_SELECTED_MODE_COUNT) {
    return resolveSpecificPestAnswerResult({
      sessionId,
      round,
      answers: [],
      questionPackage: {
        candidateModes: selectedModeKeys,
        hiddenPrefilledEvidence,
        packageQuestions: []
      },
      probableModes: directModeKeys.length ? [] : confirmationModeKeys,
      plantContext,
      visualAggregateResult: selectedAggregate
    })
  }
  if (directModeKeys.length && !confirmationModeKeys.length) {
    return resolveSpecificPestAnswerResult({
      sessionId,
      round,
      answers: [],
      questionPackage: {
        candidateModes: directModeKeys,
        hiddenPrefilledEvidence,
        packageQuestions: []
      },
      plantContext,
      visualAggregateResult: selectedAggregate
    })
  }
  // 方向选择后构建确认问题包：仅在 route 为 question_package 模式且携带有效 tier 时
  // 传递 tier/budget，避免 fallback 路由或 direct_result 细化路径误传 budget=0。
  const routeTier = String(selectedRoute.confidenceTier || '').trim()
  const routeBudget = Number(selectedRoute.questionBudget || 0)
  const shouldApplyTier =
    selectedRoute.nextAction === 'question_package' && routeTier && routeBudget > 0
  const questionPackage = buildSpecificPestQuestionPackage({
    candidateModes: confirmationModeKeys,
    hiddenPrefilledEvidence,
    ...(shouldApplyTier
      ? { confidenceTier: routeTier, maxQuestions: routeBudget }
      : {})
  })
  const directOutcome = directModeKeys.length
    ? resolveSpecificPestAnswerResult({
        sessionId,
        round,
        answers: [],
        questionPackage: {
          candidateModes: directModeKeys,
          hiddenPrefilledEvidence,
          packageQuestions: []
        },
        plantContext,
        visualAggregateResult: selectedAggregate
      })
    : null
  if (directOutcome && (!questionPackage || questionPackage.questionCount === 0)) {
    return directOutcome
  }
  return {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    plantContext,
    selectedModeKey: PEST_CATEGORY,
    selectedModeKeys,
    routePrimaryAction: 'question_package',
    sessionStatus: 'awaiting_follow_up',
    questionRequired: true,
    questions: questionPackage.packageQuestions,
    questionPackage,
    visualAggregateResult: selectedAggregate,
    visibleOutcomes: directOutcome?.visibleOutcomes || [],
    observedEvidenceSet: buildSpecificPestObservedEvidenceSet({
      candidateModes: selectedModeKeys.filter(modeKey =>
        Object.prototype.hasOwnProperty.call(PEST_MODE_LABELS, modeKey)
      )
    })
  }
}

async function buildAiModeDirectionResult({
  selectedModeKey = '',
  openid = '',
  sessionId = '',
  round = 1,
  refreshedSessionState = {},
  aggregateResult = null
} = {}) {
  const selectedAggregate = buildSelectedModeAggregate(aggregateResult, [selectedModeKey])
  return getDiagnosisEngine().runDiagnosisRound({
    openid,
    userPlantId: refreshedSessionState.userPlantId,
    plantId: refreshedSessionState.plantId,
    lockedPlantContext: refreshedSessionState.plantContext,
    observedSymptoms: [],
    observedEvidenceSet: refreshedSessionState.observedEvidenceSet || [],
    visualAggregateResult: selectedAggregate,
    answers: [],
    askedQuestionKeys: [],
    answeredQuestionGroupKeys: [],
    unknownCountByGroup: {},
    round,
    stage: 'question',
    sessionId
  })
}

async function resolveDirectionChoiceRoundResult({
  payload = {},
  openid = '',
  sessionId = '',
  round = 1,
  refreshedSessionState = {},
  sessionState = {}
} = {}) {
  const selectedModeKey = selectedDirectionKey(payload)
  const aggregateResult = resolveAggregateForDirectionChoice(refreshedSessionState, sessionState)
  let effectiveAggregateResult = aggregateResult
  let routeResult = routeFromAggregate(aggregateResult)
  const fallbackChoices = directionChoicesFromState(refreshedSessionState, sessionState)
  const fallbackChoice = findDirectionChoiceInList(fallbackChoices, selectedModeKey)
  if (
    selectedModeKey === PEST_CATEGORY &&
    fallbackChoice &&
    (!routeResult || !['choose_direction', 'direct_result'].includes(routeResult.nextAction))
  ) {
    routeResult = buildPestFallbackRouteResultFromChoice(fallbackChoice)
    effectiveAggregateResult = {
      ...(aggregateResult && typeof aggregateResult === 'object' ? aggregateResult : {}),
      diagnosis_mode_route_result: routeResult
    }
  }
  const canRefineCompletedPest =
    routeResult?.nextAction === 'direct_result' && selectedModeKey === PEST_CATEGORY
  if (!routeResult || (routeResult.nextAction !== 'choose_direction' && !canRefineCompletedPest)) {
    throw Object.assign(new Error('当前会话不需要选择诊断方向'), { statusCode: 400 })
  }
  assertAllowedDirectionChoice(routeResult, selectedModeKey, fallbackChoices)
  const selectedChoice =
    findDirectionChoice(routeResult, selectedModeKey) || fallbackChoice || payload?.directionChoice
  const plantContext = refreshedSessionState.plantContext || sessionState.plantContext || {}
  if (selectedModeKey === PEST_CATEGORY) {
    return buildPestModeDirectionResult({
      selectedModeKeys: selectedPestModeKeysFromChoice(selectedChoice, routeResult),
      sessionId,
      round,
      plantContext,
      aggregateResult: effectiveAggregateResult,
      completedResultRefinement: canRefineCompletedPest
    })
  }
  const staticResult = await buildStaticModeDirectionResult({
    selectedModeKey,
    sessionId,
    round,
    plantContext,
    aggregateResult: effectiveAggregateResult
  })
  if (staticResult) {
    return staticResult
  }
  if (DIAGNOSIS_MODE_REGISTRY[selectedModeKey]?.requiresAiInitialAssessment) {
    return buildAiModeDirectionResult({
      selectedModeKey,
      openid,
      sessionId,
      round,
      refreshedSessionState,
      aggregateResult: effectiveAggregateResult
    })
  }
  throw Object.assign(new Error('所选诊断方向暂不支持继续处理'), { statusCode: 501 })
}

module.exports = {
  isDirectionChoicePayload,
  normalizeDirectionChoiceMode,
  resolveDirectionChoiceRoundResult,
  _test: {
    buildSelectedModeAggregate,
    directionChoicesFromRoute
  }
}
