'use strict'

const { buildSyntheticDirectProblemAdjustments } = require('./rules')

function buildSurfaceStickyOptionMappings({
  questionKey = '',
  symptomKey = '',
  targetDimension = '',
  normalizedPatternKey = '',
  optionTextByKey = {},
  symptomMeta = {},
  dimensionLabel = ''
} = {}) {
  const stickyTargetSymptomKey =
    symptomKey === 'sticky_honeydew' ||
    normalizedPatternKey === 'mold' ||
    symptomKey === 'sooty_mold' ||
    symptomKey === 'black_mold_growth'
      ? 'sticky_honeydew'
      : ''
  const dryResidueSymptomKey =
    symptomKey === 'sticky_honeydew'
      ? 'sticky_honeydew'
      : normalizedPatternKey === 'mold' || symptomKey === 'sooty_mold'
      ? 'black_mold_growth'
      : symptomKey
  const dryResidueValue =
    symptomKey === 'sticky_honeydew'
      ? -1
      : dryResidueSymptomKey
        ? 1
        : 0
  const dryResidueAssociationStrength =
    symptomKey === 'sticky_honeydew'
      ? 0.9
      : dryResidueSymptomKey
        ? 0.85
        : 0
  
  return [
    {
      questionKey,
      optionKey: 'yes',
      optionTextCn: optionTextByKey.yes,
      optionTextUserCn: optionTextByKey.yes,
      mapsToSymptomKey: stickyTargetSymptomKey,
      value: stickyTargetSymptomKey ? 1 : 0,
      associationStrength: stickyTargetSymptomKey ? 1 : 0,
      directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
        { ...symptomMeta, symptomKey },
        targetDimension,
        'yes'
      ),
      answerEffectCn: stickyTargetSymptomKey
        ? '把“发黏/蜜露残留”作为正证据加入诊断。'
        : `记录“${dimensionLabel}”维度的补充观察。`,
      dataStatus: 'synthetic'
    },
    {
      questionKey,
      optionKey: 'no',
      optionTextCn: optionTextByKey.no,
      optionTextUserCn: optionTextByKey.no,
      mapsToSymptomKey: dryResidueSymptomKey,
      value: dryResidueValue,
      associationStrength: dryResidueAssociationStrength,
      directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
        { ...symptomMeta, symptomKey },
        targetDimension,
        'no'
      ),
      answerEffectCn: dryResidueSymptomKey
        ? symptomKey === 'sticky_honeydew'
          ? '把“没有发黏/蜜露感”作为反向证据进入诊断。'
          : '把“干灰/黑霉覆盖层”作为补充证据加入诊断。'
        : `记录“${dimensionLabel}”维度的补充观察。`,
      dataStatus: 'synthetic'
    },
    {
      questionKey,
      optionKey: 'unknown',
      optionTextCn: optionTextByKey.unknown,
      optionTextUserCn: optionTextByKey.unknown,
      mapsToSymptomKey: '',
      value: 0,
      associationStrength: 0,
      directProblemAdjustments: [],
      answerEffectCn: `暂不记录“${dimensionLabel}”维度的明确结论。`,
      dataStatus: 'synthetic'
    }
  ]
}

module.exports = { buildSurfaceStickyOptionMappings }
