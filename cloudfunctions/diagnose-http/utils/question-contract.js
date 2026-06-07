'use strict'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function collectQueuedQuestionKeys(questionQueue = null) {
  if (!questionQueue || typeof questionQueue !== 'object') {
    return new Set()
  }

  return new Set(
    (Array.isArray(questionQueue?.questionItems) ? questionQueue.questionItems : [])
      .map(item => normalizeText(item?.questionKey))
      .filter(Boolean)
  )
}

function filterQuestionsByQuestionQueue(
  questions = [],
  questionQueue = null,
  { requireQueueAnchor = false } = {}
) {
  const list = Array.isArray(questions) ? questions : []
  const queuedQuestionKeys = collectQueuedQuestionKeys(questionQueue)

  if (!queuedQuestionKeys.size) {
    if (requireQueueAnchor) {
      return []
    }
    return list
      .map(item => ({
        ...item,
        questionKey: normalizeText(item?.questionKey),
        targetSymptomKey: normalizeText(item?.targetSymptomKey)
      }))
      .filter(item => Boolean(item.questionKey))
  }

  return list
    .map(item => ({
      ...item,
      questionKey: normalizeText(item?.questionKey),
      targetSymptomKey: normalizeText(item?.targetSymptomKey)
    }))
    .filter(item => item.questionKey && queuedQuestionKeys.has(item.questionKey))
}

module.exports = {
  collectQueuedQuestionKeys,
  filterQuestionsByQuestionQueue
}
