'use strict'

const { clamp01 } = require('../repositories/sql')
const { toResultId } = require('../mappers/public-id-mapper')
const {
  evidence: evidenceConfig,
  routeSelection: questionSelectionConfig
} = require('../constants/scoring')
const {
  resolvePlantContext,
  getLinkedCandidatePriors,
  getCandidateProblemPriors,
  getGenusCandidatePriors,
  getHostCandidatePriors,
  getGenusSuitabilityMap,
  getHostSuitabilityMap
} = require('../repositories/prior-repository')
const { getProblemsByKeys, getExplanationsByProblemKeys } = require('../repositories/problem-repository')
const {
  getSymptomDictionary,
  getSymptomsByKeys,
  getEvidenceEdges
} = require('../repositories/symptom-repository')
const {
  getQuestionsByKeys,
  getQuestionOptionMappings
} = require('../repositories/question-repository')
const outcomeRouteRepository = require('../repositories/outcome-route-repository')
const { listQuestionRows } = require('../repositories/session-question-repository')
const { getCausalityEdges } = require('../repositories/causality-repository')
const {
  computeVisualEvidenceScores,
  computeQuestionEvidenceAndPenalty
} = require('./evidence-scoring')
const { computeGenusFactor, computeHostFactor } = require('./prior-scorers')
const { resolveSymptomClassRuntime } = require('./symptom-classifier')
const { formatDiagnosisResponse } = require('./result-formatter')
const { buildRuntimeArtifacts } = require('./runtime-artifacts')
const { resolveHighSpecificityConvergencePlan } = require('./high-specificity-fast-convergence')
const { resolveLowConfidenceState } = require('./uncertain-condition')
const {
  resolveNonProblematicRule,
  buildNonProblematicRoundResult
} = require('./non-problematic-resolver')
const {
  QUESTION_PACKAGE_TOPICS,
  QUESTION_PACKAGE_SECTIONS,
  normalizeQuestionPackageTopic,
  isGenericObservedProbeDirectEvidenceDimension
} = require('../utils/question-package-topic')
const {
  buildVisualCandidateQuestionGroupKey,
  buildSyntheticVisualCandidateQuestionKey,
  parseSyntheticObservedProbeQuestionKey,
  buildSyntheticQuestionOptionMappings
} = require('../utils/synthetic-question-package')
const {
  YELLOWING_LEAF_AGE_PATTERN_QUESTION_KEY,
  isDisabledYellowingFlowQuestion
} = require('../utils/yellowing-question-policy')
const {
  buildObservedEvidenceSetFromSymptoms,
  buildObservedEvidenceSetFromVisualAggregateResult,
  buildObservedEvidenceSetFromAnswerEffects,
  mergeObservedEvidenceSet,
  normalizeObservedEvidenceSetItems,
  projectObservedSymptomsFromEvidence,
  projectVisualObservedSymptomsFromEvidence
} = require('./observed-evidence')
const {
  evaluateContextRequiredProblemGuard
} = require('../utils/context-required-problem-guard')
const {
  prioritizeOutputEligibleCandidateOutcomes,
  hasOutputEligibleCandidateOutcome,
  hasForceableOutputCandidateOutcome
} = require('../utils/output-eligibility')
const {
  buildDerivedEvidenceSet
} = require('../utils/derived-evidence')
const {
  buildDiagnosisDirections
} = require('../utils/diagnosis-directions')
const {
  buildCareGuidance
} = require('../utils/care-baseline-guidance')
const {
  buildRouteEvidenceContext,
  planOutcomeRoutes
} = require('./outcome-route-planner')
const { isAuthoritativeRouteDecision } = require('../utils/outcome-route-contract')

const OUTPUT_SHIFT_LOCK_EXCLUDED_PROBLEM_KEYS = new Set([
  'iron_deficiency',
  'nitrogen_deficiency',
  'chlorosis'
])
const BROAD_VISUAL_DIFFERENTIAL_CLASS_KEYS = new Set([
  'general_stress_mode',
  'leaf_spot_complex_mode'
])
const BROAD_VISUAL_DIFFERENTIAL_SYMPTOM_KEYS = new Set([
  'distorted_growth',
  'irregular_blotches'
])
const DIAGNOSIS_RUNTIME_DEBUG_LOG_ENABLED =
  String(process.env.DIAGNOSIS_RUNTIME_DEBUG_LOG || '').toLowerCase() === 'true'

function logDiagnosisRuntime(message, payload = {}) {
  if (!DIAGNOSIS_RUNTIME_DEBUG_LOG_ENABLED) {return}
  console.log(message, payload)
}

function roundNum(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits))
}

function normalizeKey(value = '') {
  return String(value || '').trim()
}

function resolveVisibleRouteActionProfileKeys(routeDecision = null, routeOutcomes = []) {
  const visibleOutcomeKeySet = new Set(
    Array.isArray(routeDecision?.visibleOutcomeKeys)
      ? routeDecision.visibleOutcomeKeys.map(item => normalizeKey(item)).filter(Boolean)
      : []
  )
  const decisionProfileKeys = Array.isArray(routeDecision?.visibleActionProfileKeys)
    ? routeDecision.visibleActionProfileKeys.map(item => normalizeKey(item)).filter(Boolean)
    : []
  const routeOutcomeProfileKeys = (Array.isArray(routeOutcomes) ? routeOutcomes : [])
    .filter(item => visibleOutcomeKeySet.has(normalizeKey(item?.outcomeKey || '')))
    .map(item => normalizeKey(item?.actionProfileKey || ''))
    .filter(Boolean)

  return Array.from(new Set([...decisionProfileKeys, ...routeOutcomeProfileKeys]))
}

function normalizeDecisionCause(decisionCause = null) {
  if (!decisionCause || typeof decisionCause !== 'object') {
    return null
  }

  const decisionCauseKey = normalizeKey(decisionCause.decisionCauseKey || decisionCause.key || '')
  if (!decisionCauseKey) {
    return null
  }

  return {
    decisionCauseKey,
    decisionCauseCategory: String(
      decisionCause.decisionCauseCategory || decisionCause.category || ''
    ).trim(),
    decisionCauseText: String(
      decisionCause.decisionCauseText || decisionCause.text || ''
    ).trim(),
    decisionCauseDetails:
      decisionCause.decisionCauseDetails && typeof decisionCause.decisionCauseDetails === 'object'
        ? decisionCause.decisionCauseDetails
        : {}
  }
}

function sanitizeRouteDecisionForPublic(routeDecision = null) {
  if (!routeDecision || typeof routeDecision !== 'object') {
    return null
  }

  return {
    mode: normalizeKey(routeDecision.mode || ''),
    visibleOutcomeKeys: Array.isArray(routeDecision.visibleOutcomeKeys)
      ? routeDecision.visibleOutcomeKeys.map(item => normalizeKey(item)).filter(Boolean)
      : [],
    activeRouteGroupKeys: Array.isArray(routeDecision.activeRouteGroupKeys)
      ? routeDecision.activeRouteGroupKeys.map(item => normalizeKey(item)).filter(Boolean)
      : [],
    conservativePolicy: normalizeKey(routeDecision.conservativePolicy || ''),
    decisionCause: normalizeDecisionCause(routeDecision.decisionCause)
  }
}

function resolveLeadingVisibleOutcomeKey(routeDecision = null) {
  return Array.isArray(routeDecision?.visibleOutcomeKeys)
    ? normalizeKey(routeDecision.visibleOutcomeKeys[0] || '')
    : ''
}

function isRoutePlanningObservationEnabled() {
  return isEnabledFeatureFlag(
    'ROUTE_PLANNING_OBSERVATION_ENABLED',
    'ROUTE_MODE_ENABLED',
    { defaultEnabled: true }
  )
}

function isRouteQuestionEnabled() {
  return isEnabledFeatureFlag(
    'ROUTE_QUESTION_ENABLED',
    'ROUTE_MODE_ENABLED',
    { defaultEnabled: true }
  )
}

function isRouteOutputEnabled() {
  return isEnabledFeatureFlag(
    'ROUTE_OUTPUT_ENABLED',
    'ROUTE_MODE_ENABLED',
    { defaultEnabled: true }
  )
}

function isRouteDebugTraceEnabled() {
  return isEnabledFeatureFlag('ROUTE_DEBUG_TRACE_ENABLED', 'ROUTE_MODE_ENABLED')
}

function isEnabledFeatureFlag(primaryEnvKey = '', conservativeEnvKey = '', options = {}) {
  const primaryRaw = String(process.env[primaryEnvKey] || '').trim()
  const conservativeRaw = String(process.env[conservativeEnvKey] || '').trim()
  const defaultEnabled = Boolean(options?.defaultEnabled)
  const raw = String(
    primaryRaw ||
      conservativeRaw ||
      (defaultEnabled ? '1' : '0')
  )
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function hasActiveObservedEvidenceEntries(observedEvidenceSet = []) {
  return (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []).some(
    item => normalizeKey(item?.currentStatus || item?.current_status || 'active') === 'active'
  )
}

function collectActiveObservedSymptomKeysFromEvidence(observedEvidenceSet = []) {
  return Array.from(
    new Set(
      (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
        .filter(item =>
          Number(item?.enteredRuntime ?? item?.entered_runtime ?? 1) === 1 &&
          normalizeKey(item?.currentStatus || item?.current_status || 'active') !== 'superseded'
        )
        .map(item => normalizeKey(item?.symptomKey || item?.symptom_key || ''))
        .filter(Boolean)
    )
  )
}

function hasBroadVisualDifferentialInput({
  symptomClassRuntime = null,
  observedEvidenceSet = []
} = {}) {
  const classKeys = [
    symptomClassRuntime?.currentClassKey,
    symptomClassRuntime?.primaryClass?.classKey,
    symptomClassRuntime?.classConditionDecision?.currentClassKey,
    symptomClassRuntime?.classConditionDecision?.primaryClassKey
  ].map(item => normalizeKey(item)).filter(Boolean)

  if (classKeys.some(classKey => BROAD_VISUAL_DIFFERENTIAL_CLASS_KEYS.has(classKey))) {
    return true
  }

  return collectActiveObservedSymptomKeysFromEvidence(observedEvidenceSet).some(symptomKey =>
    BROAD_VISUAL_DIFFERENTIAL_SYMPTOM_KEYS.has(symptomKey)
  )
}

function hasAnsweredQuestionOption(answers = [], questionKey = '', optionKey = '') {
  const normalizedQuestionKey = normalizeKey(questionKey)
  const normalizedOptionKey = normalizeKey(optionKey)
  if (!normalizedQuestionKey || !normalizedOptionKey) {return false}

  return (Array.isArray(answers) ? answers : []).some(item =>
    normalizeKey(item?.questionKey || item?.question_key || '') === normalizedQuestionKey &&
    normalizeKey(item?.optionKey || item?.option_key || '') === normalizedOptionKey
  )
}

function hasAnsweredAnyQuestion(answers = [], questionKeys = []) {
  const questionKeySet = new Set(
    (Array.isArray(questionKeys) ? questionKeys : [])
      .map(item => normalizeKey(item))
      .filter(Boolean)
  )
  if (!questionKeySet.size) {return false}

  return (Array.isArray(answers) ? answers : []).some(item =>
    questionKeySet.has(normalizeKey(item?.questionKey || item?.question_key || ''))
  )
}

function hasUnresolvedEdemaFlatSpotDifferential({
  answers = [],
  symptomClassRuntime: _symptomClassRuntime = null,
  observedEvidenceSet: _observedEvidenceSet = []
} = {}) {
  const edemaShapeDenied = hasAnsweredQuestionOption(
    answers,
    'q_observed_probe__edema__edema_bump_stage',
    'flat_spot'
  )
  if (!edemaShapeDenied) {return false}

  return !hasAnsweredAnyQuestion(answers, [
    'q_black_spots_surface_layer_check',
    'q_black_spots_tissue_moisture_check',
    'q_bacterial_water_soaked'
  ])
}

function shouldRestrictToCandidateSeedOnly({
  symptomClassRuntime = null,
  observedEvidenceSet = []
} = {}) {
  if (hasActiveObservedEvidenceEntries(observedEvidenceSet)) {
    return false
  }

  const currentClassKey = normalizeKey(symptomClassRuntime?.currentClassKey || '')
  if (currentClassKey) {
    return false
  }

  const blockedReason = String(symptomClassRuntime?.classConditionDecision?.blockedReason || '').trim()
  if (blockedReason === 'no_observed_symptoms') {
    return true
  }

  return Boolean(symptomClassRuntime && typeof symptomClassRuntime === 'object' && !symptomClassRuntime.enabled)
}

function shouldSuppressCrossDirectionVisualCandidate(
  candidate = {},
  diagnosisDirections = [],
  symptomClassRuntime = null
) {
  if (!symptomClassRuntime?.enabled) {return false}

  const anchoredDirectionKeys = new Set(
    (Array.isArray(diagnosisDirections) ? diagnosisDirections : [])
      .filter(direction =>
        (
          Array.isArray(direction?.matchedSymptomKeys) &&
          direction.matchedSymptomKeys.some(Boolean)
        ) ||
        (
          Array.isArray(direction?.matchedPatternKeys) &&
          direction.matchedPatternKeys.some(Boolean)
        )
      )
      .map(direction => normalizeKey(direction?.directionKey || ''))
      .filter(Boolean)
  )
  if (!anchoredDirectionKeys.size) {return false}

  const candidateSymptomKey = normalizeKey(candidate?.symptomKey || '')
  const candidatePatternKey = normalizeKey(candidate?.patternKey || '')
  if (!candidateSymptomKey && !candidatePatternKey) {return false}

  const candidateDirectionKeys = new Set()
  for (const direction of Array.isArray(diagnosisDirections) ? diagnosisDirections : []) {
    const directionKey = normalizeKey(direction?.directionKey || '')
    if (!directionKey) {continue}

    const matchedByCandidateSymptom =
      candidateSymptomKey &&
      Array.isArray(direction?.matchedCandidateSymptomKeys) &&
      direction.matchedCandidateSymptomKeys.some(item => normalizeKey(item) === candidateSymptomKey)
    const matchedByCandidatePattern =
      candidatePatternKey &&
      Array.isArray(direction?.matchedCandidatePatternKeys) &&
      direction.matchedCandidatePatternKeys.some(item => normalizeKey(item) === candidatePatternKey)

    if (matchedByCandidateSymptom || matchedByCandidatePattern) {
      candidateDirectionKeys.add(directionKey)
    }
  }

  if (!candidateDirectionKeys.size) {return false}
  return Array.from(candidateDirectionKeys).every(directionKey => !anchoredDirectionKeys.has(directionKey))
}

function attachPrivateSymptomClassRuntime(response = {}, symptomClassRuntime = null) {
  if (!response || typeof response !== 'object' || !symptomClassRuntime || typeof symptomClassRuntime !== 'object') {
    return response
  }

  Object.defineProperty(response, '__symptomClassRuntime', {
    value: symptomClassRuntime,
    enumerable: false,
    configurable: true,
    writable: true
  })

  return response
}

function resolveSymptomCnFromDictionary(item = {}, symptomMap = new Map()) {
  const symptomKey = String(item?.symptomKey || '').trim()
  const symptomMeta = symptomMap.get(symptomKey) || {}
  return String(
    symptomMeta?.displayTextCn ||
      symptomMeta?.symptomCn ||
      item?.symptomCn ||
      item?.symptom_key ||
      item?.symptomKey ||
      ''
  ).trim()
}

function applySymptomDictionaryToObservedSymptoms(observedSymptoms = [], symptomRows = []) {
  const symptomMap = mapByKey(symptomRows, 'symptomKey')
  return (Array.isArray(observedSymptoms) ? observedSymptoms : []).map(item => ({
    ...item,
    symptomCn: resolveSymptomCnFromDictionary(item, symptomMap),
    signalReliability:
      item?.signalReliability ??
      symptomMap.get(String(item?.symptomKey || '').trim())?.signalReliability ??
      0,
    locationKey: item?.locationKey || symptomMap.get(String(item?.symptomKey || '').trim())?.locationKey || '',
    patternKey: item?.patternKey || symptomMap.get(String(item?.symptomKey || '').trim())?.patternKey || '',
    distributionKey:
      item?.distributionKey ||
      symptomMap.get(String(item?.symptomKey || '').trim())?.distributionKey ||
      ''
  }))
}

function applySymptomDictionaryToEvidenceSet(observedEvidenceSet = [], symptomRows = []) {
  const symptomMap = mapByKey(symptomRows, 'symptomKey')
  return (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []).map(item => ({
    ...item,
    symptomCn: resolveSymptomCnFromDictionary(item, symptomMap)
  }))
}

function mapByKey(list = [], key = 'problemKey') {
  const map = new Map()
  for (const item of list || []) {
    const id = item?.[key]
    if (!id) {continue}
    map.set(id, item)
  }
  return map
}

function mergeCandidatePriors(...groups) {
  const merged = new Map()

  for (const group of groups) {
    for (const item of group || []) {
      if (!item?.problemKey) {continue}
      const existing = merged.get(item.problemKey) || {
        problemKey: item.problemKey,
        genusSuitability: null,
        hostSuitability: null,
        finalPriorScore: 0,
        matchedHostLevel: '',
        sourceLayer: '',
        dataStatus: item.dataStatus || 'partial'
      }

      merged.set(item.problemKey, {
        ...existing,
        genusSuitability:
          item.genusSuitability ?? existing.genusSuitability,
        hostSuitability:
          item.hostSuitability ?? existing.hostSuitability,
        finalPriorScore: Math.max(
          Number(existing.finalPriorScore || 0),
          Number(item.finalPriorScore || 0)
        ),
        matchedHostLevel: item.matchedHostLevel || existing.matchedHostLevel || '',
        sourceLayer: item.sourceLayer || existing.sourceLayer || '',
        dataStatus: item.dataStatus || existing.dataStatus || 'partial'
      })
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => Number(b.finalPriorScore || 0) - Number(a.finalPriorScore || 0)
  )
}

function collectDirectAdjustmentProblemKeys(optionMappings = []) {
  const problemKeySet = new Set()

  for (const item of Array.isArray(optionMappings) ? optionMappings : []) {
    const adjustments = Array.isArray(item?.directProblemAdjustments)
      ? item.directProblemAdjustments
      : []

    for (const adjustment of adjustments) {
      const problemKey = normalizeKey(adjustment?.problemKey || '')
      if (problemKey) {
        problemKeySet.add(problemKey)
      }
    }
  }

  return Array.from(problemKeySet)
}

function buildDirectionCandidatePriors(diagnosisDirections = [], existingProblemKeys = []) {
  const existingProblemKeySet = new Set(
    (Array.isArray(existingProblemKeys) ? existingProblemKeys : [])
      .map(item => normalizeKey(item))
      .filter(Boolean)
  )
  const priors = []

  for (const direction of Array.isArray(diagnosisDirections) ? diagnosisDirections : []) {
    const status = normalizeKey(direction?.status || '')
    const confidence = clamp01(direction?.confidence || 0)
    const statusBaseWeight = {
      leading: 0.38,
      candidate: 0.3,
      hint: 0.22
    }[status] || 0.22
    const finalPriorScore = roundNum(statusBaseWeight + confidence * 0.12)
    const allowedProblemKeys = Array.isArray(direction?.allowedProblemKeys)
      ? direction.allowedProblemKeys
      : Array.isArray(direction?.candidateProblemKeys)
        ? direction.candidateProblemKeys
        : []

    for (const rawProblemKey of allowedProblemKeys) {
      const problemKey = normalizeKey(rawProblemKey)
      if (!problemKey || existingProblemKeySet.has(problemKey)) {continue}

      priors.push({
        problemKey,
        genusSuitability: null,
        hostSuitability: null,
        finalPriorScore,
        matchedHostLevel: '',
        sourceLayer: `direction_${normalizeKey(direction?.directionKey || 'hint')}`,
        dataStatus: 'partial'
      })
      existingProblemKeySet.add(problemKey)
    }
  }

  return priors
}

function scopeCandidateOutcomesToDiagnosisDirections(
  candidateOutcomes = [],
  diagnosisDirections = [],
  _problemRoleByKey = new Map()
) {
  const allowedProblemKeySet = new Set()

  for (const direction of Array.isArray(diagnosisDirections) ? diagnosisDirections : []) {
    const allowedProblemKeys = Array.isArray(direction?.allowedProblemKeys)
      ? direction.allowedProblemKeys
      : Array.isArray(direction?.candidateProblemKeys)
        ? direction.candidateProblemKeys
        : []

    for (const problemKey of allowedProblemKeys) {
      const normalizedProblemKey = normalizeKey(problemKey)
      if (normalizedProblemKey) {
        allowedProblemKeySet.add(normalizedProblemKey)
      }
    }
  }

  if (!allowedProblemKeySet.size) {
    return Array.isArray(candidateOutcomes) ? candidateOutcomes : []
  }

  const scopedCandidateOutcomes = (Array.isArray(candidateOutcomes) ? candidateOutcomes : []).filter(item =>
    allowedProblemKeySet.has(normalizeKey(item?.problemKey || ''))
  )

  if (!scopedCandidateOutcomes.length) {
    return Array.isArray(candidateOutcomes) ? candidateOutcomes : []
  }
  return scopedCandidateOutcomes
}

function collectAllowedProblemKeysFromDiagnosisDirections(diagnosisDirections = []) {
  const allowedProblemKeySet = new Set()

  for (const direction of Array.isArray(diagnosisDirections) ? diagnosisDirections : []) {
    const allowedProblemKeys = Array.isArray(direction?.allowedProblemKeys)
      ? direction.allowedProblemKeys
      : Array.isArray(direction?.candidateProblemKeys)
        ? direction.candidateProblemKeys
        : []

    for (const problemKey of allowedProblemKeys) {
      const normalizedProblemKey = normalizeKey(problemKey)
      if (normalizedProblemKey) {
        allowedProblemKeySet.add(normalizedProblemKey)
      }
    }
  }

  return allowedProblemKeySet
}

function hasDirectPositiveProblemAnswer(answerEffects = [], problemKey = '') {
  const normalizedProblemKey = normalizeKey(problemKey)
  if (!normalizedProblemKey) {return false}

  return (Array.isArray(answerEffects) ? answerEffects : []).some(item =>
  {
    if (normalizeKey(item?.effectType || '') !== 'direct_problem_positive') {return false}
    if (normalizeKey(item?.problemKey || '') !== normalizedProblemKey) {return false}
    if (Number(item?.value || 0) <= 0) {return false}
    if (isDisabledYellowingFlowQuestion(item)) {return false}

    const { packageTopic } = parseSyntheticObservedProbeQuestionKey(item?.questionKey || '')
    const normalizedPackageTopic =
      normalizeQuestionPackageTopic(item?.packageTopic || '', '') ||
      normalizeQuestionPackageTopic(packageTopic, '')
    return (
      !item?.isGenericObservedProbeDirectPositive &&
      !isGenericObservedProbeDirectEvidenceDimension(normalizedPackageTopic)
    )
  })
}

function shouldBlockUnscopedClassProblemOutput({
  candidateOutcomes = [],
  diagnosisDirections = [],
  symptomClassRuntime = null,
  answerEffects = [],
  fastConvergencePlan = null
} = {}) {
  const topProblemKey = normalizeKey(candidateOutcomes?.[0]?.problemKey || '')
  if (!topProblemKey) {return false}
  if (fastConvergencePlan?.applied) {return false}
  if (hasDirectPositiveProblemAnswer(answerEffects, topProblemKey)) {return false}

  const allowedProblemKeySet = collectAllowedProblemKeysFromDiagnosisDirections(diagnosisDirections)
  if (allowedProblemKeySet.size) {
    return !allowedProblemKeySet.has(topProblemKey)
  }

  const currentClassKey = normalizeKey(
    symptomClassRuntime?.currentClassKey || symptomClassRuntime?.primaryClass?.classKey || ''
  )
  return Boolean(currentClassKey)
}

function stabilizeOutputCandidateOutcomesAgainstConfirmedGuardShift(
  candidateOutcomes = [],
  contextProblemGuard = null,
  problemRoleByKey = new Map()
) {
  const startProblemKey = normalizeKey(contextProblemGuard?.problemKey || '')
  if (
    !startProblemKey ||
    !contextProblemGuard?.applies ||
    !contextProblemGuard?.hasRequiredContext
  ) {
    return Array.isArray(candidateOutcomes) ? candidateOutcomes : []
  }

  const sourceCandidateOutcomes = Array.isArray(candidateOutcomes) ? candidateOutcomes : []
  if (OUTPUT_SHIFT_LOCK_EXCLUDED_PROBLEM_KEYS.has(startProblemKey)) {
    return sourceCandidateOutcomes
  }
  const startCandidateIndex = sourceCandidateOutcomes.findIndex(
    item => normalizeKey(item?.problemKey || '') === startProblemKey
  )
  if (startCandidateIndex <= 0) {
    return sourceCandidateOutcomes
  }

  const startCandidateOutcome = sourceCandidateOutcomes[startCandidateIndex]
  const startProblemRole = normalizeKey(
    startCandidateOutcome?.problemRole || problemRoleByKey.get(startProblemKey) || ''
  )
  if (!questionSelectionConfig.supportRolesAsTop1.includes(startProblemRole)) {
    return sourceCandidateOutcomes
  }

  return [
    startCandidateOutcome,
    ...sourceCandidateOutcomes.slice(0, startCandidateIndex),
    ...sourceCandidateOutcomes.slice(startCandidateIndex + 1)
  ]
}

function buildDirectAdjustmentCandidatePriors(optionMappings = [], existingProblemKeys = []) {
  const existingProblemKeySet = new Set(
    (Array.isArray(existingProblemKeys) ? existingProblemKeys : [])
      .map(item => normalizeKey(item))
      .filter(Boolean)
  )

  return collectDirectAdjustmentProblemKeys(optionMappings)
    .filter(problemKey => !existingProblemKeySet.has(problemKey))
    .map(problemKey => ({
      problemKey,
      genusSuitability: null,
      hostSuitability: null,
      finalPriorScore: 0.34,
      matchedHostLevel: '',
      sourceLayer: 'answer_direct_adjustment',
      dataStatus: 'partial'
    }))
}

function hasQuestionHistory({
  round = 1,
  answers = [],
  askedQuestionKeys = [],
  answeredQuestionGroupKeys = []
} = {}) {
  if (Number(round || 1) > 1) {return true}
  if (Array.isArray(answers) && answers.length > 0) {return true}
  if (Array.isArray(askedQuestionKeys) && askedQuestionKeys.length > 0) {return true}
  if (Array.isArray(answeredQuestionGroupKeys) && answeredQuestionGroupKeys.length > 0) {return true}
  return false
}

const YELLOWING_CONDITION_SYMPTOM_KEYS = new Set([
  'leaf_yellowing',
  'uniform_yellowing',
  'yellow_lower_leaves',
  'yellow_new_leaves',
  'interveinal_chlorosis',
  'pale_new_leaves',
  'yellowing_patchy',
  'yellow_speckling',
  'vein_darkening'
])

const YELLOWING_CONDITION_CLASS_KEYS = new Set([
  'yellowing_mode',
  'nutrient_stress_mode',
  'thrips_damage_mode'
])

const YELLOWING_PRIMARY_CLUE_TOPIC_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__yellowing_primary_clue_condition'
const LEAF_YELLOWING_FERTILIZATION_BACKGROUND_QUESTION_KEY =
  'q_leaf_yellowing_fertilization_background'

const STRUCTURAL_DAMAGE_CLASS_KEYS = new Set([
  'chewing_pest_mode'
])

const ROOT_ZONE_DETAIL_QUESTION_KEYS = new Set([
  'q_root_rot_bad_smell',
  'q_root_rot_black_roots',
  'q_root_rot_mushy_roots'
])

const ROOT_BRIDGE_QUESTION_KEYS = new Set([
  'q_gnat_soil_stays_wet',
  'q_root_rot_wet_soil_wilt',
  'q_stem_collapse_poor_drainage'
])

const YELLOWING_REQUIRED_GROUP_DIMENSIONS = [
  QUESTION_PACKAGE_TOPICS.WATERING_FREQUENCY_CONTEXT,
  QUESTION_PACKAGE_TOPICS.LIGHT_CHANGE_CONTEXT,
  QUESTION_PACKAGE_TOPICS.FERTILIZATION_GROWTH_CONTEXT,
  QUESTION_PACKAGE_TOPICS.AIRFLOW_HUMIDITY_CONTEXT
]

const YELLOWING_CONDITION_DIMENSION_EQUIVALENTS = {
  [QUESTION_PACKAGE_TOPICS.YELLOWING_PRIMARY_CLUE_TOPIC]: [
    QUESTION_PACKAGE_TOPICS.YELLOWING_PRIMARY_CLUE_TOPIC
  ],
  [QUESTION_PACKAGE_TOPICS.YELLOWING_CARE_AREA_TOPIC]: [
    QUESTION_PACKAGE_TOPICS.YELLOWING_CARE_AREA_TOPIC
  ],
  [QUESTION_PACKAGE_TOPICS.YELLOWING_DISEASE_TRACE_TOPIC]: [
    QUESTION_PACKAGE_TOPICS.YELLOWING_DISEASE_TRACE_TOPIC
  ],
  [QUESTION_PACKAGE_TOPICS.PEST_TRACE_TYPE]: [
    QUESTION_PACKAGE_TOPICS.PEST_TRACE_TYPE
  ],
  [QUESTION_PACKAGE_TOPICS.YELLOWING_LEAF_AGE_PATTERN]: [
    QUESTION_PACKAGE_TOPICS.YELLOWING_LEAF_AGE_PATTERN,
    QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION
  ],
  [QUESTION_PACKAGE_TOPICS.YELLOWING_DISTRIBUTION_PATTERN]: [
    QUESTION_PACKAGE_TOPICS.YELLOWING_DISTRIBUTION_PATTERN,
    QUESTION_PACKAGE_TOPICS.DISTRIBUTION_SCOPE
  ],
  [QUESTION_PACKAGE_TOPICS.WATERING_FREQUENCY_CONTEXT]: [
    QUESTION_PACKAGE_TOPICS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_PACKAGE_TOPICS.WATERING_CONTEXT
  ],
  [QUESTION_PACKAGE_TOPICS.LIGHT_CHANGE_CONTEXT]: [
    QUESTION_PACKAGE_TOPICS.LIGHT_CHANGE_CONTEXT,
    QUESTION_PACKAGE_TOPICS.LIGHT_EXPOSURE
  ],
  [QUESTION_PACKAGE_TOPICS.FERTILIZATION_GROWTH_CONTEXT]: [
    QUESTION_PACKAGE_TOPICS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_PACKAGE_TOPICS.FERTILIZATION_CONTEXT
  ],
  [QUESTION_PACKAGE_TOPICS.YELLOWING_PROGRESSION_SPEED]: [
    QUESTION_PACKAGE_TOPICS.YELLOWING_PROGRESSION_SPEED,
    QUESTION_PACKAGE_TOPICS.PROGRESSION
  ]
}

function resolveYellowingEquivalentDimensions(packageTopic = '') {
  const normalizedPackageTopic = normalizeQuestionPackageTopic(packageTopic, '')
  if (!normalizedPackageTopic) {return []}

  const equivalents = new Set([
    normalizedPackageTopic,
    ...(YELLOWING_CONDITION_DIMENSION_EQUIVALENTS[normalizedPackageTopic] || [])
  ])

  for (const [sourceDimension, sourceEquivalents] of Object.entries(YELLOWING_CONDITION_DIMENSION_EQUIVALENTS)) {
    if (
      sourceDimension === normalizedPackageTopic ||
      (Array.isArray(sourceEquivalents) && sourceEquivalents.includes(normalizedPackageTopic))
    ) {
      equivalents.add(sourceDimension)
      for (const dimension of Array.isArray(sourceEquivalents) ? sourceEquivalents : []) {
        equivalents.add(dimension)
      }
    }
  }

  return Array.from(equivalents)
}

function isYellowingConditionSymptomKey(symptomKey = '') {
  return YELLOWING_CONDITION_SYMPTOM_KEYS.has(normalizeKey(symptomKey))
}

function collectAnsweredPackageTopics(askedQuestions = []) {
  return new Set(
    (Array.isArray(askedQuestions) ? askedQuestions : [])
      .map(item => {
        const questionKey = normalizeKey(item?.questionKey || item?.question_key || item?.symptom_key || '')
        const parsedSyntheticObservedProbe = parseSyntheticObservedProbeQuestionKey(questionKey)
        return normalizeQuestionPackageTopic(item?.packageTopic || item?.package_topic || '', '') ||
          normalizeQuestionPackageTopic(parsedSyntheticObservedProbe?.packageTopic || '', '')
      })
      .filter(Boolean)
  )
}

function hasAnsweredYellowingConditionDimension(answeredTopics = new Set(), packageTopic = '') {
  const equivalents = resolveYellowingEquivalentDimensions(packageTopic)
  return equivalents.some(dimension => answeredTopics.has(dimension))
}

function resolveNextMissingYellowingGroupDimension(answeredTopics = new Set()) {
  return YELLOWING_REQUIRED_GROUP_DIMENSIONS.find(
    dimension => !hasAnsweredYellowingConditionDimension(answeredTopics, dimension)
  ) || ''
}

function isYellowingEquivalentDimensionAnswered(askedQuestions = [], question = {}) {
  const targetSymptomKey = normalizeKey(question?.targetSymptomKey || question?.target_symptom_key || '')
  if (!isYellowingConditionSymptomKey(targetSymptomKey)) {
    return false
  }
  const packageTopic = normalizeQuestionPackageTopic(
    question?.packageTopic || question?.package_topic || '',
    ''
  )
  if (!packageTopic) {
    return false
  }
  const equivalents = resolveYellowingEquivalentDimensions(packageTopic)
  if (!equivalents.length) {
    return false
  }
  const answeredTopics = collectAnsweredPackageTopics(askedQuestions)
  return equivalents.some(dimension => answeredTopics.has(dimension))
}

function isQuestionDimensionEquivalentToAllowed(allowedTopics = new Set(), packageTopic = '') {
  const normalizedPackageTopic = normalizeQuestionPackageTopic(packageTopic, '')
  if (!normalizedPackageTopic) {return true}
  if (allowedTopics.has(normalizedPackageTopic)) {return true}
  for (const allowedDimension of allowedTopics) {
    const equivalents = resolveYellowingEquivalentDimensions(allowedDimension)
    if (equivalents.includes(normalizedPackageTopic)) {
      return true
    }
  }
  return false
}

function isPackageTopicInYellowingRequiredGroups(packageTopic = '') {
  const normalizedPackageTopic = normalizeQuestionPackageTopic(packageTopic, '')
  if (!normalizedPackageTopic) {return false}
  if (YELLOWING_REQUIRED_GROUP_DIMENSIONS.includes(normalizedPackageTopic)) {return true}
  return YELLOWING_REQUIRED_GROUP_DIMENSIONS.some(requiredDimension =>
    resolveYellowingEquivalentDimensions(requiredDimension).includes(normalizedPackageTopic)
  )
}

function collectYellowingAllowedDimensionsForAnsweredBranch(askedQuestions = []) {
  const answeredTopics = collectAnsweredPackageTopics(askedQuestions)
  const allowed = new Set(
    YELLOWING_REQUIRED_GROUP_DIMENSIONS.filter(dimension =>
      hasAnsweredYellowingConditionDimension(answeredTopics, dimension)
    )
  )
  const nextMissingDimension = resolveNextMissingYellowingGroupDimension(answeredTopics)
  if (nextMissingDimension) {
    allowed.add(nextMissingDimension)
  }
  return allowed.size ? allowed : null
}

function isYellowingQuestionAllowedByAnsweredBranch(askedQuestions = [], question = {}, options = {}) {
  const { yellowingConditionMode = false } = options || {}
  if (yellowingConditionMode) {
    const packageTopic = normalizeQuestionPackageTopic(
      question?.packageTopic || question?.package_topic || '',
      ''
    )
    if (!isPackageTopicInYellowingRequiredGroups(packageTopic)) {
      return false
    }
  }
  const targetSymptomKey = normalizeKey(question?.targetSymptomKey || question?.target_symptom_key || '')
  if (!isYellowingConditionSymptomKey(targetSymptomKey) && !yellowingConditionMode) {
    return true
  }
  const allowedTopics = collectYellowingAllowedDimensionsForAnsweredBranch(askedQuestions)
  if (!allowedTopics) {
    return true
  }
  const packageTopic = normalizeQuestionPackageTopic(
    question?.packageTopic || question?.package_topic || '',
    ''
  )
  if (!packageTopic) {
    return false
  }
  return isQuestionDimensionEquivalentToAllowed(allowedTopics, packageTopic)
}

function getAnsweredOptionKey(answerLikeRecords = [], questionKey = '') {
  const normalizedQuestionKey = normalizeKey(questionKey)
  if (!normalizedQuestionKey) {return ''}
  const found = (Array.isArray(answerLikeRecords) ? answerLikeRecords : [])
    .slice()
    .reverse()
    .find(item => normalizeKey(item?.questionKey || item?.question_key || '') === normalizedQuestionKey)
  return normalizeKey(found?.optionKey || found?.option_key || '')
}

function countAnsweredQuestions(answerLikeRecords = [], questionKeys = new Set()) {
  const normalizedQuestionKeys = new Set(
    Array.from(questionKeys || []).map(item => normalizeKey(item)).filter(Boolean)
  )
  if (!normalizedQuestionKeys.size) {return 0}
  return (Array.isArray(answerLikeRecords) ? answerLikeRecords : [])
    .filter(item => normalizedQuestionKeys.has(normalizeKey(item?.questionKey || item?.question_key || '')))
    .length
}

function collectAnswerRouteRecords(answers = [], askedQuestionRows = []) {
  const rowsByQuestionKey = new Map(
    (Array.isArray(askedQuestionRows) ? askedQuestionRows : [])
      .map(item => [normalizeKey(item?.questionKey || item?.question_key || ''), item])
      .filter(([questionKey]) => Boolean(questionKey))
  )
  return (Array.isArray(answers) ? answers : [])
    .map(answer => {
      const questionKey = normalizeKey(answer?.questionKey || answer?.question_key || '')
      const row = rowsByQuestionKey.get(questionKey) || {}
      return {
        ...row,
        questionKey,
        optionKey: normalizeKey(answer?.optionKey || answer?.option_key || ''),
        packageTopic:
          row.packageTopic ||
          row.package_topic ||
          answer?.packageTopic ||
          answer?.package_topic ||
          '',
        targetSymptomKey:
          row.targetSymptomKey ||
          row.target_symptom_key ||
          answer?.targetSymptomKey ||
          answer?.target_symptom_key ||
          ''
      }
    })
    .filter(item => item.questionKey)
}

function collectRouteAnswerRecordsForDecision({
  answers = [],
  answeredQuestionAnswerRecords = []
} = {}) {
  const recordsByQuestionKey = new Map()
  for (const item of Array.isArray(answeredQuestionAnswerRecords) ? answeredQuestionAnswerRecords : []) {
    const questionKey = normalizeKey(item?.questionKey || item?.question_key || '')
    const optionKey = normalizeKey(item?.optionKey || item?.option_key || item?.answerValue || item?.answer_value || '')
    if (!questionKey || !optionKey) {continue}
    if (isDisabledYellowingFlowQuestion(item)) {continue}
    recordsByQuestionKey.set(questionKey, {
      ...item,
      questionKey,
      optionKey
    })
  }
  for (const item of Array.isArray(answers) ? answers : []) {
    const questionKey = normalizeKey(item?.questionKey || item?.question_key || '')
    const optionKey = normalizeKey(item?.optionKey || item?.option_key || item?.answerValue || item?.answer_value || '')
    if (!questionKey || !optionKey) {continue}
    if (isDisabledYellowingFlowQuestion(item)) {continue}
    recordsByQuestionKey.set(questionKey, {
      ...item,
      questionKey,
      optionKey
    })
  }
  return Array.from(recordsByQuestionKey.values())
}

function collectMatchedRouteEffectOutcomeKeys(routeAnswerEffects = [], answers = []) {
  const answeredPairSet = new Set(
    (Array.isArray(answers) ? answers : [])
      .filter(item => !isDisabledYellowingFlowQuestion(item))
      .map(item => {
        const questionKey = normalizeKey(item?.questionKey || item?.question_key || '')
        const optionKey = normalizeKey(item?.optionKey || item?.option_key || item?.answerValue || item?.answer_value || '')
        return questionKey && optionKey ? `${questionKey}:${optionKey}` : ''
      })
      .filter(Boolean)
  )

  return Array.from(
    new Set(
      (Array.isArray(routeAnswerEffects) ? routeAnswerEffects : [])
        .filter(item => {
          if (isDisabledYellowingFlowQuestion(item)) {return false}
          const questionKey = normalizeKey(item?.questionKey || item?.question_key || '')
          const optionKey = normalizeKey(item?.optionKey || item?.option_key || '')
          return questionKey && optionKey && answeredPairSet.has(`${questionKey}:${optionKey}`)
        })
        .flatMap(item => [
          item?.outcomeKey || item?.outcome_key || '',
          item?.redirectOutcomeKey || item?.redirect_outcome_key || ''
        ])
        .map(item => normalizeKey(item))
        .filter(Boolean)
    )
  )
}

function buildRouteAnswerEffectDedupKey(effect = {}) {
  return [
    effect?.questionKey || effect?.question_key || '',
    effect?.optionKey || effect?.option_key || '',
    effect?.outcomeKey || effect?.outcome_key || '',
    effect?.redirectOutcomeKey || effect?.redirect_outcome_key || '',
    effect?.routeKey || effect?.route_key || '',
    effect?.effectType || effect?.effect_type || ''
  ]
    .map(item => normalizeKey(item))
    .join('::')
}

function collectRouteAnswerEffectQuestionKeySet(routeAnswerEffects = []) {
  return new Set(
    (Array.isArray(routeAnswerEffects) ? routeAnswerEffects : [])
      .filter(item => !isDisabledYellowingFlowQuestion(item))
      .map(item => normalizeKey(item?.questionKey || item?.question_key || ''))
      .filter(Boolean)
  )
}

function mergeRouteAnswerEffects(preloadedRouteAnswerEffects = [], fetchedRouteAnswerEffects = []) {
  const mergedEffects = new Map()
  for (const effect of [
    ...(Array.isArray(preloadedRouteAnswerEffects) ? preloadedRouteAnswerEffects : []),
    ...(Array.isArray(fetchedRouteAnswerEffects) ? fetchedRouteAnswerEffects : [])
  ]) {
    if (isDisabledYellowingFlowQuestion(effect)) {continue}
    const dedupKey = buildRouteAnswerEffectDedupKey(effect)
    if (!dedupKey || mergedEffects.has(dedupKey)) {continue}
    mergedEffects.set(dedupKey, effect)
  }
  return Array.from(mergedEffects.values())
}

async function resolveRouteAnswerEffectsForFastPath({
  routeAnswerEffectQuestionKeys = [],
  preloadedRouteAnswerEffects = null,
  routeAnswerEffectsFetcher = null
} = {}) {
  const normalizedQuestionKeys = Array.from(
    new Set(
      (Array.isArray(routeAnswerEffectQuestionKeys) ? routeAnswerEffectQuestionKeys : [])
        .map(item => normalizeKey(item))
        .filter(Boolean)
    )
  )
  const safePreloadedRouteAnswerEffects = Array.isArray(preloadedRouteAnswerEffects)
    ? preloadedRouteAnswerEffects
    : null
  const preloadedQuestionKeySet = safePreloadedRouteAnswerEffects
    ? collectRouteAnswerEffectQuestionKeySet(safePreloadedRouteAnswerEffects)
    : new Set()
  const missingQuestionKeys = normalizedQuestionKeys.filter(
    questionKey => !preloadedQuestionKeySet.has(questionKey)
  )

  if (!normalizedQuestionKeys.length) {
    return {
      ok: true,
      routeAnswerEffects: [],
      missingQuestionKeys: [],
      fetchedQuestionKeys: []
    }
  }

  if (safePreloadedRouteAnswerEffects && !missingQuestionKeys.length) {
    return {
      ok: true,
      routeAnswerEffects: mergeRouteAnswerEffects(safePreloadedRouteAnswerEffects, []),
      missingQuestionKeys: [],
      fetchedQuestionKeys: [],
      usedPreloadedOnly: true
    }
  }

  if (typeof routeAnswerEffectsFetcher !== 'function') {
    throw new Error('routeAnswerEffectsFetcher is required')
  }

  const fetchQuestionKeys = missingQuestionKeys.length
    ? missingQuestionKeys
    : normalizedQuestionKeys
  try {
    const fetchedRouteAnswerEffects = await routeAnswerEffectsFetcher(fetchQuestionKeys)
    return {
      ok: true,
      routeAnswerEffects: mergeRouteAnswerEffects(
        safePreloadedRouteAnswerEffects || [],
        fetchedRouteAnswerEffects
      ),
      missingQuestionKeys,
      fetchedQuestionKeys: fetchQuestionKeys,
      usedPreloadedOnly: false
    }
  } catch (error) {
    return {
      ok: false,
      error,
      routeAnswerEffects: [],
      missingQuestionKeys,
      fetchedQuestionKeys: fetchQuestionKeys,
      usedPreloadedOnly: false
    }
  }
}

function resolveRuntimeClassKey(symptomClassRuntime = null) {
  return normalizeKey(
    symptomClassRuntime?.currentClassKey ||
    symptomClassRuntime?.primaryClass?.classKey ||
    symptomClassRuntime?.current_class_key ||
    ''
  )
}

function hasPositiveRootBridgeAnswer(answerLikeRecords = []) {
  return (Array.isArray(answerLikeRecords) ? answerLikeRecords : []).some(item =>
    ROOT_BRIDGE_QUESTION_KEYS.has(normalizeKey(item?.questionKey || item?.question_key || '')) &&
    ['yes', 'wet_soil', 'poor_drainage'].includes(
      normalizeKey(item?.optionKey || item?.option_key || '')
    )
  )
}

function shouldBlockQuestionByRouteConstraint(question = {}, {
  answers = [],
  askedQuestionRows = [],
  symptomClassRuntime = null
} = {}) {
  const questionKey = normalizeKey(question?.questionKey || question?.question_key || '')
  if (!questionKey) {return false}
  const questionPackageTopic = normalizeQuestionPackageTopic(
    question?.packageTopic || question?.package_topic || '',
    ''
  )

  const runtimeClassKey = resolveRuntimeClassKey(symptomClassRuntime)
  const answerRouteRecords = collectAnswerRouteRecords(answers, askedQuestionRows)
  if (
    YELLOWING_CONDITION_CLASS_KEYS.has(runtimeClassKey) &&
    isDisabledYellowingFlowQuestion(question)
  ) {
    return true
  }
  const yellowingPrimaryClue = getAnsweredOptionKey(
    answerRouteRecords,
    YELLOWING_PRIMARY_CLUE_TOPIC_QUESTION_KEY
  )

  if (
    YELLOWING_CONDITION_CLASS_KEYS.has(runtimeClassKey) &&
    !yellowingPrimaryClue &&
    !YELLOWING_REQUIRED_GROUP_DIMENSIONS.includes(questionPackageTopic)
  ) {
    return true
  }

  if (
    ['pest_trace', 'disease_trace', 'care_context'].includes(yellowingPrimaryClue) &&
    questionKey === YELLOWING_LEAF_AGE_PATTERN_QUESTION_KEY
  ) {
    return true
  }

  if (
    yellowingPrimaryClue &&
    yellowingPrimaryClue !== 'care_context' &&
    questionKey === LEAF_YELLOWING_FERTILIZATION_BACKGROUND_QUESTION_KEY
  ) {
    return true
  }

  const structuralCause = getAnsweredOptionKey(
    answerRouteRecords,
    'q_observed_probe__holes_in_leaf__structural_cause'
  )
  const holesConfirm = getAnsweredOptionKey(answerRouteRecords, 'q_holes_in_leaf_confirm')
  const structuralBranchDenied =
    ['unknown', 'lesion_dropout', 'mechanical_old'].includes(structuralCause) ||
    ['no', 'unknown'].includes(holesConfirm)

  if (
    STRUCTURAL_DAMAGE_CLASS_KEYS.has(runtimeClassKey) &&
    structuralBranchDenied &&
    (ROOT_ZONE_DETAIL_QUESTION_KEYS.has(questionKey) || ROOT_BRIDGE_QUESTION_KEYS.has(questionKey))
  ) {
    return true
  }

  const underwaterAnswer = getAnsweredOptionKey(answerRouteRecords, 'q_underwater_dry_wilt')
  if (
    runtimeClassKey === 'water_stress_mode' &&
    underwaterAnswer === 'no' &&
    ROOT_ZONE_DETAIL_QUESTION_KEYS.has(questionKey) &&
    !hasPositiveRootBridgeAnswer(answerRouteRecords)
  ) {
    return true
  }

  if (
    runtimeClassKey === 'soft_rot_mode' &&
    ROOT_ZONE_DETAIL_QUESTION_KEYS.has(questionKey) &&
    countAnsweredQuestions(answerRouteRecords, ROOT_ZONE_DETAIL_QUESTION_KEYS) >= 2
  ) {
    return true
  }

  return false
}

function filterQuestionsByAnsweredRouteConstraints(questions = [], options = {}) {
  return (Array.isArray(questions) ? questions : [])
    .filter(question => !shouldBlockQuestionByRouteConstraint(question, options))
}

async function buildCandidatePriors(
  plantContext,
  observedSymptoms = [],
  { round = 1, stage = 'preliminary', causalityEdges = null } = {}
) {
  const symptomKeys = Array.from(
    new Set((observedSymptoms || []).map(item => String(item?.symptomKey || '').trim()).filter(Boolean))
  )

  const linkedPriorBundle = await getLinkedCandidatePriors(plantContext)
  const linkedPriors = Array.isArray(linkedPriorBundle?.priors) ? linkedPriorBundle.priors : []
  const shouldUseSessionConservative = !linkedPriorBundle?.hasAnyLinks
  const [plantPriors, genusPriors, hostPriors, evidenceEdges] = await Promise.all([
    shouldUseSessionConservative
      ? getCandidateProblemPriors(plantContext)
      : Promise.resolve([]),
    shouldUseSessionConservative
      ? getGenusCandidatePriors(plantContext.genus)
      : Promise.resolve([]),
    shouldUseSessionConservative
      ? getHostCandidatePriors({
          genus: plantContext.genus,
          family: plantContext.family,
          category: plantContext.category
        })
      : Promise.resolve([]),
    symptomKeys.length
      ? getEvidenceEdges({ symptomKeys })
      : Promise.resolve([])
  ])

  const evidenceOnlyPriors = Array.from(
    new Set((evidenceEdges || []).map(item => item.problemKey).filter(Boolean))
  ).map(problemKey => ({
    problemKey,
    genusSuitability: null,
    hostSuitability: null,
    finalPriorScore: 0.35,
    matchedHostLevel: '',
    sourceLayer: 'evidence_hit',
      dataStatus: 'partial'
    }))

  const prioritizedStaticPriors =
    linkedPriors.length || !shouldUseSessionConservative
      ? linkedPriors
      : mergeCandidatePriors(plantPriors, genusPriors, hostPriors)
  const merged = mergeCandidatePriors(
    prioritizedStaticPriors,
    evidenceOnlyPriors
  )

  if (Number(round || 1) <= 1 && stage !== 'question') {
    return merged
  }

  const baseProblemKeys = merged.map(item => item.problemKey)
  const resolvedCausalityEdges = Array.isArray(causalityEdges)
    ? causalityEdges
    : baseProblemKeys.length
      ? await getCausalityEdges(baseProblemKeys)
      : []
  const causalLinkedPriors = Array.from(
    new Set(
      (resolvedCausalityEdges || [])
        .flatMap(item => [item.causeProblemKey, item.effectProblemKey])
        .filter(Boolean)
    )
  )
    .filter(problemKey => !baseProblemKeys.includes(problemKey))
    .map(problemKey => ({
      problemKey,
      genusSuitability: null,
      hostSuitability: null,
      finalPriorScore: 0.2,
      matchedHostLevel: '',
      sourceLayer: 'causal_linked',
      dataStatus: 'partial'
    }))

  const result = mergeCandidatePriors(merged, causalLinkedPriors)
  if (Array.isArray(resolvedCausalityEdges)) {
    result.__causalityEdges = resolvedCausalityEdges
  }
  return result
}

function collectMappedSymptomKeysFromAnswers(answers = [], optionMappings = []) {
  const answerKeySet = new Set(
    (answers || []).map(item => `${item.questionKey}::${item.optionKey}`)
  )
  return optionMappings
    .filter(item => answerKeySet.has(`${item.questionKey}::${item.optionKey}`))
    .map(item => item.mapsToSymptomKey)
    .filter(Boolean)
}

function parseQuestionRationaleMeta(rationale = '') {
  if (rationale && typeof rationale === 'object') {
    return rationale
  }

  const raw = String(rationale || '').trim()
  if (!raw) {return {}}

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function collectAnswerLikeRecordsFromQuestionRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => Number(row?.asked || 0) === 1)
    .map(row => {
      const rationale = parseQuestionRationaleMeta(row?.rationale)
      return {
        questionKey: String(
          rationale?.questionKey ||
            rationale?.qk ||
            row?.symptom_key ||
            ''
        ).trim(),
        optionKey: String(row?.answer_value || '').trim().toLowerCase(),
        status: String(row?.status || '').trim().toLowerCase(),
        targetSymptomKey: String(rationale?.targetSymptomKey || rationale?.tsk || '').trim(),
        packageTopic: String(rationale?.packageTopic || rationale?.td || '').trim(),
        packageSection: String(rationale?.packageSection || rationale?.rs || '').trim()
      }
    })
    .filter(item => item.questionKey && item.optionKey)
}

function mergeAskedQuestionRows(...groups) {
  const map = new Map()

  for (const item of groups.flat()) {
    const questionKey = normalizeKey(item?.questionKey || item?.question_key || item?.symptom_key || '')
    if (!questionKey) {continue}

    const existing = map.get(questionKey) || {}
    const parsedSyntheticObservedProbe = parseSyntheticObservedProbeQuestionKey(questionKey)
    const packageTopic =
      normalizeQuestionPackageTopic(item?.packageTopic || item?.package_topic || '', '') ||
      normalizeQuestionPackageTopic(
        parsedSyntheticObservedProbe?.packageTopic || '',
        ''
      ) ||
      normalizeQuestionPackageTopic(existing?.packageTopic || existing?.package_topic || '', '')
    const targetSymptomKey = normalizeKey(
      item?.targetSymptomKey ||
        item?.target_symptom_key ||
        parsedSyntheticObservedProbe?.symptomKey ||
        existing?.targetSymptomKey ||
        existing?.target_symptom_key ||
        ''
    )
    const packageSection = normalizeKey(
      item?.packageSection ||
        item?.package_section ||
        existing?.packageSection ||
        existing?.package_section ||
        ''
    )

    map.set(questionKey, {
      ...existing,
      ...item,
      questionKey,
      packageTopic,
      targetSymptomKey,
      packageSection
    })
  }

  return Array.from(map.values())
}

function collectPositiveMappedObservedSymptomsFromAnswers(answers = [], optionMappings = []) {
  const answerKeySet = new Set(
    (answers || []).map(item => `${item.questionKey}::${item.optionKey}`)
  )
  const observedMap = new Map()

  for (const item of optionMappings || []) {
    if (!answerKeySet.has(`${item.questionKey}::${item.optionKey}`)) {continue}

    const mappedSymptomKey = String(item.mapsToSymptomKey || '').trim()
    const answerValue = Number(item.value || 0)
    const associationStrength = clamp01(item.associationStrength)
    if (!mappedSymptomKey || answerValue <= 0 || associationStrength <= 0) {continue}

    const confidence = clamp01(Math.max(answerValue, associationStrength))
    const current = observedMap.get(mappedSymptomKey)
    if (!current || confidence > Number(current.confidence || 0)) {
      observedMap.set(mappedSymptomKey, {
        symptomKey: mappedSymptomKey,
        symptomCn: mappedSymptomKey,
        confidence,
        source: 'follow_up_yes'
      })
    }
  }

  return Array.from(observedMap.values())
}

function resolveIdentityResolutionStatus(plantContext = {}) {
  if (plantContext?.identityResolutionStatus) {
    return plantContext.identityResolutionStatus
  }
  return plantContext?.plantIdentityId ? 'matched' : 'unresolved'
}

function normalizeRoutePrimaryAction(value = '') {
  const normalized = String(value || '').trim()
  return ['retake_first', 'ask_first', 'uncertain_prepare', 'standard_flow'].includes(normalized)
    ? normalized
    : ''
}

function normalizeRouteHints(routeHints = []) {
  return (Array.isArray(routeHints) ? routeHints : [])
    .map(item => ({
      type: String(item?.type || '').trim(),
      reason: String(item?.reason || '').trim(),
      score: Number(item?.score || 0),
      label: String(item?.label || '').trim()
    }))
    .filter(item => item.type)
}

function resolveVisualRouteContext(visualAggregateResult = null) {
  return {
    routePrimaryAction: normalizeRoutePrimaryAction(visualAggregateResult?.route_primary_action),
    routeHints: normalizeRouteHints(visualAggregateResult?.aggregate_route_hints || []),
    suggestedFollowupCapture: (Array.isArray(visualAggregateResult?.suggested_question_capture)
      ? visualAggregateResult.suggested_question_capture
      : []
    )
      .map(item => String(item || '').trim())
      .filter(Boolean)
  }
}

function buildRetakeAdviceFromVisualRouteContext(visualRouteContext = {}) {
  const questionCapture = Array.isArray(visualRouteContext?.suggestedFollowupCapture)
    ? visualRouteContext.suggestedFollowupCapture
    : []

  if (questionCapture.length) {
    return Array.from(
      new Set(
        questionCapture.map(item =>
          item.startsWith('请') ? item : `请优先补拍：${item}`
        )
      )
    )
  }

  return [
    '请优先补拍更清晰的受损部位近照。',
    '请补拍主体更完整的整株图，避免只拍局部。'
  ]
}

function normalizeVisualCandidateBand(value = '', conservative = 'low') {
  const normalized = String(value || '').trim().toLowerCase()
  return ['low', 'medium', 'high'].includes(normalized) ? normalized : conservative
}

function normalizeVisualCandidateStrength(value = '', conservative = 'weak') {
  const normalized = String(value || '').trim().toLowerCase()
  return ['weak', 'medium', 'strong'].includes(normalized) ? normalized : conservative
}

function normalizeVisualCandidateReadiness(value = '', conservative = 'cautious') {
  const normalized = String(value || '').trim().toLowerCase()
  return ['retain_only', 'cautious', 'ready'].includes(normalized) ? normalized : conservative
}

function scoreVisualCandidateSeed(item = {}) {
  const bandScore = {
    low: 20,
    medium: 40,
    high: 60
  }[normalizeVisualCandidateBand(item?.confidenceBand, 'low')] || 0
  const strengthScore = {
    weak: 10,
    medium: 20,
    strong: 30
  }[normalizeVisualCandidateStrength(item?.strengthLevel, 'weak')] || 0
  const readinessScore = {
    retain_only: 0,
    cautious: 15,
    ready: 30
  }[normalizeVisualCandidateReadiness(item?.admissionReadiness, 'cautious')] || 0
  const supportScore = Math.max(0, Number(item?.supportCount || 0) - 1) * 8
  const reliabilityScore = Math.round(clamp01(item?.signalReliability ?? 0.6) * 20)
  return bandScore + strengthScore + readinessScore + supportScore + reliabilityScore
}

function shouldUseVisualCandidateSeedQuestion(item = {}) {
  const candidateSource = normalizeKey(item?.candidateSource || '')
  const supportCount = Number(item?.supportCount || 0)
  const candidateScore = scoreVisualCandidateSeed(item)
  const structuralDamageCandidate = isStructuralDamageCandidate(item)
  const moldOrLesionCandidate = isMoldOrLesionCandidate(item)

  if (candidateSource !== 'out_of_pool_proxy') {
    return candidateScore >= 55
  }

  if (isBroadPestProxyCandidate(item)) {
    return candidateScore >= 45
  }

  if (structuralDamageCandidate) {
    return candidateScore >= 45
  }

  if (moldOrLesionCandidate) {
    return candidateScore >= 50
  }

  return supportCount >= 2 && candidateScore >= 70
}

function isBroadPestProxyCandidate(item = {}) {
  const symptomKey = normalizeKey(item?.symptomKey || '')
  const patternKey = normalizeKey(item?.patternKey || '')

  return (
    ['yellow_speckling', 'sticky_honeydew', 'silver_streaks', 'stippling'].includes(symptomKey) ||
    ['speckling', 'stippling'].includes(patternKey)
  )
}

function isStructuralDamageCandidate(item = {}) {
  const symptomKey = normalizeKey(item?.symptomKey || '')
  const patternKey = normalizeKey(item?.patternKey || '')

  return (
    ['chewed_edges', 'holes_in_leaf', 'skeletonized_leaves'].includes(symptomKey) ||
    ['chew', 'holes', 'skeletonization'].includes(patternKey)
  )
}

function isMoldOrLesionCandidate(item = {}) {
  const symptomKey = normalizeKey(item?.symptomKey || '')
  const patternKey = normalizeKey(item?.patternKey || '')

  return (
    [
      'black_spots_spreading',
      'brown_spots_halo',
      'irregular_blotches',
      'powder_white',
      'sooty_mold',
      'black_mold_growth',
      'water_soaked_spots'
    ].includes(symptomKey) ||
    ['spots', 'blotch', 'blotches', 'powder', 'mold', 'soaked'].includes(patternKey)
  )
}

function collectVisualCandidateSymptoms(visualAggregateResult = null, symptomDictionary = []) {
  if (!visualAggregateResult || typeof visualAggregateResult !== 'object') {
    return []
  }

  const symptomMap = mapByKey(symptomDictionary, 'symptomKey')
  const aggregatedSymptomCandidates = Array.isArray(visualAggregateResult?.aggregated_symptom_candidates)
    ? visualAggregateResult.aggregated_symptom_candidates
    : Array.isArray(visualAggregateResult?.aggregatedSymptomCandidates)
      ? visualAggregateResult.aggregatedSymptomCandidates
      : []
  const aggregatedCandidateMap = new Map(
    aggregatedSymptomCandidates
      .map(item => [String(item?.symptom_key || item?.symptomKey || '').trim(), item])
      .filter(([symptomKey]) => Boolean(symptomKey))
  )
  const candidateMap = new Map()

  const admissionRecords = Array.isArray(visualAggregateResult?.admission_records)
    ? visualAggregateResult.admission_records
    : Array.isArray(visualAggregateResult?.admissionRecords)
      ? visualAggregateResult.admissionRecords
      : []
  for (const item of admissionRecords) {
    if (String(item?.admission_result || item?.admissionResult || '').trim() !== 'candidate_retained') {
      continue
    }

    const symptomKey = String(
      item?.object_key ||
        item?.objectKey ||
        item?.candidate?.symptom_key ||
        item?.candidate?.symptomKey ||
        ''
    ).trim()
    if (!symptomKey) {continue}

    const candidate = item?.candidate || aggregatedCandidateMap.get(symptomKey) || {}
    const symptomMeta = symptomMap.get(symptomKey) || {}
    const nextEntry = {
      symptomKey,
      symptomCn: String(
        candidate?.display_name_cn ||
          candidate?.displayNameCn ||
          symptomMeta?.displayTextCn ||
          symptomMeta?.symptomCn ||
          symptomKey
      ).trim() || symptomKey,
      userObservationTipCn: String(symptomMeta?.userObservationTipCn || '').trim(),
      signalReliability: Number(symptomMeta?.signalReliability || 0),
      locationKey: normalizeKey(symptomMeta?.locationKey || ''),
      patternKey: normalizeKey(symptomMeta?.patternKey || ''),
      distributionKey: normalizeKey(symptomMeta?.distributionKey || ''),
      confidenceBand: normalizeVisualCandidateBand(
        candidate?.confidence_band || candidate?.confidenceBand,
        'medium'
      ),
      strengthLevel: normalizeVisualCandidateStrength(
        candidate?.strength_level || candidate?.strengthLevel,
        'medium'
      ),
      admissionReadiness: normalizeVisualCandidateReadiness(
        candidate?.admission_readiness || candidate?.admissionReadiness,
        'cautious'
      ),
      supportCount: Number(candidate?.support_count || candidate?.supportCount || 0),
      supportOrgans: Array.isArray(candidate?.support_organs)
        ? candidate.support_organs
        : Array.isArray(candidate?.supportOrgans)
          ? candidate.supportOrgans
        : [],
      supportingRegionNote: normalizeKey(
        candidate?.supporting_region_note || candidate?.supportingRegionNote || ''
      ),
      visualStructuralEvidenceStatus: normalizeKey(
        candidate?.visual_structural_evidence_status ||
          candidate?.visualStructuralEvidenceStatus ||
          ''
      )
    }
    const current = candidateMap.get(symptomKey)

    if (!current || scoreVisualCandidateSeed(nextEntry) > scoreVisualCandidateSeed(current)) {
      candidateMap.set(symptomKey, nextEntry)
    }
  }

  const outOfPoolHints = Array.isArray(visualAggregateResult?.out_of_pool_symptom_hints)
    ? visualAggregateResult.out_of_pool_symptom_hints
    : Array.isArray(visualAggregateResult?.outOfPoolSymptomHints)
      ? visualAggregateResult.outOfPoolSymptomHints
      : []
  for (const item of outOfPoolHints) {
    const symptomKey = normalizeKey(
      item?.symptom_key ||
        item?.symptomKey ||
        item?.closest_symptom_key_hint ||
        item?.closestSymptomKeyHint ||
        ''
    )
    if (!symptomKey) {continue}

    const symptomMeta = symptomMap.get(symptomKey) || {}
    if (!normalizeKey(symptomMeta?.symptomKey || '')) {continue}

    const hintCount = Math.max(1, Number(
      item?.support_count ||
        item?.supportCount ||
        item?.hint_count ||
        item?.hintCount ||
        1
    ))
    const nextEntry = {
      symptomKey,
      symptomCn: normalizeKey(
        symptomMeta?.displayTextCn || symptomMeta?.symptomCn || symptomKey
      ) || symptomKey,
      userObservationTipCn: normalizeKey(symptomMeta?.userObservationTipCn || ''),
      signalReliability: Number(symptomMeta?.signalReliability || 0),
      locationKey: normalizeKey(symptomMeta?.locationKey || ''),
      patternKey: normalizeKey(symptomMeta?.patternKey || ''),
      distributionKey: normalizeKey(symptomMeta?.distributionKey || ''),
      confidenceBand: hintCount >= 2 ? 'medium' : 'low',
      strengthLevel: hintCount >= 2 ? 'medium' : 'weak',
      admissionReadiness: 'cautious',
      supportCount: hintCount,
      supportOrgans: Array.isArray(item?.support_organs)
        ? item.support_organs
        : Array.isArray(item?.supportOrgans)
          ? item.supportOrgans
          : [],
      candidateSource: 'out_of_pool_proxy',
      hintReasons: Array.isArray(item?.reasons) ? item.reasons : []
    }
    const current = candidateMap.get(symptomKey)

    if (!current || scoreVisualCandidateSeed(nextEntry) > scoreVisualCandidateSeed(current)) {
      candidateMap.set(symptomKey, nextEntry)
    }
  }

  return Array.from(candidateMap.values()).sort(
    (a, b) => scoreVisualCandidateSeed(b) - scoreVisualCandidateSeed(a)
  )
}

function isWeakOutOfPoolHintOnlyVisualAggregate(visualAggregateResult = {}) {
  const formalCandidates = Array.isArray(visualAggregateResult?.aggregated_symptom_candidates)
    ? visualAggregateResult.aggregated_symptom_candidates
    : []
  const outOfPoolHints = Array.isArray(visualAggregateResult?.out_of_pool_symptom_hints)
    ? visualAggregateResult.out_of_pool_symptom_hints
    : []

  if (formalCandidates.length || !outOfPoolHints.length) {
    return false
  }

  return outOfPoolHints.every(item => {
    const supportCount = Math.max(1, Number(item?.support_count || item?.hint_count || 1))
    return supportCount <= 1
  })
}

function isOutOfPoolOnlyNoMappingVisualAggregate(visualAggregateResult = {}) {
  const formalCandidates = Array.isArray(visualAggregateResult?.aggregated_symptom_candidates)
    ? visualAggregateResult.aggregated_symptom_candidates
    : []
  const outOfPoolHints = Array.isArray(visualAggregateResult?.out_of_pool_symptom_hints)
    ? visualAggregateResult.out_of_pool_symptom_hints
    : []

  if (formalCandidates.length || !outOfPoolHints.length) {
    return false
  }

  return outOfPoolHints.every(item => {
    const mappingIds = Array.isArray(item?.mapping_ids)
      ? item.mapping_ids.map(id => normalizeKey(id)).filter(Boolean)
      : []
    const evidenceRole = normalizeKey(item?.evidence_role || '')
    const hintScope = normalizeKey(item?.hint_scope || '')
    return !mappingIds.length && (
      evidenceRole === 'audit' ||
      hintScope === 'audit_only' ||
      hintScope === 'out_of_pool_proxy'
    )
  })
}

function normalizeOutOfPoolMappingComparableText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitOutOfPoolMappingComparableText(value = '') {
  return normalizeOutOfPoolMappingComparableText(value).split(' ').filter(Boolean)
}

function hasOutOfPoolMappingMatch(rawNames = [], mappingTerms = []) {
  const normalizedRawNames = Array.isArray(rawNames)
    ? rawNames.map(item => normalizeOutOfPoolMappingComparableText(item)).filter(Boolean)
    : []
  if (!normalizedRawNames.length) {
    return false
  }

  const rawSet = new Set(normalizedRawNames)
  const rawTokens = new Set(normalizedRawNames.flatMap(item => splitOutOfPoolMappingComparableText(item)))

  return mappingTerms.some(term => {
    const normalizedTerm = normalizeOutOfPoolMappingComparableText(term)
    if (!normalizedTerm) {return false}
    if (rawSet.has(normalizedTerm)) {return true}

    return normalizedRawNames.some(rawName =>
      rawName.includes(normalizedTerm) || normalizedTerm.includes(rawName)
    ) || splitOutOfPoolMappingComparableText(normalizedTerm).some(token => rawTokens.has(token))
  })
}

async function hasAuditedOutOfPoolProxyMappingForAggregate(visualAggregateResult = {}) {
  const outOfPoolHints = Array.isArray(visualAggregateResult?.out_of_pool_symptom_hints)
    ? visualAggregateResult.out_of_pool_symptom_hints
    : []
  const hintsNeedingRuntimeMapping = outOfPoolHints
    .map(item => {
      const symptomKey = normalizeKey(item?.symptom_key || item?.closest_symptom_key_hint || '')
      const mappingIds = Array.isArray(item?.mapping_ids)
        ? item.mapping_ids.map(id => normalizeKey(id)).filter(Boolean)
        : []
      const rawNames = [
        ...(Array.isArray(item?.raw_visual_names_cn) ? item.raw_visual_names_cn : []),
        ...(Array.isArray(item?.raw_visual_names_en) ? item.raw_visual_names_en : []),
        ...(Array.isArray(item?.reasons) ? item.reasons : []),
        ...(symptomKey ? [symptomKey] : [])
      ]
        .map(normalizeOutOfPoolMappingComparableText)
        .filter(Boolean)

      return {
        symptomKey,
        mappingIds,
        rawNames
      }
    })
    .filter(item => item.symptomKey && !item.mappingIds.length && item.rawNames.length)

  if (!hintsNeedingRuntimeMapping.length) {
    return false
  }

  try {
    const {
      listAuditedOutOfPoolProxyMappings
    } = require('../repositories/out-of-pool-proxy-mapping-repository')
    const mappings = await listAuditedOutOfPoolProxyMappings()

    return hintsNeedingRuntimeMapping.some(hint =>
      mappings.some(mapping => {
        const targetSymptomKey = normalizeKey(mapping?.targetSymptomKey || '')
        if (targetSymptomKey !== hint.symptomKey) {
          return false
        }
        const mappingTerms = Array.isArray(mapping?.matchTerms)
          ? mapping.matchTerms.map(normalizeOutOfPoolMappingComparableText).filter(Boolean)
          : []
        return hasOutOfPoolMappingMatch(hint.rawNames, mappingTerms)
      })
    )
  } catch (error) {
    console.warn(
      'diagnose-http out-of-pool runtime mapping refresh failed:',
      String(error?.message || error || '')
    )
    return false
  }
}

function buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult = {}) {
  const outOfPoolHints = Array.isArray(visualAggregateResult?.out_of_pool_symptom_hints)
    ? visualAggregateResult.out_of_pool_symptom_hints
    : []

  return {
    formalSymptomCandidateCount: Array.isArray(visualAggregateResult?.aggregated_symptom_candidates)
      ? visualAggregateResult.aggregated_symptom_candidates.length
      : 0,
    outOfPoolHintCount: outOfPoolHints.length,
    outOfPoolHintKeys: outOfPoolHints
      .map(item => normalizeKey(item?.symptom_key || item?.closest_symptom_key_hint || ''))
      .filter(Boolean)
      .slice(0, 8),
    outOfPoolRawNames: outOfPoolHints
      .flatMap(item => [
        ...(Array.isArray(item?.raw_visual_names_cn) ? item.raw_visual_names_cn : []),
        ...(Array.isArray(item?.raw_visual_names_en) ? item.raw_visual_names_en : [])
      ])
      .map(item => normalizeKey(item))
      .filter(Boolean)
      .slice(0, 8)
  }
}

function buildOutOfPoolObservationConservative(decisionCause = null) {
  const details = decisionCause?.decisionCauseDetails && typeof decisionCause.decisionCauseDetails === 'object'
    ? decisionCause.decisionCauseDetails
    : {}
  const rawNames = Array.from(
    new Set(
      (Array.isArray(details?.outOfPoolRawNames) ? details.outOfPoolRawNames : [])
        .map(item => normalizeKey(item))
        .filter(Boolean)
    )
  ).slice(0, 3)

  if (!rawNames.length) {
    return null
  }

  return {
    observationNames: rawNames,
    observationText: rawNames.join('；')
  }
}

function buildSyntheticVisualCandidateQuestion(item = {}) {
  const symptomKey = String(item?.symptomKey || '').trim()
  if (!symptomKey) {return null}

  const symptomLabel = String(item?.symptomCn || symptomKey).trim() || symptomKey
  const helpText =
    String(item?.userObservationTipCn || '').trim() ||
    `请重点确认“${symptomLabel}”是否真实存在，尽量在自然光下查看受损部位、叶背和整片叶面。`

  return {
    questionKey: buildSyntheticVisualCandidateQuestionKey(symptomKey),
    selectionSource: 'controlled_conservative',
    targetSymptomKey: symptomKey,
    packageTopic: QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE,
    packageSection: QUESTION_PACKAGE_SECTIONS.SYMPTOM_CONFIRMATION,
    routePackageRole: 'symptom_confirmation',
    packageEffect: 'evidence_admission',
    questionText: `图片里疑似出现“${symptomLabel}”，你复看后是否也能确认？`,
    helpText,
    questionGroupKey: buildVisualCandidateQuestionGroupKey(symptomKey),
    questionType: 'single_choice',
    options: [
      { optionKey: 'yes', text: '是的' },
      { optionKey: 'no', text: '不是的' },
      { optionKey: 'unknown', text: '看不出/不确定' }
    ],
    whyThisQuestion: `这题用于确认候选视觉症状“${symptomLabel}”是否能进入正式诊断。`
  }
}

function buildUncertainRoundResult({
  sessionId,
  round = 1,
  stage = 'final',
  observedSymptoms = [],
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  diagnosisDirections = [],
  plantContext = {},
  confidenceReasons = [],
  advice = [],
  routePrimaryAction = 'uncertain_prepare',
  uncertainLegalityReason = 'input_unfillable',
  sourceReason = '',
  decisionCause = null
} = {}) {
  const resultId = toResultId(sessionId, round)
  const normalizedUncertainLegalityReason = String(
    uncertainLegalityReason || 'input_unfillable'
  ).trim() || 'input_unfillable'
  const normalizedConfidenceReasons = Array.from(
    new Set(
      [
        ...(Array.isArray(confidenceReasons) ? confidenceReasons : []),
        String(sourceReason || '').trim()
      ].filter(Boolean)
    )
  )
  const normalizedDecisionCause = normalizeDecisionCause(decisionCause)
  const isOutOfPoolUncertain =
    normalizedUncertainLegalityReason === 'out_of_pool_no_mapping' ||
    normalizedUncertainLegalityReason === 'out_of_pool_review_required' ||
    normalizedUncertainLegalityReason === 'out_of_pool_hint_unconfirmed' ||
    normalizedDecisionCause?.decisionCauseCategory === 'out_of_pool_visual_hint' ||
    normalizedDecisionCause?.decisionCauseCategory === 'visual_scope_gap'
  const outOfPoolObservationConservative = buildOutOfPoolObservationConservative(normalizedDecisionCause)
  const outOfPoolSummary = outOfPoolObservationConservative?.observationText
    ? `图片中存在当前自动诊断范围外的可见异常。模型原始观察为：${outOfPoolObservationConservative.observationText}。这不是正式诊断结论，系统暂不能给出针对性处理建议；建议先保持观察，避免仅凭本次结果进行大幅养护调整。`
    : '图片中存在当前自动诊断范围外的可见异常。系统无法把它稳定归入现有诊断路径，因此本次不继续常规诊断，也不判断为“暂无明显问题”。由于该异常尚未纳入当前诊断池，系统暂不能给出针对性的处理建议；建议先保持观察，避免仅凭本次结果进行大幅养护调整。'
  const summary = isOutOfPoolUncertain
    ? outOfPoolSummary
    : advice[0] || '当前证据不足，暂不能安全判断。'
  const formalStopDecision = {
    outcomeLocked: 'uncertain',
    stopReason: 'uncertain_output_ready',
    uncertainLegalityReason: normalizedUncertainLegalityReason,
    stopReasonDetail: normalizedDecisionCause?.decisionCauseKey || '',
    decisionCause: normalizedDecisionCause
  }
  const careGuidance = buildCareGuidance({
    plantContext,
    observedEvidenceSet,
    primaryProblemKey: '',
    outcomeType: 'uncertain'
  })
  const explanation = isOutOfPoolUncertain
    ? {
        whyItHappens: outOfPoolObservationConservative?.observationText
          ? `当前图片中有可见异常，但该异常未形成可确认的正式诊断证据。模型原始观察为：${outOfPoolObservationConservative.observationText}。`
          : '当前图片中有可见异常，但该异常超出当前自动诊断支持的症状范围，或尚未形成可确认的正式诊断证据。',
        whatToCheckNext: '可继续观察该异常是否扩大、重复出现或影响整体状态；如变化明显，建议由人工或更完整资料进一步确认。',
        firstAid: '在没有稳定归类前，先保持养护条件相对稳定，不建议仅凭本次结果进行针对性处理。',
        avoid: '避免把该异常直接等同于某个具体问题，也避免在缺少确认时大幅调整养护或使用处理措施。',
        reassurance: '跳过常规诊断是为了避免把诊断池外的异常硬套进现有问题。'
      }
    : {
        whyItHappens: '当前植物缺少可用规则数据或正式证据，继续硬判风险较高。',
        whatToCheckNext:
          careGuidance.environmentDeviationHints[0] ||
          advice[0] ||
          '建议补充更稳定的图片、宿主信息和症状观察后再判断。',
        firstAid: advice[1] || '先保持当前养护稳定，避免一次性大幅调整浇水、施肥或用药。',
        avoid: '不要在证据不足时立即大幅调整养护或连续使用药剂。',
        reassurance: '暂不硬判是当前更安全的输出。'
      }

  const response = {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    stage,
    observedSymptoms,
    topProblem: null,
    finalResult: {
      resultId,
      problemId: '',
      displayName: isOutOfPoolUncertain ? '发现诊断范围外的可见异常' : '暂不能稳定判断',
      summary,
      severity: 'low',
      urgency: isOutOfPoolUncertain ? 'low' : 'medium',
      outOfPoolObservation: outOfPoolObservationConservative
    },
    questionRequired: false,
    questions: [],
    contributingFactors: [],
    intermediateStates: [],
    problemCausality: [],
    resultExplanation: explanation,
    explanation,
    nextSteps: [
      ...advice.map((text, index) => ({
        stepId: `uncertain_${index + 1}`,
        text
      })),
      ...careGuidance.nextSteps,
      {
        stepId: 'step_1',
        text: explanation.firstAid
      }
    ],
    whatToAvoid: Array.from(
      new Set([explanation.avoid, ...(careGuidance.whatToAvoid || [])].filter(Boolean))
    ),
    confidenceLevel: 'low',
    confidenceReasons: normalizedConfidenceReasons,
    needHumanReview: true,
    outcomeType: 'uncertain',
    routePrimaryAction: normalizeRoutePrimaryAction(routePrimaryAction) || 'uncertain_prepare',
    stopReason: formalStopDecision.stopReason,
    stopReasonDetail: formalStopDecision.stopReasonDetail,
    outcomeLocked: formalStopDecision.outcomeLocked,
    uncertainLegalityReason: formalStopDecision.uncertainLegalityReason,
    decisionCause: normalizedDecisionCause,
    stopDecision: formalStopDecision,
    sessionStatus: 'completed',
    plantId: plantContext.userPlantId || plantContext.plantId || '',
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    careBaselineSummary: careGuidance.careBaselineSummary,
    environmentDeviationHints: careGuidance.environmentDeviationHints,
    resultId,
    timestamp: Date.now()
  }

  return {
    ...response,
    ...buildRuntimeArtifacts(response, {
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections
    })
  }
}

async function tryBuildRouteAnswerFastPath({
  sessionId,
  round,
  stage,
  plantContext,
  observedSymptomsForResolution,
  labeledObservedEvidenceForResolution,
  derivedEvidenceForResolution,
  diagnosisDirectionsForResolution,
  symptomClassRuntime,
  answers,
  askedQuestionKeys,
  answeredQuestionAnswerRecords,
  preloadedRouteAnswerEffects,
  visualAggregateResult,
  visualRouteContext,
  routeDebugTraceEnabled = false,
  perfLogger = null
} = {}) {
  const markFastPath = (stageName, details = {}) => {
    if (!perfLogger || typeof perfLogger.mark !== 'function') {return}
    perfLogger.mark(stageName, {
      round,
      ...details
    })
  }
  if (
    stage !== 'question' ||
    !isRouteOutputEnabled() ||
    !isRoutePlanningObservationEnabled() ||
    !Array.isArray(answers) ||
    !answers.length
  ) {
    markFastPath('route-fastpath-skip', {
      reason: 'precondition',
      stage,
      answerCount: Array.isArray(answers) ? answers.length : 0
    })
    return null
  }

  const routeAnswerRecordsForDecision = collectRouteAnswerRecordsForDecision({
    answers,
    answeredQuestionAnswerRecords
  })
  const routeAnswerEffectQuestionKeys = Array.from(
    new Set(
      routeAnswerRecordsForDecision
        .map(item => normalizeKey(item?.questionKey || item?.question_key || ''))
      .filter(Boolean)
    )
  )
  if (!routeAnswerEffectQuestionKeys.length) {
    markFastPath('route-fastpath-skip', { reason: 'no_route_answer_question_keys' })
    return null
  }

  const routeAnswerEffectsResolution = await resolveRouteAnswerEffectsForFastPath({
    routeAnswerEffectQuestionKeys,
    preloadedRouteAnswerEffects,
    routeAnswerEffectsFetcher: questionKeys =>
      outcomeRouteRepository.getOutcomeAnswerEffects(questionKeys),
    markFastPath,
    round
  })
  if (!routeAnswerEffectsResolution.ok) {
    markFastPath('route-fastpath-skip', {
      reason: 'route_answer_effects_fetch_failed',
      missingQuestionCount: routeAnswerEffectsResolution.missingQuestionKeys.length,
      fetchedQuestionCount: routeAnswerEffectsResolution.fetchedQuestionKeys.length
    })
    return null
  }
  const routeAnswerEffects = routeAnswerEffectsResolution.routeAnswerEffects
  const candidateOutcomeKeys = collectMatchedRouteEffectOutcomeKeys(
    routeAnswerEffects,
    routeAnswerRecordsForDecision
  )
  markFastPath('route-fastpath-effects-loaded', {
    questionCount: routeAnswerEffectQuestionKeys.length,
    effectCount: Array.isArray(routeAnswerEffects) ? routeAnswerEffects.length : 0,
    preloadedOnly: Boolean(routeAnswerEffectsResolution.usedPreloadedOnly),
    missingQuestionCount: routeAnswerEffectsResolution.missingQuestionKeys.length,
    candidateOutcomeCount: candidateOutcomeKeys.length
  })
  if (!candidateOutcomeKeys.length) {
    markFastPath('route-fastpath-skip', { reason: 'no_matched_route_effect_outcomes' })
    return null
  }

  const routeEvidenceContextForDecision = buildRouteEvidenceContext({
    plantContext,
    observedEvidenceSet: labeledObservedEvidenceForResolution,
    derivedEvidenceSet: derivedEvidenceForResolution,
    diagnosisDirections: diagnosisDirectionsForResolution,
    symptomClassRuntime,
    answerEffects: [],
    routeAnswerEffects,
    answers: routeAnswerRecordsForDecision,
    askedQuestionKeys,
    visualAggregateResult,
    routeHints: visualRouteContext?.routeHints || []
  })
  const routeDecision = await planOutcomeRoutes({
    candidateOutcomeKeys,
    routeEvidenceContext: routeEvidenceContextForDecision,
    maxVisibleOutcomes: 3,
    maxQuestionCount: 1,
    featureFlags: {
      routePlanningEnabled: true,
      skipRouteGroupExpansion: true
    }
  })
  const leadingVisibleOutcomeKey = resolveLeadingVisibleOutcomeKey(routeDecision)
  markFastPath('route-fastpath-route-planned', {
    mode: normalizeKey(routeDecision?.mode || ''),
    conservativePolicy: normalizeKey(routeDecision?.conservativePolicy || ''),
    leadingVisibleOutcomeKey,
    visibleOutcomeCount: Array.isArray(routeDecision?.visibleOutcomeKeys)
      ? routeDecision.visibleOutcomeKeys.length
      : 0
  })
  if (
    !isAuthoritativeRouteDecision(routeDecision) ||
    !Array.isArray(routeDecision?.visibleOutcomeKeys) ||
    !routeDecision.visibleOutcomeKeys.length
  ) {
    markFastPath('route-fastpath-skip', {
      reason: 'route_not_authoritative_or_visible',
      mode: normalizeKey(routeDecision?.mode || ''),
      conservativePolicy: normalizeKey(routeDecision?.conservativePolicy || ''),
      leadingVisibleOutcomeKey,
      visibleOutcomeCount: Array.isArray(routeDecision?.visibleOutcomeKeys)
        ? routeDecision.visibleOutcomeKeys.length
        : 0
    })
    return null
  }

  const routeOutcomeKeys = Array.from(
    new Set([
      ...(Array.isArray(routeDecision.visibleOutcomeKeys) ? routeDecision.visibleOutcomeKeys : [])
    ].map(item => normalizeKey(item)).filter(Boolean))
  )
  const routeOutcomes = routeOutcomeKeys.length
    ? await outcomeRouteRepository.getDiagnosisOutcomesByKeys(routeOutcomeKeys)
    : []
  markFastPath('route-fastpath-outcomes-loaded', {
    routeOutcomeCount: Array.isArray(routeOutcomes) ? routeOutcomes.length : 0
  })
  const primaryRouteOutcome = routeOutcomes.find(
    item => normalizeKey(item?.outcomeKey || '') === leadingVisibleOutcomeKey
  )
  const allActionProfileKeys = resolveVisibleRouteActionProfileKeys(routeDecision, routeOutcomes)
  const actionProfiles = allActionProfileKeys.length
    ? await outcomeRouteRepository.getOutcomeActionProfiles(allActionProfileKeys)
    : []
  const outputObservedEvidenceSet = labeledObservedEvidenceForResolution
  const outputObservedSymptoms = observedSymptomsForResolution
  const outputDerivedEvidenceSet = derivedEvidenceForResolution
  const outputDiagnosisDirections = diagnosisDirectionsForResolution
  markFastPath('route-fastpath-hit', {
    leadingVisibleOutcomeKey,
    visibleOutcomeCount: Array.isArray(routeDecision.visibleOutcomeKeys)
      ? routeDecision.visibleOutcomeKeys.length
      : 0,
    actionProfileCount: Array.isArray(actionProfiles) ? actionProfiles.length : 0
  })
  const routeLockedOutcomeType =
    normalizeKey(primaryRouteOutcome?.outcomeType || '') === 'non_problematic'
      ? 'non_problematic'
      : 'problematic'
  const stopDecision = {
    outcomeLocked: routeLockedOutcomeType,
    stopReason: 'route_visible_outcomes_ready',
    uncertainLegalityReason: '',
    stopReasonDetail: routeDecision?.decisionCause?.decisionCauseKey || '',
    decisionCause: normalizeDecisionCause(routeDecision?.decisionCause)
  }
  const publicResponse = formatDiagnosisResponse({
    sessionId,
    round,
    stage: 'final',
    observedSymptoms: outputObservedSymptoms,
    observedEvidenceSet: outputObservedEvidenceSet,
    derivedEvidenceSet: outputDerivedEvidenceSet,
    diagnosisDirections: outputDiagnosisDirections,
    candidateOutcomes: [],
    questions: [],
    problems: [],
    explanations: [],
    routeOutcomes,
    causality: [],
    plantContext,
    plantId: plantContext?.userPlantId || plantContext?.plantId,
    questionRequired: false,
    lowConfidence: { isLowConfidence: false, reasons: [], advice: [] },
    symptomClassRuntime,
    highSpecificityFastConvergence: null,
    stopDecision,
    routeDecision,
    routeOutputEnabled: true,
    actionProfiles
  })
  const enrichedResponse = {
    ...publicResponse,
    observedEvidenceSet: outputObservedEvidenceSet,
    plantIdentityId: plantContext?.plantIdentityId || '',
    identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
    latestVisualCallBatchId: plantContext?.latestVisualCallBatchId || '',
    highSpecificityFastConvergence: null,
    currentRoundIndex: round,
    currentRoundId: publicResponse.roundId
  }
  const result = {
    ...enrichedResponse,
    metrics: {
      routeDecision
    },
    routeDecision: routeDebugTraceEnabled ? sanitizeRouteDecisionForPublic(routeDecision) : null,
    plantContext
  }
  attachPrivateSymptomClassRuntime(result, symptomClassRuntime)
  return result
}

async function runDiagnosisRound({
  openid,
  plantId = null,
  userPlantId = null,
  preferCatalogPlantId = false,
  lockedPlantContext = null,
  observedSymptoms = [],
  observedEvidenceSet = [],
  visualAggregateResult = null,
  answers = [],
  askedQuestionKeys = [],
  answeredQuestionGroupKeys = [],
  unknownCountByGroup = {},
  symptomClassState = null,
  round = 1,
  stage = 'preliminary',
  answerOptionMappings: rawAnswerOptionMappings = [],
  storedQuestionRows: preloadedStoredQuestionRows = null,
  preloadedAskedQuestionRows = null,
  preloadedRouteAnswerEffects = null,
  sessionId,
  perfLogger = null
}) {
  const plantContext = lockedPlantContext
    ? {
        userPlantId: lockedPlantContext.userPlantId || userPlantId || null,
        plantId: lockedPlantContext.plantId || plantId || null,
        plantDisplayName: lockedPlantContext.plantDisplayName || '未知植物',
        plantIdentityId: lockedPlantContext.plantIdentityId || '',
        identityResolutionStatus: lockedPlantContext.identityResolutionStatus || '',
        latestVisualCallBatchId: lockedPlantContext.latestVisualCallBatchId || '',
        genus: lockedPlantContext.genus || '',
        family: lockedPlantContext.family || '',
        category: lockedPlantContext.category || '',
        watering: lockedPlantContext.watering || null,
        fertilization: lockedPlantContext.fertilization || null,
        sunning: lockedPlantContext.sunning || null,
        ventilation: lockedPlantContext.ventilation || null,
        temperatureMin:
          lockedPlantContext.temperatureMin === null || lockedPlantContext.temperatureMin === undefined
            ? null
            : Number(lockedPlantContext.temperatureMin),
        temperatureMax:
          lockedPlantContext.temperatureMax === null || lockedPlantContext.temperatureMax === undefined
            ? null
            : Number(lockedPlantContext.temperatureMax),
        humidityMin:
          lockedPlantContext.humidityMin === null || lockedPlantContext.humidityMin === undefined
            ? null
            : Number(lockedPlantContext.humidityMin),
        humidityMax:
          lockedPlantContext.humidityMax === null || lockedPlantContext.humidityMax === undefined
            ? null
            : Number(lockedPlantContext.humidityMax),
        careAuditStatus: lockedPlantContext.careAuditStatus || '',
        varianceLevel: lockedPlantContext.varianceLevel || ''
      }
    : await resolvePlantContext({ openid, plantId, userPlantId, preferCatalogPlantId })
  const visualRouteContext = resolveVisualRouteContext(visualAggregateResult)
  const routeDebugTraceEnabled = isRouteDebugTraceEnabled()
  const preferredVisualRouteAction = visualRouteContext.routePrimaryAction
  const runtimeOriginVisualCallBatchId =
    visualAggregateResult?.visual_batch_trace?.origin_visual_call_batch_id ||
    visualAggregateResult?.visual_call_batch_id ||
    plantContext.latestVisualCallBatchId ||
    ''

  const questionKeys = Array.from(new Set((answers || []).map(item => item.questionKey).filter(Boolean)))
  const normalizedProvidedAnswerOptionMappings = Array.isArray(rawAnswerOptionMappings)
    ? rawAnswerOptionMappings
    : []
  const providedAnswerQuestionKeys = new Set(
    normalizedProvidedAnswerOptionMappings
      .map(item => String(item?.questionKey || '').trim())
      .filter(Boolean)
  )
  const missingQuestionKeys = questionKeys.filter(key => !providedAnswerQuestionKeys.has(String(key).trim()))
  const askedQuestionKeyList = Array.from(
    new Set((askedQuestionKeys || []).map(item => String(item || '').trim()).filter(Boolean))
  )
  const preloadedAskedQuestionRowMap = new Map()
  for (const item of Array.isArray(preloadedAskedQuestionRows) ? preloadedAskedQuestionRows : []) {
    const questionKey = normalizeKey(item?.questionKey || item?.question_key || '')
    if (!questionKey) {continue}
    if (preloadedAskedQuestionRowMap.has(questionKey)) {continue}
    preloadedAskedQuestionRowMap.set(questionKey, item)
  }
  const askedQuestionKeysMissingFromCache = askedQuestionKeyList.filter(key =>
    !preloadedAskedQuestionRowMap.has(normalizeKey(key))
  )
  const routeFastPathAnswerOptionMappings = [
    ...normalizedProvidedAnswerOptionMappings,
    ...buildSyntheticQuestionOptionMappings(questionKeys)
  ]
  const routeFastPathAnswerDerivedSymptoms = collectPositiveMappedObservedSymptomsFromAnswers(
    answers,
    routeFastPathAnswerOptionMappings
  )
  const routeFastPathObservedEvidenceForResolution = mergeObservedEvidenceSet(
    normalizeObservedEvidenceSetItems(observedEvidenceSet),
    buildObservedEvidenceSetFromSymptoms(observedSymptoms, {
      sourceType: 'session_observed_symptom',
      firstSeenStage: stage,
      originVisualCallBatchId: runtimeOriginVisualCallBatchId,
      enteredRuntime: 1
    }),
    buildObservedEvidenceSetFromVisualAggregateResult(visualAggregateResult, {
      firstSeenStage: stage
    }),
    buildObservedEvidenceSetFromSymptoms(routeFastPathAnswerDerivedSymptoms, {
      sourceType: 'follow_up_seed',
      firstSeenStage: stage,
      originVisualCallBatchId: runtimeOriginVisualCallBatchId,
      enteredRuntime: 1
    })
  )
  const routeFastPathDerivedEvidenceForResolution = []
  const shouldAttemptRouteFastPath = stage === 'question' && Boolean(Array.isArray(answers) && answers.length)
  let routeFastPathResultBeforeHydration = null
  if (shouldAttemptRouteFastPath) {
    routeFastPathResultBeforeHydration = await tryBuildRouteAnswerFastPath({
      sessionId,
      round,
      stage,
      plantContext,
      observedSymptomsForResolution: projectObservedSymptomsFromEvidence(
        routeFastPathObservedEvidenceForResolution
      ),
      labeledObservedEvidenceForResolution: routeFastPathObservedEvidenceForResolution,
      derivedEvidenceForResolution: routeFastPathDerivedEvidenceForResolution,
      diagnosisDirectionsForResolution: buildDiagnosisDirections({
        observedEvidenceSet: routeFastPathObservedEvidenceForResolution,
        derivedEvidenceSet: routeFastPathDerivedEvidenceForResolution,
        visualCandidateSymptoms: [],
        routeHints: visualRouteContext.routeHints,
        round
      }),
      symptomClassRuntime: symptomClassState,
      answers,
      askedQuestionKeys,
      answeredQuestionAnswerRecords: Array.isArray(preloadedStoredQuestionRows)
        ? collectAnswerLikeRecordsFromQuestionRows(preloadedStoredQuestionRows)
        : [],
      preloadedRouteAnswerEffects,
      visualAggregateResult,
      visualRouteContext,
      routeDebugTraceEnabled,
      perfLogger
    })
  }
  if (routeFastPathResultBeforeHydration) {
    return routeFastPathResultBeforeHydration
  }
  const shouldSkipStoredQuestionLookup = (
    !shouldAttemptRouteFastPath &&
    Number(round || 1) <= 1 &&
    stage === 'preliminary' &&
    !askedQuestionKeyList.length
  )
  const resolvedStoredQuestionRowsCache = Array.isArray(preloadedStoredQuestionRows)
    ? preloadedStoredQuestionRows
    : shouldSkipStoredQuestionLookup
      ? []
      : null
  const [
    answerOptionMappingsFromStore,
    resolvedStoredQuestionRows,
    askedQuestionRowsFromRepository
  ] = await Promise.all([
    missingQuestionKeys.length
      ? getQuestionOptionMappings(missingQuestionKeys)
      : Promise.resolve([]),
    resolvedStoredQuestionRowsCache !== null
      ? Promise.resolve(resolvedStoredQuestionRowsCache)
      : sessionId
        ? listQuestionRows(sessionId).catch(error => {
          console.warn('diagnose-http failed to load question rows:', {
            sessionId,
            message: error?.message || String(error)
          })
          return []
        })
        : Promise.resolve([]),
    askedQuestionKeysMissingFromCache.length
      ? getQuestionsByKeys(askedQuestionKeysMissingFromCache)
      : Promise.resolve([])
  ])
  const dedupeAnswerOptionMapping = new Map()
  const buildOptionMappingKey = item => {
    const questionKey = String(item?.questionKey || '').trim()
    const optionKey = String(item?.optionKey || '').trim().toLowerCase()
    return questionKey && optionKey ? `${questionKey}::${optionKey}` : ''
  }
  for (const item of [
    ...normalizedProvidedAnswerOptionMappings,
    ...answerOptionMappingsFromStore,
    ...buildSyntheticQuestionOptionMappings(questionKeys)
  ]) {
    const dedupeKey = buildOptionMappingKey(item)
    if (!dedupeKey) {continue}
    if (dedupeAnswerOptionMapping.has(dedupeKey)) {continue}
    dedupeAnswerOptionMapping.set(dedupeKey, item)
  }
  const answerOptionMappings = Array.from(dedupeAnswerOptionMapping.values())
  const answerDerivedSymptoms = collectPositiveMappedObservedSymptomsFromAnswers(
    answers,
    answerOptionMappings
  )
  const observedEvidenceForResolution = mergeObservedEvidenceSet(
    normalizeObservedEvidenceSetItems(observedEvidenceSet),
    buildObservedEvidenceSetFromSymptoms(observedSymptoms, {
      sourceType: 'session_observed_symptom',
      firstSeenStage: stage,
      originVisualCallBatchId: runtimeOriginVisualCallBatchId,
      enteredRuntime: 1
    }),
    buildObservedEvidenceSetFromVisualAggregateResult(visualAggregateResult, {
      firstSeenStage: stage
    }),
    buildObservedEvidenceSetFromSymptoms(answerDerivedSymptoms, {
      sourceType: 'follow_up_seed',
      firstSeenStage: stage,
      originVisualCallBatchId: runtimeOriginVisualCallBatchId,
      enteredRuntime: 1
    })
  )
  const resolutionSymptomKeys = Array.from(
    new Set(
      observedEvidenceForResolution
        .map(item => String(item?.symptomKey || '').trim())
        .filter(Boolean)
    )
  )
  const resolutionSymptomRowsPromise = resolutionSymptomKeys.length
    ? getSymptomsByKeys(resolutionSymptomKeys)
    : Promise.resolve([])
  const fastPathObservedSymptomsForResolution = projectObservedSymptomsFromEvidence(
    observedEvidenceForResolution
  )
  const fastPathDerivedEvidenceForResolution = []
  const diagnosisDirectionsForFastPath = buildDiagnosisDirections({
    observedEvidenceSet: observedEvidenceForResolution,
    derivedEvidenceSet: fastPathDerivedEvidenceForResolution,
    visualCandidateSymptoms: [],
    routeHints: visualRouteContext.routeHints,
    round
  })
  const askedQuestionRows = mergeAskedQuestionRows(
    Array.from(preloadedAskedQuestionRowMap.values()),
    askedQuestionRowsFromRepository,
    collectAnswerLikeRecordsFromQuestionRows(resolvedStoredQuestionRows),
    answers
  )
  const answeredQuestionAnswerRecordsForRoute =
    sessionId && askedQuestionKeys.length
      ? collectAnswerLikeRecordsFromQuestionRows(resolvedStoredQuestionRows)
      : []
  if (shouldAttemptRouteFastPath) {
    const routeFastPathResult = await tryBuildRouteAnswerFastPath({
      sessionId,
      round,
      stage,
      plantContext,
      observedSymptomsForResolution: fastPathObservedSymptomsForResolution,
      labeledObservedEvidenceForResolution: observedEvidenceForResolution,
      derivedEvidenceForResolution: fastPathDerivedEvidenceForResolution,
      diagnosisDirectionsForResolution: diagnosisDirectionsForFastPath,
      symptomClassRuntime: symptomClassState,
      answers,
      askedQuestionKeys,
      answeredQuestionAnswerRecords: answeredQuestionAnswerRecordsForRoute,
      preloadedRouteAnswerEffects,
      visualAggregateResult,
      visualRouteContext,
      routeDebugTraceEnabled,
      perfLogger
    })
    if (routeFastPathResult) {
      return routeFastPathResult
    }
  }

  const resolutionSymptomRows = await resolutionSymptomRowsPromise
  const labeledObservedEvidenceForResolution = applySymptomDictionaryToEvidenceSet(
    observedEvidenceForResolution,
    resolutionSymptomRows
  )
  const observedSymptomsForResolution = applySymptomDictionaryToObservedSymptoms(
    projectObservedSymptomsFromEvidence(labeledObservedEvidenceForResolution),
    resolutionSymptomRows
  )
  const derivedEvidenceForResolution = buildDerivedEvidenceSet({
    observedEvidenceSet: labeledObservedEvidenceForResolution,
    symptomDictionary: resolutionSymptomRows
  })
  const symptomClassRuntime = await resolveSymptomClassRuntime({
    observedSymptoms: observedSymptomsForResolution,
    round,
    answeredQuestionGroupKeys,
    unknownCountByGroup,
    previousState: symptomClassState
  })
  const fullSymptomDictionary = await getSymptomDictionary()
  const visualCandidateSymptomsForResolution = collectVisualCandidateSymptoms(
    visualAggregateResult,
    fullSymptomDictionary
  )
  const diagnosisDirectionsForResolution = buildDiagnosisDirections({
    observedEvidenceSet: labeledObservedEvidenceForResolution,
    derivedEvidenceSet: derivedEvidenceForResolution,
    visualCandidateSymptoms: visualCandidateSymptomsForResolution,
    routeHints: visualRouteContext.routeHints,
    round
  })

  const outOfPoolOnlyNoMapping = isOutOfPoolOnlyNoMappingVisualAggregate(visualAggregateResult)
  const outOfPoolRuntimeMappingAvailable = outOfPoolOnlyNoMapping
    ? await hasAuditedOutOfPoolProxyMappingForAggregate(visualAggregateResult)
    : false
  if (
    outOfPoolOnlyNoMapping &&
    !outOfPoolRuntimeMappingAvailable &&
    Number(round || 1) <= 1 &&
    stage === 'preliminary' &&
    observedSymptomsForResolution.length === 0
  ) {
    const decisionDetails = buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
    const publicResponse = buildUncertainRoundResult({
      sessionId,
      round,
      stage: 'final',
      observedSymptoms: observedSymptomsForResolution,
      observedEvidenceSet: labeledObservedEvidenceForResolution,
      derivedEvidenceSet: derivedEvidenceForResolution,
      diagnosisDirections: diagnosisDirectionsForResolution,
      plantContext,
      confidenceReasons: ['out_of_pool_no_mapping'],
      advice: [
        '图片中存在当前自动诊断范围外的可见异常。系统无法把它稳定归入现有诊断路径，因此本次不继续常规诊断，也不判断为“暂无明显问题”。由于该异常尚未纳入当前诊断池，系统暂不能给出针对性的处理建议；建议先保持观察，避免仅凭本次结果进行大幅养护调整。'
      ],
      routePrimaryAction: 'uncertain_prepare',
      sourceReason: 'out_of_pool_no_mapping',
      uncertainLegalityReason: 'out_of_pool_no_mapping',
      decisionCause: {
        decisionCauseKey: 'out_of_pool_no_mapping',
        decisionCauseCategory: 'visual_scope_gap',
        decisionCauseText: '当前存在诊断范围外的可见异常，但没有已审计 proxy mapping，因此跳过常规诊断并输出保守池外结果。',
        decisionCauseDetails: decisionDetails
      }
    })
    const enrichedResponse = {
      ...publicResponse,
      observedEvidenceSet: labeledObservedEvidenceForResolution,
      plantIdentityId: plantContext.plantIdentityId || '',
      identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
      latestVisualCallBatchId: plantContext.latestVisualCallBatchId || '',
      currentRoundIndex: round,
      currentRoundId: publicResponse.roundId
    }

    const result = {
      ...enrichedResponse,
      metrics: {
        reliabilityScore: 0
      },
      plantContext
    }
    attachPrivateSymptomClassRuntime(result, symptomClassRuntime)
    return result
  }
  const outOfPoolHintOnlyBlocksNonProblematic =
    isWeakOutOfPoolHintOnlyVisualAggregate(visualAggregateResult)
  const nonProblematicRule = outOfPoolHintOnlyBlocksNonProblematic
    ? null
    : resolveNonProblematicRule({
        observedSymptoms: observedSymptomsForResolution,
        observedEvidenceSet: labeledObservedEvidenceForResolution,
        derivedEvidenceSet: derivedEvidenceForResolution,
        diagnosisDirections: diagnosisDirectionsForResolution
      })

  if (nonProblematicRule) {
    const publicResponse = buildNonProblematicRoundResult({
      sessionId,
      round,
      stage: 'final',
      observedSymptoms: observedSymptomsForResolution,
      observedEvidenceSet: labeledObservedEvidenceForResolution,
      derivedEvidenceSet: derivedEvidenceForResolution,
      diagnosisDirections: diagnosisDirectionsForResolution,
      plantContext,
      rule: nonProblematicRule
    })
    const enrichedResponse = {
      ...publicResponse,
      observedEvidenceSet: labeledObservedEvidenceForResolution,
      plantIdentityId: plantContext.plantIdentityId || '',
      identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
      latestVisualCallBatchId: plantContext.latestVisualCallBatchId || '',
      currentRoundIndex: round,
      currentRoundId: publicResponse.roundId
    }

    const result = {
      ...enrichedResponse,
      metrics: {
        reliabilityScore: 1
      },
      plantContext
    }
    attachPrivateSymptomClassRuntime(result, symptomClassRuntime)
    return result
  }

  if (
    Number(round || 1) <= 1 &&
    stage === 'preliminary' &&
    observedSymptomsForResolution.length === 0
  ) {
    if (preferredVisualRouteAction === 'retake_first') {
      const publicResponse = buildUncertainRoundResult({
        sessionId,
        round,
        stage: 'final',
        observedSymptoms: [],
        observedEvidenceSet: labeledObservedEvidenceForResolution,
        derivedEvidenceSet: derivedEvidenceForResolution,
        diagnosisDirections: diagnosisDirectionsForResolution,
        plantContext,
        confidenceReasons: ['no_visual_symptoms_detected'],
        advice: buildRetakeAdviceFromVisualRouteContext(visualRouteContext),
        routePrimaryAction: 'retake_first',
        sourceReason: 'no_visual_symptoms_detected',
        uncertainLegalityReason: 'input_unfillable',
        decisionCause: {
          decisionCauseKey: 'no_observed_symptoms',
          decisionCauseCategory: 'visual_input_gap',
          decisionCauseText: '当前轮次没有形成可用的正式视觉证据。',
          decisionCauseDetails: {
            preferredVisualRouteAction: preferredVisualRouteAction || '',
            blockedReason:
              symptomClassRuntime?.classConditionDecision?.blockedReason ||
              'no_observed_symptoms'
          }
        }
      })
      const enrichedResponse = {
        ...publicResponse,
        observedEvidenceSet: labeledObservedEvidenceForResolution,
        plantIdentityId: plantContext.plantIdentityId || '',
        identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
        latestVisualCallBatchId: plantContext.latestVisualCallBatchId || '',
        currentRoundIndex: round,
        currentRoundId: publicResponse.roundId
      }

      const result = {
        ...enrichedResponse,
        metrics: {
          reliabilityScore: 0
        },
        plantContext
      }
      attachPrivateSymptomClassRuntime(result, symptomClassRuntime)
      return result
    }
  }

  const candidatePriors = await buildCandidatePriors(
    plantContext,
    observedSymptomsForResolution,
    { round, stage }
  )
  const candidatePriorsCausalityEdges = Array.isArray(candidatePriors?.__causalityEdges)
    ? candidatePriors.__causalityEdges
    : null
  const candidatePriorsWithDirectionCoverage = mergeCandidatePriors(
    candidatePriors,
    buildDirectionCandidatePriors(
      diagnosisDirectionsForResolution,
      candidatePriors.map(item => item.problemKey)
    ),
    buildDirectAdjustmentCandidatePriors(
      answerOptionMappings,
      candidatePriors.map(item => item.problemKey)
    )
  )
  const candidateProblemKeys = candidatePriorsWithDirectionCoverage.map(item => item.problemKey)

  if (!candidateProblemKeys.length) {
    const publicResponse = buildUncertainRoundResult({
      sessionId,
      round,
      stage: 'final',
      observedSymptoms: observedSymptomsForResolution,
      observedEvidenceSet: labeledObservedEvidenceForResolution,
      derivedEvidenceSet: derivedEvidenceForResolution,
      diagnosisDirections: diagnosisDirectionsForResolution,
      plantContext,
      confidenceReasons: ['no_candidate_priors'],
      advice:
        preferredVisualRouteAction === 'retake_first'
          ? buildRetakeAdviceFromVisualRouteContext(visualRouteContext)
          : [
              '当前植物缺少可用问题规则，建议补充更稳定的宿主资料或重新上传清晰图片。',
              '先保持当前养护稳定，再观察 3-7 天是否继续扩展。'
            ],
      routePrimaryAction:
        preferredVisualRouteAction === 'retake_first'
          ? 'retake_first'
          : 'uncertain_prepare',
      sourceReason: 'insufficient_candidate_priors',
      uncertainLegalityReason: 'input_unfillable',
      decisionCause: {
        decisionCauseKey: 'insufficient_candidate_priors',
        decisionCauseCategory: 'knowledge_gap',
        decisionCauseText: '当前轮次没有形成可用于后续排序的问题候选池。',
        decisionCauseDetails: {
          observedSymptomCount: observedSymptomsForResolution.length,
          diagnosisDirectionCount: diagnosisDirectionsForResolution.length
        }
      }
    })
    const enrichedResponse = {
      ...publicResponse,
      observedEvidenceSet: labeledObservedEvidenceForResolution,
      plantIdentityId: plantContext.plantIdentityId || '',
      identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
      latestVisualCallBatchId: plantContext.latestVisualCallBatchId || '',
      currentRoundIndex: round,
      currentRoundId: publicResponse.roundId
    }

    const result = {
      ...enrichedResponse,
      metrics: {
        reliabilityScore: 0
      },
      plantContext
    }
    attachPrivateSymptomClassRuntime(result, symptomClassRuntime)
    return result
  }

  const mappedSymptomKeys = collectMappedSymptomKeysFromAnswers(
    answers,
    answerOptionMappings
  )
  const symptomKeys = Array.from(
    new Set([
      ...observedSymptomsForResolution.map(item => item.symptomKey),
      ...mappedSymptomKeys
    ].filter(Boolean))
  )

  const symptomRowsPromise = symptomKeys.length
    ? getSymptomsByKeys(symptomKeys)
    : Promise.resolve(fullSymptomDictionary)
  const evidenceEdgesPromise = symptomKeys.length
    ? getEvidenceEdges({ symptomKeys, problemKeys: candidateProblemKeys })
    : Promise.resolve([])
  const problemsPromise = getProblemsByKeys(candidateProblemKeys)
  const conservativeGenusMapPromise = getGenusSuitabilityMap(
    plantContext.genus,
    candidateProblemKeys
  )
  const conservativeHostMapPromise = getHostSuitabilityMap(
    {
      genus: plantContext.genus,
      family: plantContext.family,
      category: plantContext.category
    },
    candidateProblemKeys
  )
  const [
    symptomRows,
    evidenceEdges,
    problems,
    conservativeGenusMap,
    conservativeHostMap
  ] = await Promise.all([
    symptomRowsPromise,
    evidenceEdgesPromise,
    problemsPromise,
    conservativeGenusMapPromise,
    conservativeHostMapPromise
  ])

  const symptomMap = mapByKey(symptomRows, 'symptomKey')
  const priorMap = mapByKey(candidatePriorsWithDirectionCoverage, 'problemKey')
  const problemRoleByKey = Object.fromEntries(
    (Array.isArray(problems) ? problems : []).map(item => [
      String(item?.problemKey || '').trim(),
      String(item?.problemRole || '').trim()
    ])
  )

  const visualScores = computeVisualEvidenceScores({
    candidateProblemKeys,
    observedSymptoms: observedSymptomsForResolution,
    observedEvidenceSet: labeledObservedEvidenceForResolution,
    symptomDictionary: symptomRows,
    evidenceEdges
  })

  const { questionScores, penalties, answerEffects } = computeQuestionEvidenceAndPenalty({
    answers,
    questions: askedQuestionRows,
    optionMappings: answerOptionMappings,
    candidateProblemKeys,
    symptomDictionary: symptomRows,
    evidenceEdges
  })

  const candidateOutcomes = candidateProblemKeys.map(problemKey => {
    const prior = priorMap.get(problemKey) || {}
    const genusSuitability =
      Number(prior.genusSuitability ?? conservativeGenusMap[problemKey] ?? 0.5)
    const hostSuitability =
      Number(prior.hostSuitability ?? conservativeHostMap[problemKey]?.hostSuitability ?? 1)

    const visualEvidence = Number(visualScores[problemKey] || 0)
    const questionEvidence = Number(questionScores[problemKey] || 0)
    const penalty = Number(penalties[problemKey] || 0)

    const totalEvidence = visualEvidence + evidenceConfig.questionWeight * questionEvidence
    const evidenceCount = [
      visualEvidence > 0,
      questionEvidence > 0
    ].filter(Boolean).length
    const evidenceWeight =
      totalEvidence *
        computeGenusFactor(genusSuitability) *
        computeHostFactor(hostSuitability) -
      penalty

    const problem = problems.find(item => item.problemKey === problemKey)

    return {
      problemKey,
      problemCn: problem?.problemCn || problemKey,
      problemRole: problem?.problemRole || 'root_cause',
      visualEvidence: roundNum(visualEvidence),
      questionEvidence: roundNum(questionEvidence),
      penalty: roundNum(penalty),
      totalEvidence: roundNum(totalEvidence),
      evidenceCount,
      genusSuitability: roundNum(genusSuitability),
      hostSuitability: roundNum(hostSuitability),
      evidenceWeight: roundNum(evidenceWeight)
    }
  })

  const allowCausalityBoost = Number(round || 1) > 1 || stage === 'question'
  const causalityEdges = allowCausalityBoost
    ? candidatePriorsCausalityEdges && candidatePriorsCausalityEdges.length
      ? candidatePriorsCausalityEdges
      : await getCausalityEdges(candidateProblemKeys.slice(0, 3))
    : []
  const answeredQuestionAnswerRecords = sessionId && askedQuestionKeys.length
    ? collectAnswerLikeRecordsFromQuestionRows(resolvedStoredQuestionRows)
    : []
  const fastConvergencePlan = resolveHighSpecificityConvergencePlan({
    visualAggregateResult,
    visualRouteContext,
    observedEvidenceSet: labeledObservedEvidenceForResolution,
    symptomDictionary: symptomRows,
    candidateOutcomes,
    problems,
    round,
    stage
  })

  const questionHistory = hasQuestionHistory({
    round,
    answers,
    askedQuestionKeys,
    answeredQuestionGroupKeys
  })
  const routeAnswerRecordsForDecision = collectRouteAnswerRecordsForDecision({
    answers,
    answeredQuestionAnswerRecords
  })
  const routeAnswerEffectQuestionKeys = Array.from(
    new Set([
      ...routeAnswerRecordsForDecision.map(item => normalizeKey(item?.questionKey || item?.question_key || '')),
      ...askedQuestionKeys.map(item => normalizeKey(item))
    ].filter(Boolean))
  )
  const routeAnswerEffectsResolution = routeAnswerEffectQuestionKeys.length
    ? await resolveRouteAnswerEffectsForFastPath({
        routeAnswerEffectQuestionKeys,
        preloadedRouteAnswerEffects,
        routeAnswerEffectsFetcher: questionKeys =>
          outcomeRouteRepository.getOutcomeAnswerEffects(questionKeys)
      })
    : {
        ok: true,
        routeAnswerEffects: []
      }
  const routeAnswerEffects = routeAnswerEffectsResolution.ok
    ? routeAnswerEffectsResolution.routeAnswerEffects
    : []
  if (!routeAnswerEffectsResolution.ok) {
    logDiagnosisRuntime('diagnose-http route answer effects conservative for complete path', {
      sessionId,
      round,
      stage,
      reason: 'route_answer_effects_fetch_failed',
      questionCount: routeAnswerEffectQuestionKeys.length
    })
  }
  const routeEvidenceContextForDecision = buildRouteEvidenceContext({
    plantContext,
    observedEvidenceSet: labeledObservedEvidenceForResolution,
    derivedEvidenceSet: derivedEvidenceForResolution,
    diagnosisDirections: diagnosisDirectionsForResolution,
    symptomClassRuntime,
    answerEffects,
    routeAnswerEffects,
    answers: routeAnswerRecordsForDecision,
    askedQuestionKeys,
    visualAggregateResult,
    routeHints: visualRouteContext.routeHints
  })
  const routeDecision = await planOutcomeRoutes({
    candidateOutcomeKeys: candidateProblemKeys,
    routeEvidenceContext: routeEvidenceContextForDecision,
    maxVisibleOutcomes: 3,
    maxQuestionCount: 1,
    featureFlags: {
      routePlanningEnabled: isRoutePlanningObservationEnabled()
    }
  })
  const weakOutOfPoolHintOnly = isWeakOutOfPoolHintOnlyVisualAggregate(visualAggregateResult)
  const effectiveOutOfPoolOnlyNoMapping =
    outOfPoolOnlyNoMapping && !outOfPoolRuntimeMappingAvailable
  const effectiveWeakOutOfPoolHintOnly =
    weakOutOfPoolHintOnly && !outOfPoolRuntimeMappingAvailable
  const hasAuthoritativeRouteDecision = isAuthoritativeRouteDecision(routeDecision)
  const routeQuestionEnabled = isRouteQuestionEnabled()
  const routeOutputEnabled = isRouteOutputEnabled()
  const routeModeEnabled = routeQuestionEnabled || routeOutputEnabled
  const shouldUseRouteOutputDecision = routeOutputEnabled && hasAuthoritativeRouteDecision
  const hasRouteVisibleResult = shouldUseRouteOutputDecision && Array.isArray(routeDecision?.visibleOutcomeKeys) &&
    routeDecision.visibleOutcomeKeys.length > 0
  const routeOutputNoVisibleOutcome = Array.isArray(routeDecision?.visibleOutcomeKeys) &&
    routeDecision.visibleOutcomeKeys.length === 0
  const hasUsableRouteOutputDecision =
    shouldUseRouteOutputDecision &&
    hasRouteVisibleResult

  const mergedObservedEvidence = mergeObservedEvidenceSet(
    labeledObservedEvidenceForResolution,
    buildObservedEvidenceSetFromAnswerEffects(answerEffects, symptomMap, {
      originVisualCallBatchId: runtimeOriginVisualCallBatchId,
      firstSeenStage: stage === 'question' ? 'question' : stage
    })
  )
  const labeledMergedObservedEvidence = applySymptomDictionaryToEvidenceSet(
    mergedObservedEvidence,
    symptomRows
  )
  const mergedObservedSymptoms = applySymptomDictionaryToObservedSymptoms(
    projectObservedSymptomsFromEvidence(labeledMergedObservedEvidence),
    symptomRows
  )
  const mergedSymptomClassRuntime = await resolveSymptomClassRuntime({
    observedSymptoms: mergedObservedSymptoms,
    round,
    answeredQuestionGroupKeys,
    unknownCountByGroup,
    previousState: symptomClassState
  })
  const mergedDerivedEvidenceSet = buildDerivedEvidenceSet({
    observedEvidenceSet: labeledMergedObservedEvidence,
    symptomDictionary: symptomRows
  })
  const visualCandidateSymptomsForRuntime = collectVisualCandidateSymptoms(
    visualAggregateResult,
    fullSymptomDictionary
  )
  const diagnosisDirections = buildDiagnosisDirections({
    observedEvidenceSet: labeledMergedObservedEvidence,
    derivedEvidenceSet: mergedDerivedEvidenceSet,
    visualCandidateSymptoms: visualCandidateSymptomsForRuntime,
    routeHints: visualRouteContext.routeHints,
    round
  })
  const contextProblemGuard = evaluateContextRequiredProblemGuard({
    candidateOutcomes,
    observedEvidenceSet: labeledMergedObservedEvidence,
    answerEffects
  })
  const broadVisualDifferentialActive = hasBroadVisualDifferentialInput({
    symptomClassRuntime: mergedSymptomClassRuntime,
    observedEvidenceSet: labeledMergedObservedEvidence
  })
  const edemaFlatSpotDifferentialActive = hasUnresolvedEdemaFlatSpotDifferential({
    answers,
    symptomClassRuntime: mergedSymptomClassRuntime,
    observedEvidenceSet: labeledMergedObservedEvidence
  })
  const effectiveHasUsableRouteOutputDecision = hasUsableRouteOutputDecision
  const effectiveShouldUseRouteOutputDecision = shouldUseRouteOutputDecision
  const filteredQuestions = []
  const questionRequired = false
  logDiagnosisRuntime('diagnose-http package flow finalization:', {
    sessionId,
    round,
    stage,
    broadVisualDifferentialActive,
    edemaFlatSpotDifferentialActive,
    weakOutOfPoolHintOnly,
    outOfPoolOnlyNoMapping,
    outOfPoolRuntimeMappingAvailable,
    effectiveWeakOutOfPoolHintOnly,
    effectiveOutOfPoolOnlyNoMapping,
    contextProblemGuard,
    routePrimaryAction: preferredVisualRouteAction
  })

  const visualObservedSymptomsForConfidence = applySymptomDictionaryToObservedSymptoms(
    projectVisualObservedSymptomsFromEvidence(labeledMergedObservedEvidence),
    symptomRows
  )

  const lowConfidenceBase = resolveLowConfidenceState({
    candidateOutcomes,
    observedSymptoms: visualObservedSymptomsForConfidence,
    observedEvidenceSet: labeledMergedObservedEvidence,
    unknownCountByGroup,
    noHighValueQuestion: false,
    problemRoleByKey,
    symptomClassRuntime: mergedSymptomClassRuntime
  })
  const prioritizedOutputCandidateOutcomes =
    !questionRequired
      ? prioritizeOutputEligibleCandidateOutcomes(
        candidateOutcomes,
        labeledMergedObservedEvidence,
        problemRoleByKey,
        {
          symptomClassRuntime: mergedSymptomClassRuntime,
          answerEffects
        }
      )
      : candidateOutcomes
  const outputCandidateOutcomes =
    !questionRequired
      ? scopeCandidateOutcomesToDiagnosisDirections(
          prioritizedOutputCandidateOutcomes,
          diagnosisDirections,
          problemRoleByKey
        )
      : prioritizedOutputCandidateOutcomes
  const stabilizedOutputCandidateOutcomes = !questionRequired
    ? stabilizeOutputCandidateOutcomesAgainstConfirmedGuardShift(
        outputCandidateOutcomes,
        contextProblemGuard,
        problemRoleByKey
      )
    : outputCandidateOutcomes
  const outputContextProblemGuard = evaluateContextRequiredProblemGuard({
    candidateOutcomes: stabilizedOutputCandidateOutcomes,
    observedEvidenceSet: labeledMergedObservedEvidence,
    answerEffects
  })
  const lowConfidence = fastConvergencePlan?.applied
    ? {
        ...lowConfidenceBase,
        isLowConfidence: false,
        uncertainLegalityReason: '',
        reasons: Array.from(
          new Set([
            ...(Array.isArray(lowConfidenceBase?.reasons) ? lowConfidenceBase.reasons : []),
            'high_specificity_fast_convergence'
          ])
        )
      }
    : {
        ...lowConfidenceBase,
        isLowConfidence:
          lowConfidenceBase.isLowConfidence ||
          (outputContextProblemGuard.applies && !outputContextProblemGuard.hasRequiredContext),
        reasons: Array.from(
          new Set([
            ...(Array.isArray(lowConfidenceBase?.reasons) ? lowConfidenceBase.reasons : []),
            ...(outputContextProblemGuard.applies && !outputContextProblemGuard.hasRequiredContext
              ? ['context_required_problem_unconfirmed']
              : [])
          ])
        ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidenceBase?.advice) ? lowConfidenceBase.advice : []),
            ...(outputContextProblemGuard.applies && !outputContextProblemGuard.hasRequiredContext
              ? [outputContextProblemGuard.advice]
              : [])
          ].filter(Boolean))
        ),
        uncertainLegalityReason:
          lowConfidenceBase?.uncertainLegalityReason ||
          (outputContextProblemGuard.applies &&
          !outputContextProblemGuard.hasRequiredContext &&
          filteredQuestions.length === 0
            ? 'input_unfillable'
            : '')
      }
  if (
    outputContextProblemGuard.applies &&
    outputContextProblemGuard.problemKey !== contextProblemGuard.problemKey
  ) {
    logDiagnosisRuntime('diagnose-http output context guard shifted:', {
      sessionId,
      round,
      startProblemKey: contextProblemGuard.problemKey,
      outputProblemKey: outputContextProblemGuard.problemKey,
      outputHasRequiredContext: outputContextProblemGuard.hasRequiredContext
    })
  }
  const hasEligibleOutputProblem = hasOutputEligibleCandidateOutcome(
    stabilizedOutputCandidateOutcomes,
    labeledMergedObservedEvidence,
    problemRoleByKey,
    {
      symptomClassRuntime: mergedSymptomClassRuntime,
      answerEffects
    }
  )
  const hasForceableOutputProblem = hasForceableOutputCandidateOutcome(
    stabilizedOutputCandidateOutcomes,
    labeledMergedObservedEvidence,
    problemRoleByKey,
    {
      symptomClassRuntime: mergedSymptomClassRuntime,
      answerEffects
    }
  )
  const activeRuntimeSymptomKeysForOutput = Array.from(
    new Set(
      (Array.isArray(labeledMergedObservedEvidence) ? labeledMergedObservedEvidence : [])
        .filter(
          item =>
            String(item?.currentStatus || item?.current_status || 'active').trim() === 'active' &&
            Number(item?.enteredRuntime ?? item?.entered_runtime ?? 1) === 1
        )
        .map(item => String(item?.symptomKey || item?.symptom_key || '').trim())
        .filter(Boolean)
    )
  )
  const yellowingOnlyRuntimeEvidenceAfterQuestionPackage =
    !questionRequired &&
    questionHistory &&
    !effectiveHasUsableRouteOutputDecision &&
    activeRuntimeSymptomKeysForOutput.length > 0 &&
    activeRuntimeSymptomKeysForOutput.every(symptomKey =>
      [
        'leaf_yellowing',
        'uniform_yellowing',
        'yellow_lower_leaves',
        'yellow_new_leaves',
        'interveinal_chlorosis',
        'pale_new_leaves',
        'yellowing_patchy',
        'yellow_speckling'
      ].includes(symptomKey)
    ) &&
    !hasForceableOutputProblem
  const structuralOnlyRuntimeEvidenceAfterQuestionPackage =
    !questionRequired &&
    questionHistory &&
    activeRuntimeSymptomKeysForOutput.length > 0 &&
    activeRuntimeSymptomKeysForOutput.every(symptomKey =>
      [
        'holes_in_leaf',
        'chewed_edges',
        'skeletonized_leaves',
        'tunnels_in_leaf'
      ].includes(symptomKey)
    ) &&
    [
      'chewing_insects',
      'caterpillars',
      'beetles',
      'snails_slugs',
      'leaf_miners'
    ].includes(String(stabilizedOutputCandidateOutcomes?.[0]?.problemKey || '').trim()) &&
    Number(stabilizedOutputCandidateOutcomes?.[0]?.questionEvidence || 0) <= 0
  const hasLeafSpotBridgeRoutingGap =
    !questionRequired &&
    String(mergedSymptomClassRuntime?.classConditionDecision?.blockedReason || '').trim() === 'class_group_pool_empty' &&
    Array.isArray(mergedSymptomClassRuntime?.classScores) &&
    mergedSymptomClassRuntime.classScores.some(
      item => String(item?.classKey || '').trim() === 'leaf_spot_complex_mode'
    )
  const shouldBlockUnscopedClassOutput =
    !questionRequired &&
    shouldBlockUnscopedClassProblemOutput({
      candidateOutcomes: stabilizedOutputCandidateOutcomes,
      diagnosisDirections,
      symptomClassRuntime: mergedSymptomClassRuntime,
      answerEffects,
      fastConvergencePlan
    })
  const shouldBlockUnforceablePackageOutcome =
    !questionRequired &&
    questionHistory &&
    !hasForceableOutputProblem &&
    filteredQuestions.length === 0
  const shouldBlockUnforceableOutputOutcome =
    !questionRequired &&
    !questionHistory &&
    !hasForceableOutputProblem &&
    filteredQuestions.length === 0
  const hasActiveObservedEvidence = hasActiveObservedEvidenceEntries(labeledMergedObservedEvidence)
  const shouldBlockOutOfPoolHintUnconfirmed =
    weakOutOfPoolHintOnly &&
    !questionRequired &&
    !hasActiveObservedEvidence
  const broadVisualDifferentialUnresolved =
    !questionRequired &&
    !fastConvergencePlan?.applied &&
    (
      edemaFlatSpotDifferentialActive ||
      (
        broadVisualDifferentialActive &&
        !hasDirectPositiveProblemAnswer(
          answerEffects,
          normalizeKey(stabilizedOutputCandidateOutcomes?.[0]?.problemKey || '')
        )
      )
    )
  const governedLowConfidence = hasLeafSpotBridgeRoutingGap
    ? {
        ...lowConfidence,
        isLowConfidence: true,
        reasons: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : []),
            'class_group_pool_empty'
          ])
        ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.advice) ? lowConfidence.advice : []),
            '当前已进入叶斑桥接路由，但可执行题组仍为空，不能直接输出具体问题；需补充更高特异事实或等待对应题组完善。'
          ])
        ),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'resource_limit'
      }
    : effectiveOutOfPoolOnlyNoMapping && !questionRequired
      ? {
          ...lowConfidence,
          isLowConfidence: true,
          reasons: Array.from(
            new Set([
              ...(Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : []),
              'out_of_pool_no_mapping'
            ])
          ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.advice) ? lowConfidence.advice : []),
            '图片中存在当前自动诊断范围外的可见异常。本次不继续常规诊断，也不判断为暂无明显问题；由于该异常尚未纳入当前诊断池，系统暂不能给出针对性的处理建议，建议先保持观察并避免仅凭本次结果进行大幅调整。'
          ])
        ),
        outOfPoolObservation: buildOutOfPoolObservationConservative({
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }),
        uncertainLegalityReason: 'out_of_pool_no_mapping'
      }
    : effectiveWeakOutOfPoolHintOnly && !questionRequired
      ? {
          ...lowConfidence,
          isLowConfidence: true,
          reasons: Array.from(
            new Set([
              ...(Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : []),
              'weak_out_of_pool_proxy_only'
            ])
          ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.advice) ? lowConfidence.advice : []),
              '图片中存在当前诊断范围外的可见异常，但还没有形成可确认的正式诊断证据；本次只作为非诊断观察展示，系统暂不能给出针对性处理建议。'
          ])
        ),
        outOfPoolObservation: buildOutOfPoolObservationConservative({
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'out_of_pool_review_required'
      }
    : shouldBlockOutOfPoolHintUnconfirmed
      ? {
          ...lowConfidence,
          isLowConfidence: true,
          reasons: Array.from(
            new Set([
              ...(Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : []),
              'out_of_pool_hint_unconfirmed_after_package'
            ])
          ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.advice) ? lowConfidence.advice : []),
              '图片里存在池外可见异常提示，但题包答案没有形成可确认的正式证据；本次只作为非诊断观察展示，不判断为暂无明显问题，也不输出具体处理方向。'
          ])
        ),
        outOfPoolObservation: buildOutOfPoolObservationConservative({
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'out_of_pool_hint_unconfirmed'
      }
    : yellowingOnlyRuntimeEvidenceAfterQuestionPackage
    ? {
        ...lowConfidence,
        isLowConfidence: true,
        reasons: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : []),
            'yellowing_differential_unresolved'
          ])
        ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.advice) ? lowConfidence.advice : []),
            '当前只有黄叶事实，题包答案没有形成分布、水分、光照、施肥、病虫害或进展速度方面的明确分流证据，不能直接输出缺铁、缺氮、缺水或弱光等具体问题。'
          ])
        ),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'input_unfillable'
      }
    : structuralOnlyRuntimeEvidenceAfterQuestionPackage
    ? {
        ...lowConfidence,
        isLowConfidence: true,
        reasons: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : []),
            'structural_damage_cause_unresolved'
          ])
        ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.advice) ? lowConfidence.advice : []),
            '当前只有孔洞、缺口或网状缺损这类结构事实，题包答案没有形成虫害活动、病斑脱落或机械既有伤的明确分流证据，不能直接输出具体虫害。'
          ])
        ),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'input_unfillable'
      }
    : broadVisualDifferentialUnresolved
    ? {
        ...lowConfidence,
        isLowConfidence: true,
        reasons: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : []),
            'broad_visual_differential_unresolved'
          ])
        ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.advice) ? lowConfidence.advice : []),
            '当前视觉证据属于宽泛异常，可能对应多个方向；没有形成用户正向问诊证据前，不能直接闭合为某个具体问题。'
          ])
        ),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'input_unfillable'
      }
    : shouldBlockUnscopedClassOutput
    ? {
        ...lowConfidence,
        isLowConfidence: true,
        reasons: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : []),
            'symptom_class_problem_family_unscoped'
          ])
        ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.advice) ? lowConfidence.advice : []),
            '当前视觉方向与最高候选问题不在同一条已确认的诊断方向内，且没有用户正向问诊证据，不能跨方向输出具体问题。'
          ])
        ),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'input_unfillable'
      }
    : shouldBlockUnforceablePackageOutcome || shouldBlockUnforceableOutputOutcome
    ? {
        ...lowConfidence,
        isLowConfidence: true,
        reasons: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : []),
            'no_forceable_output_problem'
          ])
        ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.advice) ? lowConfidence.advice : []),
            shouldBlockUnforceablePackageOutcome
              ? '当前题包答案没有形成可用证据，建议补充更明确的回答，或补拍关键部位后重新开始诊断。'
              : '当前视觉方向没有形成可安全输出的具体问题证据，不能只凭先验或泛化线索给出具体诊断。'
          ])
        ),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'input_unfillable'
      }
    : lowConfidence
  const shouldForceOutputAfterQuestionPackage =
    !questionRequired &&
    questionHistory &&
    !hasLeafSpotBridgeRoutingGap &&
    !effectiveOutOfPoolOnlyNoMapping &&
    !effectiveWeakOutOfPoolHintOnly &&
    !shouldBlockOutOfPoolHintUnconfirmed &&
    !yellowingOnlyRuntimeEvidenceAfterQuestionPackage &&
    !structuralOnlyRuntimeEvidenceAfterQuestionPackage &&
    !broadVisualDifferentialUnresolved &&
    !shouldBlockUnscopedClassOutput &&
    !shouldBlockUnforceableOutputOutcome &&
    hasEligibleOutputProblem &&
    hasForceableOutputProblem
  const decisionCause =
    !questionRequired &&
    effectiveOutOfPoolOnlyNoMapping
      ? {
          decisionCauseKey: 'out_of_pool_no_mapping',
          decisionCauseCategory: 'visual_scope_gap',
          decisionCauseText: '当前存在诊断范围外的可见异常，但没有已审计 proxy mapping，因此跳过常规诊断并输出保守池外结果。',
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }
      : !questionRequired &&
    effectiveWeakOutOfPoolHintOnly
      ? {
          decisionCauseKey: 'weak_out_of_pool_proxy_only',
          decisionCauseCategory: 'out_of_pool_visual_hint',
          decisionCauseText: '正式 symptom_candidates 为空，仅存在池外弱提示，不能直接输出具体问题。',
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }
      : !questionRequired &&
    shouldBlockOutOfPoolHintUnconfirmed
      ? {
          decisionCauseKey: 'out_of_pool_hint_unconfirmed_after_package',
          decisionCauseCategory: 'out_of_pool_visual_hint',
          decisionCauseText: '图片里存在池外可见异常提示，但题包答案没有形成可确认的正式证据，因此不能输出非问题结论。',
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }
      : !questionRequired &&
    !hasActiveObservedEvidence
      ? {
          decisionCauseKey: 'no_observed_symptoms',
          decisionCauseCategory: 'visual_input_gap',
          decisionCauseText: '当前轮次没有形成可用的正式视觉证据。',
          decisionCauseDetails: {
            currentClassKey: mergedSymptomClassRuntime?.currentClassKey || '',
            blockedReason:
              mergedSymptomClassRuntime?.classConditionDecision?.blockedReason ||
              'no_observed_symptoms'
          }
        }
      : hasLeafSpotBridgeRoutingGap
        ? {
            decisionCauseKey: 'class_group_pool_empty',
            decisionCauseCategory: 'class_routing_gap',
            decisionCauseText: '当前已进入叶斑桥接路由，但 question group 仍为空，不能直接输出具体问题。',
            decisionCauseDetails: {
              currentClassKey: mergedSymptomClassRuntime?.currentClassKey || '',
              primaryClassKey: mergedSymptomClassRuntime?.primaryClass?.classKey || '',
              blockedReason: mergedSymptomClassRuntime?.classConditionDecision?.blockedReason || '',
              classScoreKeys: Array.isArray(mergedSymptomClassRuntime?.classScores)
                ? mergedSymptomClassRuntime.classScores.map(item => item?.classKey).filter(Boolean)
                : []
            }
          }
      : !questionRequired &&
    outputContextProblemGuard.applies &&
    !outputContextProblemGuard.hasRequiredContext &&
    filteredQuestions.length === 0
      ? {
          decisionCauseKey:
            mergedSymptomClassRuntime?.enabled &&
            mergedSymptomClassRuntime?.classConditionDecision?.hasEnabledGroups
              ? 'class_converged_context_guard_blocked'
              : 'context_guard_blocked_without_required_context',
          decisionCauseCategory: 'context_guard_block',
          decisionCauseText: outputContextProblemGuard.advice || '当前候选问题缺少必要上下文，不能安全输出具体 root cause。',
          decisionCauseDetails: {
            problemKey: outputContextProblemGuard.problemKey || '',
            currentClassKey: mergedSymptomClassRuntime?.currentClassKey || '',
            currentGroupKey: mergedSymptomClassRuntime?.currentGroupKey || '',
            hasEnabledGroups: Boolean(mergedSymptomClassRuntime?.classConditionDecision?.hasEnabledGroups),
            preferredQuestionKeys: Array.isArray(outputContextProblemGuard.preferredQuestionKeys)
              ? outputContextProblemGuard.preferredQuestionKeys
              : [],
            matchedSymptomKeys: Array.isArray(outputContextProblemGuard.matchedSymptomKeys)
              ? outputContextProblemGuard.matchedSymptomKeys
              : []
          }
        }
      : yellowingOnlyRuntimeEvidenceAfterQuestionPackage
        ? {
            decisionCauseKey: 'yellowing_differential_unresolved',
            decisionCauseCategory: 'output_guard',
            decisionCauseText: '当前只有黄叶事实，题包答案没有形成明确分流证据，因此不能安全输出具体缺素/水分/光照问题。',
            decisionCauseDetails: {
              activeRuntimeSymptomKeys: activeRuntimeSymptomKeysForOutput,
              hasEligibleOutputProblem,
              hasForceableOutputProblem
            }
          }
      : structuralOnlyRuntimeEvidenceAfterQuestionPackage
        ? {
            decisionCauseKey: 'structural_damage_cause_unresolved',
            decisionCauseCategory: 'output_guard',
            decisionCauseText: '当前只有结构损伤事实，题包答案没有形成明确病因分流证据，因此不能安全输出具体虫害。',
            decisionCauseDetails: {
              activeRuntimeSymptomKeys: activeRuntimeSymptomKeysForOutput,
              topProblemKey: String(stabilizedOutputCandidateOutcomes?.[0]?.problemKey || '').trim(),
              topQuestionEvidence: Number(stabilizedOutputCandidateOutcomes?.[0]?.questionEvidence || 0)
            }
          }
      : broadVisualDifferentialUnresolved
        ? {
            decisionCauseKey: 'broad_visual_differential_unresolved',
            decisionCauseCategory: 'output_guard',
            decisionCauseText: '当前视觉异常过于宽泛，且没有用户正向问诊证据，不能直接输出具体问题。',
            decisionCauseDetails: {
              currentClassKey: mergedSymptomClassRuntime?.currentClassKey || '',
              primaryClassKey: mergedSymptomClassRuntime?.primaryClass?.classKey || '',
              activeRuntimeSymptomKeys: activeRuntimeSymptomKeysForOutput,
              edemaFlatSpotDifferentialActive,
              topProblemKey: String(stabilizedOutputCandidateOutcomes?.[0]?.problemKey || '').trim()
            }
          }
      : shouldBlockUnscopedClassOutput
        ? {
            decisionCauseKey: 'symptom_class_problem_family_unscoped',
            decisionCauseCategory: 'output_guard',
            decisionCauseText: '当前视觉方向与最高候选问题不在同一条已确认的诊断方向内，且没有用户正向问诊证据。',
            decisionCauseDetails: {
              currentClassKey: mergedSymptomClassRuntime?.currentClassKey || '',
              primaryClassKey: mergedSymptomClassRuntime?.primaryClass?.classKey || '',
              topProblemKey: String(stabilizedOutputCandidateOutcomes?.[0]?.problemKey || '').trim(),
              diagnosisDirectionKeys: Array.isArray(diagnosisDirections)
                ? diagnosisDirections.map(item => item?.directionKey).filter(Boolean)
                : [],
              allowedProblemKeys: Array.from(
                collectAllowedProblemKeysFromDiagnosisDirections(diagnosisDirections)
              )
            }
          }
      : shouldBlockUnforceablePackageOutcome || shouldBlockUnforceableOutputOutcome
        ? {
            decisionCauseKey: shouldBlockUnforceablePackageOutcome
              ? 'no_forceable_output_problem_after_package'
              : 'no_forceable_output_problem_without_question',
            decisionCauseCategory: 'output_guard',
            decisionCauseText: shouldBlockUnforceablePackageOutcome
              ? '题包提交后仍未形成可安全输出的 root cause 证据。'
              : '当前视觉方向没有形成可安全输出的具体问题证据。',
            decisionCauseDetails: {
              hasEligibleOutputProblem,
              hasForceableOutputProblem
            }
          }
        : null
  const effectiveLowConfidence = shouldForceOutputAfterQuestionPackage
    ? {
        ...governedLowConfidence,
        uncertainLegalityReason: ''
      }
    : governedLowConfidence
  const explanationProblemKeys = !questionRequired
    ? stabilizedOutputCandidateOutcomes.slice(0, 5).map(item => item.problemKey).filter(Boolean)
    : []
  const explanations = explanationProblemKeys.length
    ? await getExplanationsByProblemKeys(explanationProblemKeys)
    : []
  const routeOutcomeKeys =
    effectiveShouldUseRouteOutputDecision
      ? Array.from(
          new Set(
            [
              ...(Array.isArray(routeDecision?.visibleOutcomeKeys)
                ? routeDecision.visibleOutcomeKeys
                : [])
            ]
              .map(item => String(item || '').trim())
              .filter(Boolean)
          )
        )
      : []
  const routeOutcomes =
    effectiveShouldUseRouteOutputDecision && routeOutcomeKeys.length
      ? await outcomeRouteRepository.getDiagnosisOutcomesByKeys(routeOutcomeKeys)
      : []
  const leadingVisibleOutcomeKey = resolveLeadingVisibleOutcomeKey(routeDecision)
  const primaryRouteOutcome = routeOutcomes.find(
    item => String(item?.outcomeKey || '').trim() === leadingVisibleOutcomeKey
  )
  const routeLockedOutcomeType =
    String(primaryRouteOutcome?.outcomeType || '').trim() === 'non_problematic'
      ? 'non_problematic'
      : leadingVisibleOutcomeKey
        ? 'problematic'
        : 'uncertain'
  const stopDecision = questionRequired
    ? null
    : effectiveHasUsableRouteOutputDecision
      ? {
          outcomeLocked: routeLockedOutcomeType,
          stopReason: leadingVisibleOutcomeKey
            ? 'route_visible_outcomes_ready'
            : 'route_uncertain_with_candidates',
          uncertainLegalityReason: leadingVisibleOutcomeKey ? '' : 'route_uncertain',
          stopReasonDetail: routeDecision?.decisionCause?.decisionCauseKey || '',
          decisionCause: normalizeDecisionCause(routeDecision?.decisionCause)
        }
      : routeModeEnabled
        ? routeOutputNoVisibleOutcome
          ? {
              outcomeLocked: 'uncertain',
              stopReason: 'uncertain_output_ready',
              uncertainLegalityReason:
                effectiveLowConfidence?.uncertainLegalityReason || 'route_output_no_visible_outcome',
              stopReasonDetail:
                normalizeDecisionCause(routeDecision?.decisionCause)?.decisionCauseKey ||
                decisionCause?.decisionCauseKey ||
                'route_no_visible_outcome',
              decisionCause:
                normalizeDecisionCause(routeDecision?.decisionCause) ||
                decisionCause || {
                  decisionCauseKey: 'route_no_visible_outcome',
                  decisionCauseCategory: 'route_conservative',
                  decisionCauseText: 'route 未形成可展示 outcome，按保守不确定输出。',
                  decisionCauseDetails: {}
                }
            }
          : {
              outcomeLocked: 'uncertain',
              stopReason: hasAuthoritativeRouteDecision
                ? 'route_uncertain_with_candidates'
                : 'route_conservative_uncertain',
              uncertainLegalityReason: 'route_conservative',
              stopReasonDetail:
                routeDecision?.decisionCause?.decisionCauseKey ||
                decisionCause?.decisionCauseKey ||
                'route_conservative_uncertain',
              decisionCause:
                normalizeDecisionCause(routeDecision?.decisionCause) ||
                decisionCause || {
                  decisionCauseKey: 'route_conservative_uncertain',
                  decisionCauseCategory: 'route_conservative',
                  decisionCauseText: 'route 未形成权威闭合，按保守不确定输出。',
                  decisionCauseDetails: {}
                }
            }
      : {
          outcomeLocked:
            shouldForceOutputAfterQuestionPackage
              ? 'problematic'
              : effectiveLowConfidence?.uncertainLegalityReason ||
                  (outputContextProblemGuard.applies && !outputContextProblemGuard.hasRequiredContext)
                ? 'uncertain'
                : 'problematic',
          stopReason:
            shouldForceOutputAfterQuestionPackage
              ? 'problematic_output_ready'
              : effectiveLowConfidence?.uncertainLegalityReason ||
                  (outputContextProblemGuard.applies && !outputContextProblemGuard.hasRequiredContext)
                ? 'uncertain_output_ready'
                : 'problematic_output_ready',
          uncertainLegalityReason:
            shouldForceOutputAfterQuestionPackage
              ? ''
              : effectiveLowConfidence?.uncertainLegalityReason ||
                (outputContextProblemGuard.applies && !outputContextProblemGuard.hasRequiredContext
                  ? 'input_unfillable'
                  : ''),
          stopReasonDetail: decisionCause?.decisionCauseKey || '',
          decisionCause
        }
  const allActionProfileKeys = resolveVisibleRouteActionProfileKeys(routeDecision, routeOutcomes)
  const actionProfiles =
    effectiveShouldUseRouteOutputDecision &&
    allActionProfileKeys.length
      ? await outcomeRouteRepository.getOutcomeActionProfiles(allActionProfileKeys)
      : []

  const stageFinal = questionRequired ? 'question' : 'final'

  const publicResponse = formatDiagnosisResponse({
    sessionId,
    round,
    stage: stageFinal,
    observedSymptoms: mergedObservedSymptoms,
    observedEvidenceSet: labeledMergedObservedEvidence,
    derivedEvidenceSet: mergedDerivedEvidenceSet,
    diagnosisDirections,
    candidateOutcomes: stabilizedOutputCandidateOutcomes,
    questions: filteredQuestions,
    problems,
    explanations,
    routeOutcomes,
    causality: causalityEdges,
    plantContext,
    plantId: plantContext.userPlantId || plantContext.plantId,
    questionRequired,
    lowConfidence: effectiveLowConfidence,
    symptomClassRuntime: mergedSymptomClassRuntime,
    highSpecificityFastConvergence: fastConvergencePlan,
    stopDecision,
    preferredRoutePrimaryAction:
      preferredVisualRouteAction === 'retake_first' ? 'retake_first' : '',
    routeDecision: effectiveShouldUseRouteOutputDecision ? routeDecision : null,
    routeOutputEnabled: effectiveShouldUseRouteOutputDecision,
    actionProfiles
  })
  const enrichedResponse = {
    ...publicResponse,
    observedEvidenceSet: labeledMergedObservedEvidence,
    plantIdentityId: plantContext.plantIdentityId || '',
    identityResolutionStatus: resolveIdentityResolutionStatus(plantContext),
    latestVisualCallBatchId: plantContext.latestVisualCallBatchId || '',
    highSpecificityFastConvergence: fastConvergencePlan,
    currentRoundIndex: round,
    currentRoundId: publicResponse.roundId
  }

  const result = {
    ...enrichedResponse,
    metrics: {
      routeDecision
    },
    routeDecision: routeDebugTraceEnabled ? sanitizeRouteDecisionForPublic(routeDecision) : null,
    __runtimeRouteDecision: routeDecision,
    answerEffects,
    questionStopPolicy: null,
    plantContext
  }
  attachPrivateSymptomClassRuntime(result, mergedSymptomClassRuntime)
  return result
}

module.exports = {
  runDiagnosisRound,
  shouldUseVisualCandidateSeedQuestion,
  buildSyntheticVisualCandidateQuestion,
  shouldSuppressCrossDirectionVisualCandidate,
  shouldRestrictToCandidateSeedOnly,
  _test: {
    resolveVisibleRouteActionProfileKeys,
    filterQuestionsByAnsweredRouteConstraints,
    isYellowingEquivalentDimensionAnswered,
    isYellowingQuestionAllowedByAnsweredBranch,
    collectAnswerLikeRecordsFromQuestionRows,
    collectRouteAnswerRecordsForDecision,
    mergeAskedQuestionRows,
    collectMatchedRouteEffectOutcomeKeys,
    buildRouteAnswerEffectDedupKey,
    collectRouteAnswerEffectQuestionKeySet,
    mergeRouteAnswerEffects,
    resolveRouteAnswerEffectsForFastPath
  }
}
