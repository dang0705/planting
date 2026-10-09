import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data（L1）。Expected：route-registry 既有 claimGuestPlantCase（authenticated、required_header）与
 * guest-session-claim.md 2026-10-09 修订（请求体 guestToken、无 body idempotencyKey、公开结果白名单）；
 * 错误集合按 http-api 错误码表与主代理 2026-10-09 裁决（处理中 503）补齐。
 */
describe('claimGuestPlantCase 路由登记与 OpenAPI', () => {
  const apiDirectory = path.join(findProjectRoot(), 'docs/backend-v2/api')

  test('route-registry 登记与错误集合', () => {
    const registry = JSON.parse(fs.readFileSync(path.join(apiDirectory, 'route-registry.json'), 'utf8')) as { routes: Array<Record<string, unknown>> }
    const route = registry.routes.find(item => item.operationId === 'claimGuestPlantCase')
    expect(route).toMatchObject({ method: 'POST', path: '/api/v2/user-plants/claims', owner: 'user-plant', security: 'authenticated', idempotency: 'required_header', requestContract: 'ClaimGuestPlantCaseRequest', responseContract: 'ClaimGuestPlantCaseResponse' })
    expect([...(route?.errors as string[])].sort()).toEqual([
      'CAPABILITY_DENIED', 'CAPABILITY_SNAPSHOT_EXPIRED', 'GUEST_SESSION_EXPIRED', 'GUEST_SESSION_NOT_CLAIMABLE', 'IDEMPOTENCY_CONFLICT',
      'PAYLOAD_TOO_LARGE', 'PRINCIPAL_INVALID', 'SERVICE_UNAVAILABLE', 'UNSUPPORTED_MEDIA_TYPE', 'VALIDATION_FAILED'
    ])
  })

  test('OpenAPI 请求组件含 guestToken、无 idempotencyKey；成功组件为白名单四字段', () => {
    const openapi = JSON.parse(fs.readFileSync(path.join(apiDirectory, 'openapi.p1.json'), 'utf8')) as {
      paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: { $ref?: string } }> }; responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }> }>>
      components: { schemas: Record<string, { required?: string[]; properties?: Record<string, unknown>; additionalProperties?: boolean }> }
    }
    const operation = openapi.paths['/api/v2/user-plants/claims']?.post
    expect(operation?.requestBody?.content['application/json']?.schema.$ref).toBe('#/components/schemas/ClaimGuestPlantCaseRequest')
    expect(operation?.responses['200']?.content?.['application/json']?.schema.$ref).toBe('#/components/schemas/ClaimGuestPlantCaseSuccess')
    const request = openapi.components.schemas.ClaimGuestPlantCaseRequest
    expect(request).toMatchObject({ additionalProperties: false })
    expect([...(request?.required ?? [])].sort()).toEqual(['guestPlantCaseRef', 'guestSessionRef', 'guestToken', 'target'])
    expect(Object.keys(request?.properties ?? {})).not.toContain('idempotencyKey')
    const data = openapi.components.schemas.ClaimGuestPlantCaseData
    expect([...(data?.required ?? [])].sort()).toEqual(['claimRef', 'claimedObjectKinds', 'replayed', 'userPlantId'])
    expect(data).toMatchObject({ additionalProperties: false })
  })
})
