'use strict'

const { fromQuestionId } = require('../mappers/public-id-mapper')

const YELLOW_LEAF_PACKAGE_MODE = 'yellow_leaf'
const YELLOWING_PACKAGE_SOURCE_MODE = 'manual_yellowing_care_environment_frontloaded'
const YELLOWING_PACKAGE_QUESTION_COUNT = 4
const YELLOWING_FRONTLOADED_CARE_CONTEXT_DIMENSIONS = new Set([
  'watering_frequency_context',
  'light_change_context',
  'fertilization_growth_context',
  'airflow_humidity_context'
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function resolveSourceMode(response = {}) {
  return normalizeText(
    response?.questionPackage?.sourceMode ||
      response?.questionPackage?.source_mode ||
      response?.metrics?.routeDecision?.mode ||
      response?.__runtimeRouteDecision?.mode ||
      response?.uiHints?.sourceMode ||
      response?.uiHints?.source_mode
  )
}

function isYellowingQuestionPackage(response = {}) {
  const mode = normalizeText(response?.questionPackage?.mode || response?.questionPackage?.diagnosisMode)
  return mode === YELLOW_LEAF_PACKAGE_MODE || resolveSourceMode(response) === YELLOWING_PACKAGE_SOURCE_MODE
}

function normalizeAnswerQuestionKey(answer = {}) {
  return fromQuestionId(answer?.questionId || '') ||
    normalizeText(answer?.questionKey || answer?.question_key || answer?.questionId || '')
}

function parseYellowingFrontloadedCareQuestionKey(questionKey = '') {
  const normalizedQuestionKey = normalizeText(questionKey)
  const prefix = 'q_observed_probe__leaf_yellowing__'
  if (!normalizedQuestionKey.startsWith(prefix)) {
    return ''
  }
  return normalizedQuestionKey.slice(prefix.length)
}

function hasQuestionPackageSubmitMetadata(payload = {}) {
  const questionPackage = payload?.questionPackage || {}
  const uiHints = payload?.uiHints || {}
  return Boolean(questionPackage && Object.keys(questionPackage).length) ||
    normalizeText(uiHints.answerSubmitMode || uiHints.answer_submit_mode) === 'package' ||
    normalizeText(uiHints.questionDisplayMode || uiHints.question_display_mode) === 'package'
}

function collectUniqueAnswerQuestionKeys(answers = []) {
  const questionKeys = Array.from(
    new Set(
      (Array.isArray(answers) ? answers : [])
        .map(normalizeAnswerQuestionKey)
        .filter(Boolean)
    )
  )
  return questionKeys
}

function isCompleteYellowingFrontloadedCarePackage(questionKeys = []) {
  if (questionKeys.length !== YELLOWING_PACKAGE_QUESTION_COUNT) {
    return false
  }

  const dimensions = questionKeys
    .map(parseYellowingFrontloadedCareQuestionKey)
    .filter(Boolean)
  if (dimensions.length !== YELLOWING_PACKAGE_QUESTION_COUNT) {
    return false
  }

  const dimensionSet = new Set(dimensions)
  const hasCompleteFrontloadedCarePackage = dimensionSet.size === YELLOWING_PACKAGE_QUESTION_COUNT &&
    Array.from(YELLOWING_FRONTLOADED_CARE_CONTEXT_DIMENSIONS).every(dimension =>
      dimensionSet.has(dimension)
    )

  return hasCompleteFrontloadedCarePackage
}

function resolveQuestionPackageAnswerCount(payload = {}, answerCount = 0) {
  const questionPackage = payload?.questionPackage || {}
  const declaredQuestionCount = Number(
    questionPackage.questionCount ??
      questionPackage.question_count ??
      questionPackage.maxQuestionsThisRound ??
      questionPackage.max_questions_this_round ??
      payload?.uiHints?.maxQuestionsThisRound ??
      payload?.uiHints?.max_questions_this_round ??
      0
  )
  if (Number.isFinite(declaredQuestionCount) && declaredQuestionCount > 0) {
    return declaredQuestionCount
  }
  return answerCount > 1 ? answerCount : 0
}

function isQuestionPackageAnswerSubmitPayload({ payload = {}, answers = [], requestMode = '' } = {}) {
  if (normalizeText(requestMode).toLowerCase() !== 'answer_submit') {
    return false
  }

  const questionKeys = collectUniqueAnswerQuestionKeys(answers)
  if (hasQuestionPackageSubmitMetadata(payload)) {
    const expectedAnswerCount = resolveQuestionPackageAnswerCount(payload, questionKeys.length)
    return expectedAnswerCount > 1 && questionKeys.length === expectedAnswerCount
  }

  return isCompleteYellowingFrontloadedCarePackage(questionKeys)
}

function buildYellowingQuestionPackage(response = {}, questions = []) {
  const questionCount = Array.isArray(questions) ? questions.length : 0
  if (!isYellowingQuestionPackage(response) || questionCount !== YELLOWING_PACKAGE_QUESTION_COUNT) {return null}
  return {
    mode: YELLOW_LEAF_PACKAGE_MODE,
    sourceMode: YELLOWING_PACKAGE_SOURCE_MODE,
    questionCount: YELLOWING_PACKAGE_QUESTION_COUNT,
    answerSubmitMode: 'package',
    questionDisplayMode: 'package'
  }
}

function buildQuestionPackageUiHints(baseUiHints = {}, questionPackage = null, questionCount = 0) {
  if (!questionPackage) {
    return {
      canUploadMoreImages: Boolean(baseUiHints?.canUploadMoreImages),
      maxQuestionsThisRound: questionCount ? 1 : 0,
      questionDisplayMode: 'single',
      answerSubmitMode: 'per_question',
      optionLayout: 'vertical',
      transition: 'swiper'
    }
  }
  return {
    canUploadMoreImages: Boolean(baseUiHints?.canUploadMoreImages),
    maxQuestionsThisRound: questionPackage.questionCount,
    questionDisplayMode: questionPackage.questionDisplayMode,
    answerSubmitMode: questionPackage.answerSubmitMode,
    optionLayout: 'vertical',
    transition: 'swiper'
  }
}

function resolveResponseQuestions(publicResponse = {}) {
  if (Array.isArray(publicResponse.questions) && publicResponse.questions.length) {
    return publicResponse.questions
  }
  if (Array.isArray(publicResponse.followUps) && publicResponse.followUps.length) {
    return publicResponse.followUps
  }
  return Array.isArray(publicResponse.questions) ? publicResponse.questions : publicResponse.followUps
}

module.exports = {
  YELLOW_LEAF_PACKAGE_MODE,
  YELLOWING_PACKAGE_SOURCE_MODE,
  YELLOWING_PACKAGE_QUESTION_COUNT,
  buildYellowingQuestionPackage,
  buildQuestionPackageUiHints,
  resolveResponseQuestions,
  isYellowingQuestionPackage,
  isQuestionPackageAnswerSubmitPayload,
  _test: {
    resolveSourceMode,
    hasQuestionPackageSubmitMetadata,
    resolveQuestionPackageAnswerCount,
    isCompleteYellowingFrontloadedCarePackage,
    parseYellowingFrontloadedCareQuestionKey
  }
}
