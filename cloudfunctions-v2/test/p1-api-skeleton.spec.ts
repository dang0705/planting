import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

// Expected 来源：Canonical Master Plan 第十章、http-api/v1 与 P1 退出条件。
// 测试层次：unit_real_data；读取真实路由登记表和 OpenAPI 骨架，不访问网络或业务实现。
test('P1 API 路由登记表与 OpenAPI 骨架保持一致', () => {
/** 路由登记项是 API 合同的机器可读最小单位。 */
interface RouteRegistryItem extends Record<string, unknown> {
  method: string
  path: string
  operationId: string
  owner: string
  phase: string
  security: string
  errors: unknown[]
  requiredScope?: string
}

/** OpenAPI 操作只声明本测试真正核验的扩展字段和响应。 */
interface OpenApiOperation extends Record<string, unknown> {
  responses?: Record<string, unknown>
}

const root = findProjectRoot()
const apiDirectory = path.join(root, 'docs/backend-v2/api')
const httpContractPath = path.join(root, 'docs/backend-v2/contracts/http-api.md')
const registryPath = path.join(apiDirectory, 'route-registry.json')
const openapiPath = path.join(apiDirectory, 'openapi.p1.json')
const manifestPath = path.join(apiDirectory, 'manifest.json')

assert.ok(fs.existsSync(registryPath), '缺少 P1 具体路由登记表')
assert.ok(fs.existsSync(openapiPath), '缺少 P1 OpenAPI 骨架')
assert.ok(fs.existsSync(manifestPath), '缺少 P1 API 制品清单')
assert.ok(fs.existsSync(httpContractPath), '缺少 HTTP 公共合同')

const httpContractText = fs.readFileSync(httpContractPath, 'utf8')
assert.match(
  httpContractText,
  /普通 JSON 请求正文上限[^\n]*`1,048,576`[^\n]*`http\.json_body_limit_bytes`/u,
  'HTTP 公共合同必须明确冻结普通 JSON 请求正文上限及其配置项来源',
)

const registryText = fs.readFileSync(registryPath, 'utf8')
const openapiText = fs.readFileSync(openapiPath, 'utf8')
const registry = JSON.parse(registryText) as {
  schemaVersion: number
  basePath: string
  routes: RouteRegistryItem[]
}
const openapi = JSON.parse(openapiText) as {
  openapi: string
  info: { version: string }
  servers: Array<{ url: string }>
  components: {
    parameters: Record<string, unknown>
    schemas: {
      ErrorResponse: {
        additionalProperties: boolean
        properties: { error: { properties: { type: { enum: string[] } } } }
      }
    }
  }
  paths: Record<string, Record<string, OpenApiOperation>>
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
  version: string
  files: Record<string, string>
}

assert.equal(registry.schemaVersion, 1)
assert.equal(registry.basePath, '/api/v2')
assert.ok(Array.isArray(registry.routes))
assert.ok(registry.routes.length >= 35, 'P1 路由骨架必须覆盖主要业务域和内部合同')

const allowedOwners = new Set(['identity', 'plant-knowledge', 'user-plant', 'care', 'diagnosis', 'subscription'])
const allowedSecurity = new Set(['public', 'guest_or_authenticated', 'authenticated', 'service'])
const allowedPhases = new Set(['P1', 'P2', 'P3', 'P4', 'P5'])
const routeKeys = new Set()
const expectedServiceScopes: Record<string, string> = {
  receivePaymentCallback: 'subscription.payment-callback.receive',
  resolvePrincipalInternal: 'identity.resolve',
  getUserPlantContextInternal: 'user-plant.context.read',
  getAgentPlantContextInternal: 'user-plant.agent-context.read',
  reserveAiQuotaInternal: 'subscription.ai-quota.reserve',
  settleAiQuotaInternal: 'subscription.ai-quota.settle',
  releaseAiQuotaInternal: 'subscription.ai-quota.release',
  consumeRewardEventInternal: 'subscription.reward-event.consume',
  leaseEnrichmentJobsInternal: 'plant-knowledge.enrichment.lease',
  submitEnrichmentResultInternal: 'plant-knowledge.enrichment.submit',
}

for (const route of registry.routes) {
  for (const field of ['method', 'path', 'operationId', 'owner', 'phase', 'security', 'requestContract', 'responseContract', 'idempotency', 'errors']) {
    assert.ok(Object.hasOwn(route, field), `${route.operationId ?? '未知路由'} 缺少 ${field}`)
  }
  assert.match(route.path, /^\/api\/v2(?:\/|$)/u)
  assert.ok(!route.path.includes('*'), `${route.path} 仍使用通配符`)
  assert.ok(allowedOwners.has(route.owner), `${route.path} owner 非法`)
  assert.ok(allowedSecurity.has(route.security), `${route.path} security 非法`)
  assert.ok(allowedPhases.has(route.phase), `${route.path} phase 非法`)
  assert.ok(Array.isArray(route.errors) && route.errors.length > 0, `${route.path} 缺少错误集合`)
  if (route.security === 'authenticated') {
    assert.ok(route.errors.includes('PRINCIPAL_INVALID'), `${route.path} 登录路由缺少 PRINCIPAL_INVALID`)
  }
  if (route.security === 'service') {
    assert.equal(typeof route.requiredScope, 'string', `${route.path} 缺少唯一 requiredScope`)
    assert.doesNotMatch(route.requiredScope ?? '', /^ALL_/u, `${route.path} 禁止万能 scope`)
    assert.equal(route.requiredScope, expectedServiceScopes[route.operationId], `${route.path} scope 与服务注册表不一致`)
  } else {
    assert.equal(route.requiredScope, undefined, `${route.path} 非 service 路由不得声明 requiredScope`)
  }
  const key = `${route.method.toUpperCase()} ${route.path}`
  assert.ok(!routeKeys.has(key), `重复路由：${key}`)
  routeKeys.add(key)
}
assert.equal(
  registry.routes.filter((route) => route.security === 'service').length,
  Object.keys(expectedServiceScopes).length,
  '服务路由与 scope 注册表数量不一致',
)

const createBindingRoute = registry.routes.find((route) => route.operationId === 'createIdentityBinding')
const deleteBindingRoute = registry.routes.find((route) => route.operationId === 'deleteIdentityBinding')
assert.ok(createBindingRoute?.errors.includes('IDENTITY_BINDING_CONFLICT'), '绑定路由必须声明身份占用冲突')
assert.ok(deleteBindingRoute?.errors.includes('IDENTITY_LAST_BINDING_REQUIRED'), '解绑路由必须保护最后登录入口')

assert.equal(openapi.openapi, '3.1.0')
assert.equal(openapi.info.version, 'p1')
assert.deepEqual(openapi.servers, [{ url: '/', description: 'CloudBase HTTP Gateway 根相对路径' }])
assert.ok(openapi.components?.schemas?.ErrorResponse, 'OpenAPI 缺少 ErrorResponse')
assert.equal(openapi.components.schemas.ErrorResponse.additionalProperties, false)
const openapiErrorTypes = new Set(openapi.components.schemas.ErrorResponse.properties.error.properties.type.enum)
for (const route of registry.routes) {
  for (const errorType of route.errors) {
    assert.ok(openapiErrorTypes.has(errorType as string), `${route.path} 的 ${String(errorType)} 未进入 OpenAPI 错误枚举`)
  }
}
for (const parameterName of [
  'ServiceKeyId',
  'ServiceTimestamp',
  'ServiceNonce',
  'ServiceBodySha256',
  'ServiceScope',
  'ServiceSignature',
]) {
  assert.ok(openapi.components.parameters[parameterName], `OpenAPI 缺少内部服务签名参数 ${parameterName}`)
}

const openapiRouteKeys = new Set()
for (const [routePath, pathItem] of Object.entries(openapi.paths)) {
  assert.ok(!routePath.includes('*'), `${routePath} 仍使用通配符`)
  for (const method of ['get', 'post', 'patch', 'delete', 'put']) {
    const operation = pathItem[method]
    if (!operation) { continue }
    for (const extension of ['x-owner', 'x-phase', 'x-security']) {
      assert.ok(operation[extension], `${method.toUpperCase()} ${routePath} 缺少 ${extension}`)
    }
    if (operation['x-security'] === 'service') {
      assert.equal(typeof operation['x-required-scope'], 'string', `${method.toUpperCase()} ${routePath} 缺少 x-required-scope`)
      const parameterRefs = (operation.parameters as Array<{ $ref?: string }>).map(parameter => parameter.$ref)
      for (const parameterName of [
        'ServiceKeyId',
        'ServiceTimestamp',
        'ServiceNonce',
        'ServiceBodySha256',
        'ServiceScope',
        'ServiceSignature',
      ]) {
        assert.ok(
          parameterRefs.includes(`#/components/parameters/${parameterName}`),
          `${method.toUpperCase()} ${routePath} 缺少 ${parameterName}`,
        )
      }
    }
    assert.ok(operation.responses?.default, `${method.toUpperCase()} ${routePath} 缺少默认错误响应`)
    openapiRouteKeys.add(`${method.toUpperCase()} ${routePath}`)
  }
}

assert.deepEqual([...openapiRouteKeys].sort(), [...routeKeys].sort(), '路由登记表与 OpenAPI paths 不一致')
assert.equal(manifest.version, 'api-skeleton/p1')
assert.equal(manifest.files['route-registry.json'], createHash('sha256').update(registryText).digest('hex'))
assert.equal(manifest.files['openapi.p1.json'], createHash('sha256').update(openapiText).digest('hex'))

})
