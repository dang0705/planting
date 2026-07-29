export function useDiagnoseQuestionRisk(ctx) {
  const { riskConsentByQuestionId, getQuestionId } = ctx

  function hasQuestionRiskConsent(question) {
    const questionId = getQuestionId(question)
    if (!questionId || !question?.requiresExplicitConsent) {
      return true
    }
    return Boolean(riskConsentByQuestionId.value[questionId])
  }

  function confirmQuestionRisk(question) {
    const questionId = getQuestionId(question)
    if (!questionId) {
      return
    }
    riskConsentByQuestionId.value = {
      ...riskConsentByQuestionId.value,
      [questionId]: true
    }
  }

  function isUnknownOption(option = {}) {
    return String(option?.optionId || option?.optionKey || '').trim() === 'unknown'
  }

  function isQuestionRiskOptionBlocked(question, option) {
    return Boolean(
      question?.requiresExplicitConsent &&
      !hasQuestionRiskConsent(question) &&
      !isUnknownOption(option)
    )
  }

  return {
    hasQuestionRiskConsent,
    confirmQuestionRisk,
    isQuestionRiskOptionBlocked
  }
}
