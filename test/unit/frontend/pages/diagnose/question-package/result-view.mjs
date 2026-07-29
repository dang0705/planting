import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildOutcomeAdviceGroups } from '../../../../../../src/pages/diagnose/question-package/result-view.js'

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

const pageSource = readFileSync('src/pages/diagnose/question-package.vue', 'utf8')
assert.equal((pageSource.match(/v-if="group\.showOutcomeLabel"/g) || []).length, 4)

console.log('question package result view tests passed')
