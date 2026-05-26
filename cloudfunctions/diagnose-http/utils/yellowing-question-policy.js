'use strict'

const {
  QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension
} = require('./question-target-dimension')

const YELLOWING_LEAF_AGE_PATTERN_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern'
const YELLOWING_DISTRIBUTION_PATTERN_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__yellowing_distribution_pattern'
const YELLOWING_CARE_AREA_GATE_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__yellowing_care_area_gate'

const DISABLED_YELLOWING_FLOW_DIMENSIONS = new Set([
  QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN
])

const DISABLED_YELLOWING_FLOW_QUESTION_KEYS = new Set([
  YELLOWING_LEAF_AGE_PATTERN_QUESTION_KEY,
  YELLOWING_DISTRIBUTION_PATTERN_QUESTION_KEY,
  'q_leaf_yellowing_new_growth_bias',
  'q_iron_new_leaves_yellow',
  'q_iron_not_old_first',
  'q_nitrogen_old_leaves_yellow',
  'q_nitrogen_uniform_yellow'
])

const YELLOWING_FLOW_SYMPTOM_KEYS = new Set([
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

const YELLOWING_CARE_ENVIRONMENT_DIMENSIONS = new Set([
  QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.AIRFLOW_HUMIDITY_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED,
  QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE,
  QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT
])

const YELLOWING_BLOCKED_OUTCOME_KEYS = new Set([
  'leaf_spot_problem',
  'stable_natural_marking',
  'spider_mites',
  'thrips',
  'whiteflies',
  'aphids',
  'scale_insects',
  'mealybugs',
  'sooty_mold_associated_pests',
  'chewing_insects',
  'fungal_leaf_spot',
  'bacterial_leaf_spot',
  'powdery_mildew',
  'rust',
  'virus_mosaic'
])

const YELLOWING_BLOCKED_KEY_PATTERN =
  /(leaf_?spot|spot_|_spot|lesion|halo|water_?soaked|variegation|marking|mosaic|blotch|mottle|speckl|stippl|pest|mite|thrips|whitefl|aphid|scale|mealy|honeydew|sooty|mold|mildew|powder|rust|disease)/i

const YELLOWING_CARE_ENVIRONMENT_KEY_DIMENSIONS = [
  QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.AIRFLOW_HUMIDITY_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED,
  QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT,
  QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE,
  QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT
]

function normalizeKey(value = '') {
  return String(value || '').trim()
}

function isYellowingFlowSymptomKey(symptomKey = '') {
  return YELLOWING_FLOW_SYMPTOM_KEYS.has(normalizeKey(symptomKey))
}

function isYellowingQuestionLike(question = {}) {
  const questionKey = normalizeKey(question?.questionKey || question?.question_key || '')
  const targetSymptomKey = normalizeKey(question?.targetSymptomKey || question?.target_symptom_key || '')
  const routeKey = normalizeKey(question?.routeKey || question?.route_key || '')
  const gateKey = normalizeKey(question?.gateKey || question?.gate_key || '')
  const questionGroupKey = normalizeKey(question?.questionGroupKey || question?.question_group_key || '')
  return (
    isYellowingFlowSymptomKey(targetSymptomKey) ||
    /yellowing|leaf_yellow/.test(questionKey) ||
    /yellowing|leaf_yellow/.test(routeKey) ||
    /yellowing|leaf_yellow/.test(gateKey) ||
    /yellowing|leaf_yellow/.test(questionGroupKey)
  )
}

function isYellowingCareEnvironmentDimension(targetDimension = '') {
  return YELLOWING_CARE_ENVIRONMENT_DIMENSIONS.has(
    normalizeQuestionTargetDimension(targetDimension, '')
  )
}

function inferYellowingCareEnvironmentDimensionFromKey(questionKey = '') {
  const normalizedQuestionKey = normalizeKey(questionKey)
  return YELLOWING_CARE_ENVIRONMENT_KEY_DIMENSIONS.find(dimension =>
    normalizedQuestionKey.includes(dimension)
  ) || ''
}

function isBlockedYellowingOutcomeKey(outcomeKey = '') {
  return YELLOWING_BLOCKED_OUTCOME_KEYS.has(normalizeKey(outcomeKey))
}

function isBlockedYellowingCareQuestion(question = {}) {
  const questionKey = normalizeKey(question?.questionKey || question?.question_key || '')
  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension ||
      question?.target_dimension ||
      question?.evidenceDimension ||
      question?.evidence_dimension ||
      '',
    ''
  ) || inferYellowingCareEnvironmentDimensionFromKey(questionKey)
  const outcomeKey = normalizeKey(question?.outcomeKey || question?.outcome_key || '')
  const routeKey = normalizeKey(question?.routeKey || question?.route_key || '')
  const targetSymptomKey = normalizeKey(question?.targetSymptomKey || question?.target_symptom_key || '')
  const questionGroupKey = normalizeKey(question?.questionGroupKey || question?.question_group_key || '')
  const text = [
    questionKey,
    targetDimension,
    outcomeKey,
    routeKey,
    targetSymptomKey,
    questionGroupKey
  ].join(' ')

  if (isBlockedYellowingOutcomeKey(outcomeKey)) {
    return true
  }
  if (YELLOWING_BLOCKED_KEY_PATTERN.test(text)) {
    return true
  }
  if (!isYellowingCareEnvironmentDimension(targetDimension)) {
    return true
  }
  return false
}

function isDisallowedYellowingCareEnvironmentQuestion(question = {}) {
  return isYellowingQuestionLike(question) && isBlockedYellowingCareQuestion(question)
}

function isDisabledYellowingFlowQuestion(question = {}) {
  const questionKey = normalizeKey(question?.questionKey || question?.question_key || '')
  if (DISABLED_YELLOWING_FLOW_QUESTION_KEYS.has(questionKey)) {
    return true
  }
  if (questionKey.includes('yellowing_leaf_age_pattern')) {
    return true
  }

  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension ||
      question?.target_dimension ||
      question?.evidenceDimension ||
      question?.evidence_dimension ||
      '',
    ''
  )
  if (!DISABLED_YELLOWING_FLOW_DIMENSIONS.has(targetDimension)) {
    return false
  }

  const targetSymptomKey = normalizeKey(question?.targetSymptomKey || question?.target_symptom_key || '')
  if (!targetSymptomKey || isYellowingFlowSymptomKey(targetSymptomKey)) {
    return true
  }

  const questionText = normalizeKey(
    question?.questionText ||
      question?.question_text ||
      question?.questionTextUserCn ||
      question?.question_text_user_cn ||
      question?.questionTextCn ||
      question?.question_text_cn ||
      ''
  )
  const isYellowingQuestionKey = questionKey.includes('yellowing') || questionKey.includes('leaf_yellow')
  return isYellowingQuestionKey && /新叶|老叶|下部叶/.test(questionText)
}

function filterDisabledYellowingFlowQuestions(questions = []) {
  return (Array.isArray(questions) ? questions : []).filter(
    question =>
      !isDisabledYellowingFlowQuestion(question) &&
      !isDisallowedYellowingCareEnvironmentQuestion(question)
  )
}

function filterYellowingCareEnvironmentCandidateOutcomeKeys(outcomeKeys = []) {
  return (Array.isArray(outcomeKeys) ? outcomeKeys : [])
    .map(item => normalizeKey(item))
    .filter(Boolean)
    .filter(outcomeKey => !isBlockedYellowingOutcomeKey(outcomeKey))
}

module.exports = {
  YELLOWING_LEAF_AGE_PATTERN_QUESTION_KEY,
  YELLOWING_CARE_AREA_GATE_QUESTION_KEY,
  isYellowingFlowSymptomKey,
  isYellowingCareEnvironmentDimension,
  isDisallowedYellowingCareEnvironmentQuestion,
  filterYellowingCareEnvironmentCandidateOutcomeKeys,
  isDisabledYellowingFlowQuestion,
  filterDisabledYellowingFlowQuestions
}
