'use strict'

const { appendQuestionQuestions: writeLegacyQuestionRows } = require('./session-service')
const { buildYellowingQuestionPackage } = require('../app/question-package-response')

function shouldWriteLegacyQuestionRows(response = {}) {
  return Boolean(response?.questionRequired)
}

async function writeLegacyRoundQuestionRows({
  sessionId,
  round,
  response,
  isInitialRound = false
} = {}) {
  const legacyQuestions = Array.isArray(response?.questions) ? response.questions : []
  const isQuestionPackagePersistence = Boolean(
    buildYellowingQuestionPackage(response, legacyQuestions)
  )
  await writeLegacyQuestionRows(sessionId, round, legacyQuestions, {
    questionQueue: response?.questionQueue || null,
    assumeNoExisting: isInitialRound,
    allowUnqueuedQuestions: isQuestionPackagePersistence
  })
}

module.exports = {
  shouldWriteLegacyQuestionRows,
  writeLegacyRoundQuestionRows
}
