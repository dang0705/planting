import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：`docs/backend-v2/contracts/user-plant.md`「列表公开接口」「删除公开接口」（2026-10-10 用户裁决冻结）；
 * 主代理 2026-10-10 配置裁决：列表分页 `user-plant.list.page_size` 为 hard_rule，默认 20、上限 50。
 * 测试层次：L3 / `unit_real_data`（读取真实 route-registry、生成后的 OpenAPI 与配置目录制品，不访问网络）。
 * 明确未覆盖：运行时 HTTP 行为（见 test/user-plant/*-route.spec.ts 与 test/e2e/user-plant-list-delete.mysql.spec.ts）。
 */

type JsonObject = Record<string, unknown>
const root = findProjectRoot()
const read = (relative: string) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')) as JsonObject
const registry = read('docs/backend-v2/api/route-registry.json') as { routes: JsonObject[] }
const openapi = read('docs/backend-v2/api/openapi.p1.json') as {
  paths: Record<string, Record<string, JsonObject & { parameters?: JsonObject[]; requestBody?: JsonObject; responses?: JsonObject }>>
  components: { schemas: Record<string, JsonObject> }
}
const catalog = read('docs/backend-v2/architecture/configuration-variable-catalog.json') as { variables: JsonObject[] }

describe('用户植物列表与删除的公开合同制品', () => {
  test('route-registry：列表只读免幂等；删除要求幂等头与版本', () => {
    const list = registry.routes.find(route => route.operationId === 'listUserPlants')
    const remove = registry.routes.find(route => route.operationId === 'deleteUserPlant')
    expect(list).toMatchObject({ method: 'GET', path: '/api/v2/user-plants', security: 'authenticated', idempotency: 'not_applicable', requestContract: 'UserPlantListQuery', responseContract: 'UserPlantListResponse' })
    expect(remove).toMatchObject({ method: 'DELETE', path: '/api/v2/user-plants/{userPlantRef}', security: 'authenticated', idempotency: 'required_header_and_version', requestContract: 'DeleteUserPlantRequest', responseContract: 'UserPlantDeletionResponse' })
    expect(remove!.errors).toEqual(expect.arrayContaining(['USER_PLANT_NOT_FOUND', 'USER_PLANT_VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'VALIDATION_FAILED', 'PRINCIPAL_INVALID']))
    expect(remove!.errors).not.toContain('CAPABILITY_DENIED')
  })

  test('OpenAPI 列表：只声明 lifecycle / limit / cursor 三个查询参数，成功体为 items + nextCursor', () => {
    const operation = openapi.paths['/api/v2/user-plants']!.get!
    const query = (operation.parameters ?? []).filter(parameter => parameter.in === 'query')
    expect(query.map(parameter => parameter.name).sort()).toEqual(['cursor', 'lifecycle', 'limit'])
    expect(query.find(parameter => parameter.name === 'lifecycle')).toMatchObject({ required: false, schema: { enum: ['active', 'archived'] } })
    expect(query.find(parameter => parameter.name === 'limit')).toMatchObject({ required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } })
    expect(operation.requestBody).toBeUndefined()
    expect((operation.responses as Record<string, JsonObject>)['200']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/UserPlantListSuccess' } } }
    })
    expect(openapi.components.schemas.UserPlantListSuccess).toMatchObject({
      type: 'object', additionalProperties: false, required: ['data'],
      properties: { data: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
        properties: { items: { type: 'array', maxItems: 50 }, nextCursor: { type: ['string', 'null'] } } } }
    })
  })

  test('OpenAPI 删除：请求体只允许 expectedVersion；成功体 lifecycle 固定 deleting', () => {
    const operation = openapi.paths['/api/v2/user-plants/{userPlantRef}']!.delete!
    expect(operation.requestBody).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/DeleteUserPlantRequest' } } } })
    expect(operation.parameters).toEqual(expect.arrayContaining([{ $ref: '#/components/parameters/IdempotencyKey' }]))
    expect(openapi.components.schemas.DeleteUserPlantRequest).toEqual({
      type: 'object', additionalProperties: false, required: ['expectedVersion'],
      properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: '调用方最后读到的用户植物版本，必须是正安全整数。' } }
    })
    expect((operation.responses as Record<string, JsonObject>)['200']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/UserPlantDeletionSuccess' } } }
    })
    expect(openapi.components.schemas.UserPlantDeletionSuccess).toMatchObject({
      required: ['data'],
      properties: { data: { additionalProperties: false, required: ['user_plant_id', 'lifecycle', 'version', 'updatedAt'], properties: { lifecycle: { const: 'deleting' } } } }
    })
  })

  // 用户 2026-10-10 第三轮裁定：分页迁入策略发布 user-plant/list_rules（取值不变），目录改为 confirmed 的策略项。
  test('配置目录：user-plant.list.page_size 为策略发布项，默认 20、上限 50，绑定 E03 票', () => {
    const entry = catalog.variables.find(variable => variable.id === 'user-plant.list.page_size')
    expect(entry).toMatchObject({ domain: 'user-plant', layer: 'domain_policy', status: 'confirmed', configurationTier: 'policy', currentValue: { default: 20, max: 50 }, owner: 'user-plant', clickUpTicketId: 'z8v0kmr9mj' })
  })
})
