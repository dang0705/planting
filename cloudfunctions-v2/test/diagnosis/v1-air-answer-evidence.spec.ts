import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { findProjectRoot } from '../support/project-root.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'
import { validateV1AirAnswerEvidence } from '../../src/diagnosis/domain/validate-v1-air-answer-evidence.js'

// Expected：用户批准复用V1题包；compound-answer-contract.md明确的双数据一致性、归属及申报来源边界。
// L1 unit_fake：纯领域校验；表单为已知V1字段制品，未经过HTTP、真实用户档案或持久化。
const key = 'q_yellow_leaf__air_environment'
const question = { questionKey: key, questionType: 'air_environment', uiVariant: 'air_environment',
  options: [{ optionKey: 'air_environment_recorded' }, { optionKey: 'air_environment_unknown' }] }
const snapshot = { mode: 'yellow_leaf', questionCount: 1, packageQuestions: [question] }
const quick = { schemaVersion: 3, mode: 'quick', quickAnswer: { questionKey: 'air_exchange_frequency', optionKey: 'regular' }, advancedInput: null }
const advanced = { airExchange: { source: 'window', windowDirectionCount: 'one', windowOpenFrequency: 'daily' },
  canopyOpenness: 'open', deviceAirflow: { mode: 'direct', sources: ['fan'], directSources: ['fan'], sourceModes: { fan: 'direct' } } }
function payload(input: unknown = quick, source = 'temporary') {
  return { requestMode: 'answer_submit', answers: [{ questionKey: key, optionKey: 'air_environment_recorded' }],
    airEnvironmentByQuestionId: { [key]: input }, airEnvironmentSnapshotsByQuestionId: { [key]: { input, source } } }
}

describe('V1空气复合答案证据', () => {
  it('简易答案与快照一致，来源只作为未核验申报', () => {
    const result = validateV1AirAnswerEvidence(snapshot, payload())
    expect(result).toEqual({ status: 'valid_air_evidence', byQuestionId: {
      [key]: { input: quick, declaredSource: 'temporary', sourceVerification: 'unverified_client_declaration' }
    } })
  })
  it('完整详细表单及逐设备直吹保留', () => {
    const input = { schemaVersion: 3, mode: 'advanced', quickAnswer: null, advancedInput: advanced }
    expect(validateV1AirAnswerEvidence(snapshot, payload(input))).toMatchObject({ status: 'valid_air_evidence',
      byQuestionId: { [key]: { input } } })
  })
  it('兼容原始详细表单；关窗规范化，不伪造测量值', () => {
    const input = structuredClone(advanced)
    input.airExchange.windowDirectionCount = 'closed'
    expect(validateV1AirAnswerEvidence(snapshot, payload(input))).toMatchObject({ status: 'valid_air_evidence',
      byQuestionId: { [key]: { input: { airExchange: { source: 'window', windowDirectionCount: 'one', windowOpenFrequency: 'almost_never' } } } } })
  })
  it('新风及设备风兼容规则保留', () => {
    const input = { ...advanced, airExchange: { source: 'fresh_air' },
      deviceAirflow: { mode: 'circulating', sources: [], directSources: [] } }
    expect(validateV1AirAnswerEvidence(snapshot, payload(input))).toMatchObject({ status: 'valid_air_evidence',
      byQuestionId: { [key]: { input: { deviceAirflow: { mode: 'circulating', sources: ['fresh_air'], sourceModes: { fresh_air: 'circulating' }, directSources: [] } } } } })
  })
  it.each(['airEnvironmentByQuestionId', 'airEnvironmentSnapshotsByQuestionId'])('已填写但缺少%s时拒绝', field => {
    const submitted: Record<string, unknown> = payload(); delete submitted[field]
    expect(validateV1AirAnswerEvidence(snapshot, submitted).status).toBe('invalid_air_evidence')
  })
  it('表单与快照冲突时拒绝', () => {
    const submitted = payload(); submitted.airEnvironmentSnapshotsByQuestionId[key]!.input = { ...quick,
      quickAnswer: { questionKey: 'air_exchange_frequency', optionKey: 'rare' } }
    expect(validateV1AirAnswerEvidence(snapshot, submitted).status).toBe('invalid_air_evidence')
  })
  it.each([null, {}, { ...quick, schemaVersion: '3' }, { ...quick, quickAnswer: { questionKey: 'fake', optionKey: 'regular' } },
    { ...advanced, canopyOpenness: 'fake' }, { ...advanced, deviceAirflow: { mode: 'direct', sources: ['fan'] } }])('非法表单失败关闭：%j', input => {
    expect(validateV1AirAnswerEvidence(snapshot, payload(input)).status).toBe('invalid_air_evidence')
  })
  it('未知选项可无空气证据，但不能附带表单', () => {
    const submitted = { requestMode: 'answer_submit', answers: [{ questionKey: key, optionKey: 'air_environment_unknown' }] }
    expect(validateV1AirAnswerEvidence(snapshot, submitted)).toEqual({ status: 'valid_air_evidence', byQuestionId: {} })
    expect(validateV1AirAnswerEvidence(snapshot, { ...payload(), answers: submitted.answers }).status).toBe('invalid_air_evidence')
  })
  it('拒绝其他问题附带证据、非法来源、错误成员和客户端题包授权', () => {
    expect(validateV1AirAnswerEvidence(snapshot, { ...payload(), airEnvironmentByQuestionId: { fake: quick } }).status).toBe('invalid_air_evidence')
    expect(validateV1AirAnswerEvidence(snapshot, payload(quick, 'server_verified')).status).toBe('invalid_air_evidence')
    expect(validateV1AirAnswerEvidence(snapshot, { ...payload(), answers: [{ questionKey: key, optionKey: 'fake' }] }).status).toBe('invalid_answers')
    expect(validateV1AirAnswerEvidence(null, { ...payload(), questionPackage: snapshot }).status).toBe('invalid_snapshot')
  })
  it('保存申报不等于已保存；输出不可变且不带客户端内部字段', () => {
    const submitted = payload(quick, 'temporary_save_succeeded')
    const result = validateV1AirAnswerEvidence(snapshot, submitted)
    expect(result).toMatchObject({ status: 'valid_air_evidence', byQuestionId: { [key]: { sourceVerification: 'unverified_client_declaration' } } })
    if (result.status !== 'valid_air_evidence') {throw new Error('结果未通过')}
    expect(Object.isFrozen(result.byQuestionId[key]!.input)).toBe(true)
    expect(Object.isFrozen(result.byQuestionId)).toBe(true)
    expect(JSON.stringify(result)).not.toContain('profileUpdatedAt')
  })
})

// L3 unit_real_data：真实V1题目制品→服务端快照→成员→空气证据；不替代真实HTTP与用户归属验收。
describe('实际固定题包的空气复合证据', () => {
  const artifact = JSON.parse(fs.readFileSync(path.join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'), 'utf8'))
  it.each(['yellow_leaf', 'wilting_droop'])('%s在锁定题包内保留复合题，不能仅选已填写', mode => {
    const questions = artifact.fixed[mode] as { questionKey: string; questionType: string; options: { optionKey: string }[] }[]
    const locked = lockQuestionPackageSnapshot({ questionPackageReleaseRef: 'source-review/' + mode,
      mode, questionCount: questions.length, packageQuestions: questions })
    const air = questions.find(question => question.questionType === 'air_environment')!
    const submitted = { ...payload(), answers: questions.map(question => ({ questionKey: question.questionKey,
      optionKey: question === air ? 'air_environment_recorded' : question.options[0]!.optionKey })),
      airEnvironmentByQuestionId: { [air.questionKey]: quick },
      airEnvironmentSnapshotsByQuestionId: { [air.questionKey]: { input: quick, source: 'temporary' } } }
    expect(validateV1AirAnswerEvidence(locked.snapshot, submitted).status).toBe('valid_air_evidence')
    expect(validateV1AirAnswerEvidence(locked.snapshot, { ...submitted, airEnvironmentSnapshotsByQuestionId: {} }).status).toBe('invalid_air_evidence')
  })
})
