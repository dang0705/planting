'use strict'

const { clamp01 } = require('../repositories/sql')
const { toOptionId, toQuestionId, toResultId } = require('../mappers/public-id-mapper')
const {
  evidence: evidenceConfig,
  ranking: rankingConfig,
  followUpSelection
} = require('../constants/scoring')
const classSwitchRules = require('../constants/class-switch-rules')
const {
  HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES,
  getHighSpecificityQuestionBlockedSymptomKeys
} = require('../constants/high-specificity-fast-convergence')
const {
  resolvePlantContext,
  getLinkedCandidatePriors,
  getCandidateProblemPriors,
  getGenusCandidatePriors,
  getHostCandidatePriors,
  getGenusCompatibilityMap,
  getHostCompatibilityMap
} = require('../repositories/prior-repository')
const { getProblemsByKeys, getExplanationsByProblemKeys } = require('../repositories/problem-repository')
const { getFreshCachedWeatherContext } = require('../repositories/weather-repository')
const {
  getSymptomDictionary,
  getSymptomsByKeys,
  getEvidenceEdges
} = require('../repositories/symptom-repository')
const {
  getQuestionStrategies,
  getQuestionsByKeys,
  getQuestionsByGroupKeys,
  getQuestionOptionMappings,
  findQuestionKeysByTargetSymptoms
} = require('../repositories/question-repository')
const { listFollowUpRows } = require('../repositories/session-follow-up-repository')
const { getCausalityEdges } = require('../repositories/causality-repository')
const {
  computeVisualEvidenceScores,
  computeQuestionEvidenceAndPenalty
} = require('./evidence-scoring')
const { computeGenusFactor, computeHostFactor } = require('./prior-scorers')
const { computeCausalityBoosts } = require('./causality-scorer')
const { resolveSymptomClassRuntime } = require('./symptom-classifier')
const {
  selectFollowUpQuestions,
  shouldAllowSecondaryObservedSymptomProbe
} = require('./question-selector')
const { formatDiagnosisResponse } = require('./result-formatter')
const { buildRuntimeArtifacts } = require('./runtime-artifacts')
const { resolveHighSpecificityConvergencePlan } = require('./high-specificity-fast-convergence')
const { resolveLowConfidenceState } = require('./uncertain-gate')
const {
  resolveNonProblematicRule,
  resolveNonProblematicFollowUpCandidate,
  buildNonProblematicRoundResult,
  buildNonProblematicFollowUpRoundResult
} = require('./non-problematic-resolver')
const {
  QUESTION_TARGET_DIMENSIONS,
  QUESTION_ROUTING_SCOPES,
  normalizeQuestionTargetDimension,
  normalizeQuestionRole,
  normalizeQuestionEffectMode,
  inferQuestionRole,
  inferQuestionEffectMode,
  inferObservedVisualCoveredDimensions,
  isGenericObservedProbeDirectEvidenceDimension
} = require('../utils/question-target-dimension')
const {
  buildVisualCandidateQuestionGroupKey,
  buildSyntheticVisualCandidateQuestionKey,
  buildObservedProbeQuestionGroupKey,
  buildSyntheticObservedProbeQuestionKey,
  parseSyntheticObservedProbeQuestionKey,
  buildSyntheticObservedProbeQuestions,
  buildSyntheticFollowUpOptionMappings
} = require('../utils/synthetic-follow-up')
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
  buildExplicitObservedSymptomKeySet
} = require('../utils/explicit-observed-symptom')
const {
  collectBridgeTargetSymptomKeys
} = require('../utils/question-symptom-bridge')
const {
  evaluateContextRequiredProblemGuard
} = require('../utils/context-required-problem-guard')
const {
  prioritizeOutputEligibleProblemRankings,
  hasOutputEligibleProblemRanking,
  hasForceableOutputProblemRanking
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

const SYNTHETIC_VISUAL_CANDIDATE_PROBLEM_KEY = '__visual_candidate_seed__'
const SYNTHETIC_OBSERVED_SYMPTOM_QUESTION_SEED_PROBLEM_KEY = '__observed_symptom_seed__'
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

function roundNum(value, digits = 6) {
  return Number(Number(value || 0).toFixed(digits))
}

function normalizeKey(value = '') {
  return String(value || '').trim()
}

function normalizeGroupRolePriorityBoost(groupRole = '') {
  return Number(classSwitchRules.groupRolePriorityBoost[String(groupRole || '').trim()] || 0)
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
    symptomClassRuntime?.classGateDecision?.currentClassKey,
    symptomClassRuntime?.classGateDecision?.primaryClassKey
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
  if (!normalizedQuestionKey || !normalizedOptionKey) return false

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
  if (!questionKeySet.size) return false

  return (Array.isArray(answers) ? answers : []).some(item =>
    questionKeySet.has(normalizeKey(item?.questionKey || item?.question_key || ''))
  )
}

function hasUnresolvedEdemaFlatSpotDifferential({
  answers = [],
  symptomClassRuntime = null,
  observedEvidenceSet = []
} = {}) {
  const edemaShapeDenied = hasAnsweredQuestionOption(
    answers,
    'q_observed_probe__edema__edema_bump_stage',
    'flat_spot'
  )
  if (!edemaShapeDenied) return false

  return !hasAnsweredAnyQuestion(answers, [
    'q_black_spots_surface_layer_check',
    'q_black_spots_tissue_moisture_check',
    'q_bacterial_water_soaked'
  ])
}

function shouldAllowForcedContextProblemFollowUp({
  contextProblemGuard = null,
  observedEvidenceSet = []
} = {}) {
  if (!contextProblemGuard?.applies || contextProblemGuard?.hasRequiredContext) {
    return false
  }

  return hasActiveObservedEvidenceEntries(observedEvidenceSet)
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

  const blockedReason = String(symptomClassRuntime?.classGateDecision?.blockedReason || '').trim()
  if (blockedReason === 'no_observed_symptoms') {
    return true
  }

  return Boolean(symptomClassRuntime && typeof symptomClassRuntime === 'object' && !symptomClassRuntime.enabled)
}

function normalizeClassGatedGroupStrategies(symptomClassRuntime = null) {
  return (Array.isArray(symptomClassRuntime?.questionGroupPool) ? symptomClassRuntime.questionGroupPool : [])
    .map(item => ({
      classKey: normalizeKey(item?.classKey),
      groupKey: normalizeKey(item?.groupKey),
      groupRole: String(item?.groupRole || '').trim(),
      basePriority: Number(item?.basePriority || 0),
      maxQuestionsPerRound: Math.max(1, Number(item?.maxQuestionsPerRound || 1)),
      followupModeV1: String(item?.followupModeV1 || '').trim(),
      classGateType: String(item?.classGateType || '').trim(),
      runtimeBlockReason: String(item?.runtimeBlockReason || '').trim()
    }))
    .filter(item => item.groupKey)
}

function shouldSuppressCrossDirectionVisualCandidate(
  candidate = {},
  diagnosisDirections = [],
  symptomClassRuntime = null
) {
  if (!symptomClassRuntime?.enabled) return false

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
  if (!anchoredDirectionKeys.size) return false

  const candidateSymptomKey = normalizeKey(candidate?.symptomKey || '')
  const candidatePatternKey = normalizeKey(candidate?.patternKey || '')
  if (!candidateSymptomKey && !candidatePatternKey) return false

  const candidateDirectionKeys = new Set()
  for (const direction of Array.isArray(diagnosisDirections) ? diagnosisDirections : []) {
    const directionKey = normalizeKey(direction?.directionKey || '')
    if (!directionKey) continue

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

  if (!candidateDirectionKeys.size) return false
  return Array.from(candidateDirectionKeys).every(directionKey => !anchoredDirectionKeys.has(directionKey))
}

function buildClassGatedStrategies({
  symptomClassRuntime = null,
  problemStrategies = [],
  groupQuestions = [],
  rankings = []
} = {}) {
  const groupStrategies = normalizeClassGatedGroupStrategies(symptomClassRuntime)
  if (!groupStrategies.length || !Array.isArray(groupQuestions) || !groupQuestions.length) {
    return []
  }

  const groupStrategyMap = new Map(groupStrategies.map(item => [item.groupKey, item]))
  const currentGroupKey = normalizeKey(symptomClassRuntime?.currentGroupKey)
  const baseProblemKey = normalizeKey(rankings?.[0]?.problemKey || '__symptom_class__')
  const strategies = []
  const seenQuestionKeys = new Set()

  for (const strategy of Array.isArray(problemStrategies) ? problemStrategies : []) {
    const groupStrategy = groupStrategyMap.get(normalizeKey(strategy?.questionGroupKey))
    if (!groupStrategy) continue

    const questionKey = normalizeKey(strategy?.questionKey)
    if (!questionKey) continue

    const priorityBoost =
      Number(groupStrategy.basePriority || 0) +
      normalizeGroupRolePriorityBoost(groupStrategy.groupRole) +
      (groupStrategy.groupKey === currentGroupKey ? 12 : 0)

    strategies.push({
      ...strategy,
      questionGroupKey: groupStrategy.groupKey,
      classKey: normalizeKey(groupStrategy.classKey),
      priorityScore: Number(strategy?.priorityScore || 0) + priorityBoost,
      triggerType: String(strategy?.triggerType || 'candidate').trim() || 'candidate',
      strategyNoteCn:
        String(strategy?.strategyNoteCn || '').trim() ||
        `symptom_class:${groupStrategy.classKey}:${groupStrategy.groupKey}`,
      dataStatus: String(strategy?.dataStatus || 'audited').trim() || 'audited',
      reviewStatus: String(strategy?.reviewStatus || 'audited').trim() || 'audited'
    })
    seenQuestionKeys.add(questionKey)
  }

  for (const question of groupQuestions) {
    const questionKey = normalizeKey(question?.questionKey)
    const groupStrategy = groupStrategyMap.get(normalizeKey(question?.questionGroupKey))
    if (!questionKey || !groupStrategy || seenQuestionKeys.has(questionKey)) continue

    const priorityBoost =
      Number(groupStrategy.basePriority || 0) +
      normalizeGroupRolePriorityBoost(groupStrategy.groupRole) +
      (groupStrategy.groupKey === currentGroupKey ? 12 : 0)

    strategies.push({
      problemKey: baseProblemKey,
      questionGroupKey: groupStrategy.groupKey,
      classKey: normalizeKey(groupStrategy.classKey),
      questionKey,
      priorityScore: Number(question?.priority || 0) + priorityBoost,
      triggerType: 'class_gated',
      strategyNoteCn: `symptom_class:${groupStrategy.classKey}:${groupStrategy.groupKey}`,
      dataStatus: 'audited',
      reviewStatus: 'audited'
    })
  }

  return strategies
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

function shouldBlockMorphologySiblingQuestion(
  targetSymptomKey = '',
  seededTargetSymptomKeys = [],
  symptomMetaMap = new Map()
) {
  const normalizedTargetSymptomKey = String(targetSymptomKey || '').trim()
  if (!normalizedTargetSymptomKey) return false

  const targetMeta = symptomMetaMap.get(normalizedTargetSymptomKey) || {}
  const targetLocationKey = String(targetMeta?.locationKey || '').trim()
  const targetPatternKey = String(targetMeta?.patternKey || '').trim()
  const targetDistributionKey = String(targetMeta?.distributionKey || '').trim()

  if (!targetLocationKey || !targetPatternKey) return false

  for (const seededTargetSymptomKey of Array.isArray(seededTargetSymptomKeys)
    ? seededTargetSymptomKeys
    : []) {
    const normalizedSeededTargetSymptomKey = String(seededTargetSymptomKey || '').trim()
    if (!normalizedSeededTargetSymptomKey) continue
    if (normalizedSeededTargetSymptomKey === normalizedTargetSymptomKey) {
      return true
    }

    const seededMeta = symptomMetaMap.get(normalizedSeededTargetSymptomKey) || {}
    const seededLocationKey = String(seededMeta?.locationKey || '').trim()
    const seededPatternKey = String(seededMeta?.patternKey || '').trim()
    const seededDistributionKey = String(seededMeta?.distributionKey || '').trim()

    const sameLocation = seededLocationKey && seededLocationKey === targetLocationKey
    const samePattern = seededPatternKey && seededPatternKey === targetPatternKey
    const distributionCompatible =
      !targetDistributionKey ||
      !seededDistributionKey ||
      targetDistributionKey === seededDistributionKey

    if (sameLocation && samePattern && distributionCompatible) {
      return true
    }
  }

  return false
}

function mapByKey(list = [], key = 'problemKey') {
  const map = new Map()
  for (const item of list || []) {
    const id = item?.[key]
    if (!id) continue
    map.set(id, item)
  }
  return map
}

function buildSymptomMetaMap(symptomDictionary = []) {
  return new Map(
    (Array.isArray(symptomDictionary) ? symptomDictionary : [])
      .map(item => [String(item?.symptomKey || '').trim(), item])
      .filter(([symptomKey]) => Boolean(symptomKey))
  )
}

function buildObservedSymptomIndex(observedSymptoms = []) {
  const map = new Map()

  for (const item of Array.isArray(observedSymptoms) ? observedSymptoms : []) {
    const symptomKey = String(item?.symptomKey || '').trim()
    if (!symptomKey) continue

    map.set(symptomKey, {
      confidence: Number(item?.confidence || 0),
      signalReliability: Number(item?.signalReliability || 0),
      locationKey: String(item?.locationKey || '').trim(),
      patternKey: String(item?.patternKey || '').trim(),
      distributionKey: String(item?.distributionKey || '').trim()
    })
  }

  return map
}

function isSameMorphologyFamily(
  baseSymptomKey = '',
  candidateSymptomKey = '',
  symptomMetaMap = new Map()
) {
  const normalizedBaseSymptomKey = String(baseSymptomKey || '').trim()
  const normalizedCandidateSymptomKey = String(candidateSymptomKey || '').trim()

  if (!normalizedBaseSymptomKey || !normalizedCandidateSymptomKey) {
    return false
  }

  const baseMeta = symptomMetaMap.get(normalizedBaseSymptomKey) || {}
  const candidateMeta = symptomMetaMap.get(normalizedCandidateSymptomKey) || {}
  const baseLocationKey = String(baseMeta?.locationKey || '').trim()
  const candidateLocationKey = String(candidateMeta?.locationKey || '').trim()
  const basePatternKey = String(baseMeta?.patternKey || '').trim()
  const candidatePatternKey = String(candidateMeta?.patternKey || '').trim()
  const baseDistributionKey = String(baseMeta?.distributionKey || '').trim()
  const candidateDistributionKey = String(candidateMeta?.distributionKey || '').trim()

  if (!baseLocationKey || !candidateLocationKey || baseLocationKey !== candidateLocationKey) {
    return false
  }
  if (!basePatternKey || !candidatePatternKey || basePatternKey !== candidatePatternKey) {
    return false
  }

  if (!baseDistributionKey || !candidateDistributionKey) {
    return true
  }

  return baseDistributionKey === candidateDistributionKey
}

function mergeObservedSymptoms(primary = [], extra = []) {
  const map = new Map()
  const merged = [...(primary || []), ...(extra || [])]
  for (const item of merged) {
    const key = String(item?.symptomKey || '').trim()
    if (!key) continue
    const current = map.get(key)
    if (!current || Number(item.confidence || 0) > Number(current.confidence || 0)) {
      map.set(key, {
        symptomKey: key,
        symptomCn: item.symptomCn || current?.symptomCn || key,
        confidence: clamp01(item.confidence ?? current?.confidence ?? 0.7),
        source: item.source || current?.source || 'visual_ai'
      })
    }
  }
  return Array.from(map.values())
}

function resolveReliabilityScore(rankings = []) {
  const top = rankings[0]
  const second = rankings[1] || { finalScore: 0 }
  if (!top) return 0

  const scoreGap = Math.max(Number(top.finalScore || 0) - Number(second.finalScore || 0), 0)
  const base = 1 - Math.exp(-Math.max(Number(top.finalScore || 0), 0))
  const gapBonus = Math.min(scoreGap, 1) * 0.35
  return clamp01(base * 0.7 + gapBonus)
}

function mergeCandidatePriors(...groups) {
  const merged = new Map()

  for (const group of groups) {
    for (const item of group || []) {
      if (!item?.problemKey) continue
      const existing = merged.get(item.problemKey) || {
        problemKey: item.problemKey,
        genusCompatibility: null,
        hostCompatibility: null,
        finalPriorScore: 0,
        matchedHostLevel: '',
        sourceLayer: '',
        dataStatus: item.dataStatus || 'partial'
      }

      merged.set(item.problemKey, {
        ...existing,
        genusCompatibility:
          item.genusCompatibility ?? existing.genusCompatibility,
        hostCompatibility:
          item.hostCompatibility ?? existing.hostCompatibility,
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
    const statusBaseScore = {
      leading: 0.38,
      candidate: 0.3,
      hint: 0.22
    }[status] || 0.22
    const finalPriorScore = roundNum(statusBaseScore + confidence * 0.12)
    const allowedProblemKeys = Array.isArray(direction?.allowedProblemKeys)
      ? direction.allowedProblemKeys
      : Array.isArray(direction?.candidateProblemKeys)
        ? direction.candidateProblemKeys
        : []

    for (const rawProblemKey of allowedProblemKeys) {
      const problemKey = normalizeKey(rawProblemKey)
      if (!problemKey || existingProblemKeySet.has(problemKey)) continue

      priors.push({
        problemKey,
        genusCompatibility: null,
        hostCompatibility: null,
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

function scopeRankingsToDiagnosisDirections(
  rankings = [],
  diagnosisDirections = [],
  problemRoleByKey = new Map()
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
    return Array.isArray(rankings) ? rankings : []
  }

  const scopedRankings = (Array.isArray(rankings) ? rankings : []).filter(item =>
    allowedProblemKeySet.has(normalizeKey(item?.problemKey || ''))
  )

  if (!scopedRankings.length) {
    return Array.isArray(rankings) ? rankings : []
  }
  return scopedRankings
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
  if (!normalizedProblemKey) return false

  return (Array.isArray(answerEffects) ? answerEffects : []).some(item =>
  {
    if (normalizeKey(item?.effectType || '') !== 'direct_problem_positive') return false
    if (normalizeKey(item?.problemKey || '') !== normalizedProblemKey) return false
    if (Number(item?.value || 0) <= 0) return false

    const { targetDimension } = parseSyntheticObservedProbeQuestionKey(item?.questionKey || '')
    const normalizedTargetDimension =
      normalizeQuestionTargetDimension(item?.targetDimension || '', '') ||
      normalizeQuestionTargetDimension(targetDimension, '')
    return (
      !item?.isGenericObservedProbeDirectPositive &&
      !isGenericObservedProbeDirectEvidenceDimension(normalizedTargetDimension)
    )
  })
}

function shouldBlockUnscopedClassProblemOutput({
  rankings = [],
  diagnosisDirections = [],
  symptomClassRuntime = null,
  answerEffects = [],
  fastConvergencePlan = null
} = {}) {
  const topProblemKey = normalizeKey(rankings?.[0]?.problemKey || '')
  if (!topProblemKey) return false
  if (fastConvergencePlan?.applied) return false
  if (hasDirectPositiveProblemAnswer(answerEffects, topProblemKey)) return false

  const allowedProblemKeySet = collectAllowedProblemKeysFromDiagnosisDirections(diagnosisDirections)
  if (allowedProblemKeySet.size) {
    return !allowedProblemKeySet.has(topProblemKey)
  }

  const currentClassKey = normalizeKey(
    symptomClassRuntime?.currentClassKey || symptomClassRuntime?.primaryClass?.classKey || ''
  )
  return Boolean(currentClassKey)
}

const LOW_YIELD_FOLLOW_UP_DIMENSIONS = new Set([
  QUESTION_TARGET_DIMENSIONS.PROGRESSION,
  QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
  QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
  QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE
])

function getOptionMappingsForQuestion(optionMappings = [], questionKey = '') {
  const normalizedQuestionKey = normalizeKey(questionKey)
  if (!normalizedQuestionKey) return []
  return (Array.isArray(optionMappings) ? optionMappings : []).filter(
    item => normalizeKey(item?.questionKey || item?.question_key || '') === normalizedQuestionKey
  )
}

function optionMappingHasScoreChangingEffect(mapping = {}) {
  if (
    normalizeKey(mapping?.mapsToSymptomKey || mapping?.maps_to_symptom_key || '') &&
    Number(mapping?.value || 0) !== 0
  ) {
    return true
  }

  return (Array.isArray(mapping?.directProblemAdjustments)
    ? mapping.directProblemAdjustments
    : []
  ).some(item => normalizeKey(item?.problemKey || '') && Number(item?.scoreDelta || 0) !== 0)
}

function isLowYieldFollowUpQuestion(question = {}, optionMappings = []) {
  const targetDimension = normalizeQuestionTargetDimension(question?.targetDimension || '', '')
  if (LOW_YIELD_FOLLOW_UP_DIMENSIONS.has(targetDimension)) {
    return true
  }

  const questionKey = normalizeKey(question?.questionKey || '')
  const mappings = getOptionMappingsForQuestion(optionMappings, questionKey)
  if (!mappings.length) {
    return false
  }

  return !mappings.some(optionMappingHasScoreChangingEffect)
}

function evaluateFollowUpStopPolicy({
  shouldAskFollowUp = false,
  filteredFollowUps = [],
  rankings = [],
  contextProblemGuard = null,
  answerEffects = [],
  optionMappings = [],
  fastConvergencePlan = null
} = {}) {
  if (!shouldAskFollowUp || !Array.isArray(filteredFollowUps) || !filteredFollowUps.length) {
    return { shouldStop: false, reason: '', details: {} }
  }

  const lowYieldQuestionKeys = filteredFollowUps
    .filter(item => isLowYieldFollowUpQuestion(item, optionMappings))
    .map(item => normalizeKey(item?.questionKey || ''))
    .filter(Boolean)

  if (lowYieldQuestionKeys.length !== filteredFollowUps.length) {
    return { shouldStop: false, reason: '', details: {} }
  }

  const topProblemKey = normalizeKey(rankings?.[0]?.problemKey || '')
  const contextSatisfied = !contextProblemGuard?.applies || Boolean(contextProblemGuard?.hasRequiredContext)
  const hasProblemLevelPositiveEvidence =
    Boolean(topProblemKey) && hasDirectPositiveProblemAnswer(answerEffects, topProblemKey)
  const conclusionGateSatisfied =
    Boolean(fastConvergencePlan?.applied) ||
    (contextSatisfied && hasProblemLevelPositiveEvidence)

  return {
    shouldStop: true,
    reason: conclusionGateSatisfied
      ? 'conclusion_gate_satisfied_next_question_low_yield'
      : 'next_question_low_yield_no_output_gain',
    details: {
      topProblemKey,
      contextSatisfied,
      hasProblemLevelPositiveEvidence,
      lowYieldQuestionKeys
    }
  }
}

function stabilizeOutputRankingsAgainstConfirmedGuardShift(
  rankings = [],
  contextProblemGuard = null,
  problemRoleByKey = new Map()
) {
  const startProblemKey = normalizeKey(contextProblemGuard?.problemKey || '')
  if (
    !startProblemKey ||
    !contextProblemGuard?.applies ||
    !contextProblemGuard?.hasRequiredContext
  ) {
    return Array.isArray(rankings) ? rankings : []
  }

  const sourceRankings = Array.isArray(rankings) ? rankings : []
  if (OUTPUT_SHIFT_LOCK_EXCLUDED_PROBLEM_KEYS.has(startProblemKey)) {
    return sourceRankings
  }
  const startRankingIndex = sourceRankings.findIndex(
    item => normalizeKey(item?.problemKey || '') === startProblemKey
  )
  if (startRankingIndex <= 0) {
    return sourceRankings
  }

  const startRanking = sourceRankings[startRankingIndex]
  const startProblemRole = normalizeKey(
    startRanking?.problemRole || problemRoleByKey.get(startProblemKey) || ''
  )
  if (!rankingConfig.supportRolesAsTop1.includes(startProblemRole)) {
    return sourceRankings
  }

  return [
    startRanking,
    ...sourceRankings.slice(0, startRankingIndex),
    ...sourceRankings.slice(startRankingIndex + 1)
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
      genusCompatibility: null,
      hostCompatibility: null,
      finalPriorScore: 0.34,
      matchedHostLevel: '',
      sourceLayer: 'answer_direct_adjustment',
      dataStatus: 'partial'
    }))
}

function hasFollowUpHistory({
  round = 1,
  answers = [],
  askedQuestionKeys = [],
  answeredQuestionGroupKeys = []
} = {}) {
  if (Number(round || 1) > 1) return true
  if (Array.isArray(answers) && answers.length > 0) return true
  if (Array.isArray(askedQuestionKeys) && askedQuestionKeys.length > 0) return true
  if (Array.isArray(answeredQuestionGroupKeys) && answeredQuestionGroupKeys.length > 0) return true
  return false
}

function canOpenNextFollowUpRound(round = 1) {
  return true
}

const YELLOWING_GATE_SYMPTOM_KEYS = new Set([
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

const YELLOWING_GATE_CLASS_KEYS = new Set([
  'yellowing_mode',
  'nutrient_stress_mode',
  'thrips_damage_mode'
])

const YELLOWING_PRIMARY_CLUE_GATE_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__yellowing_primary_clue_gate'
const YELLOWING_LEAF_AGE_PATTERN_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern'
const LEAF_YELLOWING_FERTILIZATION_BACKGROUND_QUESTION_KEY =
  'q_leaf_yellowing_fertilization_background'

const STRUCTURAL_DAMAGE_CLASS_KEYS = new Set([
  'chewing_pest_mode'
])

const STRUCTURAL_DAMAGE_GATE_QUESTION_KEYS = new Set([
  'q_observed_probe__holes_in_leaf__structural_cause',
  'q_holes_in_leaf_confirm'
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

const YELLOWING_GATE_ALL_DIMENSIONS = [
  QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
  QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
  QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED
]

const YELLOWING_GATE_BRANCH_DIMENSIONS = [
  QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN
]

const YELLOWING_PRIMARY_CLUE_NEXT_DIMENSIONS = {
  care_context: QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE,
  pest_trace: QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
  disease_trace: QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE
}

const YELLOWING_CARE_AREA_NEXT_DIMENSIONS = {
  watering_area: QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
  light_area: QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
  fertilization_area: QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
  airflow_humidity_area: QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED
}

const YELLOWING_GATE_CONTEXT_DIMENSIONS_BY_PROBLEM = {
  low_light: [QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT],
  sunburn: [QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT],
  heat_stress: [QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT],
  overwatering: [QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT],
  underwatering: [QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT],
  root_stress: [
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED
  ],
  root_rot: [
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED
  ],
  iron_deficiency: [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT],
  nitrogen_deficiency: [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT],
  nutrient_deficiency: [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT],
  chlorosis: [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT]
}

const YELLOWING_GATE_DIMENSION_EQUIVALENTS = {
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE]: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE
  ],
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE]: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE
  ],
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE]: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE
  ],
  [QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE]: [
    QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE
  ],
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN]: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
  ],
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN]: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE
  ],
  [QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT]: [
    QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT
  ],
  [QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT]: [
    QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE
  ],
  [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT]: [
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT
  ],
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED]: [
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ]
}

function resolveYellowingEquivalentDimensions(targetDimension = '') {
  const normalizedTargetDimension = normalizeQuestionTargetDimension(targetDimension, '')
  if (!normalizedTargetDimension) return []

  const equivalents = new Set([
    normalizedTargetDimension,
    ...(YELLOWING_GATE_DIMENSION_EQUIVALENTS[normalizedTargetDimension] || [])
  ])

  for (const [sourceDimension, sourceEquivalents] of Object.entries(YELLOWING_GATE_DIMENSION_EQUIVALENTS)) {
    if (
      sourceDimension === normalizedTargetDimension ||
      (Array.isArray(sourceEquivalents) && sourceEquivalents.includes(normalizedTargetDimension))
    ) {
      equivalents.add(sourceDimension)
      for (const dimension of Array.isArray(sourceEquivalents) ? sourceEquivalents : []) {
        equivalents.add(dimension)
      }
    }
  }

  return Array.from(equivalents)
}

function isYellowingGateSymptomKey(symptomKey = '') {
  return YELLOWING_GATE_SYMPTOM_KEYS.has(normalizeKey(symptomKey))
}

function hasYellowingModeRuntime({
  diagnosisDirections = [],
  observedSymptoms = [],
  observedEvidenceSet = [],
  visualCandidateSymptoms = [],
  symptomClassRuntime = null
} = {}) {
  const runtimeClassKey = normalizeKey(
    symptomClassRuntime?.currentClassKey || symptomClassRuntime?.primaryClass?.classKey || ''
  )
  if (YELLOWING_GATE_CLASS_KEYS.has(runtimeClassKey)) {
    return true
  }

  if (
    (Array.isArray(diagnosisDirections) ? diagnosisDirections : []).some(direction =>
      normalizeKey(direction?.directionKey || '') === 'yellowing_direction'
    )
  ) {
    return true
  }

  if (
    (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []).some(item =>
      isYellowingGateSymptomKey(item?.symptomKey || item?.symptom_key || '')
    )
  ) {
    return true
  }

  if (
    (Array.isArray(visualCandidateSymptoms) ? visualCandidateSymptoms : []).some(item =>
      isYellowingGateSymptomKey(item?.symptomKey || item?.symptom_key || '')
    )
  ) {
    return true
  }

  return (Array.isArray(observedSymptoms) ? observedSymptoms : []).some(item =>
    isYellowingGateSymptomKey(item?.symptomKey || item?.symptom_key || '')
  )
}

function collectAnsweredTargetDimensions(askedQuestions = []) {
  return new Set(
    (Array.isArray(askedQuestions) ? askedQuestions : [])
      .map(item => {
        const questionKey = normalizeKey(item?.questionKey || item?.question_key || item?.symptom_key || '')
        const parsedSyntheticObservedProbe = parseSyntheticObservedProbeQuestionKey(questionKey)
        return normalizeQuestionTargetDimension(item?.targetDimension || item?.target_dimension || '', '') ||
          normalizeQuestionTargetDimension(parsedSyntheticObservedProbe?.targetDimension || '', '')
      })
      .filter(Boolean)
  )
}

function hasAnsweredYellowingGateDimension(answeredDimensions = new Set(), targetDimension = '') {
  const equivalents = resolveYellowingEquivalentDimensions(targetDimension)
  return equivalents.some(dimension => answeredDimensions.has(dimension))
}

function isYellowingEquivalentDimensionAnswered(askedQuestions = [], question = {}) {
  const targetSymptomKey = normalizeKey(question?.targetSymptomKey || question?.target_symptom_key || '')
  if (!isYellowingGateSymptomKey(targetSymptomKey)) {
    return false
  }
  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension || question?.target_dimension || '',
    ''
  )
  if (!targetDimension) {
    return false
  }
  const equivalents = resolveYellowingEquivalentDimensions(targetDimension)
  if (!equivalents.length) {
    return false
  }
  const answeredDimensions = collectAnsweredTargetDimensions(askedQuestions)
  return equivalents.some(dimension => answeredDimensions.has(dimension))
}

function findAnsweredOptionByTargetDimension(askedQuestions = [], targetDimension = '') {
  const equivalents = new Set(resolveYellowingEquivalentDimensions(targetDimension))
  for (const item of Array.isArray(askedQuestions) ? askedQuestions : []) {
    const questionKey = normalizeKey(item?.questionKey || item?.question_key || item?.symptom_key || '')
    const parsedSyntheticObservedProbe = parseSyntheticObservedProbeQuestionKey(questionKey)
    const itemDimension =
      normalizeQuestionTargetDimension(item?.targetDimension || item?.target_dimension || '', '') ||
      normalizeQuestionTargetDimension(parsedSyntheticObservedProbe?.targetDimension || '', '')
    if (!itemDimension || !equivalents.has(itemDimension)) continue
    const optionKey = normalizeKey(item?.optionKey || item?.answerValue || item?.answer_value || '').toLowerCase()
    if (optionKey) return optionKey
  }
  return ''
}

function hasAnsweredOptionForTargetDimension(askedQuestions = [], targetDimension = '', optionKey = '') {
  const expectedOptionKey = normalizeKey(optionKey)
  if (!expectedOptionKey) return false
  const equivalents = new Set(resolveYellowingEquivalentDimensions(targetDimension))
  if (!equivalents.size) return false

  return (Array.isArray(askedQuestions) ? askedQuestions : []).some(item => {
    const questionKey = normalizeKey(item?.questionKey || item?.question_key || item?.symptom_key || '')
    const parsedSyntheticObservedProbe = parseSyntheticObservedProbeQuestionKey(questionKey)
    const itemDimension =
      normalizeQuestionTargetDimension(item?.targetDimension || item?.target_dimension || '', '') ||
      normalizeQuestionTargetDimension(parsedSyntheticObservedProbe?.targetDimension || '', '')
    if (!itemDimension || !equivalents.has(itemDimension)) return false
    return normalizeKey(item?.optionKey || item?.option_key || item?.answerValue || item?.answer_value || '') ===
      expectedOptionKey
  })
}

function isQuestionDimensionEquivalentToAllowed(allowedDimensions = new Set(), targetDimension = '') {
  const normalizedTargetDimension = normalizeQuestionTargetDimension(targetDimension, '')
  if (!normalizedTargetDimension) return true
  if (allowedDimensions.has(normalizedTargetDimension)) return true
  for (const allowedDimension of allowedDimensions) {
    const equivalents = resolveYellowingEquivalentDimensions(allowedDimension)
    if (equivalents.includes(normalizedTargetDimension)) {
      return true
    }
  }
  return false
}

function collectYellowingAllowedDimensionsForAnsweredBranch(askedQuestions = []) {
  const primaryClue = findAnsweredOptionByTargetDimension(
    askedQuestions,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE
  )
  if (!primaryClue) return null

  const allowed = new Set([QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE])
  if (primaryClue === 'care_context') {
    allowed.add(QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE)
    const careArea = findAnsweredOptionByTargetDimension(
      askedQuestions,
      QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE
    )
    const careNextDimension = YELLOWING_CARE_AREA_NEXT_DIMENSIONS[careArea]
    if (careNextDimension) {
      allowed.add(careNextDimension)
      if (
        [
          'watering_area',
          'light_area',
          'airflow_humidity_area'
        ].includes(careArea)
      ) {
        allowed.add(QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED)
      }
    }
    return allowed
  }
  if (primaryClue === 'pest_trace') {
    allowed.add(QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE)
    return allowed
  }
  if (primaryClue === 'disease_trace') {
    allowed.add(QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE)
    allowed.add(QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED)
    return allowed
  }
  if (primaryClue === 'yellowing_only' || primaryClue === 'unknown') {
    allowed.add(QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN)
    allowed.add(QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN)
    return allowed
  }
  return null
}

function isYellowingFollowUpAllowedByAnsweredBranch(askedQuestions = [], question = {}) {
  const targetSymptomKey = normalizeKey(question?.targetSymptomKey || question?.target_symptom_key || '')
  if (!isYellowingGateSymptomKey(targetSymptomKey)) {
    return true
  }
  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension || question?.target_dimension || '',
    ''
  )
  if (!targetDimension) {
    return true
  }
  const allowedDimensions = collectYellowingAllowedDimensionsForAnsweredBranch(askedQuestions)
  if (!allowedDimensions) {
    return true
  }
  return isQuestionDimensionEquivalentToAllowed(allowedDimensions, targetDimension)
}

function getAnsweredOptionKey(answerLikeRecords = [], questionKey = '') {
  const normalizedQuestionKey = normalizeKey(questionKey)
  if (!normalizedQuestionKey) return ''
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
  if (!normalizedQuestionKeys.size) return 0
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
        targetDimension:
          row.targetDimension ||
          row.target_dimension ||
          answer?.targetDimension ||
          answer?.target_dimension ||
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

function shouldBlockFollowUpByRouteConstraint(question = {}, {
  answers = [],
  askedQuestionRows = [],
  symptomClassRuntime = null
} = {}) {
  const questionKey = normalizeKey(question?.questionKey || question?.question_key || '')
  if (!questionKey) return false

  const runtimeClassKey = resolveRuntimeClassKey(symptomClassRuntime)
  const answerRouteRecords = collectAnswerRouteRecords(answers, askedQuestionRows)
  const yellowingPrimaryClue = getAnsweredOptionKey(
    answerRouteRecords,
    YELLOWING_PRIMARY_CLUE_GATE_QUESTION_KEY
  )

  if (
    YELLOWING_GATE_CLASS_KEYS.has(runtimeClassKey) &&
    !yellowingPrimaryClue &&
    questionKey !== YELLOWING_PRIMARY_CLUE_GATE_QUESTION_KEY
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

function filterFollowUpsByAnsweredRouteConstraints(followUps = [], options = {}) {
  return (Array.isArray(followUps) ? followUps : [])
    .filter(question => !shouldBlockFollowUpByRouteConstraint(question, options))
}

function buildYellowingGateRepresentativeSymptom({
  observedSymptoms = [],
  observedEvidenceSet = [],
  visualCandidateSymptoms = []
} = {}) {
  const source =
    (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []).find(item =>
      isYellowingGateSymptomKey(item?.symptomKey || item?.symptom_key || '')
    ) ||
    (Array.isArray(visualCandidateSymptoms) ? visualCandidateSymptoms : []).find(item =>
      isYellowingGateSymptomKey(item?.symptomKey || item?.symptom_key || '')
    ) ||
    (Array.isArray(observedSymptoms) ? observedSymptoms : []).find(item =>
      isYellowingGateSymptomKey(item?.symptomKey || item?.symptom_key || '')
    ) ||
    {}

  return {
    symptomKey: 'leaf_yellowing',
    symptomCn: source?.symptomCn || source?.symptom_cn || '叶片发黄',
    displayTextCn: source?.displayTextCn || source?.display_text_cn || '叶片发黄',
    locationKey: normalizeKey(source?.locationKey || source?.location_key || 'leaf'),
    patternKey: 'yellowing'
  }
}

async function buildYellowingGateDimensionQuestion({
  targetDimension = '',
  observedSymptoms = [],
  observedEvidenceSet = [],
  visualCandidateSymptoms = [],
  answeredDimensions = new Set(),
  plantContext = {},
  weatherContext = null
} = {}) {
  const representativeSymptom = buildYellowingGateRepresentativeSymptom({
    observedSymptoms,
    observedEvidenceSet,
    visualCandidateSymptoms
  })
  const excludedDimensions = YELLOWING_GATE_ALL_DIMENSIONS
    .filter(dimension => dimension !== targetDimension)
    .concat(Array.from(answeredDimensions))
  const questionKey = buildSyntheticObservedProbeQuestionKey('leaf_yellowing', targetDimension)
  const questionTemplates = await getQuestionsByKeys([questionKey])
  const optionTemplates = await getQuestionOptionMappings([questionKey])
  return buildSyntheticObservedProbeQuestions(representativeSymptom, {
    maxQuestions: 1,
    excludedDimensions,
    plantContext,
    weatherContext,
    questionTemplates,
    optionTemplates
  }).slice(0, 1)
}

async function buildYellowingGateFollowUps({
  rankings = [],
  diagnosisDirections = [],
  observedSymptoms = [],
  observedEvidenceSet = [],
  visualCandidateSymptoms = [],
  askedQuestions = [],
  symptomClassRuntime = null,
  plantContext = {},
  weatherContext = null
} = {}) {
  if (
    !hasYellowingModeRuntime({
      diagnosisDirections,
      observedSymptoms,
      observedEvidenceSet,
      visualCandidateSymptoms,
      symptomClassRuntime
    })
  ) {
    return []
  }

  const answeredDimensions = collectAnsweredTargetDimensions(askedQuestions)

  if (!hasAnsweredYellowingGateDimension(
    answeredDimensions,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE
  )) {
    return buildYellowingGateDimensionQuestion({
      targetDimension: QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE,
      observedSymptoms,
      observedEvidenceSet,
      visualCandidateSymptoms,
      answeredDimensions,
      plantContext,
      weatherContext
    })
  }

  const primaryClue = findAnsweredOptionByTargetDimension(
    askedQuestions,
    QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE
  )
  const primaryNextDimension = YELLOWING_PRIMARY_CLUE_NEXT_DIMENSIONS[primaryClue]
  if (
    primaryNextDimension &&
    !hasAnsweredYellowingGateDimension(answeredDimensions, primaryNextDimension)
  ) {
    return buildYellowingGateDimensionQuestion({
      targetDimension: primaryNextDimension,
      observedSymptoms,
      observedEvidenceSet,
      visualCandidateSymptoms,
      answeredDimensions,
      plantContext,
      weatherContext
    })
  }

  if (primaryClue === 'care_context') {
    const careArea = findAnsweredOptionByTargetDimension(
      askedQuestions,
      QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE
    )
    const careNextDimension = YELLOWING_CARE_AREA_NEXT_DIMENSIONS[careArea]
    if (
      careNextDimension &&
      !hasAnsweredYellowingGateDimension(answeredDimensions, careNextDimension)
    ) {
      return buildYellowingGateDimensionQuestion({
        targetDimension: careNextDimension,
        observedSymptoms,
        observedEvidenceSet,
        visualCandidateSymptoms,
        answeredDimensions,
        plantContext,
        weatherContext
      })
    }
  }

  if (['yellowing_only', 'unknown', ''].includes(primaryClue)) {
    const missingBranchDimension = YELLOWING_GATE_BRANCH_DIMENSIONS
      .filter(dimension => dimension !== QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE)
      .find(dimension => !hasAnsweredYellowingGateDimension(answeredDimensions, dimension))
    if (missingBranchDimension) {
      return buildYellowingGateDimensionQuestion({
        targetDimension: missingBranchDimension,
        observedSymptoms,
        observedEvidenceSet,
        visualCandidateSymptoms,
        answeredDimensions,
        plantContext,
        weatherContext
      })
    }
  }

  const topProblemKey = normalizeKey(rankings?.[0]?.problemKey || '')
  const requiredContextDimensions =
    YELLOWING_GATE_CONTEXT_DIMENSIONS_BY_PROBLEM[topProblemKey] || []
  const missingContextDimension = requiredContextDimensions.find(
    dimension => !hasAnsweredYellowingGateDimension(answeredDimensions, dimension)
  )
  if (missingContextDimension) {
    return buildYellowingGateDimensionQuestion({
      targetDimension: missingContextDimension,
      observedSymptoms,
      observedEvidenceSet,
      visualCandidateSymptoms,
      answeredDimensions,
      plantContext,
      weatherContext
    })
  }

  return []
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
  const shouldUseLegacyFallback = !linkedPriorBundle?.hasAnyLinks
  const [plantPriors, genusPriors, hostPriors, evidenceEdges] = await Promise.all([
    shouldUseLegacyFallback
      ? getCandidateProblemPriors(plantContext)
      : Promise.resolve([]),
    shouldUseLegacyFallback
      ? getGenusCandidatePriors(plantContext.genus)
      : Promise.resolve([]),
    shouldUseLegacyFallback
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
    genusCompatibility: null,
    hostCompatibility: null,
    finalPriorScore: 0.35,
    matchedHostLevel: '',
    sourceLayer: 'evidence_hit',
      dataStatus: 'partial'
    }))

  const prioritizedStaticPriors =
    linkedPriors.length || !shouldUseLegacyFallback
      ? linkedPriors
      : mergeCandidatePriors(plantPriors, genusPriors, hostPriors)
  const merged = mergeCandidatePriors(
    prioritizedStaticPriors,
    evidenceOnlyPriors
  )

  if (Number(round || 1) <= 1 && stage !== 'followup') {
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
      genusCompatibility: null,
      hostCompatibility: null,
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

async function buildFollowUps({
  rankings = [],
  observedSymptoms = [],
  observedEvidenceSet = [],
  visualAggregateResult = null,
  diagnosisDirections = [],
  symptomClassRuntime = null,
  symptomDictionary = [],
  askedQuestions = [],
  askedQuestionKeys = [],
  answeredQuestionGroupKeys = [],
  unknownCountByGroup = {},
  visualRouteHints = [],
  suggestedFollowupCapture = [],
  visualRoutePrimaryAction = '',
  blockedTargetSymptomKeys = [],
  maxQuestions = rankingConfig.maxQuestionsPerRound
} = {}) {
  const topProblemKeys = rankings.slice(0, 3).map(item => item.problemKey)
  const classGatedGroupStrategies = normalizeClassGatedGroupStrategies(symptomClassRuntime)
  const restrictToControlledFallback =
    shouldRestrictToControlledFallback(symptomClassRuntime) ||
    shouldRestrictToCandidateSeedOnly({
      symptomClassRuntime,
      observedEvidenceSet
    })
  const effectiveAskedQuestions =
    Array.isArray(askedQuestions) && askedQuestions.length
      ? askedQuestions
      : Array.isArray(askedQuestionKeys) && askedQuestionKeys.length
        ? await getQuestionsByKeys(askedQuestionKeys)
        : []

  const problemStrategies = topProblemKeys.length
    ? await getQuestionStrategies(topProblemKeys)
    : []
  let strategies = problemStrategies
  let questions = []
  let optionMappings = []

  if (classGatedGroupStrategies.length) {
    const allowedGroupKeys = classGatedGroupStrategies.map(item => item.groupKey)
    const classGroupQuestions = await getQuestionsByGroupKeys(allowedGroupKeys)
    const classGatedStrategies = buildClassGatedStrategies({
      symptomClassRuntime,
      problemStrategies,
      groupQuestions: classGroupQuestions,
      rankings
    })

    if (classGatedStrategies.length && classGroupQuestions.length) {
      strategies = classGatedStrategies
      questions = classGroupQuestions
      const questionKeys = Array.from(
        new Set(classGroupQuestions.map(item => item.questionKey).filter(Boolean))
      )
      optionMappings = await getQuestionOptionMappings(questionKeys)
    } else if (classGatedStrategies.length) {
      const classQuestionKeys = Array.from(
        new Set(classGatedStrategies.map(item => item.questionKey).filter(Boolean))
      )
      if (classQuestionKeys.length) {
        const fallbackClassQuestions = await getQuestionsByKeys(classQuestionKeys)
        if (fallbackClassQuestions.length) {
          strategies = classGatedStrategies
          questions = fallbackClassQuestions
          optionMappings = await getQuestionOptionMappings(classQuestionKeys)
        }
      }
    }
  }

  if (!questions.length) {
    if (strategies.length && !restrictToControlledFallback) {
      const questionKeys = Array.from(new Set(strategies.map(item => item.questionKey).filter(Boolean)))
      questions = await getQuestionsByKeys(questionKeys)
      optionMappings = await getQuestionOptionMappings(questionKeys)
    }
  }

  if (!questions.length) {
    questions = []
    optionMappings = []
  }
  const enrichedObservedSymptoms = applySymptomDictionaryToObservedSymptoms(
    observedSymptoms,
    symptomDictionary
  )
  const pendingVisualCandidateSymptoms = collectVisualCandidateSymptoms(
    visualAggregateResult,
    symptomDictionary
  )
  const shouldReserveStructuralVisualCandidateSlot = pendingVisualCandidateSymptoms.some(
    candidate => isStructuralDamageCandidate(candidate) && shouldUseVisualCandidateSeedQuestion(candidate)
  )
  const observedSeedQuestionBudget = shouldReserveStructuralVisualCandidateSlot
    ? Math.max(0, Math.max(1, Number(maxQuestions || 3)) - 1)
    : Math.min(Math.max(1, Number(maxQuestions || 3)), 3)
  const observedSymptomSeedFollowUps = await buildObservedSymptomSeedFollowUps({
    observedSymptoms: enrichedObservedSymptoms,
    observedEvidenceSet,
    diagnosisDirections,
    symptomClassRuntime,
    symptomDictionary,
    askedQuestions: effectiveAskedQuestions,
    askedQuestionKeys,
    answeredQuestionGroupKeys,
    unknownCountByGroup,
    visualRouteHints,
    suggestedFollowupCapture,
    visualRoutePrimaryAction,
    blockedTargetSymptomKeys,
    maxQuestions: observedSeedQuestionBudget
  })
  const selectedSeedQuestionKeys = observedSymptomSeedFollowUps.map(item => item.questionKey)
  const selectedSeedGroupKeys = new Set(
    observedSymptomSeedFollowUps
      .map(item => String(item?.questionGroupKey || '').trim())
      .filter(Boolean)
  )
  const selectedSeedTargetSymptomKeys = observedSymptomSeedFollowUps
    .map(item => String(item?.targetSymptomKey || '').trim())
    .filter(Boolean)
  const symptomMetaMap = mapByKey(symptomDictionary, 'symptomKey')
  const remainingQuestionBudgetAfterObservedSeeds = Math.max(
    0,
    Math.max(1, Number(maxQuestions || 3)) - observedSymptomSeedFollowUps.length
  )
  const visualCandidateSeedFollowUps =
    remainingQuestionBudgetAfterObservedSeeds > 0 && visualAggregateResult
      ? await buildVisualCandidateSeedFollowUps({
          visualAggregateResult,
          diagnosisDirections,
          symptomClassRuntime,
          symptomDictionary,
          observedSymptoms: enrichedObservedSymptoms,
          observedEvidenceSet,
          askedQuestions: effectiveAskedQuestions,
          askedQuestionKeys: [...askedQuestionKeys, ...selectedSeedQuestionKeys],
          answeredQuestionGroupKeys,
          unknownCountByGroup,
          visualRouteHints,
          suggestedFollowupCapture,
          visualRoutePrimaryAction,
          blockedTargetSymptomKeys,
          maxQuestions: remainingQuestionBudgetAfterObservedSeeds
        })
      : []
  const selectedVisualCandidateQuestionKeys = visualCandidateSeedFollowUps.map(
    item => item.questionKey
  )
  const selectedVisualCandidateGroupKeys = new Set(
    visualCandidateSeedFollowUps
      .map(item => String(item?.questionGroupKey || '').trim())
      .filter(Boolean)
  )
  const selectedVisualCandidateTargetSymptomKeys = visualCandidateSeedFollowUps
    .map(item => String(item?.targetSymptomKey || '').trim())
    .filter(Boolean)
  const remainingQuestionBudget = Math.max(
    0,
    remainingQuestionBudgetAfterObservedSeeds - visualCandidateSeedFollowUps.length
  )
  const strategyFollowUps = remainingQuestionBudget > 0
    ? selectFollowUpQuestions({
        rankings,
        strategies,
        questions,
        optionMappings,
        observedSymptoms: enrichedObservedSymptoms,
        observedEvidenceSet,
        askedQuestions: effectiveAskedQuestions,
        symptomDictionary,
        askedQuestionKeys: [
          ...askedQuestionKeys,
          ...selectedSeedQuestionKeys,
          ...selectedVisualCandidateQuestionKeys
        ],
        answeredQuestionGroupKeys,
        unknownCountByGroup,
        visualRouteHints,
        suggestedFollowupCapture,
        visualRoutePrimaryAction,
        diagnosisDirections,
        blockedTargetSymptomKeys,
        symptomClassRuntime,
        maxQuestions: remainingQuestionBudget
      })
    : []

  return [
    ...observedSymptomSeedFollowUps,
    ...visualCandidateSeedFollowUps,
    ...strategyFollowUps.filter(item => {
      const groupKey = String(item?.questionGroupKey || '').trim()
      if (selectedSeedQuestionKeys.includes(item?.questionKey)) return false
      if (groupKey && selectedSeedGroupKeys.has(groupKey)) return false
      if (selectedVisualCandidateQuestionKeys.includes(item?.questionKey)) return false
      if (groupKey && selectedVisualCandidateGroupKeys.has(groupKey)) return false
      if (
        shouldBlockMorphologySiblingQuestion(
          item?.targetSymptomKey,
          [...selectedSeedTargetSymptomKeys, ...selectedVisualCandidateTargetSymptomKeys],
          symptomMetaMap
        )
      ) {
        return false
      }
      return true
    })
  ].slice(0, Math.max(1, Number(maxQuestions || 3)))
}

async function buildProblemScopedFollowUps({
  problemKey = '',
  observedSymptoms = [],
  observedEvidenceSet = [],
  diagnosisDirections = [],
  symptomDictionary = [],
  askedQuestions = [],
  askedQuestionKeys = [],
  answeredQuestionGroupKeys = [],
  unknownCountByGroup = {},
  visualRouteHints = [],
  suggestedFollowupCapture = [],
  visualRoutePrimaryAction = '',
  preferredQuestionKeys = [],
  preferredTargetSymptomKeys = [],
  restrictToPreferred = false,
  maxQuestions = rankingConfig.maxQuestionsPerRound
} = {}) {
  const safeProblemKey = String(problemKey || '').trim()
  if (!safeProblemKey) return []

  const strategies = await getQuestionStrategies([safeProblemKey])
  if (!strategies.length) return []

  const questionKeys = Array.from(new Set(strategies.map(item => item.questionKey).filter(Boolean)))
  const questions = await getQuestionsByKeys(questionKeys)
  const optionMappings = await getQuestionOptionMappings(questionKeys)
  const safeSymptomDictionary = Array.isArray(symptomDictionary) && symptomDictionary.length
    ? symptomDictionary
    : await getSymptomDictionary()
  const effectiveAskedQuestions =
    Array.isArray(askedQuestions) && askedQuestions.length
      ? askedQuestions
      : Array.isArray(askedQuestionKeys) && askedQuestionKeys.length
        ? await getQuestionsByKeys(askedQuestionKeys)
        : []
  const filteredQuestions = filterReturnToVisualPresenceQuestions(
    questions,
    effectiveAskedQuestions
  )
  const filteredQuestionKeySet = new Set(filteredQuestions.map(item => item.questionKey))
  const preferredQuestionKeySet = new Set(
    (Array.isArray(preferredQuestionKeys) ? preferredQuestionKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  const preferredTargetSymptomKeySet = new Set(
    (Array.isArray(preferredTargetSymptomKeys) ? preferredTargetSymptomKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  const askedQuestionSet = new Set(
    (Array.isArray(askedQuestionKeys) ? askedQuestionKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  const blockedGroups = new Set(
    (Array.isArray(answeredQuestionGroupKeys) ? answeredQuestionGroupKeys : [])
      .map(item => String(item || '').trim())
      .filter(item => Boolean(item) && item !== '__default__')
  )
  const optionMap = groupQuestionOptionMappings(optionMappings)

  if (preferredQuestionKeySet.size || preferredTargetSymptomKeySet.size) {
    const questionMap = new Map(filteredQuestions.map(item => [item.questionKey, item]))
    const selectedPreferredQuestions = []
    const usedGroups = new Set()
    const preferredStrategies = strategies
      .filter(strategy => {
        const question = questionMap.get(strategy.questionKey)
        if (!question) return false
        if (preferredQuestionKeySet.has(question.questionKey)) {
          return true
        }
        return preferredTargetSymptomKeySet.has(String(question?.targetSymptomKey || '').trim())
      })
      .sort((a, b) => Number(b.priorityScore || 0) - Number(a.priorityScore || 0))

    for (const strategy of preferredStrategies) {
      const question = questionMap.get(strategy.questionKey)
      if (!question) continue
      if (askedQuestionSet.has(question.questionKey)) continue
      const answeredYellowingPrimaryClue = findAnsweredOptionByTargetDimension(
        effectiveAskedQuestions,
        QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE
      )
      if (
        ['care_context', 'disease_trace'].includes(answeredYellowingPrimaryClue) &&
        [
          'q_spider_webbing_visible',
          'q_thrips_silver_streaks',
          'q_sticky_honeydew_confirm'
        ].includes(question.questionKey)
      ) {
        continue
      }
      if (
        question.questionKey === 'q_sticky_honeydew_confirm' &&
        hasAnsweredOptionForTargetDimension(
          effectiveAskedQuestions,
          QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
          'no_pest_trace'
        )
      ) {
        continue
      }

      const groupKey = String(
        question.questionGroupKey || strategy.questionGroupKey || '__default__'
      ).trim() || '__default__'
      if (blockedGroups.has(groupKey) || usedGroups.has(groupKey)) {
        continue
      }

      selectedPreferredQuestions.push(
        buildStaticFollowUpQuestionPayload(question, optionMap.get(question.questionKey) || [])
      )
      if (groupKey !== '__default__') {
        usedGroups.add(groupKey)
      }
      if (selectedPreferredQuestions.length >= Math.max(1, Number(maxQuestions || 3))) {
        break
      }
    }

    if (selectedPreferredQuestions.length || restrictToPreferred) {
      return selectedPreferredQuestions
    }
  }

  return selectFollowUpQuestions({
    rankings: [{
      problemKey: safeProblemKey,
      finalScore: 1,
      baseScore: 1
    }],
    strategies: strategies.filter(item => filteredQuestionKeySet.has(item.questionKey)),
    questions: filteredQuestions,
    optionMappings: optionMappings.filter(item => filteredQuestionKeySet.has(item.questionKey)),
    observedSymptoms: applySymptomDictionaryToObservedSymptoms(observedSymptoms, safeSymptomDictionary),
    observedEvidenceSet,
    askedQuestions: effectiveAskedQuestions,
    symptomDictionary: safeSymptomDictionary,
    askedQuestionKeys,
    answeredQuestionGroupKeys,
    unknownCountByGroup,
    visualRouteHints,
    suggestedFollowupCapture,
    visualRoutePrimaryAction,
    diagnosisDirections,
    maxQuestions
  })
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

function parseFollowUpRationaleMeta(rationale = '') {
  if (rationale && typeof rationale === 'object') {
    return rationale
  }

  const raw = String(rationale || '').trim()
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    return {}
  }
}

function collectAnswerLikeRecordsFromFollowUpRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => Number(row?.asked || 0) === 1)
    .map(row => {
      const rationale = parseFollowUpRationaleMeta(row?.rationale)
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
        targetDimension: String(rationale?.targetDimension || rationale?.td || '').trim(),
        routingScope: String(rationale?.routingScope || rationale?.rs || '').trim()
      }
    })
    .filter(item => item.questionKey && item.optionKey)
}

function mergeAskedQuestionRows(...groups) {
  const map = new Map()

  for (const item of groups.flat()) {
    const questionKey = normalizeKey(item?.questionKey || item?.question_key || item?.symptom_key || '')
    if (!questionKey) continue

    const existing = map.get(questionKey) || {}
    const parsedSyntheticObservedProbe = parseSyntheticObservedProbeQuestionKey(questionKey)
    const targetDimension =
      normalizeQuestionTargetDimension(item?.targetDimension || item?.target_dimension || '', '') ||
      normalizeQuestionTargetDimension(
        parsedSyntheticObservedProbe?.targetDimension || '',
        ''
      ) ||
      normalizeQuestionTargetDimension(existing?.targetDimension || existing?.target_dimension || '', '')
    const targetSymptomKey = normalizeKey(
      item?.targetSymptomKey ||
        item?.target_symptom_key ||
        parsedSyntheticObservedProbe?.symptomKey ||
        existing?.targetSymptomKey ||
        existing?.target_symptom_key ||
        ''
    )
    const routingScope = normalizeKey(
      item?.routingScope ||
        item?.routing_scope ||
        existing?.routingScope ||
        existing?.routing_scope ||
        ''
    )

    map.set(questionKey, {
      ...existing,
      ...item,
      questionKey,
      targetDimension,
      targetSymptomKey,
      routingScope
    })
  }

  return Array.from(map.values())
}

function collectNegativeTargetSymptomKeysFromAnswers({
  answers = [],
  questions = [],
  optionMappings = []
} = {}) {
  const questionByKey = new Map(
    (Array.isArray(questions) ? questions : [])
      .map(question => [String(question?.questionKey || '').trim(), question])
      .filter(([questionKey]) => Boolean(questionKey))
  )
  const optionByKey = new Map(
    (Array.isArray(optionMappings) ? optionMappings : [])
      .map(option => [
        `${String(option?.questionKey || '').trim()}::${String(option?.optionKey || '').trim()}`,
        option
      ])
      .filter(([answerKey]) => !answerKey.startsWith('::') && !answerKey.endsWith('::'))
  )
  const deniedSymptomKeys = new Set()
  const negativeOptionKeys = new Set(['no', 'none', 'absent', 'false'])

  for (const answer of Array.isArray(answers) ? answers : []) {
    const questionKey = String(answer?.questionKey || '').trim()
    const optionKey = String(answer?.optionKey || '').trim()
    if (!questionKey || !optionKey) continue

    const question = questionByKey.get(questionKey) || null
    const option =
      optionByKey.get(`${questionKey}::${optionKey}`) ||
      optionByKey.get(`${questionKey}::${optionKey.toLowerCase()}`) ||
      null
    const mappedSymptomKey = String(option?.mapsToSymptomKey || '').trim()
    const targetSymptomKey = String(
      answer?.targetSymptomKey ||
        question?.targetSymptomKey ||
        ''
    ).trim()
    const targetDimension = normalizeQuestionTargetDimension(
      answer?.targetDimension ||
        question?.targetDimension,
      ''
    )
    const routingScope = String(
      answer?.routingScope ||
        question?.routingScope ||
        ''
    ).trim()
    const answerValue = Number(option?.value ?? answer?.answerValue ?? 0)
    const answerStatus = String(answer?.status || '').trim().toLowerCase()
    const isNegativeMapping = Number.isFinite(answerValue) && answerValue < 0
    const isTargetPresenceDenial =
      targetSymptomKey &&
      (
        negativeOptionKeys.has(optionKey.toLowerCase()) ||
        answerStatus === 'rejected'
      ) &&
      (
        targetDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE ||
        routingScope === QUESTION_ROUTING_SCOPES.SYMPTOM_CONFIRMATION ||
        routingScope === 'symptom_confirmation'
      )

    if (isNegativeMapping && mappedSymptomKey) {
      deniedSymptomKeys.add(mappedSymptomKey)
    }
    if (isTargetPresenceDenial) {
      deniedSymptomKeys.add(targetSymptomKey)
    }
  }

  return Array.from(deniedSymptomKeys)
}

function collectPositiveMappedObservedSymptomsFromAnswers(answers = [], optionMappings = []) {
  const answerKeySet = new Set(
    (answers || []).map(item => `${item.questionKey}::${item.optionKey}`)
  )
  const observedMap = new Map()

  for (const item of optionMappings || []) {
    if (!answerKeySet.has(`${item.questionKey}::${item.optionKey}`)) continue

    const mappedSymptomKey = String(item.mapsToSymptomKey || '').trim()
    const answerValue = Number(item.value || 0)
    const associationStrength = clamp01(item.associationStrength)
    if (!mappedSymptomKey || answerValue <= 0 || associationStrength <= 0) continue

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
    suggestedFollowupCapture: (Array.isArray(visualAggregateResult?.suggested_followup_capture)
      ? visualAggregateResult.suggested_followup_capture
      : []
    )
      .map(item => String(item || '').trim())
      .filter(Boolean)
  }
}

function buildRetakeAdviceFromVisualRouteContext(visualRouteContext = {}) {
  const followupCapture = Array.isArray(visualRouteContext?.suggestedFollowupCapture)
    ? visualRouteContext.suggestedFollowupCapture
    : []

  if (followupCapture.length) {
    return Array.from(
      new Set(
        followupCapture.map(item =>
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

function normalizeVisualCandidateBand(value = '', fallback = 'low') {
  const normalized = String(value || '').trim().toLowerCase()
  return ['low', 'medium', 'high'].includes(normalized) ? normalized : fallback
}

function normalizeVisualCandidateStrength(value = '', fallback = 'weak') {
  const normalized = String(value || '').trim().toLowerCase()
  return ['weak', 'medium', 'strong'].includes(normalized) ? normalized : fallback
}

function normalizeVisualCandidateReadiness(value = '', fallback = 'cautious') {
  const normalized = String(value || '').trim().toLowerCase()
  return ['retain_only', 'cautious', 'ready'].includes(normalized) ? normalized : fallback
}

function buildAskedNonVisualTargetSymptomSet(askedQuestions = []) {
  return new Set(
    (Array.isArray(askedQuestions) ? askedQuestions : [])
      .filter(
        item =>
          String(item?.targetSymptomKey || '').trim() &&
          normalizeQuestionTargetDimension(
            item?.targetDimension,
            QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
          ) !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
      )
      .map(item => String(item?.targetSymptomKey || '').trim())
      .filter(Boolean)
  )
}

function filterReturnToVisualPresenceQuestions(questions = [], askedQuestions = []) {
  const blockedTargetSymptomSet = buildAskedNonVisualTargetSymptomSet(askedQuestions)
  if (!blockedTargetSymptomSet.size) {
    return Array.isArray(questions) ? questions : []
  }

  return (Array.isArray(questions) ? questions : []).filter(item => {
    const targetSymptomKey = String(item?.targetSymptomKey || '').trim()
    const targetDimension = normalizeQuestionTargetDimension(
      item?.targetDimension,
      QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
    )
    return !(
      targetDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE &&
      blockedTargetSymptomSet.has(targetSymptomKey)
    )
  })
}

function buildStrongVisualPresenceSymptomKeys(observedEvidenceSet = []) {
  const strongVisualPresenceSymptomKeys = new Set()

  for (const item of Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []) {
    const symptomKey = String(item?.symptomKey || '').trim()
    if (!symptomKey) continue

    const sourceType = String(item?.sourceType || item?.source_type || '').trim()
    const currentStatus = String(item?.currentStatus || item?.current_status || 'active').trim()
    const confidence = Number(item?.confidence || 0)
    const isVisualAdmission =
      sourceType === 'visual_admitted' ||
      sourceType === 'visual_admission' ||
      String(item?.parentEvidenceKey || '').startsWith('visual_admission:')

    if (
      isVisualAdmission &&
      currentStatus === 'active' &&
      confidence >= followUpSelection.visualLockThreshold
    ) {
      strongVisualPresenceSymptomKeys.add(symptomKey)
    }
  }

  return strongVisualPresenceSymptomKeys
}

function filterFinalVisualPresenceFollowUps(
  followUps = [],
  {
    askedQuestions = [],
    observedEvidenceSet = [],
    symptomDictionary = []
  } = {}
) {
  const symptomMetaMap = mapByKey(symptomDictionary, 'symptomKey')
  const strongVisualPresenceSymptomKeys = Array.from(
    buildStrongVisualPresenceSymptomKeys(observedEvidenceSet)
  )
  const explicitObservedSymptomKeys = Array.from(
    buildExplicitObservedSymptomKeySet(observedEvidenceSet)
  )
  const effectiveAskedQuestions = Array.isArray(askedQuestions) ? askedQuestions : []

  return (Array.isArray(followUps) ? followUps : []).filter(item => {
    const targetSymptomKey = String(item?.targetSymptomKey || '').trim()
    if (!targetSymptomKey) return true

    const targetDimension = normalizeQuestionTargetDimension(
      item?.targetDimension,
      item?.routingScope === QUESTION_ROUTING_SCOPES.SYMPTOM_CONFIRMATION
        ? QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
        : ''
    )
    if (targetDimension !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
      return true
    }

    for (const explicitObservedSymptomKey of explicitObservedSymptomKeys) {
      if (
        explicitObservedSymptomKey === targetSymptomKey ||
        isSameMorphologyFamily(explicitObservedSymptomKey, targetSymptomKey, symptomMetaMap)
      ) {
        return false
      }
    }

    for (const askedQuestion of effectiveAskedQuestions) {
      const askedTargetSymptomKey = String(askedQuestion?.targetSymptomKey || '').trim()
      if (!askedTargetSymptomKey) continue

      const askedTargetDimension = normalizeQuestionTargetDimension(
        askedQuestion?.targetDimension,
        QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
      )
      if (askedTargetDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
        continue
      }

      if (
        askedTargetSymptomKey === targetSymptomKey ||
        isSameMorphologyFamily(askedTargetSymptomKey, targetSymptomKey, symptomMetaMap)
      ) {
        return false
      }
    }

    for (const strongVisualSymptomKey of strongVisualPresenceSymptomKeys) {
      if (
        strongVisualSymptomKey === targetSymptomKey ||
        isSameMorphologyFamily(strongVisualSymptomKey, targetSymptomKey, symptomMetaMap)
      ) {
        return false
      }
    }

    return true
  })
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

function isHighConfidenceVisualCandidate(item = {}) {
  const confidenceBand = normalizeVisualCandidateBand(item?.confidenceBand, 'low')
  const strengthLevel = normalizeVisualCandidateStrength(item?.strengthLevel, 'weak')
  const admissionReadiness = normalizeVisualCandidateReadiness(item?.admissionReadiness, 'cautious')
  const candidateScore = scoreVisualCandidateSeed(item)

  return (
    admissionReadiness === 'ready' ||
    (confidenceBand === 'high' && strengthLevel !== 'weak') ||
    (strengthLevel === 'strong' && candidateScore >= 75) ||
    candidateScore >= 88
  )
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

function shouldForceMoldDirectionFirstRoundFollowUp({
  diagnosisDirections = [],
  followUpHistory = false,
  canAskAnotherFollowUpRound = false
} = {}) {
  if (followUpHistory || !canAskAnotherFollowUpRound) {
    return false
  }

  return (Array.isArray(diagnosisDirections) ? diagnosisDirections : []).some(direction => {
    if (normalizeKey(direction?.directionKey || '') !== 'mold_direction') {
      return false
    }

    const directionStatus = normalizeKey(direction?.status || '')
    if (!['leading', 'candidate'].includes(directionStatus)) {
      return false
    }

    const matchedSymptomKeys = new Set(
      [
        ...(Array.isArray(direction?.matchedSymptomKeys) ? direction.matchedSymptomKeys : []),
        ...(Array.isArray(direction?.matchedCandidateSymptomKeys)
          ? direction.matchedCandidateSymptomKeys
          : [])
      ]
        .map(item => normalizeKey(item || ''))
        .filter(Boolean)
    )
    const matchedPatternKeys = new Set(
      [
        ...(Array.isArray(direction?.matchedPatternKeys) ? direction.matchedPatternKeys : []),
        ...(Array.isArray(direction?.tracePayload?.matchedCandidatePatternKeys)
          ? direction.tracePayload.matchedCandidatePatternKeys
          : [])
      ]
        .map(item => normalizeKey(item || ''))
        .filter(Boolean)
    )

    return (
      ['black_spots_spreading', 'brown_spots_halo', 'irregular_blotches', 'sooty_mold', 'black_mold_growth']
        .some(symptomKey => matchedSymptomKeys.has(symptomKey)) ||
      ['spots', 'blotch', 'blotches', 'mold'].some(patternKey =>
        matchedPatternKeys.has(patternKey)
      )
    )
  })
}

function shouldForceVisualCandidateOrthogonalFollowUp({
  visualAggregateResult = null,
  symptomDictionary = [],
  observedEvidenceSet = [],
  askedQuestionRows = [],
  askedQuestionKeys = [],
  canAskAnotherFollowUpRound = false
} = {}) {
  if (!canAskAnotherFollowUpRound) {
    return false
  }

  const hasActiveObservedEvidence = (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []).some(
    item => normalizeKey(item?.currentStatus || item?.current_status || 'active') === 'active'
  )
  if (hasActiveObservedEvidence) {
    return false
  }

  const allAskedQuestionKeys = new Set(
    [
      ...(Array.isArray(askedQuestionRows) ? askedQuestionRows.map(item => item?.questionKey) : []),
      ...(Array.isArray(askedQuestionKeys) ? askedQuestionKeys : [])
    ]
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  const candidateSymptoms = collectVisualCandidateSymptoms(visualAggregateResult, symptomDictionary)
  if (!candidateSymptoms.length) {
    return false
  }

  return candidateSymptoms.some(candidate => {
    const symptomKey = normalizeKey(candidate?.symptomKey || '')
    const hasAskedCandidateConfirm = Array.from(allAskedQuestionKeys).some(questionKey => {
      const normalizedQuestionKey = normalizeKey(questionKey)
      return (
        normalizedQuestionKey.startsWith('q_visual_candidate_confirm__') ||
        normalizedQuestionKey === `q_${symptomKey}_confirm` ||
        (normalizedQuestionKey.endsWith('_confirm') && normalizedQuestionKey.includes(symptomKey))
      )
    })
    if (!hasAskedCandidateConfirm) {
      return false
    }

    const patternKey = normalizeKey(candidate?.patternKey || '')
    return (
      [
        'black_spots_spreading',
        'brown_spots_halo',
        'irregular_blotches',
        'chewed_edges',
        'holes_in_leaf',
        'skeletonized_leaves',
        'tunnels_in_leaf'
      ].includes(symptomKey) ||
      ['spots', 'blotch', 'blotches', 'holes', 'chew', 'skeletonization', 'tunnels'].includes(patternKey)
    )
  })
}

function shouldPreferObservedProbeBeforeVisualCandidateConfirm(
  candidate = {},
  diagnosisDirections = []
) {
  const symptomKey = normalizeKey(candidate?.symptomKey || '')
  const patternKey = normalizeKey(candidate?.patternKey || '')
  if (!symptomKey) {
    return false
  }

  const isBroadPestEntrySymptom =
    ['yellow_speckling', 'sticky_honeydew', 'silver_streaks'].includes(symptomKey) ||
    patternKey === 'speckling'
  const isMoldOrLesionEntrySymptom =
    ['black_spots_spreading', 'brown_spots_halo', 'irregular_blotches', 'powder_white', 'sooty_mold', 'black_mold_growth']
      .includes(symptomKey) ||
    ['spots', 'blotch', 'blotches', 'powder', 'mold', 'soaked'].includes(patternKey)
  if (!isBroadPestEntrySymptom && !isMoldOrLesionEntrySymptom) {
    return false
  }

  return (Array.isArray(diagnosisDirections) ? diagnosisDirections : []).some(direction => {
    const directionKey = normalizeKey(direction?.directionKey || '')
    if (
      (isBroadPestEntrySymptom && directionKey !== 'pest_direction') ||
      (isMoldOrLesionEntrySymptom && directionKey !== 'mold_direction')
    ) {
      return false
    }

    const matchedSymptomKeys = new Set(
      [
        ...(Array.isArray(direction?.matchedSymptomKeys) ? direction.matchedSymptomKeys : []),
        ...(Array.isArray(direction?.matchedCandidateSymptomKeys)
          ? direction.matchedCandidateSymptomKeys
          : [])
      ]
        .map(item => normalizeKey(item || ''))
        .filter(Boolean)
    )
    const matchedPatternKeys = new Set(
      [
        ...(Array.isArray(direction?.matchedPatternKeys) ? direction.matchedPatternKeys : []),
        ...(Array.isArray(direction?.tracePayload?.matchedCandidatePatternKeys)
          ? direction.tracePayload.matchedCandidatePatternKeys
          : [])
      ]
        .map(item => normalizeKey(item || ''))
        .filter(Boolean)
    )

    return matchedSymptomKeys.has(symptomKey) || (patternKey && matchedPatternKeys.has(patternKey))
  })
}

function shouldBundleObservedProbeWithVisualCandidateConfirm(candidate = {}) {
  const symptomKey = normalizeKey(candidate?.symptomKey || '')
  const patternKey = normalizeKey(candidate?.patternKey || '')

  return (
    [
      'black_spots_spreading',
      'brown_spots_halo',
      'irregular_blotches',
      'chewed_edges',
      'holes_in_leaf',
      'skeletonized_leaves',
      'tunnels_in_leaf'
    ].includes(symptomKey) ||
    ['spots', 'blotch', 'blotches', 'holes', 'chew', 'skeletonization', 'tunnels'].includes(patternKey)
  )
}

function filterStructuralPriorityStaticQuestions(
  questions = [],
  candidateSymptoms = [],
  symptomMetaMap = new Map()
) {
  const structuralCandidateSymptomKeySet = new Set(
    (Array.isArray(candidateSymptoms) ? candidateSymptoms : [])
      .filter(item => isStructuralDamageCandidate(item))
      .map(item => normalizeKey(item?.symptomKey || ''))
      .filter(Boolean)
  )

  if (!structuralCandidateSymptomKeySet.size) {
    return Array.isArray(questions) ? questions : []
  }

  const hasStructuralConfirmQuestion = (Array.isArray(questions) ? questions : []).some(question => (
    isDedicatedVisualCandidateConfirmQuestion(question) &&
    structuralCandidateSymptomKeySet.has(normalizeKey(question?.targetSymptomKey || ''))
  ))

  if (!hasStructuralConfirmQuestion) {
    return Array.isArray(questions) ? questions : []
  }

  return (Array.isArray(questions) ? questions : []).filter(question => {
    const targetSymptomKey = normalizeKey(question?.targetSymptomKey || '')
    if (!targetSymptomKey || structuralCandidateSymptomKeySet.has(targetSymptomKey)) {
      return true
    }

    const symptomMeta = symptomMetaMap.get(targetSymptomKey) || {}
    if (!isMoldOrLesionCandidate({
      symptomKey: targetSymptomKey,
      patternKey: normalizeKey(symptomMeta?.patternKey || '')
    })) {
      return true
    }

    return false
  })
}

function isDedicatedVisualCandidateConfirmQuestion(question = {}) {
  const questionKey = normalizeKey(question?.questionKey || '')
  const targetSymptomKey = normalizeKey(question?.targetSymptomKey || '')
  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension,
    QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
  )

  if (!questionKey || !targetSymptomKey) {
    return false
  }

  if (targetDimension !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
    return false
  }

  return questionKey === `q_${targetSymptomKey}_confirm`
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
    if (!symptomKey) continue

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
    if (!symptomKey) continue

    const symptomMeta = symptomMap.get(symptomKey) || {}
    if (!normalizeKey(symptomMeta?.symptomKey || '')) continue

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
    .replace(/[\s_\-]+/g, ' ')
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
    if (!normalizedTerm) return false
    if (rawSet.has(normalizedTerm)) return true

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

function buildOutOfPoolObservationFallback(decisionCause = null) {
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
  if (!symptomKey) return null

  const symptomLabel = String(item?.symptomCn || symptomKey).trim() || symptomKey
  const helpText =
    String(item?.userObservationTipCn || '').trim() ||
    `请重点确认“${symptomLabel}”是否真实存在，尽量在自然光下查看受损部位、叶背和整片叶面。`

  return {
    questionKey: buildSyntheticVisualCandidateQuestionKey(symptomKey),
    selectionSource: 'controlled_fallback',
    targetSymptomKey: symptomKey,
    targetDimension: QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE,
    routingScope: QUESTION_ROUTING_SCOPES.SYMPTOM_CONFIRMATION,
    questionRole: 'symptom_confirmation',
    effectMode: 'evidence_admission',
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

function buildFollowUpPayload(question = {}) {
  const questionRole = normalizeQuestionRole(
    question.questionRole || question.question_role || '',
    inferQuestionRole(question.targetDimension || question.target_dimension || '', question.routingScope || question.routing_scope || '')
  )
  const effectMode = normalizeQuestionEffectMode(
    question.effectMode || question.effect_mode || '',
    inferQuestionEffectMode(questionRole, question.targetDimension || question.target_dimension || '')
  )
  return {
    questionId: toQuestionId(question.questionKey),
    questionKey: question.questionKey,
    selectionSource: question.selectionSource || '',
    targetSymptomKey: question.targetSymptomKey || '',
    questionGroupKey: question.questionGroupKey || '',
    targetDimension: question.targetDimension || '',
    routingScope: question.routingScope || '',
    defaultOptionKey: question.defaultOptionKey || '',
    defaultOptionId: question.defaultOptionKey ? toOptionId(question.defaultOptionKey) : '',
    uiVariant: question.uiVariant || '',
    renderMode: question.renderMode || '',
    questionRole,
    questionCategory: questionRole,
    effectMode,
    type: question.questionType || 'single_choice',
    text: question.questionText || '',
    helpText: question.helpText || '',
    options: (Array.isArray(question.options) ? question.options : []).map(option => ({
      optionId: toOptionId(option.optionKey),
      optionKey: option.optionKey,
      text: option.text || '',
      description: option.description || option.desc || '',
      isDefault: Boolean(option.isDefault)
    }))
  }
}

function groupQuestionOptionMappings(optionMappings = []) {
  const map = new Map()
  for (const row of Array.isArray(optionMappings) ? optionMappings : []) {
    const questionKey = String(row?.questionKey || '').trim()
    if (!questionKey) continue
    const list = map.get(questionKey) || []
    list.push(row)
    map.set(questionKey, list)
  }
  return map
}

function ensureUnknownOptionMappingRows(questionKey = '', optionRows = []) {
  const rows = Array.isArray(optionRows) ? [...optionRows] : []
  if (rows.some(item => String(item?.optionKey || '').trim().toLowerCase() === 'unknown')) {
    return rows
  }

  rows.push({
    questionKey: String(questionKey || '').trim(),
    optionKey: 'unknown',
    optionTextCn: '看不出/不确定',
    optionTextUserCn: '看不出/不确定',
    mapsToSymptomKey: '',
    value: 0,
    associationStrength: 0,
    answerEffectCn: '不加分不减分',
    dataStatus: 'synthetic',
    reviewStatus: 'synthetic'
  })

  return rows
}

function buildStaticFollowUpQuestionPayload(question = {}, optionRows = []) {
  return {
    questionKey: question.questionKey,
    selectionSource: question.selectionSource || '',
    targetSymptomKey: question.targetSymptomKey || '',
    questionText: question.questionTextUserCn || question.questionTextCn || '',
    helpText: question.helpTextCn || '',
    questionGroupKey: question.questionGroupKey || '',
    targetDimension: normalizeQuestionTargetDimension(
      question?.targetDimension,
      QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
    ),
    routingScope: String(question?.routingScope || '').trim(),
    defaultOptionKey: question.defaultOptionKey || '',
    uiVariant: question.uiVariant || '',
    renderMode: question.renderMode || '',
    questionType: question.questionType || 'single_choice',
    options: ensureUnknownOptionMappingRows(question.questionKey, optionRows).map(item => ({
      optionKey: item.optionKey,
      text: item.optionTextUserCn || item.optionTextCn || item.optionKey,
      description: item.optionDescriptionUserCn || '',
      isDefault: Boolean(item.isDefault)
    })),
    whyThisQuestion: question.whyThisQuestionCn || ''
  }
}

function shouldRestrictToControlledFallback(symptomClassRuntime = null) {
  if (!symptomClassRuntime || typeof symptomClassRuntime !== 'object') {
    return false
  }

  if (!symptomClassRuntime.enabled) {
    return false
  }

  return normalizeClassGatedGroupStrategies(symptomClassRuntime).length === 0
}

function isControlledFallbackRoutingScopeAllowed(routingScope = '', {
  allowSymptomConfirmation = true,
  allowContextProbe = true,
  allowDifferentialProbe = true
} = {}) {
  const normalizedRoutingScope = String(routingScope || '').trim()
  if (!normalizedRoutingScope) return false
  if (allowSymptomConfirmation && normalizedRoutingScope === QUESTION_ROUTING_SCOPES.SYMPTOM_CONFIRMATION) {
    return true
  }
  if (allowContextProbe && normalizedRoutingScope === QUESTION_ROUTING_SCOPES.CONTEXT_PROBE) {
    return true
  }
  if (allowDifferentialProbe && normalizedRoutingScope === QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE) {
    return true
  }
  return false
}

function filterQuestionsToControlledFallbackScopes(questions = [], options = {}) {
  return (Array.isArray(questions) ? questions : []).filter(question =>
    isControlledFallbackRoutingScopeAllowed(question?.routingScope, options)
  )
}

function markQuestionsAsControlledFallback(questions = []) {
  return (Array.isArray(questions) ? questions : []).map(question => ({
    ...question,
    selectionSource: 'controlled_fallback'
  }))
}

function resolveDominantLesionCandidateSymptomKey(candidateSymptoms = []) {
  const lesionCandidates = (Array.isArray(candidateSymptoms) ? candidateSymptoms : [])
    .filter(item => [
      'black_spots_spreading',
      'brown_spots_halo',
      'irregular_blotches'
    ].includes(String(item?.symptomKey || '').trim()))
    .sort((left, right) => scoreVisualCandidateSeed(right) - scoreVisualCandidateSeed(left))

  return String(lesionCandidates[0]?.symptomKey || '').trim()
}

function resolveContextualLesionCopy(questionKey = '', candidateSymptomKey = '') {
  const normalizedQuestionKey = String(questionKey || '').trim()
  const normalizedCandidateSymptomKey = String(candidateSymptomKey || '').trim()

  if (!normalizedQuestionKey || !normalizedCandidateSymptomKey) return null

  if (normalizedQuestionKey === 'q_black_spots_surface_layer_check') {
    if (normalizedCandidateSymptomKey === 'brown_spots_halo') {
      return {
        questionText: '这些褐色病斑更像长在叶组织里面，还是像浮在表面的脏层、轻擦会蹭开？',
        helpText: '可以轻轻擦拭叶面；若像浮灰或煤污附着在表面并能被蹭开，更像表面附着层，而不是嵌入叶组织的褐色病斑。'
      }
    }

    if (normalizedCandidateSymptomKey === 'irregular_blotches') {
      return {
        questionText: '这些深色斑块更像长在叶组织里面，还是像浮在表面的脏层、轻擦会蹭开？',
        helpText: '可以轻轻擦拭叶面；若像浮灰或煤污附着在表面并能被蹭开，更像表面附着层，而不是嵌入叶组织的深色坏死斑块。'
      }
    }

    return {
      questionText: '这些斑点/斑块更像长在叶组织里面，还是像浮在表面的脏层、轻擦会蹭开？',
      helpText: '可以轻轻擦拭叶面；若像浮灰或煤污附着在表面并能被蹭开，更像表面附着层，而不是嵌入叶组织的病斑。'
    }
  }

  if (normalizedQuestionKey === 'q_black_spots_tissue_moisture_check') {
    if (normalizedCandidateSymptomKey === 'brown_spots_halo') {
      return {
        questionText: '这些褐色病斑摸起来更像干硬坏死，还是发软、带水渍感？',
        helpText: '重点感受病斑中心和边缘的质地；干硬更偏坏死斑，发软或带水渍感更偏湿软病变。'
      }
    }

    if (normalizedCandidateSymptomKey === 'irregular_blotches') {
      return {
        questionText: '这些深色斑块摸起来更像干硬坏死，还是发软、带水渍感？',
        helpText: '重点感受斑块中心和边缘的质地；干硬更偏坏死斑，发软或带水渍感更偏湿软病变。'
      }
    }

    return {
      questionText: '这些斑点/斑块摸起来更像干硬坏死，还是发软、带水渍感？',
      helpText: '重点感受病斑中心和边缘的质地；干硬更偏坏死斑，发软或带水渍感更偏湿软病变。'
    }
  }

  return null
}

function contextualizeVisualCandidateStaticQuestions(
  selectedQuestions = [],
  candidateSymptoms = []
) {
  const dominantLesionCandidateSymptomKey = resolveDominantLesionCandidateSymptomKey(candidateSymptoms)
  if (!dominantLesionCandidateSymptomKey) {
    return Array.isArray(selectedQuestions) ? selectedQuestions : []
  }

  return (Array.isArray(selectedQuestions) ? selectedQuestions : []).map(question => {
    const questionKey = String(question?.questionKey || '').trim()
    if (!['q_black_spots_surface_layer_check', 'q_black_spots_tissue_moisture_check'].includes(questionKey)) {
      return question
    }

    const contextualCopy = resolveContextualLesionCopy(questionKey, dominantLesionCandidateSymptomKey)
    if (!contextualCopy) return question

    return {
      ...question,
      targetSymptomKey: dominantLesionCandidateSymptomKey,
      questionText: contextualCopy.questionText,
      helpText: contextualCopy.helpText
    }
  })
}

async function buildObservedSymptomSeedFollowUps({
  observedSymptoms = [],
  observedEvidenceSet = [],
  diagnosisDirections = [],
  symptomClassRuntime = null,
  symptomDictionary = [],
  askedQuestions = [],
  askedQuestionKeys = [],
  answeredQuestionGroupKeys = [],
  unknownCountByGroup = {},
  visualRouteHints = [],
  suggestedFollowupCapture = [],
  visualRoutePrimaryAction = '',
  blockedTargetSymptomKeys = [],
  maxQuestions = rankingConfig.maxQuestionsPerRound
} = {}) {
  if (Number(maxQuestions || 0) <= 0) return []

  const restrictToControlledFallback =
    shouldRestrictToControlledFallback(symptomClassRuntime) ||
    shouldRestrictToCandidateSeedOnly({
      symptomClassRuntime,
      observedEvidenceSet
    })
  const effectiveAskedQuestions =
    Array.isArray(askedQuestions) && askedQuestions.length
      ? askedQuestions
      : Array.isArray(askedQuestionKeys) && askedQuestionKeys.length
        ? await getQuestionsByKeys(askedQuestionKeys)
        : []
  const effectiveObservedSymptoms =
    Array.isArray(observedEvidenceSet) && observedEvidenceSet.length
      ? applySymptomDictionaryToObservedSymptoms(
          projectObservedSymptomsFromEvidence(observedEvidenceSet),
          symptomDictionary
        )
      : applySymptomDictionaryToObservedSymptoms(observedSymptoms, symptomDictionary)
  const observedSymptomKeys = Array.from(
    new Set(
      effectiveObservedSymptoms
        .map(item => String(item?.symptomKey || '').trim())
        .filter(Boolean)
    )
  )
  if (!observedSymptomKeys.length) return []

  const observedCoveredDimensionBySymptomKey = new Map()
  for (const symptom of effectiveObservedSymptoms) {
    const symptomKey = String(symptom?.symptomKey || '').trim()
    if (!symptomKey) continue
    observedCoveredDimensionBySymptomKey.set(
      symptomKey,
      new Set(inferObservedVisualCoveredDimensions({
        symptomKey,
        patternKey: symptom?.patternKey || ''
      }))
    )
  }

  const bridgedTargetSymptomKeys = collectBridgeTargetSymptomKeys(observedSymptomKeys)
  const questionRows = await findQuestionKeysByTargetSymptoms([
    ...observedSymptomKeys,
    ...bridgedTargetSymptomKeys
  ])
  const questionKeys = Array.from(
    new Set(questionRows.map(item => String(item?.question_key || '').trim()).filter(Boolean))
  )
  const questionPriorityByKey = new Map(
    questionRows.map(item => [String(item?.question_key || '').trim(), Number(item?.priority || 0)])
  )
  const explicitObservedSymptomKeySet = buildExplicitObservedSymptomKeySet(observedEvidenceSet)
  const yellowingRuntimeSyntheticSymptomKeys = new Set([
    'leaf_yellowing',
    'uniform_yellowing',
    'yellow_lower_leaves',
    'yellow_new_leaves',
    'interveinal_chlorosis',
    'pale_new_leaves',
    'yellowing_patchy',
    'yellow_speckling'
  ])
  const legacyYellowingStaticDimensions = new Set([
    QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
    QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
    QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE,
    QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT,
    QUESTION_TARGET_DIMENSIONS.PROGRESSION
  ])
  const highAmbiguitySyntheticFirstDimensions = new Set([
    QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE,
    QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN,
    QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN
  ])
  const questions = questionKeys.length
    ? filterReturnToVisualPresenceQuestions(
        await getQuestionsByKeys(questionKeys),
        effectiveAskedQuestions
      ).filter(item => {
        const targetSymptomKey = normalizeKey(item?.targetSymptomKey || '')
        const targetDimension = normalizeQuestionTargetDimension(
          item?.targetDimension,
          QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
        )
        const coveredDimensions = observedCoveredDimensionBySymptomKey.get(targetSymptomKey) || new Set()
        if (
          legacyYellowingStaticDimensions.has(targetDimension) &&
          (
            yellowingRuntimeSyntheticSymptomKeys.has(targetSymptomKey) ||
            observedSymptomKeys.some(symptomKey => yellowingRuntimeSyntheticSymptomKeys.has(symptomKey))
          )
        ) {
          return false
        }
        if (highAmbiguitySyntheticFirstDimensions.has(targetDimension)) {
          return false
        }

        return !(
          (explicitObservedSymptomKeySet.has(targetSymptomKey) ||
            observedSymptomKeys.includes(targetSymptomKey)) &&
          (
            targetDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE ||
            coveredDimensions.has(targetDimension)
          )
        )
      })
    : []
  const controlledFallbackQuestions = restrictToControlledFallback
    ? filterQuestionsToControlledFallbackScopes(questions, {
        allowSymptomConfirmation: false,
        allowContextProbe: true
      })
    : questions
  const filteredQuestionKeySet = new Set(controlledFallbackQuestions.map(item => item.questionKey))
  const optionMappings = questionKeys.length
    ? (await getQuestionOptionMappings(questionKeys)).filter(item =>
        filteredQuestionKeySet.has(item.questionKey)
      )
    : []
  const strategies = questionKeys.map(questionKey => ({
    problemKey: SYNTHETIC_OBSERVED_SYMPTOM_QUESTION_SEED_PROBLEM_KEY,
    questionGroupKey: '',
    questionKey,
    priorityScore: Number(questionPriorityByKey.get(questionKey) || 0) + 100,
    triggerType: 'observed_symptom_seed',
    strategyNoteCn: 'observed_symptom_seed',
    dataStatus: 'audited',
    reviewStatus: 'audited'
  })).filter(item => filteredQuestionKeySet.has(item.questionKey))

  const selectedStaticQuestions = await selectFollowUpQuestions({
    rankings: [{
      problemKey: SYNTHETIC_OBSERVED_SYMPTOM_QUESTION_SEED_PROBLEM_KEY,
      finalScore: 1,
      baseScore: 1
    }],
    strategies,
    questions: controlledFallbackQuestions,
    optionMappings,
    observedSymptoms: effectiveObservedSymptoms,
    observedEvidenceSet,
    askedQuestions: effectiveAskedQuestions,
    symptomDictionary,
    askedQuestionKeys,
    answeredQuestionGroupKeys,
    unknownCountByGroup,
    visualRouteHints,
    suggestedFollowupCapture,
    visualRoutePrimaryAction,
    diagnosisDirections,
    blockedTargetSymptomKeys,
    maxQuestions
  })

  const selectedQuestions = restrictToControlledFallback
    ? markQuestionsAsControlledFallback(selectedStaticQuestions)
    : [...selectedStaticQuestions]
  const observedSymptomMap = mapByKey(effectiveObservedSymptoms, 'symptomKey')
  const symptomMetaMap = mapByKey(symptomDictionary, 'symptomKey')
  const strongVisualSymptomKeySet = buildStrongVisualPresenceSymptomKeys(observedEvidenceSet)
  const blockedTargetSymptomSet = new Set(
    (Array.isArray(blockedTargetSymptomKeys) ? blockedTargetSymptomKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  const previouslyProbedNonVisualSymptomKeys = new Set(
    effectiveAskedQuestions
      .filter(
        item =>
          normalizeQuestionTargetDimension(
            item?.targetDimension,
            QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
          ) !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
      )
      .map(item => String(item?.targetSymptomKey || '').trim())
      .filter(Boolean)
  )
  const selectedNonVisualSymptomKeys = new Set(
    selectedQuestions
      .filter(
        item =>
          normalizeQuestionTargetDimension(
            item?.targetDimension,
            QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
          ) !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
      )
      .map(item => String(item?.targetSymptomKey || '').trim())
      .filter(Boolean)
  )
  const usedGroupKeys = new Set(
    selectedQuestions
      .map(item => String(item?.questionGroupKey || '').trim())
      .filter(Boolean)
  )
  const askedSet = new Set(
    (Array.isArray(askedQuestionKeys) ? askedQuestionKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  const answeredGroupSet = new Set(
    (Array.isArray(answeredQuestionGroupKeys) ? answeredQuestionGroupKeys : [])
      .map(item => String(item || '').trim())
      .filter(item => Boolean(item) && item !== '__default__')
  )

  for (const symptom of effectiveObservedSymptoms) {
    if (selectedQuestions.length >= Math.max(1, Number(maxQuestions || 3))) {
      break
    }

    const symptomKey = String(symptom?.symptomKey || '').trim()
    if (!symptomKey) continue
    const isPreviouslyProbedSymptom = previouslyProbedNonVisualSymptomKeys.has(symptomKey)
    if (blockedTargetSymptomSet.has(symptomKey) && !isPreviouslyProbedSymptom) continue
    const canUseObservedProbeSeed =
      strongVisualSymptomKeySet.has(symptomKey) || explicitObservedSymptomKeySet.has(symptomKey)
    if (!canUseObservedProbeSeed) continue
    if (selectedNonVisualSymptomKeys.has(symptomKey)) continue
    if (
      previouslyProbedNonVisualSymptomKeys.size > 0 &&
      !shouldAllowSecondaryObservedSymptomProbe(symptomKey, {
        observedSymptomMap,
        previouslyProbedNonVisualSymptomKeys,
        symptomMetaMap
      })
    ) {
      continue
    }

    const askedDimensions = effectiveAskedQuestions
      .filter(item => String(item?.targetSymptomKey || '').trim() === symptomKey)
      .map(item => item?.targetDimension)

    const syntheticQuestions = buildSyntheticObservedProbeQuestions(symptom, {
      maxQuestions: Math.max(
        1,
        Math.min(1, Math.max(1, Number(maxQuestions || 1)) - selectedQuestions.length)
      ),
      excludedDimensions: askedDimensions
    }).filter(question =>
      !restrictToControlledFallback ||
      isControlledFallbackRoutingScopeAllowed(question?.routingScope, {
        allowSymptomConfirmation: false,
        allowContextProbe: true
      })
    )

    for (const syntheticQuestion of syntheticQuestions) {
      if (selectedQuestions.length >= Math.max(1, Math.min(1, Number(maxQuestions || 1)))) {
        break
      }
      if (askedSet.has(syntheticQuestion.questionKey)) continue
      if (answeredGroupSet.has(syntheticQuestion.questionGroupKey)) continue
      if (usedGroupKeys.has(syntheticQuestion.questionGroupKey)) continue

      selectedQuestions.push({
        ...syntheticQuestion,
        selectionSource: restrictToControlledFallback ? 'controlled_fallback' : ''
      })
      usedGroupKeys.add(syntheticQuestion.questionGroupKey)
    }
  }

  return selectedQuestions
}

async function buildVisualCandidateSeedFollowUps({
  visualAggregateResult = null,
  diagnosisDirections = [],
  symptomClassRuntime = null,
  symptomDictionary = [],
  observedSymptoms = [],
  observedEvidenceSet = [],
  askedQuestions = [],
  askedQuestionKeys = [],
  answeredQuestionGroupKeys = [],
  unknownCountByGroup = {},
  visualRouteHints = [],
  suggestedFollowupCapture = [],
  visualRoutePrimaryAction = '',
  blockedTargetSymptomKeys = [],
  maxQuestions = rankingConfig.maxQuestionsPerRound
} = {}) {
  const restrictToControlledFallback =
    shouldRestrictToControlledFallback(symptomClassRuntime) ||
    shouldRestrictToCandidateSeedOnly({
      symptomClassRuntime,
      observedEvidenceSet
    })
  const effectiveAskedQuestions =
    Array.isArray(askedQuestions) && askedQuestions.length
      ? askedQuestions
      : Array.isArray(askedQuestionKeys) && askedQuestionKeys.length
        ? await getQuestionsByKeys(askedQuestionKeys)
        : []
  const candidateSymptoms = collectVisualCandidateSymptoms(visualAggregateResult, symptomDictionary)
  if (!candidateSymptoms.length) return []
  const yellowingCandidateGateFollowUps = await buildYellowingGateFollowUps({
    rankings: [],
    diagnosisDirections,
    observedSymptoms: [],
    observedEvidenceSet,
    visualCandidateSymptoms: candidateSymptoms,
    askedQuestions: effectiveAskedQuestions,
    symptomClassRuntime
  })
  if (yellowingCandidateGateFollowUps.length) {
    return yellowingCandidateGateFollowUps
  }
  const blockedTargetSymptomSet = new Set(
    (Array.isArray(blockedTargetSymptomKeys) ? blockedTargetSymptomKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  const effectiveObservedSymptoms = applySymptomDictionaryToObservedSymptoms(
    Array.isArray(observedEvidenceSet) && observedEvidenceSet.length
      ? projectObservedSymptomsFromEvidence(observedEvidenceSet)
      : observedSymptoms,
    symptomDictionary
  )

  const candidateSymptomKeys = candidateSymptoms.map(item => item.symptomKey).filter(Boolean)
  const bridgedCandidateTargetSymptomKeys = collectBridgeTargetSymptomKeys(candidateSymptomKeys)
  const questionRows = await findQuestionKeysByTargetSymptoms([
    ...candidateSymptomKeys,
    ...bridgedCandidateTargetSymptomKeys
  ])
  const symptomMetaMap = buildSymptomMetaMap(symptomDictionary)
  const observedSymptomMap = buildObservedSymptomIndex(effectiveObservedSymptoms)
  const effectiveCandidateSymptoms = candidateSymptoms.filter(candidate => {
    const symptomKey = String(candidate?.symptomKey || '').trim()
    if (!symptomKey) return false
    if (blockedTargetSymptomSet.has(symptomKey)) return false

    if (!effectiveObservedSymptoms.length) {
      return true
    }

    if (observedSymptomMap.has(symptomKey)) {
      return false
    }

    for (const observedSymptomKey of observedSymptomMap.keys()) {
      if (isSameMorphologyFamily(observedSymptomKey, symptomKey, symptomMetaMap)) {
        return false
      }
    }

    if (shouldSuppressCrossDirectionVisualCandidate(candidate, diagnosisDirections, symptomClassRuntime)) {
      return false
    }

    return shouldUseVisualCandidateSeedQuestion(candidate)
  })
  if (!effectiveCandidateSymptoms.length) return []

  const effectiveCandidateSymptomKeys = effectiveCandidateSymptoms
    .map(item => item.symptomKey)
    .filter(Boolean)
  const highConfidenceVisualCandidateSymptomKeys = new Set(
    effectiveCandidateSymptoms
      .filter(item => isHighConfidenceVisualCandidate(item))
      .map(item => String(item?.symptomKey || '').trim())
      .filter(Boolean)
  )
  const askedSet = new Set(
    (Array.isArray(askedQuestionKeys) ? askedQuestionKeys : [])
      .map(item => String(item || '').trim())
      .filter(Boolean)
  )
  const answeredGroupSet = new Set(
    (Array.isArray(answeredQuestionGroupKeys) ? answeredQuestionGroupKeys : [])
      .map(item => String(item || '').trim())
      .filter(item => Boolean(item) && item !== '__default__')
  )
  const candidatePriorityBySymptomKey = new Map(
    effectiveCandidateSymptoms.map(item => [item.symptomKey, scoreVisualCandidateSeed(item)])
  )
  const questionKeys = Array.from(
    new Set(
      questionRows
        .filter(item =>
          [
            ...effectiveCandidateSymptomKeys,
            ...bridgedCandidateTargetSymptomKeys
          ].includes(String(item?.target_symptom_key || '').trim())
        )
        .map(item => String(item?.question_key || '').trim())
        .filter(Boolean)
    )
  )
  const questionPriorityByKey = new Map(
    questionRows.map(item => [String(item?.question_key || '').trim(), Number(item?.priority || 0)])
  )
  const dedicatedVisualCandidateConfirmQuestionKeys = new Set()
  const symptomsWithUsableStaticQuestion = new Set()
  const questions = questionKeys.length
    ? filterReturnToVisualPresenceQuestions(
        await getQuestionsByKeys(questionKeys),
        effectiveAskedQuestions
      ).filter(item => {
        const questionKey = String(item?.questionKey || '').trim()
        const questionGroupKey = String(item?.questionGroupKey || '').trim()
        if (askedSet.has(questionKey)) {
          return false
        }
        if (questionGroupKey && answeredGroupSet.has(questionGroupKey)) {
          return false
        }

        const targetSymptomKey = String(item?.targetSymptomKey || '').trim()
        const isDedicatedCandidateConfirm = isDedicatedVisualCandidateConfirmQuestion(item)
        if (
          isDedicatedCandidateConfirm &&
          highConfidenceVisualCandidateSymptomKeys.has(targetSymptomKey)
        ) {
          return false
        }

        if (targetSymptomKey && effectiveCandidateSymptomKeys.includes(targetSymptomKey)) {
          symptomsWithUsableStaticQuestion.add(targetSymptomKey)
        }
        if (isDedicatedCandidateConfirm) {
          dedicatedVisualCandidateConfirmQuestionKeys.add(String(item?.questionKey || '').trim())
        }

        return true
      })
    : []
  const controlledFallbackQuestions = restrictToControlledFallback
    ? filterQuestionsToControlledFallbackScopes(questions, {
        allowSymptomConfirmation: true,
        allowContextProbe: true
      })
    : questions
  const filteredQuestionKeySet = new Set(controlledFallbackQuestions.map(item => item.questionKey))
  const forcedStaticConfirmQuestions = questions
    .filter(item => {
      const targetSymptomKey = String(item?.targetSymptomKey || '').trim()
      return (
        effectiveCandidateSymptomKeys.includes(targetSymptomKey) &&
        isDedicatedVisualCandidateConfirmQuestion(item) &&
        !highConfidenceVisualCandidateSymptomKeys.has(targetSymptomKey)
      )
    })
    .sort((left, right) => {
      const leftSymptomKey = String(left?.targetSymptomKey || '').trim()
      const rightSymptomKey = String(right?.targetSymptomKey || '').trim()
      const leftPriority =
        Number(candidatePriorityBySymptomKey.get(leftSymptomKey) || 0) + Number(left?.priority || 0)
      const rightPriority =
        Number(candidatePriorityBySymptomKey.get(rightSymptomKey) || 0) +
        Number(right?.priority || 0)
      return rightPriority - leftPriority
    })
  const dedupedForcedStaticConfirmQuestions = []
  const forcedConfirmGroupKeys = new Set()
  for (const question of forcedStaticConfirmQuestions) {
    const questionGroupKey = String(question?.questionGroupKey || '').trim()
    const dedupeKey =
      questionGroupKey ||
      `${String(question?.targetSymptomKey || '').trim()}::${String(question?.targetDimension || '').trim()}`
    if (forcedConfirmGroupKeys.has(dedupeKey)) continue
    forcedConfirmGroupKeys.add(dedupeKey)
    dedupedForcedStaticConfirmQuestions.push(question)
  }
  const forcedStaticConfirmQuestionKeys = new Set(
    dedupedForcedStaticConfirmQuestions.map(item => String(item?.questionKey || '').trim()).filter(Boolean)
  )
  const remainingStaticQuestionBudget = Math.max(
    0,
    Math.max(1, Number(maxQuestions || 3)) - dedupedForcedStaticConfirmQuestions.length
  )
  const optionMappings = questionKeys.length
    ? (await getQuestionOptionMappings(questionKeys)).filter(item => filteredQuestionKeySet.has(item.questionKey))
    : []
  const optionMap = groupQuestionOptionMappings(optionMappings)
  const strategies = questionKeys.map(questionKey => ({
    problemKey: SYNTHETIC_VISUAL_CANDIDATE_PROBLEM_KEY,
    questionGroupKey: '',
    questionKey,
    priorityScore:
      Number(questionPriorityByKey.get(questionKey) || 0) +
      (dedicatedVisualCandidateConfirmQuestionKeys.has(questionKey) ? 200 : 0),
    triggerType: 'visual_candidate',
    strategyNoteCn: 'visual_candidate_seed',
    dataStatus: 'audited'
  })).filter(item => filteredQuestionKeySet.has(item.questionKey) && !forcedStaticConfirmQuestionKeys.has(item.questionKey))
  const shouldReserveSyntheticCandidateSlot = effectiveCandidateSymptoms.some(
    candidate =>
      (
        candidate?.candidateSource === 'out_of_pool_proxy' ||
        isStructuralDamageCandidate(candidate)
      ) &&
      !symptomsWithUsableStaticQuestion.has(candidate.symptomKey)
  )

  const maxQuestionLimit = Math.max(1, Number(maxQuestions || 3))
  const forcedStaticQuestionPayloads = dedupedForcedStaticConfirmQuestions
    .slice(0, maxQuestionLimit)
    .map(question =>
      buildStaticFollowUpQuestionPayload(
        restrictToControlledFallback
          ? { ...question, selectionSource: 'controlled_fallback' }
          : question,
        optionMap.get(question.questionKey) || []
      )
    )
  const usedForcedStaticGroupKeys = new Set(
    forcedStaticQuestionPayloads
      .map(item => String(item?.questionGroupKey || '').trim())
      .filter(Boolean)
  )
  const selectedStrategyQuestions = strategies.length
    ? selectFollowUpQuestions({
        rankings: [
          {
            problemKey: SYNTHETIC_VISUAL_CANDIDATE_PROBLEM_KEY,
            finalScore: 1,
            baseScore: 1
          }
        ],
        strategies,
        questions: controlledFallbackQuestions,
        optionMappings,
        observedSymptoms: effectiveObservedSymptoms,
        observedEvidenceSet,
        visualCandidateSymptoms: effectiveCandidateSymptoms,
        askedQuestions: effectiveAskedQuestions,
        symptomDictionary,
        askedQuestionKeys,
        answeredQuestionGroupKeys,
        unknownCountByGroup,
        visualRouteHints,
        suggestedFollowupCapture,
        visualRoutePrimaryAction,
        diagnosisDirections,
        maxQuestions: shouldReserveSyntheticCandidateSlot
          ? Math.max(0, Math.min(remainingStaticQuestionBudget, maxQuestionLimit - 1))
          : remainingStaticQuestionBudget
      }).filter(item => {
        const questionGroupKey = String(item?.questionGroupKey || '').trim()
        return !questionGroupKey || !usedForcedStaticGroupKeys.has(questionGroupKey)
      })
    : []
  const selectedStaticQuestions = contextualizeVisualCandidateStaticQuestions(
    filterStructuralPriorityStaticQuestions(
    [
      ...forcedStaticQuestionPayloads,
      ...(restrictToControlledFallback
        ? markQuestionsAsControlledFallback(selectedStrategyQuestions)
        : selectedStrategyQuestions)
    ],
    effectiveCandidateSymptoms,
    symptomMetaMap
    ),
    effectiveCandidateSymptoms
  )
  console.log('diagnose-http visual candidate static followups:', {
    candidateSymptomKeys: effectiveCandidateSymptomKeys,
    questionKeys,
    staticQuestionKeys: questions.map(item => item?.questionKey),
    forcedStaticConfirmQuestionKeys: Array.from(forcedStaticConfirmQuestionKeys),
    selectedStaticQuestionKeys: selectedStaticQuestions.map(item => item?.questionKey)
  })

  const selectedQuestions = [...selectedStaticQuestions]
  const selectedFormalConfirmSymptomKeys = new Set(
    selectedStaticQuestions
      .filter(item => isDedicatedVisualCandidateConfirmQuestion(item))
      .map(item => String(item?.targetSymptomKey || '').trim())
      .filter(Boolean)
  )
  const previouslyAskedVisualPresenceSymptomKeys = new Set(
    effectiveAskedQuestions
      .filter(
        item =>
          normalizeQuestionTargetDimension(
            item?.targetDimension,
            QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
          ) === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
      )
      .map(item => String(item?.targetSymptomKey || '').trim())
      .filter(Boolean)
  )
  const usedGroupKeys = new Set(
    selectedQuestions
      .map(item => String(item?.questionGroupKey || '').trim())
      .filter(Boolean)
  )

  const orderedCandidateSymptoms = [...effectiveCandidateSymptoms].sort((left, right) => {
    const leftPriority = isStructuralDamageCandidate(left) ? 1 : 0
    const rightPriority = isStructuralDamageCandidate(right) ? 1 : 0
    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority
    }
    return scoreVisualCandidateSeed(right) - scoreVisualCandidateSeed(left)
  })

  for (const candidate of orderedCandidateSymptoms) {
    if (selectedQuestions.length >= Math.max(1, Number(maxQuestions || 3))) {
      break
    }
    const askedDimensions = effectiveAskedQuestions
      .filter(item => String(item?.targetSymptomKey || '').trim() === candidate.symptomKey)
      .map(item => item?.targetDimension)
    const prefersObservedProbeFirst = shouldPreferObservedProbeBeforeVisualCandidateConfirm(
      candidate,
      diagnosisDirections
    )
    const syntheticQuestions = buildSyntheticObservedProbeQuestions(candidate, {
      maxQuestions:
        prefersObservedProbeFirst && isMoldOrLesionCandidate(candidate)
          ? 2
          : 1,
      excludedDimensions: askedDimensions
    }).filter(question =>
      !restrictToControlledFallback ||
      isControlledFallbackRoutingScopeAllowed(question?.routingScope, {
        allowSymptomConfirmation: true,
        allowContextProbe: true
      })
    )
    if (selectedFormalConfirmSymptomKeys.has(candidate.symptomKey)) {
      continue
    }
    if (symptomsWithUsableStaticQuestion.has(candidate.symptomKey)) {
      continue
    }
    const shouldPreferObservedProbeFirst = prefersObservedProbeFirst && syntheticQuestions.length > 0

    if (shouldPreferObservedProbeFirst) {
      let addedObservedProbe = false

      for (const syntheticQuestion of syntheticQuestions) {
        if (selectedQuestions.length >= Math.max(1, Number(maxQuestions || 3))) {
          break
        }
        if (askedSet.has(syntheticQuestion.questionKey)) continue
        if (answeredGroupSet.has(syntheticQuestion.questionGroupKey)) continue
        if (usedGroupKeys.has(syntheticQuestion.questionGroupKey)) continue

        selectedQuestions.push({
          ...syntheticQuestion,
          selectionSource: restrictToControlledFallback ? 'controlled_fallback' : ''
        })
        usedGroupKeys.add(syntheticQuestion.questionGroupKey)
        addedObservedProbe = true
      }

      if (addedObservedProbe) {
        continue
      }
    }

    const syntheticCandidateQuestion = isHighConfidenceVisualCandidate(candidate)
      ? null
      : buildSyntheticVisualCandidateQuestion(candidate)
    if (syntheticCandidateQuestion) {
      if (previouslyAskedVisualPresenceSymptomKeys.has(candidate.symptomKey)) {
        continue
      }
      if (
        !askedSet.has(syntheticCandidateQuestion.questionKey) &&
        !answeredGroupSet.has(syntheticCandidateQuestion.questionGroupKey) &&
        !usedGroupKeys.has(syntheticCandidateQuestion.questionGroupKey)
      ) {
        selectedQuestions.push({
          ...syntheticCandidateQuestion,
          selectionSource: 'controlled_fallback'
        })
        usedGroupKeys.add(syntheticCandidateQuestion.questionGroupKey)
        if (
          shouldBundleObservedProbeWithVisualCandidateConfirm(candidate) &&
          syntheticQuestions.length &&
          selectedQuestions.length < Math.max(1, Number(maxQuestions || 3))
        ) {
          for (const syntheticQuestion of syntheticQuestions) {
            if (selectedQuestions.length >= Math.max(1, Number(maxQuestions || 3))) {
              break
            }
            if (askedSet.has(syntheticQuestion.questionKey)) continue
            if (answeredGroupSet.has(syntheticQuestion.questionGroupKey)) continue
            if (usedGroupKeys.has(syntheticQuestion.questionGroupKey)) continue

            selectedQuestions.push({
              ...syntheticQuestion,
              selectionSource: restrictToControlledFallback ? 'controlled_fallback' : ''
            })
            usedGroupKeys.add(syntheticQuestion.questionGroupKey)
            break
          }
        }
        continue
      }
    }

    for (const syntheticQuestion of syntheticQuestions) {
      if (selectedQuestions.length >= Math.max(1, Number(maxQuestions || 3))) {
        break
      }
      if (askedSet.has(syntheticQuestion.questionKey)) continue
      if (answeredGroupSet.has(syntheticQuestion.questionGroupKey)) continue
      if (usedGroupKeys.has(syntheticQuestion.questionGroupKey)) continue

      selectedQuestions.push({
        ...syntheticQuestion,
        selectionSource: restrictToControlledFallback ? 'controlled_fallback' : ''
      })
      usedGroupKeys.add(syntheticQuestion.questionGroupKey)
    }
  }

  return selectedQuestions
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
  const outOfPoolObservationFallback = buildOutOfPoolObservationFallback(normalizedDecisionCause)
  const outOfPoolSummary = outOfPoolObservationFallback?.observationText
    ? `图片中存在当前自动诊断范围外的可见异常。模型原始观察为：${outOfPoolObservationFallback.observationText}。这不是正式诊断结论，系统暂不能给出针对性处理建议；建议先保持观察，避免仅凭本次结果进行大幅养护调整。`
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
        whyItHappens: outOfPoolObservationFallback?.observationText
          ? `当前图片中有可见异常，但该异常未形成可确认的正式诊断证据。模型原始观察为：${outOfPoolObservationFallback.observationText}。`
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
    rankings: [],
    topProblem: null,
    finalResult: {
      resultId,
      problemId: '',
      displayName: isOutOfPoolUncertain ? '发现诊断范围外的可见异常' : '暂不能稳定判断',
      summary,
      severity: 'low',
      urgency: isOutOfPoolUncertain ? 'low' : 'medium',
      outOfPoolObservation: outOfPoolObservationFallback
    },
    followUpRequired: false,
    followUps: [],
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

function buildVisualCandidateFollowUpRoundResult({
  sessionId,
  round = 1,
  plantContext = {},
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  diagnosisDirections = [],
  followUps = [],
  visualRouteContext = {}
} = {}) {
  const advice = buildRetakeAdviceFromVisualRouteContext(visualRouteContext)
  const explanation = {
    whyItHappens: '当前只有视觉候选，还没有达到可直接写入正式证据的阈值，需要先做高价值确认。',
    whatToCheckNext: '请先确认下面这些候选视觉特征是否真实存在。',
    firstAid:
      advice[0] ||
      '在确认前先保持当前养护稳定，避免一次性大幅调整浇水、施肥或用药。',
    avoid: '不要把尚未确认的视觉候选直接当成正式结论处理。',
    reassurance: '先确认关键可见特征，再继续诊断会更稳。'
  }

  const response = {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    stage: 'followup',
    observedSymptoms: [],
    rankings: [],
    topProblem: null,
    finalResult: null,
    followUpRequired: true,
    followUps: (Array.isArray(followUps) ? followUps : []).map(buildFollowUpPayload),
    contributingFactors: [],
    intermediateStates: [],
    problemCausality: [],
    resultExplanation: explanation,
    explanation,
    nextSteps: advice.map((text, index) => ({
      stepId: `candidate_follow_up_${index + 1}`,
      text
    })),
    whatToAvoid: explanation.avoid ? [explanation.avoid] : [],
    confidenceLevel: 'low',
    confidenceReasons: ['candidate_visual_requires_follow_up'],
    needHumanReview: false,
    outcomeType: '',
    routePrimaryAction: 'ask_first',
    stopReason: 'await_follow_up',
    sessionStatus: 'awaiting_follow_up',
    plantId: plantContext.userPlantId || plantContext.plantId || '',
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
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

function toLegacyCompatiblePayload(publicResponse = {}) {
  const topProblem = publicResponse.topProblem || null
  const finalResult = publicResponse.finalResult || null
  const isProblematicOutcome = String(publicResponse.outcomeType || '') === 'problematic'
  return {
    diagnosisId: publicResponse.diagnosisSessionId,
    healthScore: null,
    healthStatus: isProblematicOutcome && topProblem ? 'warning' : 'unknown',
    mainIssue: finalResult?.displayName || topProblem?.displayName || '',
    finalProblemKey: isProblematicOutcome ? (topProblem?.problemKey || finalResult?.problemKey || null) : null,
    finalProblemCn: finalResult?.displayName || topProblem?.displayName || '',
    summary: finalResult?.summary || topProblem?.summary || '',
    observedSymptoms: publicResponse.observedSymptoms || [],
    rankings: (publicResponse.rankings || []).map((item, index) => ({
      problemKey: item.problemKey,
      problemCn: item.problemCn || item.problemKey,
      weightedScore: item.finalScore,
      rankNo: index + 1,
      finalScore: item.finalScore
    })),
    needsFollowUp: Boolean(publicResponse.followUpRequired),
    followUps: (publicResponse.followUps || []).map(item => ({
      questionKey: item.questionKey,
      questionText: item.text,
      questionGroupKey: item.questionGroupKey,
      options: item.options || []
    })),
    problemCausality: publicResponse.problemCausality || [],
    reliabilityScore: 0,
    resultExplanation: publicResponse.resultExplanation || {},
    outcomeType: publicResponse.outcomeType || '',
    routePrimaryAction: publicResponse.routePrimaryAction || ''
  }
}

async function runDiagnosisRound({
  openid,
  plantId = null,
  userPlantId = null,
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
  storedFollowUpRows: preloadedStoredFollowUpRows = null,
  preloadedAskedQuestionRows: preloadedAskedQuestionRows = null,
  sessionId
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
    : await resolvePlantContext({ openid, plantId, userPlantId })
  const visualRouteContext = resolveVisualRouteContext(visualAggregateResult)
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
    if (!questionKey) continue
    if (preloadedAskedQuestionRowMap.has(questionKey)) continue
    preloadedAskedQuestionRowMap.set(questionKey, item)
  }
  const askedQuestionKeysMissingFromCache = askedQuestionKeyList.filter(key =>
    !preloadedAskedQuestionRowMap.has(normalizeKey(key))
  )
  const [
    answerOptionMappingsFromStore,
    fullSymptomDictionary,
    resolvedStoredFollowUpRows,
    askedQuestionRowsFromRepository
  ] = await Promise.all([
    missingQuestionKeys.length
      ? getQuestionOptionMappings(missingQuestionKeys)
      : Promise.resolve([]),
    getSymptomDictionary(),
    Array.isArray(preloadedStoredFollowUpRows)
      ? Promise.resolve(preloadedStoredFollowUpRows)
      : sessionId
        ? listFollowUpRows(sessionId).catch(error => {
          console.warn('diagnose-http failed to load follow-up rows:', {
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
    ...buildSyntheticFollowUpOptionMappings(questionKeys)
  ]) {
    const dedupeKey = buildOptionMappingKey(item)
    if (!dedupeKey) continue
    if (dedupeAnswerOptionMapping.has(dedupeKey)) continue
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
      sourceType: 'legacy_observed_symptom',
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
  const resolutionSymptomRows = resolutionSymptomKeys.length
    ? await getSymptomsByKeys(resolutionSymptomKeys)
    : []
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
  const symptomClassRuntime = await resolveSymptomClassRuntime({
    observedSymptoms: observedSymptomsForResolution,
    round,
    answeredQuestionGroupKeys,
    unknownCountByGroup,
    previousState: symptomClassState
  })
  const askedQuestionRows = mergeAskedQuestionRows(
    Array.from(preloadedAskedQuestionRowMap.values()),
    askedQuestionRowsFromRepository,
    collectAnswerLikeRecordsFromFollowUpRows(resolvedStoredFollowUpRows),
    answers
  )
  const outOfPoolOnlyNoMapping = isOutOfPoolOnlyNoMappingVisualAggregate(visualAggregateResult)
  const outOfPoolRuntimeMappingAvailable = outOfPoolOnlyNoMapping
    ? await hasAuditedOutOfPoolProxyMappingForAggregate(visualAggregateResult)
    : false
  const preliminaryVisualCandidateYellowingGateActive =
    Number(round || 1) <= 1 &&
    stage === 'preliminary' &&
    observedSymptomsForResolution.length === 0 &&
    preferredVisualRouteAction !== 'retake_first' &&
    hasYellowingModeRuntime({
      diagnosisDirections: diagnosisDirectionsForResolution,
      observedSymptoms: observedSymptomsForResolution,
      observedEvidenceSet: labeledObservedEvidenceForResolution,
      visualCandidateSymptoms: visualCandidateSymptomsForResolution,
      symptomClassRuntime
    })
  const preliminaryVisualCandidateYellowingWeatherContext =
    preliminaryVisualCandidateYellowingGateActive
      ? await getFreshCachedWeatherContext(openid)
      : null
  const preliminaryVisualCandidateYellowingGateFollowUps =
    preliminaryVisualCandidateYellowingGateActive
      ? await buildYellowingGateFollowUps({
          rankings: [],
          diagnosisDirections: diagnosisDirectionsForResolution,
          observedSymptoms: observedSymptomsForResolution,
          observedEvidenceSet: labeledObservedEvidenceForResolution,
          visualCandidateSymptoms: visualCandidateSymptomsForResolution,
          askedQuestions: askedQuestionRows,
          symptomClassRuntime,
          plantContext,
          weatherContext: preliminaryVisualCandidateYellowingWeatherContext
        })
      : []
  const visualCandidateFollowUps =
    Number(round || 1) <= 1 &&
    stage === 'preliminary' &&
    observedSymptomsForResolution.length === 0 &&
    preferredVisualRouteAction !== 'retake_first'
      ? preliminaryVisualCandidateYellowingGateFollowUps.length
        ? preliminaryVisualCandidateYellowingGateFollowUps
        : await buildVisualCandidateSeedFollowUps({
            visualAggregateResult,
            diagnosisDirections: diagnosisDirectionsForResolution,
            symptomDictionary: fullSymptomDictionary,
            askedQuestionKeys,
            answeredQuestionGroupKeys,
            unknownCountByGroup,
            visualRouteHints: visualRouteContext.routeHints,
            suggestedFollowupCapture: visualRouteContext.suggestedFollowupCapture,
            visualRoutePrimaryAction: preferredVisualRouteAction,
            maxQuestions: rankingConfig.maxQuestionsPerRound
          })
      : []
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
      legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse),
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
  const weakOutOfPoolHintOnlyPreliminary =
    Number(round || 1) <= 1 &&
    stage === 'preliminary' &&
    observedSymptomsForResolution.length === 0 &&
    outOfPoolHintOnlyBlocksNonProblematic
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
      legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse),
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
    if (visualCandidateFollowUps.length) {
      const publicResponse = buildVisualCandidateFollowUpRoundResult({
        sessionId,
        round,
        plantContext,
        observedEvidenceSet: labeledObservedEvidenceForResolution,
        derivedEvidenceSet: derivedEvidenceForResolution,
        diagnosisDirections: diagnosisDirectionsForResolution,
        followUps: visualCandidateFollowUps,
        visualRouteContext
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
        legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse),
        metrics: {
          reliabilityScore: 0
        },
        plantContext
      }
      attachPrivateSymptomClassRuntime(result, symptomClassRuntime)
      return result
    }

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
              symptomClassRuntime?.classGateDecision?.blockedReason ||
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
        legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse),
        metrics: {
          reliabilityScore: 0
        },
        plantContext
      }
      attachPrivateSymptomClassRuntime(result, symptomClassRuntime)
      return result
    }
  }

  const nonProblematicFollowUpCandidate = canOpenNextFollowUpRound(round)
    ? resolveNonProblematicFollowUpCandidate({
        observedSymptoms: observedSymptomsForResolution,
        observedEvidenceSet: labeledObservedEvidenceForResolution
      })
    : null

  if (nonProblematicFollowUpCandidate) {
    const symptomDictionary = await getSymptomDictionary()
    const followUps = await buildProblemScopedFollowUps({
      problemKey:
        nonProblematicFollowUpCandidate.questionProblemKey ||
        nonProblematicFollowUpCandidate.problemKey ||
        nonProblematicFollowUpCandidate.key ||
        '',
        observedSymptoms: observedSymptomsForResolution,
        observedEvidenceSet: labeledObservedEvidenceForResolution,
        diagnosisDirections: diagnosisDirectionsForResolution,
        symptomDictionary,
        askedQuestions: askedQuestionRows,
      askedQuestionKeys,
      answeredQuestionGroupKeys,
      unknownCountByGroup,
      visualRouteHints: visualRouteContext.routeHints,
      suggestedFollowupCapture: visualRouteContext.suggestedFollowupCapture,
      visualRoutePrimaryAction: preferredVisualRouteAction
    })

    if (followUps.length) {
      const publicResponse = buildNonProblematicFollowUpRoundResult({
        sessionId,
        round,
        observedSymptoms: observedSymptomsForResolution,
        observedEvidenceSet: labeledObservedEvidenceForResolution,
        derivedEvidenceSet: derivedEvidenceForResolution,
        diagnosisDirections: diagnosisDirectionsForResolution,
        plantContext,
        rule: nonProblematicFollowUpCandidate,
        followUps
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
        legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse),
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
      legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse),
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
  const fallbackGenusMapPromise = getGenusCompatibilityMap(
    plantContext.genus,
    candidateProblemKeys
  )
  const fallbackHostMapPromise = getHostCompatibilityMap(
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
    fallbackGenusMap,
    fallbackHostMap
  ] = await Promise.all([
    symptomRowsPromise,
    evidenceEdgesPromise,
    problemsPromise,
    fallbackGenusMapPromise,
    fallbackHostMapPromise
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

  let rankings = candidateProblemKeys.map(problemKey => {
    const prior = priorMap.get(problemKey) || {}
    const genusCompatibility =
      Number(prior.genusCompatibility ?? fallbackGenusMap[problemKey] ?? 0.5)
    const hostCompatibility =
      Number(prior.hostCompatibility ?? fallbackHostMap[problemKey]?.hostCompatibility ?? 1)

    const visualEvidence = Number(visualScores[problemKey] || 0)
    const questionEvidence = Number(questionScores[problemKey] || 0)
    const penalty = Number(penalties[problemKey] || 0)

    const totalEvidence = visualEvidence + evidenceConfig.questionWeight * questionEvidence
    const evidenceCount = [
      visualEvidence > 0,
      questionEvidence > 0
    ].filter(Boolean).length
    const baseScore =
      totalEvidence *
        computeGenusFactor(genusCompatibility) *
        computeHostFactor(hostCompatibility) -
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
      genusCompatibility: roundNum(genusCompatibility),
      hostCompatibility: roundNum(hostCompatibility),
      baseScore: roundNum(baseScore),
      finalScore: roundNum(baseScore)
    }
  })

  rankings = rankings.sort((a, b) => b.baseScore - a.baseScore)

  const allowCausalityBoost = Number(round || 1) > 1 || stage === 'followup'
  const causalityEdges = allowCausalityBoost
    ? candidatePriorsCausalityEdges && candidatePriorsCausalityEdges.length
      ? candidatePriorsCausalityEdges
      : await getCausalityEdges(rankings.slice(0, 3).map(item => item.problemKey))
    : []
  const causalityBoosts = allowCausalityBoost
    ? computeCausalityBoosts(rankings, causalityEdges)
    : {}

  rankings = rankings
    .map(item => {
      const causalityBoost = roundNum(causalityBoosts[item.problemKey] || 0)
      return {
        ...item,
        causalityBoost,
        finalScore: roundNum(item.baseScore + causalityBoost)
      }
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((item, index) => ({ ...item, rankNo: index + 1 }))

  const reliabilityScore = resolveReliabilityScore(rankings)
  const scoreGap = rankings.length > 1 ? rankings[0].finalScore - rankings[1].finalScore : rankings[0]?.finalScore || 0
  const activeObservedSymptomKeys = new Set(
    labeledObservedEvidenceForResolution
      .filter(
        item =>
          Number(item?.enteredRuntime || 0) === 1 &&
          String(item?.currentStatus || '').trim() !== 'superseded'
      )
      .map(item => String(item?.symptomKey || '').trim())
      .filter(Boolean)
  )
  const askedNonVisualTargetSymptomKeys = askedQuestionRows
    .filter(
      item =>
        item?.targetDimension !== QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE &&
        activeObservedSymptomKeys.has(String(item?.targetSymptomKey || '').trim())
    )
    .map(item => String(item?.targetSymptomKey || '').trim())
    .filter(Boolean)
  const answeredFollowUpAnswerRecords = sessionId && askedQuestionKeys.length
    ? collectAnswerLikeRecordsFromFollowUpRows(resolvedStoredFollowUpRows)
    : []
  const negativeAnswerTargetSymptomKeys = Array.from(
    new Set([
      ...answerEffects
        .filter(item => item?.effectType === 'negative')
        .map(item => String(item?.mappedSymptomKey || '').trim())
        .filter(Boolean),
      ...collectNegativeTargetSymptomKeysFromAnswers({
        answers,
        questions: askedQuestionRows,
        optionMappings: answerOptionMappings
      }),
      ...collectNegativeTargetSymptomKeysFromAnswers({
        answers: answeredFollowUpAnswerRecords,
        questions: askedQuestionRows,
        optionMappings: answerOptionMappings
      })
    ])
  )
  const fastConvergencePlan = resolveHighSpecificityConvergencePlan({
    visualAggregateResult,
    visualRouteContext,
    observedEvidenceSet: labeledObservedEvidenceForResolution,
    symptomDictionary: symptomRows,
    rankings,
    problems,
    round,
    stage
  })
  const blockedQuestionTargetSymptomKeys = Array.from(
    new Set([
      ...getHighSpecificityQuestionBlockedSymptomKeys({
        policy: HIGH_SPECIFICITY_FAST_CONVERGENCE_POLICIES.ZERO_FOLLOW_UP
      }),
      ...askedNonVisualTargetSymptomKeys,
      ...negativeAnswerTargetSymptomKeys,
      ...(Array.isArray(fastConvergencePlan?.audit?.matchedSymptomKeys)
        ? fastConvergencePlan.audit.matchedSymptomKeys
        : [])
    ])
  )
  console.log('diagnose-http followup guard context:', {
    sessionId,
    round,
    stage,
    askedQuestionKeys,
    askedNonVisualTargetSymptomKeys,
    negativeAnswerTargetSymptomKeys,
    blockedQuestionTargetSymptomKeys,
    activeObservedSymptomKeys: Array.from(activeObservedSymptomKeys)
  })

  const hasEligibleTop1 = hasOutputEligibleProblemRanking(
    rankings,
    labeledObservedEvidenceForResolution,
    problemRoleByKey,
    {
      symptomClassRuntime,
      answerEffects
    }
  )
  const followUpHistory = hasFollowUpHistory({
    round,
    answers,
    askedQuestionKeys,
    answeredQuestionGroupKeys
  })
  const canAskAnotherFollowUpRound = canOpenNextFollowUpRound(round)
  const weakOutOfPoolHintOnly = isWeakOutOfPoolHintOnlyVisualAggregate(visualAggregateResult)
  const effectiveOutOfPoolOnlyNoMapping =
    outOfPoolOnlyNoMapping && !outOfPoolRuntimeMappingAvailable
  const effectiveWeakOutOfPoolHintOnly =
    weakOutOfPoolHintOnly && !outOfPoolRuntimeMappingAvailable

  const shouldAskFollowUpByRanking =
    preferredVisualRouteAction !== 'retake_first' &&
    canAskAnotherFollowUpRound &&
    (
      preferredVisualRouteAction === 'ask_first' ||
      !hasEligibleTop1 ||
      Number(rankings[0]?.finalScore || 0) < rankingConfig.followUpTopScoreThreshold ||
      Number(scoreGap || 0) < rankingConfig.followUpGapThreshold
    )

  const mergedObservedEvidence = mergeObservedEvidenceSet(
    labeledObservedEvidenceForResolution,
    buildObservedEvidenceSetFromAnswerEffects(answerEffects, symptomMap, {
      originVisualCallBatchId: runtimeOriginVisualCallBatchId,
      firstSeenStage: stage === 'followup' ? 'followup' : stage
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
    rankings,
    observedEvidenceSet: labeledMergedObservedEvidence,
    answerEffects
  })
  const followUpQuestionBudget =
    Number(fastConvergencePlan?.maxQuestions || 0) > 0
      ? Number(fastConvergencePlan.maxQuestions)
      : rankingConfig.maxQuestionsPerRound
  const shouldForceContextFollowUp =
    shouldAllowForcedContextProblemFollowUp({
      contextProblemGuard,
      observedEvidenceSet: labeledMergedObservedEvidence
    }) &&
    canAskAnotherFollowUpRound
  const shouldForceMoldDirectionFollowUp = shouldForceMoldDirectionFirstRoundFollowUp({
    diagnosisDirections,
    followUpHistory,
    canAskAnotherFollowUpRound
  })
  const shouldForceVisualCandidateFollowUp = shouldForceVisualCandidateOrthogonalFollowUp({
    visualAggregateResult,
    symptomDictionary: fullSymptomDictionary,
    observedEvidenceSet: labeledMergedObservedEvidence,
    askedQuestionRows,
    askedQuestionKeys,
    canAskAnotherFollowUpRound
  })
  const shouldForceWeakOutOfPoolHintFollowUp =
    effectiveWeakOutOfPoolHintOnly &&
    !effectiveOutOfPoolOnlyNoMapping &&
    canAskAnotherFollowUpRound &&
    !followUpHistory
  const broadVisualDifferentialActive = hasBroadVisualDifferentialInput({
    symptomClassRuntime: mergedSymptomClassRuntime,
    observedEvidenceSet: labeledMergedObservedEvidence
  })
  const edemaFlatSpotDifferentialActive = hasUnresolvedEdemaFlatSpotDifferential({
    answers,
    symptomClassRuntime: mergedSymptomClassRuntime,
    observedEvidenceSet: labeledMergedObservedEvidence
  })
  const shouldForceBroadVisualDifferentialFollowUp =
    (broadVisualDifferentialActive || edemaFlatSpotDifferentialActive) &&
    canAskAnotherFollowUpRound &&
    !Boolean(fastConvergencePlan?.applied) &&
    !Boolean(fastConvergencePlan?.shouldBypassFollowUp)
  const yellowingGateRuntimeActive =
    canAskAnotherFollowUpRound &&
    hasYellowingModeRuntime({
      diagnosisDirections,
      observedSymptoms: mergedObservedSymptoms,
      observedEvidenceSet: labeledMergedObservedEvidence,
      visualCandidateSymptoms: visualCandidateSymptomsForRuntime,
      symptomClassRuntime: mergedSymptomClassRuntime
    })
  const yellowingGateWeatherContext = yellowingGateRuntimeActive
    ? await getFreshCachedWeatherContext(openid)
    : null
  const forcedYellowingGateFollowUps = yellowingGateRuntimeActive
    ? await buildYellowingGateFollowUps({
        rankings,
        diagnosisDirections,
        observedSymptoms: mergedObservedSymptoms,
        observedEvidenceSet: labeledMergedObservedEvidence,
        visualCandidateSymptoms: visualCandidateSymptomsForRuntime,
        askedQuestions: askedQuestionRows,
        symptomClassRuntime: mergedSymptomClassRuntime,
        plantContext,
        weatherContext: yellowingGateWeatherContext
      })
    : []
  const shouldForceYellowingGateFollowUp = forcedYellowingGateFollowUps.length > 0
  const shouldAskFollowUp =
    (
      shouldAskFollowUpByRanking ||
      shouldForceContextFollowUp ||
      shouldForceMoldDirectionFollowUp ||
      shouldForceVisualCandidateFollowUp ||
      shouldForceYellowingGateFollowUp ||
      shouldForceBroadVisualDifferentialFollowUp ||
      shouldForceWeakOutOfPoolHintFollowUp
    ) &&
    !Boolean(fastConvergencePlan?.shouldBypassFollowUp)
  const forcedContextFollowUps =
    shouldAskFollowUp && !shouldForceYellowingGateFollowUp && shouldForceContextFollowUp
      ? await buildProblemScopedFollowUps({
        problemKey: contextProblemGuard.problemKey,
        observedSymptoms: mergedObservedSymptoms,
        observedEvidenceSet: labeledMergedObservedEvidence,
        diagnosisDirections,
        symptomDictionary: symptomRows,
        askedQuestions: askedQuestionRows,
          askedQuestionKeys,
          answeredQuestionGroupKeys,
          unknownCountByGroup,
          visualRouteHints: visualRouteContext.routeHints,
          suggestedFollowupCapture: visualRouteContext.suggestedFollowupCapture,
          visualRoutePrimaryAction: preferredVisualRouteAction,
          preferredQuestionKeys: contextProblemGuard.preferredQuestionKeys,
          preferredTargetSymptomKeys: contextProblemGuard.matchedSymptomKeys,
          restrictToPreferred: true,
          maxQuestions: Math.min(
            contextProblemGuard.maxForcedQuestions,
            Math.max(1, Number(followUpQuestionBudget || rankingConfig.maxQuestionsPerRound))
          )
        })
      : []
  const remainingGeneralQuestionBudget = shouldForceYellowingGateFollowUp
    ? 0
    : Math.max(
        0,
        Math.max(1, Number(followUpQuestionBudget || rankingConfig.maxQuestionsPerRound)) -
          forcedContextFollowUps.length
      )
  const genericFollowUps =
    shouldAskFollowUp && remainingGeneralQuestionBudget > 0
      ? await buildFollowUps({
          rankings,
          observedSymptoms: mergedObservedSymptoms,
          observedEvidenceSet: labeledMergedObservedEvidence,
          visualAggregateResult,
          diagnosisDirections,
          symptomClassRuntime: mergedSymptomClassRuntime,
          askedQuestions: askedQuestionRows,
          symptomDictionary: symptomRows,
          askedQuestionKeys,
          answeredQuestionGroupKeys,
          unknownCountByGroup,
          visualRouteHints: visualRouteContext.routeHints,
          suggestedFollowupCapture: visualRouteContext.suggestedFollowupCapture,
          visualRoutePrimaryAction: preferredVisualRouteAction,
          blockedTargetSymptomKeys: blockedQuestionTargetSymptomKeys,
          maxQuestions: remainingGeneralQuestionBudget
        })
      : []
  const followUps = []
  const seenFollowUpQuestionKeys = new Set()
  const followUpCandidates = shouldForceYellowingGateFollowUp
    ? forcedYellowingGateFollowUps
    : [...forcedContextFollowUps, ...genericFollowUps]
  for (const item of followUpCandidates) {
    const questionKey = String(item?.questionKey || '').trim()
    if (!questionKey || seenFollowUpQuestionKeys.has(questionKey)) continue
    if (
      !isYellowingFollowUpAllowedByAnsweredBranch(askedQuestionRows, item) ||
      (
      !shouldForceYellowingGateFollowUp &&
      isYellowingEquivalentDimensionAnswered(askedQuestionRows, item)
      )
    ) {
      continue
    }
    seenFollowUpQuestionKeys.add(questionKey)
    followUps.push(item)
  }
  const visualFilteredFollowUps = filterFinalVisualPresenceFollowUps(followUps, {
    askedQuestions: askedQuestionRows,
    observedEvidenceSet: labeledMergedObservedEvidence,
    symptomDictionary: symptomRows
  })
  const routeConstrainedFollowUps = filterFollowUpsByAnsweredRouteConstraints(
    visualFilteredFollowUps,
    {
      answers,
      askedQuestionRows,
      symptomClassRuntime: mergedSymptomClassRuntime
    }
  )
  const candidateFilteredFollowUps = routeConstrainedFollowUps.slice(0, 1)
  const candidateFollowUpQuestionKeys = Array.from(
    new Set(
      candidateFilteredFollowUps
        .map(item => String(item?.questionKey || '').trim())
        .filter(Boolean)
    )
  )
  const candidateStaticOptionMappings = candidateFollowUpQuestionKeys.length
    ? await getQuestionOptionMappings(candidateFollowUpQuestionKeys)
    : []
  const candidateSyntheticOptionMappings = candidateFollowUpQuestionKeys.length
    ? buildSyntheticFollowUpOptionMappings(candidateFollowUpQuestionKeys)
    : []
  const followUpStopPolicy = evaluateFollowUpStopPolicy({
    shouldAskFollowUp,
    filteredFollowUps: candidateFilteredFollowUps,
    rankings,
    contextProblemGuard,
    answerEffects,
    optionMappings: [
      ...answerOptionMappings,
      ...candidateStaticOptionMappings,
      ...candidateSyntheticOptionMappings
    ],
    fastConvergencePlan
  })
  const filteredFollowUps = followUpStopPolicy.shouldStop ? [] : candidateFilteredFollowUps
  const hasAvailableFollowUpQuestions = filteredFollowUps.length > 0
  const effectiveShouldAskFollowUp = Boolean(shouldAskFollowUp && hasAvailableFollowUpQuestions)
  const exhaustedFollowUpQuestionPool = Boolean(shouldAskFollowUp && !hasAvailableFollowUpQuestions)
  if (filteredFollowUps.length !== followUps.length) {
    console.log('diagnose-http final followup visual-filter:', {
      sessionId,
      round,
      removedQuestionKeys: followUps
        .map(item => item?.questionKey)
        .filter(questionKey => !filteredFollowUps.some(item => item?.questionKey === questionKey)),
      routeConstraintRemovedQuestionKeys: visualFilteredFollowUps
        .map(item => item?.questionKey)
        .filter(questionKey => !routeConstrainedFollowUps.some(item => item?.questionKey === questionKey)),
      keptQuestionKeys: filteredFollowUps.map(item => item?.questionKey)
    })
  }
  console.log('diagnose-http followup selection result:', {
    sessionId,
    round,
    stage,
    shouldAskFollowUp,
    shouldForceContextFollowUp,
    shouldForceMoldDirectionFollowUp,
    shouldForceVisualCandidateFollowUp,
    shouldForceYellowingGateFollowUp,
    yellowingGateQuestionKeys: forcedYellowingGateFollowUps.map(item => item.questionKey),
    shouldForceBroadVisualDifferentialFollowUp,
    broadVisualDifferentialActive,
    edemaFlatSpotDifferentialActive,
    shouldForceWeakOutOfPoolHintFollowUp,
    weakOutOfPoolHintOnly,
    outOfPoolOnlyNoMapping,
    outOfPoolRuntimeMappingAvailable,
    effectiveWeakOutOfPoolHintOnly,
    effectiveOutOfPoolOnlyNoMapping,
    hasAvailableFollowUpQuestions,
    effectiveShouldAskFollowUp,
    exhaustedFollowUpQuestionPool,
    contextProblemGuard,
    followUpStopPolicy,
    questionKeys: filteredFollowUps.map(item => item.questionKey),
    routePrimaryAction: preferredVisualRouteAction
  })

  const visualObservedSymptomsForConfidence = applySymptomDictionaryToObservedSymptoms(
    projectVisualObservedSymptomsFromEvidence(labeledMergedObservedEvidence),
    symptomRows
  )

  const lowConfidenceBase = resolveLowConfidenceState({
    rankings,
    observedSymptoms: visualObservedSymptomsForConfidence,
    observedEvidenceSet: labeledMergedObservedEvidence,
    unknownCountByGroup,
    noHighValueQuestion: false,
    problemRoleByKey,
    symptomClassRuntime: mergedSymptomClassRuntime
  })
  const followUpRequired = effectiveShouldAskFollowUp
  const prioritizedOutputRankings =
    !followUpRequired
      ? prioritizeOutputEligibleProblemRankings(
        rankings,
        labeledMergedObservedEvidence,
        problemRoleByKey,
        {
          symptomClassRuntime: mergedSymptomClassRuntime,
          answerEffects
        }
      )
      : rankings
  const outputRankings =
    !followUpRequired
      ? scopeRankingsToDiagnosisDirections(
          prioritizedOutputRankings,
          diagnosisDirections,
          problemRoleByKey
        )
      : prioritizedOutputRankings
  const stabilizedOutputRankings = !followUpRequired
    ? stabilizeOutputRankingsAgainstConfirmedGuardShift(
        outputRankings,
        contextProblemGuard,
        problemRoleByKey
      )
    : outputRankings
  const outputContextProblemGuard = evaluateContextRequiredProblemGuard({
    rankings: stabilizedOutputRankings,
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
          filteredFollowUps.length === 0
            ? 'input_unfillable'
            : '')
      }
  if (
    outputContextProblemGuard.applies &&
    outputContextProblemGuard.problemKey !== contextProblemGuard.problemKey
  ) {
    console.log('diagnose-http output context guard shifted:', {
      sessionId,
      round,
      startProblemKey: contextProblemGuard.problemKey,
      outputProblemKey: outputContextProblemGuard.problemKey,
      outputHasRequiredContext: outputContextProblemGuard.hasRequiredContext
    })
  }
  const hasEligibleOutputProblem = hasOutputEligibleProblemRanking(
    stabilizedOutputRankings,
    labeledMergedObservedEvidence,
    problemRoleByKey,
    {
      symptomClassRuntime: mergedSymptomClassRuntime,
      answerEffects
    }
  )
  const hasForceableOutputProblem = hasForceableOutputProblemRanking(
    stabilizedOutputRankings,
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
  const yellowingOnlyRuntimeEvidenceAfterFollowUp =
    !followUpRequired &&
    followUpHistory &&
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
  const structuralOnlyRuntimeEvidenceAfterFollowUp =
    !followUpRequired &&
    followUpHistory &&
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
    ].includes(String(stabilizedOutputRankings?.[0]?.problemKey || '').trim()) &&
    Number(stabilizedOutputRankings?.[0]?.questionEvidence || 0) <= 0
  const hasLeafSpotBridgeRoutingGap =
    !followUpRequired &&
    String(mergedSymptomClassRuntime?.classGateDecision?.blockedReason || '').trim() === 'class_group_pool_empty' &&
    Array.isArray(mergedSymptomClassRuntime?.classScores) &&
    mergedSymptomClassRuntime.classScores.some(
      item => String(item?.classKey || '').trim() === 'leaf_spot_complex_mode'
    )
  const hasAnyRankedOutputProblem = Array.isArray(stabilizedOutputRankings)
    && stabilizedOutputRankings.some(item => String(item?.problemKey || '').trim())
  const shouldBlockUnscopedClassOutput =
    !followUpRequired &&
    shouldBlockUnscopedClassProblemOutput({
      rankings: stabilizedOutputRankings,
      diagnosisDirections,
      symptomClassRuntime: mergedSymptomClassRuntime,
      answerEffects,
      fastConvergencePlan
    })
  const shouldBlockUnforceableFollowUpOutcome =
    !followUpRequired &&
    followUpHistory &&
    !hasForceableOutputProblem &&
    filteredFollowUps.length === 0
  const shouldBlockUnforceableOutputOutcome =
    !followUpRequired &&
    !followUpHistory &&
    !hasForceableOutputProblem &&
    filteredFollowUps.length === 0
  const hasActiveObservedEvidence = hasActiveObservedEvidenceEntries(labeledMergedObservedEvidence)
  const shouldBlockOutOfPoolHintUnconfirmed =
    weakOutOfPoolHintOnly &&
    !followUpRequired &&
    !hasActiveObservedEvidence
  const broadVisualDifferentialUnresolved =
    !followUpRequired &&
    !Boolean(fastConvergencePlan?.applied) &&
    (
      edemaFlatSpotDifferentialActive ||
      (
        broadVisualDifferentialActive &&
        !hasDirectPositiveProblemAnswer(
          answerEffects,
          normalizeKey(stabilizedOutputRankings?.[0]?.problemKey || '')
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
    : effectiveOutOfPoolOnlyNoMapping && !followUpRequired
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
        outOfPoolObservation: buildOutOfPoolObservationFallback({
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }),
        uncertainLegalityReason: 'out_of_pool_no_mapping'
      }
    : effectiveWeakOutOfPoolHintOnly && !followUpRequired
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
        outOfPoolObservation: buildOutOfPoolObservationFallback({
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
              'out_of_pool_hint_unconfirmed_after_followup'
            ])
          ),
        advice: Array.from(
          new Set([
            ...(Array.isArray(lowConfidence?.advice) ? lowConfidence.advice : []),
              '图片里存在池外可见异常提示，但后续问诊没有形成可确认的正式证据；本次只作为非诊断观察展示，不判断为暂无明显问题，也不输出具体处理方向。'
          ])
        ),
        outOfPoolObservation: buildOutOfPoolObservationFallback({
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'out_of_pool_hint_unconfirmed'
      }
    : yellowingOnlyRuntimeEvidenceAfterFollowUp
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
            '当前只有黄叶事实，追问没有形成新老叶、分布、水分、光照或施肥方面的明确分流证据，不能直接输出缺铁、缺氮、缺水或弱光等具体问题。'
          ])
        ),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'input_unfillable'
      }
    : structuralOnlyRuntimeEvidenceAfterFollowUp
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
            '当前只有孔洞、缺口或网状缺损这类结构事实，追问没有形成虫害活动、病斑脱落或机械旧伤的明确分流证据，不能直接输出具体虫害。'
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
    : shouldBlockUnforceableFollowUpOutcome || shouldBlockUnforceableOutputOutcome
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
            shouldBlockUnforceableFollowUpOutcome
              ? '当前追问没有形成可用证据，建议补充更明确的回答，或补拍关键部位后重新开始诊断。'
              : '当前视觉方向没有形成可安全输出的具体问题证据，不能只凭先验或泛化线索给出具体诊断。'
          ])
        ),
        uncertainLegalityReason:
          lowConfidence?.uncertainLegalityReason || 'input_unfillable'
      }
    : lowConfidence
  const shouldForceRankedOutcomeAfterFollowUp =
    !followUpRequired &&
    followUpHistory &&
    !hasLeafSpotBridgeRoutingGap &&
    !effectiveOutOfPoolOnlyNoMapping &&
    !effectiveWeakOutOfPoolHintOnly &&
    !shouldBlockOutOfPoolHintUnconfirmed &&
    !yellowingOnlyRuntimeEvidenceAfterFollowUp &&
    !structuralOnlyRuntimeEvidenceAfterFollowUp &&
    !broadVisualDifferentialUnresolved &&
    !shouldBlockUnscopedClassOutput &&
    !shouldBlockUnforceableOutputOutcome &&
    hasEligibleOutputProblem &&
    hasForceableOutputProblem
  const decisionCause =
    !followUpRequired &&
    effectiveOutOfPoolOnlyNoMapping
      ? {
          decisionCauseKey: 'out_of_pool_no_mapping',
          decisionCauseCategory: 'visual_scope_gap',
          decisionCauseText: '当前存在诊断范围外的可见异常，但没有已审计 proxy mapping，因此跳过常规诊断并输出保守池外结果。',
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }
      : !followUpRequired &&
    effectiveWeakOutOfPoolHintOnly
      ? {
          decisionCauseKey: 'weak_out_of_pool_proxy_only',
          decisionCauseCategory: 'out_of_pool_visual_hint',
          decisionCauseText: '正式 symptom_candidates 为空，仅存在池外弱提示，不能直接输出具体问题。',
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }
      : !followUpRequired &&
    shouldBlockOutOfPoolHintUnconfirmed
      ? {
          decisionCauseKey: 'out_of_pool_hint_unconfirmed_after_followup',
          decisionCauseCategory: 'out_of_pool_visual_hint',
          decisionCauseText: '图片里存在池外可见异常提示，但后续问诊没有形成可确认的正式证据，因此不能输出非问题结论。',
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }
      : !followUpRequired &&
    !hasActiveObservedEvidence
      ? {
          decisionCauseKey: 'no_observed_symptoms',
          decisionCauseCategory: 'visual_input_gap',
          decisionCauseText: '当前轮次没有形成可用的正式视觉证据。',
          decisionCauseDetails: {
            currentClassKey: mergedSymptomClassRuntime?.currentClassKey || '',
            blockedReason:
              mergedSymptomClassRuntime?.classGateDecision?.blockedReason ||
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
              blockedReason: mergedSymptomClassRuntime?.classGateDecision?.blockedReason || '',
              classScoreKeys: Array.isArray(mergedSymptomClassRuntime?.classScores)
                ? mergedSymptomClassRuntime.classScores.map(item => item?.classKey).filter(Boolean)
                : []
            }
          }
      : !followUpRequired &&
    outputContextProblemGuard.applies &&
    !outputContextProblemGuard.hasRequiredContext &&
    filteredFollowUps.length === 0
      ? {
          decisionCauseKey:
            mergedSymptomClassRuntime?.enabled &&
            mergedSymptomClassRuntime?.classGateDecision?.hasEnabledGroups
              ? 'class_converged_context_guard_blocked'
              : 'context_guard_blocked_without_required_context',
          decisionCauseCategory: 'context_guard_block',
          decisionCauseText: outputContextProblemGuard.advice || '当前候选问题缺少必要上下文，不能安全输出具体 root cause。',
          decisionCauseDetails: {
            problemKey: outputContextProblemGuard.problemKey || '',
            currentClassKey: mergedSymptomClassRuntime?.currentClassKey || '',
            currentGroupKey: mergedSymptomClassRuntime?.currentGroupKey || '',
            hasEnabledGroups: Boolean(mergedSymptomClassRuntime?.classGateDecision?.hasEnabledGroups),
            preferredQuestionKeys: Array.isArray(outputContextProblemGuard.preferredQuestionKeys)
              ? outputContextProblemGuard.preferredQuestionKeys
              : [],
            matchedSymptomKeys: Array.isArray(outputContextProblemGuard.matchedSymptomKeys)
              ? outputContextProblemGuard.matchedSymptomKeys
              : []
          }
        }
      : yellowingOnlyRuntimeEvidenceAfterFollowUp
        ? {
            decisionCauseKey: 'yellowing_differential_unresolved',
            decisionCauseCategory: 'output_guard',
            decisionCauseText: '当前只有黄叶事实，追问没有形成明确分流证据，因此不能安全输出具体缺素/水分/光照问题。',
            decisionCauseDetails: {
              activeRuntimeSymptomKeys: activeRuntimeSymptomKeysForOutput,
              hasEligibleOutputProblem,
              hasForceableOutputProblem
            }
          }
      : structuralOnlyRuntimeEvidenceAfterFollowUp
        ? {
            decisionCauseKey: 'structural_damage_cause_unresolved',
            decisionCauseCategory: 'output_guard',
            decisionCauseText: '当前只有结构损伤事实，追问没有形成明确病因分流证据，因此不能安全输出具体虫害。',
            decisionCauseDetails: {
              activeRuntimeSymptomKeys: activeRuntimeSymptomKeysForOutput,
              topProblemKey: String(stabilizedOutputRankings?.[0]?.problemKey || '').trim(),
              topQuestionEvidence: Number(stabilizedOutputRankings?.[0]?.questionEvidence || 0)
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
              topProblemKey: String(stabilizedOutputRankings?.[0]?.problemKey || '').trim()
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
              topProblemKey: String(stabilizedOutputRankings?.[0]?.problemKey || '').trim(),
              diagnosisDirectionKeys: Array.isArray(diagnosisDirections)
                ? diagnosisDirections.map(item => item?.directionKey).filter(Boolean)
                : [],
              allowedProblemKeys: Array.from(
                collectAllowedProblemKeysFromDiagnosisDirections(diagnosisDirections)
              )
            }
          }
      : shouldBlockUnforceableFollowUpOutcome || shouldBlockUnforceableOutputOutcome
        ? {
            decisionCauseKey: shouldBlockUnforceableFollowUpOutcome
              ? 'no_forceable_output_problem_after_followup'
              : 'no_forceable_output_problem_without_followup',
            decisionCauseCategory: 'output_guard',
            decisionCauseText: shouldBlockUnforceableFollowUpOutcome
              ? '追问结束后仍未形成可安全输出的 root cause 证据。'
              : '当前视觉方向没有形成可安全输出的具体问题证据。',
            decisionCauseDetails: {
              hasEligibleOutputProblem,
              hasForceableOutputProblem
            }
          }
        : null
  const effectiveLowConfidence = shouldForceRankedOutcomeAfterFollowUp
    ? {
        ...governedLowConfidence,
        uncertainLegalityReason: ''
      }
    : governedLowConfidence
  const stopDecision = followUpRequired
    ? null
    : {
        outcomeLocked:
          shouldForceRankedOutcomeAfterFollowUp
            ? 'problematic'
            : effectiveLowConfidence?.uncertainLegalityReason ||
                (outputContextProblemGuard.applies && !outputContextProblemGuard.hasRequiredContext)
              ? 'uncertain'
              : 'problematic',
        stopReason:
          shouldForceRankedOutcomeAfterFollowUp
            ? 'problematic_output_ready'
            : effectiveLowConfidence?.uncertainLegalityReason ||
                (outputContextProblemGuard.applies && !outputContextProblemGuard.hasRequiredContext)
              ? 'uncertain_output_ready'
              : 'problematic_output_ready',
        uncertainLegalityReason:
          shouldForceRankedOutcomeAfterFollowUp
            ? ''
            : effectiveLowConfidence?.uncertainLegalityReason ||
              (outputContextProblemGuard.applies && !outputContextProblemGuard.hasRequiredContext
                ? 'input_unfillable'
                : ''),
        stopReasonDetail: decisionCause?.decisionCauseKey || '',
        decisionCause
      }
  const explanationProblemKeys = !followUpRequired
    ? stabilizedOutputRankings.slice(0, 5).map(item => item.problemKey).filter(Boolean)
    : []
  const explanations = explanationProblemKeys.length
    ? await getExplanationsByProblemKeys(explanationProblemKeys)
    : []

  const stageFinal = followUpRequired ? 'followup' : 'final'

  const publicResponse = formatDiagnosisResponse({
    sessionId,
    round,
    stage: stageFinal,
    observedSymptoms: mergedObservedSymptoms,
    observedEvidenceSet: labeledMergedObservedEvidence,
    derivedEvidenceSet: mergedDerivedEvidenceSet,
    diagnosisDirections,
    rankings: stabilizedOutputRankings,
    followUps: filteredFollowUps,
    problems,
    explanations,
    causality: causalityEdges,
    plantContext,
    plantId: plantContext.userPlantId || plantContext.plantId,
    followUpRequired,
    lowConfidence: effectiveLowConfidence,
    symptomClassRuntime: mergedSymptomClassRuntime,
    highSpecificityFastConvergence: fastConvergencePlan,
    stopDecision,
    preferredRoutePrimaryAction:
      preferredVisualRouteAction === 'retake_first' ? 'retake_first' : ''
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
      reliabilityScore: roundNum(reliabilityScore),
      topScoreGap: roundNum(scoreGap)
    },
    answerEffects,
    followUpStopPolicy,
    plantContext,
    legacyDiagnosis: toLegacyCompatiblePayload(enrichedResponse)
  }
  attachPrivateSymptomClassRuntime(result, mergedSymptomClassRuntime)
  return result
}

module.exports = {
  runDiagnosisRound,
  canOpenNextFollowUpRound,
  shouldUseVisualCandidateSeedQuestion,
  buildSyntheticVisualCandidateQuestion,
  shouldSuppressCrossDirectionVisualCandidate,
  shouldAllowForcedContextProblemFollowUp,
  shouldRestrictToCandidateSeedOnly,
  shouldForceMoldDirectionFirstRoundFollowUp,
  shouldForceVisualCandidateOrthogonalFollowUp,
  _test: {
    buildYellowingGateFollowUps,
    isYellowingEquivalentDimensionAnswered,
    isYellowingFollowUpAllowedByAnsweredBranch,
    collectAnswerLikeRecordsFromFollowUpRows,
    mergeAskedQuestionRows
  }
}
