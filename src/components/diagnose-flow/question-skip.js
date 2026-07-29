export function resolveRiskSkipAction({ activeQuestionIndex = 0, questionStackLength = 0 } = {}) {
  const currentIndex = Math.max(0, Number(activeQuestionIndex || 0))
  const total = Math.max(0, Number(questionStackLength || 0))
  const isLastQuestion = total <= 1 || currentIndex >= total - 1
  return {
    answerValue: 'unknown',
    shouldAdvance: !isLastQuestion,
    shouldSubmit: isLastQuestion
  }
}
