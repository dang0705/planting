import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { createPublicContractValidators } from '../../src/contracts/index.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data（L1）。Expected：models/care/long-term-care-contract.md（2026-10-09 冻结）§0–§9、主代理裁决 T3（三个新错误类型）。
 * 真实 AJV 校验器、真实 route-registry.json 与生成的 openapi.p1.json。
 */
const apiDirectory = path.join(findProjectRoot(), 'docs/backend-v2/api')
const registry = () => JSON.parse(fs.readFileSync(path.join(apiDirectory, 'route-registry.json'), 'utf8')) as { routes: Array<Record<string, unknown>> }
const openapi = () => JSON.parse(fs.readFileSync(path.join(apiDirectory, 'openapi.p1.json'), 'utf8')) as {
  paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: { $ref?: string } }> }; responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }> }>>
  components: { schemas: Record<string, unknown> & { ErrorResponse: { properties: { error: { properties: { type: { enum: string[] } } } } } } }
}
const route = (operationId: string) => registry().routes.find(item => item.operationId === operationId)
const errors = (operationId: string) => [...(route(operationId)?.errors as string[])].sort()
const common = ['IDEMPOTENCY_CONFLICT', 'PAYLOAD_TOO_LARGE', 'PRINCIPAL_INVALID', 'SERVICE_UNAVAILABLE', 'UNSUPPORTED_MEDIA_TYPE', 'USER_PLANT_ARCHIVED', 'USER_PLANT_NOT_FOUND', 'VALIDATION_FAILED']
const calendar = { title: '检查绿萝盆土', startAt: '2026-10-10T04:00:00.000Z', endAt: '2026-10-10T04:30:00.000Z', notes: '用手指插入土中 3～5 厘米检查干湿，再决定是否浇水。' }

describe('长期养护路由登记', () => {
  test('品种绑定 PUT 新登记（user-plant、authenticated、required_header）', () => {
    expect(route('putUserPlantCatalogBinding')).toMatchObject({ method: 'PUT', path: '/api/v2/user-plants/{userPlantRef}/catalog-binding', owner: 'user-plant', security: 'authenticated', idempotency: 'required_header', requestContract: 'PutCatalogBindingRequest', responseContract: 'CatalogBindingResponse' })
    expect(errors('putUserPlantCatalogBinding')).toEqual([...common, 'NOT_FOUND'].sort())
  })
  test('写接口错误集合', () => {
    expect(errors('createCareFact')).toEqual(common)
    expect(errors('confirmCareProposal')).toEqual([...common, 'CARE_PROPOSAL_NOT_CONFIRMABLE'].sort())
    expect(errors('completeCarePlan')).toEqual([...common, 'CARE_PLAN_VERSION_CONFLICT'].sort())
    expect(errors('createWateringAdvice')).toEqual([...common, 'NOT_FOUND'].sort())
  })
  test('网关前缀（用户 2026-10-09 裁决）：care 路由全部在 /api/v2/care 下；五个长期接口新路径', () => {
    for (const item of registry().routes.filter(r => r.owner === 'care')) { expect(String(item.path)).toMatch(/^\/api\/v2\/care\//u) }
    const base = '/api/v2/care/user-plants/{userPlantRef}'
    expect(Object.fromEntries(['getUserPlantCareSummary', 'createCareFact', 'listCarePlans', 'confirmCareProposal', 'completeCarePlan'].map(id => [id, `${route(id)?.method} ${route(id)?.path}`]))).toEqual({
      getUserPlantCareSummary: `GET ${base}/summary`, createCareFact: `POST ${base}/facts`, listCarePlans: `GET ${base}/plans`,
      confirmCareProposal: `POST ${base}/proposals/{proposalRef}/confirmations`, completeCarePlan: `POST ${base}/plans/{planRef}/completions`
    })
  })
  test('读接口错误集合', () => {
    for (const operationId of ['getUserPlantCareSummary', 'listCarePlans']) {
      expect(errors(operationId)).toEqual(['PRINCIPAL_INVALID', 'SERVICE_UNAVAILABLE', 'USER_PLANT_NOT_FOUND', 'VALIDATION_FAILED'])
    }
  })
  test('OpenAPI：三个新错误进入枚举；各写接口有请求组件；成功组件引用', () => {
    const doc = openapi()
    expect(doc.components.schemas.ErrorResponse.properties.error.properties.type.enum).toEqual(expect.arrayContaining(['USER_PLANT_ARCHIVED', 'CARE_PROPOSAL_NOT_CONFIRMABLE', 'CARE_PLAN_VERSION_CONFLICT']))
    const requestRef = (p: string, method: string) => doc.paths[p]?.[method]?.requestBody?.content['application/json']?.schema.$ref
    const successRef = (p: string, method: string) => doc.paths[p]?.[method]?.responses['200']?.content?.['application/json']?.schema.$ref
    expect(requestRef('/api/v2/user-plants/{userPlantRef}/catalog-binding', 'put')).toBe('#/components/schemas/PutCatalogBindingRequest')
    expect(requestRef('/api/v2/care/user-plants/{userPlantRef}/facts', 'post')).toBe('#/components/schemas/CreateCareFactRequest')
    expect(requestRef('/api/v2/care/user-plants/{userPlantRef}/proposals/{proposalRef}/confirmations', 'post')).toBe('#/components/schemas/ConfirmCareProposalRequest')
    expect(requestRef('/api/v2/care/user-plants/{userPlantRef}/plans/{planRef}/completions', 'post')).toBe('#/components/schemas/CompleteCarePlanRequest')
    expect(successRef('/api/v2/care/user-plants/{userPlantRef}/summary', 'get')).toBe('#/components/schemas/CareSummarySuccess')
    expect(successRef('/api/v2/care/user-plants/{userPlantRef}/plans', 'get')).toBe('#/components/schemas/CarePlanListSuccess')
  })
})

describe('长期养护 DTO 校验器', () => {
  const v = createPublicContractValidators()
  test('三个新错误类型可公开', () => {
    for (const type of ['USER_PLANT_ARCHIVED', 'CARE_PROPOSAL_NOT_CONFIRMABLE', 'CARE_PLAN_VERSION_CONFLICT']) {
      expect(v.errorResponse({ error: { type, message: '固定消息' } })).toBe(true)
    }
  })
  test('品种绑定请求：1～512 字符，严格字段', () => {
    expect(v.putCatalogBindingRequest({ catalogTaxonRef: 'https://tropicals.cn/species/epipremnum-aureum' })).toBe(true)
    for (const bad of [{}, { catalogTaxonRef: '' }, { catalogTaxonRef: 'x'.repeat(513) }, { catalogTaxonRef: 'a', userId: 'x' }]) { expect(v.putCatalogBindingRequest(bad)).toBe(false) }
  })
  test('记录浇水请求：只 watering；amountMl 0～10000 整数或 null；时间带 Z', () => {
    expect(v.createCareFactRequest({ factType: 'watering', occurredAt: '2026-10-09T04:00:00.000Z' })).toBe(true)
    expect(v.createCareFactRequest({ factType: 'watering', occurredAt: '2026-10-09T04:00:00Z', amountMl: null })).toBe(true)
    expect(v.createCareFactRequest({ factType: 'watering', occurredAt: '2026-10-09T04:00:00Z', amountMl: 10000 })).toBe(true)
    for (const bad of [{ factType: 'fertilizing', occurredAt: '2026-10-09T04:00:00Z' }, { factType: 'watering', occurredAt: '2026-10-09 04:00' },
      { factType: 'watering', occurredAt: '2026-10-09T04:00:00Z', amountMl: 10001 }, { factType: 'watering', occurredAt: '2026-10-09T04:00:00Z', amountMl: 1.5 }]) {
      expect(v.createCareFactRequest(bad)).toBe(false)
    }
  })
  test('确认建议请求：严格三选一', () => {
    expect(v.confirmCareProposalRequest({ decision: 'schedule_check' })).toBe(true)
    expect(v.confirmCareProposalRequest({ decision: 'schedule_check', scheduledAt: '2026-10-10T04:00:00Z' })).toBe(true)
    expect(v.confirmCareProposalRequest({ decision: 'record_watering', occurredAt: '2026-10-09T04:00:00Z', amountMl: 200 })).toBe(true)
    expect(v.confirmCareProposalRequest({ decision: 'dismiss' })).toBe(true)
    for (const bad of [{ decision: 'record_watering' }, { decision: 'dismiss', scheduledAt: '2026-10-10T04:00:00Z' }, { decision: 'schedule_check', occurredAt: '2026-10-09T04:00:00Z' }, { decision: 'other' }]) {
      expect(v.confirmCareProposalRequest(bad)).toBe(false)
    }
  })
  test('完成计划请求：skipped 不得附带盆土或浇水', () => {
    expect(v.completeCarePlanRequest({ version: 1, outcome: 'done' })).toBe(true)
    expect(v.completeCarePlanRequest({ version: 1, outcome: 'done', soil: { state: 'dry', scope: 'root_zone' }, watering: { occurredAt: '2026-10-09T04:00:00Z' } })).toBe(true)
    expect(v.completeCarePlanRequest({ version: 2, outcome: 'skipped' })).toBe(true)
    for (const bad of [{ version: 0, outcome: 'done' }, { version: 1, outcome: 'skipped', watering: { occurredAt: '2026-10-09T04:00:00Z' } }, { version: 1, outcome: 'skipped', soil: { state: 'dry', scope: 'surface' } }, { version: 1, outcome: 'done', soil: { state: 'soaked', scope: 'surface' } }]) {
      expect(v.completeCarePlanRequest(bad)).toBe(false)
    }
  })
  test('计划公开投影含日历四字段，不含内部引用', () => {
    const plan = { planRef: 'cpl_AbCd1234efgh', planType: 'check_soil', scheduledAt: calendar.startAt, status: 'planned', sourceProposalRef: 'cpr_AbCd1234efgh', completedFactRef: null, calendar }
    expect(v.carePlan(plan)).toBe(true)
    expect(v.carePlan({ ...plan, calendar: { ...calendar, url: 'https://x' } })).toBe(false)
    expect(v.carePlan({ ...plan, userPlantId: 'upl_x' })).toBe(false)
  })
  test('长期浇水建议响应可带 proposalRef（cpr_ 或 null）；临时案例形状不变', () => {
    const result = { capabilityType: 'watering', contractVersion: 'care-capability-result/v1', status: 'ready', confidence: 'low', evidenceSummary: [], recommendedActions: [], generatedAt: '2026-10-09T04:00:00.000Z', validUntil: null, detailsSchemaVersion: 'watering-assessment/v1', details: { action: 'check_later', soilState: 'unknown', soilScope: null, dryingWindowState: null, checkWindow: null, amountMl: null, netDeficitMl: null, missingEvidence: [] } }
    expect(v.careCapabilityResponse({ resultRef: 'cres_AbCd1234efgh', result })).toBe(true)
    expect(v.careCapabilityResponse({ resultRef: 'cres_AbCd1234efgh', proposalRef: 'cpr_AbCd1234efgh', result })).toBe(true)
    expect(v.careCapabilityResponse({ resultRef: 'cres_AbCd1234efgh', proposalRef: null, result })).toBe(true)
    expect(v.careCapabilityResponse({ resultRef: 'cres_AbCd1234efgh', proposalRef: 'pr_x', result })).toBe(false)
  })
})
