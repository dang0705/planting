'use strict'

const {
  getQueueBySessionAndRound,
  replaceQueueForRound
} = require('../repositories/question-queue-repository')
const {
  applyAnsweredQuestionKeys,
  invalidateQuestionQueue
} = require('../domain/question-queue/question-queue-invalidator')

async function markQueueItemsAnswered(sessionId = '', openid = '', round = 1, answers = []) {
  const questionQueue = await getQueueBySessionAndRound(sessionId, round)
  if (!questionQueue) {
    return null
  }

  const nextQueue = applyAnsweredQuestionKeys(questionQueue, answers)
  await replaceQueueForRound({
    sessionId,
    openid: openid || questionQueue.openid || '',
    questionQueue: nextQueue
  })
  return nextQueue
}

async function invalidateQueueForRound(sessionId = '', openid = '', round = 1, reason = 'stale') {
  const questionQueue = await getQueueBySessionAndRound(sessionId, round)
  if (!questionQueue) {
    return null
  }

  const nextQueue = invalidateQuestionQueue(questionQueue, reason)
  await replaceQueueForRound({
    sessionId,
    openid: openid || questionQueue.openid || '',
    questionQueue: nextQueue
  })
  return nextQueue
}

module.exports = {
  markQueueItemsAnswered,
  invalidateQueueForRound
}
