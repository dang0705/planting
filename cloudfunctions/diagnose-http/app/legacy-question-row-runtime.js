'use strict'

const {
  readQuestionKeyFromRationale,
  readRoundFromRationale
} = require('../services/session-question-service')
const {
  pickQuestionKeysFromQuestionQueue,
  buildAskedQuestionRowsFromQuestionRows: buildAskedLegacyQuestionRows
} = require('./request-normalizers')

function collectAnsweredLegacyQuestionKeys(rows = []) {
  const answeredRows = Array.isArray(rows) ? rows : []
  const keys = new Set()
  for (const row of answeredRows) {
    if (Number(row?.asked || 0) !== 1) {
      continue
    }

    const questionKey =
      readQuestionKeyFromRationale(row?.rationale || '') || String(row?.symptom_key || '').trim()
    if (questionKey) {
      keys.add(questionKey)
    }
  }

  return Array.from(keys)
}

function resolveLegacyQuestionState(sessionState = {}) {
  return {
    rows: Array.isArray(sessionState.questionRows) ? sessionState.questionRows : [],
    progress: sessionState.questionQueue || null
  }
}

function resolveLegacyOwnershipRows(ownership = null, fallbackRows = []) {
  return Array.isArray(ownership?.questionRows) ? ownership.questionRows : fallbackRows
}

function resolveLegacyQuestionKeysForValidation({
  answerRound = 1,
  sessionState = {},
  rows = []
} = {}) {
  if (Number(answerRound || 1) === Number(sessionState?.questionQueue?.roundIndex || 0)) {
    return pickQuestionKeysFromQuestionQueue(sessionState.questionQueue)
  }

  return new Set(
    (Array.isArray(rows) ? rows : [])
      .filter(row => {
        const normalizedRound = Number(readRoundFromRationale(row?.rationale || '') || 1)
        const asked = Number(row?.asked || 0) === 0
        const questionKey =
          readQuestionKeyFromRationale(row?.rationale || '') ||
          String(row?.symptom_key || '').trim()
        return normalizedRound === Number(answerRound || 1) && asked && questionKey
      })
      .map(
        row =>
          readQuestionKeyFromRationale(row?.rationale || '') ||
          String(row?.symptom_key || '').trim()
      )
  )
}

module.exports = {
  resolveLegacyQuestionState,
  resolveLegacyOwnershipRows,
  collectAnsweredLegacyQuestionKeys,
  resolveLegacyQuestionKeysForValidation,
  buildAskedLegacyQuestionRows
}
