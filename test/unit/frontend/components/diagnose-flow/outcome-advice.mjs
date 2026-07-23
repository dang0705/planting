import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { useDiagnoseOutcomeAdvice } from '../../../../../src/components/diagnose-flow/outcome-advice.js'

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

const resultStageSource = readFileSync(
  'src/components/diagnose-flow/DiagnoseResultStage.vue',
  'utf8'
)
assert.equal((resultStageSource.match(/v-if="group\.showOutcomeLabel"/g) || []).length, 2)

console.log('diagnose outcome advice tests passed')
