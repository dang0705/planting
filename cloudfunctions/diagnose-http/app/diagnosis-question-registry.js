'use strict'

const { toOptionId } = require('../mappers/public-id-mapper')

const WATERING_FREQUENCY_CONTEXT_TOPIC = 'watering_frequency_context'
const WATERING_FREQUENCY_CONTEXT_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__watering_frequency_context'

const REGISTERED_QUESTION_KEY_BY_TOPIC = Object.freeze({
  [WATERING_FREQUENCY_CONTEXT_TOPIC]: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY
})

const REGISTERED_RUNTIME_METADATA_BY_TOPIC = Object.freeze({
  [WATERING_FREQUENCY_CONTEXT_TOPIC]: Object.freeze({
    packageTopic: WATERING_FREQUENCY_CONTEXT_TOPIC,
    packageSection: 'route_package',
    routePackageRole: 'route_package_water_behavior',
    packageEffect: 'route_outcome',
    defaultOptionKey: 'care_behavior_timeline',
    uiVariant: 'care_behavior_timeline',
    renderMode: 'care_behavior_timeline'
  })
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function resolveRegisteredQuestionKey(packageTopic = '') {
  return REGISTERED_QUESTION_KEY_BY_TOPIC[normalizeText(packageTopic)] || ''
}

function isRegisteredPackageQuestionTopic(packageTopic = '') {
  return Boolean(resolveRegisteredQuestionKey(packageTopic))
}

function resolveRuntimeMetadata(packageTopic = '') {
  return REGISTERED_RUNTIME_METADATA_BY_TOPIC[normalizeText(packageTopic)] || {}
}

function assertRepository(repository = {}) {
  if (
    !repository ||
    typeof repository.getQuestionsByKeys !== 'function' ||
    typeof repository.getQuestionOptionMappings !== 'function'
  ) {
    throw Object.assign(new Error('题包问题数据库仓储不可用'), { statusCode: 500 })
  }
}

function getDefaultQuestionRepository() {
  return require('../repositories/question-repository')
}

function buildMissingQuestionError(questionKey = '') {
  return Object.assign(new Error(`题包问题缺少数据库题目定义: ${questionKey}`), {
    statusCode: 500
  })
}

function buildMissingOptionsError(questionKey = '') {
  return Object.assign(new Error(`题包问题缺少数据库选项定义: ${questionKey}`), {
    statusCode: 500
  })
}

function mapDbOptionsToPackageOptions(options = []) {
  return (Array.isArray(options) ? options : []).map(option => {
    const optionKey = normalizeText(option?.optionKey)
    return {
      optionId: normalizeText(option?.optionId) || optionKey || toOptionId(optionKey),
      optionKey,
      text: normalizeText(option?.optionTextUserCn || option?.optionTextCn || option?.text),
      description: normalizeText(option?.optionDescriptionUserCn || option?.description),
      isDefault: Boolean(option?.isDefault)
    }
  }).filter(option => option.optionKey && option.text)
}

function mapDbQuestionToPackageQuestion({
  question,
  options,
  selectionSource = 'data_repository_question_package',
  routeKey = '',
  targetSymptomKey = '',
  runtimeMetadata = {}
} = {}) {
  const questionKey = normalizeText(question?.questionKey)
  const defaultOptionKey = normalizeText(
    runtimeMetadata.defaultOptionKey || question?.defaultOptionKey || options.find(option => option.isDefault)?.optionKey
  )
  const text = normalizeText(question?.questionTextUserCn || question?.questionTextCn)
  const helpText = normalizeText(question?.helpTextCn)
  const mappedOptions = options.map(option => ({
    ...option,
    isDefault: Boolean(option?.isDefault || option?.optionKey === defaultOptionKey)
  }))

  return {
    questionKey,
    selectionSource,
    routeKey: normalizeText(routeKey),
    conditionKey: '',
    outcomeKey: '',
    targetSymptomKey: normalizeText(targetSymptomKey || question?.targetSymptomKey),
    questionGroupKey: normalizeText(question?.questionGroupKey || runtimeMetadata.packageTopic),
    packageTopic: normalizeText(runtimeMetadata.packageTopic || question?.packageTopic),
    packageSection: normalizeText(runtimeMetadata.packageSection || question?.packageSection),
    defaultOptionKey,
    defaultOptionId: defaultOptionKey,
    uiVariant: normalizeText(runtimeMetadata.uiVariant || question?.uiVariant),
    renderMode: normalizeText(runtimeMetadata.renderMode || question?.renderMode),
    routePackageRole: normalizeText(runtimeMetadata.routePackageRole || question?.routePackageRole),
    packageEffect: normalizeText(runtimeMetadata.packageEffect || question?.packageEffect),
    type: normalizeText(question?.questionType) || 'single_choice',
    text,
    questionText: text,
    helpText,
    options: mappedOptions,
    whyThisQuestion: normalizeText(question?.whyThisQuestionCn)
  }
}

async function loadRegisteredPackageQuestion({
  packageTopic = '',
  repository = null,
  selectionSource = 'data_repository_question_package',
  routeKey = '',
  targetSymptomKey = ''
} = {}) {
  const questionKey = resolveRegisteredQuestionKey(packageTopic)
  if (!questionKey) {return null}
  const runtimeMetadata = resolveRuntimeMetadata(packageTopic)
  const resolvedRepository = repository || getDefaultQuestionRepository()
  assertRepository(resolvedRepository)

  const [questions, optionRows] = await Promise.all([
    resolvedRepository.getQuestionsByKeys([questionKey]),
    resolvedRepository.getQuestionOptionMappings([questionKey])
  ])
  const question = (Array.isArray(questions) ? questions : [])
    .find(item => normalizeText(item?.questionKey) === questionKey)
  if (!question) {
    throw buildMissingQuestionError(questionKey)
  }

  const options = mapDbOptionsToPackageOptions(
    (Array.isArray(optionRows) ? optionRows : [])
      .filter(item => normalizeText(item?.questionKey) === questionKey)
  )
  if (!options.length) {
    throw buildMissingOptionsError(questionKey)
  }

  return mapDbQuestionToPackageQuestion({
    question,
    options,
    selectionSource,
    routeKey,
    targetSymptomKey,
    runtimeMetadata
  })
}

module.exports = {
  WATERING_FREQUENCY_CONTEXT_TOPIC,
  WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
  isRegisteredPackageQuestionTopic,
  loadRegisteredPackageQuestion,
  resolveRegisteredQuestionKey,
  resolveRuntimeMetadata,
  _test: {
    mapDbQuestionToPackageQuestion,
    mapDbOptionsToPackageOptions
  }
}
