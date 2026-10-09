import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { createPublicContractValidators } from '../../src/contracts/index.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data（L1）。Expected：watering-advice-http-contract.md「响应 CareCapabilityResponse」与
 * watering-advice-wiring-plan.md 裁决 2；真实 AJV、route-registry.json 与生成的 openapi.p1.json。
 */
const result = {
  capabilityType: 'watering', contractVersion: 'care-capability-result/v1', status: 'ready', confidence: 'low',
  evidenceSummary: ['依据通用文献参数估算'], recommendedActions: ['当前盆土已达到目标干燥状态，可以考虑浇水。'],
  generatedAt: '2026-10-09T04:00:00.000Z', validUntil: null, detailsSchemaVersion: 'watering-assessment/v1',
  details: {
    action: 'water_allowed', soilState: 'target_dry', soilScope: 'root_zone', dryingWindowState: null,
    checkWindow: { purpose: 'soil_check', earliestAt: null, latestAt: null, coverageEndAt: '2026-10-09T04:00:00.000Z', timezone: null, earliestDate: null, latestDate: null },
    amountMl: { min: 40, max: 300 }, netDeficitMl: { min: 31.9, max: 241.6 }, missingEvidence: []
  }
}

describe('CareCapabilityResponse 公开合同', () => {
  const validators = createPublicContractValidators()

  test('C1 合法：cres_ 引用 + care-capability-result/v1 外壳', () => {
    expect(validators.careCapabilityResponse({ resultRef: 'cres_AbCd1234efgh', result })).toBe(true)
    expect(validators.careCapabilityResponse({ resultRef: 'cres_AbCd1234efgh', result: { ...result, status: 'temporarily_unavailable', details: { ...result.details, action: 'temporarily_unavailable', checkWindow: null, amountMl: null, netDeficitMl: null } } })).toBe(true)
  })

  test.each([
    ['引用前缀错误', { resultRef: 'tcr_AbCd1234efgh', result }],
    ['外层多字段', { resultRef: 'cres_AbCd1234efgh', result, inputManifest: {} }],
    ['结果多出策略版本', { resultRef: 'cres_AbCd1234efgh', result: { ...result, policyVersion: 'care-watering-mvp/v1.0.0' } }],
    ['详情多出摘要', { resultRef: 'cres_AbCd1234efgh', result: { ...result, details: { ...result.details, contentSha256: 'a'.repeat(64) } } }],
    ['未知状态', { resultRef: 'cres_AbCd1234efgh', result: { ...result, status: 'done' } }],
    ['未知行动', { resultRef: 'cres_AbCd1234efgh', result: { ...result, details: { ...result.details, action: 'water_now' } } }],
    ['能力类型错误', { resultRef: 'cres_AbCd1234efgh', result: { ...result, capabilityType: 'fertilizing' } }]
  ])('C1 拒绝：%s', (_name, value) => {
    expect(validators.careCapabilityResponse(value)).toBe(false)
  })

  test('C2 route-registry 与 OpenAPI', () => {
    const apiDirectory = path.join(findProjectRoot(), 'docs/backend-v2/api')
    const registry = JSON.parse(fs.readFileSync(path.join(apiDirectory, 'route-registry.json'), 'utf8')) as { routes: Array<Record<string, unknown>> }
    const route = registry.routes.find(item => item.operationId === 'createWateringAdvice')
    expect(route).toMatchObject({
      method: 'POST', path: '/api/v2/care/watering-advice', owner: 'care', security: 'guest_or_authenticated',
      requestContract: 'WateringAdviceRequest', responseContract: 'CareCapabilityResponse', idempotency: 'required_header'
    })
    // long-term-care-contract.md §2（2026-10-09 冻结）：长期植物目标追加 USER_PLANT_NOT_FOUND、USER_PLANT_ARCHIVED。
    expect([...(route?.errors as string[])].sort()).toEqual([
      'IDEMPOTENCY_CONFLICT', 'NOT_FOUND', 'PAYLOAD_TOO_LARGE', 'PRINCIPAL_INVALID', 'SERVICE_UNAVAILABLE', 'UNSUPPORTED_MEDIA_TYPE', 'USER_PLANT_ARCHIVED', 'USER_PLANT_NOT_FOUND', 'VALIDATION_FAILED'
    ])
    const openapi = JSON.parse(fs.readFileSync(path.join(apiDirectory, 'openapi.p1.json'), 'utf8')) as {
      paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: { $ref?: string } }> }; responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }> }>>
    }
    const operation = openapi.paths['/api/v2/care/watering-advice']?.post
    expect(operation?.requestBody?.content['application/json']?.schema.$ref).toBe('#/components/schemas/WateringAdviceRequest')
    expect(operation?.responses['200']?.content?.['application/json']?.schema.$ref).toBe('#/components/schemas/CareCapabilitySuccess')
  })
})
