import { describe, expect, test, vi } from 'vitest'
import { createMysqlSourceClaimEvidenceReader } from '../../src/diagnosis/repository/mysql-source-claim-evidence-reader.js'
import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'

/**
 * L1 / unit_fake。Expected来自009中精确来源修订及来源/许可/适用性字段合同。
 * 真实执行Repository的SQL参数、字段转换和完整性检查；仅替换mysql2连接。
 * 不证明来源已获人工准入、真实数据库或HTTP，读取结果不得充当已验证依赖。
 */
const ref = { sourceCode: 'extension', claimCode: 'yellow-multicausal', revisionNo: 0 }
const row = {
  source_code: 'extension', claim_code: 'yellow-multicausal', revision_no: 0,
  source_openid: '', claim_openid: '', organization_zh: '机构资料', title_zh: '黄叶排查',
  locator_url: 'https://example.org/guide', source_type: 'institution_guide',
  license_scope: 'requires_editor_review', source_state: 'verified',
  source_verified_at_ms: '1000', source_locator: '第二节', claim_zh: '黄叶可能由多个原因引起。',
  applicability_json: { taxa: ['test-taxon'], scenario: 'container' }, claim_role: 'support',
  evidence_sha256: 'a'.repeat(64), claim_verified_at_ms: '1100',
}
function fixture(rows: readonly Record<string, unknown>[]) {
  const query = vi.fn<Mysql2QueryConnection['query']>().mockResolvedValue(rows)
  const connection: Mysql2QueryConnection = {
    query, execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(),
    release: vi.fn(), destroy: vi.fn(),
  }
  const getConnection = vi.fn(async () => connection)
  return { reader: createMysqlSourceClaimEvidenceReader({ getConnection }), getConnection, connection, query }
}

describe('精确来源主张证据读取', () => {
  test('保留许可和适用性原文及核验时间，不自动产生已验证依赖', async () => {
    const f = fixture([row])
    const [result] = await f.reader.read([ref])
    expect(result?.status).toBe('found')
    if (result?.status !== 'found') { throw new Error('应有精确来源证据') }
    expect(result.reference).toEqual(ref)
    expect(result.evidence).toEqual({
      organizationZh: '机构资料', titleZh: '黄叶排查', locatorUrl: 'https://example.org/guide',
      sourceType: 'institution_guide', licenseScope: 'requires_editor_review', sourceState: 'verified',
      sourceVerifiedAtMs: 1000, sourceLocator: '第二节', claimZh: '黄叶可能由多个原因引起。',
      applicability: { taxa: ['test-taxon'], scenario: 'container' }, claimRole: 'support',
      evidenceSha256: 'a'.repeat(64), claimVerifiedAtMs: 1100,
    })
    expect(Object.isFrozen(result.evidence.applicability)).toBe(true)
    expect(f.query.mock.calls[0]?.[1]).toEqual(['extension', 'yellow-multicausal', 0])
    expect(f.connection.execute).not.toHaveBeenCalled()
    expect(f.connection.release).toHaveBeenCalledOnce()
  })

  test('同一修订重复请求去重；不同修订不能合并或读取最新版', async () => {
    const next = { ...ref, revisionNo: 1 }
    const f = fixture([{ ...row, revision_no: 1 }, row])
    const results = await f.reader.read([ref, ref, next])
    expect(results.map(x => x.reference)).toEqual([ref, next])
    expect(f.query).toHaveBeenCalledOnce()
    expect(f.query.mock.calls[0]?.[1]).toEqual(['extension', 'yellow-multicausal', 0, 'extension', 'yellow-multicausal', 1])
  })

  test('修订缺失明确不存在，不补其他修订', async () => {
    expect(await fixture([]).reader.read([ref])).toEqual([{ reference: ref, status: 'not_found' }])
  })

  test.each(['pending', 'withdrawn'])('保留%s状态供审核拒绝，不隐藏来源生命周期', async state => {
    const [result] = await fixture([{ ...row, source_state: state, source_verified_at_ms: null }]).reader.read([ref])
    expect(result?.status).toBe('found')
    if (result?.status !== 'found') { throw new Error('应读回来源生命周期证据') }
    expect(result.evidence.sourceState).toBe(state)
    expect(result.evidence.sourceVerifiedAtMs).toBeNull()
  })

  test.each([
    { ...row, evidence_sha256: 'invalid' }, { ...row, claim_verified_at_ms: '9007199254740992' },
    { ...row, source_state: 'unknown' }, { ...row, applicability_json: '{invalid' },
    { ...row, license_scope: '' }, { ...row, source_openid: 'unauthorized-subject' },
  ])('非法证据返回明确状态，不丢字段伪造正常%#', async invalid => {
    expect(await fixture([invalid]).reader.read([ref])).toEqual([{ reference: ref, status: 'invalid_record' }])
  })

  test('同一精确修订多行失败关闭，不任取一条', async () => {
    expect(await fixture([row, row]).reader.read([ref])).toEqual([{ reference: ref, status: 'invalid_record' }])
  })

  test('SQL通配符与引号只作为绑定参数，不进入SQL文本', async () => {
    const injected = { sourceCode: "x' OR 1=1 --%", claimCode: 'claim_', revisionNo: 2 }
    const f = fixture([])
    await f.reader.read([injected])
    expect(f.query.mock.calls[0]?.[0]).not.toContain(injected.sourceCode)
    expect(f.query.mock.calls[0]?.[1]).toEqual([injected.sourceCode, 'claim_', 2])
  })

  test('空请求不建立数据库连接，非法修订不执行SQL', async () => {
    const f = fixture([])
    expect(await f.reader.read([])).toEqual([])
    await expect(f.reader.read([{ ...ref, revisionNo: -1 }])).rejects.toThrow()
    expect(f.getConnection).not.toHaveBeenCalled()
  })

  test('查询失败销毁连接并传播原错误，不当作没有来源', async () => {
    const f = fixture([])
    const failure = new Error('controlled database failure')
    f.query.mockRejectedValueOnce(failure)
    await expect(f.reader.read([ref])).rejects.toBe(failure)
    expect(f.connection.destroy).toHaveBeenCalledOnce()
    expect(f.connection.release).not.toHaveBeenCalled()
  })
})
