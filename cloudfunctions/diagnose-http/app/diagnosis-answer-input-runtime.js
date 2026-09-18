'use strict'

const { fromQuestionId } = require('../mappers/public-id-mapper')
const { isQuestionPackageAnswerSubmitPayload } = require('./question-package-response')
const {
  resolveVisualImageInputs,
  normalizePublicAnswers,
  normalizeRequestMode
} = require('./request-normalizers')
const { isDirectionChoicePayload } = require('./diagnosis-direction-choice-runtime')

function resolveDirtyQuestionKey(payload = {}, isAnswerRevision = false) {
  return isAnswerRevision
    ? fromQuestionId(payload.dirtyFromQuestionId || '') ||
        String(
          payload.dirtyFromQuestionKey ||
            payload.dirtyQuestionKey ||
            payload.dirtyFromQuestionId ||
            ''
        ).trim()
    : ''
}

function resolveAnswerInputRuntime(payload = {}) {
  const answers = normalizePublicAnswers(payload.answers || [])
  const imageInputs = resolveVisualImageInputs(payload)
  const hasAnswers = answers.length > 0
  const hasImageInputs = imageInputs.length > 0
  const requestMode = normalizeRequestMode(payload.requestMode || payload.mode || '')
  const hasDirectionChoice = isDirectionChoicePayload({ requestMode, payload })
  const isAnswerRevision = requestMode === 'answer_revision'
  const payloadQuestionPackageSubmit = isQuestionPackageAnswerSubmitPayload({
    payload,
    answers,
    requestMode
  })
  const dirtyQuestionKey = resolveDirtyQuestionKey(payload, isAnswerRevision)

  if (!hasAnswers && !hasImageInputs && !hasDirectionChoice) {
    throw Object.assign(new Error('缺少 answers 或 images'), { statusCode: 400 })
  }
  if (hasDirectionChoice && (hasAnswers || hasImageInputs)) {
    throw Object.assign(new Error('诊断方向选择不能同时提交答案或补图'), { statusCode: 400 })
  }
  if (isAnswerRevision && hasImageInputs) {
    throw Object.assign(new Error('answer_revision 不支持同时提交补图'), { statusCode: 400 })
  }
  if (isAnswerRevision && !dirtyQuestionKey) {
    throw Object.assign(new Error('缺少 dirtyFromQuestionId'), { statusCode: 400 })
  }
  if (hasAnswers && hasImageInputs) {
    throw Object.assign(new Error('题包答案与补图必须分开提交'), { statusCode: 400 })
  }

  return {
    answers,
    imageInputs,
    hasAnswers,
    hasImageInputs,
    requestMode,
    hasDirectionChoice,
    isAnswerRevision,
    payloadQuestionPackageSubmit,
    dirtyQuestionKey
  }
}

module.exports = {
  resolveAnswerInputRuntime,
  _test: { resolveDirtyQuestionKey }
}
