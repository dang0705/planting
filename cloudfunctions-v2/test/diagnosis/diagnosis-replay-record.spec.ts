import { expect, test } from 'vitest'
import { lockDiagnosisResultRecord } from '../../src/diagnosis/domain/diagnosis-result-record.js'
import { resultFixture } from '../support/diagnosis-result-record-fixture.js'
/** unit_fake/L1：Expected来自整体计划的输入/版本/安全门回放要求和内部回放合同；不证明证据或知识真实。 */
test.each([
  'missing_input_version',
  'future_evidence',
  'bad_evidence_hash',
  'duplicate_evidence',
  'unknown_evidence',
  'unknown_outcome',
  'missing_gate',
  'blocked_proposal',
  'duplicate_action_index',
  'wrong_assessment',
  'extra_trace'
])('回放%s必须拒绝', issue => {
  const v: any = resultFixture(),
    input = v.replay.inputSnapshot,
    trace = v.replay.decisionTrace
  if (issue === 'missing_input_version') {
    delete input.contractVersion
  }
  if (issue === 'future_evidence') {
    input.evidences[0].occurredAtMs = input.capturedAtMs + 1
  }
  if (issue === 'bad_evidence_hash') {
    input.evidences[0].contentSha256 = 'c'.repeat(64)
  }
  if (issue === 'duplicate_evidence') {
    input.evidences.push(structuredClone(input.evidences[0]))
  }
  if (issue === 'unknown_evidence') {
    trace.outcomes[0].evidenceRefs = ['ev_not_present']
  }
  if (issue === 'unknown_outcome') {
    trace.actions[0].outcomeCode = 'not_present'
  }
  if (issue === 'missing_gate') {
    delete trace.actions[0].gates.risk
  }
  if (issue === 'blocked_proposal') {
    trace.actions[0].gates.contraindications = 'block'
  }
  if (issue === 'duplicate_action_index') {
    const a = structuredClone(trace.actions[0])
    a.actionCode = 'other'
    a.mappingCode = 'other-mapping'
    trace.actions.push(a)
  }
  if (issue === 'wrong_assessment') {
    trace.assessment.isolation.value = 'not_required'
  }
  if (issue === 'extra_trace') {
    trace.rawPrompt = '禁止'
  }
  expect(() => lockDiagnosisResultRecord(v)).toThrow()
})
test('行动因禁忌被暂缓可回放但不能进入公开建议', () => {
  const v: any = resultFixture()
  v.replay.decisionTrace.actions[0].disposition = 'withheld'
  v.replay.decisionTrace.actions[0].publicActionIndex = null
  v.replay.decisionTrace.actions[0].gates.contraindications = 'block'
  v.publicResult.recommendedActions = []
  expect(lockDiagnosisResultRecord(v).record.publicResult.recommendedActions).toEqual([])
})
