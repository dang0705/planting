/* oxlint-disable no-console, no-magic-numbers */
import assert from 'node:assert/strict'

import { buildSharedOutcomeAdviceGroups } from '../../../../../../src/subpackages/diagnosis/utils/outcome-advice-groups.js'

const getOutcomeKey = outcome => outcome.outcomeKey
const getOutcomeLabel = outcome => outcome.displayNameCn
const getActionItems = outcome => outcome.actionAdviceItems
const getAvoidItems = outcome => outcome.avoidAdviceItems

const sharedProfileGroups = buildSharedOutcomeAdviceGroups({
  outcomeSources: [
    {
      outcomeKey: 'iron_deficiency',
      actionProfileKey: 'action_nutrient_support_basic',
      displayNameCn: '缺铁/新叶脉间黄化',
      actionAdviceItems: ['先核对最近 1-2 个生长周期是否长期未补肥'],
      avoidAdviceItems: ['不要一次性重肥猛补']
    },
    {
      outcomeKey: 'nitrogen_deficiency',
      actionProfileKey: 'action_nutrient_support_basic',
      displayNameCn: '缺氮/长期营养不足',
      actionAdviceItems: ['若植株仍在生长期，可从低浓度、少量补肥开始'],
      avoidAdviceItems: ['也不要和大幅浇水调整同时进行']
    },
    {
      outcomeKey: 'weak_nutrition',
      actionProfileKey: 'action_nutrient_support_basic',
      displayNameCn: '营养供给偏弱',
      actionAdviceItems: ['先观察新叶和整体长势'],
      avoidAdviceItems: ['先不要连续叠加多种肥料']
    }
  ],
  getOutcomeKey,
  getOutcomeLabel,
  getActionItems,
  getAvoidItems,
  sharedSymptomLabels: [
    { symptomKey: 's1', symptomCn: '新叶脉间黄化' },
    { symptomKey: 's2', symptomCn: '长期营养不足' },
    { symptomKey: 's3', symptomCn: '整体长势偏弱' }
  ]
})

assert.equal(sharedProfileGroups.actionGroups.length, 1)
assert.equal(sharedProfileGroups.avoidGroups.length, 1)
assert.equal(sharedProfileGroups.actionGroups[0].key, 'action_nutrient_support_basic')
assert.equal(
  sharedProfileGroups.actionGroups[0].key,
  sharedProfileGroups.avoidGroups[0].key,
  '建议和暂时避免必须共享同一主键'
)
assert.equal(
  sharedProfileGroups.actionGroups[0].displayLabel,
  '新叶脉间黄化、长期营养不足、整体长势偏弱'
)
assert.equal(
  sharedProfileGroups.avoidGroups[0].displayLabel,
  '新叶脉间黄化、长期营养不足、整体长势偏弱'
)
assert.equal(sharedProfileGroups.actionGroups[0].items.length, 3)
assert.equal(sharedProfileGroups.avoidGroups[0].items.length, 3)

const sameTextDifferentProfiles = buildSharedOutcomeAdviceGroups({
  outcomeSources: [
    {
      outcomeKey: 'a',
      actionProfileKey: 'action_a',
      displayNameCn: '表现 A',
      actionAdviceItems: ['同一条建议'],
      avoidAdviceItems: ['同一条暂时避免']
    },
    {
      outcomeKey: 'b',
      actionProfileKey: 'action_b',
      displayNameCn: '表现 B',
      actionAdviceItems: ['同一条建议'],
      avoidAdviceItems: ['同一条暂时避免']
    }
  ],
  getOutcomeKey,
  getOutcomeLabel,
  getActionItems,
  getAvoidItems
})

assert.deepEqual(
  sameTextDifferentProfiles.actionGroups.map(group => group.key),
  ['action_a', 'action_b'],
  '文案相同但主键不同，不得仅按文案合并'
)
assert.deepEqual(
  sameTextDifferentProfiles.avoidGroups.map(group => group.key),
  ['action_a', 'action_b'],
  '建议和暂时避免应按同一主键分别归组'
)

const fallbackGroups = buildSharedOutcomeAdviceGroups({
  outcomeSources: [],
  getOutcomeKey,
  getOutcomeLabel,
  getActionItems,
  getAvoidItems,
  fallbackActionItems: ['没有具体结论时的通用建议'],
  fallbackAvoidItems: ['没有具体结论时的暂时避免']
})
assert.deepEqual(fallbackGroups.actionGroups[0].items, ['没有具体结论时的通用建议'])
assert.deepEqual(fallbackGroups.avoidGroups[0].items, ['没有具体结论时的暂时避免'])
assert.equal(fallbackGroups.actionGroups[0].key, '__fallback__')
assert.equal(fallbackGroups.avoidGroups[0].key, '__fallback__')

console.log('outcome advice group tests passed')
