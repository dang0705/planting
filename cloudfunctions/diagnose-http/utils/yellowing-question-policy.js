'use strict'

const {
  QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension
} = require('./question-target-dimension')

const YELLOWING_LEAF_AGE_PATTERN_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__yellowing_leaf_age_pattern'
const YELLOWING_DISTRIBUTION_PATTERN_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__yellowing_distribution_pattern'

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

function normalizeKey(value = '') {
  return String(value || '').trim()
}

function isYellowingFlowSymptomKey(symptomKey = '') {
  return YELLOWING_FLOW_SYMPTOM_KEYS.has(normalizeKey(symptomKey))
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
    question => !isDisabledYellowingFlowQuestion(question)
  )
}

module.exports = {
  YELLOWING_LEAF_AGE_PATTERN_QUESTION_KEY,
  isDisabledYellowingFlowQuestion,
  filterDisabledYellowingFlowQuestions
}
