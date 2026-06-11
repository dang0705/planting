'use strict'

const { appendQuestionQuestions: writeSessionQuestionRows } = require('./session-service')
const { buildYellowingQuestionPackage } = require('../app/question-package-response')

function shouldWriteSessionQuestionRows(response = {}) {
  return Boolean(response?.questionRequired)
}

async function writeSessionRoundQuestionRows({
  sessionId,
  round,
  response,
  isInitialRound = false
} = {}) {
  const sessionQuestions = Array.isArray(response?.questions) ? response.questions : []
  const isQuestionPackagePersistence = Boolean(
    buildYellowingQuestionPackage(response, sessionQuestions)
  )
  await writeSessionQuestionRows(sessionId, round, sessionQuestions, {
    assumeNoExisting: isInitialRound || isQuestionPackagePersistence
  })
}

module.exports = {
  shouldWriteSessionQuestionRows,
  writeSessionRoundQuestionRows
}
