import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：`docs/backend-v2/contracts/user-plant-identity-confirmation.md`（2026-10-10 用户审定冻结）§2 请求、§4 错误集合。
 * 测试层次：L3 / `unit_real_data`（读取真实 contract-registry、route-registry 与生成后的 OpenAPI 制品，不访问网络）。
 * 明确未覆盖：运行时行为（见 test/user-plant/confirm-user-plant-identity-route.spec.ts 与对应 mysql e2e）。
 */
const root = findProjectRoot()
const readJson = <T>(relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')) as T

describe('用户植物身份确认合同制品', () => {
  test('contract-registry 登记 v1 且 SHA-256 与正文一致', () => {
    const registry = readJson<{ contracts: Array<{ id: string; version: string; file: string; owner: string; sha256: string }> }>('docs/backend-v2/contracts/contract-registry.json')
    const entry = registry.contracts.find(contract => contract.id === 'user-plant-identity-confirmation')
    const content = fs.readFileSync(path.join(root, 'docs/backend-v2/contracts/user-plant-identity-confirmation.md'))
    expect(entry).toMatchObject({ version: 'user-plant-identity-confirmation/v1', file: 'user-plant-identity-confirmation.md', owner: 'user-plant' })
    expect(entry?.sha256).toBe(createHash('sha256').update(content).digest('hex'))
  })

  test('route-registry 错误集合与合同 §4 完全一致', () => {
    const registry = readJson<{ routes: Array<{ operationId: string; errors: string[]; idempotency: string; requestContract: string }> }>('docs/backend-v2/api/route-registry.json')
    const route = registry.routes.find(candidate => candidate.operationId === 'confirmUserPlantIdentity')
    expect(route).toMatchObject({ idempotency: 'required_header_and_version', requestContract: 'ConfirmUserPlantIdentityRequest' })
    expect([...route!.errors].sort()).toEqual([
      'IDEMPOTENCY_CONFLICT', 'NOT_FOUND', 'PAYLOAD_TOO_LARGE', 'PRINCIPAL_INVALID', 'SERVICE_UNAVAILABLE', 'UNSUPPORTED_MEDIA_TYPE',
      'USER_PLANT_ARCHIVED', 'USER_PLANT_NOT_FOUND', 'USER_PLANT_VERSION_CONFLICT', 'VALIDATION_FAILED'
    ])
  })

  test('OpenAPI 请求体严格只有 expectedVersion、plantIdentityRef、source', () => {
    const openapi = readJson<{ paths: Record<string, Record<string, { requestBody?: unknown }>>; components: { schemas: Record<string, unknown> } }>('docs/backend-v2/api/openapi.p1.json')
    expect(openapi.paths['/api/v2/user-plants/{userPlantRef}/identity-confirmations']!.post!.requestBody).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ConfirmUserPlantIdentityRequest' } } }
    })
    expect(openapi.components.schemas.ConfirmUserPlantIdentityRequest).toEqual({
      type: 'object', additionalProperties: false, required: ['expectedVersion', 'plantIdentityRef', 'source'],
      properties: {
        expectedVersion: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
        plantIdentityRef: { type: 'string', pattern: '^pid_[A-Za-z0-9_-]{8,60}$' },
        source: { type: 'object', additionalProperties: false, required: ['type'], properties: { type: { const: 'user_search' } } }
      }
    })
  })
})
