import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：`docs/backend-v2/contracts/user-plant-environment-profile.md`（2026-10-10 用户审定）§1 请求（profile-patch/v2 唯一事实源）与 §5 错误集合。
 * 测试层次：L3 / `unit_real_data`（读取真实 contract-registry、route-registry、OpenAPI 与 Schema 制品）。
 */
const root = findProjectRoot()
const readJson = <T>(relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')) as T

describe('用户植物环境档案合同制品', () => {
  test('contract-registry 登记 v1 且 SHA-256 与正文一致', () => {
    const registry = readJson<{ contracts: Array<{ id: string; version: string; file: string; sha256: string }> }>('docs/backend-v2/contracts/contract-registry.json')
    const entry = registry.contracts.find(contract => contract.id === 'user-plant-environment-profile')
    expect(entry).toMatchObject({ version: 'user-plant-environment-profile/v1', file: 'user-plant-environment-profile.md' })
    expect(entry?.sha256).toBe(createHash('sha256').update(fs.readFileSync(path.join(root, 'docs/backend-v2/contracts/user-plant-environment-profile.md'))).digest('hex'))
  })

  test('route-registry updateUserPlant 错误集合覆盖合同 §5', () => {
    const registry = readJson<{ routes: Array<{ operationId: string; errors: string[] }> }>('docs/backend-v2/api/route-registry.json')
    const route = registry.routes.find(candidate => candidate.operationId === 'updateUserPlant')
    expect([...route!.errors].sort()).toEqual(['IDEMPOTENCY_CONFLICT', 'PAYLOAD_TOO_LARGE', 'PRINCIPAL_INVALID', 'SERVICE_UNAVAILABLE', 'UNSUPPORTED_MEDIA_TYPE', 'USER_PLANT_NOT_FOUND', 'USER_PLANT_VERSION_CONFLICT', 'VALIDATION_FAILED'])
  })

  test('OpenAPI PATCH 请求体为 profile-patch/v2：字段集合与机器事实源一致', () => {
    const openapi = readJson<{ paths: Record<string, Record<string, { requestBody?: unknown }>>; components: { schemas: Record<string, { properties?: Record<string, unknown>; additionalProperties?: boolean; required?: string[] }> } }>('docs/backend-v2/api/openapi.p1.json')
    const source = readJson<{ properties: Record<string, unknown> }>('cloudfunctions-v2/models/user-plant/profile-patch.v2.schema.json')
    expect(openapi.paths['/api/v2/user-plants/{userPlantRef}']!.patch!.requestBody).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateUserPlantRequest' } } } })
    const component = openapi.components.schemas.UpdateUserPlantRequest!
    expect(component).toMatchObject({ additionalProperties: false, required: ['version'] })
    expect(Object.keys(component.properties!).sort()).toEqual(Object.keys(source.properties).sort())
    expect(component.properties!.location).toEqual(source.properties.location)
  })
})
