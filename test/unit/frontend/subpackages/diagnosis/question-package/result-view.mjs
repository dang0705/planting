import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'

import {
  buildOutcomeAdviceGroups,
  normalizeDisplayEvidenceItem,
  useQuestionPackageResultView
} from '../../../../../../src/subpackages/diagnosis/question-package/result-view.js'
import { normalizeHistoryDetail } from '../../../../../../src/subpackages/diagnosis/http-functions/diagnose/client-history-detail.js'

const getActionAdvice = outcome => outcome.actionAdviceItems

assert.deepEqual(
  normalizeDisplayEvidenceItem(
    { symptomKey: 'aphids_visible', displayNameCn: 'aphids_visible' },
    0,
    'visual'
  ),
  null
)
assert.deepEqual(
  normalizeDisplayEvidenceItem(
    { symptomKey: 'aphids_visible', displayNameCn: '看到蚜虫', supportImageCount: 2 },
    0,
    'visual'
  ),
  { key: 'aphids_visible', label: '看到蚜虫', supportImageCount: 2 }
)

const internalOnlyResultView = useQuestionPackageResultView({
  result: ref({
    finalResult: { problemKey: 'aphids_visible', outcomeKey: 'pest_aphids' },
    visibleOutcomes: [{ problemKey: 'aphids_visible', outcomeKey: 'pest_aphids' }]
  }),
  payload: ref({})
})
assert.equal(internalOnlyResultView.outcomeDisplayTitle.value, '诊断已完成')
assert.deepEqual(internalOnlyResultView.allOutcomeDisplays.value, [])

const singleOutcomeGroups = buildOutcomeAdviceGroups({
  outcomeSources: [
    { outcomeKey: 'thrips', displayNameCn: '可能是蓟马', actionAdviceItems: ['隔离观察'] }
  ],
  getOutcomeItems: getActionAdvice
})
assert.equal(singleOutcomeGroups.length, 1)
assert.equal(singleOutcomeGroups[0].showOutcomeLabel, false)
assert.deepEqual(singleOutcomeGroups[0].items, ['隔离观察'])

const multipleOutcomeGroups = buildOutcomeAdviceGroups({
  outcomeSources: [
    { outcomeKey: 'thrips', displayNameCn: '可能是蓟马', actionAdviceItems: ['隔离观察'] },
    {
      outcomeKey: 'spider_mite',
      displayNameCn: '可能是红蜘蛛',
      actionAdviceItems: ['检查叶背']
    }
  ],
  getOutcomeItems: getActionAdvice
})
assert.deepEqual(
  multipleOutcomeGroups.map(group => ({
    label: group.outcomeLabel,
    showOutcomeLabel: group.showOutcomeLabel,
    items: group.items
  })),
  [
    { label: '可能是蓟马', showOutcomeLabel: true, items: ['隔离观察'] },
    { label: '可能是红蜘蛛', showOutcomeLabel: true, items: ['检查叶背'] }
  ]
)

const sharedProfileGroups = buildOutcomeAdviceGroups({
  outcomeSources: [
    {
      outcomeKey: 'iron_deficiency',
      actionProfileKey: 'action_nutrient_support_basic',
      displayNameCn: '缺铁/新叶脉间黄化',
      actionAdviceItems: ['核对补肥情况'],
      avoidAdviceItems: ['不要一次性重肥猛补']
    },
    {
      outcomeKey: 'nitrogen_deficiency',
      actionProfileKey: 'action_nutrient_support_basic',
      displayNameCn: '缺氮/长期营养不足',
      actionAdviceItems: ['从低浓度少量补肥开始'],
      avoidAdviceItems: ['不要和大幅浇水调整同时进行']
    }
  ],
  section: 'action',
  getOutcomeItems: getActionAdvice,
  getOutcomeActionItems: getActionAdvice,
  getOutcomeAvoidItems: outcome => outcome.avoidAdviceItems,
  sharedSymptomLabels: [{ label: '新叶脉间黄化' }, { label: '长期营养不足' }]
})
assert.equal(sharedProfileGroups.length, 1)
assert.equal(sharedProfileGroups[0].key, 'action_nutrient_support_basic')
assert.equal(sharedProfileGroups[0].displayLabel, '新叶脉间黄化、长期营养不足')

const historicalSameTextGroups = useQuestionPackageResultView({
  result: ref(
    normalizeHistoryDetail({
      diagnosisSessionId: 'history_same_advice',
      finalResult: { displayName: '虫害方向' },
      visibleOutcomes: [
        {
          outcomeKey: 'spider_mite',
          displayNameCn: '可能是红蜘蛛（叶螨）',
          symptomLabels: ['叶面密集黄白小点'],
          actionAdviceItems: ['先隔离植株，重点检查叶背、嫩梢和茎部，避免马上混用药剂。'],
          avoidAdviceItems: ['不要把普通黄叶或发蔫直接当作虫害原处理。']
        },
        {
          outcomeKey: 'thrips',
          displayNameCn: '可能是蓟马',
          symptomLabels: ['银灰条斑附近可见细小黑点'],
          actionAdviceItems: ['先隔离植株，重点检查叶背、嫩梢和茎部，避免马上混用药剂。'],
          avoidAdviceItems: ['不要把普通黄叶或发蔫直接当作虫害原处理。']
        }
      ]
    })
  ),
  payload: ref({})
})
assert.equal(
  historicalSameTextGroups.actionAdviceGroups.value.length,
  1,
  '历史结果缺少主键但建议完全相同时，建议应归并为一组'
)
assert.equal(
  historicalSameTextGroups.avoidAdviceGroups.value.length,
  1,
  '历史结果缺少主键但暂时避免完全相同时，暂时避免应归并为一组'
)
assert.equal(
  historicalSameTextGroups.actionAdviceGroups.value[0].displayLabel,
  '叶面密集黄白小点、银灰条斑附近可见细小黑点',
  '归并后的建议应列举对应症状'
)
assert.equal(
  historicalSameTextGroups.avoidAdviceGroups.value[0].displayLabel,
  '叶面密集黄白小点、银灰条斑附近可见细小黑点',
  '归并后的暂时避免应列举对应症状'
)
assert.deepEqual(
  historicalSameTextGroups.actionAdviceGroups.value[0].items,
  ['先隔离植株，重点检查叶背、嫩梢和茎部，避免马上混用药剂。']
)
assert.deepEqual(
  historicalSameTextGroups.avoidAdviceGroups.value[0].items,
  ['不要把普通黄叶或发蔫直接当作虫害原处理。']
)

const resultComponentSource = readFileSync(
  'src/subpackages/diagnosis/question-package/QuestionPackageResult.vue',
  'utf8'
)
assert.equal((resultComponentSource.match(/v-if="group\.showOutcomeLabel"/g) || []).length, 2)

console.log('question package result view tests passed')
