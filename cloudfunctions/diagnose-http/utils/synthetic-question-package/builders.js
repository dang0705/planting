'use strict'

const {
  normalizeQuestionPackageTopic,
  inferRoutePackageRole,
  inferQuestionPackageEffect
} = require('../question-package-topic')
const {
  normalizeText,
  buildSyntheticObservedProbeQuestionKey,
  buildObservedProbeQuestionGroupKey
} = require('./keys')
const {
  normalizeSyntheticOptionEntries,
  renderQuestionTemplate,
  buildTemplateVariables,
  buildTemplateMap,
  buildOptionTemplateMap,
  renderDataLayerOptions,
  resolveSyntheticDefaultOptionKey,
  resolveNeutralSymptomLabel
} = require('./templates')
const { buildOrthogonalProbeDimensionOrder } = require('./rules')
const { buildOrthogonalProbeText } = require('./probe-text')
const { buildSyntheticObservedProbeOptionTexts } = require('./probe-options')
const { isDisabledYellowingFlowQuestion } = require('../yellowing-question-policy')

function resolveSyntheticUiVariant(packageTopic = '', dataLayerQuestion = null) {
  const explicitUiVariant = normalizeText(dataLayerQuestion?.uiVariant)
  if (explicitUiVariant) {return explicitUiVariant}
  return packageTopic === 'watering_frequency_context' ? 'care_behavior_timeline' : ''
}

function buildSyntheticObservedProbeQuestions(
  item = {},
  {
    maxQuestions = 1,
    excludedDimensions = [],
    preferredTopics = [],
    plantContext = {},
    weatherContext = null,
    questionTemplates = [],
    optionTemplates = []
  } = {}
) {
  const symptomKey = normalizeText(item?.symptomKey)
  if (!symptomKey) {return []}

  const excludedDimensionSet = new Set(
    (Array.isArray(excludedDimensions) ? excludedDimensions : [])
      .map(value => normalizeQuestionPackageTopic(value, ''))
      .filter(Boolean)
  )
  const questionTemplateMap = buildTemplateMap(questionTemplates)
  const optionTemplateMap = buildOptionTemplateMap(optionTemplates)
  const preferredDimensionList = (Array.isArray(preferredTopics) ? preferredTopics : [])
    .map(value => normalizeQuestionPackageTopic(value, ''))
    .filter(Boolean)
  const dimensionOrder = preferredDimensionList.length
    ? preferredDimensionList
    : buildOrthogonalProbeDimensionOrder(item)

  return dimensionOrder
    .filter(packageTopic => Boolean(packageTopic) && !excludedDimensionSet.has(packageTopic))
    .filter(packageTopic => !isDisabledYellowingFlowQuestion({
      questionKey: buildSyntheticObservedProbeQuestionKey(symptomKey, packageTopic),
      packageTopic,
      targetSymptomKey: symptomKey
    }))
    .slice(0, Math.max(1, Math.min(1, Number(maxQuestions || 1))))
    .map(packageTopic => {
      const context = { plantContext, weatherContext }
      const questionKey = buildSyntheticObservedProbeQuestionKey(symptomKey, packageTopic)
      const probeText = buildOrthogonalProbeText(item, packageTopic, context)
      const optionTexts = buildSyntheticObservedProbeOptionTexts(item, packageTopic, context)
      const variables = buildTemplateVariables(item, context)
      const dataLayerQuestion = questionTemplateMap.get(questionKey) || null
      const dataLayerOptions = renderDataLayerOptions(optionTemplateMap.get(questionKey) || [], variables)
      const optionEntries = dataLayerOptions.length
        ? dataLayerOptions
        : normalizeSyntheticOptionEntries(optionTexts)
      const routePackageRole = inferRoutePackageRole(packageTopic, probeText.packageSection)
      const defaultOptionKey =
        normalizeText(dataLayerQuestion?.defaultOptionKey) ||
        normalizeText(optionEntries.find(option => option.isDefault)?.optionKey) ||
        (
          routePackageRole === 'condition'
            ? resolveSyntheticDefaultOptionKey(packageTopic, optionEntries)
            : ''
        )
      return {
        questionKey,
        targetSymptomKey: symptomKey,
        packageTopic,
        packageSection: dataLayerQuestion?.packageSection || probeText.packageSection,
        routePackageRole,
        packageEffect: inferQuestionPackageEffect(routePackageRole, packageTopic),
        defaultOptionKey,
        uiVariant: resolveSyntheticUiVariant(packageTopic, dataLayerQuestion),
        renderMode: normalizeText(dataLayerQuestion?.renderMode),
        questionText: renderQuestionTemplate(
          dataLayerQuestion?.questionTextUserCn || dataLayerQuestion?.questionTextCn || probeText.questionText,
          variables
        ),
        helpText: renderQuestionTemplate(dataLayerQuestion?.helpTextCn || probeText.helpText, variables),
        questionGroupKey: dataLayerQuestion?.questionGroupKey || buildObservedProbeQuestionGroupKey(symptomKey, packageTopic),
        questionType: dataLayerQuestion?.questionType || 'single_choice',
        options: optionEntries,
        whyThisQuestion: renderQuestionTemplate(
          dataLayerQuestion?.whyThisQuestionCn ||
            `这题用于从“${packageTopic}”维度补充观察“${resolveNeutralSymptomLabel(item, symptomKey)}”，避免回到同一视觉确认问题。`,
          variables
        )
      }
    })
    .filter(Boolean)
}

module.exports = { buildSyntheticObservedProbeQuestions }
