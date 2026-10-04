import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

import { afterEach, describe, expect, test } from 'vitest'

import type {
  UserPlantDto,
  UserPlantRef,
  UserPrincipalDto,
  UserRef
} from '../../src/contracts/types.js'
import type { DatabaseTransactionDriver } from '../../src/foundation/database/transaction-runner.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
import type {
  MysqlHttpIdempotencyRepository,
  HttpIdempotencyReservationInput
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import type { HttpIdempotencyCommitUnknownReadOnlyRepository } from '../../src/foundation/idempotency/commit-unknown-reconciliation.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import {
  createRestoreUserPlantApplicationService,
  type UserPlantLifecycleRepository
} from '../../src/user-plant/application/transition-user-plant-lifecycle.js'
import {
  createRestoreUserPlantRouteHandler,
  restoreUserPlantRoute
} from '../../src/user-plant/http/transition-user-plant-route.js'
import { CapabilitySnapshotExpiredError } from '../../src/subscription/repository/mysql-capability-snapshot-reader.js'

const userRef = 'usr_restore_replay_owner_01' as UserRef
const plantRef = 'upl_restore_replay_plant_01' as UserPlantRef
const bearerToken = 'fixture-restore-replay-bearer-01'
const idempotencyKey = 'restore-replay-key-0001'
const newCommandIdempotencyKey = 'restore-new-command-key-0002'
const expectedVersion = 2
const nowMs = Date.parse('2026-09-27T03:00:00.000Z')
const zero = Number('0')
const one = Number('1')
const successStatus = Number('200')
const expiredSnapshotStatus = Number('409')

type ReplayTransaction = TransactionExecutionContext & {
  readonly id: 'restore-replay-transaction'
}

let server: ReturnType<typeof createServer> | undefined

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>(resolve => server?.close(() => resolve()))
  }
  server = undefined
})

/**
 * Expected 来源：docs/backend-v2/contracts/user-plant.md 的归档/恢复合同，同键同参须原样重放；
 * 恢复快照只能由服务端提供。测试层次：L3 / unit_fake，真实经过 Node HTTP → 冻结路由 →
 * 恢复应用与幂等裁决；替换身份解析、事务、Repository 和幂等存储，不访问真实 MySQL/CloudBase。
 * 本例验证：已有恢复结果重放时，即使当前服务端能力快照已不可用，也返回首次结果且不再查快照；
 * 不同幂等键的新恢复仍读取当前快照，快照过期时返回脱敏 409 并回滚、不执行生命周期写入。
 * 明确未覆盖：有效快照下的容量裁决、Repository SQL、真实并发、CloudBase 网关与真实身份签发。
 */
describe('恢复 HTTP 幂等重放', () => {
  test('已完成恢复的同键同参重试不依赖仍有效的能力快照', async () => {
    const firstResponse: HttpIdempotencyPublicResponseSnapshot = {
      status: successStatus,
      body: {
        data: {
          user_plant_id: plantRef,
          lifecycle: 'active',
          identityStatus: 'unidentified',
          version: 3,
          createdAt: '2026-09-27T03:00:00.000Z',
          updatedAt: '2026-09-27T03:00:00.000Z'
        } satisfies UserPlantDto
      }
    }
    let snapshotReads = 0
    let ownedPlantLocks = 0
    let activeCountReads = 0
    let compareAndSwapCalls = 0
    let rollbacks = 0

    const transaction: ReplayTransaction = {
      transactionContext: true,
      id: 'restore-replay-transaction'
    }
    const driver: DatabaseTransactionDriver<ReplayTransaction> = {
      beginTransaction: () => transaction,
      commitTransaction: () => undefined,
      rollbackTransaction: () => {
        rollbacks += one
      },
      recordRollbackFailure: () => undefined
    }
    const idempotencyRepository: MysqlHttpIdempotencyRepository<ReplayTransaction> = {
      read: async () => null,
      tryReserve: async (_transaction, input: HttpIdempotencyReservationInput) => {
        expect(input.operationId).toBe('restoreUserPlant')
        expect(input.normalizedPath).toBe('/api/v2/user-plants/{userPlantRef}/restore')
        expect(input.principalScopeHash).toBe(createHash('sha256').update(userRef).digest('hex'))
        expect(input.requestHash).toBe(
          createHash('sha256')
            .update(JSON.stringify({ userPlantRef: plantRef, expectedVersion }))
            .digest('hex')
        )
        return input.idempotencyKeyHash ===
          createHash('sha256').update(idempotencyKey).digest('hex')
          ? { kind: 'replay', response: firstResponse }
          : { kind: 'reserved' }
      },
      completionFirstResult: async () => {
        throw new Error('幂等重放不得写入新完成结果')
      }
    }
    const lifecycleRepository: UserPlantLifecycleRepository<ReplayTransaction> = {
      lockOwnedLifecycle: async () => {
        ownedPlantLocks += one
        return { lifecycle: 'archived', version: expectedVersion }
      },
      compareAndSwapLifecycle: async () => {
        compareAndSwapCalls += one
        throw new Error('幂等重放不得重复执行生命周期写入')
      }
    }
    const userPlantRepository = {
      lockUserAndCountActive: async () => {
        activeCountReads += one
        return { userInternalId: 'test-user-internal', activeCount: zero }
      },
      getOwnedUserPlant: async () => {
        throw new Error('幂等重放应直接返回首次公开投影')
      }
    }
    const commitUnknownReadOnlyRepository: HttpIdempotencyCommitUnknownReadOnlyRepository = {
      read: async () => null
    }
    const restoreUserPlant = createRestoreUserPlantApplicationService({
      driver,
      idempotencyRepository,
      lifecycleRepository,
      userPlantRepository,
      commitUnknownReadOnlyRepository
    })
    const principal: UserPrincipalDto = {
      principalType: 'user',
      user_id: userRef,
      sessionVersion: 1,
      authenticatedVia: 'wechat',
      issuedAt: '2026-09-26T03:00:00.000Z',
      expiresAt: '2026-09-28T03:00:00.000Z'
    }
    const dispatch = createRouteDispatcher([
      {
        route: restoreUserPlantRoute,
        handler: createRestoreUserPlantRouteHandler({
          resolvePrincipal: async command => {
            expect(command.bearerToken).toBe(bearerToken)
            return principal
          },
          resolveCapabilitySnapshot: async () => {
            snapshotReads += one
            throw new CapabilitySnapshotExpiredError()
          },
          archiveUserPlant: async () => {
            throw new Error('本请求必须命中恢复路由')
          },
          restoreUserPlant,
          now: () => nowMs,
          writeAudit: () => undefined
        })
      }
    ])

    server = createServer((request, response) => {
      dispatch(request, response).catch(() => undefined)
    })
    await new Promise<void>(resolve => server?.listen(zero, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') {
      throw new Error('测试 HTTP 服务未取得 TCP 地址')
    }

    const response = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/v2/user-plants/${plantRef}/restore`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearerToken}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey
        },
        body: JSON.stringify({ expectedVersion })
      }
    )

    expect(response.status).toBe(successStatus)
    expect(await response.json()).toEqual(firstResponse.body)
    expect(snapshotReads).toBe(zero)
    expect(activeCountReads).toBe(zero)
    expect(ownedPlantLocks).toBe(zero)
    expect(compareAndSwapCalls).toBe(zero)

    const newCommand = await fetch(
      `http://127.0.0.1:${String(address.port)}/api/v2/user-plants/${plantRef}/restore`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearerToken}`,
          'content-type': 'application/json',
          'idempotency-key': newCommandIdempotencyKey
        },
        body: JSON.stringify({ expectedVersion })
      }
    )
    expect(newCommand.status).toBe(expiredSnapshotStatus)
    expect(await newCommand.json()).toEqual({
      error: { type: 'CAPABILITY_SNAPSHOT_EXPIRED', message: '能力快照已失效，请重新请求' }
    })
    expect(snapshotReads).toBe(one)
    expect(activeCountReads).toBe(one)
    expect(ownedPlantLocks).toBe(one)
    expect(compareAndSwapCalls).toBe(zero)
    expect(rollbacks).toBe(one)
  })
})
