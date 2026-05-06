'use strict'

const {
  getQueueBySessionAndRound,
  replaceQueueForRound
} = require('../repositories/question-queue-repository')
const {
  applyAnsweredQuestionKeys,
  invalidateQuestionQueue
} = require('../domain/question-queue/question-queue-invalidator')

async function markQueueItemsAnswered(
  sessionId = '',
  openid = '',
  round = 1,
  answers = [],
  { questionQueue = null } = {}
) {
  const normalizedRound = Number(round || 1)
  if (normalizedRound < 1) {
    return null
  }

  const normalizedQuestionQueueRound = Number(questionQueue?.roundIndex || 0)
  const canUseProvidedQueue = normalizedQuestionQueueRound === normalizedRound && questionQueue?.questionQueueId
  const persistedQueue = canUseProvidedQueue
    ? questionQueue
    : await getQueueBySessionAndRound(sessionId, normalizedRound)

  if (!persistedQueue) {
    return null
  }

  const nextQueue = applyAnsweredQuestionKeys(persistedQueue, answers)
  await replaceQueueForRound({
    sessionId,
    openid: openid || questionQueue.openid || '',
    questionQueue: nextQueue
  })
  return nextQueue
}

async function invalidateQueueForRound(
  sessionId = '',
  openid = '',
  round = 1,
  reason = 'stale',
  { questionQueue = null } = {}
) {
  const normalizedRound = Number(round || 1)
  if (normalizedRound < 1) {
    return null
  }

  const normalizedQuestionQueueRound = Number(questionQueue?.roundIndex || 0)
  const canUseProvidedQueue = normalizedQuestionQueueRound === normalizedRound && questionQueue?.questionQueueId
  const persistedQueue = canUseProvidedQueue
    ? questionQueue
    : await getQueueBySessionAndRound(sessionId, normalizedRound)
  if (!persistedQueue) {
    return null
  }

  const nextQueue = invalidateQuestionQueue(persistedQueue, reason)
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
