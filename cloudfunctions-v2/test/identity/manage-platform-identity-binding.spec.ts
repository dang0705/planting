import { describe, expect, test } from 'vitest'

import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import {
  createBindPlatformIdentityService,
  createRevokePlatformIdentityService,
  type BindPlatformIdentityApplicationInput,
  type RevokePlatformIdentityApplicationInput
} from '../../src/identity/application/manage-platform-identity-binding.js'
import { PlatformIdentityBindingPersistenceError } from '../../src/identity/repository/mysql-platform-identity-binding-repository.js'
import {
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import type { HttpIdempotencyCommitUnknownReadOnlyRepository } from '../../src/foundation/idempotency/commit-unknown-reconciliation.js'
import type { HttpIdempotencyStoredRecord } from '../../src/foundation/idempotency/http-idempotency.js'
import type {
  HttpIdempotencyCompletionInput,
  HttpIdempotencyReservationInput,
  MysqlHttpIdempotencyRepository
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import type { MysqlPlatformIdentityBindingRepository } from '../../src/identity/repository/mysql-platform-identity-binding-repository.js'

const currentTime = Date.parse('2026-09-21T01:00:00.000Z')
const currentUser = 'usr_identity_binding_app_001' as UserRef

/** 测试事务的可观察引用。 */
type TestTransaction = TransactionExecutionContext & {
  /** 用于证明所有 Repository 共享同一事务。 */
  readonly testRef: string
}

/** 创建已由 identity 解析的有效登录主体。 */
function createPrincipal(): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: currentUser,
    sessionVersion: Number('3'),
    authenticatedVia: 'wechat',
    issuedAt: '2026-09-21T00:00:00.000Z',
    expiresAt: '2026-09-22T00:00:00.000Z'
  }
}

/** 创建指定绑定操作的共享 HTTP 幂等输入。 */
function createIdempotencyInput(
  operationId: 'createIdentityBinding' | 'deleteIdentityBinding',
  httpMethod: 'POST' | 'DELETE',
  normalizedPath: string
): HttpIdempotencyReservationInput {
  return {
    principalType: 'user',
    principalScopeHash: 'a'.repeat(Number('64')),
    httpMethod,
    normalizedPath,
    operationId,
    idempotencyKeyHash: 'b'.repeat(Number('64')),
    requestHash: 'c'.repeat(Number('64')),
    expiresAtMs: currentTime + Number('604800000'),
    createdAtMs: currentTime
  }
}

/** 创建绑定或恢复应用输入。 */
function createBindInput(): BindPlatformIdentityApplicationInput {
  return {
    principal: createPrincipal(),
    verifiedIdentity: {
      platform: 'douyin',
      appScope: 'douyin-qhz-main',
      hashCandidates: [
        {
          platformSubjectHash: 'd'.repeat(Number('64')),
          subjectHashKeyVersion: 'identity-hmac.2026-09-21.1'
        }
      ]
    },
    platformSubjectCiphertext: null,
    occurredAtMs: currentTime,
    idempotency: createIdempotencyInput(
      'createIdentityBinding',
      'POST',
      '/api/v2/identity/bindings'
    )
  }
}

/** 创建解绑应用输入。 */
function createRevokeInput(): RevokePlatformIdentityApplicationInput {
  return {
    principal: createPrincipal(),
    platform: 'douyin',
    appScope: 'douyin-qhz-main',
    occurredAtMs: currentTime,
    idempotency: createIdempotencyInput(
      'deleteIdentityBinding',
      'DELETE',
      '/api/v2/identity/bindings/douyin'
    )
  }
}

/** 创建可观察事务、幂等与绑定 Repository 替身。 */
function createDependencies(
  overrides: {
    /** 幂等占位预设决策。 */
    readonly reserveDecision?: Awaited<
      ReturnType<MysqlHttpIdempotencyRepository<TestTransaction>['tryReserve']>
    >
    /** 绑定或恢复时抛出的确定/基础设施错误。 */
    readonly bindError?: Error
    /** 解绑时抛出的确定/基础设施错误。 */
    readonly revokeError?: Error
    /** 提交结果未知模拟。 */
    readonly commitError?: DatabaseCommitResultUnknownError
    /** 新连接只读对账记录。 */
    readonly reconciliationRecord?: HttpIdempotencyStoredRecord | null
  } = {}
) {
  const events: string[] = []
  const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_identity_binding' }
  const driver: DatabaseTransactionDriver<TestTransaction> = {
    async beginTransaction() {
      events.push('开始')
      return transaction
    },
    async commitTransaction(received) {
      events.push(`提交:${received.testRef}`)
      if (overrides.commitError) {
        throw overrides.commitError
      }
    },
    async rollbackTransaction(received) {
      events.push(`回滚:${received.testRef}`)
    },
    async recordRollbackFailure() {
      events.push('记录回滚失败')
    }
  }
  const idempotencyRepository: MysqlHttpIdempotencyRepository<TestTransaction> = {
    async read() {
      throw new Error('绑定应用不直接读取幂等记录')
    },
    async tryReserve(received) {
      events.push(`幂等占位:${received.testRef}`)
      return overrides.reserveDecision ?? { kind: 'reserved' }
    },
    async completionFirstResult(received, input: HttpIdempotencyCompletionInput) {
      events.push(`幂等完成:${received.testRef}:${input.response.status}`)
      return { kind: 'completed', response: input.response }
    }
  }
  const bindingRepository: MysqlPlatformIdentityBindingRepository<TestTransaction> = {
    async bindOrRestore(received, input) {
      events.push(`绑定:${received.testRef}:${input.subjectHashKeyVersion}`)
      if (overrides.bindError) {
        throw overrides.bindError
      }
      return { kind: 'created', platform: input.platform, appScope: input.appScope }
    },
    async revoke(received, input) {
      events.push(`解绑:${received.testRef}`)
      if (overrides.revokeError) {
        throw overrides.revokeError
      }
      return {
        platform: input.platform,
        appScope: input.appScope,
        nextSessionVersion: Number('4')
      }
    }
  }
  const commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository = {
    async read() {
      events.push('新连接只读对账')
      return overrides.reconciliationRecord ?? null
    }
  }
  return {
    events,
    driver,
    idempotencyRepository,
    bindingRepository,
    commitUnknownReadOnlyRepository
  }
}

/**
 * Expected 来源：`principal-capability/v1`、`state-machines/v1` 与 `http-api/v1`。
 * 测试层次：L3 / `unit_fake`；真实执行应用编排和事务 runner，替换 SQL 与连接边界。
 * 明确未覆盖：真实 MySQL 锁、Provider、CloudBase HTTP、网络中断和日志适配器。
 */
describe('平台身份绑定应用事务', () => {
  test('绑定首次请求在同一事务完成幂等占位、当前密钥写入和脱敏结果固化', async () => {
    const dependencies = createDependencies()
    const service = createBindPlatformIdentityService(dependencies)

    await expect(service(createBindInput())).resolves.toEqual({
      status: Number('200'),
      body: {
        data: {
          platform: 'douyin',
          appScope: 'douyin-qhz-main',
          bindingStatus: 'active'
        }
      }
    })
    expect(dependencies.events).toEqual([
      '开始',
      '幂等占位:tx_identity_binding',
      '绑定:tx_identity_binding:identity-hmac.2026-09-21.1',
      '幂等完成:tx_identity_binding:200',
      '提交:tx_identity_binding'
    ])
  })

  test('解绑在同一事务递增会话版本，并把最后入口拒绝固化为可重放 409', async () => {
    const successDependencies = createDependencies()
    const revoke = createRevokePlatformIdentityService(successDependencies)
    await expect(revoke(createRevokeInput())).resolves.toEqual({
      status: Number('200'),
      body: {
        data: {
          platform: 'douyin',
          appScope: 'douyin-qhz-main',
          bindingStatus: 'revoked',
          sessionVersion: Number('4')
        }
      }
    })
    expect(successDependencies.events).toEqual([
      '开始',
      '幂等占位:tx_identity_binding',
      '解绑:tx_identity_binding',
      '幂等完成:tx_identity_binding:200',
      '提交:tx_identity_binding'
    ])

    const rejectedDependencies = createDependencies({
      revokeError: new PlatformIdentityBindingPersistenceError(
        'IDENTITY_LAST_BINDING_REQUIRED',
        '最后一个登录入口不能解绑'
      )
    })
    await expect(
      createRevokePlatformIdentityService(rejectedDependencies)(createRevokeInput())
    ).resolves.toEqual({
      status: Number('409'),
      body: {
        error: {
          type: 'IDENTITY_LAST_BINDING_REQUIRED',
          message: '至少保留一个可用登录入口'
        }
      }
    })
    expect(rejectedDependencies.events).toContain('幂等完成:tx_identity_binding:409')
  })

  test('绑定冲突使用泛化 409，响应不泄露原用户、摘要、密文或内部键', async () => {
    const dependencies = createDependencies({
      bindError: new PlatformIdentityBindingPersistenceError(
        'IDENTITY_BINDING_CONFLICT',
        '主体已属于内部用户 99'
      )
    })
    const response = await createBindPlatformIdentityService(dependencies)(createBindInput())

    expect(response).toEqual({
      status: Number('409'),
      body: {
        error: {
          type: 'IDENTITY_BINDING_CONFLICT',
          message: '该登录入口暂时无法绑定'
        }
      }
    })
    expect(JSON.stringify(response)).not.toMatch(/99|dddddddd|cipher|internal/iu)
    expect(dependencies.events).toContain('幂等完成:tx_identity_binding:409')
  })

  test('同键同参已完成只重放，同键异参或处理中均不执行绑定写入', async () => {
    const replayResponse = { status: Number('200'), body: { data: { bindingStatus: 'active' } } }
    const replayDependencies = createDependencies({
      reserveDecision: { kind: 'replay', response: replayResponse }
    })
    await expect(
      createBindPlatformIdentityService(replayDependencies)(createBindInput())
    ).resolves.toEqual(replayResponse)
    expect(replayDependencies.events).toEqual([
      '开始',
      '幂等占位:tx_identity_binding',
      '提交:tx_identity_binding'
    ])

    const conflictDependencies = createDependencies({
      reserveDecision: {
        kind: 'conflict',
        errorType: 'IDEMPOTENCY_CONFLICT',
        httpStatus: Number('409')
      }
    })
    await expect(
      createBindPlatformIdentityService(conflictDependencies)(createBindInput())
    ).resolves.toMatchObject({ status: Number('409') })
    expect(conflictDependencies.events).not.toContain(
      '绑定:tx_identity_binding:identity-hmac.2026-09-21.1'
    )
  })

  test('Repository 基础设施失败回滚全部写入，不生成伪完成结果', async () => {
    const writeError = new Error('database unavailable')
    const dependencies = createDependencies({ bindError: writeError })

    await expect(createBindPlatformIdentityService(dependencies)(createBindInput())).rejects.toBe(
      writeError
    )
    expect(dependencies.events).toEqual([
      '开始',
      '幂等占位:tx_identity_binding',
      '绑定:tx_identity_binding:identity-hmac.2026-09-21.1',
      '回滚:tx_identity_binding'
    ])
  })

  test('提交结果未知只用新连接只读对账，无法证明完成时返回 503 且不重跑绑定', async () => {
    const committedResponse = {
      status: Number('200'),
      body: { data: { platform: 'douyin', bindingStatus: 'active' } }
    }
    const completedRecord: HttpIdempotencyStoredRecord = {
      requestHash: 'c'.repeat(Number('64')),
      state: 'completed',
      response: committedResponse
    }
    const replayDependencies = createDependencies({
      commitError: new DatabaseCommitResultUnknownError('commit acknowledgement lost'),
      reconciliationRecord: completedRecord
    })
    await expect(
      createBindPlatformIdentityService(replayDependencies)(createBindInput())
    ).resolves.toEqual(committedResponse)
    expect(replayDependencies.events.filter(event => event.startsWith('绑定:'))).toHaveLength(
      Number('1')
    )
    expect(replayDependencies.events).toContain('新连接只读对账')

    const unresolvedDependencies = createDependencies({
      commitError: new DatabaseCommitResultUnknownError('commit acknowledgement lost')
    })
    await expect(
      createBindPlatformIdentityService(unresolvedDependencies)(createBindInput())
    ).resolves.toEqual({
      status: Number('503'),
      body: {
        error: {
          type: 'SERVICE_UNAVAILABLE',
          message: '提交结果暂时无法确认，请使用相同幂等键重试'
        }
      }
    })
    expect(unresolvedDependencies.events.filter(event => event.startsWith('绑定:'))).toHaveLength(
      Number('1')
    )
  })
})
