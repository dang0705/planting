import { createUserPlantServer } from '../../src/user-plant/http/server.js'
import { expect, test } from 'vitest'
import type { AddressInfo } from 'node:net'

/** L1/unit_fake：实际服务组装/分发/请求链；数据库明确替身。
 * Expected来自统一计划缺发布策略失败关闭及已登记PATCH；不证明真实会话、SQL或正式发布策略。 */
test('既有用户植物服务登记PATCH，未接可信写策略时503且不访问数据库', async () => {
  let connections = 0
  const server = createUserPlantServer({
    connectionSource: { getConnection: async () => { connections++; throw new Error('本场景禁止数据库访问') } },
    now: () => 3000, resolveCapabilitySnapshot: async () => { throw new Error('本场景禁止权益查询') },
    writeAudit: () => undefined, recordRollbackFailure: () => undefined
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/user-plants/upl_profile_save001`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'idempotency-key': 'server-test' }, body: JSON.stringify({ version: 1, nickname: '小青' }) })
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: { type: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' } }); expect(connections).toBe(0)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})
