import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validateV1PackageAnswerMembership } from '../../src/diagnosis/domain/validate-v1-package-answer-membership.js'

/**
 * L1 / unit_real_data：用户批准复用V1三类题包；Expected来自固化的真实V1题目制品及服务端快照授权合同。
 * 实际经过V2成员校验，无题包、选项或领域替身。不证明会话归属、复合证据、发布或HTTP。
 */
const catalog = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'), 'utf8')) as {
  fixed: Record<string, Record<string, unknown>[]>
  pestQuestions: Record<string, unknown>[]
}
function snapshot(mode = 'yellow_leaf') {
  const packageQuestions = structuredClone(catalog.fixed[mode]!)
  return { mode, questionCount: packageQuestions.length, packageQuestions }
}
function request(pack: ReturnType<typeof snapshot>) {
  return { requestMode: 'answer_submit', answers: pack.packageQuestions.map(q => ({
    questionKey: q.questionKey,
    optionKey: ((q.options as { optionKey: string }[]).find(option => option.optionKey === 'air_environment_unknown') ?? (q.options as { optionKey: string }[])[0]!).optionKey,
  })) }
}

describe('V1题包复用的服务端成员授权', () => {
  test.each([['yellow_leaf', 4], ['wilting_droop', 6]])('保留%s真实题数与题目顺序，不统一成四题', (mode, count) => {
    const pack = snapshot(mode as string)
    expect(pack.questionCount).toBe(count)
    expect(validateV1PackageAnswerMembership(pack, request(pack))).toEqual({
      status: 'valid_membership', answers: request(pack).answers, requiredEvidenceKinds: [],
    })
  })
  test('客户端伪造题包和选项不改变服务端授权', () => {
    const pack = snapshot()
    const submitted = request(pack)
    submitted.answers[0]!.optionKey = 'client_added'
    expect(validateV1PackageAnswerMembership(pack, { ...submitted, questionPackage: { ...pack, packageQuestions: [{ questionKey: submitted.answers[0]!.questionKey, options: [{ optionKey: 'client_added' }] }] } })).toEqual({ status: 'invalid_answers' })
  })
  test.each(['answer_revision', '', null])('首次整包提交不能使用%s', requestMode => {
    const pack = snapshot()
    expect(validateV1PackageAnswerMembership(pack, { ...request(pack), requestMode })).toEqual({ status: 'invalid_answers' })
  })
  test('缺题、重题、额外题和未知选项均拒绝，不产生部分有效答案', () => {
    const pack = snapshot()
    const submitted = request(pack)
    for (const answers of [submitted.answers.slice(1), [...submitted.answers, submitted.answers[0]], [submitted.answers[0], submitted.answers[0], ...submitted.answers.slice(2)], [{ ...submitted.answers[0], questionKey: 'unknown' }, ...submitted.answers.slice(1)]]) {
      expect(validateV1PackageAnswerMembership(pack, { ...submitted, answers })).toEqual({ status: 'invalid_answers' })
    }
  })
  test('养护时间线只在服务端题目声明时授权，并要求后续单独验证复合证据', () => {
    const pack = snapshot()
    const submitted = request(pack)
    submitted.answers[0]!.optionKey = 'care_behavior_timeline'
    expect(validateV1PackageAnswerMembership(pack, submitted)).toEqual({
      status: 'valid_membership', answers: submitted.answers, requiredEvidenceKinds: ['care_behavior_timeline'],
    })
    pack.packageQuestions[0]!.uiVariant = ''
    expect(validateV1PackageAnswerMembership(pack, submitted)).toEqual({ status: 'invalid_answers' })
  })
  test('空气环境已填写选项要求后续验证实际证据，不能据此创建养护事实', () => {
    const pack = snapshot()
    const submitted = request(pack)
    submitted.answers[3]!.optionKey = 'air_environment_recorded'
    expect(validateV1PackageAnswerMembership(pack, submitted)).toEqual({
      status: 'valid_membership', answers: submitted.answers, requiredEvidenceKinds: ['air_environment'],
    })
  })
  test.each([1, 2, 3])('虫害动态题包按服务端实际%d题授权', count => {
    const questions = structuredClone(catalog.pestQuestions.slice(0, count))
    const pack = { mode: 'specific_pest_visual', questionCount: count, packageQuestions: questions }
    expect(validateV1PackageAnswerMembership(pack, request(pack)).status).toBe('valid_membership')
  })
  test('虫害零题保留直判路径，不接受伪造空答案提交', () => {
    expect(validateV1PackageAnswerMembership({ mode: 'specific_pest_visual', questionCount: 0, packageQuestions: [] }, { requestMode: 'answer_submit', answers: [] })).toEqual({ status: 'not_answerable' })
  })
  test.each([
    { mode: 'root_rot', questionCount: 0, packageQuestions: [] },
    { mode: 'unknown', questionCount: 0, packageQuestions: [] },
    { ...snapshot(), questionCount: null },
    { ...snapshot(), questionCount: 3 },
    { ...snapshot(), packageQuestions: [snapshot().packageQuestions[0], snapshot().packageQuestions[0]] },
  ])('不支持的模式或损坏快照不能授权%#', pack => {
    expect(validateV1PackageAnswerMembership(pack, { requestMode: 'answer_submit', answers: [] })).toEqual({ status: 'invalid_snapshot' })
  })
  test('按快照顺序输出新答案对象，调用方不能通过修改结果改写原提交', () => {
    const pack = snapshot()
    const submitted = request(pack)
    const expected = structuredClone(submitted.answers)
    submitted.answers.reverse()
    const result = validateV1PackageAnswerMembership(pack, submitted)
    if (result.status !== 'valid_membership') { throw new Error('应有合法成员') }
    expect(result.answers).toEqual(expected)
    expect(result.answers[0]).not.toBe(submitted.answers.at(-1))
    expect(Object.isFrozen(result.answers[0])).toBe(true)
  })
})
