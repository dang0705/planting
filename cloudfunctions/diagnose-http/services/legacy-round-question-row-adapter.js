'use strict'

const { appendFollowUpQuestions: writeLegacyQuestionRows } = require('./session-service')
const { buildYellowingQuestionPackage } = require('../app/question-package-response')

function shouldWriteLegacyQuestionRows(response = {}) {
  return Boolean(response?.followUpRequired)
}

async function writeLegacyRoundQuestionRows({
  sessionId,
  round,
  response,
  isInitialRound = false
} = {}) {
  const legacyQuestions = Array.isArray(response?.followUps) ? response.followUps : []
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
