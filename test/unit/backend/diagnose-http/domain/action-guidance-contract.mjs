import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  ACTION_CATEGORY_DEFINITIONS,
  normalizeActionItem,
  normalizeActionItems,
  normalizeActionProfile
} = require('../../../../../cloudfunctions/diagnose-http/domain/action-guidance-contract.js')

const spiderMiteAction = {
  id: 'act_test_spider_mite_kill_01',
  categoryId: 'pest_kill_treatment',
  stage: 'today',
  methodId: 'foliar_spray',
  text: '确认后按标签进行杀虫/杀螨处理。',
  sourceRefIds: ['umn-spider-mites', 'ucipm-houseplant-problems']
}

const normalized = normalizeActionItem(spiderMiteAction, {
  profileKey: 'action_test',
  index: 0
})
assert.equal(normalized.valid, true)
assert.equal(normalized.item.categoryNameCn, '杀虫/杀螨处理')
assert.equal(ACTION_CATEGORY_DEFINITIONS.disease_kill_treatment.categoryNameCn, '杀菌处理')

const invalid = normalizeActionItem(
  {
    ...spiderMiteAction,
    categoryId: 'targeted_treatment',
    sourceRefIds: ['unregistered-source']
  },
  { profileKey: 'action_test', index: 1 }
)
assert.equal(invalid.valid, false)
assert.ok(invalid.errors.includes('invalid_category_id'))
assert.ok(invalid.errors.includes('unknown_source_ref:unregistered-source'))

const duplicateResult = normalizeActionItems([spiderMiteAction, spiderMiteAction], {
  profileKey: 'action_test'
})
assert.equal(duplicateResult.items.length, 1)
assert.ok(duplicateResult.errors.some(item => item.error === 'duplicate_id'))

const profile = normalizeActionProfile({
  actionProfileKey: 'action_test',
  actionItems: [
    spiderMiteAction,
    {
      id: 'act_test_safety_01',
      categoryId: 'treatment_safety',
      stage: 'avoid',
      methodId: 'avoid_mixing_products',
      text: '不要混用药剂。',
      sourceRefIds: ['ucipm-houseplant-problems']
    }
  ],
  todayActions: ['旧字段不应覆盖结构化动作'],
  avoidActions: ['旧规避字段不应覆盖结构化动作']
})
assert.equal(profile.hasStructuredActionItems, true)
assert.deepEqual(profile.todayActions, ['确认后按标签进行杀虫/杀螨处理。'])
assert.deepEqual(profile.avoidActions, ['不要混用药剂。'])
assert.equal(profile.actionItems[1].categoryNameCn, '用药注意事项')

console.log('action guidance contract tests passed')
