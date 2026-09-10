import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildOutcomeAdviceGroups } from '../../../../../../src/subpackages/diagnosis/question-package/result-view.js'

const getActionAdvice = outcome => outcome.actionAdviceItems

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

const pageSource = readFileSync('src/subpackages/diagnosis/question-package.vue', 'utf8')
assert.equal((pageSource.match(/v-if="group\.showOutcomeLabel"/g) || []).length, 4)

console.log('question package result view tests passed')
