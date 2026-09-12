'use strict'

const {
  getQuestionPackageByMode,
  buildQuestionPackageUiHints
} = require('./question-package-response')

function attachTerminalQuestionPackage({
  roundResult = {},
  payload = {},
  questionPackageSnapshot = null,
  isTerminalQuestionPackageSubmit = false
} = {}) {
  if (!isTerminalQuestionPackageSubmit) {
    return
  }
  const terminalQuestionPackage =
    payload.questionPackage ||
    questionPackageSnapshot?.questionPackage ||
    getQuestionPackageByMode(questionPackageSnapshot?.mode || '', {
      questionCount: Array.isArray(questionPackageSnapshot?.packageQuestions)
        ? questionPackageSnapshot.packageQuestions.length
        : 0,
      sourceMode: questionPackageSnapshot?.sourceMode || ''
    }) ||
    null
  if (!terminalQuestionPackage) {
    return
  }
  roundResult.questionPackage = terminalQuestionPackage
  roundResult.uiHints = buildQuestionPackageUiHints(
    roundResult.uiHints || {},
    terminalQuestionPackage,
    Number(terminalQuestionPackage.questionCount || 0)
  )
}

module.exports = {
  attachTerminalQuestionPackage
}
