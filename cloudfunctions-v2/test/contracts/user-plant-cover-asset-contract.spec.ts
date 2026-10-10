import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：docs/backend-v2/contracts/user-plant-cover-asset.md（2026-10-10 用户审定与裁决）；配置目录 storage.read_url.ttl_seconds 改为平台默认、
 * Provider cloudbase_storage 改为云存储 HTTP API + credentialRef 环境变量名；安全规则文件只写不下发。
 * 测试层次：L3 / unit_real_data（真实制品）。
 */
const root = findProjectRoot()
const readJson = <T>(relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')) as T
const catalog = readJson<{ variables: Array<{ id: string; currentValue: unknown; status: string }>; providerProfiles: Array<{ providerCode: string; status: string; endpointProfile: string; credentialRef: string }> }>('docs/backend-v2/architecture/configuration-variable-catalog.json')

describe('封面资产合同制品', () => {
  test('contract-registry SHA-256 一致；route-registry 错误集合与合同 §5 一致', () => {
    const registry = readJson<{ contracts: Array<{ id: string; sha256: string }> }>('docs/backend-v2/contracts/contract-registry.json')
    expect(registry.contracts.find(contract => contract.id === 'user-plant-cover-asset')?.sha256)
      .toBe(createHash('sha256').update(fs.readFileSync(path.join(root, 'docs/backend-v2/contracts/user-plant-cover-asset.md'))).digest('hex'))
    const routes = readJson<{ routes: Array<{ operationId: string; errors: string[] }> }>('docs/backend-v2/api/route-registry.json').routes
    expect([...routes.find(route => route.operationId === 'bindUserPlantAsset')!.errors].sort()).toEqual(
      ['IDEMPOTENCY_CONFLICT', 'PAYLOAD_TOO_LARGE', 'PRINCIPAL_INVALID', 'SERVICE_UNAVAILABLE', 'UNSUPPORTED_MEDIA_TYPE', 'USER_PLANT_NOT_FOUND', 'VALIDATION_FAILED'])
  })

  test('OpenAPI 请求体严格三字段；成功体 urlExpiresAt 可为 null', () => {
    const openapi = readJson<{ paths: Record<string, Record<string, { requestBody?: unknown; responses?: Record<string, unknown> }>>; components: { schemas: Record<string, unknown> } }>('docs/backend-v2/api/openapi.p1.json')
    const operation = openapi.paths['/api/v2/user-plants/{userPlantRef}/assets']!.post!
    expect(operation.requestBody).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/BindUserPlantAssetRequest' } } } })
    expect(openapi.components.schemas.BindUserPlantAssetRequest).toMatchObject({ additionalProperties: false, required: ['purpose', 'fileId', 'contentSha256'] })
    expect(operation.responses!['200']).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/UserPlantAssetSuccess' } } } })
    expect(JSON.stringify(openapi.components.schemas.UserPlantAssetSuccess)).toContain('"urlExpiresAt":{"type":["string","null"]')
  })

  test('配置目录：链接有效期以平台默认为准；云存储 Provider 走 HTTP API 且只引用环境变量名', () => {
    expect(catalog.variables.find(variable => variable.id === 'storage.read_url.ttl_seconds')).toMatchObject({ status: 'confirmed', currentValue: 'platform_default' })
    expect(catalog.providerProfiles.find(profile => profile.providerCode === 'cloudbase_storage')).toMatchObject({
      status: 'confirmed', endpointProfile: 'cloudbase_storage_http_api_v1', credentialRef: 'env:CLOUDBASE_STORAGE_API_KEY'
    })
  })

  // Expected 来源：用户 2026-10-10 裁定「保持现有规则，不下发新规则」——存储桶沿用「仅创建者和管理员可读写」，
  // 目录归属由服务端登记校验；自定义规则草案不采用、不下发。
  test('存储权限：沿用「仅创建者和管理员可读写」，自定义规则草案标记为未采用、不下发', () => {
    const contract = fs.readFileSync(path.join(root, 'docs/backend-v2/contracts/user-plant-cover-asset.md'), 'utf8')
    expect(contract).toContain('仅创建者和管理员可读写')
    expect(contract).not.toContain('自定义安全规则」下发')
    const readme = fs.readFileSync(path.join(root, 'docs/backend-v2/storage/README.md'), 'utf8')
    expect(readme).toContain('未采用')
  })
})
