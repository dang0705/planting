'use strict'

const {
  SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX,
  normalizeText
} = require('./keys')
const { resolveNeutralSymptomLabel } = require('./templates')

function buildSyntheticVisualCandidateOptionMappings(questionKey = '', symptomMap = new Map()) {
  const symptomKey = questionKey.slice(SYNTHETIC_VISUAL_CANDIDATE_QUESTION_PREFIX.length).trim()
  if (!symptomKey) {return []}

  const symptomMeta = symptomMap.get(symptomKey) || {}
  const symptomLabel = normalizeText(
    resolveNeutralSymptomLabel({ ...symptomMeta, symptomKey }, symptomKey)
  ) || symptomKey

  return [
    {
      questionKey,
      optionKey: 'yes',
      optionTextCn: '是的',
      optionTextUserCn: '是的',
      mapsToSymptomKey: symptomKey,
      value: 1,
      associationStrength: 1,
      answerEffectCn: `把“${symptomLabel}”作为正证据加入诊断。`,
      dataStatus: 'synthetic'
    },
    {
      questionKey,
      optionKey: 'no',
      optionTextCn: '不是的',
      optionTextUserCn: '不是的',
      mapsToSymptomKey: symptomKey,
      value: -1,
      associationStrength: 1,
      answerEffectCn: `把“${symptomLabel}”作为负证据加入诊断。`,
      dataStatus: 'synthetic'
    },
    {
      questionKey,
      optionKey: 'unknown',
      optionTextCn: '看不出/不确定',
      optionTextUserCn: '看不出/不确定',
      mapsToSymptomKey: symptomKey,
      value: 0,
      associationStrength: 0,
      answerEffectCn: `暂不把“${symptomLabel}”作为正式证据。`,
      dataStatus: 'synthetic'
    }
  ]
}

module.exports = { buildSyntheticVisualCandidateOptionMappings }
