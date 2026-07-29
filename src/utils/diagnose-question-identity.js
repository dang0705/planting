export function getQuestionIdentity(question = {}) {
  return String(question?.questionKey || question?.questionId || '').trim()
}

export function hasQuestionIdentity(question = {}) {
  return Boolean(getQuestionIdentity(question))
}
