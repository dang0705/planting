'use strict'

const {
  readQuestionKeyFromRationale,
  readRoundFromRationale
} = require('../services/session-question-service')
const {
  buildAskedQuestionRowsFromQuestionRows: buildAskedSessionQuestionRows
} = require('./request-normalizers')

function collectAnsweredSessionQuestionKeys(rows = []) {
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

function resolveSessionQuestionState(sessionState = {}) {
  return {
    rows: Array.isArray(sessionState.questionRows) ? sessionState.questionRows : [],
    progress: null
  }
}

function resolveSessionOwnershipRows(ownership = null, conservativeRows = []) {
  return Array.isArray(ownership?.questionRows) ? ownership.questionRows : conservativeRows
}

function resolveSessionQuestionKeysForValidation({
  answerRound = 1,
  sessionState: _sessionState = {},
  rows = []
} = {}) {
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
  resolveSessionQuestionState,
  resolveSessionOwnershipRows,
  collectAnsweredSessionQuestionKeys,
  resolveSessionQuestionKeysForValidation,
  buildAskedSessionQuestionRows
}
