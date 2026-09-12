'use strict'

const { fromOptionId } = require('../mappers/public-id-mapper')

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
        item?.packageTopic ||
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

function buildPackageAnswerOptionMappings(questionPackageSnapshot = null) {
  const packageQuestions = Array.isArray(questionPackageSnapshot?.packageQuestions)
    ? questionPackageSnapshot.packageQuestions
    : []
  const mappings = []

  for (const question of packageQuestions) {
    const questionKey = normalizeText(question?.questionKey)
    if (!questionKey) {
      continue
    }

    if (normalizeText(question?.uiVariant) === 'care_behavior_timeline') {
      mappings.push({
        questionKey,
        optionKey: 'care_behavior_timeline',
        text: '养护记录已提供',
        optionTextUserCn: '养护记录已提供',
        value: 0,
        associationStrength: 0
      })
    }

    const questionOptions = Array.isArray(question?.options) ? question.options : []
    for (const option of questionOptions) {
      const optionKey = normalizeOptionKey(
        option?.optionKey || fromOptionId(option?.optionId || '') || option?.optionId || ''
      )
      if (!optionKey) {
        continue
      }
      mappings.push({
        questionKey,
        optionKey,
        text: normalizeText(option?.text || option?.label || option?.optionText || ''),
        optionTextUserCn: normalizeText(
          option?.optionTextUserCn || option?.text || option?.label || option?.optionText || ''
        ),
        value: optionKey === 'unknown' ? 0 : 1,
        associationStrength: optionKey === 'unknown' ? 0 : 1
      })
    }
  }

  return mappings
}

function mergePackageAnswerOptionMappings(storeMappings = [], snapshotMappings = []) {
  const result = new Map()
  for (const item of [...snapshotMappings, ...storeMappings]) {
    const questionKey = normalizeText(item?.questionKey)
    const optionKey = normalizeOptionKey(item?.optionKey)
    if (!questionKey || !optionKey) {
      continue
    }
    result.set(`${questionKey}::${optionKey}`, {
      ...item,
      questionKey,
      optionKey
    })
  }
  return Array.from(result.values())
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
  const allowedOptionPairs = new Set(
    buildPackageAnswerOptionMappings(questionPackageSnapshot).map(
      item => `${item.questionKey}::${item.optionKey}`
    )
  )
  const invalidOptionPairs = (Array.isArray(answers) ? answers : [])
    .map(item => {
      const questionKey = normalizeText(item?.questionKey)
      const optionKey = normalizeOptionKey(item?.optionKey)
      return questionKey && optionKey ? `${questionKey}::${optionKey}` : ''
    })
    .filter(pair => pair && !allowedOptionPairs.has(pair))

  return {
    ok:
      answerQuestionKeys.length > 0 &&
      invalidQuestionKeys.length === 0 &&
      invalidOptionPairs.length === 0,
    invalidQuestionKeys,
    invalidOptionPairs
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
          packageTopic: normalizeText(item?.packageTopic),
          questionGroupKey: resolveQuestionGroupKey(item),
          packageSection: normalizeText(item?.packageSection),
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
  buildPackageAnswerOptionMappings,
  mergePackageAnswerOptionMappings,
  buildPackageAnswerRuntime,
  _test: {
    resolveAnswerStatus
  }
}
