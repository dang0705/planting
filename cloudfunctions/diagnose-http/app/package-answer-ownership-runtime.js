'use strict'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeOptionKey(value = '') {
  return normalizeText(value).toLowerCase()
}

function resolveQuestionPackageSnapshot(sessionState = {}) {
  const snapshot = sessionState?.runtimeSnapshot?.questionPackageSnapshot
  if (!snapshot || typeof snapshot !== 'object') {
    return null
  }
  const packageQuestions = Array.isArray(snapshot.packageQuestions) ? snapshot.packageQuestions : []
  if (!packageQuestions.length) {
    return null
  }
  return {
    ...snapshot,
    packageQuestions
  }
}

function resolveQuestionGroupKey(item = {}) {
  return (
    normalizeText(
      item?.questionGroupKey ||
        item?.question_group_key ||
        item?.groupKey ||
        item?.targetDimension ||
        item?.targetSymptomKey ||
        '__default__'
    ) || '__default__'
  )
}

function buildOptionMetaByQuestionOption(optionMappings = []) {
  const result = new Map()
  for (const option of Array.isArray(optionMappings) ? optionMappings : []) {
    const questionKey = normalizeText(option?.questionKey)
    const optionKey = normalizeOptionKey(option?.optionKey)
    if (!questionKey || !optionKey) {
      continue
    }
    result.set(`${questionKey}::${optionKey}`, option)
  }
  return result
}

function resolveAnswerStatus(optionKey = '', optionMeta = {}) {
  const optionValue = Number(optionMeta?.value || 0)
  const associationStrength = Number(optionMeta?.associationStrength || 0)
  const isUnknownOption =
    optionKey === 'unknown' ||
    (optionValue === 0 &&
      associationStrength === 0 &&
      /unknown|不确定|看不出/i.test(
        String(optionMeta?.text || optionMeta?.optionTextUserCn || optionMeta?.optionTextCn || '')
      ))

  return {
    answerConfidence: isUnknownOption ? 0 : Math.max(0, associationStrength || 1),
    status: isUnknownOption
      ? 'skipped'
      : optionValue > 0
        ? 'confirmed'
        : optionValue < 0
          ? 'rejected'
          : 'answered'
  }
}

function resolvePackageAnswerOwnership({ questionPackageSnapshot = null, answers = [] } = {}) {
  const packageQuestions = Array.isArray(questionPackageSnapshot?.packageQuestions)
    ? questionPackageSnapshot.packageQuestions
    : []
  const allowedQuestionKeys = new Set(
    packageQuestions.map(item => normalizeText(item?.questionKey)).filter(Boolean)
  )
  const answerQuestionKeys = (Array.isArray(answers) ? answers : [])
    .map(item => normalizeText(item?.questionKey))
    .filter(Boolean)
  const invalidQuestionKeys = answerQuestionKeys.filter(key => !allowedQuestionKeys.has(key))

  return {
    ok: answerQuestionKeys.length > 0 && invalidQuestionKeys.length === 0,
    invalidQuestionKeys
  }
}

function buildPackageAnswerRuntime({
  questionPackageSnapshot = null,
  answers = [],
  optionMappings = []
} = {}) {
  const packageQuestions = Array.isArray(questionPackageSnapshot?.packageQuestions)
    ? questionPackageSnapshot.packageQuestions
    : []
  const packageQuestionByKey = new Map()
  for (const item of packageQuestions) {
    const questionKey = normalizeText(item?.questionKey)
    if (questionKey && !packageQuestionByKey.has(questionKey)) {
      packageQuestionByKey.set(questionKey, item)
    }
  }

  const optionMetaByQuestionOption = buildOptionMetaByQuestionOption(optionMappings)
  const updatedAnswers = []
  for (const answer of Array.isArray(answers) ? answers : []) {
    const questionKey = normalizeText(answer?.questionKey)
    const optionKey = normalizeOptionKey(answer?.optionKey)
    const packageQuestion = packageQuestionByKey.get(questionKey)
    if (!questionKey || !optionKey || !packageQuestion) {
      continue
    }

    const optionMeta = optionMetaByQuestionOption.get(`${questionKey}::${optionKey}`) || {}
    const { answerConfidence, status } = resolveAnswerStatus(optionKey, optionMeta)
    updatedAnswers.push({
      questionKey,
      optionKey,
      answerValue: optionKey || 'unknown',
      answerConfidence,
      status,
      questionGroupKey: resolveQuestionGroupKey(packageQuestion)
    })
  }

  return {
    updatedAnswers,
    askedQuestionRows: packageQuestions
      .map(item => {
        const questionKey = normalizeText(item?.questionKey)
        return {
          questionKey,
          targetSymptomKey: normalizeText(item?.targetSymptomKey),
          targetDimension: normalizeText(item?.targetDimension),
          questionGroupKey: resolveQuestionGroupKey(item),
          routingScope: normalizeText(item?.routingScope),
          questionText: normalizeText(item?.questionText || item?.text),
          questionTextUserCn: normalizeText(
            item?.questionTextUserCn || item?.questionText || item?.text
          ),
          questionTextCn: normalizeText(item?.questionTextCn || item?.questionText || item?.text),
          status: 'answered',
          optionKey: ''
        }
      })
      .filter(item => item.questionKey)
  }
}

module.exports = {
  resolveQuestionPackageSnapshot,
  resolvePackageAnswerOwnership,
  buildPackageAnswerRuntime,
  _test: {
    resolveAnswerStatus
  }
}
