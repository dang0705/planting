import { expect, test } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createUserPlantServer } from '../../src/user-plant/http/server.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/** L3/unit_fake；真实服务器分发/限制/认证，发布端口与数据库替换。Expected为冻结绑定HTTP合同，不证明平台、SQL或发布。 */
test.each(['absent', 'missing', 'error', 'valid'] as const)('绑定服务器登记及独立发布限制：%s', async kind => {
  let reads = 0, connections = 0
  const readBindingHttpSnapshot = async () => {
    reads++; if (kind === 'error') { throw new Error('restricted policy detail') }
    return kind === 'missing' ? null : { maxBodyBytes: 1048576, release: { releaseRef: 'bpr_http_fixture001', releaseVersion: '2026-10-05.1', contentSha256: 'a'.repeat(64) } }
  }
  const server = createUserPlantServer({ ...fixturePolicyPorts(),
    connectionSource: { getConnection: async () => { connections++; throw new Error('该场景不访问数据库') } },
    now: () => 2000, resolveCapabilitySnapshot: async () => { throw new Error('绑定不读取创建额度') },
    ...(kind === 'absent' ? {} : { readBindingHttpSnapshot }),
    writeAudit: () => undefined, recordRollbackFailure: () => undefined
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/user-plants/ephemeral-cases/epc_binding_case001/bindings`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'binding-key-001' }, body: '{"target":{"type":"existing_user_plant","user_plant_id":"upl_binding_target001"}}' })
    expect(response.status).toBe(kind === 'valid' ? 401 : 503)
    expect(await response.json()).toEqual({ error: { type: kind === 'valid' ? 'PRINCIPAL_INVALID' : 'SERVICE_UNAVAILABLE', message: kind === 'valid' ? '身份凭证无效或已过期' : '服务暂时不可用' } })
    expect(reads).toBe(kind === 'absent' ? 0 : 1); expect(connections).toBe(0)
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())) }
})
