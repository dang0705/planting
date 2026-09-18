import assert from 'node:assert/strict'

/* oxlint-disable no-console -- unit contract emits a concise result. */

import {
  buildDiagnosisHistoryTimelineItems,
  resolveDiagnosisHistoryOutcomeLabel,
  resolveDiagnosisHistoryOutcomeTypeLabel
} from '../../../../src/utils/diagnosis-history-timeline.js'

const records = [
  {
    resultId: 'diagnosis-latest',
    createdAt: '2026-09-18T09:05:00+08:00',
    outcomeType: 'problematic',
    summary: { displayName: '叶片状态较弱' }
  },
  {
    historyId: 'diagnosis-older',
    createdAt: '2026-09-12T08:10:00+08:00',
    outcomeType: 'non_problematic',
    nonProblematicLabel: '长期稳定的品种纹路',
    summary: { displayName: '暂未见明显问题' }
  }
]

const timeline = buildDiagnosisHistoryTimelineItems(records)

const timelineWithPendingRecord = buildDiagnosisHistoryTimelineItems([
  {
    resultId: 'diagnosis-pending',
    createdAt: '2026-09-18T10:05:00+08:00',
    outcomeType: '',
    summary: { displayName: '待确认' }
  },
  {
    resultId: 'diagnosis-uncertain',
    createdAt: '2026-09-17T10:05:00+08:00',
    outcomeType: 'uncertain',
    summary: { displayName: '暂不能稳定判断' }
  }
])

assert.deepEqual(
  timelineWithPendingRecord.map(item => item.recordId),
  ['diagnosis-uncertain'],
  '待确认记录不应进入诊断历史，已有不确定结论仍应保留'
)

assert.deepEqual(
  timeline.map(item => ({
    recordId: item.recordId,
    dateLabel: item.dateLabel,
    timeLabel: item.timeLabel,
    outcomeLabel: item.outcomeLabel,
    outcomeTypeLabel: item.outcomeTypeLabel
  })),
  [
    {
      recordId: 'diagnosis-latest',
      dateLabel: '09月18日',
      timeLabel: '09:05',
      outcomeLabel: '叶片状态较弱',
      outcomeTypeLabel: '有问题'
    },
    {
      recordId: 'diagnosis-older',
      dateLabel: '09月12日',
      timeLabel: '08:10',
      outcomeLabel: '暂未见明显问题',
      outcomeTypeLabel: '未见明确问题'
    }
  ]
)

assert.equal(
  resolveDiagnosisHistoryOutcomeLabel({
    outcomeType: 'problematic',
    topProblemKey: 'leaf_yellowing',
    summary: { displayName: 'leaf_yellowing' }
  }),
  '需要关注'
)
assert.equal(
  resolveDiagnosisHistoryOutcomeLabel({
    outcomeType: 'problematic',
    summary: { displayName: 'leafYellowing' }
  }),
  '需要关注'
)
assert.equal(resolveDiagnosisHistoryOutcomeTypeLabel({ outcomeType: 'uncertain' }), '仍需谨慎观察')

console.log(
  'diagnosis history timeline display contract passed data_mode=unit_fake test_kind=source_contract'
)
