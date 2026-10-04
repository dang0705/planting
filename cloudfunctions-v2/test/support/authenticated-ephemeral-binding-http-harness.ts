import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Connection } from 'mysql2/promise'
import { expect } from 'vitest'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import type { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
import { createAuthenticatedEphemeralBindingApplicationService } from '../../src/user-plant/application/bind-authenticated-ephemeral-case.js'
import {
  createMysqlAuthenticatedEphemeralBindingRepository,
  createMysqlAuthenticatedEphemeralBindingCommitUnknownReader
} from '../../src/user-plant/repository/mysql-authenticated-ephemeral-binding-repository.js'
import { createMysqlAuthenticatedEphemeralCaseOwnershipReader } from '../../src/user-plant/repository/mysql-authenticated-ephemeral-case-ownership-reader.js'
import {
  createAuthenticatedEphemeralBindingRouteHandler,
  authenticatedEphemeralBindingRoute
} from '../../src/user-plant/http/authenticated-ephemeral-binding-route.js'

/** L3/unit_real_data：真实HTTP→固定请求链→归属读取→应用→事务→三表；只替identity返回的已知Principal。
 * 1024字节是隔离测试夹具，不是生产默认；未知提交只替commit回包，不替持久化/核对。
 * Expected来自已冻结绑定HTTP合同及原案例字段，不推断任何登录验真或CloudBase部署结果。 */
export async function verifyAuthenticatedEphemeralBindingHttp(
  db: Connection,
  source: ReturnType<typeof createMysql2ConnectionSource>,
  scenario: 'success_replay_conflict' | 'cross_user' | 'commit_unknown'
): Promise<void> {
  const principal: UserPrincipalDto = {
    principalType: 'user',
    user_id: 'usr_binding_owner01' as UserRef,
    sessionVersion: 1,
    authenticatedVia: 'wechat',
    issuedAt: '1970-01-01T00:00:01.000Z',
    expiresAt: '1970-01-01T00:00:10.000Z'
  }
  let now = 3000,
    promotions = 0,
    transactionConnections = 0,
    readonlyConnections = 0
  const transactionSource: typeof source = {
    getConnection: async () => {
      transactionConnections++
      const connection = await source.getConnection()
      return {
        ...connection,
        commit: async () => {
          await connection.commit()
          if (scenario === 'commit_unknown') {
            throw new DatabaseCommitResultUnknownError('受控提交回包未知')
          }
        }
      }
    }
  }
  const readonlySource: typeof source = {
    getConnection: async () => {
      readonlyConnections++
      return source.getConnection()
    }
  }
  const service = createAuthenticatedEphemeralBindingApplicationService({
    driver: createMysqlTransactionDriver(transactionSource, () => undefined),
    repository: createMysqlAuthenticatedEphemeralBindingRepository(),
    commitUnknownReadOnlyRepository:
      createMysqlAuthenticatedEphemeralBindingCommitUnknownReader(readonlySource)
  })
  const ownership = createMysqlAuthenticatedEphemeralCaseOwnershipReader(source)
  const dispatch = createRouteDispatcher([
    {
      route: authenticatedEphemeralBindingRoute,
      handler: createAuthenticatedEphemeralBindingRouteHandler({
        maxBodyBytes: 1024,
        resolvePrincipal: async () => principal,
        readOwnedCase: input => ownership.readOwned(input),
        bindExisting: service,
        now: () => now,
        createPromotionRef: () => `prm_http_binding_${++promotions}`,
        writeAudit: () => undefined
      })
    }
  ])
  const server = createServer((req, res) => {
    dispatch(req, res).catch(() => undefined)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/user-plants/ephemeral-cases`
  const post = async (
    target = 'upl_binding_target01',
    caseRef = 'epc_binding_case01',
    body?: string
  ) => {
    const response = await fetch(`${base}/${caseRef}/bindings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer fixture-session-token',
        'idempotency-key': 'binding-http-original'
      },
      body:
        body ?? JSON.stringify({ target: { type: 'existing_user_plant', user_plant_id: target } })
    })
    return { status: response.status, body: await response.json() }
  }
  const success = { status: 200, body: { data: { user_plant_id: 'upl_binding_target01' } } }
  try {
    if (scenario === 'cross_user') {
      expect(await post('upl_binding_target01', 'epc_binding_other01')).toEqual({
        status: 404,
        body: { error: { type: 'NOT_FOUND', message: '案例或用户植物不存在' } }
      })
      expect(
        (await post('upl_binding_target01', 'epc_binding_other01', 'invalid-json')).status
      ).toBe(404)
      expect((await post('upl_binding_other001')).status).toBe(404)
      const [rows] = await db.query(
        'SELECT (SELECT COUNT(*) FROM authenticated_ephemeral_promotion_commands) AS commands,(SELECT COUNT(*) FROM authenticated_ephemeral_case_bindings) AS bindings'
      )
      expect(rows).toEqual([{ commands: 0, bindings: 0 }])
      const [cases] = await db.query(
        'SELECT status,version FROM authenticated_ephemeral_plant_cases WHERE id=1'
      )
      expect(cases).toEqual([{ status: 'completed', version: 7 }])
      return
    }
    expect(await post()).toEqual(success)
    if (scenario === 'success_replay_conflict') {
      now = 6000
      expect(await post()).toEqual(success)
      expect((await post('upl_binding_target02')).status).toBe(409)
    } else {
      expect(transactionConnections).toBe(1)
      expect(readonlyConnections).toBe(1)
    }
    const [cases] = await db.query(
      'SELECT status,version,CAST(completed_at_ms AS CHAR) AS completed,CAST(expires_at_ms AS CHAR) AS expires,CAST(created_at_ms AS CHAR) AS created,CAST(updated_at_ms AS CHAR) AS updated FROM authenticated_ephemeral_plant_cases WHERE id=1'
    )
    expect(cases).toEqual([
      {
        status: 'bound',
        version: 8,
        completed: '2000',
        expires: '5000',
        created: '1000',
        updated: '3000'
      }
    ])
    const [receipt] = await db.query(
      'SELECT c.status,c.promotion_ref,p.public_user_plant_id AS target,CAST(b.bound_at_ms AS CHAR) AS bound FROM authenticated_ephemeral_promotion_commands c JOIN authenticated_ephemeral_case_bindings b ON b.promotion_command_internal_id=c.id JOIN user_plants p ON p.id=b.user_plant_internal_id'
    )
    expect(receipt).toEqual([
      {
        status: 'completed',
        promotion_ref: 'prm_http_binding_1',
        target: 'upl_binding_target01',
        bound: '3000'
      }
    ])
    const [counts] = await db.query(
      'SELECT (SELECT COUNT(*) FROM user_plants) AS plants,(SELECT COUNT(*) FROM authenticated_ephemeral_promotion_commands) AS commands,(SELECT COUNT(*) FROM authenticated_ephemeral_case_bindings) AS bindings'
    )
    expect(counts).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
