'use strict'

const {
  QUESTION_PACKAGE_TOPICS,
  normalizeQuestionPackageTopic
} = require('../question-package-topic')
const { normalizeText } = require('./keys')
const {
  ORTHOGONAL_DIMENSION_PRIORITY_BY_PATTERN,
  ORTHOGONAL_DIMENSION_PRIORITY_BY_SYMPTOM
} = require('./topic-priorities')
const SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM = require('./direct-effects')

function isStructuralChewingSymptom(item = {}) {
  const symptomKey = normalizeText(item?.symptomKey)
  const patternKey = normalizeText(item?.patternKey)

  return (
    ['chewed_edges', 'holes_in_leaf', 'skeletonized_leaves'].includes(symptomKey) ||
    ['chew', 'holes', 'skeletonization'].includes(patternKey)
  )
}

function isYellowingSymptom(item = {}) {
  const symptomKey = normalizeText(item?.symptomKey)
  const patternKey = normalizeText(item?.patternKey)

  return (
    [
      'leaf_yellowing',
      'uniform_yellowing',
      'yellow_lower_leaves',
      'yellow_new_leaves',
      'interveinal_chlorosis',
      'pale_new_leaves',
      'yellowing_patchy',
      'yellow_speckling'
    ].includes(symptomKey) ||
    ['yellowing', 'chlorosis'].includes(patternKey)
  )
}

function isPestTraceSymptom(item = {}) {
  const symptomKey = normalizeText(item?.symptomKey)
  const patternKey = normalizeText(item?.patternKey)

  return (
    [
      'yellow_speckling',
      'stippling',
      'silver_streaks',
      'fine_webbing',
      'sticky_honeydew',
      'leaf_curl',
      'leaf_twist'
    ].includes(symptomKey) ||
    ['speckling', 'webbing', 'streaks', 'curl', 'twist'].includes(patternKey)
  )
}

function isEdemaBumpSymptom(item = {}) {
  const symptomKey = normalizeText(item?.symptomKey)
  const patternKey = normalizeText(item?.patternKey)

  return (
    ['edema', 'blister_like_bumps'].includes(symptomKey) ||
    ['edema', 'blister', 'bumps'].includes(patternKey)
  )
}

function buildOrthogonalProbeDimensionOrder(item = {}) {
  const patternKey = normalizeText(item?.patternKey)
  const locationKey = normalizeText(item?.locationKey)
  const symptomKey = normalizeText(item?.symptomKey)
  const symptomSpecific = ORTHOGONAL_DIMENSION_PRIORITY_BY_SYMPTOM[symptomKey] || []
  const base = ORTHOGONAL_DIMENSION_PRIORITY_BY_PATTERN[patternKey] || []

  const conservative = locationKey === 'stem'
    ? [
        QUESTION_PACKAGE_TOPICS.TISSUE_MOISTURE,
        QUESTION_PACKAGE_TOPICS.PROGRESSION,
        QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION
      ]
    : [
        QUESTION_PACKAGE_TOPICS.DISTRIBUTION_SCOPE,
        QUESTION_PACKAGE_TOPICS.PROGRESSION,
        QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION
      ]

  const combined = [...symptomSpecific, ...base, ...conservative]

  if (locationKey === 'leaf' && !combined.includes(QUESTION_PACKAGE_TOPICS.UNDERSIDE_PRESENCE)) {
    combined.push(QUESTION_PACKAGE_TOPICS.UNDERSIDE_PRESENCE)
  }
  if (
    symptomKey === 'black_spots_spreading' ||
    symptomKey === 'brown_spots_halo' ||
    symptomKey === 'irregular_blotches'
  ) {
    const blockedVisualFactReviewDimensions = new Set([
      QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE,
      QUESTION_PACKAGE_TOPICS.TISSUE_INTEGRITY
    ])
    return Array.from(new Set([
      QUESTION_PACKAGE_TOPICS.LESION_WATER_SOAKING,
      QUESTION_PACKAGE_TOPICS.LESION_HALO,
      QUESTION_PACKAGE_TOPICS.TISSUE_MOISTURE,
      QUESTION_PACKAGE_TOPICS.PROGRESSION,
      QUESTION_PACKAGE_TOPICS.DISTRIBUTION_SCOPE,
      ...combined
    ])).filter(packageTopic => !blockedVisualFactReviewDimensions.has(packageTopic))
  }

  return Array.from(new Set(combined))
}

function buildSyntheticDirectProblemAdjustments(item = {}, packageTopic = '', optionKey = '') {
  const symptomKey = normalizeText(item?.symptomKey)
  const normalizedPackageTopic = normalizeQuestionPackageTopic(packageTopic, '')
  const normalizedOptionKey = normalizeText(optionKey).toLowerCase()
  if (!symptomKey || !normalizedPackageTopic || !normalizedOptionKey) {
    return []
  }

  const symptomEffects =
    isStructuralChewingSymptom({ ...item, symptomKey }) &&
    normalizedPackageTopic === QUESTION_PACKAGE_TOPICS.STRUCTURAL_CAUSE
      ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.structuralDamageCause
      : isPestTraceSymptom({ ...item, symptomKey }) &&
        [
          QUESTION_PACKAGE_TOPICS.PEST_TRACE_TYPE,
          QUESTION_PACKAGE_TOPICS.SURFACE_STICKINESS
        ].includes(normalizedPackageTopic)
        ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.pestTraceType
      : isEdemaBumpSymptom({ ...item, symptomKey }) &&
        normalizedPackageTopic === QUESTION_PACKAGE_TOPICS.EDEMA_BUMP_STAGE
        ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.edemaBumpStage
      : isYellowingSymptom({ ...item, symptomKey }) &&
        [
          QUESTION_PACKAGE_TOPICS.YELLOWING_DISEASE_TRACE_TOPIC,
          QUESTION_PACKAGE_TOPICS.PEST_TRACE_TYPE,
          QUESTION_PACKAGE_TOPICS.YELLOWING_LEAF_AGE_PATTERN,
          QUESTION_PACKAGE_TOPICS.YELLOWING_DISTRIBUTION_PATTERN,
          QUESTION_PACKAGE_TOPICS.WATERING_FREQUENCY_CONTEXT,
          QUESTION_PACKAGE_TOPICS.LIGHT_CHANGE_CONTEXT,
          QUESTION_PACKAGE_TOPICS.FERTILIZATION_GROWTH_CONTEXT,
          QUESTION_PACKAGE_TOPICS.AIRFLOW_HUMIDITY_CONTEXT,
          QUESTION_PACKAGE_TOPICS.YELLOWING_PROGRESSION_SPEED
        ].includes(normalizedPackageTopic)
        ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.yellowingDifferential
      : SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM[symptomKey]
  const dimensionEffects = symptomEffects?.[normalizedPackageTopic]
  const optionEffects = dimensionEffects?.[normalizedOptionKey]

  return (Array.isArray(optionEffects) ? optionEffects : [])
    .map(item => ({
      problemKey: normalizeText(item?.problemKey),
      effectValue: Number(item?.effectValue || 0)
    }))
    .filter(item => item.problemKey && Number(item.effectValue || 0) !== 0)
}

module.exports = {
  isStructuralChewingSymptom,
  isYellowingSymptom,
  isPestTraceSymptom,
  isEdemaBumpSymptom,
  buildOrthogonalProbeDimensionOrder,
  buildSyntheticDirectProblemAdjustments
}
