'use strict'

const { invalidateQueueForRound } = require('../services/question-queue-runtime-service')
const {
  hasConsumedFollowUpRetakeQuota
} = require('../presenters/diagnosis-round-presenter-helpers')

async function prepareLegacyImageInputRuntime({
  sessionId,
  openid,
  answerRound,
  legacyQuestionProgress,
  visualBatchTrace
} = {}) {
  await invalidateQueueForRound(sessionId, openid, answerRound, 'retake_branch', {
    questionQueue:
      Number(answerRound || 1) === Number(legacyQuestionProgress?.roundIndex || 0)
        ? legacyQuestionProgress
        : null
  })
  if (hasConsumedFollowUpRetakeQuota(visualBatchTrace || null)) {
    throw Object.assign(new Error('补图次数已达上限'), { statusCode: 400 })
  }
}

module.exports = {
  prepareLegacyImageInputRuntime
}
