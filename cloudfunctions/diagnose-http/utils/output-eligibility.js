'use strict'

const { routeSelection: outputEligibilityConfig } = require('../constants/scoring')
const {
  evaluateContextRequiredProblemGuard,
  getContextRequiredProblemGuard: _getContextRequiredProblemGuard
} = require('./context-required-problem-guard')

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

const ROOT_ROT_RUNTIME_CLASS_KEY = 'root_rot_wet_wilt_mode'
const YELLOWING_RUNTIME_CLASS_KEY = 'yellowing_mode'
const FUNGAL_LEAF_SPOT_RUNTIME_CLASS_KEY = 'fungal_leaf_spot_mode'
const BACTERIAL_LEAF_SPOT_RUNTIME_CLASS_KEY = 'bacterial_leaf_spot_mode'

const ROOT_ZONE_STRONG_SYMPTOM_KEYS = new Set([
  'bad_root_smell',
  'roots_black',
  'roots_mushy',
  'wilting_wet_soil',
  'blackened_stem_base'
])

const ROOT_ZONE_PROBLEM_KEYS = new Set([
  'root_rot',
  'crown_rot',
  'soft_rot',
  'root_stress',
  'overwatering'
])

const NUTRIENT_PROBLEM_KEYS = new Set([
  'iron_deficiency',
  'nitrogen_deficiency',
  'nutrient_deficiency',
  'chlorosis'
])

const NUTRIENT_SUBTYPE_PROBLEM_KEYS = new Set([
  'iron_deficiency',
  'nitrogen_deficiency',
  'chlorosis'
])

const GENERIC_NUTRIENT_BACKGROUND_SYMPTOM_KEYS = new Set([
  'fertilization_gap'
])

const WEAK_YELLOWING_NUTRIENT_SYMPTOM_KEYS = new Set([
  'yellow_new_leaves',
  'yellow_lower_leaves',
  'uniform_yellowing'
])

const NUTRIENT_SUBTYPE_SPECIFIC_SYMPTOMS = {
  iron_deficiency: ['interveinal_chlorosis', 'fertilization_gap'],
  chlorosis: ['interveinal_chlorosis', 'fertilization_gap'],
  nitrogen_deficiency: ['fertilization_gap'],
  nutrient_deficiency: [
    'interveinal_chlorosis',
    'fertilization_gap'
  ]
}

const PROBLEM_PRIORITY_BIASES_BY_CLASS = {
  [ROOT_ROT_RUNTIME_CLASS_KEY]: {
    root_rot: 0.95,
    crown_rot: 0.72,
    soft_rot: 0.68,
    root_stress: 0.56,
    overwatering: 0.44,
    iron_deficiency: -0.42,
    nitrogen_deficiency: -0.42,
    nutrient_deficiency: -0.34,
    chlorosis: -0.26
  },
  [YELLOWING_RUNTIME_CLASS_KEY]: {
    chlorosis: 0.22,
    iron_deficiency: 0.18,
    nitrogen_deficiency: 0.1,
    nutrient_deficiency: 0.08,
    root_stress: 0.06,
    overwatering: 0.04,
    underwatering: 0.04
  },
  [FUNGAL_LEAF_SPOT_RUNTIME_CLASS_KEY]: {
    fungal_leaf_spot: 0.64,
    bacterial_leaf_spot: 0.12
  },
  [BACTERIAL_LEAF_SPOT_RUNTIME_CLASS_KEY]: {
    bacterial_leaf_spot: 0.7,
    fungal_leaf_spot: 0.14
  }
}

const PROBLEM_PRIORITY_BIASES_BY_GROUP = {
  iron_group: {
    iron_deficiency: 0.42,
    chlorosis: 0.26,
    nutrient_deficiency: 0.12,
    nitrogen_deficiency: -0.22
  },
  nitrogen_group: {
    nitrogen_deficiency: 0.4,
    nutrient_deficiency: 0.16,
    chlorosis: 0.1,
    iron_deficiency: -0.2
  },
  yellowing_watering_background_group: {
    overwatering: 0.24,
    underwatering: 0.24,
    root_stress: 0.18,
    iron_deficiency: -0.12,
    nitrogen_deficiency: -0.12
  },
  yellowing_light_background_group: {
    low_light: 0.26,
    sunburn: 0.24,
    iron_deficiency: -0.08,
    nitrogen_deficiency: -0.08
  },
  fungal_spot_group: {
    fungal_leaf_spot: 0.36,
    bacterial_leaf_spot: 0.08
  },
  bacterial_spot_group: {
    bacterial_leaf_spot: 0.38,
    fungal_leaf_spot: 0.08
  },
  root_rot_group: {
    root_rot: 0.38,
    root_stress: 0.12
  },
  blackened_stem_base_confirm_group: {
    crown_rot: 0.32,
    soft_rot: 0.28,
    root_rot: 0.2
  }
}

function resolveCandidateOutcomeRole(candidateOutcome = {}, problemRoleByKey = new Map()) {
  return normalizeText(
    candidateOutcome?.problemRole ||
      problemRoleByKey.get(String(candidateOutcome?.problemKey || '').trim()) ||
      '',
    ''
  )
}

function collectActiveObservedSymptomKeys(observedEvidenceSet = []) {
  return new Set(
    (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
      .filter(
        item =>
          normalizeText(item?.currentStatus || item?.current_status || 'active', 'active') === 'active'
      )
      .map(item => normalizeText(item?.symptomKey || item?.symptom_key || '', ''))
      .filter(Boolean)
  )
}

function hasAnyObservedSymptom(activeObservedSymptomKeys = new Set(), symptomKeys = []) {
  return (Array.isArray(symptomKeys) ? symptomKeys : []).some(symptomKey =>
    activeObservedSymptomKeys.has(normalizeText(symptomKey))
  )
}

function hasIndependentNutrientEvidence(problemKey = '', activeObservedSymptomKeys = new Set()) {
  const normalizedProblemKey = normalizeText(problemKey)
  if (!normalizedProblemKey || !NUTRIENT_PROBLEM_KEYS.has(normalizedProblemKey)) {
    return false
  }

  const subtypeSpecificSymptomKeys = Array.isArray(NUTRIENT_SUBTYPE_SPECIFIC_SYMPTOMS[normalizedProblemKey])
    ? NUTRIENT_SUBTYPE_SPECIFIC_SYMPTOMS[normalizedProblemKey]
    : []
  const hasSubtypeSpecificEvidence = hasAnyObservedSymptom(
    activeObservedSymptomKeys,
    subtypeSpecificSymptomKeys.filter(
      symptomKey => !WEAK_YELLOWING_NUTRIENT_SYMPTOM_KEYS.has(symptomKey)
    )
  )

  if (normalizedProblemKey === 'nutrient_deficiency') {
    return (
      hasSubtypeSpecificEvidence ||
      hasAnyObservedSymptom(
        activeObservedSymptomKeys,
        Array.from(GENERIC_NUTRIENT_BACKGROUND_SYMPTOM_KEYS)
      )
    )
  }

  return hasSubtypeSpecificEvidence
}

function getCurrentRuntimeClassKey(symptomClassRuntime = null) {
  return normalizeText(
    symptomClassRuntime?.currentClassKey || symptomClassRuntime?.primaryClass?.classKey || '',
    ''
  )
}

function getCurrentRuntimeGroupKey(symptomClassRuntime = null) {
  return normalizeText(symptomClassRuntime?.currentGroupKey || '', '')
}

function shouldBlockProblemByRuntime({
  problemKey = '',
  activeObservedSymptomKeys = new Set(),
  symptomClassRuntime = null
} = {}) {
  const normalizedProblemKey = normalizeText(problemKey)
  if (!normalizedProblemKey) {return false}

  if (
    NUTRIENT_SUBTYPE_PROBLEM_KEYS.has(normalizedProblemKey) &&
    !hasIndependentNutrientEvidence(normalizedProblemKey, activeObservedSymptomKeys)
  ) {
    return true
  }

  const currentClassKey = getCurrentRuntimeClassKey(symptomClassRuntime)
  const hasRootZoneStrongEvidence = hasAnyObservedSymptom(
    activeObservedSymptomKeys,
    Array.from(ROOT_ZONE_STRONG_SYMPTOM_KEYS)
  )
  const isRootZoneAnchoredRuntime =
    currentClassKey === ROOT_ROT_RUNTIME_CLASS_KEY || hasRootZoneStrongEvidence

  if (
    isRootZoneAnchoredRuntime &&
    NUTRIENT_PROBLEM_KEYS.has(normalizedProblemKey) &&
    !hasIndependentNutrientEvidence(normalizedProblemKey, activeObservedSymptomKeys)
  ) {
    return true
  }

  return false
}

function getProblemPriorityBias({
  problemKey = '',
  activeObservedSymptomKeys = new Set(),
  symptomClassRuntime = null
} = {}) {
  const normalizedProblemKey = normalizeText(problemKey)
  if (!normalizedProblemKey) {return 0}

  const currentClassKey = getCurrentRuntimeClassKey(symptomClassRuntime)
  const currentGroupKey = getCurrentRuntimeGroupKey(symptomClassRuntime)
  let bias = 0

  if (PROBLEM_PRIORITY_BIASES_BY_CLASS[currentClassKey]?.[normalizedProblemKey]) {
    bias += PROBLEM_PRIORITY_BIASES_BY_CLASS[currentClassKey][normalizedProblemKey]
  }

  if (PROBLEM_PRIORITY_BIASES_BY_GROUP[currentGroupKey]?.[normalizedProblemKey]) {
    bias += PROBLEM_PRIORITY_BIASES_BY_GROUP[currentGroupKey][normalizedProblemKey]
  }

  if (
    currentClassKey === ROOT_ROT_RUNTIME_CLASS_KEY &&
    ROOT_ZONE_PROBLEM_KEYS.has(normalizedProblemKey) &&
    hasAnyObservedSymptom(activeObservedSymptomKeys, Array.from(ROOT_ZONE_STRONG_SYMPTOM_KEYS))
  ) {
    bias += 0.14
  }

  if (
    currentClassKey === YELLOWING_RUNTIME_CLASS_KEY &&
    normalizedProblemKey === 'iron_deficiency' &&
    hasIndependentNutrientEvidence(normalizedProblemKey, activeObservedSymptomKeys)
  ) {
    bias += 0.12
  }

  return bias
}

function isCandidateOutcomeOutputEligible(
  candidateOutcome = {},
  observedEvidenceSet = [],
  problemRoleByKey = new Map(),
  options = {}
) {
  const problemKey = normalizeText(candidateOutcome?.problemKey || '', '')
  if (!problemKey) {return false}

  const problemRole = resolveCandidateOutcomeRole(candidateOutcome, problemRoleByKey)
  if (!outputEligibilityConfig.supportRolesAsTop1.includes(problemRole)) {
    return false
  }

  const activeObservedSymptomKeys = collectActiveObservedSymptomKeys(observedEvidenceSet)
  if (
    shouldBlockProblemByRuntime({
      problemKey,
      activeObservedSymptomKeys,
      symptomClassRuntime: options?.symptomClassRuntime
    })
  ) {
    return false
  }

  const contextGuard = evaluateContextRequiredProblemGuard({
    candidateOutcomes: [{ problemKey }],
    observedEvidenceSet,
    answerEffects: options?.answerEffects || []
  })

  return !contextGuard.applies || contextGuard.hasRequiredContext
}

function getOutputEligibleCandidateOutcomes(
  candidateOutcomes = [],
  observedEvidenceSet = [],
  problemRoleByKey = new Map(),
  options = {}
) {
  return (Array.isArray(candidateOutcomes) ? candidateOutcomes : []).filter(item =>
    isCandidateOutcomeOutputEligible(item, observedEvidenceSet, problemRoleByKey, options)
  )
}

function prioritizeOutputEligibleCandidateOutcomes(
  candidateOutcomes = [],
  observedEvidenceSet = [],
  problemRoleByKey = new Map(),
  options = {}
) {
  const activeObservedSymptomKeys = collectActiveObservedSymptomKeys(observedEvidenceSet)

  return (Array.isArray(candidateOutcomes) ? candidateOutcomes : [])
    .map((item, index) => ({
      item,
      index,
      isEligible: isCandidateOutcomeOutputEligible(
        item,
        observedEvidenceSet,
        problemRoleByKey,
        options
      ),
      priorityBias: getProblemPriorityBias({
        problemKey: item?.problemKey,
        activeObservedSymptomKeys,
        symptomClassRuntime: options?.symptomClassRuntime
      })
    }))
    .sort((left, right) => {
      if (Number(right.isEligible) !== Number(left.isEligible)) {
        return Number(right.isEligible) - Number(left.isEligible)
      }
      if (Number(right.priorityBias || 0) !== Number(left.priorityBias || 0)) {
        return Number(right.priorityBias || 0) - Number(left.priorityBias || 0)
      }
      return left.index - right.index
    })
    .map(entry => entry.item)
}

function hasOutputEligibleCandidateOutcome(
  candidateOutcomes = [],
  observedEvidenceSet = [],
  problemRoleByKey = new Map(),
  options = {}
) {
  return getOutputEligibleCandidateOutcomes(
    candidateOutcomes,
    observedEvidenceSet,
    problemRoleByKey,
    options
  ).length > 0
}

function hasForceableOutputCandidateOutcome(
  candidateOutcomes = [],
  observedEvidenceSet = [],
  problemRoleByKey = new Map(),
  options = {}
) {
  return getOutputEligibleCandidateOutcomes(
    candidateOutcomes,
    observedEvidenceSet,
    problemRoleByKey,
    options
  ).some(item => (
    Number(item?.visualEvidence || 0) > 0 ||
    Number(item?.questionEvidence || 0) > 0 ||
    Number(item?.totalEvidence || 0) > 0
  ))
}

module.exports = {
  resolveCandidateOutcomeRole,
  isCandidateOutcomeOutputEligible,
  getOutputEligibleCandidateOutcomes,
  prioritizeOutputEligibleCandidateOutcomes,
  hasOutputEligibleCandidateOutcome,
  hasForceableOutputCandidateOutcome
}
