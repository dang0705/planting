import { describe, expect, test } from 'vitest'

import type { BuiltWateringAdvice } from '../../src/care/application/build-watering-advice.js'
import { createWateringAdviceApplicationService, type CreateWateringAdviceApplicationInput } from '../../src/care/application/create-watering-advice.js'
import { lockTemporaryCareResult, type TemporaryCareResultRecord } from '../../src/care/domain/temporary-care-result-record.js'
import type { WateringAdviceRepository } from '../../src/care/repository/mysql-watering-advice-repository.js'
import type { DatabaseTransactionDriver, TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import type { MysqlHttpIdempotencyRepository } from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'

/**
 * unit_fake（L3 应用编排）。Expected：watering-advice-http-test-matrix.md A1–A5（裁决 2/3/4，HTTP 合同「写入与幂等」）。
 * 替换：事务驱动、幂等 Repository、浇水建议仓储为记录调用顺序的替身。
 */
const now = Date.UTC(2026, 9, 9, 4)
const caseExpiresAtMs = now + 20 * 3_600_000
/** 测试事务，携带可观察引用。 */
type Tx = TransactionExecutionContext & {
  /** 测试用事务标识。 */
  readonly ref: string
}
const built: BuiltWateringAdvice = {
  result: {
    capabilityType: 'watering', contractVersion: 'care-capability-result/v1', status: 'ready', confidence: 'low',
    evidenceSummary: ['依据通用文献参数估算'], recommendedActions: [], generatedAt: new Date(now).toISOString(), validUntil: null,
    detailsSchemaVersion: 'watering-assessment/v1',
    details: { action: 'pause_watering', soilState: 'wet', soilScope: 'root_zone', dryingWindowState: null, checkWindow: null, amountMl: null, netDeficitMl: null, missingEvidence: [] }
  },
  inputManifest: { contractVersion: 'watering-advice/v1' },
  algorithmReleaseManifest: { wateringPolicy: { status: 'none_published' } },
  derivations: { environmentIntervalCount: 0 }
}
function input(): CreateWateringAdviceApplicationInput {
  return {
    owner: { kind: 'guest', guestSessionRef: 'gst_app_session_0001', caseRef: 'gpc_app_case_000001' },
    built, newSessionRef: 'tcs_new_session_0001', newResultRef: 'cres_new_result_0001', occurredAtMs: now,
    idempotency: { principalType: 'guest', principalScopeHash: 'a'.repeat(64), httpMethod: 'POST', normalizedPath: '/api/v2/care/watering-advice',
      operationId: 'createWateringAdvice', idempotencyKeyHash: 'b'.repeat(64), requestHash: 'c'.repeat(64), createdAtMs: now, expiresAtMs: now + 1000 }
  }
}

function setup(overrides: {
  /** 幂等占位决策。 */
  readonly reserve?: Awaited<ReturnType<MysqlHttpIdempotencyRepository<Tx>['tryReserve']>>
  /** 案例锁结果；null 表示不属于本人或已过期。 */
  readonly locked?: { caseInternalId: string; expiresAtMs: number } | null
  /** 已存在的 active 浇水会话引用。 */
  readonly existingSession?: string
  /** 追加时抛出的错误。 */
  readonly appendError?: Error
  /** 读回摘要覆盖（模拟不一致）。 */
  readonly readHash?: string | null
} = {}) {
  const events: string[] = []
  const appended: TemporaryCareResultRecord[] = []
  const tx: Tx = { transactionContext: true, ref: 'tx1' }
  const driver: DatabaseTransactionDriver<Tx> = {
    async beginTransaction() { events.push('begin'); return tx },
    async commitTransaction() { events.push('commit') },
    async rollbackTransaction() { events.push('rollback') },
    async recordRollbackFailure() { events.push('rollback-failed') }
  }
  const idempotencyRepository: MysqlHttpIdempotencyRepository<Tx> = {
    async read() { throw new Error('不应直接读取') },
    async tryReserve() { events.push('reserve'); return overrides.reserve ?? { kind: 'reserved' } },
    async completionFirstResult(_t, completion) { events.push(`complete:${completion.response.status}`); return { kind: 'completed', response: completion.response } }
  }
  const repository: WateringAdviceRepository<Tx> = {
    async lockOwnedCase(t, owner, nowMs) { events.push(`lock:${t.ref}:${owner.caseRef}:${nowMs}`); return overrides.locked === undefined ? { caseInternalId: '7', expiresAtMs: caseExpiresAtMs } : overrides.locked },
    async findOrCreateWateringSession(t, session) {
      events.push(`session:${t.ref}:${session.caseInternalId}:${session.expiresAtMs}`)
      return overrides.existingSession ?? session.candidateSessionRef
    },
    async appendResult(t, record) {
      events.push(`append:${t.ref}:${record.sessionRef}:${record.resultRef}`)
      if (overrides.appendError) { throw overrides.appendError }
      appended.push(record)
      return 'created'
    },
    async readResultHash(t, resultRef) {
      events.push(`read:${t.ref}:${resultRef}`)
      return overrides.readHash !== undefined ? overrides.readHash : lockTemporaryCareResult(appended[0]!).hashes.result
    }
  }
  const service = createWateringAdviceApplicationService({ driver, idempotencyRepository, repository, commitUnknownReadOnlyRepository: { read: async () => null } })
  return { service, events, appended }
}

describe('创建浇水建议应用用例', () => {
  test('A1 同事务顺序；会话与结果 expires = 案例 expires；响应 {resultRef, result}', async () => {
    const f = setup()
    const response = await f.service(input())
    expect(response).toEqual({ status: 200, body: { data: { resultRef: 'cres_new_result_0001', result: built.result } } })
    expect(f.events).toEqual(['begin', 'reserve', `lock:tx1:gpc_app_case_000001:${now}`, `session:tx1:7:${caseExpiresAtMs}`,
      'append:tx1:tcs_new_session_0001:cres_new_result_0001', 'read:tx1:cres_new_result_0001', 'complete:200', 'commit'])
    expect(f.appended[0]).toMatchObject({ owner: input().owner, expiresAtMs: caseExpiresAtMs, generatedAtMs: now, result: built.result,
      inputManifest: built.inputManifest, algorithmReleaseManifest: built.algorithmReleaseManifest, derivations: built.derivations })
  })
  test('A2 已有 active 浇水会话 → 复用其引用', async () => {
    const f = setup({ existingSession: 'tcs_existing_000001' })
    await f.service(input())
    expect(f.appended[0]?.sessionRef).toBe('tcs_existing_000001')
  })
  test('A3 案例锁不到 → 404 NOT_FOUND 写幂等完成并提交，不建会话', async () => {
    const f = setup({ locked: null })
    const response = await f.service(input())
    expect(response).toMatchObject({ status: 404, body: { error: { type: 'NOT_FOUND' } } })
    expect(f.events).toEqual(['begin', 'reserve', `lock:tx1:gpc_app_case_000001:${now}`, 'complete:404', 'commit'])
  })
  test.each([
    ['replay', { kind: 'replay' as const, response: { status: 200, body: { data: { resultRef: 'cres_first_000001', result: built.result } } } }, 200],
    ['conflict', { kind: 'conflict' as const, errorType: 'IDEMPOTENCY_CONFLICT' as const, httpStatus: 409 }, 409],
    ['wait_for_winner', { kind: 'wait_for_winner' as const }, 503]
  ])('A4 幂等 %s → 不触达仓储', async (_name, reserve, status) => {
    const f = setup({ reserve })
    expect((await f.service(input())).status).toBe(status)
    expect(f.events).toEqual(['begin', 'reserve', 'commit'])
  })
  test('A5 追加失败 → 回滚、无幂等完成', async () => {
    const f = setup({ appendError: new Error('append failed') })
    await expect(f.service(input())).rejects.toThrow('append failed')
    expect(f.events).toContain('rollback')
    expect(f.events.some(event => event.startsWith('complete') || event === 'commit')).toBe(false)
  })
  test('A5 读回摘要不一致 → 回滚', async () => {
    const f = setup({ readHash: 'f'.repeat(64) })
    await expect(f.service(input())).rejects.toThrow()
    expect(f.events).toContain('rollback')
  })
})
