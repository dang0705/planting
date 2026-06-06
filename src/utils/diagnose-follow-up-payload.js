import {
  appendCareBehaviorSidecar,
  isCareBehaviorTimelineQuestion,
  isCareBehaviorWateringTimelineQuestion,
  resolveCareBehaviorTimelineAutoAnswerOptionId,
  shouldIncludeCareBehaviorTimelineQuestion
} from './care-behavior-timeline.js'
import { resolveDefaultFollowUpOptionId } from './diagnose-flow-shared.js'

export function createFollowUpAnswerMap(followUps = []) {
  const entries = {}
  for (const item of followUps || []) {
    if (!item?.questionId) {continue}
    entries[item.questionId] = isCareBehaviorWateringTimelineQuestion(item)
      ? resolveCareBehaviorTimelineAutoAnswerOptionId(item) || ''
      : resolveDefaultFollowUpOptionId(item)
  }
  return entries
}

export function isFollowUpAnswerComplete(followUps = [], answerMap = {}) {
  const activeFollowUps = (followUps || []).filter(item => item?.questionId)
  if (!activeFollowUps.length) {return false}
  return activeFollowUps.every(item => Boolean(answerMap[item.questionId]))
}

export function buildFollowUpPayload(result, answerMap = {}, options = {}) {
  const followUps = Array.isArray(options?.questionStack)
    ? options.questionStack
    : Array.isArray(result?.followUps)
    ? result.followUps
    : Array.isArray(result?.questions)
      ? result.questions
      : []
  const answers = followUps
    .filter(item => item?.questionId && answerMap[item.questionId])
    .map(item => ({
      questionId: item.questionId,
      optionId: answerMap[item.questionId]
    }))

  const sanitizedCareBehaviorTimelineByQuestionId = Object.fromEntries(
    Object.entries(options?.careBehaviorTimelineByQuestionId || {}).filter(([questionId]) => {
      const question = followUps.find(entry => String(entry?.questionId || '').trim() === String(questionId || '').trim())
      const answerId = String(answerMap[questionId] || '').trim()
      if (!question) {
        return true
      }
      return shouldIncludeCareBehaviorTimelineQuestion(question, answerId)
    })
  )
  const excludedQuestionIds = followUps
    .filter(item => {
      const questionId = String(item?.questionId || '').trim()
      if (!questionId) {
        return false
      }
      const answerId = String(answerMap[questionId] || '').trim()
      return isCareBehaviorTimelineQuestion(item) && !shouldIncludeCareBehaviorTimelineQuestion(item, answerId)
    })
    .map(item => String(item?.questionId || '').trim())

  const basePayload = {
    diagnosisSessionId: result?.diagnosisSessionId || '',
    roundId: result?.roundId || '',
    answers,
    requestMode: options?.requestMode || (answers.length > 1 ? 'answer_revision' : 'answer_submit'),
    baseAnswerRevision: Number(options?.baseAnswerRevision || result?.answerRevision || 0),
    dirtyFromQuestionId: String(options?.dirtyFromQuestionId || '').trim(),
    ...(result?.questionPackage && typeof result.questionPackage === 'object'
      ? { questionPackage: result.questionPackage }
      : {}),
    ...(result?.uiHints && typeof result.uiHints === 'object'
      ? { uiHints: result.uiHints }
      : {}),
    ...(options?.environmentWeatherWindow && typeof options.environmentWeatherWindow === 'object'
      ? { environmentWeatherWindow: options.environmentWeatherWindow }
      : {})
  }

  return appendCareBehaviorSidecar(basePayload, {
    questionStack: followUps,
    careBehaviorTimelineByQuestionId: sanitizedCareBehaviorTimelineByQuestionId,
    careBehaviorTimeline: options?.careBehaviorTimeline,
    excludedQuestionIds
  })
}
