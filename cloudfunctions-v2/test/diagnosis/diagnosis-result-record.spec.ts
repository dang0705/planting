import { expect, test } from 'vitest'
import { lockDiagnosisResultRecord } from '../../src/diagnosis/domain/diagnosis-result-record.js'
/** unit_real_data/L1：Expected来自冻结公开Schema、结果回放要求及本增量记录合同；无SQL/模型。 */
import { resultFixture } from '../support/diagnosis-result-record-fixture.js'
test('完整记录锁定，所有内容参与摘要并冻结；不授予知识发布', () => {
  const input = resultFixture()
  const a = lockDiagnosisResultRecord(input)
  expect(a.record).toEqual(input)
  expect(Object.isFrozen(a.record.replay)).toBe(true)
  const b = resultFixture()
  b.publicResult.summaryZh += '补充'
  expect(lockDiagnosisResultRecord(b).recordSha256).not.toBe(a.recordSha256)
  expect(a.record.publicResult).not.toHaveProperty('knowledgeReleaseRef')
})
test.each([
  'missing_trace',
  'empty_input',
  'extra_public',
  'extra_replay',
  'wrong_hash',
  'broken_question',
  'wrong_model',
  'non_json'
])('非法%s拒绝', kind => {
  const v: any = resultFixture()
  if (kind === 'missing_trace') {
    delete v.replay.decisionTrace
  }
  if (kind === 'empty_input') {
    v.replay.inputSnapshot = {}
  }
  if (kind === 'extra_public') {
    v.publicResult.rawPrompt = '不允许'
  }
  if (kind === 'extra_replay') {
    v.replay.rawPrompt = '不允许'
  }
  if (kind === 'wrong_hash') {
    v.replay.knowledgePackageSha256 = 'bad'
  }
  if (kind === 'broken_question') {
    v.replay.questionPackage.snapshotSha256 = 'c'.repeat(64)
  }
  if (kind === 'wrong_model') {
    v.replay.modelBinding = { modelCode: 'other' }
  }
  if (kind === 'non_json') {
    v.replay.inputSnapshot.date = new Date()
  }
  expect(() => lockDiagnosisResultRecord(v)).toThrow()
})
