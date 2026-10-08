import { createHash } from 'node:crypto'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
import { createMysqlTemporaryCareResultRepository } from '../../src/care/repository/mysql-temporary-care-result-repository.js'
import { seedTemporaryCareFixture, startTemporaryCareFixture, stopTemporaryCareFixture } from './temporary-care-result.mysql-fixture.js'

/** 已验真内部身份夹具；不证明平台凭证、游客持有证明或HTTP认证。 */
const authenticated = { kind: 'authenticated' as const, userRef: 'usr_owner', caseRef: 'case_owner' }
/** 仅供真实存储与读回的游客主体夹具。 */
const guest = { kind: 'guest' as const, guestSessionRef: 'guest_owner', caseRef: 'gcase_owner' }
/** 真实写入制品固定时刻；不设置业务默认期限。 */
const now = 1000
/** 独立输入及正式不可用结果，不伪造发布release或真实模型准入。 */
function record(owner: typeof authenticated | typeof guest = authenticated, resultRef = 'result_one') {
  return { owner, sessionRef: owner.kind === 'authenticated' ? 'session_auth' : 'session_guest', resultRef,
    environmentContractVersion: 'care-environment/v1', inputManifest: { evidence: 'synthetic', observation: { vwc: 0.2 } },
    algorithmReleaseManifest: { watering: null }, derivations: {},
    result: { capabilityType: 'watering', contractVersion: 'care-capability-result/v1', detailsSchemaVersion: 'watering-assessment/v1',
      generatedAt: new Date(now).toISOString(), status: 'temporarily_unavailable', details: { amountMl: null } },
    generatedAtMs: now, expiresAtMs: 8000 }
}
/** 独立标准JSON键排序；本例对象只含有限JSON值，不调用产品摘要辅助函数。 */
function canonical(value: unknown): string {
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) { return `[${value.map(canonical).join(',')}]` }
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
/** 固定Expected摘要来自独立输入，不从Repository输出反推。 */
function expectedRecord(input: ReturnType<typeof record>) {
  return { ...input, hashes: Object.fromEntries(['inputManifest', 'algorithmReleaseManifest', 'derivations', 'result'].map(key => {
    const value = input[key as keyof typeof input]
    return [key, createHash('sha256').update(canonical(value)).digest('hex')]
  })) }
}

let pool: Pool | undefined
let source: ReturnType<typeof createMysql2ConnectionSource>
let repository: ReturnType<typeof createMysqlTemporaryCareResultRepository>
/** 真事务追加入口；无内存Repository、无数据库写替身。 */
async function append(input: ReturnType<typeof record>) {
  return runDatabaseTransaction(createMysqlTransactionDriver(source, () => undefined), tx => repository.append(tx, input))
}
/** 只读取本测试隔离库的计数。 */
async function count(): Promise<number> {
  const [rows] = await pool!.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM temporary_care_results')
  return Number(rows[0]!.n)
}

/** 原始SQL克隆历史污染行，保留真正FK与UPDATE拒绝触发器，不改原结果。 */
async function cloneCorrupted(overrides: Readonly<Record<string, string>>): Promise<void> {
  const [columns] = await pool!.query<RowDataPacket[]>('SHOW COLUMNS FROM temporary_care_results')
  const names = columns.map(row => String(row.Field)).filter(name => name !== 'id')
  const expressions = names.map(name => overrides[name] ?? `\`${name}\``)
  await pool!.query(`INSERT INTO temporary_care_results (${names.map(name => `\`${name}\``).join(',')}) SELECT ${expressions.join(',')} FROM temporary_care_results WHERE result_ref='result_one'`)
}

/**
 * L3 unit_real_data：Expected来自冻结临时结果合同、004/017指定DDL和独立规范JSON摘要。
 * 经过真实Repository→MySQL8.0.43/InnoDB事务→新连接只读；身份和父表缩减夹具明确替换。
 * 只装载准入两表、两条ALTER及不可变触发器；不证明CloudBase、HTTP、平台验真或养护模型发布。
 * 所有结果temporarily_unavailable；不写长期植物、行为、案例或正式配置。
 * I1写读、I2缺行、I3过期/损坏、I4归属、I5回滚均在真实SQL路径验证。
 */
describe('临时养护结果真实隔离MySQL', () => {
  beforeAll(async () => {
    const fixture = await startTemporaryCareFixture(); pool = fixture.pool
    source = createMysql2ConnectionSource({ host: '127.0.0.1', port: fixture.port, database: fixture.database, user: 'root', password: '' })
    repository = createMysqlTemporaryCareResultRepository(source)
  }, 60000)
  beforeEach(async () => seedTemporaryCareFixture(pool!))
  afterAll(async () => {
    const closable = source as unknown as { close?: () => Promise<void>; end?: () => Promise<void> } | undefined
    if (closable?.close) { await closable.close() } else if (closable?.end) { await closable.end() }
    await stopTemporaryCareFixture(pool)
  })

  it.each([{ owner: authenticated }, { owner: guest }])('两类已验真内部归属真实追加并逐对象摘要读回 $owner.kind', async ({ owner }) => {
    const input = record(owner)
    expect(await append(input)).toBe('created')
    expect(await repository.read(owner, input.sessionRef, input.resultRef, now)).toEqual({ status: 'found', record: expectedRecord(input) })
    expect(await count()).toBe(1)
  })
  it('跨用户、同用户异案例及精确大小写不可见', async () => {
    await append(record())
    for (const owner of [{ ...authenticated, userRef: 'usr_other' }, { ...authenticated, caseRef: 'case_second' }, { ...authenticated, userRef: 'USR_OWNER' }, { ...authenticated, caseRef: 'CASE_OWNER' }]) {
      expect(await repository.read(owner, 'session_auth', 'result_one', now)).toEqual({ status: 'not_found' })
    }
    for (const [session, result] of [['SESSION_AUTH','result_one'], ['session_auth','RESULT_ONE'], ['missing','result_one']]) {
      expect(await repository.read(authenticated, session!, result!, now)).toEqual({ status: 'not_found' })
    }
    expect(await append({ ...record(), owner: { ...authenticated, caseRef: 'case_second' }, resultRef: 'bad_case' })).toBe('not_found')
    expect(await count()).toBe(1)
  })
  it('游客异会话与异案例不可见，不能以caseRef猜归属', async () => {
    await append(record(guest))
    for (const owner of [{ ...guest, guestSessionRef: 'guest_other' }, { ...guest, caseRef: 'gcase_other' }, { ...guest, guestSessionRef: 'GUEST_OWNER' }]) {
      expect(await repository.read(owner, 'session_guest', 'result_one', now)).toEqual({ status: 'not_found' })
    }
  })
  it('active watering会话才可写，completed仍可读原不可变结果', async () => {
    await append(record())
    await pool!.execute("UPDATE temporary_care_sessions SET status='completed' WHERE id=1")
    expect(await repository.read(authenticated, 'session_auth', 'result_one', now)).toEqual({ status: 'found', record: expectedRecord(record()) })
    expect(await append(record(authenticated, 'late_result'))).toBe('not_found')
    await pool!.execute("UPDATE temporary_care_sessions SET status='active',capability_type='diagnosis' WHERE id=1")
    expect(await append(record(authenticated, 'wrong_capability'))).toBe('not_found')
  })
  it('失效端点不可读，期限不超过会话/案例/游客会话，生成不早于会话创建', async () => {
    await append(record())
    expect(await repository.read(authenticated, 'session_auth', 'result_one', 8000)).toEqual({ status: 'not_found' })
    expect(await append({ ...record(authenticated,'beyond_session'), expiresAtMs: 9001 })).toBe('not_found')
    await pool!.execute('UPDATE authenticated_ephemeral_plant_cases SET expires_at_ms=7000 WHERE id=1')
    expect(await append(record(authenticated,'beyond_case'))).toBe('not_found')
    await pool!.execute('UPDATE guest_sessions SET expires_at_ms=7000 WHERE id=1')
    expect(await append(record(guest,'beyond_guest'))).toBe('not_found')
    await pool!.execute('UPDATE temporary_care_sessions SET created_at_ms=1001 WHERE id=1')
    expect(await append(record(authenticated,'before_created'))).toBe('not_found')
  })
  it('停用统一用户或技术字段污染不授予可见结果', async () => {
    await append(record())
    await pool!.execute("UPDATE users SET status='inactive' WHERE id=1")
    expect(await repository.read(authenticated,'session_auth','result_one',now)).toEqual({ status:'not_found' })
    await pool!.execute("UPDATE users SET status='active',_openid='technical' WHERE id=1")
    expect(await repository.read(authenticated,'session_auth','result_one',now)).toEqual({ status:'not_found' })
  })
  it('重复引用拒绝且原结果不变；真实触发器禁止UPDATE', async () => {
    await append(record())
    await expect(append(record())).rejects.toThrow()
    await expect(pool!.execute("UPDATE temporary_care_results SET result_sha256=REPEAT('0',64) WHERE result_ref='result_one'")).rejects.toThrow()
    expect(await repository.read(authenticated,'session_auth','result_one',now)).toEqual({ status:'found',record:expectedRecord(record()) })
    expect(await count()).toBe(1)
  })
  it.each(['input_manifest','algorithm_release_manifest','derivations','result'])('旧制品%s摘要损坏不返回成功', async field => {
    await append(record())
    await cloneCorrupted({ result_ref: "'corrupted'", [`${field}_sha256`]: "REPEAT('0',64)" })
    expect(await repository.read(authenticated,'session_auth','corrupted',now)).toEqual({ status:'invalid_record' })
  })
  it('两侧FK各自存在仍不足，结果case必须与原session一致', async () => {
    await append(record())
    await cloneCorrupted({ result_ref: "'cross_case'", authenticated_ephemeral_case_internal_id: '2' })
    expect(await repository.read(authenticated,'session_auth','cross_case',now)).toEqual({ status:'not_found' })
    expect(await repository.read({ ...authenticated, userRef:'usr_other',caseRef:'case_other' },'session_auth','cross_case',now)).toEqual({ status:'not_found' })
  })
  it('案例、养护session或结果技术字段污染均不授予读取资格', async () => {
    await append(record())
    await cloneCorrupted({ result_ref: "'technical_result'", _openid: "'technical'" })
    expect(await repository.read(authenticated,'session_auth','technical_result',now)).toEqual({ status:'not_found' })
    await pool!.execute("UPDATE temporary_care_sessions SET _openid='technical' WHERE id=1")
    expect(await repository.read(authenticated,'session_auth','result_one',now)).toEqual({ status:'not_found' })
    await pool!.execute("UPDATE temporary_care_sessions SET _openid='' WHERE id=1")
    await pool!.execute("UPDATE authenticated_ephemeral_plant_cases SET _openid='technical' WHERE id=1")
    expect(await repository.read(authenticated,'session_auth','result_one',now)).toEqual({ status:'not_found' })
  })
  it('外层真实事务回滚不留半条结果，不修改backing case', async () => {
    const [before] = await pool!.query('SELECT * FROM authenticated_ephemeral_plant_cases ORDER BY id')
    await expect(runDatabaseTransaction(createMysqlTransactionDriver(source,()=>undefined), async tx => {
      expect(await repository.append(tx,record())).toBe('created'); throw new Error('controlled rollback')
    })).rejects.toThrow('controlled rollback')
    expect(await count()).toBe(0)
    expect(await repository.read(authenticated,'session_auth','result_one',now)).toEqual({ status:'not_found' })
    const [after] = await pool!.query('SELECT * FROM authenticated_ephemeral_plant_cases ORDER BY id')
    expect(after).toEqual(before)
  })
})
