import { describe, expect, test } from 'vitest'

import type {
  UserCapabilitySnapshotDto,
  UserPlantDto,
  UserPlantRef,
  UserPrincipalDto,
  UserRef
} from '../../src/contracts/types.js'
import {
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
import type {
  HttpIdempotencyCompletionInput,
  HttpIdempotencyReservationInput,
  MysqlHttpIdempotencyRepository
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import type { HttpIdempotencyCommitUnknownReadOnlyRepository } from '../../src/foundation/idempotency/commit-unknown-reconciliation.js'
import { UserPlantPersistenceError } from '../../src/user-plant/repository/mysql-user-plant-repository.js'
import {
  createArchiveUserPlantApplicationService,
  createRestoreUserPlantApplicationService,
  type UserPlantLifecycleRepository
} from '../../src/user-plant/application/transition-user-plant-lifecycle.js'

const currentUser = 'usr_lifecycle_owner_001' as UserRef
const anotherUser = 'usr_lifecycle_owner_002' as UserRef
const currentPlant = 'upl_lifecycle_plant_001' as UserPlantRef
const successStatus = Number('200')
const notFoundStatus = Number('404')
const conflictStatus = Number('409')
const unavailableStatus = Number('503')
const initialVersion = Number('3')
const nextVersion = Number('4')
const occurredAtMs = Number('1790000000000')

/** 应用测试事务标记；只用于确认领域命令共享同一个事务。 */
type TestTransaction = TransactionExecutionContext & {
  /** 用于断言事务边界的不可公开测试标记。 */
  readonly testTransactionId: string
}

/** 幂等测试记录；只模拟 Foundation 端口返回，不实现生产幂等存储。 */
type TestIdempotencyRecord = {
  /** 首次请求的规范化载荷摘要。 */
  readonly requestHash: string
  /** 首次请求完成后固定保存的公开响应。 */
  readonly response?: HttpIdempotencyPublicResponseSnapshot
}

/** 幂等假实现只接收需要控制的已有记录或处理态分支。 */
type TestIdempotencyOptions = {
  /** 测试中预置的唯一作用域记录。 */
  readonly existing?: TestIdempotencyRecord
  /** 没有预置记录时要模拟的共享 Repository 裁决。 */
  readonly decision?: 'reserved' | 'wait_for_winner'
}

/** 建立来自 identity 域的用户主体，确保用例以统一 user_id 归属。 */
function createPrincipal(userRef: UserRef = currentUser): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: userRef,
    sessionVersion: Number('1'),
    authenticatedVia: 'wechat',
    issuedAt: '2026-09-24T00:00:00.000Z',
    expiresAt: '2026-09-25T00:00:00.000Z'
  }
}

/** 构造 subscription 域针对同一统一用户签发的免费档能力快照。 */
function createCapabilitySnapshot(
  userRef: UserRef = currentUser,
  activeUserPlantLimit: number = Number('1')
): UserCapabilitySnapshotDto {
  return {
    contractVersion: 'capability-snapshot/v1',
    snapshotRef: 'cps_userplant_limit_001',
    subjectType: 'user',
    user_id: userRef,
    tier: 'free',
    allowedCapabilities: ['USER_PLANT_CREATE'],
    rewardedAiScopes: [],
    activeUserPlantLimit: activeUserPlantLimit,
    generatedAt: '2026-09-21T00:00:00.000Z',
    validUntil: '2026-09-22T00:00:00.000Z',
    policyVersion: 'user-plant-limit/2026-09-20.1'
  }
}

/** 构造公开合同允许的用户植物最小投影。 */
function createPlant(lifecycle: 'active' | 'archived', version: number): UserPlantDto {
  return {
    user_plant_id: currentPlant,
    lifecycle: lifecycle,
    identityStatus: 'unidentified',
    version: version,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z'
  }
}

/** 按 route-registry 中的动作和路径创建固定范围幂等输入。 */
function createIdempotencyInput(
  operation: 'archive' | 'restore',
  options: { readonly keyHash?: string; readonly requestHash?: string } = {}
): HttpIdempotencyReservationInput {
  const route =
    operation === 'archive'
      ? {
          operationId: 'archiveUserPlant',
          normalizedPath: '/api/v2/user-plants/{userPlantRef}/archive'
        }
      : {
          operationId: 'restoreUserPlant',
          normalizedPath: '/api/v2/user-plants/{userPlantRef}/restore'
        }
  return {
    principalType: 'user',
    principalScopeHash: 'a'.repeat(Number('64')),
    httpMethod: 'POST',
    normalizedPath: route.normalizedPath,
    operationId: route.operationId,
    idempotencyKeyHash: options.keyHash ?? 'b'.repeat(Number('64')),
    requestHash: options.requestHash ?? 'c'.repeat(Number('64')),
    expiresAtMs: Number('1790000300000'),
    createdAtMs: occurredAtMs
  }
}

/** 创建只保留归档状态与版本的可观测 Repository 假实现。 */
function createLifecycleRepository(
  initial: { readonly lifecycle: 'active' | 'archived'; readonly version: number } | Error,
  events: string[]
): UserPlantLifecycleRepository<TestTransaction> {
  let current = initial
  return {
    async lockOwnedLifecycle(transaction, userRef, userPlantRef) {
      events.push(`lock:${transaction.testTransactionId}:${userRef}:${userPlantRef}`)
      if (current instanceof Error) {
        throw current
      }
      return current
    },
    async compareAndSwapLifecycle(transaction, input) {
      events.push(
        `cas:${transaction.testTransactionId}:${input.expectedLifecycle}:${input.expectedVersion}:${input.targetLifecycle}`
      )
      if (current instanceof Error) {
        throw current
      }
      if (
        current.lifecycle !== input.expectedLifecycle ||
        current.version !== input.expectedVersion
      ) {
        return false
      }
      current = {
        lifecycle: input.targetLifecycle,
        version: input.expectedVersion + Number('1')
      }
      return true
    }
  }
}

/** 构造轻量幂等端口假实现；实际唯一键、事务与摘要由 Foundation/MySQL 测试负责。 */
function createIdempotencyRepository(
  events: string[],
  options: TestIdempotencyOptions = {}
): {
  readonly repository: MysqlHttpIdempotencyRepository<TestTransaction>
  readonly records: Map<string, TestIdempotencyRecord>
} {
  const records = new Map<string, TestIdempotencyRecord>()
  const inputKey = (input: {
    readonly operationId: string
    readonly idempotencyKeyHash: string
  }): string => `${input.operationId}:${input.idempotencyKeyHash}`
  if (options.existing !== undefined) {
    records.set('archiveUserPlant:'.concat('b'.repeat(Number('64'))), options.existing)
  }
  const repository: MysqlHttpIdempotencyRepository<TestTransaction> = {
    async read() {
      return null
    },
    async tryReserve(_transaction, input) {
      events.push(`reserve:${input.operationId}`)
      const existing = records.get(inputKey(input))
      if (existing !== undefined) {
        if (existing.requestHash !== input.requestHash) {
          return {
            kind: 'conflict',
            httpStatus: conflictStatus,
            errorType: 'IDEMPOTENCY_CONFLICT'
          }
        }
        if (existing.response !== undefined) {
          return { kind: 'replay', response: existing.response }
        }
        return { kind: 'wait_for_winner' }
      }
      if (options.decision === 'wait_for_winner') {
        return { kind: 'wait_for_winner' }
      }
      records.set(inputKey(input), { requestHash: input.requestHash })
      return { kind: 'reserved' }
    },
    async completionFirstResult(_transaction, input: HttpIdempotencyCompletionInput) {
      events.push(`complete:${input.operationId}:${input.response.status}`)
      records.set(inputKey(input), {
        requestHash: input.requestHash,
        response: input.response
      })
      return { kind: 'completed', response: input.response }
    }
  }
  return { repository: repository, records: records }
}

/** 为应用测试组装事务、Repository 与共享幂等端口。 */
function createDependencies(
  initial: { readonly lifecycle: 'active' | 'archived'; readonly version: number } | Error,
  options: {
    readonly idempotency?: TestIdempotencyOptions
    readonly commitError?: DatabaseCommitResultUnknownError
    readonly readOnlyRecord?: HttpIdempotencyCommitUnknownReadOnlyRepository
    readonly activeCount?: number
  } = {}
) {
  const events: string[] = []
  const transaction: TestTransaction = {
    transactionContext: true,
    testTransactionId: 'tx_user_plant_lifecycle'
  }
  const driver: DatabaseTransactionDriver<TestTransaction> = {
    async beginTransaction() {
      events.push('begin')
      return transaction
    },
    async commitTransaction() {
      events.push('commit')
      if (options.commitError !== undefined) {
        throw options.commitError
      }
    },
    async rollbackTransaction() {
      events.push('rollback')
    },
    async recordRollbackFailure() {
      events.push('rollback-failure')
    }
  }
  const idempotency = createIdempotencyRepository(events, options.idempotency)
  const lifecycleRepository = createLifecycleRepository(initial, events)
  const userPlantRepository = {
    async lockUserAndCountActive(_transaction: TestTransaction, userRef: UserRef) {
      events.push(`count:${userRef}`)
      return {
        userInternalId: '41',
        activeCount: options.activeCount ?? Number('0')
      }
    },
    async getOwnedUserPlant(
      _transaction: TestTransaction,
      userRef: UserRef,
      userPlantRef: UserPlantRef
    ) {
      events.push(`read:${userRef}:${userPlantRef}`)
      if (initial instanceof Error) {
        throw initial
      }
      return createPlant(
        initial.lifecycle === 'active' ? 'archived' : 'active',
        initial.version + Number('1')
      )
    }
  }
  const commitUnknownReadOnlyRepository =
    options.readOnlyRecord ??
    ({
      async read() {
        const record = [...idempotency.records.values()].find(item => item.response !== undefined)
        return record === undefined
          ? null
          : {
              requestHash: record.requestHash,
              state: 'completed' as const,
              response: record.response as HttpIdempotencyPublicResponseSnapshot
            }
      }
    } satisfies HttpIdempotencyCommitUnknownReadOnlyRepository)
  return {
    events: events,
    idempotencyRecords: idempotency.records,
    dependencies: {
      driver: driver,
      idempotencyRepository: idempotency.repository,
      lifecycleRepository: lifecycleRepository,
      userPlantRepository: userPlantRepository,
      commitUnknownReadOnlyRepository: commitUnknownReadOnlyRepository
    }
  }
}

/** 创建符合归档/恢复命令合同的内部用例输入。 */
function createInput(
  operation: 'archive' | 'restore',
  overrides: {
    readonly userRef?: UserRef
    readonly expectedVersion?: number
    readonly idempotency?: HttpIdempotencyReservationInput
  } = {}
) {
  return {
    principal: createPrincipal(overrides.userRef ?? currentUser),
    userPlantRef: currentPlant,
    expectedVersion: overrides.expectedVersion ?? initialVersion,
    occurredAtMs: occurredAtMs,
    idempotency: overrides.idempotency ?? createIdempotencyInput(operation)
  }
}

/** 给恢复命令附上已经过身份/能力边界验证的请求级快照。 */
function createRestoreInput(
  overrides: {
    readonly userRef?: UserRef
    readonly expectedVersion?: number
    readonly idempotency?: HttpIdempotencyReservationInput
    readonly capabilitySnapshot?: UserCapabilitySnapshotDto
  } = {}
) {
  const userRef = overrides.userRef ?? currentUser
  return {
    ...createInput('restore', overrides),
    capabilitySnapshot: overrides.capabilitySnapshot ?? createCapabilitySnapshot(userRef)
  }
}

/**
 * Expected 来源：`docs/backend-v2/decisions/P0-product-cost-boundaries.md#D-03`、
 * `contracts/principal-and-capability.md` 的请求快照上限，以及 `contracts/user-plant.md`、
 * `data/state-machines.md`、`api/route-registry.json` 的 active↔archived、版本、幂等与错误合同。
 * 测试层次：L3 / `unit_fake`；运行真实应用编排和共享事务/幂等端口，替换 SQL Repository、事务驱动。
 * 明确未覆盖：Repository SQL、真实双连接竞争、MySQL 持久化和 HTTP DTO/路由接线。
 */
describe('归档与恢复用户植物应用服务', () => {
  test('归档 active 植物时递增版本并重读真实公开投影后写入完成响应', async () => {
    const setup = createDependencies({ lifecycle: 'active', version: initialVersion })
    const service = createArchiveUserPlantApplicationService(setup.dependencies)

    await expect(service(createInput('archive'))).resolves.toEqual({
      status: successStatus,
      body: { data: createPlant('archived', nextVersion) }
    })
    expect(setup.events).toEqual([
      'begin',
      'reserve:archiveUserPlant',
      `lock:tx_user_plant_lifecycle:${currentUser}:${currentPlant}`,
      `cas:tx_user_plant_lifecycle:active:${initialVersion}:archived`,
      `read:${currentUser}:${currentPlant}`,
      `complete:archiveUserPlant:${successStatus}`,
      'commit'
    ])
  })

  test('恢复 archived 植物时也按 expectedVersion 做递增更新', async () => {
    const setup = createDependencies({ lifecycle: 'archived', version: initialVersion })
    const service = createRestoreUserPlantApplicationService(setup.dependencies)

    await expect(service(createRestoreInput())).resolves.toEqual({
      status: successStatus,
      body: { data: createPlant('active', nextVersion) }
    })
    expect(setup.events).toContain(`cas:tx_user_plant_lifecycle:archived:${initialVersion}:active`)
  })

  test('当前 active 数已达能力快照上限时拒绝恢复且不执行 CAS', async () => {
    const setup = createDependencies(
      { lifecycle: 'archived', version: initialVersion },
      { activeCount: Number('1') }
    )
    const service = createRestoreUserPlantApplicationService(setup.dependencies)

    await expect(service(createRestoreInput())).resolves.toEqual({
      status: Number('403'),
      body: {
        error: {
          type: 'CAPABILITY_DENIED',
          message: '当前可恢复的用户植物数量已达上限'
        }
      }
    })
    expect(setup.events).toEqual([
      'begin',
      'reserve:restoreUserPlant',
      `count:${currentUser}`,
      `lock:tx_user_plant_lifecycle:${currentUser}:${currentPlant}`,
      `complete:restoreUserPlant:${Number('403')}`,
      'commit'
    ])
  })

  test('当前 active 数未达能力快照上限时恢复并先锁定同一用户再检查植物', async () => {
    const setup = createDependencies(
      { lifecycle: 'archived', version: initialVersion },
      { activeCount: Number('0') }
    )
    const service = createRestoreUserPlantApplicationService(setup.dependencies)

    await expect(service(createRestoreInput())).resolves.toEqual({
      status: successStatus,
      body: { data: createPlant('active', nextVersion) }
    })
    expect(setup.events.indexOf(`count:${currentUser}`)).toBeLessThan(
      setup.events.indexOf(`lock:tx_user_plant_lifecycle:${currentUser}:${currentPlant}`)
    )
    expect(setup.events).toContain(`cas:tx_user_plant_lifecycle:archived:${initialVersion}:active`)
  })

  test('能力快照归属不是当前统一用户时拒绝恢复且不执行 CAS', async () => {
    const setup = createDependencies({ lifecycle: 'archived', version: initialVersion })
    const service = createRestoreUserPlantApplicationService(setup.dependencies)

    await expect(
      service(createRestoreInput({ capabilitySnapshot: createCapabilitySnapshot(anotherUser) }))
    ).resolves.toEqual({
      status: Number('403'),
      body: {
        error: {
          type: 'CAPABILITY_DENIED',
          message: '当前能力不允许恢复用户植物'
        }
      }
    })
    expect(setup.events.some(event => event.startsWith('cas:'))).toBe(false)
    expect(setup.events[setup.events.length - Number('1')]).toBe('commit')
  })

  test('过期版本返回可重放的 409，且不执行生命周期写入', async () => {
    const setup = createDependencies({ lifecycle: 'active', version: initialVersion })
    const service = createArchiveUserPlantApplicationService(setup.dependencies)

    await expect(
      service(createInput('archive', { expectedVersion: initialVersion - Number('1') }))
    ).resolves.toEqual({
      status: conflictStatus,
      body: {
        error: {
          type: 'USER_PLANT_VERSION_CONFLICT',
          message: '用户植物版本已变化，请重新读取'
        }
      }
    })
    expect(setup.events.some(event => event.startsWith('cas:'))).toBe(false)
    expect(setup.events[setup.events.length - Number('1')]).toBe('commit')
  })

  test('越权或不可见植物使用同一 404 并且不执行写入', async () => {
    const setup = createDependencies(
      new UserPlantPersistenceError('USER_PLANT_NOT_FOUND', '当前主体不可访问该植物')
    )
    const service = createArchiveUserPlantApplicationService(setup.dependencies)

    await expect(service(createInput('archive', { userRef: anotherUser }))).resolves.toEqual({
      status: notFoundStatus,
      body: {
        error: {
          type: 'USER_PLANT_NOT_FOUND',
          message: '用户植物不存在或不可访问'
        }
      }
    })
    expect(setup.events.some(event => event.startsWith('cas:'))).toBe(false)
    expect(setup.events[setup.events.length - Number('1')]).toBe('commit')
  })

  test('相同幂等键与载荷重放首次响应且不再次读取或变更植物', async () => {
    const firstResponse = {
      status: successStatus,
      body: { data: createPlant('archived', nextVersion) }
    }
    const setup = createDependencies(
      { lifecycle: 'active', version: initialVersion },
      {
        idempotency: {
          existing: { requestHash: 'c'.repeat(Number('64')), response: firstResponse }
        }
      }
    )
    const service = createArchiveUserPlantApplicationService(setup.dependencies)

    await expect(service(createInput('archive'))).resolves.toEqual(firstResponse)
    expect(setup.events).toEqual(['begin', 'reserve:archiveUserPlant', 'commit'])
  })

  test('同一幂等键用于不同规范化载荷时返回冲突且不访问植物 Repository', async () => {
    const setup = createDependencies(
      { lifecycle: 'active', version: initialVersion },
      {
        idempotency: { existing: { requestHash: 'd'.repeat(Number('64')) } }
      }
    )
    const service = createArchiveUserPlantApplicationService(setup.dependencies)

    await expect(service(createInput('archive'))).resolves.toEqual({
      status: conflictStatus,
      body: {
        error: {
          type: 'IDEMPOTENCY_CONFLICT',
          message: '幂等键已用于其他请求'
        }
      }
    })
    expect(setup.events).toEqual(['begin', 'reserve:archiveUserPlant', 'commit'])
  })

  test('提交结果未知时只读对账重放已提交响应，不再次执行归档', async () => {
    const setup = createDependencies(
      { lifecycle: 'active', version: initialVersion },
      {
        commitError: new DatabaseCommitResultUnknownError('模拟提交确认丢失')
      }
    )
    const service = createArchiveUserPlantApplicationService(setup.dependencies)

    await expect(service(createInput('archive'))).resolves.toEqual({
      status: successStatus,
      body: { data: createPlant('archived', nextVersion) }
    })
    expect(setup.events.filter(event => event.startsWith('cas:'))).toHaveLength(Number('1'))
    expect(setup.events).not.toContain('rollback')
  })

  test('提交未知且无可证明结果时失败关闭为 503，不重跑生命周期命令', async () => {
    const setup = createDependencies(
      { lifecycle: 'active', version: initialVersion },
      {
        commitError: new DatabaseCommitResultUnknownError('模拟提交确认丢失'),
        readOnlyRecord: {
          async read() {
            throw new Error('只读查询当前不可用')
          }
        }
      }
    )
    const service = createArchiveUserPlantApplicationService(setup.dependencies)

    await expect(service(createInput('archive'))).resolves.toEqual({
      status: unavailableStatus,
      body: {
        error: {
          type: 'SERVICE_UNAVAILABLE',
          message: '提交结果暂时无法确认，请使用相同幂等键重试'
        }
      }
    })
    expect(setup.events.filter(event => event.startsWith('cas:'))).toHaveLength(Number('1'))
    expect(setup.events).not.toContain('rollback')
  })

  test('归档已归档植物不能重复递增版本或改写状态', async () => {
    const setup = createDependencies({ lifecycle: 'archived', version: initialVersion })
    const service = createArchiveUserPlantApplicationService(setup.dependencies)

    const response = await service(createInput('archive'))
    expect(response).toEqual({
      status: conflictStatus,
      body: {
        error: {
          type: 'USER_PLANT_VERSION_CONFLICT',
          message: '用户植物状态已变化，请重新读取'
        }
      }
    })
    expect(setup.events.some(event => event.startsWith('cas:'))).toBe(false)
  })
})
