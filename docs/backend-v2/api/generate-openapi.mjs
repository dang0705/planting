import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDirectory = path.dirname(fileURLToPath(import.meta.url))
const registryPath = path.join(apiDirectory, 'route-registry.json')
const openapiPath = path.join(apiDirectory, 'openapi.p1.json')
const manifestPath = path.join(apiDirectory, 'manifest.json')
const registryText = fs.readFileSync(registryPath, 'utf8')
const registry = JSON.parse(registryText)

const parametersByPath = (routePath) => [...routePath.matchAll(/\{([^}]+)\}/gu)].map((match) => ({
  name: match[1],
  in: 'path',
  required: true,
  schema: { type: 'string', minLength: 8, maxLength: 100 },
}))

const paths = {}
for (const route of registry.routes) {
  const method = route.method.toLowerCase()
  const isWrite = ['post', 'patch', 'delete', 'put'].includes(method)
  const operation = {
    operationId: route.operationId,
    summary: `${route.owner} 域：${route.operationId}`,
    tags: [route.owner],
    'x-owner': route.owner,
    'x-phase': route.phase,
    'x-security': route.security,
    ...(route.requiredScope ? { 'x-required-scope': route.requiredScope } : {}),
    'x-request-contract': route.requestContract,
    'x-response-contract': route.responseContract,
    'x-idempotency': route.idempotency,
    'x-errors': route.errors,
    parameters: parametersByPath(route.path),
    responses: {
      '200': {
        description: '成功；具体 data 结构由 x-response-contract 指向的合同冻结',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } },
      },
      default: {
        description: '稳定公开错误',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
    },
  }
  if (isWrite && route.requestContract !== 'EmptyRequest' && route.requestContract !== 'RawPaymentCallback') {
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: { type: 'object', additionalProperties: false } } },
    }
  }
  if (route.idempotency.startsWith('required_header')) {
    operation.parameters.push({ $ref: '#/components/parameters/IdempotencyKey' })
  }
  if (route.security === 'authenticated') operation.security = [{ userBearer: [] }]
  if (route.security === 'guest_or_authenticated') operation.security = [{ guestBearer: [] }, { userBearer: [] }]
  if (route.security === 'service') operation.security = [{ serviceSignature: [] }]
  paths[route.path] ??= {}
  paths[route.path][method] = operation
}

const errorTypes = [
  'VALIDATION_FAILED', 'PRINCIPAL_INVALID', 'CAPABILITY_DENIED', 'NOT_FOUND',
  'USER_PLANT_NOT_FOUND', 'METHOD_NOT_ALLOWED', 'GUEST_SESSION_EXPIRED',
  'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE', 'IDEMPOTENCY_CONFLICT',
  'USER_PLANT_VERSION_CONFLICT', 'CAPABILITY_SNAPSHOT_EXPIRED',
  'GUEST_SESSION_NOT_CLAIMABLE', 'AI_QUOTA_INSUFFICIENT', 'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
]

const openapi = {
  openapi: '3.1.0',
  info: {
    title: '青花植后端 v2 P1 API 骨架',
    version: 'p1',
    description: '仅冻结具体路由、owner、安全级别和合同引用；完整字段与示例在 P6 发布。',
  },
  servers: [{ url: '/api/v2', description: 'CloudBase HTTP Gateway 相对路径' }],
  paths,
  components: {
    securitySchemes: {
      guestBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'CloudBase anonymous token' },
      userBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'CloudBase user token' },
      serviceSignature: { type: 'apiKey', in: 'header', name: 'X-QHZ-Signature' },
    },
    parameters: {
      IdempotencyKey: {
        name: 'Idempotency-Key', in: 'header', required: true,
        schema: { type: 'string', minLength: 8, maxLength: 128 },
        description: '同一主体、方法、规范化路径和业务动作范围内的幂等键。',
      },
    },
    schemas: {
      SuccessEnvelope: {
        type: 'object', additionalProperties: false, required: ['data'],
        properties: { data: {} },
      },
      ErrorResponse: {
        type: 'object', additionalProperties: false, required: ['error'],
        properties: {
          error: {
            type: 'object', additionalProperties: false, required: ['type', 'message'],
            properties: {
              type: { type: 'string', enum: errorTypes },
              message: { type: 'string', minLength: 1, maxLength: 200 },
            },
          },
        },
      },
    },
  },
}

const openapiText = `${JSON.stringify(openapi, null, 2)}\n`
fs.writeFileSync(openapiPath, openapiText)
const manifest = {
  version: 'api-skeleton/p1',
  generatedAt: registry.generatedAt,
  source: 'route-registry.json',
  files: {
    'route-registry.json': createHash('sha256').update(registryText).digest('hex'),
    'openapi.p1.json': createHash('sha256').update(openapiText).digest('hex'),
  },
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
