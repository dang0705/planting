/* oxlint-disable no-unused-vars, no-magic-numbers */

// 从 question-flow.js 提取的问诊状态合并逻辑。
// 保持 mergeQuestionState 的现有行为和调用契约不变。

export function mergeQuestionStateFactory(ctx) {
  const {
    questionStack,
    questionAnswers,
    careBehaviorTimelineByQuestionId,
    committedQuestionAnswers,
    dirtyQuestionFromIndex,
    questionAnswerRevision,
    activeQuestionIndex,
    expandedQuestionOptionByQuestion,
    getQuestionId,
    createQuestionAnswerMap,
    buildCareBehaviorTimelineByQuestionIdMap,
    refreshEnvironmentWeatherWindowForCareBehavior,
    findQuestionIndex
  } = ctx

  return function mergeQuestionState(nextResult = null, submittedPayload = null) {
    const nextQuestions = Array.isArray(nextResult?.questions)
      ? nextResult.questions.filter(item => getQuestionId(item))
      : []
    const submittedAnswers = Array.isArray(submittedPayload?.answers)
      ? submittedPayload.answers
      : []
    const submittedAnswerMap = submittedAnswers.reduce((entries, item) => {
      const questionId = getQuestionId(item)
      const optionId = String(item?.optionKey || item?.optionId || '').trim()
      if (questionId && optionId) {
        entries[questionId] = {
          optionId,
          answerRevision: Number(
            nextResult?.answerRevision || submittedPayload?.baseAnswerRevision || 0
          )
        }
      }
      return entries
    }, {})

    const dirtyIndex = dirtyQuestionFromIndex.value
    const patchKeepUntilQuestionId = String(nextResult?.uiPatch?.keepUntilQuestionId || '').trim()
    const patchKeepIndex = patchKeepUntilQuestionId
      ? findQuestionIndex(patchKeepUntilQuestionId)
      : -1
    const keepEndIndex =
      patchKeepIndex >= 0
        ? patchKeepIndex
        : dirtyIndex >= 0
          ? dirtyIndex
          : questionStack.value.length - 1
    const keptQuestions = questionStack.value.slice(0, Math.max(0, keepEndIndex + 1))
    const keptQuestionIds = new Set(keptQuestions.map(item => getQuestionId(item)).filter(Boolean))
    const appendQuestions = nextQuestions.filter(item => !keptQuestionIds.has(getQuestionId(item)))
    const nextStack = nextResult?.hasActiveQuestions ? [...keptQuestions, ...appendQuestions] : []
    const nextStackQuestionIds = new Set(nextStack.map(item => getQuestionId(item)).filter(Boolean))

    questionStack.value = nextStack
    questionAnswers.value = {
      ...Object.fromEntries(
        Object.entries(questionAnswers.value || {}).filter(([questionId]) =>
          nextStackQuestionIds.has(questionId)
        )
      ),
      ...createQuestionAnswerMap(appendQuestions)
    }
    careBehaviorTimelineByQuestionId.value = {
      ...Object.fromEntries(
        Object.entries(careBehaviorTimelineByQuestionId.value || {}).filter(([questionId]) =>
          nextStackQuestionIds.has(questionId)
        )
      ),
      ...buildCareBehaviorTimelineByQuestionIdMap(nextStack)
    }
    committedQuestionAnswers.value = {
      ...Object.fromEntries(
        Object.entries(committedQuestionAnswers.value || {}).filter(([questionId]) =>
          nextStackQuestionIds.has(questionId)
        )
      ),
      ...Object.fromEntries(
        Object.entries(submittedAnswerMap).filter(([questionId]) =>
          nextStackQuestionIds.has(questionId)
        )
      )
    }
    dirtyQuestionFromIndex.value = -1
    questionAnswerRevision.value = Number(
      nextResult?.answerRevision || questionAnswerRevision.value || 0
    )
    activeQuestionIndex.value = nextStack.length ? nextStack.length - 1 : 0
    expandedQuestionOptionByQuestion.value = {}
    refreshEnvironmentWeatherWindowForCareBehavior(nextStack)
  }
}
