import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

const minimumNonEmptyLength = Number('1')

/** OpenAPI 文档中本测试核验的登录请求操作。 */
type IdentitySessionOperation = {
  /** 请求体的 JSON Schema 引用。 */
  readonly requestBody?: {
    readonly content?: {
      readonly 'application/json'?: {
        readonly schema?: { readonly $ref?: string; readonly additionalProperties?: boolean }
      }
    }
  }
  /** 登录成功响应的 JSON Schema 引用。 */
  readonly responses?: {
    readonly '200'?: {
      readonly content?: {
        readonly 'application/json'?: {
          readonly schema?: { readonly $ref?: string }
        }
      }
    }
  }
  /** 登录路由不能要求可重复使用的一般幂等键。 */
  readonly parameters?: readonly { readonly $ref?: string }[]
  /** 业务路由机器可读的幂等语义。 */
  readonly 'x-idempotency'?: string
  /** 登录入口必须声明为平台凭证换取青花植会话。 */
  readonly 'x-security'?: string
}

/** 本测试直接读取的 OpenAPI 字段级组件。 */
type OpenApiLoginDocument = {
  /** 路径下按小写 HTTP 方法索引的操作。 */
  readonly paths: Readonly<Record<string, Readonly<Record<string, IdentitySessionOperation>>>>
  /** 组件 Schema 注册表。 */
  readonly components: {
    readonly schemas: Readonly<Record<string, Record<string, unknown>>>
  }
}

/**
 * Expected 来源：`contracts/identity-session-issuance.md` §2、
 * `contracts/http-api.md` §2/§4 和已批准的一次性微信 code 登录合同。
 * 测试层次：L1 `unit_real_data`；真实读取路由登记生成的 OpenAPI 文件。
 * 覆盖严格多平台 `{ platform, code, guestToken? }` DTO、仅含 `accessToken`/`expiresAt` 的成功响应和无幂等头。
 * 不替换或验证 HTTP 服务、Provider、数据库、CloudBase 网关及真实微信。
 */
test('多平台登录 OpenAPI 精确描述一次性 code 请求和最小 Bearer 响应', () => {
  const projectRoot = findProjectRoot()
  const openApiPath = path.join(projectRoot, 'docs/backend-v2/api/openapi.p1.json')
  const document = JSON.parse(fs.readFileSync(openApiPath, 'utf8')) as OpenApiLoginDocument
  const operation = document.paths['/api/v2/identity/sessions']?.post

  assert.ok(operation, 'OpenAPI 必须包含微信登录操作')
  assert.equal(operation['x-security'], 'credential_exchange')
  assert.equal(operation['x-idempotency'], 'not_applicable')
  assert.ok(
    !operation.parameters?.some(parameter => parameter.$ref?.includes('IdempotencyKey')),
    '一次性微信 code 登录不得要求 Idempotency-Key'
  )

  const requestSchemaRef = operation.requestBody?.content?.['application/json']?.schema?.$ref
  assert.equal(requestSchemaRef, '#/components/schemas/CreateIdentitySessionRequest')
  const requestSchema = document.components.schemas.CreateIdentitySessionRequest
  assert.equal(requestSchema?.type, 'object')
  assert.equal(requestSchema?.additionalProperties, false)
  // 用户 2026-10-09 冻结多平台登录：{ platform 必填, code, guestToken? }，微信携带 guestToken 非法。
  assert.deepEqual(requestSchema?.required, ['platform', 'code'])
  const requestProperties = requestSchema?.properties as Record<string, Record<string, unknown>>
  assert.deepEqual(Object.keys(requestProperties), ['platform', 'code', 'guestToken'])
  assert.deepEqual(requestProperties.platform?.enum, ['wechat', 'douyin', 'xiaohongshu'])
  assert.equal(requestProperties.code?.type, 'string')
  assert.equal(requestProperties.code?.minLength, minimumNonEmptyLength)
  assert.equal(requestProperties.guestToken?.type, 'string')
  assert.deepEqual((requestSchema as Record<string, unknown>).then, { not: { required: ['guestToken'] } })

  const responseSchemaRef =
    operation.responses?.['200']?.content?.['application/json']?.schema?.$ref
  assert.equal(responseSchemaRef, '#/components/schemas/CreateIdentitySessionSuccess')
  const responseSchema = document.components.schemas.CreateIdentitySessionSuccess
  assert.equal(responseSchema?.additionalProperties, false)
  assert.deepEqual(responseSchema?.required, ['data'])
  assert.deepEqual(responseSchema?.properties, {
    data: { $ref: '#/components/schemas/CreateIdentitySessionData' }
  })

  const responseDataSchema = document.components.schemas.CreateIdentitySessionData
  assert.equal(responseDataSchema?.additionalProperties, false)
  assert.deepEqual(responseDataSchema?.required, ['accessToken', 'expiresAt'])
  const responseProperties = responseDataSchema?.properties as Record<
    string,
    Record<string, unknown>
  >
  assert.deepEqual(Object.keys(responseProperties).sort(), ['accessToken', 'expiresAt'])
  assert.equal(responseProperties.accessToken?.type, 'string')
  assert.equal(responseProperties.accessToken?.minLength, minimumNonEmptyLength)
  assert.equal(responseProperties.expiresAt?.type, 'string')
  assert.equal(responseProperties.expiresAt?.format, 'date-time')
})

/**
 * Expected：guest-token-contract.md §1（用户 2026-10-08 冻结）。L1 unit_real_data：读取生成后的真实 OpenAPI 制品。
 * 覆盖游客签发请求（仅抖音/小红书，anonymousCode 仅抖音）与一次性令牌响应；不验证 HTTP 服务与数据库。
 */
test('游客签发 OpenAPI 精确描述平台限制与一次性令牌响应', () => {
  const document = JSON.parse(fs.readFileSync(path.join(findProjectRoot(), 'docs/backend-v2/api/openapi.p1.json'), 'utf8')) as OpenApiLoginDocument
  const operation = document.paths['/api/v2/identity/guest-sessions']?.post
  assert.ok(operation, 'OpenAPI 必须包含游客签发操作')
  assert.equal(operation['x-idempotency'], 'not_applicable')
  assert.equal(operation.requestBody?.content?.['application/json']?.schema?.$ref, '#/components/schemas/CreateGuestSessionRequest')
  assert.equal(operation.responses?.['200']?.content?.['application/json']?.schema?.$ref, '#/components/schemas/CreateGuestSessionSuccess')
  const request = document.components.schemas.CreateGuestSessionRequest as Record<string, unknown>
  assert.deepEqual(request.required, ['platform'])
  assert.equal(request.additionalProperties, false)
  const properties = request.properties as Record<string, Record<string, unknown>>
  assert.deepEqual(Object.keys(properties), ['platform', 'anonymousCode'])
  assert.deepEqual(properties.platform?.enum, ['douyin', 'xiaohongshu'])
  assert.deepEqual(request.then, { not: { required: ['anonymousCode'] } })
  const data = document.components.schemas.CreateGuestSessionData as Record<string, unknown>
  assert.deepEqual(data.required, ['guestToken', 'guestSessionRef', 'expiresAt'])
  assert.equal(data.additionalProperties, false)
})
