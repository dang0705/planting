import { describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import type { SqlParameter } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlPublishedProfileWritePolicyReader } from '../../src/user-plant/repository/mysql-published-profile-write-policy-reader.js'

// L1/unit_fake。Expected为发布读取合同和目录已确认值；只替换SQL边界。
// 摘要使用独立排序的原生crypto；不用被测解析器生成Expected。
const profile = { profileVersion: 'user-plant-profile/v1', requiredFields: ['identityStatus', 'pot', 'location', 'lightingEnvironment', 'ventilationEnvironment'], acceptedIdentityStates: ['unidentified', 'candidate_pending', 'confirmed'], rewardOncePerUser: true }
const http = { jsonBodyLimitBytes: 1048576, idempotencyRetentionHours: 168 }
function sha(doc: object): string {
  return createHash('sha256').update(JSON.stringify(doc, Object.keys(doc).sort())).digest('hex')
}
function row(domain: string, code: string, schema: string, document: object) {
  return { release_ref: `bpr_${domain.replace('-', '')}12345678`, domain_code: domain, policy_code: code,
    schema_version: schema, release_version: '2026-10-05.1', content_sha256: sha(document), policy_json: document,
    status: 'active', effective_at_ms: '1000', expires_at_ms: '3000', verified_at_ms: '1000',
    active_release_version: '2026-10-05.1', active_content_sha256: sha(document) }
}
function fixture() {
  const rows = [row('user-plant', 'profile_minimum_completeness', 'user-plant-profile/v1', profile), row('http', 'request_write', 'http-request-write-policy/v1', http)]
  const query = vi.fn(async (_sql: string, _parameters: readonly SqlParameter[]) => rows)
  const release = vi.fn()
  const destroy = vi.fn()
  const getConnection = vi.fn(async () => ({ query, release, destroy, beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, execute: async () => ({ affectedRows: 0, insertId: 0 }) }))
  return { rows, query, release, destroy, getConnection, reader: createMysqlPublishedProfileWritePolicyReader({ getConnection }) }
}
describe('已发布档案写入策略快照', () => {
  test('两份发布生成明确参数及内部来源，仅一条查询并释放连接', async () => {
    const f = fixture(); const result = await f.reader.read(1000)
    expect(result).toEqual({ maxBodyBytes: 1048576, profileVersion: 'user-plant-profile/v1', idempotencyRetentionMs: 604800000,
      profilePolicy: profile, releases: f.rows.map(r => ({ releaseRef: r.release_ref, releaseVersion: r.release_version, contentSha256: r.content_sha256 })) })
    expect(f.query).toHaveBeenCalledTimes(1); expect(f.release).toHaveBeenCalledTimes(1)
    expect(f.query.mock.calls[0]?.[1]).toEqual(['user-plant', 'profile_minimum_completeness', 'http', 'request_write'])
  })
  test('JSON文本可读且返回快照与SQL对象隔离', async () => {
    const f = fixture(); f.rows[1]!.policy_json = JSON.stringify(http) as never
    const result = await f.reader.read(2000); expect(result?.idempotencyRetentionMs).toBe(604800000)
    f.rows[0]!.policy_json = {} as never
    expect(result?.profilePolicy).toEqual(profile); expect(Object.isFrozen(result)).toBe(true)
  })
  test.each([0, 999, 3000, NaN, -1, 1.5, Infinity])('时刻 %s 不形成可用快照', async now => {
    const f = fixture(); expect(await f.reader.read(now)).toBeNull()
  })
  test.each(['status','schema_version','release_version','release_ref','content_sha256','active_release_version','active_content_sha256','domain_code','policy_code','effective_at_ms','expires_at_ms','verified_at_ms'] as const)('损坏 %s 拒绝整组', async key => {
    const f = fixture(); f.rows[0]![key] = 'bad'
    expect(await f.reader.read(2000)).toBeNull()
  })
  test.each(['missing','duplicate','extra'] as const)('%s 发布不补默认值', async kind => {
    const f = fixture(); if (kind === 'missing') { f.rows.pop() } else if (kind === 'duplicate') { f.rows[1] = f.rows[0]! } else { f.rows.push(f.rows[0]!) }
    expect(await f.reader.read(2000)).toBeNull()
  })
  test.each([{ ...profile, rewardOncePerUser: false }, { ...profile, secret: '禁止透传' }, { ...profile, requiredFields: ['pot'] }])('正文即使重新签摘要也不能绕过Schema', async document => {
    const f = fixture(); f.rows[0]!.policy_json = document; f.rows[0]!.content_sha256 = sha(document); f.rows[0]!.active_content_sha256 = sha(document)
    expect(await f.reader.read(2000)).toBeNull()
  })
  test('HTTP值即使摘要匹配也不得改变已冻结合同', async () => {
    const f = fixture(); const document = { ...http, idempotencyRetentionHours: 1 }; f.rows[1]!.policy_json = document as never
    f.rows[1]!.content_sha256 = f.rows[1]!.active_content_sha256 = sha(document)
    expect(await f.reader.read(2000)).toBeNull()
  })
  test('有效正文的行摘要与活动摘要同错仍拒绝', async () => {
    const f = fixture(); f.rows[0]!.content_sha256 = f.rows[0]!.active_content_sha256 = 'a'.repeat(64)
    expect(await f.reader.read(2000)).toBeNull()
  })
  test('未来验真及倒置生效区间拒绝', async () => {
    const f = fixture(); f.rows[0]!.verified_at_ms = '2001'; expect(await f.reader.read(2000)).toBeNull()
    f.rows[0]!.verified_at_ms = '1000'; f.rows[0]!.expires_at_ms = '1000'; expect(await f.reader.read(2000)).toBeNull()
  })
  test('无截止可用，已失效上界不包含', async () => {
    const f = fixture(); f.rows[0]!.expires_at_ms = null as never; f.rows[1]!.expires_at_ms = null as never
    expect(await f.reader.read(3000)).not.toBeNull()
  })
  test('SQL失败保留异常且销毁错误连接', async () => {
    const f = fixture(); f.query.mockRejectedValueOnce(new Error('内部SQL异常'))
    await expect(f.reader.read(2000)).rejects.toThrow('内部SQL异常'); expect(f.destroy).toHaveBeenCalledTimes(1); expect(f.release).not.toHaveBeenCalled()
  })
})
