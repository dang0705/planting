'use strict'

const { toOptionId } = require('../mappers/public-id-mapper')

const AIR_ENVIRONMENT_RECORDED_OPTION_KEY = 'air_environment_recorded'
const AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY = 'air_environment_unknown'
const YELLOW_LEAF_AIR_ENVIRONMENT_QUESTION_KEY = 'q_yellow_leaf__air_environment'
const WILTING_DROOP_AIR_ENVIRONMENT_QUESTION_KEY = 'q_wilting_droop__air_environment'

function createAirEnvironmentPackageQuestion({
  mode = 'yellow_leaf',
  selectionSource = 'static_question_package',
  packageSection = 'route_package',
  routeKey = '',
  packageEffect = 'route_evidence'
} = {}) {
  const isWilting = mode === 'wilting_droop'
  return {
    questionKey: isWilting
      ? WILTING_DROOP_AIR_ENVIRONMENT_QUESTION_KEY
      : YELLOW_LEAF_AIR_ENVIRONMENT_QUESTION_KEY,
    selectionSource,
    routeKey,
    conditionKey: '',
    outcomeKey: '',
    targetSymptomKey: isWilting ? 'wilting_droop' : 'leaf_yellowing',
    questionGroupKey: isWilting ? 'wilting_droop_air_environment' : 'yellow_leaf_air_environment',
    packageTopic: 'air_environment',
    packageSection,
    defaultOptionKey: AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY,
    defaultOptionId: toOptionId(AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY),
    questionType: 'air_environment',
    uiVariant: 'air_environment',
    renderMode: 'composite',
    routePackageRole: 'route_package_air_environment',
    packageEffect,
    type: 'single_choice',
    text: '植物周围的空气环境怎样？',
    questionText: '植物周围的空气环境怎样？',
    helpText: '请按植物所在位置填写换气、周围空间和设备风。',
    options: [
      {
        optionId: toOptionId(AIR_ENVIRONMENT_RECORDED_OPTION_KEY),
        optionKey: AIR_ENVIRONMENT_RECORDED_OPTION_KEY,
        text: '已填写空气环境'
      },
      {
        optionId: toOptionId(AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY),
        optionKey: AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY,
        text: '不确定',
        isDefault: true
      }
    ],
    whyThisQuestion: isWilting
      ? '空气环境用于识别发蔫时是否存在直吹等需要先调整的位置条件。'
      : '空气环境只作为诊断证据，不单独生成黄叶结论。'
  }
}

module.exports = {
  AIR_ENVIRONMENT_RECORDED_OPTION_KEY,
  AIR_ENVIRONMENT_UNKNOWN_OPTION_KEY,
  YELLOW_LEAF_AIR_ENVIRONMENT_QUESTION_KEY,
  WILTING_DROOP_AIR_ENVIRONMENT_QUESTION_KEY,
  createAirEnvironmentPackageQuestion
}
