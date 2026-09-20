import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { createPublicContractValidators } from '../../src/contracts/index.js'
import { findProjectRoot } from '../support/project-root.js'

/** 路由登记表中创建用户植物所需的最小机器合同。 */
type 创建用户植物路由 = {
  /** HTTP 方法。 */
  method: string
  /** 稳定操作标识。 */
  operationId: string
  /** 请求 DTO 合同名。 */
  requestContract: string
  /** 响应 DTO 合同名。 */
  responseContract: string
  /** 稳定公开错误集合。 */
  errors: string[]
}

/** OpenAPI 中本测试核验的创建操作最小结构。 */
type 创建用户植物OpenApi操作 = {
  /** JSON 请求正文合同引用。 */
  requestBody: {
    /** 请求正文是否必填。 */
    required: boolean
    /** 按 MIME 类型登记的请求 Schema。 */
    content: Record<string, { schema: { $ref: string } }>
  }
  /** 按 HTTP 状态码登记的响应合同。 */
  responses: Record<string, { content?: Record<string, { schema: { $ref: string } }> }>
  /** 操作级参数引用。 */
  parameters: Array<{ $ref?: string }>
}

/**
 * Expected 来源：`user-plant/v1` 的“创建用户植物”章节和 `http-api/v1`。
 * 测试层次：unit_real_data；使用真实 AJV 校验器、路由登记表和生成后的 OpenAPI 制品。
 * 明确未覆盖：身份解析、能力快照、MySQL、幂等 Repository、并发与真实 HTTP 端口。
 */
describe('创建用户植物公开合同', () => {
  const validators = createPublicContractValidators()
  const 合法响应 = {
    user_plant_id: 'upl_01K5WPJ9KCEQJH5H3A1S9NZB7C',
    lifecycle: 'active',
    identityStatus: 'unidentified',
    version: 1,
    createdAt: '2026-09-20T04:00:00.000Z',
    updatedAt: '2026-09-20T04:00:00.000Z'
  }

  test('请求只接受严格空 JSON 对象', () => {
    expect(validators.createUserPlantRequest({})).toBe(true)
    for (const 非法请求 of [
      { user_id: 'usr_forbidden_001' },
      { idempotencyKey: 'header-only' },
      { lifecycle: 'active' },
      { light: 'bright_indirect' }
    ]) {
      expect(validators.createUserPlantRequest(非法请求)).toBe(false)
    }
  })

  test('响应只接受六个服务端生成字段和固定初始状态', () => {
    expect(validators.createUserPlantResponse(合法响应)).toBe(true)
    expect(validators.createUserPlantResponse({ ...合法响应, lifecycle: 'archived' })).toBe(false)
    expect(validators.createUserPlantResponse({ ...合法响应, identityStatus: 'confirmed' })).toBe(
      false
    )
    expect(validators.createUserPlantResponse({ ...合法响应, version: 2 })).toBe(false)
    expect(validators.createUserPlantResponse({ ...合法响应, user_id: 'usr_forbidden_001' })).toBe(
      false
    )
  })

  test('路由登记和 OpenAPI 精确引用创建合同及必填幂等 Header', () => {
    const 根目录 = findProjectRoot()
    const api目录 = path.join(根目录, 'docs/backend-v2/api')
    const 路由登记 = JSON.parse(
      fs.readFileSync(path.join(api目录, 'route-registry.json'), 'utf8')
    ) as { routes: 创建用户植物路由[] }
    const 路由 = 路由登记.routes.find((项目) => 项目.operationId === 'createUserPlant')

    expect(路由).toMatchObject({
      method: 'POST',
      requestContract: 'CreateUserPlantRequest',
      responseContract: 'CreateUserPlantResponse'
    })
    expect(路由?.errors).toContain('CAPABILITY_SNAPSHOT_EXPIRED')

    const openapi = JSON.parse(
      fs.readFileSync(path.join(api目录, 'openapi.p1.json'), 'utf8')
    ) as {
      /** 按路径和 HTTP 方法组织的 OpenAPI 操作。 */
      paths: Record<string, Record<string, 创建用户植物OpenApi操作>>
      /** 可复用 Schema 与参数定义。 */
      components: {
        /** 公开 DTO Schema。 */
        schemas: Record<string, unknown>
        /** 公开 Header 与路径参数。 */
        parameters: Record<string, { schema: Record<string, unknown> }>
      }
    }
    const 操作 = openapi.paths['/api/v2/user-plants']?.post

    expect(操作?.requestBody.required).toBe(true)
    expect(操作?.requestBody.content['application/json']?.schema.$ref).toBe(
      '#/components/schemas/CreateUserPlantRequest'
    )
    expect(操作?.responses['200']?.content?.['application/json']?.schema.$ref).toBe(
      '#/components/schemas/CreateUserPlantSuccess'
    )
    expect(操作?.parameters).toContainEqual({ $ref: '#/components/parameters/IdempotencyKey' })
    expect(openapi.components.schemas).toHaveProperty('CreateUserPlantRequest')
    expect(openapi.components.schemas).toHaveProperty('CreateUserPlantResponse')
    expect(openapi.components.schemas).toHaveProperty('CreateUserPlantSuccess')
    expect(openapi.components.parameters.IdempotencyKey?.schema).toMatchObject({
      minLength: 8,
      maxLength: 128,
      pattern: '^[\\x20-\\x7E]+$'
    })
  })
})
