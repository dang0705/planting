import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { calculateCanonicalJsonSha256 } from '../../src/foundation/json/canonical-json-sha256.js'
import { resolveFixedQuestionPackageRelease } from '../../src/diagnosis/domain/fixed-question-release.js'

/** unit_real_data / L1：真实V1复用题目制品；发布元数据为测试夹具，不证明CMS审核或活动版本存在。 */
const contents = JSON.parse(
  readFileSync(
    join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),
    'utf8'
  )
)
const content = {
  contractVersion: 'diagnosis-fixed-question-packages/v1',
  sourceRef: 'models/diagnosis/v1-reuse/questions.json',
  sourceSha256: '40385731fe0ed7d20c9331b1be6aee10c13ebb900350a4576c14edd0ea07107f',
  packages: contents.fixed
}
function row() {
  const sha = calculateCanonicalJsonSha256(content)
  return {
    release_ref: 'bpr_question123',
    domain_code: 'diagnosis',
    policy_code: 'fixed_question_packages',
    schema_version: 'diagnosis-fixed-question-packages/v1',
    release_version: 'v1',
    content_sha256: sha,
    policy_json: content,
    status: 'active',
    effective_at_ms: '1000',
    expires_at_ms: null,
    verified_at_ms: '900',
    active_release_version: 'v1',
    active_content_sha256: sha,
    release_openid: '',
    pointer_openid: ''
  }
}
describe('固定题包发布准入', () => {
  test.each([
    ['yellow_leaf', 4],
    ['wilting_droop', 6]
  ] as const)('按同一发布锁定%s的真实题目', (mode, count) => {
    const result = resolveFixedQuestionPackageRelease([row()], mode, 1500)
    expect(result.status).toBe('available')
    if (result.status !== 'available') {
      throw new Error('发布未通过')
    }
    expect(result.snapshot.snapshot.questionCount).toBe(count)
    expect(result.snapshot.snapshot.questionPackageReleaseRef).toBe('bpr_question123')
    expect(Object.isFrozen(result.snapshot.snapshot.packageQuestions[0])).toBe(true)
  })
  test('空发布不可用，重复活动记录非法', () => {
    expect(resolveFixedQuestionPackageRelease([], 'yellow_leaf', 1500).status).toBe('unavailable')
    expect(resolveFixedQuestionPackageRelease([row(), row()], 'yellow_leaf', 1500).status).toBe(
      'invalid'
    )
  })
  test.each([{ status: 'draft' }, { status: 'retired' }, { expires_at_ms: '1500' }])(
    '非有效active发布不运行 %j',
    extra =>
      expect(
        resolveFixedQuestionPackageRelease([{ ...row(), ...extra }], 'yellow_leaf', 1500).status
      ).toBe('unavailable')
  )
  test('未生效与时间非法分开，不能自动启用候选', () => {
    expect(resolveFixedQuestionPackageRelease([row()], 'yellow_leaf', 999).status).toBe(
      'not_effective'
    )
    expect(resolveFixedQuestionPackageRelease([row()], 'yellow_leaf', NaN).status).toBe('invalid')
  })
  test.each([
    { active_content_sha256: 'a'.repeat(64) },
    { active_release_version: 'v2' },
    { domain_code: 'care' },
    { verified_at_ms: null },
    { verified_at_ms: '1001' },
    { release_openid: 'openid' },
    { effective_at_ms: '9007199254740992' }
  ])('拒绝范围、摘要或验证元数据损坏 %j', extra =>
    expect(
      resolveFixedQuestionPackageRelease([{ ...row(), ...extra }], 'yellow_leaf', 1500).status
    ).toBe('invalid')
  )
  test('正文额外元数据不能绕过Schema', () => {
    const value = { ...content, status: 'active' }
    expect(
      resolveFixedQuestionPackageRelease(
        [{ ...row(), policy_json: value, content_sha256: calculateCanonicalJsonSha256(value) }],
        'yellow_leaf',
        1500
      ).status
    ).toBe('invalid')
  })
  test('原始题目内容变化但摘要未变化时拒绝', () => {
    const value = structuredClone(content)
    value.packages.yellow_leaf[0].questionKey = 'tampered'
    expect(
      resolveFixedQuestionPackageRelease([{ ...row(), policy_json: value }], 'yellow_leaf', 1500)
        .status
    ).toBe('invalid')
  })
})
