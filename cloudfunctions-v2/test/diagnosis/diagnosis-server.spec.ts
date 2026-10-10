import type { AddressInfo } from 'node:net'
import { expect, test, vi } from 'vitest'
import { createDiagnosisServer } from '../../src/diagnosis/http/server.js'
import type { UserPrincipalDto } from '../../src/contracts/types.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'
/** unit_fake/L3：Expected来自已冻结创建/作答合同及运行接线合同；真实HTTP，身份与SQL边界为替身。
 * 不证明真实MySQL、平台验真、正式Provider或部署。 */
test('健康与冻结路由可用；未准入虫害拒绝且不连接SQL', async () => {
  const getConnection = vi.fn(async () => {
    throw new Error('不得连接SQL')
  })
  const server = createDiagnosisServer({ ...fixturePolicyPorts(),
    connectionSource: { getConnection },
    resolvePrincipal: async () =>
      ({ principalType: 'user', user_id: 'usr_owner123' }) as UserPrincipalDto,
    now: () => 2500,
    writeAudit: () => undefined,
    recordRollbackFailure: () => undefined
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    expect(await (await fetch(base + '/health')).json()).toEqual({ ok: true })
    expect((await fetch(base + '/unknown')).status).toBe(404)
    const response = await fetch(base + '/api/v2/diagnosis/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer owner-token',
        'idempotency-key': 'server-pest-unavailable'
      },
      body: JSON.stringify({
        userPlantRef: 'upl_owner123',
        mode: 'specific_pest_visual',
        assetRef: 'upa_owner123'
      })
    })
    expect(response.status).toBe(503)
    expect(getConnection).not.toHaveBeenCalled()
    expect(JSON.stringify(await response.json())).not.toMatch(
      /owner-token|不得连接SQL|model|prompt/
    )
  } finally {
    await new Promise<void>((r, j) => server.close(e => (e ? j(e) : r())))
  }
})

/**
 * Expected 来源：ClickUp z8v0kmvhnd「路由接线」与 diagnosis-visual-api.md §2（五个接口挂在 diagnosis 函数下，
 * 网关前缀 /api/v2/diagnosis/visual）；未提供视觉诊断装配时这些路径未登记（404），提供后进入固定请求链（无凭证 401）。
 * 测试层次：unit_fake（真实 HTTP，SQL 边界为替身且不得被连接）。
 */
test('视觉诊断路由按装配接线：未装配 404，装配后无凭证 401 且不连接 SQL', async () => {
  const getConnection = vi.fn(async () => {
    throw new Error('不得连接SQL')
  })
  const base = {
    ...fixturePolicyPorts(),
    connectionSource: { getConnection },
    resolvePrincipal: async () => ({ principalType: 'user', user_id: 'usr_owner123' }) as UserPrincipalDto,
    now: () => 2500,
    writeAudit: () => undefined,
    recordRollbackFailure: () => undefined
  }
  const visual = {
    readGenerationPolicy: async () => null,
    readAssetRules: async () => null,
    readListRules: async () => null,
    readCapabilitySnapshot: async () => {
      throw new Error('不应读取')
    },
    readPromptRelease: async () => null,
    readReservationTtlSeconds: async () => null,
    readContextSummary: async () => null,
    storage: null,
    uploader: null,
    normalizer: { normalize: async () => { throw new Error('不应压缩') } },
    createModelClient: null,
    onProcessingError: () => undefined
  }
  for (const [server, expected] of [
    [createDiagnosisServer(base), 404],
    [createDiagnosisServer({ ...base, visual }), 401]
  ] as const) {
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/diagnosis/visual/sessions/vds_fixture00000001`
      expect((await fetch(url)).status).toBe(expected)
      expect(getConnection).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((r, j) => server.close(e => (e ? j(e) : r())))
    }
  }
})
