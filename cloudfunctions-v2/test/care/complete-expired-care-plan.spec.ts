import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

import { createLongTermCareCommands } from '../../src/care/application/long-term-care-commands.js'
import { createLongTermCareRouteBindings, type LongTermCareRouteDependencies } from '../../src/care/http/long-term-care-routes.js'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import { careLongTermRulesV1, fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * unit_fake。Expected：long-term-care-contract.md §12.2/§12.3（扫描先过期 → 用户完成返回 409 CARE_PLAN_EXPIRED，
 * 不写事实/观察/计划；判定先于版本比对；completed/cancelled 仍为 CARE_PLAN_VERSION_CONFLICT）。
 * L1：真实 completePlan 用例 + 真实 Repository SQL 函数，替换事务驱动、幂等仓储与 mysql2 连接（按 SQL 片段返回固定行）。
 * L3：真实 node:http + 冻结分发 + 认证 JSON 路由链，用例为替身；证明新错误被登记为可公开透传（否则 500）。
 * 未覆盖：真实 MySQL 行锁顺序（扫描与完成真实竞争）。
 */
const now = Date.UTC(2026, 9, 9, 4)
const calendar = { title: '检查绿萝盆土', startAt: '2026-10-05T04:00:00.000Z', endAt: '2026-10-05T04:30:00.000Z', notes: '用手指插入土中 3～5 厘米检查干湿，再决定是否浇水。' }

function fakeCommands(planStatus: string, planVersion: number) {
  const writes: string[] = []
  const connection = {
    query: async (sql: string) => {
      if (sql.includes('FROM user_plants')) {
        return [{ user_internal_id: '11', plant_internal_id: '22', lifecycle_status: 'active', created_at_ms: String(now - 30 * 86_400_000), plant_version: 1, profile_version: null }]
      }
      if (sql.includes('FROM care_plans')) {
        return [{ id: '33', status: planStatus, version: planVersion, plan_payload_json: JSON.stringify({ calendar, completedFactRef: null }) }]
      }
      throw new Error(`未预期查询：${sql}`)
    },
    execute: async (sql: string) => { writes.push(sql); return { affectedRows: 1, insertId: 1 } }
  }
  const driver = {
    beginTransaction: async () => ({ transactionContext: true, connection }),
    commitTransaction: async () => undefined,
    rollbackTransaction: async () => undefined,
    recordRollbackFailure: async () => undefined
  }
  const idempotencyRepository = {
    tryReserve: async () => ({ kind: 'reserved' }),
    completionFirstResult: async (_transaction: unknown, input: { response: unknown }) => ({ kind: 'completed', response: input.response })
  }
  let sequence = 0
  const commands = createLongTermCareCommands({
    driver, idempotencyRepository, commitUnknownReadOnlyRepository: {}, createRef: (kind: string) => `c${kind.slice(0, 2)}_ref_${String(++sequence).padStart(8, '0')}`
  } as never)
  const complete = (request: Record<string, unknown>) => commands.completePlan({ rules: careLongTermRulesV1(),
    userRef: 'usr_expiry_user_0001', userPlantRef: 'upl_expiry_plant_001', nowMs: now, planRef: 'cpl_expiry_plan_0001',
    idempotency: {} as never, request: request as never
  })
  return { writes, complete }
}

describe('L1 已过期计划再完成', () => {
  it('done（附浇水与盆土）→ 409 CARE_PLAN_EXPIRED，不写任何行', async () => {
    const { writes, complete } = fakeCommands('expired', 2)
    const result = await complete({ version: 2, outcome: 'done', soil: { state: 'dry', scope: 'surface' }, watering: { occurredAt: new Date(now - 3_600_000).toISOString(), amountMl: 200 } })
    expect(result).toEqual({ status: 409, body: { error: { type: 'CARE_PLAN_EXPIRED', message: '计划已过期，请重新获取浇水建议' } } })
    expect(writes).toEqual([])
  })

  it('skipped 且版本已旧 → 仍是 CARE_PLAN_EXPIRED（过期判定先于版本比对）', async () => {
    const { writes, complete } = fakeCommands('expired', 2)
    expect((await complete({ version: 1, outcome: 'skipped' })).body).toMatchObject({ error: { type: 'CARE_PLAN_EXPIRED' } })
    expect(writes).toEqual([])
  })

  it.each(['completed', 'cancelled'])('%s 计划 → 仍为 CARE_PLAN_VERSION_CONFLICT（语义收窄后不变）', async status => {
    const { writes, complete } = fakeCommands(status, 2)
    expect((await complete({ version: 2, outcome: 'done' })).body).toMatchObject({ error: { type: 'CARE_PLAN_VERSION_CONFLICT' } })
    expect(writes).toEqual([])
  })

  it('planned 且版本匹配 → 正常完成（按版本条件写终态）', async () => {
    const { writes, complete } = fakeCommands('planned', 1)
    expect(await complete({ version: 1, outcome: 'skipped' })).toMatchObject({ status: 200, body: { data: { status: 'cancelled', version: 2 } } })
    expect(writes.some(sql => /UPDATE care_plans SET status = \?/u.test(sql) && sql.includes("status = 'planned'"))).toBe(true)
  })
})

const user: UserPrincipalDto = { principalType: 'user', user_id: 'usr_expiry_user_0001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat',
  issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() }
const servers: Server[] = []
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } })

describe('L3 完成路由透传 CARE_PLAN_EXPIRED', () => {
  it('用例返回 409 CARE_PLAN_EXPIRED → HTTP 409 原样公开，不降级为 500', async () => {
    const unused = async () => { throw new Error('本用例不应调用') }
    const dependencies: LongTermCareRouteDependencies = {
      authenticate: async () => user,
      now: () => now,
      writeAudit: () => undefined,
      ...fixturePolicyPorts(),
      readPlantContext: unused,
      readTaxonDisplayName: unused,
      commands: {
        recordWatering: unused, confirmProposal: unused,
        completePlan: async () => ({ status: 409, body: { error: { type: 'CARE_PLAN_EXPIRED', message: '计划已过期，请重新获取浇水建议' } } })
      },
      reads: { latestWateringFact: unused, listPlans: unused, latestAdvice: unused }
    }
    const dispatch = createRouteDispatcher(createLongTermCareRouteBindings(dependencies))
    const server = createServer((req, res) => { dispatch(req, res).catch(() => undefined) })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const response = await new Promise<{ status: number; body: { error?: { type: string } } }>((resolve, reject) => {
      const req = request(`http://127.0.0.1:${port}/api/v2/care/user-plants/upl_expiry_plant_001/plans/cpl_expiry_plan_0001/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer user-session-token', 'idempotency-key': 'expiry-route-key-0001' }
      }, res => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) }))
      })
      req.on('error', reject)
      req.end(JSON.stringify({ version: 2, outcome: 'done' }))
    })
    expect(response).toEqual({ status: 409, body: { error: { type: 'CARE_PLAN_EXPIRED', message: '计划已过期，请重新获取浇水建议' } } })
  })
})
