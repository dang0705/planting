import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { useDiagnoseOutcomeAdvice } from '../../../../../../src/subpackages/diagnosis/diagnose-flow/outcome-advice.js'

const advice = useDiagnoseOutcomeAdvice({
  uniqueStrings(values = []) {
    return Array.from(
      new Set((Array.isArray(values) ? values : []).map(item => String(item || '').trim()))
    ).filter(Boolean)
  }
})

const getActionAdvice = outcome => outcome.actionAdviceItems

const singleOutcomeGroups = advice.buildOutcomeAdviceGroups({
  outcomeSources: [
    { outcomeKey: 'thrips', displayNameCn: '蓟马', actionAdviceItems: ['隔离观察'] }
  ],
  getOutcomeItems: getActionAdvice
})
assert.equal(singleOutcomeGroups.length, 1)
assert.equal(singleOutcomeGroups[0].showOutcomeLabel, false)

const multipleOutcomeGroups = advice.buildOutcomeAdviceGroups({
  outcomeSources: [
    { outcomeKey: 'thrips', displayNameCn: '蓟马', actionAdviceItems: ['隔离观察'] },
    { outcomeKey: 'aphid', displayNameCn: '蚜虫', actionAdviceItems: ['检查嫩梢'] }
  ],
  getOutcomeItems: getActionAdvice
})
assert.equal(multipleOutcomeGroups.length, 2)
assert.ok(multipleOutcomeGroups.every(group => group.showOutcomeLabel))

const sharedProfileGroups = advice.buildOutcomeAdviceGroups({
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
  sharedSymptomLabels: ['新叶脉间黄化', '长期营养不足']
})
assert.equal(sharedProfileGroups.length, 1)
assert.equal(sharedProfileGroups[0].key, 'action_nutrient_support_basic')
assert.equal(sharedProfileGroups[0].displayLabel, '新叶脉间黄化、长期营养不足')

const resultStageSource = readFileSync(
  'src/subpackages/diagnosis/diagnose-flow/DiagnoseResultStage.vue',
  'utf8'
)
assert.equal((resultStageSource.match(/v-if="group\.showOutcomeLabel"/g) || []).length, 2)

console.log('diagnose outcome advice tests passed')
