'use strict'

const classSwitchRules = require('../constants/class-switch-rules')
const {
  getSymptomClassMappingsBySymptomKeys,
  getSymptomClassesByKeys
} = require('../repositories/symptom-class-repository')
const {
  getClassQuestionGroupStrategies
} = require('../repositories/class-question-group-repository')
const {
  normalizeText,
  clamp01,
  roundNum,
  dedupeStrings,
  normalizeClassGateMode,
  normalizeClassGateSourceMode,
  isHardGateMode,
  isHardGateCandidate,
  parseUnknownSwitchPolicy,
  shouldBlockGroupByUnknownPolicy,
  getUnknownPolicyPriorityPenalty,
  normalizeObservedSymptoms,
  isRuntimeEligibleClassMode,
  buildGroupSortScore
} = require('./symptom-classifier-utils')

const LEAF_SPOT_BRIDGE_CLASS_KEY = 'leaf_spot_complex_mode'
const FUNGAL_LEAF_SPOT_CLASS_KEY = 'fungal_leaf_spot_mode'
const BACTERIAL_LEAF_SPOT_CLASS_KEY = 'bacterial_leaf_spot_mode'

const FUNGAL_LEAF_SPOT_BRIDGE_SYMPTOM_KEYS = new Set([
  'brown_spots_halo',
  'black_spots_spreading',
  'irregular_blotches',
  'concentric_ring_spots'
])

const BACTERIAL_LEAF_SPOT_BRIDGE_SYMPTOM_KEYS = new Set([
  'angular_spots',
  'water_soaked_spots',
  'leaf_margin_necrosis'
])

function buildObservedSymptomKeySet(observedSymptoms = []) {
  return new Set(
    normalizeObservedSymptoms(observedSymptoms)
      .map(item => item.symptomKey)
      .filter(Boolean)
  )
}

function expandBridgeCandidateClassKeys(candidateClassKeys = [], observedSymptomKeySet = new Set()) {
  const normalizedCandidateClassKeys = dedupeStrings(candidateClassKeys)
  if (!normalizedCandidateClassKeys.includes(LEAF_SPOT_BRIDGE_CLASS_KEY)) {
    return normalizedCandidateClassKeys
  }

  let fungalSignalCount = 0
  let bacterialSignalCount = 0
  for (const symptomKey of observedSymptomKeySet) {
    if (FUNGAL_LEAF_SPOT_BRIDGE_SYMPTOM_KEYS.has(symptomKey)) {fungalSignalCount += 1}
    if (BACTERIAL_LEAF_SPOT_BRIDGE_SYMPTOM_KEYS.has(symptomKey)) {bacterialSignalCount += 1}
  }

  const expandedClassKeys = [...normalizedCandidateClassKeys]
  if (bacterialSignalCount > fungalSignalCount && bacterialSignalCount > 0) {
    expandedClassKeys.push(BACTERIAL_LEAF_SPOT_CLASS_KEY, FUNGAL_LEAF_SPOT_CLASS_KEY)
  } else {
    expandedClassKeys.push(FUNGAL_LEAF_SPOT_CLASS_KEY)
    if (bacterialSignalCount > 0) {
      expandedClassKeys.push(BACTERIAL_LEAF_SPOT_CLASS_KEY)
    }
  }

  return dedupeStrings(expandedClassKeys)
}

function collectBridgeSeedClassKeys(classScores = []) {
  return dedupeStrings(
    (Array.isArray(classScores) ? classScores : [])
      .filter(item => {
        const classKey = normalizeText(item?.classKey)
        if (classKey !== LEAF_SPOT_BRIDGE_CLASS_KEY) {return false}
        return (
          Array.isArray(item?.matchedSymptomKeys) && item.matchedSymptomKeys.length > 0
        ) || (
          Array.isArray(item?.supportingMappings) && item.supportingMappings.length > 0
        )
      })
      .map(item => item.classKey)
  )
}

function isGroupAvailable(group = {}) {
  return group && !group._isBlockedByAnswered && !group._isBlockedByUnknown
}

function isClassSwitchAllowed(fromClassKey = '', classStrategyMap = new Map()) {
  const normalizedClassKey = normalizeText(fromClassKey)
  if (!normalizedClassKey) {return true}
  const list = classStrategyMap.get(normalizedClassKey) || []
  if (!list.length) {return true}
  return list.some(item => Boolean(item?.classSwitchAllowed))
}

function buildClassGateDecision({
  primaryClass = null,
  round = 1,
  selectedClassKey = '',
  sourceGateMode = 'soft',
  hardGateTriggered = false,
  blockedByUnknownGate = false,
  hasEnabledGroups = false,
  classSwitchBlocked = false,
  unknownCountByGroup = {}
}) {
  const selectedClass = primaryClass || {}
  const effectiveGateMode = normalizeClassGateMode(selectedClass.runtimeGateRule || classSwitchRules.classGateTypes.soft)
  return {
    enabled: Boolean(selectedClass?.classKey || hasEnabledGroups),
    gateMode: hardGateTriggered
      ? classSwitchRules.classGateTypes.hard
      : effectiveGateMode,
    sourceMode: normalizeClassGateSourceMode(sourceGateMode),
    primaryClassKey: normalizeText(selectedClass.classKey || ''),
    primaryClassRuntimeScore: Number(selectedClass.runtimeScore || 0),
    unknownLockCount: Object.keys(unknownCountByGroup || {}).length,
    currentClassKey: normalizeText(selectedClassKey || ''),
    hasEnabledGroups: Boolean(hasEnabledGroups),
    isHardBlocked: Boolean(hardGateTriggered && classSwitchBlocked),
    classSwitchBlocked: Boolean(classSwitchBlocked),
    blockedReason: hardGateTriggered && classSwitchBlocked
      ? 'hard_gate_class_switch_forbidden'
      : hasEnabledGroups
          ? ''
          : blockedByUnknownGate
            ? 'class_group_blocked_by_unknown_limit'
            : 'class_group_pool_empty',
    reviewedAtRound: Number(round || 1)
  }
}

function buildEmptyRuntime(previousState = {}, round = 1, reason = 'no_class_runtime_candidates') {
  const normalizedReason = normalizeText(reason, 'no_class_runtime_candidates')
  return {
    enabled: false,
    primaryClass: null,
    secondaryClasses: [],
    classScores: [],
    currentClassKey: normalizeText(previousState?.currentClassKey),
    currentGroupKey: normalizeText(previousState?.currentGroupKey),
    unknownCountInGroup: 0,
    classSwitchHistory: Array.isArray(previousState?.classSwitchHistory)
      ? previousState.classSwitchHistory
      : [],
    questionGroupPool: [],
    classGateDecision: {
      enabled: false,
      gateMode: classSwitchRules.classGateTypes.disabled,
      sourceMode: classSwitchRules.classGateTypes.disabled,
      primaryClassKey: '',
      primaryClassRuntimeScore: 0,
      unknownLockCount: Number(
        (previousState?.unknownCountByGroup && Object.keys(previousState.unknownCountByGroup).length) || 0
      ),
      currentClassKey: normalizeText(previousState?.currentClassKey),
      hasEnabledGroups: false,
      isHardBlocked: false,
      classSwitchBlocked: false,
      blockedReason: normalizedReason,
      reviewedAtRound: Number(round || 1)
    }
  }
}

async function resolveSymptomClassRuntime({
  observedSymptoms = [],
  round = 1,
  answeredQuestionGroupKeys = [],
  unknownCountByGroup = {},
  previousState = null
} = {}) {
  const normalizedObservedSymptoms = normalizeObservedSymptoms(observedSymptoms)
  if (!normalizedObservedSymptoms.length) {
    return buildEmptyRuntime(previousState, round, 'no_observed_symptoms')
  }

  const symptomKeys = normalizedObservedSymptoms.map(item => item.symptomKey)
  const mappings = await getSymptomClassMappingsBySymptomKeys(symptomKeys)
  if (!mappings.length) {
    return buildEmptyRuntime(previousState, round, 'no_symptom_class_mapping')
  }

  const classKeys = dedupeStrings(mappings.map(item => item.classKey))
  const classes = await getSymptomClassesByKeys(classKeys)
  if (!classes.length) {
    return buildEmptyRuntime(previousState, round, 'no_class_runtime_candidates')
  }

  const classMap = new Map(classes.map(item => [item.classKey, item]))
  const observedSymptomMap = new Map(normalizedObservedSymptoms.map(item => [item.symptomKey, item]))
  const scoresByClassKey = new Map()

  for (const mapping of mappings) {
    const symptom = observedSymptomMap.get(mapping.symptomKey)
    const classMeta = classMap.get(mapping.classKey)
    if (!symptom || !classMeta) {continue}

    const confidenceScore = clamp01(symptom.confidence)
    const reliabilityScore = clamp01(symptom.signalReliability || 1)
    const mappingStrength = clamp01(mapping.mappingStrength || 0)
    const partialWeight = clamp01(mapping.partialWeightFactorV1 || 1)
    const weightedBase = confidenceScore * reliabilityScore * mappingStrength * partialWeight
    const visualScore = mapping.visualScoringEffectiveV1 ? weightedBase : 0
    const questionActivationScore = mapping.effectiveQuestionActivationV1
      ? Math.max(weightedBase, confidenceScore * mappingStrength * partialWeight * 0.85)
      : 0
    const primaryLockScore =
      mapping.primaryClassLockAllowedV1 && mapping.visualScoringEffectiveV1
        ? weightedBase
        : 0

    const existing = scoresByClassKey.get(mapping.classKey) || {
      classKey: mapping.classKey,
      classNameCn: classMeta.classNameCn || mapping.classNameCn || mapping.classKey,
      followupModeV1: classMeta.followupModeV1 || mapping.followupModeV1 || 'disabled',
      runtimeGateRule: classMeta.runtimeGateRule || 'soft',
      dataStatus: classMeta.dataStatus || mapping.dataStatus || 'unknown',
      visualScore: 0,
      questionActivationScore: 0,
      primaryLockScore: 0,
      matchedSymptomKeys: [],
      supportingMappings: []
    }

    existing.visualScore += visualScore
    existing.questionActivationScore += questionActivationScore
    existing.primaryLockScore = Math.max(existing.primaryLockScore, primaryLockScore)
    existing.matchedSymptomKeys.push(mapping.symptomKey)
    existing.supportingMappings.push({
      symptomKey: mapping.symptomKey,
      symptomCn: mapping.symptomCn || symptom.symptomCn || mapping.symptomKey,
      mappingType: mapping.mappingType,
      weightedBase: roundNum(weightedBase),
      visualScore: roundNum(visualScore),
      questionActivationScore: roundNum(questionActivationScore),
      primaryLockScore: roundNum(primaryLockScore),
      primaryClassLockAllowedV1: Boolean(mapping.primaryClassLockAllowedV1)
    })
    scoresByClassKey.set(mapping.classKey, existing)
  }

  const classScores = Array.from(scoresByClassKey.values())
    .map(item => {
      const visualScore = roundNum(item.visualScore)
      const questionActivationScore = roundNum(item.questionActivationScore)
      const runtimeScore = roundNum(Math.max(visualScore, questionActivationScore))
      return {
        classKey: item.classKey,
        classNameCn: item.classNameCn,
        followupModeV1: item.followupModeV1,
        runtimeGateRule: item.runtimeGateRule,
        visualScore,
        questionActivationScore,
        primaryLockScore: roundNum(item.primaryLockScore),
        runtimeScore,
        matchedSymptomKeys: dedupeStrings(item.matchedSymptomKeys),
        supportingMappings: item.supportingMappings
      }
    })
    .sort((left, right) => {
      if (right.runtimeScore !== left.runtimeScore) {
        return right.runtimeScore - left.runtimeScore
      }
      return right.primaryLockScore - left.primaryLockScore
    })

  const runtimeEligibleClasses = classScores.filter(
    item =>
      isRuntimeEligibleClassMode(item.followupModeV1, round) &&
      item.runtimeScore >= classSwitchRules.secondaryClassScoreFloor
  )

  const activeClassCandidates = runtimeEligibleClasses.filter(
    item =>
      item.followupModeV1 === 'full' &&
      item.runtimeScore >= classSwitchRules.activeClassScoreFloor
  )

  const primaryClass =
    activeClassCandidates.find(item => item.primaryLockScore > 0) ||
    activeClassCandidates[0] ||
    null

  const secondaryClasses = runtimeEligibleClasses
    .filter(item => item.classKey !== primaryClass?.classKey)
    .slice(0, classSwitchRules.maxSecondaryClasses)

  const classScoreByKey = new Map(classScores.map(item => [item.classKey, item]))
  const primaryClassMode = normalizeClassGateMode(primaryClass?.runtimeGateRule || '')
  const sourcePrimaryClassMode = normalizeClassGateSourceMode(primaryClass?.runtimeGateRule || '')
  const hardGateByMode = isHardGateMode(primaryClassMode) || isHardGateCandidate(sourcePrimaryClassMode)
  const hardGateTriggered =
    hardGateByMode && Number(primaryClass?.runtimeScore || 0) >= classSwitchRules.hardGateActivationScoreFloor
  const previousCurrentClassKey = normalizeText(previousState?.currentClassKey)
  const previousClassScore = Number(classScoreByKey.get(previousCurrentClassKey)?.runtimeScore || 0)
  const stickyPreviousClass = previousCurrentClassKey &&
    previousClassScore >= classSwitchRules.hardGateStickyPreviousFloor
      ? previousCurrentClassKey
      : ''

  const bridgeSeedClassKeys = collectBridgeSeedClassKeys(classScores)
  const candidateClassKeys = expandBridgeCandidateClassKeys(
    hardGateTriggered
      ? dedupeStrings([
        primaryClass?.classKey,
        stickyPreviousClass,
        ...bridgeSeedClassKeys
      ])
      : dedupeStrings([
        primaryClass?.classKey,
        ...(secondaryClasses || []).map(item => item.classKey),
        previousCurrentClassKey,
        ...bridgeSeedClassKeys
      ]),
    buildObservedSymptomKeySet(normalizedObservedSymptoms)
  )

  const rawGroupStrategies = candidateClassKeys.length
    ? await getClassQuestionGroupStrategies(candidateClassKeys)
    : []

  const answeredGroupKeySet = new Set(dedupeStrings(answeredQuestionGroupKeys))

  const eligibleGroupsByClass = new Map()
  for (const strategy of rawGroupStrategies) {
    if (!classSwitchRules.runtimeFollowupModes.includes(strategy.followupModeV1)) {continue}
    if (!strategy.classLevelAllowsRuntimeV1) {continue}
    if (!strategy.effectiveRuntimeV1) {continue}

    const unknownPolicy = parseUnknownSwitchPolicy(strategy.unknownSwitchPolicy)
    const unknownCount = Number(
      (unknownCountByGroup && unknownCountByGroup[strategy.groupKey]) || 0
    )
    const list = eligibleGroupsByClass.get(strategy.classKey) || []
    const unknownPenalty = getUnknownPolicyPriorityPenalty(unknownPolicy, unknownCount)
    list.push({
      ...strategy,
      _unknownPolicyMode: unknownPolicy.mode,
      _unknownPolicyThreshold: unknownPolicy.threshold,
      _unknownCount: unknownCount,
      _unknownPenalty: unknownPenalty,
      _effectiveSortScore: buildGroupSortScore(strategy) - unknownPenalty,
      _isBlockedByUnknown: shouldBlockGroupByUnknownPolicy(unknownPolicy, unknownCount),
      _isBlockedByAnswered: answeredGroupKeySet.has(strategy.groupKey)
    })
    eligibleGroupsByClass.set(strategy.classKey, list)
  }

  for (const list of eligibleGroupsByClass.values()) {
    list.sort((left, right) => {
      if (Number(right._effectiveSortScore || 0) !== Number(left._effectiveSortScore || 0)) {
        return Number(right._effectiveSortScore || 0) - Number(left._effectiveSortScore || 0)
      }
      return buildGroupSortScore(right) - buildGroupSortScore(left)
    })
  }

  function hasAvailableGroups(classKey = '') {
    const list = eligibleGroupsByClass.get(classKey) || []
    return list.some(item => isGroupAvailable(item))
  }

  const classSwitchAllowed = isClassSwitchAllowed(
    previousCurrentClassKey,
    eligibleGroupsByClass
  )
  const classSwitchBlocked = !classSwitchAllowed &&
    previousCurrentClassKey &&
    previousCurrentClassKey !== primaryClass?.classKey

  const hasAnyRuntimeCandidate = candidateClassKeys.length > 0 && classScoreByKey.size > 0
  const blockedByUnknownGroupKeySet = new Set(
    Array.from(eligibleGroupsByClass.values())
      .flat()
      .filter(item => item._isBlockedByUnknown)
      .map(item => normalizeText(item.groupKey))
      .filter(Boolean)
  )
  const blockedByUnknownGate = blockedByUnknownGroupKeySet.size > 0

  let currentClassKey = ''
  if (previousCurrentClassKey && candidateClassKeys.includes(previousCurrentClassKey) && hasAvailableGroups(previousCurrentClassKey)) {
    currentClassKey = previousCurrentClassKey
  } else if (primaryClass?.classKey && hasAvailableGroups(primaryClass.classKey)) {
    currentClassKey = primaryClass.classKey
  } else {
    currentClassKey =
      candidateClassKeys.find(classKey => hasAvailableGroups(classKey)) ||
      normalizeText(primaryClass?.classKey)
  }

  const currentGroups = eligibleGroupsByClass.get(currentClassKey) || []
  const previousCurrentGroupKey = normalizeText(previousState?.currentGroupKey)
  let currentGroupKey = ''
  if (
    previousCurrentGroupKey &&
    currentGroups.some(item => item.groupKey === previousCurrentGroupKey) &&
    !answeredGroupKeySet.has(previousCurrentGroupKey) &&
    !currentGroups.find(item => item.groupKey === previousCurrentGroupKey)?._isBlockedByUnknown
  ) {
    currentGroupKey = previousCurrentGroupKey
  } else {
    currentGroupKey =
      currentGroups.find(
        item =>
          !answeredGroupKeySet.has(item.groupKey) &&
          !item._isBlockedByUnknown
      )?.groupKey || ''
  }

  const filteredQuestionGroupPool = currentGroups.filter(
    item =>
      !answeredGroupKeySet.has(item.groupKey) &&
      !item._isBlockedByUnknown
  )

  const hasEnabledGroups = filteredQuestionGroupPool.length > 0

  const previousClassSwitchHistory = Array.isArray(previousState?.classSwitchHistory)
    ? previousState.classSwitchHistory
    : []
  const nextClassSwitchHistory =
    previousCurrentClassKey &&
    currentClassKey &&
    previousCurrentClassKey !== currentClassKey
      ? [
          ...previousClassSwitchHistory,
          {
            fromClassKey: previousCurrentClassKey,
            toClassKey: currentClassKey,
            roundIndex: Number(round || 1),
            reason: 'current_class_exhausted_or_reselected'
          }
        ]
      : previousClassSwitchHistory

  const classGateDecision = buildClassGateDecision({
    primaryClass,
    round,
    selectedClassKey: currentClassKey || primaryClass?.classKey || '',
    sourceGateMode: sourcePrimaryClassMode,
    hardGateTriggered,
    blockedByUnknownGate,
    hasEnabledGroups,
    classSwitchBlocked,
    unknownCountByGroup
  })
  if (classSwitchBlocked) {
    classGateDecision.disabledGroupKeys = Array.from(blockedByUnknownGroupKeySet)
  }

  return {
    enabled: Boolean(
      hasEnabledGroups || hasAnyRuntimeCandidate
    ),
    primaryClass,
    secondaryClasses,
    classScores,
    currentClassKey,
    currentGroupKey,
    unknownCountInGroup: Number(
      (currentGroupKey && unknownCountByGroup && unknownCountByGroup[currentGroupKey]) || 0
    ),
    classSwitchHistory: nextClassSwitchHistory,
    questionGroupPool: filteredQuestionGroupPool,
    classGateDecision
  }
}

module.exports = {
  resolveSymptomClassRuntime
}
