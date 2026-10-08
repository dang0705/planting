import { describe, expect, test } from 'vitest'

import type { GuestPrincipalDto, GuestSessionRef, UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import {
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import type { HttpIdempotencyStoredRecord } from '../../src/foundation/idempotency/http-idempotency.js'
import type {
  HttpIdempotencyReservationInput,
  MysqlHttpIdempotencyRepository
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import {
  createTemporaryCaseApplicationService,
  type CreateTemporaryCaseApplicationInput
} from '../../src/user-plant/application/create-temporary-case.js'
import type { TemporaryCaseRepository } from '../../src/user-plant/repository/mysql-temporary-case-repository.js'

/**
 * unit_fake（L3 应用编排）。Expected：temporary-case-contract.md §1–§3；测试矩阵 A1–A6。
 * 替换：事务驱动、共享幂等 Repository、临时案例 Repository 为记录调用顺序的替身；不证明 SQL 与行锁。
 */
const hour = 3_600_000
const now = Date.UTC(2026, 9, 9, 4)
const limits = { guestMaxCasesPerSession: 5, authenticatedEphemeralCaseTtlHours: 168 }

/** 测试事务携带可观察引用，证明所有依赖共享同一事务。 */
type TestTransaction = TransactionExecutionContext & {
  /** 测试用事务标识，用于断言依赖共享同一事务。 */
  readonly testRef: string
}

const guest: GuestPrincipalDto = {
  principalType: 'guest',
  guestSessionRef: 'gst_app_session_0001' as GuestSessionRef,
  authProvider: 'server_issued_guest_token',
  issuedAt: '2026-10-09T00:00:00.000Z',
  expiresAt: '2026-10-10T04:00:00.000Z'
}
const user: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_app_user_000001' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '2026-10-09T00:00:00.000Z',
  expiresAt: '2026-10-10T00:00:00.000Z'
}

function idempotency(principalType: 'guest' | 'user'): HttpIdempotencyReservationInput {
  return {
    principalType,
    principalScopeHash: 'a'.repeat(64),
    httpMethod: 'POST',
    normalizedPath: '/api/v2/user-plants/temporary-cases',
    operationId: 'createTemporaryCase',
    idempotencyKeyHash: 'b'.repeat(64),
    requestHash: 'c'.repeat(64),
    createdAtMs: now,
    expiresAtMs: now + hour
  }
}

function guestInput(): CreateTemporaryCaseApplicationInput {
  return { principal: guest, limits, newCaseRef: 'gpc_app_case_000001', occurredAtMs: now, idempotency: idempotency('guest') }
}
function userInput(): CreateTemporaryCaseApplicationInput {
  return { principal: user, limits, newCaseRef: 'epc_app_case_000001', occurredAtMs: now, idempotency: idempotency('user') }
}

function setup(overrides: {
  /** 幂等占位预设决策。 */
  readonly reserve?: Awaited<ReturnType<MysqlHttpIdempotencyRepository<TestTransaction>['tryReserve']>>
  /** 锁定游客会话后的读回；null 表示会话不存在。 */
  readonly guestSession?: { guestSessionInternalId: string; status: string; expiresAtMs: number; activeCaseCount: number } | null
  /** 登录用户锁；null 表示非 active。 */
  readonly lockedUser?: { userInternalId: string } | null
  /** 插入阶段抛出的内部错误。 */
  readonly insertError?: Error
  /** 提交阶段抛出的提交结果未知错误。 */
  readonly commitError?: DatabaseCommitResultUnknownError
  /** 对账读回的已提交记录。 */
  readonly reconciliation?: HttpIdempotencyStoredRecord | null
} = {}) {
  const events: string[] = []
  const completed: unknown[] = []
  const tx: TestTransaction = { transactionContext: true, testRef: 'tx1' }
  const driver: DatabaseTransactionDriver<TestTransaction> = {
    async beginTransaction() { events.push('begin'); return tx },
    async commitTransaction(t) { events.push(`commit:${t.testRef}`); if (overrides.commitError) { throw overrides.commitError } },
    async rollbackTransaction(t) { events.push(`rollback:${t.testRef}`) },
    async recordRollbackFailure() { events.push('rollback-failed') }
  }
  const idempotencyRepository: MysqlHttpIdempotencyRepository<TestTransaction> = {
    async read() { throw new Error('不应直接读取') },
    async tryReserve(t) { events.push(`reserve:${t.testRef}`); return overrides.reserve ?? { kind: 'reserved' } },
    async completionFirstResult(t, input) { events.push(`complete:${t.testRef}:${input.response.status}`); completed.push(input); return { kind: 'completed', response: input.response } }
  }
  const stored = new Map<string, number>()
  const repository: TemporaryCaseRepository<TestTransaction> = {
    async lockGuestSessionAndCountActiveCases(t, input) {
      events.push(`lock-guest:${t.testRef}:${input.guestSessionRef}:${input.nowMs}`)
      return overrides.guestSession === undefined
        ? { guestSessionInternalId: '11', status: 'active', expiresAtMs: now + 24 * hour, activeCaseCount: 0 }
        : overrides.guestSession
    },
    async insertGuestCase(t, input) {
      events.push(`insert-guest:${t.testRef}:${input.guestSessionInternalId}:${input.caseRef}:${input.expiresAtMs}`)
      if (overrides.insertError) { throw overrides.insertError }
      stored.set(input.caseRef, input.expiresAtMs)
    },
    async readGuestCase(t, input) {
      events.push(`read-guest:${t.testRef}:${input.caseRef}`)
      return { caseRef: input.caseRef, expiresAtMs: stored.get(input.caseRef)! }
    },
    async lockActiveUser(t, input) {
      events.push(`lock-user:${t.testRef}:${input.userRef}`)
      return overrides.lockedUser === undefined ? { userInternalId: '21' } : overrides.lockedUser
    },
    async insertAuthenticatedCase(t, input) {
      events.push(`insert-user:${t.testRef}:${input.userInternalId}:${input.caseRef}:${input.expiresAtMs}`)
      if (overrides.insertError) { throw overrides.insertError }
      stored.set(input.caseRef, input.expiresAtMs)
    },
    async readAuthenticatedCase(t, input) {
      events.push(`read-user:${t.testRef}:${input.caseRef}`)
      return { caseRef: input.caseRef, expiresAtMs: stored.get(input.caseRef)! }
    }
  }
  const service = createTemporaryCaseApplicationService({
    driver,
    idempotencyRepository,
    temporaryCaseRepository: repository,
    commitUnknownReadOnlyRepository: { read: async () => overrides.reconciliation ?? null }
  })
  return { service, events, completed }
}

describe('创建临时案例应用用例', () => {
  test('A1 游客 Happy：同一事务内 占位→锁会话计数→插入→读回→完成→提交', async () => {
    const f = setup()
    const result = await f.service(guestInput())
    expect(result).toEqual({ status: 200, body: { data: { caseRef: 'gpc_app_case_000001', ownerKind: 'guest', expiresAt: new Date(now + 24 * hour).toISOString() } } })
    expect(f.events).toEqual([
      'begin', 'reserve:tx1', `lock-guest:tx1:gst_app_session_0001:${now}`,
      `insert-guest:tx1:11:gpc_app_case_000001:${now + 24 * hour}`, 'read-guest:tx1:gpc_app_case_000001',
      'complete:tx1:200', 'commit:tx1'
    ])
  })

  test('A1 游客会话剩余 300h（长于 168h）→ 仍等于会话 expiresAt', async () => {
    const f = setup({ guestSession: { guestSessionInternalId: '11', status: 'active', expiresAtMs: now + 300 * hour, activeCaseCount: 4 } })
    const result = await f.service(guestInput())
    expect(result.body).toEqual({ data: { caseRef: 'gpc_app_case_000001', ownerKind: 'guest', expiresAt: new Date(now + 300 * hour).toISOString() } })
  })

  test('A2 登录 Happy：只走登录用户锁与登录案例，绝不触达游客写入', async () => {
    const f = setup()
    const result = await f.service(userInput())
    expect(result).toEqual({ status: 200, body: { data: { caseRef: 'epc_app_case_000001', ownerKind: 'authenticated', expiresAt: new Date(now + 168 * hour).toISOString() } } })
    expect(f.events).toEqual([
      'begin', 'reserve:tx1', 'lock-user:tx1:usr_app_user_000001',
      `insert-user:tx1:21:epc_app_case_000001:${now + 168 * hour}`, 'read-user:tx1:epc_app_case_000001',
      'complete:tx1:200', 'commit:tx1'
    ])
    expect(f.events.some(event => event.includes('guest'))).toBe(false)
  })

  test('A3 游客已有 5 个 active → 409 TEMPORARY_CASE_LIMIT_REACHED 写入幂等完成并提交，不插入', async () => {
    const f = setup({ guestSession: { guestSessionInternalId: '11', status: 'active', expiresAtMs: now + 24 * hour, activeCaseCount: 5 } })
    const result = await f.service(guestInput())
    expect(result.status).toBe(409)
    expect(result.body).toEqual({ error: { type: 'TEMPORARY_CASE_LIMIT_REACHED', message: expect.any(String) } })
    expect(f.events).toEqual(['begin', 'reserve:tx1', `lock-guest:tx1:gst_app_session_0001:${now}`, 'complete:tx1:409', 'commit:tx1'])
  })

  test.each([
    ['replay', { kind: 'replay' as const, response: { status: 409, body: { error: { type: 'TEMPORARY_CASE_LIMIT_REACHED', message: '原消息' } } } }, 409, 'TEMPORARY_CASE_LIMIT_REACHED'],
    ['conflict', { kind: 'conflict' as const, errorType: 'IDEMPOTENCY_CONFLICT' as const, httpStatus: 409 }, 409, 'IDEMPOTENCY_CONFLICT'],
    ['wait_for_winner', { kind: 'wait_for_winner' as const }, 503, 'SERVICE_UNAVAILABLE']
  ])('A4 幂等 %s → 不触达案例 Repository', async (_name, reserve, status, type) => {
    const f = setup({ reserve })
    const result = await f.service(guestInput())
    expect(result.status).toBe(status)
    expect((result.body as { error: { type: string } }).error.type).toBe(type)
    expect(f.events).toEqual(['begin', 'reserve:tx1', 'commit:tx1'])
  })

  test('A5 插入失败 → 回滚、无幂等完成、错误上抛', async () => {
    const f = setup({ insertError: new Error('insert failed') })
    await expect(f.service(guestInput())).rejects.toThrow('insert failed')
    expect(f.events).toContain('rollback:tx1')
    expect(f.events.some(event => event.startsWith('complete'))).toBe(false)
    expect(f.events.some(event => event.startsWith('commit'))).toBe(false)
  })

  test.each([
    ['会话行缺失', null],
    ['会话已 completed', { guestSessionInternalId: '11', status: 'completed', expiresAtMs: now + hour, activeCaseCount: 0 }],
    ['会话已到期', { guestSessionInternalId: '11', status: 'active', expiresAtMs: now, activeCaseCount: 0 }]
  ])('A6 %s → 401 PRINCIPAL_INVALID 可重放并提交', async (_name, guestSession) => {
    const f = setup({ guestSession })
    const result = await f.service(guestInput())
    expect(result.status).toBe(401)
    expect((result.body as { error: { type: string } }).error.type).toBe('PRINCIPAL_INVALID')
    expect(f.events.at(-2)).toBe('complete:tx1:401')
    expect(f.events.some(event => event.startsWith('insert'))).toBe(false)
  })

  test('A6 登录用户非 active → 401 PRINCIPAL_INVALID', async () => {
    const f = setup({ lockedUser: null })
    const result = await f.service(userInput())
    expect(result.status).toBe(401)
    expect(f.events.some(event => event.startsWith('insert'))).toBe(false)
  })

  test('前缀与主体不一致 → 内部错误回滚（游客不得写 epc_，登录不得写 gpc_）', async () => {
    await expect(setup().service({ ...guestInput(), newCaseRef: 'epc_app_case_000001' })).rejects.toThrow()
    await expect(setup().service({ ...userInput(), newCaseRef: 'gpc_app_case_000001' })).rejects.toThrow()
  })

  test('提交结果未知：对账读到同摘要完成记录 → 重放；读不到 → 503', async () => {
    const response = { status: 200, body: { data: { caseRef: 'gpc_app_case_000001', ownerKind: 'guest', expiresAt: '2026-10-10T04:00:00.000Z' } } }
    const replay = setup({ commitError: new DatabaseCommitResultUnknownError("提交结果未知"), reconciliation: { state: 'completed', requestHash: 'c'.repeat(64), response } })
    expect(await replay.service(guestInput())).toEqual(response)
    const unknown = setup({ commitError: new DatabaseCommitResultUnknownError("提交结果未知"), reconciliation: null })
    expect((await unknown.service(guestInput())).status).toBe(503)
  })

  test('S1 幂等完成快照不含内部主键、user_id 与会话引用', async () => {
    const f = setup()
    await f.service(userInput())
    const snapshot = JSON.stringify((f.completed[0] as { response: unknown }).response)
    expect(snapshot).not.toContain('usr_app_user_000001')
    expect(snapshot).not.toContain('"21"')
    expect(snapshot).not.toContain('gst_')
  })
})
