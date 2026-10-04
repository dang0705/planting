import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, expect, test } from 'vitest'

import { createUserPlantServer } from '../../src/user-plant/http/server.js'

let server: Server | undefined

afterEach(async () => {
  if (server === undefined) {
    return
  }
  await new Promise<void>(resolve => server?.close(() => resolve()))
  server = undefined
})

/**
 * Expected：`user-plant.md` 的“创建用户植物”和 route-registry 的 createUserPlant 路由要求
 * POST 仅允许登录主体；缺少 Bearer 必须返回 401，而不是因路由未接入返回 405。
 * 层次：L3 Integration；真实经过 node:http 服务与路由分发，数据库端口为失败即抛的替身。
 * RED 探针只证明无凭证请求的接入行为，不证明创建成功、MySQL 写入或 CloudBase 网关。
 */
test('POST 创建用户植物在无登录凭证时返回 401，且不访问数据库', async () => {
  let connectionRequested = false
  server = createUserPlantServer({
    connectionSource: {
      getConnection: async () => {
        connectionRequested = true
        throw new Error('无凭证请求不得访问数据库')
      }
    },
    now: () => Date.UTC(2026, 8, 27, 0, 0, 0),
    resolveCapabilitySnapshot: async () => {
      throw new Error('无凭证请求不得解析能力快照')
    },
    writeAudit: () => undefined,
    recordRollbackFailure: () => undefined
  })
  await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  const response = await fetch(`http://127.0.0.1:${address.port}/api/v2/user-plants`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  })

  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({
    error: { type: 'PRINCIPAL_INVALID', message: '身份凭证无效或已过期' }
  })
  expect(connectionRequested).toBe(false)
})
