'use strict'

const YELLOW_LEAF_PACKAGE_MODE = 'yellow_leaf'
const YELLOWING_PACKAGE_SOURCE_MODE = 'manual_yellowing_care_environment_frontloaded'
const YELLOWING_PACKAGE_QUESTION_COUNT = 4

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
  _test: {
    resolveSourceMode
  }
}
