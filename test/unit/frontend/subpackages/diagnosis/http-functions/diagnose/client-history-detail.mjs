import assert from 'node:assert/strict'

import { normalizeHistoryDetail } from '../../../../../../../src/subpackages/diagnosis/http-functions/diagnose/client-history-detail.js'

const normalized = normalizeHistoryDetail({
  _id: 'history_public_1',
  topProblemKey: 'aphids_visible',
  symptoms: [{ symptomKey: 'aphids_visible' }],
  summary: '需要进一步确认'
})

assert.equal(normalized.finalResult.displayName, '待进一步确认')
assert.deepEqual(normalized.observedSymptoms, [
  {
    symptomKey: 'aphids_visible',
    symptomCn: '待确认症状',
    confidence: 0,
    source: 'mixed'
  }
])
assert.doesNotMatch(
  JSON.stringify({
    displayName: normalized.finalResult.displayName,
    symptomCn: normalized.observedSymptoms[0]?.symptomCn
  }),
  /aphids_visible/,
  '历史结果不得把机器 key 作为展示文案'
)

console.log('diagnosis history detail public labels passed')
