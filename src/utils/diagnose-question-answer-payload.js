import {
  appendCareBehaviorSidecar,
  isCareBehaviorTimelineQuestion,
  isCareBehaviorWateringTimelineQuestion,
  resolveCareBehaviorTimelineAutoAnswerOptionId,
  shouldIncludeCareBehaviorTimelineQuestion
} from './care-behavior-timeline.js'
import { resolveDefaultQuestionOptionId } from './diagnose-flow-shared.js'

export function createQuestionAnswerMap(questions = []) {
  const entries = {}
  for (const item of questions || []) {
    if (!item?.questionId) {continue}
    entries[item.questionId] = isCareBehaviorWateringTimelineQuestion(item)
      ? resolveCareBehaviorTimelineAutoAnswerOptionId(item) || ''
      : resolveDefaultQuestionOptionId(item)
  }
  return entries
}

export function isQuestionAnswerComplete(questions = [], answerMap = {}) {
  const activeQuestions = (questions || []).filter(item => item?.questionId)
  if (!activeQuestions.length) {return false}
  return activeQuestions.every(item => Boolean(answerMap[item.questionId]))
}

export function buildQuestionAnswerPayload(result, answerMap = {}, options = {}) {
  const questions = Array.isArray(options?.questionStack)
    ? options.questionStack
    : Array.isArray(result?.questions)
      ? result.questions
      : []
  const answers = questions
    .filter(item => item?.questionId && answerMap[item.questionId])
    .map(item => ({
      questionId: item.questionId,
      optionId: answerMap[item.questionId]
    }))

  const sanitizedCareBehaviorTimelineByQuestionId = Object.fromEntries(
    Object.entries(options?.careBehaviorTimelineByQuestionId || {}).filter(([questionId]) => {
      const question = questions.find(entry => String(entry?.questionId || '').trim() === String(questionId || '').trim())
      const answerId = String(answerMap[questionId] || '').trim()
      if (!question) {
        return true
      }
      return shouldIncludeCareBehaviorTimelineQuestion(question, answerId)
    })
  )
  const excludedQuestionIds = questions
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
    questionStack: questions,
    careBehaviorTimelineByQuestionId: sanitizedCareBehaviorTimelineByQuestionId,
    careBehaviorTimeline: options?.careBehaviorTimeline,
    excludedQuestionIds
  })
}
