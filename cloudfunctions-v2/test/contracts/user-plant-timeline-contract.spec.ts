import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { CARE_OUTBOX_DISPATCH } from '../../src/care/domain/care-outbox-dispatch-rules.js'
import { USER_PLANT_TIMELINE_PAGE_SIZE } from '../../src/user-plant/domain/timeline.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：docs/backend-v2/contracts/user-plant-timeline.md（2026-10-10 用户审定；§5 派发规则用户 2026-10-10 裁决、主代理裁定 hard_rule）；
 * 配置目录 care.outbox_dispatch = {cron:'0 * * * * * *', leaseSeconds:30, batchSize:100, maxAttempts:5}、user-plant.timeline.page_size = {20,50}。
 * 测试层次：L3 / unit_real_data（真实 contract-registry、route-registry、OpenAPI、配置目录制品 + 代码常量一致性）。
 */
const root = findProjectRoot()
const readJson = <T>(relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')) as T
const catalog = readJson<{ variables: Array<{ id: string; status: string; layer: string; currentValue: unknown; owner: string }> }>('docs/backend-v2/architecture/configuration-variable-catalog.json')

describe('用户植物时间线合同制品', () => {
  test('contract-registry SHA-256 与正文一致', () => {
    const registry = readJson<{ contracts: Array<{ id: string; sha256: string }> }>('docs/backend-v2/contracts/contract-registry.json')
    const entry = registry.contracts.find(contract => contract.id === 'user-plant-timeline')
    expect(entry?.sha256).toBe(createHash('sha256').update(fs.readFileSync(path.join(root, 'docs/backend-v2/contracts/user-plant-timeline.md'))).digest('hex'))
  })

  test('route-registry：只读、错误集合与合同 §6 一致', () => {
    const registry = readJson<{ routes: Array<{ operationId: string; errors: string[]; idempotency: string; method: string }> }>('docs/backend-v2/api/route-registry.json')
    const route = registry.routes.find(candidate => candidate.operationId === 'listUserPlantTimeline')
    expect(route).toMatchObject({ method: 'GET', idempotency: 'not_applicable' })
    expect([...route!.errors].sort()).toEqual(['PRINCIPAL_INVALID', 'SERVICE_UNAVAILABLE', 'USER_PLANT_NOT_FOUND', 'VALIDATION_FAILED'])
  })

  test('OpenAPI：只有 limit/cursor 查询参数；成功体为 items + nextCursor，itemType 四种', () => {
    const openapi = readJson<{ paths: Record<string, Record<string, { parameters?: Array<{ name?: string; in?: string; schema?: unknown }>; responses?: Record<string, unknown> }>>; components: { schemas: Record<string, unknown> } }>('docs/backend-v2/api/openapi.p1.json')
    const operation = openapi.paths['/api/v2/user-plants/{userPlantRef}/timeline']!.get!
    expect(operation.parameters!.filter(parameter => parameter.in === 'query').map(parameter => parameter.name).sort()).toEqual(['cursor', 'limit'])
    expect(operation.responses!['200']).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/TimelineSuccess' } } } })
    expect(JSON.stringify(openapi.components.schemas.TimelineSuccess)).toContain('care_plan_completed')
  })

  test('配置目录 hard_rule 与代码常量一致', () => {
    const dispatch = catalog.variables.find(variable => variable.id === 'care.outbox_dispatch')
    expect(dispatch).toMatchObject({ status: 'hard_rule', layer: 'hard_rule', owner: 'care', currentValue: { cron: '0 * * * * * *', leaseSeconds: 30, batchSize: 100, maxAttempts: 5 } })
    expect(CARE_OUTBOX_DISPATCH).toEqual(dispatch!.currentValue)
    expect(USER_PLANT_TIMELINE_PAGE_SIZE).toEqual(catalog.variables.find(variable => variable.id === 'user-plant.timeline.page_size')!.currentValue)
  })
})
