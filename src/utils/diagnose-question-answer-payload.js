import {
  appendCareBehaviorSidecar,
  isCareBehaviorTimelineQuestion,
  isCareBehaviorWateringTimelineQuestion,
  resolveCareBehaviorTimelineAutoAnswerOptionId,
  shouldIncludeCareBehaviorTimelineQuestion
} from './care-behavior-timeline.js'
import { resolveDefaultQuestionOptionId } from './diagnose-flow-shared.js'
import { getQuestionIdentity } from './diagnose-question-identity.js'

export function createQuestionAnswerMap(questions = []) {
  const entries = {}
  for (const item of questions || []) {
    const questionId = getQuestionIdentity(item)
    if (!questionId) {
      continue
    }
    entries[questionId] = isCareBehaviorWateringTimelineQuestion(item)
      ? resolveCareBehaviorTimelineAutoAnswerOptionId(item) || ''
      : resolveDefaultQuestionOptionId(item)
  }
  return entries
}

export function isQuestionAnswerComplete(questions = [], answerMap = {}) {
  const activeQuestions = (questions || []).filter(item => getQuestionIdentity(item))
  if (!activeQuestions.length) {
    return false
  }
  return activeQuestions.every(item => Boolean(answerMap[getQuestionIdentity(item)]))
}

export function buildQuestionAnswerPayload(result, answerMap = {}, options = {}) {
  const questions = Array.isArray(options?.questionStack)
    ? options.questionStack
    : Array.isArray(result?.questions)
      ? result.questions
      : []
  const sidecarQuestionStack = questions.map(question => ({
    ...question,
    questionId: getQuestionIdentity(question)
  }))
  const answers = questions
    .filter(item => getQuestionIdentity(item) && answerMap[getQuestionIdentity(item)])
    .map(item => ({
      questionKey: getQuestionIdentity(item),
      optionKey: answerMap[getQuestionIdentity(item)]
    }))

  const sanitizedCareBehaviorTimelineByQuestionId = Object.fromEntries(
    Object.entries(options?.careBehaviorTimelineByQuestionId || {}).filter(([questionId]) => {
      const question = questions.find(
        entry => getQuestionIdentity(entry) === String(questionId || '').trim()
      )
      const answerId = String(answerMap[questionId] || '').trim()
      if (!question) {
        return true
      }
      return shouldIncludeCareBehaviorTimelineQuestion(question, answerId)
    })
  )
  const excludedQuestionIds = questions
    .filter(item => {
      const questionId = getQuestionIdentity(item)
      if (!questionId) {
        return false
      }
      const answerId = String(answerMap[questionId] || '').trim()
      return (
        isCareBehaviorTimelineQuestion(item) &&
        !shouldIncludeCareBehaviorTimelineQuestion(item, answerId)
      )
    })
    .map(item => getQuestionIdentity(item))

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
    ...(result?.uiHints && typeof result.uiHints === 'object' ? { uiHints: result.uiHints } : {}),
    ...(options?.environmentWeatherWindow && typeof options.environmentWeatherWindow === 'object'
      ? { environmentWeatherWindow: options.environmentWeatherWindow }
      : {}),
    ...(options?.lightEnvironmentByQuestionId &&
    typeof options.lightEnvironmentByQuestionId === 'object'
      ? {
          userLightContext:
            Object.values(options.lightEnvironmentByQuestionId).find(Boolean) || null
        }
      : {})
  }

  return appendCareBehaviorSidecar(basePayload, {
    questionStack: sidecarQuestionStack,
    careBehaviorTimelineByQuestionId: sanitizedCareBehaviorTimelineByQuestionId,
    careBehaviorTimeline: options?.careBehaviorTimeline,
    excludedQuestionIds
  })
}
