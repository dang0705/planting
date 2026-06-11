'use strict'

const { prepareAnswerRevision, getSessionState } = require('../services/session-service')
const { buildAskedSessionQuestionRows } = require('./session-question-row-runtime')
const { resolveNextAnswerRevision } = require('./request-normalizers')

async function applyAnswerRevisionRuntime({
  sessionId,
  openid,
  sessionState,
  payload,
  answers,
  dirtyQuestionKey,
  optionMappings,
  sessionQuestionRows,
  expectedRound: _expectedRound
} = {}) {
  const nextAnswerRevision = resolveNextAnswerRevision(sessionState, payload.baseAnswerRevision)
  const answerRevisionBefore = Math.max(
    Number(sessionState?.runtimeSnapshot?.answerRevision || 0),
    Number(payload.baseAnswerRevision || 0)
  )
  const revision = await prepareAnswerRevision({
    sessionId,
    openid,
    answers,
    dirtyQuestionKey,
    optionMappings,
    questionRows: sessionQuestionRows,
    answerRevisionBefore,
    answerRevisionAfter: nextAnswerRevision
  })
  if (!revision.ok) {
    throw Object.assign(new Error('改写题目不属于当前会话'), { statusCode: 400 })
  }

  const refreshedSessionState = await getSessionState(openid, sessionId)
  if (!refreshedSessionState) {
    throw Object.assign(new Error('诊断会话不存在或已失效'), { statusCode: 404 })
  }

  const sessionQuestionRowsForRound = Array.isArray(refreshedSessionState.questionRows)
    ? refreshedSessionState.questionRows
    : sessionQuestionRows

  return {
    answerRevision: nextAnswerRevision,
    uiPatch: {
      keepUntilQuestionId: revision.keepUntilQuestionId,
      invalidatedFromQuestionId: revision.invalidatedFromQuestionId
    },
    refreshedSessionState,
    runtimeAnswers:
      Array.isArray(refreshedSessionState.answeredAnswers) &&
      refreshedSessionState.answeredAnswers.length
        ? refreshedSessionState.answeredAnswers
        : answers,
    runtimeObservedEvidenceSet: refreshedSessionState.observedEvidenceSet || [],
    runtimeAskedQuestionKeys: refreshedSessionState.askedQuestionKeys,
    runtimeAnsweredQuestionGroupKeys: refreshedSessionState.answeredQuestionGroupKeys || [],
    runtimeUnknownCountByGroup: refreshedSessionState.unknownCountByGroup,
    sessionQuestionRowsForRound,
    runtimeAskedQuestionRows: buildAskedSessionQuestionRows(sessionQuestionRowsForRound)
  }
}

module.exports = {
  applyAnswerRevisionRuntime
}
