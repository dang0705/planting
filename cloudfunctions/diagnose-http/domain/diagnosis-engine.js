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
  normalizeQuestionTargetDimension
} = require('../utils/question-target-dimension')
const {
  buildVisualCandidateQuestionGroupKey,
  buildSyntheticVisualCandidateQuestionKey,
  buildObservedProbeQuestionGroupKey,
  buildSyntheticObservedProbeQuestionKey,
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

  const hasScopedSupportRoleRanking = scopedRankings.some(item => {
    const problemKey = normalizeKey(item?.problemKey || '')
    const problemRole = normalizeKey(
      item?.problemRole || problemRoleByKey.get(problemKey) || ''
    )
    return rankingConfig.supportRolesAsTop1.includes(problemRole)
  })

  return hasScopedSupportRoleRanking
    ? scopedRankings
    : (Array.isArray(rankings) ? rankings : [])
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
  const maxFollowUpRounds = Math.max(1, Number(rankingConfig.maxFollowUpRounds || 2))
  const completedFollowUpRounds = Math.max(0, Number(round || 1) - 1)
  return completedFollowUpRounds < maxFollowUpRounds
}

async function buildCandidatePriors(plantContext, observedSymptoms = [], { round = 1, stage = 'preliminary' } = {}) {
  const symptomKeys = Array.from(
    new Set((observedSymptoms || []).map(item => String(item?.symptomKey || '').trim()).filter(Boolean))
  )

  const linkedPriorBundle = await getLinkedCandidatePriors(plantContext)
  const linkedPriors = Array.isArray(linkedPriorBundle?.priors) ? linkedPriorBundle.priors : []
  const shouldUseLegacyFallback = !linkedPriorBundle?.hasAnyLinks
  const plantPriors = shouldUseLegacyFallback
    ? await getCandidateProblemPriors(plantContext)
    : []
  const genusPriors = shouldUseLegacyFallback
    ? await getGenusCandidatePriors(plantContext.genus)
    : []
  const hostPriors = shouldUseLegacyFallback
    ? await getHostCandidatePriors({
        genus: plantContext.genus,
        family: plantContext.family,
        category: plantContext.category
      })
    : []
  const evidenceEdges = symptomKeys.length
    ? await getEvidenceEdges({ symptomKeys })
    : []

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
  const causalityEdges = baseProblemKeys.length ? await getCausalityEdges(baseProblemKeys) : []
  const causalLinkedPriors = Array.from(
    new Set(
      (causalityEdges || [])
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

  return mergeCandidatePriors(merged, causalLinkedPriors)
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
  const aggregatedCandidateMap = new Map(
    (Array.isArray(visualAggregateResult?.aggregated_symptom_candidates)
      ? visualAggregateResult.aggregated_symptom_candidates
      : []
    )
      .map(item => [String(item?.symptom_key || '').trim(), item])
      .filter(([symptomKey]) => Boolean(symptomKey))
  )
  const candidateMap = new Map()

  for (const item of Array.isArray(visualAggregateResult?.admission_records)
    ? visualAggregateResult.admission_records
    : []) {
    if (String(item?.admission_result || '').trim() !== 'candidate_retained') {
      continue
    }

    const symptomKey = String(item?.object_key || item?.candidate?.symptom_key || '').trim()
    if (!symptomKey) continue

    const candidate = item?.candidate || aggregatedCandidateMap.get(symptomKey) || {}
    const symptomMeta = symptomMap.get(symptomKey) || {}
    const nextEntry = {
      symptomKey,
      symptomCn: String(
        candidate?.display_name_cn ||
          symptomMeta?.displayTextCn ||
          symptomMeta?.symptomCn ||
          symptomKey
      ).trim() || symptomKey,
      userObservationTipCn: String(symptomMeta?.userObservationTipCn || '').trim(),
      signalReliability: Number(symptomMeta?.signalReliability || 0),
      locationKey: normalizeKey(symptomMeta?.locationKey || ''),
      patternKey: normalizeKey(symptomMeta?.patternKey || ''),
      distributionKey: normalizeKey(symptomMeta?.distributionKey || ''),
      confidenceBand: normalizeVisualCandidateBand(candidate?.confidence_band, 'medium'),
      strengthLevel: normalizeVisualCandidateStrength(candidate?.strength_level, 'medium'),
      admissionReadiness: normalizeVisualCandidateReadiness(
        candidate?.admission_readiness,
        'cautious'
      ),
      supportCount: Number(candidate?.support_count || 0),
      supportOrgans: Array.isArray(candidate?.support_organs)
        ? candidate.support_organs
        : [],
      supportingRegionNote: normalizeKey(candidate?.supporting_region_note || ''),
      visualStructuralEvidenceStatus: normalizeKey(candidate?.visual_structural_evidence_status || '')
    }
    const current = candidateMap.get(symptomKey)

    if (!current || scoreVisualCandidateSeed(nextEntry) > scoreVisualCandidateSeed(current)) {
      candidateMap.set(symptomKey, nextEntry)
    }
  }

  for (const item of Array.isArray(visualAggregateResult?.out_of_pool_symptom_hints)
    ? visualAggregateResult.out_of_pool_symptom_hints
    : []) {
    const symptomKey = normalizeKey(item?.symptom_key || item?.closest_symptom_key_hint || '')
    if (!symptomKey) continue

    const symptomMeta = symptomMap.get(symptomKey) || {}
    if (!normalizeKey(symptomMeta?.symptomKey || '')) continue

    const hintCount = Math.max(1, Number(item?.support_count || item?.hint_count || 1))
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
      supportOrgans: Array.isArray(item?.support_organs) ? item.support_organs : [],
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
    const symptomKey = normalizeKey(item?.symptom_key || item?.closest_symptom_key_hint || '')
    const evidenceRole = normalizeKey(item?.evidence_role || '')
    const hintScope = normalizeKey(item?.hint_scope || '')
    return !symptomKey && (evidenceRole === 'audit' || hintScope === 'audit_only')
  })
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
    questionText: `图片里疑似出现“${symptomLabel}”，你复看后是否也能确认？`,
    helpText,
    questionGroupKey: buildVisualCandidateQuestionGroupKey(symptomKey),
    questionType: 'single_choice',
    options: [
      { optionKey: 'yes', text: '是，比较确定' },
      { optionKey: 'no', text: '否，基本没有' },
      { optionKey: 'unknown', text: '看不出/不确定' }
    ],
    whyThisQuestion: `这题用于确认候选视觉症状“${symptomLabel}”是否能进入正式诊断。`
  }
}

function buildFollowUpPayload(question = {}) {
  return {
    questionId: toQuestionId(question.questionKey),
    questionKey: question.questionKey,
    selectionSource: question.selectionSource || '',
    targetSymptomKey: question.targetSymptomKey || '',
    questionGroupKey: question.questionGroupKey || '',
    targetDimension: question.targetDimension || '',
    routingScope: question.routingScope || '',
    type: question.questionType || 'single_choice',
    text: question.questionText || '',
    helpText: question.helpText || '',
    options: (Array.isArray(question.options) ? question.options : []).map(option => ({
      optionId: toOptionId(option.optionKey),
      optionKey: option.optionKey,
      text: option.text || ''
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
    questionType: question.questionType || 'single_choice',
    options: ensureUnknownOptionMappingRows(question.questionKey, optionRows).map(item => ({
      optionKey: item.optionKey,
      text: item.optionTextUserCn || item.optionTextCn || item.optionKey
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

        return !(
          targetDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE &&
          (explicitObservedSymptomKeySet.has(targetSymptomKey) ||
            observedSymptomKeys.includes(targetSymptomKey))
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
        Math.min(3, Math.max(1, Number(maxQuestions || 3)) - selectedQuestions.length)
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
    if (!effectiveObservedSymptoms.length) {
      return true
    }

    const symptomKey = String(candidate?.symptomKey || '').trim()
    if (!symptomKey) return false
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
        if (targetSymptomKey && effectiveCandidateSymptomKeys.includes(targetSymptomKey)) {
          symptomsWithUsableStaticQuestion.add(targetSymptomKey)
        }
        if (isDedicatedVisualCandidateConfirmQuestion(item)) {
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
        isDedicatedVisualCandidateConfirmQuestion(item)
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

    const syntheticCandidateQuestion = buildSyntheticVisualCandidateQuestion(candidate)
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
  const isOutOfPoolNoMapping = normalizedUncertainLegalityReason === 'out_of_pool_no_mapping'
  const outOfPoolSummary = '图片中存在当前自动诊断范围外的可见异常。系统无法把它稳定归入现有诊断路径，因此本次不继续常规诊断，也不判断为“暂无明显问题”。由于该异常尚未纳入当前诊断池，系统暂不能给出针对性的处理建议；建议先保持观察，避免仅凭本次结果进行大幅养护调整。'
  const summary = isOutOfPoolNoMapping
    ? outOfPoolSummary
    : advice[0] || '当前证据不足，暂不能安全判断。'
  const normalizedConfidenceReasons = Array.from(
    new Set(
      [
        ...(Array.isArray(confidenceReasons) ? confidenceReasons : []),
        String(sourceReason || '').trim()
      ].filter(Boolean)
    )
  )
  const normalizedDecisionCause = normalizeDecisionCause(decisionCause)
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
  const explanation = isOutOfPoolNoMapping
    ? {
        whyItHappens: '当前图片中有可见异常，但该异常超出当前自动诊断支持的症状范围，且没有已审计映射可以接入现有诊断路径。',
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
      displayName: isOutOfPoolNoMapping ? '发现诊断范围外的可见异常' : '暂不能稳定判断',
      summary,
      severity: 'low',
      urgency: isOutOfPoolNoMapping ? 'low' : 'medium'
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
  const answerOptionMappingsFromStore = questionKeys.length
    ? await getQuestionOptionMappings(questionKeys)
    : []
  const answerOptionMappings = [
    ...answerOptionMappingsFromStore,
    ...buildSyntheticFollowUpOptionMappings(questionKeys)
  ]
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
  const fullSymptomDictionary = await getSymptomDictionary()
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
  const diagnosisDirectionsForResolution = buildDiagnosisDirections({
    observedEvidenceSet: labeledObservedEvidenceForResolution,
    derivedEvidenceSet: derivedEvidenceForResolution,
    visualCandidateSymptoms: collectVisualCandidateSymptoms(
      visualAggregateResult,
      fullSymptomDictionary
    ),
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
  const askedQuestionRows = askedQuestionKeys.length
    ? await getQuestionsByKeys(askedQuestionKeys)
    : []
  const outOfPoolOnlyNoMapping = isOutOfPoolOnlyNoMappingVisualAggregate(visualAggregateResult)
  const visualCandidateFollowUps =
    Number(round || 1) <= 1 &&
    stage === 'preliminary' &&
    observedSymptomsForResolution.length === 0 &&
    preferredVisualRouteAction !== 'retake_first'
      ? await buildVisualCandidateSeedFollowUps({
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
  const nonProblematicRule = resolveNonProblematicRule({
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

  const symptomRows = symptomKeys.length
    ? await getSymptomsByKeys(symptomKeys)
    : await getSymptomDictionary()
  const evidenceEdges = symptomKeys.length
    ? await getEvidenceEdges({ symptomKeys, problemKeys: candidateProblemKeys })
    : []
  const problems = await getProblemsByKeys(candidateProblemKeys)

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
    optionMappings: answerOptionMappings,
    candidateProblemKeys,
    symptomDictionary: symptomRows,
    evidenceEdges
  })

  const fallbackGenusMap = await getGenusCompatibilityMap(
    plantContext.genus,
    candidateProblemKeys
  )
  const fallbackHostMap = await getHostCompatibilityMap(
    {
      genus: plantContext.genus,
      family: plantContext.family,
      category: plantContext.category
    },
    candidateProblemKeys
  )

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
    ? await getCausalityEdges(rankings.slice(0, 3).map(item => item.problemKey))
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
    blockedQuestionTargetSymptomKeys,
    activeObservedSymptomKeys: Array.from(activeObservedSymptomKeys)
  })

  const hasEligibleTop1 = hasOutputEligibleProblemRanking(
    rankings,
    labeledObservedEvidenceForResolution,
    problemRoleByKey,
    {
      symptomClassRuntime
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
  const diagnosisDirections = buildDiagnosisDirections({
    observedEvidenceSet: labeledMergedObservedEvidence,
    derivedEvidenceSet: mergedDerivedEvidenceSet,
    visualCandidateSymptoms: collectVisualCandidateSymptoms(
      visualAggregateResult,
      fullSymptomDictionary
    ),
    routeHints: visualRouteContext.routeHints,
    round
  })
  const contextProblemGuard = evaluateContextRequiredProblemGuard({
    rankings,
    observedEvidenceSet: labeledMergedObservedEvidence
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
    weakOutOfPoolHintOnly &&
    !outOfPoolOnlyNoMapping &&
    canAskAnotherFollowUpRound &&
    !followUpHistory
  const shouldAskFollowUp =
    (
      shouldAskFollowUpByRanking ||
      shouldForceContextFollowUp ||
      shouldForceMoldDirectionFollowUp ||
      shouldForceVisualCandidateFollowUp ||
      shouldForceWeakOutOfPoolHintFollowUp
    ) &&
    !Boolean(fastConvergencePlan?.shouldBypassFollowUp)
  const forcedContextFollowUps =
    shouldAskFollowUp && shouldForceContextFollowUp
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
  const remainingGeneralQuestionBudget = Math.max(
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
  for (const item of [...forcedContextFollowUps, ...genericFollowUps]) {
    const questionKey = String(item?.questionKey || '').trim()
    if (!questionKey || seenFollowUpQuestionKeys.has(questionKey)) continue
    seenFollowUpQuestionKeys.add(questionKey)
    followUps.push(item)
  }
  const filteredFollowUps = filterFinalVisualPresenceFollowUps(followUps, {
    askedQuestions: askedQuestionRows,
    observedEvidenceSet: labeledMergedObservedEvidence,
    symptomDictionary: symptomRows
  })
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
    shouldForceWeakOutOfPoolHintFollowUp,
    weakOutOfPoolHintOnly,
    outOfPoolOnlyNoMapping,
    hasAvailableFollowUpQuestions,
    effectiveShouldAskFollowUp,
    exhaustedFollowUpQuestionPool,
    contextProblemGuard,
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
          symptomClassRuntime: mergedSymptomClassRuntime
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
    observedEvidenceSet: labeledMergedObservedEvidence
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
      symptomClassRuntime: mergedSymptomClassRuntime
    }
  )
  const hasForceableOutputProblem = hasForceableOutputProblemRanking(
    stabilizedOutputRankings,
    labeledMergedObservedEvidence,
    problemRoleByKey,
    {
      symptomClassRuntime: mergedSymptomClassRuntime
    }
  )
  const hasLeafSpotBridgeRoutingGap =
    !followUpRequired &&
    String(mergedSymptomClassRuntime?.classGateDecision?.blockedReason || '').trim() === 'class_group_pool_empty' &&
    Array.isArray(mergedSymptomClassRuntime?.classScores) &&
    mergedSymptomClassRuntime.classScores.some(
      item => String(item?.classKey || '').trim() === 'leaf_spot_complex_mode'
    )
  const hasAnyRankedOutputProblem = Array.isArray(stabilizedOutputRankings)
    && stabilizedOutputRankings.some(item => String(item?.problemKey || '').trim())
  const shouldBlockUnforceableFollowUpOutcome =
    !followUpRequired &&
    followUpHistory &&
    !hasForceableOutputProblem &&
    filteredFollowUps.length === 0
  const hasActiveObservedEvidence = hasActiveObservedEvidenceEntries(labeledMergedObservedEvidence)
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
    : outOfPoolOnlyNoMapping && !followUpRequired
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
          uncertainLegalityReason: 'out_of_pool_no_mapping'
        }
    : weakOutOfPoolHintOnly && !followUpRequired
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
              '正式视觉候选为空，仅有池外弱提示；不能直接闭合到具体问题，请先追问、补图或进入池外候选审核。'
            ])
          ),
          uncertainLegalityReason:
            lowConfidence?.uncertainLegalityReason || 'out_of_pool_review_required'
        }
    : shouldBlockUnforceableFollowUpOutcome
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
            '当前追问没有形成可用证据，建议补充更明确的回答，或补拍关键部位后重新开始诊断。'
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
    !outOfPoolOnlyNoMapping &&
    !weakOutOfPoolHintOnly &&
    (
      (hasEligibleOutputProblem && hasForceableOutputProblem) ||
      (
        !hasForceableOutputProblem &&
        hasAnyRankedOutputProblem
      )
    )
  const decisionCause =
    !followUpRequired &&
    outOfPoolOnlyNoMapping
      ? {
          decisionCauseKey: 'out_of_pool_no_mapping',
          decisionCauseCategory: 'visual_scope_gap',
          decisionCauseText: '当前存在诊断范围外的可见异常，但没有已审计 proxy mapping，因此跳过常规诊断并输出保守池外结果。',
          decisionCauseDetails: buildWeakOutOfPoolHintOnlyDecisionDetails(visualAggregateResult)
        }
      : !followUpRequired &&
    weakOutOfPoolHintOnly
      ? {
          decisionCauseKey: 'weak_out_of_pool_proxy_only',
          decisionCauseCategory: 'out_of_pool_visual_hint',
          decisionCauseText: '正式 symptom_candidates 为空，仅存在池外弱提示，不能直接输出具体问题。',
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
      : shouldBlockUnforceableFollowUpOutcome
        ? {
            decisionCauseKey: 'no_forceable_output_problem_after_followup',
            decisionCauseCategory: 'output_guard',
            decisionCauseText: '追问结束后仍未形成可安全输出的 root cause 证据。',
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
  const explanations = await getExplanationsByProblemKeys(
    stabilizedOutputRankings.slice(0, 5).map(item => item.problemKey)
  )

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
  shouldForceVisualCandidateOrthogonalFollowUp
}
