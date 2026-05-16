'use strict'

const {
  QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension
} = require('../question-target-dimension')
const { normalizeText } = require('./keys')
const {
  ORTHOGONAL_DIMENSION_PRIORITY_BY_PATTERN,
  ORTHOGONAL_DIMENSION_PRIORITY_BY_SYMPTOM
} = require('./dimension-priorities')
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

  const fallback = locationKey === 'stem'
    ? [
        QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
        QUESTION_TARGET_DIMENSIONS.PROGRESSION,
        QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
      ]
    : [
        QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
        QUESTION_TARGET_DIMENSIONS.PROGRESSION,
        QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION
      ]

  const combined = [...symptomSpecific, ...base, ...fallback]

  if (locationKey === 'leaf' && !combined.includes(QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE)) {
    combined.push(QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE)
  }
  if (
    symptomKey === 'black_spots_spreading' ||
    symptomKey === 'brown_spots_halo' ||
    symptomKey === 'irregular_blotches'
  ) {
    const blockedVisualFactReviewDimensions = new Set([
      QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
      QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY
    ])
    return Array.from(new Set([
      QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING,
      QUESTION_TARGET_DIMENSIONS.LESION_HALO,
      QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE,
      QUESTION_TARGET_DIMENSIONS.PROGRESSION,
      QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
      ...combined
    ])).filter(targetDimension => !blockedVisualFactReviewDimensions.has(targetDimension))
  }

  return Array.from(new Set(combined))
}

function buildSyntheticDirectProblemAdjustments(item = {}, targetDimension = '', optionKey = '') {
  const symptomKey = normalizeText(item?.symptomKey)
  const normalizedTargetDimension = normalizeQuestionTargetDimension(targetDimension, '')
  const normalizedOptionKey = normalizeText(optionKey).toLowerCase()
  if (!symptomKey || !normalizedTargetDimension || !normalizedOptionKey) {
    return []
  }

  const symptomEffects =
    isStructuralChewingSymptom({ ...item, symptomKey }) &&
    normalizedTargetDimension === QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE
      ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.structuralDamageCause
      : isPestTraceSymptom({ ...item, symptomKey }) &&
        [
          QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
          QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS
        ].includes(normalizedTargetDimension)
        ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.pestTraceType
      : isEdemaBumpSymptom({ ...item, symptomKey }) &&
        normalizedTargetDimension === QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE
        ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.edemaBumpStage
      : isYellowingSymptom({ ...item, symptomKey }) &&
        [
          QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE,
          QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE,
          QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
          QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
          QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
          QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
          QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
          QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED
        ].includes(normalizedTargetDimension)
        ? SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM.yellowingDifferential
      : SYNTHETIC_DIRECT_PROBLEM_EFFECTS_BY_SYMPTOM[symptomKey]
  const dimensionEffects = symptomEffects?.[normalizedTargetDimension]
  const optionEffects = dimensionEffects?.[normalizedOptionKey]

  return (Array.isArray(optionEffects) ? optionEffects : [])
    .map(item => ({
      problemKey: normalizeText(item?.problemKey),
      scoreDelta: Number(item?.scoreDelta || 0)
    }))
    .filter(item => item.problemKey && Number(item.scoreDelta || 0) !== 0)
}

module.exports = {
  isStructuralChewingSymptom,
  isYellowingSymptom,
  isPestTraceSymptom,
  isEdemaBumpSymptom,
  buildOrthogonalProbeDimensionOrder,
  buildSyntheticDirectProblemAdjustments
}
