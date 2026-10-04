import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import type { CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'
import { eligibleV1PestQuestions } from '../../src/diagnosis/domain/pest-question-eligibility.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'
import { validateV1PackageAnswerMembership } from '../../src/diagnosis/domain/validate-v1-package-answer-membership.js'

/** unit_real_data / L1-L3：真实V1题目；Expected来自复用范围、动态选题合同及独立证据风险，不证明发布或HTTP。 */
const content = JSON.parse(
  readFileSync(
    join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),
    'utf8'
  )
) as { pestQuestions: CanonicalJsonObject[] }
function input(modes: readonly string[] = ['spider_mite']) {
  return {
    questions: content.pestQuestions,
    candidateModes: modes,
    lockedEvidenceKeys: [] as string[],
    lockedEvidenceGroups: [] as string[],
    directMatchedModes: [] as string[],
    evidenceGroupByKey: {} as Record<string, string>
  }
}
const topics = (questions: readonly CanonicalJsonObject[]) => questions.map(q => q.packageTopic)
describe('V1虫害素材确定性筛选', () => {
  test('仅保留候选对应题目及来源顺序，不自动施加题数阈值', () => {
    expect(topics(eligibleV1PestQuestions(input()))).toEqual([
      'spider_mite_webbing',
      'spider_mite_dots'
    ])
  })
  test('没有候选返回空素材，不默认为虫害或生成题目', () => {
    expect(eligibleV1PestQuestions(input([]))).toEqual([])
  })
  test('已有确切证据不再询问同一线索', () => {
    const f = input()
    f.lockedEvidenceKeys = ['fine_webbing']
    expect(topics(eligibleV1PestQuestions(f))).toEqual(['spider_mite_dots'])
  })
  test('仅受控上游给出的同组关系能抑制重复线索', () => {
    const f = input()
    f.evidenceGroupByKey = { fine_webbing: 'mite_presence', yellow_speckling: 'mite_presence' }
    f.lockedEvidenceGroups = ['mite_presence']
    expect(eligibleV1PestQuestions(f)).toEqual([])
  })
  test('没有同组映射时不得猜测普通黄叶等于叶螨证据', () => {
    const f = input()
    f.lockedEvidenceGroups = ['leaf_yellowing']
    expect(eligibleV1PestQuestions(f)).toHaveLength(2)
  })
  test('明确直匹配的候选不再重复生成确认题，但不输出诊断结论', () => {
    const f = input()
    f.directMatchedModes = ['spider_mite']
    expect(eligibleV1PestQuestions(f)).toEqual([])
  })
  test('单白粉虱已有核心证据组时排除糖水/煤污辅助问题', () => {
    const f = input(['whitefly'])
    f.lockedEvidenceGroups = ['white_flies']
    expect(topics(eligibleV1PestQuestions(f))).toEqual(['whitefly_nymphs'])
  })
  test('多候选仍保留未满足的辅助线索，候选交集与选项关联一致', () => {
    const f = input(['whitefly', 'aphid'])
    f.lockedEvidenceGroups = ['white_flies']
    const q = eligibleV1PestQuestions(f).find(q => q.packageTopic === 'surface_residue')!
    expect(q.candidateModes).toEqual(['whitefly', 'aphid'])
    expect((q.options as CanonicalJsonObject[])[0]!.mapsToModes).toEqual(['whitefly', 'aphid'])
  })
  test('触碰叶片的同意、风险和跳过提示完整保留', () => {
    const q = eligibleV1PestQuestions(input(['whitefly']))[0]!
    expect(q.requiresExplicitConsent).toBe(true)
    expect(q.skipOptionEnabled).toBe(true)
    expect(q.safetyInstructions).toEqual([
      '先确认手部安全',
      '只轻碰叶片边缘',
      '不方便操作时请选择跳过'
    ])
    expect(q.riskNotice).toContain('请直接跳过')
  })
  test.each([['root_rot'], ['yellow_leaf'], ['unknown_pest']])('拒绝扩张到未授权虫害 %j', modes => {
    expect(() => eligibleV1PestQuestions(input([modes]))).toThrow()
  })
  test('素材筛选不修改来源对象，产物不能被后续异步修改', () => {
    const before = JSON.stringify(content)
    const q = eligibleV1PestQuestions(input(['aphid']))
    expect(JSON.stringify(content)).toBe(before)
    expect(Object.isFrozen(q)).toBe(true)
    expect(Object.isFrozen(q[0])).toBe(true)
    expect(Object.isFrozen(q[0]!.options)).toBe(true)
  })
  test('过滤后题目能够锁定快照并作答，客户端多加一道题不能授权', () => {
    const questions = eligibleV1PestQuestions(input())
    const locked = lockQuestionPackageSnapshot({
      questionPackageReleaseRef: 'pest-fixture/v1',
      mode: 'specific_pest_visual',
      questionCount: questions.length,
      packageQuestions: questions
    })
    const submitted = {
      requestMode: 'answer_submit',
      answers: questions.map(q => ({ questionKey: q.questionKey, optionKey: 'unknown' }))
    }
    expect(validateV1PackageAnswerMembership(locked.snapshot, submitted).status).toBe(
      'valid_membership'
    )
    submitted.answers.push({ questionKey: 'client_invented', optionKey: 'unknown' })
    expect(validateV1PackageAnswerMembership(locked.snapshot, submitted).status).not.toBe(
      'valid_membership'
    )
  })
  test('非法证据与不属于候选的直匹配在生成前拒绝', () => {
    const f = input()
    f.lockedEvidenceKeys = [null as unknown as string]
    expect(() => eligibleV1PestQuestions(f)).toThrow()
    const g = input()
    g.directMatchedModes = ['whitefly']
    expect(() => eligibleV1PestQuestions(g)).toThrow()
  })
})

/** 本轮用户批准的独立题数Expected，不批准置信度阈值或自动直判。 */
import { selectV1PestQuestionSnapshot } from '../../src/diagnosis/domain/pest-question-eligibility.js'
const limits = { low: 3, medium: 2, high: 1, very_likely: 1, direct: 0 }
describe('已批准V1虫害限题承接', () => {
  test.each([
    ['low', 3],
    ['medium', 2],
    ['high', 1],
    ['very_likely', 1],
    ['direct', 0]
  ] as const)('%s明确限题为%i，不按浮点置信度猜档', (tier, count) => {
    const result = selectV1PestQuestionSnapshot({
      ...input(['whitefly', 'aphid']),
      tier,
      limits,
      questionPackageReleaseRef: 'pest-approved-fixture/v1'
    })
    expect(result.snapshot.snapshot.questionCount).toBe(count)
    expect(result.status).toBe(count === 0 ? 'no_questions' : 'questions_required')
  })
  test('优先覆盖不同候选，再按原素材顺序补题', () => {
    const result = selectV1PestQuestionSnapshot({
      ...input(['spider_mite', 'aphid']),
      tier: 'medium' as const,
      limits,
      questionPackageReleaseRef: 'pest-fixture/v1'
    })
    expect(topics(result.snapshot.snapshot.packageQuestions)).toEqual([
      'spider_mite_webbing',
      'aphid_clusters'
    ])
  })
  test('无档位和非法限题均拒绝，不隐式回退2题', () => {
    const f = { ...input(), tier: 'medium' as const, limits, questionPackageReleaseRef: 'pest-fixture/v1' }
    expect(() => selectV1PestQuestionSnapshot({ ...f, tier: '' as never })).toThrow()
    expect(() =>
      selectV1PestQuestionSnapshot({ ...f, limits: { ...limits, medium: null as never } })
    ).toThrow()
    expect(() =>
      selectV1PestQuestionSnapshot({ ...f, limits: { ...limits, medium: 1.5 } })
    ).toThrow()
  })
  test('证据全部覆盖时返回零题，不伪造问答或结论', () => {
    const f = input()
    f.lockedEvidenceKeys = ['fine_webbing', 'yellow_speckling']
    const r = selectV1PestQuestionSnapshot({
      ...f,
      tier: 'low',
      limits,
      questionPackageReleaseRef: 'pest-fixture/v1'
    })
    expect(r.status).toBe('no_questions')
    expect(r.snapshot.snapshot.packageQuestions).toEqual([])
    expect(r).not.toHaveProperty('outcome')
  })
})
