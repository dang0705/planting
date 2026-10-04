import { createHash } from 'node:crypto'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, test } from 'vitest'
import type {
  UserPlantDto,
  UserPlantRef,
  UserPrincipalDto,
  UserRef
} from '../../src/contracts/types.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import { UnifiedUserPrincipalResolveError } from '../../src/identity/domain/resolve-user-principal.js'
import {
  createUpdateProfileRouteHandler,
  updateProfileRoute,
  type UpdateProfileRouteDependencies
} from '../../src/user-plant/http/update-profile-route.js'
import type { MeasuredProfileApplicationInput } from '../../src/user-plant/application/save-measured-profile.js'

/** Expected来源：本轮明确冻结的PATCH协议及UserPlantDto；L3 unit_fake，真实HTTP/请求链/DTO校验，替换身份、归属及事务应用端口。未证明MySQL和平台凭证验真。 */
const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_route_owner_0001' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '2026-10-01T00:00:00Z',
  expiresAt: '2026-10-06T00:00:00Z'
}
const plant: UserPlantDto = {
  user_plant_id: 'upl_route_owned_0001' as UserPlantRef,
  lifecycle: 'active',
  identityStatus: 'unidentified',
  version: 2,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-05T00:00:00Z',
  profile: { nickname: '小青' }
}
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
async function start(overrides: Partial<UpdateProfileRouteDependencies> = {}) {
  const writes: MeasuredProfileApplicationInput[] = [],
    stages: string[] = []
  const dependencies: UpdateProfileRouteDependencies = {
    maxBodyBytes: 1024,
    now: () => 1000,
    writeAudit: () => undefined,
    resolvePrincipal: async () => {
      stages.push('identity')
      return principal
    },
    getUserPlant: async () => {
      stages.push('ownership')
      return { status: 200, body: { data: plant } }
    },
    resolveWritePolicy: async () => {
      stages.push('policy')
      return { profileVersion: 'profile/v1', idempotencyRetentionMs: 5000 }
    },
    saveProfile: async input => {
      writes.push(input)
      return { status: 200, body: { data: plant } }
    },
    ...overrides
  }
  const dispatch = createRouteDispatcher([
    { route: updateProfileRoute, handler: createUpdateProfileRouteHandler(dependencies) }
  ])
  const server = createServer((req, res) => {
    dispatch(req, res).catch(() => undefined)
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/user-plants/upl_route_owned_0001`
  // 使用真实node:http，避免连接池重用掩盖拒绝阶段行为；允许发送重复请求头证明单值约束。
  const send = (
    body = '{"version":1,"nickname":"小青"}',
    headers: Record<string, string | string[]> = {}
  ) =>
    new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer route-valid-token',
            'idempotency-key': 'profile-key-01',
            ...headers
          }
        },
        res => {
          const chunks: Buffer[] = []
          res.on('data', c => chunks.push(c))
          res.on('end', () =>
            resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) })
          )
        }
      )
      req.on('error', reject)
      req.end(body)
    })
  return { send, writes, stages }
}
const sha = (value: string) => createHash('sha256').update(value).digest('hex')

test('完整测量可以单独修改，省略昵称不补默认，业务事实变化改变摘要', async () => {
  const s = await start()
  const measuredPot = {
    actualInnerPotConfirmed: true,
    drainageAvailable: null,
    potTopDiameterCm: 10,
    potBottomDiameterCm: 8,
    potHeightCm: 12
  }
  expect((await s.send(JSON.stringify({ version: 1, measuredPot }))).status).toBe(200)
  expect(s.writes[0]!.command).toEqual({
    userRef: principal.user_id,
    userPlantRef: plant.user_plant_id,
    expectedVersion: 1,
    measuredPot,
    profileVersion: 'profile/v1',
    occurredAtMs: 1000
  })
  await s.send(JSON.stringify({ version: 1, measuredPot: { ...measuredPot, potHeightCm: 13 } }))
  expect(s.writes[1]!.idempotency.requestHash).not.toBe(s.writes[0]!.idempotency.requestHash)
  expect((await s.send('{"version":1,"measuredPot":{"potHeightCm":12}}')).status).toBe(400)
  expect(s.writes).toHaveLength(2)
})

test('策略与时间变化不改变业务摘要，失败应用仅返回脱敏500', async () => {
  let now = 1000
  const s = await start({
    now: () => now,
    resolveWritePolicy: async () => ({
      profileVersion: `profile/${now}`,
      idempotencyRetentionMs: now
    })
  })
  await s.send()
  now = 2000
  await s.send()
  expect(s.writes[0]!.idempotency.requestHash).toBe(s.writes[1]!.idempotency.requestHash)
  expect(s.writes[1]!.command.occurredAtMs).toBe(2000)
  const failed = await start({
    saveProfile: async () => {
      throw new Error('数据库私密原文')
    }
  })
  expect(await failed.send()).toEqual({
    status: 500,
    body: { error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } }
  })
})

test('正常PATCH返回完整公开植物，并以服务端策略和规范化事实构造幂等命令', async () => {
  const s = await start()
  expect(await s.send()).toEqual({ status: 200, body: { data: plant } })
  expect(s.stages).toEqual(['identity', 'ownership', 'policy'])
  expect(s.writes).toEqual([
    {
      command: {
        userRef: principal.user_id,
        userPlantRef: plant.user_plant_id,
        expectedVersion: 1,
        nickname: '小青',
        profileVersion: 'profile/v1',
        occurredAtMs: 1000
      },
      idempotency: {
        principalType: 'user',
        principalScopeHash: sha(principal.user_id),
        httpMethod: 'PATCH',
        normalizedPath: '/api/v2/user-plants/{userPlantRef}',
        operationId: 'updateUserPlant',
        idempotencyKeyHash: sha('profile-key-01'),
        requestHash: sha('{"nickname":"小青","userPlantRef":"upl_route_owned_0001","version":1}'),
        createdAtMs: 1000,
        expiresAtMs: 6000
      }
    }
  ])
  await s.send('{"nickname":"小青","version":1}')
  expect(s.writes[1]!.idempotency.requestHash).toBe(s.writes[0]!.idempotency.requestHash)
})
test('缺令牌或身份拒绝返回401且零写', async () => {
  const s = await start()
  expect((await s.send(undefined, { authorization: '' })).status).toBe(401)
  expect(s.writes).toEqual([])
  expect(s.stages).toEqual([])
  const rejected = await start({
    resolvePrincipal: async () => {
      throw new UnifiedUserPrincipalResolveError('PRINCIPAL_INVALID', '安全中文拒绝')
    }
  })
  expect((await rejected.send()).status).toBe(401)
  expect(rejected.writes).toEqual([])
})
test('跨用户404优先于正文DTO且不查策略不写', async () => {
  const s = await start({
    getUserPlant: async () => ({
      status: 404,
      body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在或不可访问' } }
    })
  })
  expect((await s.send()).status).toBe(404)
  expect((await s.send('bad-json')).status).toBe(404)
  expect(s.writes).toEqual([])
  expect(s.stages).toEqual(['identity', 'identity'])
})
test.each([
  '{}',
  'null',
  '[]',
  '{"version":1}',
  '{"version":1,"nickname":null}',
  '{"version":1,"nickname":"","profileVersion":"forged"}',
  '{"version":1,"nickname":"","unknown":true}',
  'bad-json'
])('非法或伪造策略正文400且零写：%s', async body => {
  const s = await start()
  expect((await s.send(body)).status).toBe(400)
  expect(s.writes).toEqual([])
  expect(s.stages).toEqual(['identity', 'ownership'])
})
test.each(['', 'short', 'a'.repeat(129), ['profile-key-01', 'profile-key-02']])(
  '幂等键必须单值ASCII8至128',
  async key => {
    const s = await start()
    expect((await s.send(undefined, { 'idempotency-key': key })).status).toBe(400)
    expect(s.writes).toEqual([])
  }
)
test('媒体与实际字节限制先于认证；未发布大小限制失败关闭', async () => {
  const s = await start({ maxBodyBytes: 32 })
  expect(
    (await s.send('x'.repeat(100), { 'content-type': 'text/plain', authorization: '' })).status
  ).toBe(415)
  expect((await s.send('x'.repeat(100))).status).toBe(413)
  expect(s.stages).toEqual([])
  const absent = await start({ maxBodyBytes: null })
  expect((await absent.send()).status).toBe(503)
  expect(absent.stages).toEqual([])
  expect(absent.writes).toEqual([])
})
test.each([
  null,
  { profileVersion: '', idempotencyRetentionMs: 1 },
  { profileVersion: 'profile/v1', idempotencyRetentionMs: 0 },
  { profileVersion: 'profile/v1', idempotencyRetentionMs: NaN }
])('未发布或非法策略503且零写', async policy => {
  const s = await start({ resolveWritePolicy: async () => policy })
  expect((await s.send()).status).toBe(503)
  expect(s.writes).toEqual([])
})
test.each([
  { status: 200, body: { data: { ...plant, internalId: 'secret' } } },
  { status: 201, body: { data: plant } },
  {
    status: 200,
    body: { data: { userPlantRef: plant.user_plant_id, version: 2, nickname: '小青' } }
  },
  {
    status: 409,
    body: { error: { type: 'IDEMPOTENCY_CONFLICT', message: '冲突', traceId: 'secret' } }
  },
  { status: 400, body: { error: { type: 'VALIDATION_FAILED', message: '无权公开的用例错误' } } }
])('受限或无登记应用响应泛化500', async result => {
  const s = await start({ saveProfile: async () => result })
  expect(await s.send()).toEqual({
    status: 500,
    body: { error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } }
  })
})
test.each([
  [404, 'USER_PLANT_NOT_FOUND'],
  [409, 'USER_PLANT_VERSION_CONFLICT'],
  [409, 'IDEMPOTENCY_CONFLICT'],
  [503, 'SERVICE_UNAVAILABLE']
] as const)('允许应用错误通过严格响应：%s %s', async (status, type) => {
  const s = await start({
    saveProfile: async () => ({ status, body: { error: { type, message: '安全中文说明' } } })
  })
  expect(await s.send()).toEqual({ status, body: { error: { type, message: '安全中文说明' } } })
})
