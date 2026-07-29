'use strict'

const { buildPackageAnswerRuntime } = require('./package-answer-ownership-runtime')

function buildRuntimeAnswersFromPackageUpdates(previousAnswers = [], packageAnswerUpdates = []) {
  const answerMap = new Map()

  for (const item of Array.isArray(previousAnswers) ? previousAnswers : []) {
    const questionKey = String(item?.questionKey || '').trim()
    if (!questionKey) {
      continue
    }
    answerMap.set(questionKey, {
      questionKey,
      optionKey: String(item?.optionKey || '').trim()
    })
  }

  for (const item of Array.isArray(packageAnswerUpdates) ? packageAnswerUpdates : []) {
    const questionKey = String(item?.questionKey || '').trim()
    const optionKey = String(item?.optionKey || '').trim()
    if (!questionKey || !optionKey) {
      continue
    }
    answerMap.set(questionKey, {
      questionKey,
      optionKey: optionKey.toLowerCase()
    })
  }

  return Array.from(answerMap.values())
}

function buildPackageUnknownCountByGroup(
  previousUnknownCountByGroup = {},
  packageAnswerUpdates = []
) {
  const nextUnknownCountByGroup = {
    ...previousUnknownCountByGroup
  }

  for (const item of Array.isArray(packageAnswerUpdates) ? packageAnswerUpdates : []) {
    const groupKey = String(item?.questionGroupKey || '__default__').trim() || '__default__'
    const status = String(item?.status || '')
      .trim()
      .toLowerCase()
    if (groupKey === '__default__') {
      continue
    }
    nextUnknownCountByGroup[groupKey] =
      status === 'skipped' ? Number(nextUnknownCountByGroup[groupKey] || 0) + 1 : 0
  }

  return nextUnknownCountByGroup
}

function mergeAnswerRuntimeState({
  sessionState = {},
  updatedAnswers = [],
  askedQuestionRows = null
} = {}) {
  const runtimeAnswers = buildRuntimeAnswersFromPackageUpdates(
    sessionState.answeredAnswers || [],
    updatedAnswers
  )
  const runtimeAskedQuestionKeys = Array.from(
    new Set([
      ...(Array.isArray(sessionState.askedQuestionKeys) ? sessionState.askedQuestionKeys : []),
      ...updatedAnswers.map(item => String(item?.questionKey || '').trim()).filter(Boolean)
    ])
  )
  const runtimeAnsweredQuestionGroupKeys = Array.from(
    new Set([
      ...(Array.isArray(sessionState.answeredQuestionGroupKeys)
        ? sessionState.answeredQuestionGroupKeys
        : []),
      ...updatedAnswers
        .map(item => String(item?.questionGroupKey || '').trim())
        .filter(item => item && item !== '__default__')
    ])
  )
  const runtimeUnknownCountByGroup = buildPackageUnknownCountByGroup(
    sessionState.unknownCountByGroup,
    updatedAnswers
  )

  return {
    runtimeAnswers,
    runtimeAskedQuestionKeys,
    runtimeAnsweredQuestionGroupKeys,
    runtimeUnknownCountByGroup,
    ...(Array.isArray(askedQuestionRows) ? { runtimeAskedQuestionRows: askedQuestionRows } : {})
  }
}

function buildPackageAnswerRuntimeState({
  sessionState = {},
  questionPackageSnapshot = null,
  answers = [],
  optionMappings = []
} = {}) {
  const packageRuntime = buildPackageAnswerRuntime({
    questionPackageSnapshot,
    answers,
    optionMappings
  })
  return mergeAnswerRuntimeState({
    sessionState,
    updatedAnswers: packageRuntime.updatedAnswers,
    askedQuestionRows: packageRuntime.askedQuestionRows
  })
}

module.exports = {
  mergeAnswerRuntimeState,
  buildPackageAnswerRuntimeState,
  _test: {
    buildRuntimeAnswersFromPackageUpdates,
    buildPackageUnknownCountByGroup
  }
}
