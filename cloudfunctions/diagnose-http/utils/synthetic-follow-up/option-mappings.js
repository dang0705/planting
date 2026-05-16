'use strict'

const { QUESTION_TARGET_DIMENSIONS } = require('../question-target-dimension')
const {
  normalizeText,
  isSyntheticVisualCandidateQuestionKey,
  isSyntheticObservedProbeQuestionKey,
  parseSyntheticObservedProbeQuestionKey
} = require('./keys')
const { normalizeSyntheticOptionEntries } = require('./templates')
const {
  isStructuralChewingSymptom,
  buildSyntheticDirectProblemAdjustments
} = require('./rules')
const { buildSyntheticObservedProbeOptionTexts } = require('./probe-options')
const { buildSurfaceStickyOptionMappings } = require('./surface-sticky-option-mappings')
const {
  buildSyntheticVisualCandidateOptionMappings
} = require('./visual-candidate-option-mappings')

function buildSyntheticFollowUpOptionMappings(questionKeys = [], symptomDictionary = []) {
  const symptomMap = new Map(
    (Array.isArray(symptomDictionary) ? symptomDictionary : [])
      .map(item => [normalizeText(item?.symptomKey), item])
      .filter(([symptomKey]) => Boolean(symptomKey))
  )

  return Array.from(
    new Set(
      (Array.isArray(questionKeys) ? questionKeys : [])
        .map(item => normalizeText(item))
        .filter(Boolean)
    )
  ).flatMap(questionKey => {
    if (isSyntheticVisualCandidateQuestionKey(questionKey)) {
      return buildSyntheticVisualCandidateOptionMappings(questionKey, symptomMap)
    }

    if (isSyntheticObservedProbeQuestionKey(questionKey)) {
      const { symptomKey, targetDimension } = parseSyntheticObservedProbeQuestionKey(questionKey)
      const dimensionLabel = targetDimension || '补充维度'
      const symptomMeta = symptomMap.get(symptomKey) || {}
      const normalizedPatternKey = normalizeText(symptomMeta?.patternKey)
      const optionTexts = buildSyntheticObservedProbeOptionTexts(symptomMeta, targetDimension)
      const optionTextByKey = Object.fromEntries(
        normalizeSyntheticOptionEntries(optionTexts).map(option => [option.optionKey, option.text])
      )

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS) {
        return buildSurfaceStickyOptionMappings({
          questionKey,
          symptomKey,
          targetDimension,
          normalizedPatternKey,
          optionTextByKey,
          symptomMeta,
          dimensionLabel
        })
      }

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE) {
        return [
          {
            questionKey,
            optionKey: 'pest_trace',
            optionTextCn: optionTextByKey.pest_trace,
            optionTextUserCn: optionTextByKey.pest_trace,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'pest_trace'
            ),
            answerEffectCn: '记录“结构缺损更像虫害活动痕迹”的分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'lesion_dropout',
            optionTextCn: optionTextByKey.lesion_dropout,
            optionTextUserCn: optionTextByKey.lesion_dropout,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'lesion_dropout'
            ),
            answerEffectCn: '记录“结构缺损更像病斑干枯脱落”的分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'mechanical_old',
            optionTextCn: optionTextByKey.mechanical_old,
            optionTextUserCn: optionTextByKey.mechanical_old,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'mechanical_old'
            ),
            answerEffectCn: '记录“结构缺损更像机械/旧伤”的保守分流线索。',
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

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN) {
        return [
          {
            questionKey,
            optionKey: 'mine_line',
            optionTextCn: optionTextByKey.mine_line,
            optionTextUserCn: optionTextByKey.mine_line,
            mapsToSymptomKey: symptomKey === 'tunnels_in_leaf' ? 'tunnels_in_leaf' : '',
            value: symptomKey === 'tunnels_in_leaf' ? 1 : 0,
            associationStrength: symptomKey === 'tunnels_in_leaf' ? 0.9 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'mine_line'
            ),
            answerEffectCn: '记录“线状痕迹符合潜叶道形态”的分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'other_mark',
            optionTextCn: optionTextByKey.other_mark,
            optionTextUserCn: optionTextByKey.other_mark,
            mapsToSymptomKey: symptomKey === 'tunnels_in_leaf' ? 'tunnels_in_leaf' : '',
            value: symptomKey === 'tunnels_in_leaf' ? -1 : 0,
            associationStrength: symptomKey === 'tunnels_in_leaf' ? 0.8 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'other_mark'
            ),
            answerEffectCn: '记录“线状痕迹不符合典型潜叶道”的分流线索。',
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

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN) {
        return [
          {
            questionKey,
            optionKey: 'spreading_powder',
            optionTextCn: optionTextByKey.spreading_powder,
            optionTextUserCn: optionTextByKey.spreading_powder,
            mapsToSymptomKey: symptomKey === 'powder_white' ? 'powder_white' : '',
            value: symptomKey === 'powder_white' ? 1 : 0,
            associationStrength: symptomKey === 'powder_white' ? 0.75 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'spreading_powder'
            ),
            answerEffectCn: '记录“白色粉层呈扩散趋势”的分流线索。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'limited_static',
            optionTextCn: optionTextByKey.limited_static,
            optionTextUserCn: optionTextByKey.limited_static,
            mapsToSymptomKey: '',
            value: 0,
            associationStrength: 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'limited_static'
            ),
            answerEffectCn: '记录“白色粉层暂未见扩散”的保守分流线索。',
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

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY) {
        const structuralChewingSymptom = isStructuralChewingSymptom({ ...symptomMeta, symptomKey })

        return [
          {
            questionKey,
            optionKey: 'yes',
            optionTextCn: optionTextByKey.yes,
            optionTextUserCn: optionTextByKey.yes,
            mapsToSymptomKey: structuralChewingSymptom ? symptomKey : '',
            value: structuralChewingSymptom ? 1 : 0,
            associationStrength: structuralChewingSymptom ? 1 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'yes'
            ),
            answerEffectCn: structuralChewingSymptom
              ? '把“真实缺口/真洞/骨架化缺损”作为正证据加入诊断。'
              : '记录“组织真实缺损/孔洞”的补充观察。',
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'no',
            optionTextCn: optionTextByKey.no,
            optionTextUserCn: optionTextByKey.no,
            mapsToSymptomKey: structuralChewingSymptom ? symptomKey : '',
            value: structuralChewingSymptom ? -1 : 0,
            associationStrength: structuralChewingSymptom ? 0.85 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'no'
            ),
            answerEffectCn: structuralChewingSymptom
              ? '把“没有真实缺口/真洞/骨架化缺损”作为反向证据加入诊断。'
              : '记录“组织完整、并无真实缺损/孔洞”的补充观察。',
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

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.LESION_HALO) {
        const haloTargetSymptomKey =
          symptomKey === 'black_spots_spreading' || symptomKey === 'brown_spots_halo'
            ? 'brown_spots_halo'
            : ''

        return [
          {
            questionKey,
            optionKey: 'yes',
            optionTextCn: optionTextByKey.yes,
            optionTextUserCn: optionTextByKey.yes,
            mapsToSymptomKey: haloTargetSymptomKey,
            value: haloTargetSymptomKey ? 1 : 0,
            associationStrength: haloTargetSymptomKey ? 1 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'yes'
            ),
            answerEffectCn: haloTargetSymptomKey
              ? '把“褐斑带黄晕”作为补充证据加入诊断。'
              : `记录“${dimensionLabel}”维度的补充观察。`,
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'no',
            optionTextCn: optionTextByKey.no,
            optionTextUserCn: optionTextByKey.no,
            mapsToSymptomKey: haloTargetSymptomKey,
            value: haloTargetSymptomKey ? -1 : 0,
            associationStrength: haloTargetSymptomKey ? 0.9 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'no'
            ),
            answerEffectCn: haloTargetSymptomKey
              ? '把“缺少黄晕”作为反向证据进入诊断。'
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

      if (targetDimension === QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING) {
        const waterSoakedTargetSymptomKey =
          symptomKey === 'black_spots_spreading' || symptomKey === 'brown_spots_halo'
            ? 'water_soaked_spots'
            : ''

        return [
          {
            questionKey,
            optionKey: 'yes',
            optionTextCn: optionTextByKey.yes,
            optionTextUserCn: optionTextByKey.yes,
            mapsToSymptomKey: waterSoakedTargetSymptomKey,
            value: waterSoakedTargetSymptomKey ? 1 : 0,
            associationStrength: waterSoakedTargetSymptomKey ? 1 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'yes'
            ),
            answerEffectCn: waterSoakedTargetSymptomKey
              ? '把“水渍斑/水浸边缘”作为补充证据加入诊断。'
              : `记录“${dimensionLabel}”维度的补充观察。`,
            dataStatus: 'synthetic'
          },
          {
            questionKey,
            optionKey: 'no',
            optionTextCn: optionTextByKey.no,
            optionTextUserCn: optionTextByKey.no,
            mapsToSymptomKey: waterSoakedTargetSymptomKey,
            value: waterSoakedTargetSymptomKey ? -1 : 0,
            associationStrength: waterSoakedTargetSymptomKey ? 0.9 : 0,
            directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
              { ...symptomMeta, symptomKey },
              targetDimension,
              'no'
            ),
            answerEffectCn: waterSoakedTargetSymptomKey
              ? '把“缺少水渍/湿软边缘”作为反向证据进入诊断。'
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

      const optionEntries = normalizeSyntheticOptionEntries(optionTexts)
      const isNonBooleanProbe =
        optionEntries.some(({ optionKey }) => !['yes', 'no', 'unknown'].includes(optionKey))
      if (isNonBooleanProbe) {
        return optionEntries.map(({ optionKey, text }) => ({
          questionKey,
          optionKey,
          optionTextCn: text,
          optionTextUserCn: text,
          mapsToSymptomKey: '',
          value: 0,
          associationStrength: 0,
          directProblemAdjustments:
            optionKey === 'unknown'
              ? []
              : buildSyntheticDirectProblemAdjustments(
                  { ...symptomMeta, symptomKey },
                  targetDimension,
                  optionKey
                ),
          answerEffectCn:
            optionKey === 'unknown'
              ? `暂不记录“${dimensionLabel}”维度的明确结论。`
              : `记录“${dimensionLabel}”维度的分流观察。`,
          dataStatus: 'synthetic'
        }))
      }

      return [
        {
          questionKey,
          optionKey: 'yes',
          optionTextCn: optionTextByKey.yes,
          optionTextUserCn: optionTextByKey.yes,
          mapsToSymptomKey: '',
          value: 0,
          associationStrength: 0,
          directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
            { ...symptomMeta, symptomKey },
            targetDimension,
            'yes'
          ),
          answerEffectCn: `记录“${dimensionLabel}”维度的补充观察。`,
          dataStatus: 'synthetic'
        },
        {
          questionKey,
          optionKey: 'no',
          optionTextCn: optionTextByKey.no,
          optionTextUserCn: optionTextByKey.no,
          mapsToSymptomKey: '',
          value: 0,
          associationStrength: 0,
          directProblemAdjustments: buildSyntheticDirectProblemAdjustments(
            { ...symptomMeta, symptomKey },
            targetDimension,
            'no'
          ),
          answerEffectCn: `记录“${dimensionLabel}”维度的补充观察。`,
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

    return []
  })
}

module.exports = { buildSyntheticFollowUpOptionMappings }
