'use strict'

const { prepareAnswerRevision, getSessionState } = require('../services/session-service')
const {
  markQueueItemsAnswered,
  invalidateQueueForRound
} = require('../services/question-queue-runtime-service')
const { buildAskedLegacyQuestionRows } = require('./legacy-question-row-runtime')
const { resolveNextAnswerRevision } = require('./request-normalizers')

async function applyAnswerRevisionRuntime({
  sessionId,
  openid,
  sessionState,
  payload,
  answers,
  dirtyQuestionKey,
  optionMappings,
  legacyQuestionRows,
  expectedRound,
  legacyQuestionProgress
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
    followUpRows: legacyQuestionRows,
    answerRevisionBefore,
    answerRevisionAfter: nextAnswerRevision
  })
  if (!revision.ok) {
    throw Object.assign(new Error('改写题目不属于当前会话'), { statusCode: 400 })
  }

  const invalidationStartRound = Number(revision.dirtyRound || 1)
  const invalidationEndRound = Number(expectedRound || 1)
  const staleRoundCount = Math.max(invalidationEndRound - invalidationStartRound + 1, 0)
  await Promise.all(
    Array.from({ length: staleRoundCount }, (_, index) => {
      const staleRound = invalidationStartRound + index
      return invalidateQueueForRound(sessionId, openid, staleRound, 'answer_revision', {
        questionQueue:
          Number(staleRound || 1) === Number(legacyQuestionProgress?.roundIndex || 0)
            ? legacyQuestionProgress
            : null
      })
    })
  )
  await markQueueItemsAnswered(sessionId, openid, revision.dirtyRound, revision.effectiveAnswers, {
    questionQueue:
      Number(revision.dirtyRound || 1) === Number(legacyQuestionProgress?.roundIndex || 0)
        ? legacyQuestionProgress
        : null
  })

  const refreshedSessionState = await getSessionState(openid, sessionId)
  if (!refreshedSessionState) {
    throw Object.assign(new Error('诊断会话不存在或已失效'), { statusCode: 404 })
  }

  const legacyQuestionRowsForRound = Array.isArray(refreshedSessionState.followUpRows)
    ? refreshedSessionState.followUpRows
    : legacyQuestionRows

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
    legacyQuestionRowsForRound,
    runtimeAskedQuestionRows: buildAskedLegacyQuestionRows(legacyQuestionRowsForRound)
  }
}

module.exports = {
  applyAnswerRevisionRuntime
}
