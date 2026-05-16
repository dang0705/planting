'use strict'

const {
  normalizeQuestionTargetDimension,
  inferQuestionRole,
  inferQuestionEffectMode
} = require('../question-target-dimension')
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

function buildSyntheticObservedProbeQuestions(
  item = {},
  {
    maxQuestions = 1,
    excludedDimensions = [],
    preferredDimensions = [],
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
      .map(value => normalizeQuestionTargetDimension(value, ''))
      .filter(Boolean)
  )
  const questionTemplateMap = buildTemplateMap(questionTemplates)
  const optionTemplateMap = buildOptionTemplateMap(optionTemplates)
  const preferredDimensionList = (Array.isArray(preferredDimensions) ? preferredDimensions : [])
    .map(value => normalizeQuestionTargetDimension(value, ''))
    .filter(Boolean)
  const dimensionOrder = preferredDimensionList.length
    ? preferredDimensionList
    : buildOrthogonalProbeDimensionOrder(item)

  return dimensionOrder
    .filter(targetDimension => Boolean(targetDimension) && !excludedDimensionSet.has(targetDimension))
    .slice(0, Math.max(1, Math.min(1, Number(maxQuestions || 1))))
    .map(targetDimension => {
      const context = { plantContext, weatherContext }
      const questionKey = buildSyntheticObservedProbeQuestionKey(symptomKey, targetDimension)
      const probeText = buildOrthogonalProbeText(item, targetDimension, context)
      const optionTexts = buildSyntheticObservedProbeOptionTexts(item, targetDimension, context)
      const variables = buildTemplateVariables(item, context)
      const dataLayerQuestion = questionTemplateMap.get(questionKey) || null
      const dataLayerOptions = renderDataLayerOptions(optionTemplateMap.get(questionKey) || [], variables)
      const optionEntries = dataLayerOptions.length
        ? dataLayerOptions
        : normalizeSyntheticOptionEntries(optionTexts)
      const questionRole = inferQuestionRole(targetDimension, probeText.routingScope)
      const defaultOptionKey =
        normalizeText(dataLayerQuestion?.defaultOptionKey) ||
        normalizeText(optionEntries.find(option => option.isDefault)?.optionKey) ||
        (
          questionRole === 'gate'
            ? resolveSyntheticDefaultOptionKey(targetDimension, optionEntries)
            : ''
        )
      return {
        questionKey,
        targetSymptomKey: symptomKey,
        targetDimension,
        routingScope: dataLayerQuestion?.routingScope || probeText.routingScope,
        questionRole,
        effectMode: inferQuestionEffectMode(questionRole, targetDimension),
        defaultOptionKey,
        uiVariant: normalizeText(dataLayerQuestion?.uiVariant),
        renderMode: normalizeText(dataLayerQuestion?.renderMode),
        questionText: renderQuestionTemplate(
          dataLayerQuestion?.questionTextUserCn || dataLayerQuestion?.questionTextCn || probeText.questionText,
          variables
        ),
        helpText: renderQuestionTemplate(dataLayerQuestion?.helpTextCn || probeText.helpText, variables),
        questionGroupKey: dataLayerQuestion?.questionGroupKey || buildObservedProbeQuestionGroupKey(symptomKey, targetDimension),
        questionType: dataLayerQuestion?.questionType || 'single_choice',
        options: optionEntries,
        whyThisQuestion: renderQuestionTemplate(
          dataLayerQuestion?.whyThisQuestionCn ||
            `这题用于从“${targetDimension}”维度补充观察“${resolveNeutralSymptomLabel(item, symptomKey)}”，避免回到同一视觉确认问题。`,
          variables
        )
      }
    })
    .filter(Boolean)
}

module.exports = { buildSyntheticObservedProbeQuestions }
