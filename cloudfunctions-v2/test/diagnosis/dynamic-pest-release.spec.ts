import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { calculateCanonicalJsonSha256 } from '../../src/foundation/json/canonical-json-sha256.js'
import { resolveDynamicPestQuestionRelease } from '../../src/diagnosis/domain/dynamic-pest-release.js'

/** unit_real_data / L1：实际V1素材，审核元数据是夹具；Expected来自动态发布合同与已批准题数，不证明线上发布。 */
const raw = JSON.parse(
  readFileSync(
    join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),
    'utf8'
  )
)
const content = {
  contractVersion: 'diagnosis-dynamic-pest-question-packages/v1',
  sourceRef: 'models/diagnosis/v1-reuse/questions.json',
  sourceSha256: '40385731fe0ed7d20c9331b1be6aee10c13ebb900350a4576c14edd0ea07107f',
  questions: raw.pestQuestions,
  tierQuestionLimits: { low: 3, medium: 2, high: 1, very_likely: 1, direct: 0 },
  evidenceGroupByKey: {}
}
function row() {
  const sha = calculateCanonicalJsonSha256(content)
  return {
    release_ref: 'bpr_pest12345',
    domain_code: 'diagnosis',
    policy_code: 'dynamic_pest_question_packages',
    schema_version: content.contractVersion,
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
describe('动态虫害发布准入', () => {
  test('真实素材与已批准题数成组返回不可变发布', () => {
    const r = resolveDynamicPestQuestionRelease([row()], 1500)
    expect(r.status).toBe('available')
    if (r.status !== 'available') {
      throw new Error('未准入')
    }
    expect(r.release.questions).toHaveLength(14)
    expect(r.release.tierQuestionLimits).toEqual({
      low: 3,
      medium: 2,
      high: 1,
      very_likely: 1,
      direct: 0
    })
    expect(Object.isFrozen(r.release.questions[0])).toBe(true)
    expect(r.release.releaseRef).toBe('bpr_pest12345')
  })
  test('缺发布、重复活动行与无效时间不隐式启用来源文件', () => {
    expect(resolveDynamicPestQuestionRelease([], 1500).status).toBe('unavailable')
    expect(resolveDynamicPestQuestionRelease([row(), row()], 1500).status).toBe('invalid')
    expect(resolveDynamicPestQuestionRelease([row()], NaN).status).toBe('invalid')
    expect(resolveDynamicPestQuestionRelease([row()], 999).status).toBe('not_effective')
  })
  test.each([{ status: 'draft' }, { status: 'retired' }, { expires_at_ms: '1500' }])(
    '不可运行发布不返回素材 %j',
    extra => {
      expect(resolveDynamicPestQuestionRelease([{ ...row(), ...extra }], 1500)).toEqual({
        status: 'unavailable'
      })
    }
  )
  test.each([
    { policy_code: 'fixed_question_packages' },
    { domain_code: 'care' },
    { active_content_sha256: 'a'.repeat(64) },
    { active_release_version: 'v2' },
    { verified_at_ms: null },
    { verified_at_ms: '1001' },
    { release_openid: 'openid' },
    { pointer_openid: 'openid' },
    { schema_version: 'v2' },
    { effective_at_ms: '9007199254740992' }
  ])('损坏发布元数据拒绝 %j', extra => {
    expect(resolveDynamicPestQuestionRelease([{ ...row(), ...extra }], 1500)).toEqual({
      status: 'invalid'
    })
  })
  test.each(['limits', 'extra', 'question', 'safety', 'unknown_mode', 'group'] as const)(
    '正文%s损坏即使重算摘要也拒绝',
    kind => {
      const c = structuredClone(content)
      if (kind === 'limits') {
        c.tierQuestionLimits.medium = 3
      }
      if (kind === 'extra') {
        Object.assign(c, { threshold: 0.95 })
      }
      if (kind === 'question') {
        c.questions[0].questionKey = c.questions[1].questionKey
      }
      if (kind === 'safety') {
        delete c.questions[4].riskNotice
      }
      if (kind === 'unknown_mode') {
        c.questions[0].candidateModes = ['root_rot']
      }
      if (kind === 'group') {
        c.evidenceGroupByKey = { fine_webbing: 3 } as never
      }
      const sha = calculateCanonicalJsonSha256(c)
      expect(
        resolveDynamicPestQuestionRelease(
          [{ ...row(), policy_json: c, content_sha256: sha, active_content_sha256: sha }],
          1500
        )
      ).toEqual({ status: 'invalid' })
    }
  )
  test('正文改写但摘要没变时拒绝', () => {
    const c = structuredClone(content)
    c.questions[0].text = '被改写'
    expect(resolveDynamicPestQuestionRelease([{ ...row(), policy_json: c }], 1500).status).toBe(
      'invalid'
    )
  })
})
