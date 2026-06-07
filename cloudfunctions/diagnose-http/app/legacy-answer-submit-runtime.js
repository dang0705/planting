'use strict'

const { buildSyntheticQuestionOptionMappings } = require('../utils/synthetic-question-package')
const {
  markQuestionAnswers,
  validateQuestionAnswerOwnership
} = require('../services/session-service')
const { markQueueItemsAnswered } = require('../services/question-queue-runtime-service')
const { mergeAnswerRuntimeState } = require('./answer-runtime-state')
const {
  resolveLegacyQuestionKeysForValidation,
  buildAskedLegacyQuestionRows
} = require('./legacy-question-row-runtime')

async function validateLegacyAnswerOwnership({
  sessionId,
  answers,
  answerRound,
  sessionState,
  rows
} = {}) {
  return validateQuestionAnswerOwnership(sessionId, answers, answerRound, {
    questionRows: rows,
    queuedQuestionKeys: resolveLegacyQuestionKeysForValidation({
      answerRound,
      sessionState,
      rows
    })
  })
}

function buildLegacyAnswerOptionMappings(questionKeys = [], storedMappings = []) {
  return [
    ...(Array.isArray(storedMappings) ? storedMappings : []),
    ...buildSyntheticQuestionOptionMappings(questionKeys)
  ]
}

async function applyLegacyAnswerSubmitRuntime({
  sessionId,
  openid,
  answerRound,
  answers,
  optionMappings,
  legacyQuestionProgress,
  sessionState,
  rows,
  deferredJobs,
  timing
} = {}) {
  const markResultPromise = markQuestionAnswers(sessionId, answers, {
    optionMappings,
    answerRound,
    questionRows: rows,
    awaitPersistence: false
  })
  if (Array.isArray(deferredJobs)) {
    deferredJobs.push(() =>
      markQueueItemsAnswered(sessionId, openid, answerRound, answers, {
        questionQueue:
          Number(answerRound || 1) === Number(legacyQuestionProgress?.roundIndex || 0)
            ? legacyQuestionProgress
            : null
      })
    )
  }
  const markResult = await markResultPromise
  timing?.mark?.('legacy-answer-rows-marked', {
    updatedAnswerCount: Array.isArray(markResult?.updatedAnswers)
      ? markResult.updatedAnswers.length
      : 0
  })
  const updatedAnswers = Array.isArray(markResult?.updatedAnswers) ? markResult.updatedAnswers : []
  const rowSnapshot = markResult?.questionRows || rows
  return {
    markResult,
    rowSnapshot,
    askedQuestionRows: buildAskedLegacyQuestionRows(rowSnapshot),
    ...mergeAnswerRuntimeState({
      sessionState,
      updatedAnswers
    })
  }
}

module.exports = {
  validateLegacyAnswerOwnership,
  buildLegacyAnswerOptionMappings,
  applyLegacyAnswerSubmitRuntime
}
