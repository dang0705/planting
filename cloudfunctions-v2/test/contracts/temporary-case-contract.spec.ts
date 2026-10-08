import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { createPublicContractValidators } from '../../src/contracts/index.js'
import { findProjectRoot } from '../support/project-root.js'

/** 路由登记表中本测试核验的最小字段集合。 */
type RegistryRoute = {
  /** 路由 HTTP 方法。 */
  method: string
  /** 路由路径模板。 */
  path: string
  /** 稳定操作标识。 */
  operationId: string
  /** 业务域所有者。 */
  owner: string
  /** 实施阶段。 */
  phase: string
  /** 安全级别。 */
  security: string
  /** 请求合同名。 */
  requestContract: string
  /** 响应合同名。 */
  responseContract: string
  /** 幂等方式。 */
  idempotency: string
  /** 公开错误集合。 */
  errors: string[]
}

/**
 * unit_real_data（L1）。Expected：models/user-plant/temporary-case-contract.md §1/§3 与任务登记要求；
 * 真实 AJV 校验器、真实 route-registry.json 与生成后的 openapi.p1.json。不覆盖运行时与数据库。
 */
describe('临时植物案例公开合同', () => {
  const validators = createPublicContractValidators()
  const root = findProjectRoot()

  test('C1 请求只接受严格空对象', () => {
    expect(validators.createTemporaryCaseRequest({})).toBe(true)
    for (const invalid of [{ ownerKind: 'guest' }, { user_id: 'usr_x' }, { caseRef: 'gpc_abcdefgh' }, [], null, 'x']) {
      expect(validators.createTemporaryCaseRequest(invalid)).toBe(false)
    }
  })

  test('C1 响应：前缀与 ownerKind 必须一致，时间必须带 Z', () => {
    expect(validators.temporaryCaseResponse({ caseRef: 'gpc_AbCd1234_-xyz', ownerKind: 'guest', expiresAt: '2026-10-10T04:00:00.000Z' })).toBe(true)
    expect(validators.temporaryCaseResponse({ caseRef: 'epc_AbCd1234_-xyz', ownerKind: 'authenticated', expiresAt: '2026-10-16T04:00:00.000Z' })).toBe(true)
    for (const invalid of [
      { caseRef: 'epc_AbCd1234_-xyz', ownerKind: 'guest', expiresAt: '2026-10-10T04:00:00.000Z' },
      { caseRef: 'gpc_AbCd1234_-xyz', ownerKind: 'authenticated', expiresAt: '2026-10-10T04:00:00.000Z' },
      { caseRef: 'gpc_short', ownerKind: 'guest', expiresAt: '2026-10-10T04:00:00.000Z' },
      { caseRef: `gpc_${'a'.repeat(61)}`, ownerKind: 'guest', expiresAt: '2026-10-10T04:00:00.000Z' },
      { caseRef: 'gpc_AbCd1234_-xyz', ownerKind: 'guest', expiresAt: '2026-10-10T04:00:00+08:00' },
      { caseRef: 'gpc_AbCd1234_-xyz', ownerKind: 'guest', expiresAt: '2026-10-10T04:00:00.000Z', user_id: 'usr_x' },
      { caseRef: 'gpc_AbCd1234_-xyz', ownerKind: 'guest' }
    ]) {
      expect(validators.temporaryCaseResponse(invalid)).toBe(false)
    }
  })

  test('C1 公开错误校验器接受 TEMPORARY_CASE_LIMIT_REACHED', () => {
    expect(validators.errorResponse({ error: { type: 'TEMPORARY_CASE_LIMIT_REACHED', message: '临时案例数量已达上限' } })).toBe(true)
  })

  test('C2 route-registry 登记与 OpenAPI 同步', () => {
    const apiDirectory = path.join(root, 'docs/backend-v2/api')
    const registry = JSON.parse(fs.readFileSync(path.join(apiDirectory, 'route-registry.json'), 'utf8')) as { routes: RegistryRoute[] }
    const route = registry.routes.find(item => item.operationId === 'createTemporaryCase')
    expect(route).toEqual({
      method: 'POST',
      path: '/api/v2/user-plants/temporary-cases',
      operationId: 'createTemporaryCase',
      owner: 'user-plant',
      phase: 'P2',
      security: 'guest_or_authenticated',
      requestContract: 'CreateTemporaryCaseRequest',
      responseContract: 'TemporaryCaseResponse',
      idempotency: 'required_header',
      errors: ['VALIDATION_FAILED', 'PRINCIPAL_INVALID', 'TEMPORARY_CASE_LIMIT_REACHED', 'IDEMPOTENCY_CONFLICT', 'SERVICE_UNAVAILABLE']
    })
    const openapi = JSON.parse(fs.readFileSync(path.join(apiDirectory, 'openapi.p1.json'), 'utf8')) as {
      paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: { $ref?: string } }> }; responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }>; parameters: Array<{ $ref?: string }>; security?: unknown }>>
      components: { schemas: Record<string, unknown> & { ErrorResponse: { properties: { error: { properties: { type: { enum: string[] } } } } } } }
    }
    const operation = openapi.paths['/api/v2/user-plants/temporary-cases']?.post
    expect(operation).toBeDefined()
    expect(operation?.requestBody?.content['application/json']?.schema.$ref).toBe('#/components/schemas/CreateTemporaryCaseRequest')
    expect(operation?.responses['200']?.content?.['application/json']?.schema.$ref).toBe('#/components/schemas/TemporaryCaseSuccess')
    expect(operation?.parameters).toContainEqual({ $ref: '#/components/parameters/IdempotencyKey' })
    expect(operation?.security).toEqual([{ guestBearer: [] }, { userBearer: [] }])
    expect(openapi.components.schemas.CreateTemporaryCaseRequest).toMatchObject({ type: 'object', additionalProperties: false, maxProperties: 0 })
    expect(openapi.components.schemas.ErrorResponse.properties.error.properties.type.enum).toContain('TEMPORARY_CASE_LIMIT_REACHED')
  })
})
