'use strict'

function normalizeText(value = '', fallback = '') {
  return String(value || '').trim()
    || String(fallback || '').trim()
}

function cloneQuestionQueue(questionQueue = {}) {
  return {
    ...questionQueue,
    queueDecision: questionQueue?.queueDecision && typeof questionQueue.queueDecision === 'object'
      ? { ...questionQueue.queueDecision }
      : {
          hasActionableItems: 0,
          exhaustedReason: '',
          serviceTarget: ''
        },
    questionItems: Array.isArray(questionQueue?.questionItems)
      ? questionQueue.questionItems.map(item => ({
          ...item,
          appliesWhen: item?.appliesWhen && typeof item.appliesWhen === 'object'
            ? { ...item.appliesWhen }
            : {}
        }))
      : []
  }
}

function summarizeQuestionQueue(questionQueue = {}) {
  const items = Array.isArray(questionQueue?.questionItems) ? questionQueue.questionItems : []
  const activeItemCount = items.filter(item => !item?.invalidated && !item?.answered).length
  const askedItemCount = items.filter(item => item?.asked).length
  const answeredItemCount = items.filter(item => item?.answered).length
  const invalidatedItemCount = items.filter(item => item?.invalidated).length

  return {
    activeItemCount,
    askedItemCount,
    answeredItemCount,
    invalidatedItemCount
  }
}

function applyAnsweredQuestionKeys(questionQueue = {}, answers = []) {
  const nextQueue = cloneQuestionQueue(questionQueue)
  const answeredKeys = new Set(
    (Array.isArray(answers) ? answers : [])
      .map(item => normalizeText(item?.questionKey || item?.question_key || item))
      .filter(Boolean)
  )

  if (!answeredKeys.size) {
    return nextQueue
  }

  nextQueue.questionItems = nextQueue.questionItems.map(item => {
    const questionKey = normalizeText(item?.questionKey)
    if (!questionKey || !answeredKeys.has(questionKey)) {
      return item
    }

    return {
      ...item,
      asked: true,
      answered: true,
      invalidated: false,
      invalidReason: '',
      status: 'answered'
    }
  })

  const summary = summarizeQuestionQueue(nextQueue)
  nextQueue.activeItemCount = summary.activeItemCount
  nextQueue.askedItemCount = summary.askedItemCount
  nextQueue.answeredItemCount = summary.answeredItemCount
  nextQueue.invalidatedItemCount = summary.invalidatedItemCount
  nextQueue.queueStatus = summary.activeItemCount > 0 ? 'active' : 'exhausted'
  nextQueue.queueDecision = {
    ...nextQueue.queueDecision,
    hasActionableItems: summary.activeItemCount > 0 ? 1 : 0,
    exhaustedReason: summary.activeItemCount > 0 ? '' : 'answered_current_round'
  }

  return nextQueue
}

function invalidateQuestionQueue(questionQueue = {}, reason = 'stale') {
  const nextQueue = cloneQuestionQueue(questionQueue)

  nextQueue.questionItems = nextQueue.questionItems.map(item => {
    if (item?.answered || item?.invalidated) {
      return item
    }

    return {
      ...item,
      invalidated: true,
      invalidReason: normalizeText(reason, 'stale'),
      status: 'invalidated'
    }
  })

  const summary = summarizeQuestionQueue(nextQueue)
  nextQueue.activeItemCount = summary.activeItemCount
  nextQueue.askedItemCount = summary.askedItemCount
  nextQueue.answeredItemCount = summary.answeredItemCount
  nextQueue.invalidatedItemCount = summary.invalidatedItemCount
  nextQueue.queueStatus = 'invalidated'
  nextQueue.queueDecision = {
    ...nextQueue.queueDecision,
    hasActionableItems: 0,
    exhaustedReason: normalizeText(reason, 'stale')
  }

  return nextQueue
}

module.exports = {
  summarizeQuestionQueue,
  applyAnsweredQuestionKeys,
  invalidateQuestionQueue
}
