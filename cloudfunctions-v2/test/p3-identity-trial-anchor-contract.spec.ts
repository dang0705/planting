import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

/** 以 UTF-8 文本计算 SHA-256，与两份注册清单使用同一摘要口径。 */
const createSha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

/**
 * Expected 来源：
 * - `care-points-and-ai-quota.md`：试用锚定统一用户创建时间，试用规则由 subscription 负责；
 * - `P2-identity-subscription-trial-activation-decision-draft.md`：跨域读取须由 Identity
 *   提供受控用户摘要，禁止 subscription 直接读取 Identity 表；
 * - `principal-and-capability.md` §1 与 `http-api.md` §5：内部服务必须只持有一个精确 scope，
 *   且该 scope 必须与路由登记完全相等。
 *
 * 测试层次：`unit_real_data`。直接读取仓库中的合同、路由登记、OpenAPI 和 SHA 注册表；
 * 不访问网络、CloudBase、数据库、凭证或运行时路由，因此不证明内部 API 已实现或可调用。
 */
test('P3 Identity 试用锚点只读合同限定 subscription 服务与最小脱敏字段', () => {
  const projectRoot = findProjectRoot()
  const contractDirectory = path.join(projectRoot, 'docs/backend-v2/contracts')
  const apiDirectory = path.join(projectRoot, 'docs/backend-v2/api')
  const principalContractPath = path.join(contractDirectory, 'principal-and-capability.md')
  const trialAnchorContractPath = path.join(contractDirectory, 'identity-trial-anchor.md')
  const contractRegistryPath = path.join(contractDirectory, 'contract-registry.json')
  const routeRegistryPath = path.join(apiDirectory, 'route-registry.json')
  const openapiPath = path.join(apiDirectory, 'openapi.p1.json')
  const apiManifestPath = path.join(apiDirectory, 'manifest.json')

  /** 本测试所需的路由合同字段；其余登记字段由通用 API 合同测试校验。 */
  interface TrialAnchorRoute {
    method: string
    path: string
    operationId: string
    owner: string
    phase: string
    security: string
    requiredScope?: string
    requestContract: string
    responseContract: string
    idempotency: string
    errors: string[]
  }

  const principalContract = fs.readFileSync(principalContractPath, 'utf8')
  const routeRegistryText = fs.readFileSync(routeRegistryPath, 'utf8')
  const routeRegistry = JSON.parse(routeRegistryText) as { routes: TrialAnchorRoute[] }
  const contractRegistry = JSON.parse(fs.readFileSync(contractRegistryPath, 'utf8')) as {
    contracts: Array<{ id: string; version: string; file: string; sha256: string }>
  }
  const openapiText = fs.readFileSync(openapiPath, 'utf8')
  const openapi = JSON.parse(openapiText) as {
    paths: Record<
      string,
      Record<
        string,
        {
          operationId?: string
          'x-owner'?: string
          'x-phase'?: string
          'x-security'?: string
          'x-required-scope'?: string
          'x-request-contract'?: string
          'x-response-contract'?: string
          parameters?: Array<{ name?: string; in?: string; required?: boolean }>
        }
      >
    >
  }
  const apiManifest = JSON.parse(fs.readFileSync(apiManifestPath, 'utf8')) as {
    files: Record<string, string>
  }

  const routePath = '/api/v2/internal/identity/users/{userRef}/trial-anchor'
  const routes = routeRegistry.routes.filter(route => route.path === routePath)
  const uniqueRouteKeys = new Set(
    routes.map(route => `${route.method.toUpperCase()} ${route.path}`)
  )
  assert.ok(routes.length, '试用锚点只读端点必须登记')
  assert.equal(uniqueRouteKeys.size, routes.length, '试用锚点只读端点不得重复登记')
  assert.ok(
    routes.every(route => route.method === 'GET'),
    '试用锚点路径只允许 GET'
  )

  const route = routes.find(candidate => candidate.method === 'GET')
  assert.ok(route, '试用锚点路由必须存在')
  assert.deepEqual(
    {
      method: route.method,
      operationId: route.operationId,
      owner: route.owner,
      phase: route.phase,
      security: route.security,
      requiredScope: route.requiredScope,
      requestContract: route.requestContract,
      responseContract: route.responseContract,
      idempotency: route.idempotency
    },
    {
      method: 'GET',
      operationId: 'getUserTrialAnchorInternal',
      owner: 'identity',
      phase: 'P3',
      security: 'service',
      requiredScope: 'identity.trial-anchor.read',
      requestContract: 'UserTrialAnchorPath',
      responseContract: 'UserTrialAnchorInternalResponse',
      idempotency: 'not_applicable'
    },
    '只读试用锚点的协议、归属和最小权限不得漂移'
  )
  assert.ok(route.errors.includes('PRINCIPAL_INVALID'), '内部服务认证失败必须使用稳定错误')
  assert.ok(route.errors.includes('NOT_FOUND'), '用户引用不存在时必须有稳定的未找到语义')
  assert.ok(route.errors.includes('SERVICE_UNAVAILABLE'), 'Identity 读取依赖不可用时必须明确失败')

  const resolveRoute = routeRegistry.routes.find(
    item => item.operationId === 'resolvePrincipalInternal'
  )
  assert.ok(resolveRoute, '新增试用锚点不得替换现有 Agent 身份解析端点')
  assert.equal(resolveRoute.path, '/api/v2/internal/identity/resolve')
  assert.equal(resolveRoute.requiredScope, 'identity.resolve')
  assert.doesNotMatch(
    principalContract.split('\n').find(line => line.includes("service: 'cloudbase_agent'")) ?? '',
    /identity\.trial-anchor\.read/u,
    'CloudBase Agent 不得获得试用起算时间读取权限'
  )
  assert.match(
    principalContract,
    /service: 'subscription'; scopes: Array<'identity\.trial-anchor\.read'>/u,
    '试用锚点读取 scope 只能授予 subscription 服务主体'
  )

  assert.ok(fs.existsSync(trialAnchorContractPath), '缺少试用锚点的独立请求/响应 DTO 合同')
  const trialAnchorContract = fs.readFileSync(trialAnchorContractPath, 'utf8')
  assert.match(trialAnchorContract, /合同版本：[\s\S]*`identity-trial-anchor\/v1`/u)
  assert.match(trialAnchorContract, /created_at_ms/u, '试用锚点必须明确来自用户创建时间事实')
  assert.match(
    trialAnchorContract,
    /不得.*资格|不得.*eligible/u,
    'Identity 只提供事实，不判定试用资格'
  )

  const responseExampleMatch = trialAnchorContract.match(/```json\n(?<json>[\s\S]*?)\n```/u)
  assert.ok(responseExampleMatch, '合同必须提供可审查的 JSON 成功响应示例')
  const responseJsonText = responseExampleMatch.groups?.json
  assert.ok(responseJsonText, '成功响应示例不能为空')
  const responseExample = JSON.parse(responseJsonText) as { data: Record<string, unknown> }
  assert.deepEqual(
    Object.keys(responseExample.data).sort(),
    ['createdAtMs', 'status', 'userRef'],
    '响应只能包含经批准的公开用户引用、账户状态和创建时间，不得外露内部字段'
  )
  assert.equal(typeof responseExample.data.createdAtMs, 'number')
  assert.equal(typeof responseExample.data.status, 'string')
  assert.equal(typeof responseExample.data.userRef, 'string')

  const contractEntry = contractRegistry.contracts.find(item => item.id === 'identity-trial-anchor')
  assert.ok(contractEntry, '合同注册表必须登记独立的试用锚点合同')
  assert.equal(contractEntry.version, 'identity-trial-anchor/v1')
  assert.equal(contractEntry.file, 'identity-trial-anchor.md')
  assert.equal(
    contractEntry.sha256,
    createSha256(fs.readFileSync(trialAnchorContractPath, 'utf8')),
    '试用锚点合同正文必须与合同注册 SHA-256 一致'
  )
  assert.equal(
    contractRegistry.contracts.find(item => item.id === 'principal-and-capability')?.sha256,
    createSha256(principalContract),
    '访问主体合同正文变更后必须同步其 SHA-256'
  )

  const operation = openapi.paths[routePath]?.get
  assert.ok(operation, '生成的 OpenAPI 必须包含试用锚点 GET 路由')
  assert.equal(operation.operationId, route.operationId)
  assert.equal(operation['x-owner'], route.owner)
  assert.equal(operation['x-phase'], route.phase)
  assert.equal(operation['x-security'], 'service')
  assert.equal(operation['x-required-scope'], 'identity.trial-anchor.read')
  assert.equal(operation['x-request-contract'], 'UserTrialAnchorPath')
  assert.equal(operation['x-response-contract'], 'UserTrialAnchorInternalResponse')
  assert.ok(
    operation.parameters?.some(parameter => parameter.name === 'userRef' && parameter.in === 'path')
  )
  assert.equal(apiManifest.files['route-registry.json'], createSha256(routeRegistryText))
  assert.equal(apiManifest.files['openapi.p1.json'], createSha256(openapiText))
})
