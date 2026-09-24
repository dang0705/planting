import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/** JSON 对象结构，用于对已生成的 API 合同做独立核验。 */
type JsonObject = Record<string, unknown>

/** 路由登记表中归档与恢复测试所需的单条合同。 */
interface RegistryRoute {
  /** HTTP 动词，归档与恢复均固定为 POST。 */
  method: string
  /** 含公开植物引用占位符的稳定路由路径。 */
  path: string
  /** 能唯一标识路由用途的操作名称。 */
  operationId: string
  /** 请求 DTO 的合同名称。 */
  requestContract: string
  /** 成功响应 DTO 的合同名称。 */
  responseContract: string
  /** 写入请求的幂等要求。 */
  idempotency: string
  /** 本路由允许返回的稳定错误代码集合。 */
  errors: string[]
}

/** OpenAPI 请求体中 JSON 媒体类型对应的结构。 */
interface JsonMediaType {
  /** JSON Schema 或其组件引用。 */
  schema?: JsonObject
}

/** OpenAPI 请求体中归档与恢复所需的媒体类型映射。 */
interface OpenApiRequestBody {
  /** 本请求体支持的媒体类型。 */
  content?: Record<string, JsonMediaType>
}

/** OpenAPI 操作中归档与恢复的合同扩展和参数。 */
interface OpenApiOperation {
  /** 指向路由请求合同的稳定名称。 */
  'x-request-contract'?: string
  /** 指向路由成功响应合同的稳定名称。 */
  'x-response-contract'?: string
  /** 本路由允许返回的稳定错误代码集合。 */
  'x-errors'?: string[]
  /** 路径参数和幂等请求头。 */
  parameters?: JsonObject[]
  /** 适用于写操作的 JSON 请求体。 */
  requestBody?: OpenApiRequestBody
  /** 按 HTTP 状态码索引的成功与错误响应结构。 */
  responses?: Record<string, { content?: Record<string, JsonMediaType> }>
  /** 当前操作允许使用的 Bearer 身份方案。 */
  security?: Array<Record<string, string[]>>
}

/** 测试实际读取的路由登记表结构。 */
interface RouteRegistryDocument {
  /** 全部公开与内部 API 路由。 */
  routes: RegistryRoute[]
}

/** 测试实际读取的 OpenAPI 制品结构。 */
interface OpenApiDocument {
  /** 以公开路径和小写 HTTP 动词索引的操作。 */
  paths: Record<string, Record<string, OpenApiOperation>>
  /** 供各操作引用的参数和 JSON Schema。 */
  components: {
    /** 稳定、可复用的 OpenAPI 参数。 */
    parameters: Record<string, JsonObject>
    /** 稳定、可复用的公开 DTO Schema。 */
    schemas: Record<string, JsonObject>
  }
}

/** 读取 route-registry 中唯一匹配指定操作名称的路由。 */
function findRoute(registry: RouteRegistryDocument, operationId: string): RegistryRoute {
  const route = registry.routes.find(candidate => candidate.operationId === operationId)
  assert.ok(route, `route-registry 缺少 ${operationId}`)
  return route
}

/** 从生成后的 OpenAPI 制品中读取指定路由操作。 */
function findOpenApiOperation(openapi: OpenApiDocument, route: RegistryRoute): OpenApiOperation {
  const operation = openapi.paths[route.path]?.[route.method.toLowerCase()]
  assert.ok(operation, `OpenAPI 缺少 ${route.method} ${route.path}`)
  return operation
}

/**
 * Expected 来源：主代理对归档/恢复公开合同的明确裁决，以及
 * `contracts/user-plant.md`、`contracts/http-api.md` 与 `contracts/principal-and-capability.md`。
 * 测试层次：L3 / `unit_real_data`；读取真实 route-registry、OpenAPI 与合同文档，不访问网络。
 * 核心约束：请求体严格只有正安全整数 `expectedVersion`；植物引用只在路径、幂等键只在头，
 * 主体与能力快照不得由公开请求体提供；恢复错误集合必须包含能力拒绝和过期快照，归档不得包含。
 */
describe('用户植物归档与恢复公开路由合同', () => {
  const projectRoot = findProjectRoot()
  const apiDirectory = path.join(projectRoot, 'docs/backend-v2/api')
  const registry = JSON.parse(
    fs.readFileSync(path.join(apiDirectory, 'route-registry.json'), 'utf8')
  ) as RouteRegistryDocument
  const openapi = JSON.parse(
    fs.readFileSync(path.join(apiDirectory, 'openapi.p1.json'), 'utf8')
  ) as OpenApiDocument

  it('公开请求体只接受 expectedVersion 正安全整数，引用与幂等键留在路径和请求头', () => {
    for (const operationId of ['archiveUserPlant', 'restoreUserPlant']) {
      const route = findRoute(registry, operationId)
      const operation = findOpenApiOperation(openapi, route)
      const jsonBodySchema = operation.requestBody?.content?.['application/json']?.schema

      assert.equal(route.method, 'POST')
      assert.equal(route.requestContract, 'UserPlantVersionRequest')
      assert.equal(route.responseContract, 'UserPlantResponse')
      assert.equal(route.idempotency, 'required_header_and_version')
      assert.equal(operation['x-request-contract'], 'UserPlantVersionRequest')
      assert.equal(operation['x-response-contract'], 'UserPlantResponse')
      assert.deepEqual(operation.responses?.['200']?.content?.['application/json']?.schema, {
        $ref: '#/components/schemas/SuccessEnvelope'
      })
      assert.deepEqual(jsonBodySchema, {
        $ref: '#/components/schemas/UserPlantVersionRequest'
      })

      const pathReference = operation.parameters?.find(
        parameter => parameter.name === 'userPlantRef' && parameter.in === 'path'
      )
      const idempotencyHeader = operation.parameters?.find(
        parameter => parameter.$ref === '#/components/parameters/IdempotencyKey'
      )
      assert.ok(pathReference, `${operationId} 必须从路径接收 userPlantRef`)
      assert.ok(idempotencyHeader, `${operationId} 必须从 Idempotency-Key 请求头接收幂等键`)

      assert.deepEqual(operation.security, [{ userBearer: [] }])
    }

    assert.deepEqual(openapi.components.schemas.UserPlantVersionRequest, {
      type: 'object',
      additionalProperties: false,
      required: ['expectedVersion'],
      properties: {
        expectedVersion: {
          type: 'integer',
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
          description: '调用方最后读到的用户植物版本，必须是正安全整数。'
        }
      }
    })
  })

  it('仅恢复路由暴露能力错误，HTTP 状态遵循公共错误目录', () => {
    const archiveRoute = findRoute(registry, 'archiveUserPlant')
    const restoreRoute = findRoute(registry, 'restoreUserPlant')
    const restoreOperation = findOpenApiOperation(openapi, restoreRoute)
    const httpContract = fs.readFileSync(
      path.join(projectRoot, 'docs/backend-v2/contracts/http-api.md'),
      'utf8'
    )

    assert.ok(restoreRoute.errors.includes('CAPABILITY_DENIED'))
    assert.ok(restoreRoute.errors.includes('CAPABILITY_SNAPSHOT_EXPIRED'))
    assert.ok(!archiveRoute.errors.includes('CAPABILITY_DENIED'))
    assert.ok(!archiveRoute.errors.includes('CAPABILITY_SNAPSHOT_EXPIRED'))
    assert.ok(restoreOperation['x-errors']?.includes('CAPABILITY_DENIED'))
    assert.ok(restoreOperation['x-errors']?.includes('CAPABILITY_SNAPSHOT_EXPIRED'))
    assert.match(httpContract, /\| `CAPABILITY_DENIED` \| 403 \|/u)
    assert.match(httpContract, /\| `CAPABILITY_SNAPSHOT_EXPIRED` \| 409 \|/u)
  })

  it('本次精确增加归档/恢复 Schema，不扩宽其他已冻结空请求合同', () => {
    const createUserPlantRoute = findRoute(registry, 'createUserPlant')
    const createUserPlantOperation = findOpenApiOperation(openapi, createUserPlantRoute)
    const createUserPlantRequest =
      createUserPlantOperation.requestBody?.content?.['application/json']?.schema

    assert.deepEqual(createUserPlantRequest, {
      $ref: '#/components/schemas/CreateUserPlantRequest'
    })
    assert.deepEqual(openapi.components.schemas.CreateUserPlantRequest, {
      type: 'object',
      additionalProperties: false,
      maxProperties: 0,
      properties: {}
    })

    const currentUserRoute = findRoute(registry, 'getCurrentUser')
    const currentUserOperation = findOpenApiOperation(openapi, currentUserRoute)
    assert.equal(currentUserOperation.requestBody, undefined)
  })
})
