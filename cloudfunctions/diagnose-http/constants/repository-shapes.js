'use strict'

// repository 层向上暴露的新结构定义（中间产物之一）
module.exports = {
  symptom: {
    symptomKey: 'string',
    symptomCn: 'string',
    locationKey: 'string',
    symptomType: 'string',
    signalReliability: 'number',
    displayTextCn: 'string',
    userObservationTipCn: 'string',
    confusionNoteCn: 'string',
    dataStatus: 'string'
  },
  evidenceEdge: {
    symptomKey: 'string',
    problemKey: 'string',
    associationStrength: 'number',
    edgeReliability: 'number',
    evidenceType: 'string',
    dataStatus: 'string'
  },
  problem: {
    problemKey: 'string',
    problemCn: 'string',
    problemRole: 'string',
    problemType: 'string',
    displayNameCn: 'string',
    userDefinitionCn: 'string',
    userActionCn: 'string',
    userPreventionCn: 'string',
    severityHintCn: 'string',
    urgencyHintCn: 'string'
  },
  prior: {
    genusCompatibility: 'number',
    hostCompatibility: 'number',
    sourceLayer: 'string'
  },
  question: {
    questionKey: 'string',
    questionTextCn: 'string',
    questionTextUserCn: 'string',
    helpTextCn: 'string',
    questionGroupKey: 'string',
    allowUnknown: 'boolean',
    priority: 'number'
  },
  questionOptionMapping: {
    questionKey: 'string',
    optionKey: 'string',
    mapsToSymptomKey: 'string',
    value: 'number',
    associationStrength: 'number'
  },
  explanation: {
    problemKey: 'string',
    displayNameCn: 'string',
    resultSummaryCn: 'string',
    whyItHappensCn: 'string',
    whatToCheckNextCn: 'string',
    firstAidCn: 'string',
    avoidCn: 'string',
    reassuranceCn: 'string'
  }
}
