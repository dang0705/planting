'use strict'

const { buildSyntheticQuestionOptionMappings } = require('../utils/synthetic-question-package')
const {
  markQuestionAnswers,
  validateQuestionAnswerOwnership
} = require('../services/session-service')
const { mergeAnswerRuntimeState } = require('./answer-runtime-state')
const {
  resolveSessionQuestionKeysForValidation,
  buildAskedSessionQuestionRows
} = require('./session-question-row-runtime')

async function validateSessionAnswerOwnership({
  sessionId,
  answers,
  answerRound,
  sessionState,
  rows
} = {}) {
  return validateQuestionAnswerOwnership(sessionId, answers, answerRound, {
    questionRows: rows,
    packageQuestionKeys: resolveSessionQuestionKeysForValidation({
      answerRound,
      sessionState,
      rows
    })
  })
}

function buildSessionAnswerOptionMappings(questionKeys = [], storedMappings = []) {
  return [
    ...(Array.isArray(storedMappings) ? storedMappings : []),
    ...buildSyntheticQuestionOptionMappings(questionKeys)
  ]
}

async function applySessionAnswerSubmitRuntime({
  sessionId,
  openid: _openid,
  answerRound,
  answers,
  optionMappings,
  sessionState,
  rows,
  timing
} = {}) {
  const markResultPromise = markQuestionAnswers(sessionId, answers, {
    optionMappings,
    answerRound,
    questionRows: rows,
    awaitPersistence: false
  })
  const markResult = await markResultPromise
  timing?.mark?.('session-answer-rows-marked', {
    updatedAnswerCount: Array.isArray(markResult?.updatedAnswers)
      ? markResult.updatedAnswers.length
      : 0
  })
  const updatedAnswers = Array.isArray(markResult?.updatedAnswers) ? markResult.updatedAnswers : []
  const rowSnapshot = markResult?.questionRows || rows
  return {
    markResult,
    rowSnapshot,
    askedQuestionRows: buildAskedSessionQuestionRows(rowSnapshot),
    ...mergeAnswerRuntimeState({
      sessionState,
      updatedAnswers
    })
  }
}

module.exports = {
  validateSessionAnswerOwnership,
  buildSessionAnswerOptionMappings,
  applySessionAnswerSubmitRuntime
}
