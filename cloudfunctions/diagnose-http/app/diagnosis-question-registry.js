'use strict'

const { toOptionId, toQuestionId } = require('../mappers/public-id-mapper')

const WATERING_FREQUENCY_CONTEXT_TOPIC = 'watering_frequency_context'
const WATERING_FREQUENCY_CONTEXT_QUESTION_KEY =
  'q_observed_probe__leaf_yellowing__watering_frequency_context'
const WATERING_FREQUENCY_CONTEXT_TEXT = '请您选择在过去的10天内，哪几天浇了水？'
const WATERING_FREQUENCY_CONTEXT_HELP_TEXT =
  '系统会结合天气和浇水记录判断偏干、偏湿或基本合理。'

const WATERING_FREQUENCY_CONTEXT_OPTIONS = Object.freeze([
  { optionKey: 'care_behavior_timeline', text: '养护记录已提供', isDefault: true },
  { optionKey: 'unknown', text: '不确定 / 记不清' }
])

const WATERING_FREQUENCY_CONTEXT_DEFINITION = Object.freeze({
  questionKey: WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
  questionId: toQuestionId(WATERING_FREQUENCY_CONTEXT_QUESTION_KEY),
  packageTopic: WATERING_FREQUENCY_CONTEXT_TOPIC,
  questionGroupKey: WATERING_FREQUENCY_CONTEXT_TOPIC,
  packageSection: 'route_package',
  uiVariant: 'care_behavior_timeline',
  renderMode: 'care_behavior_timeline',
  routePackageRole: 'route_package_water_behavior',
  packageEffect: 'route_outcome',
  questionType: 'single_choice',
  answerType: 'single_choice',
  questionText: WATERING_FREQUENCY_CONTEXT_TEXT,
  text: WATERING_FREQUENCY_CONTEXT_TEXT,
  helpText: WATERING_FREQUENCY_CONTEXT_HELP_TEXT,
  defaultOptionKey: 'care_behavior_timeline',
  options: WATERING_FREQUENCY_CONTEXT_OPTIONS
})

function clonePlain(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlain)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clonePlain(child)]))
  }
  return value
}

function isWateringFrequencyContextTopic(packageTopic = '') {
  return String(packageTopic || '').trim() === WATERING_FREQUENCY_CONTEXT_TOPIC
}

function buildWateringFrequencyContextQuestionDefinition(overrides = {}) {
  return {
    ...clonePlain(WATERING_FREQUENCY_CONTEXT_DEFINITION),
    ...overrides,
    options: clonePlain(overrides.options || WATERING_FREQUENCY_CONTEXT_DEFINITION.options)
  }
}

function buildRegisteredQuestionForPackageTopic(packageTopic = '', overrides = {}) {
  if (isWateringFrequencyContextTopic(packageTopic)) {
    return buildWateringFrequencyContextQuestionDefinition(overrides)
  }
  return null
}

function mapRegisteredQuestionOptions(options = []) {
  return (Array.isArray(options) ? options : []).map(option => ({
    optionId: option.optionId || toOptionId(option.optionKey),
    optionKey: option.optionKey,
    text: option.text || '',
    description: option.description || '',
    isDefault: Boolean(option.isDefault)
  }))
}

module.exports = {
  WATERING_FREQUENCY_CONTEXT_TOPIC,
  WATERING_FREQUENCY_CONTEXT_QUESTION_KEY,
  WATERING_FREQUENCY_CONTEXT_TEXT,
  WATERING_FREQUENCY_CONTEXT_HELP_TEXT,
  WATERING_FREQUENCY_CONTEXT_OPTIONS,
  buildRegisteredQuestionForPackageTopic,
  buildWateringFrequencyContextQuestionDefinition,
  isWateringFrequencyContextTopic,
  mapRegisteredQuestionOptions,
  _test: {
    WATERING_FREQUENCY_CONTEXT_DEFINITION
  }
}
