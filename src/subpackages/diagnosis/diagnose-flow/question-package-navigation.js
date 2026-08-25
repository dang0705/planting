export function shouldNavigateQuestionPackage(questionPackage = null) {
  return Boolean(questionPackage)
}

export function shouldNavigateDiagnosisResult(result = null) {
  return Boolean(
    result?.hasActiveQuestions && shouldNavigateQuestionPackage(result?.questionPackage)
  )
}
