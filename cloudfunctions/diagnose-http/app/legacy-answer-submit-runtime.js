'use strict'

const { buildSyntheticFollowUpOptionMappings } = require('../utils/synthetic-follow-up')
const {
  markFollowUpAnswers,
  validateFollowUpAnswerOwnership
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
  return validateFollowUpAnswerOwnership(sessionId, answers, answerRound, {
    followUpRows: rows,
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
    ...buildSyntheticFollowUpOptionMappings(questionKeys)
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
  const markResultPromise = markFollowUpAnswers(sessionId, answers, {
    optionMappings,
    answerRound,
    followUpRows: rows,
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
  const rowSnapshot = markResult?.followUpRows || rows
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
