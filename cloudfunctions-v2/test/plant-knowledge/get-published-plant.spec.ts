import fs from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import type { RequestChainAuditEvent } from '../../src/foundation/http/request-chain.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import { createGetPublishedPlantRouteHandler } from '../../src/plant-knowledge/application/get-published-plant.js'
import { getPublishedPlantRoute } from '../../src/plant-knowledge/http/routes.js'
import type { PublishedPlantSqlRow } from '../../src/plant-knowledge/repository/mysql-published-plant-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const okStatus = 200
const badRequestStatus = 400
const notFoundStatus = 404
const internalErrorStatus = 500
const ephemeralPort = 0
const routePrefix = '/api/v2/plant-knowledge/plants/'

const publishedRow: PublishedPlantSqlRow = {
  public_identity_ref: 'pid_monstera_001',
  display_name_zh: '龟背竹',
  identity_kind: 'taxon',
  accepted_scientific_name: 'Monstera deliciosa Liebm.',
  taxon_rank: 'species'
}

let server: Server | undefined

/** 用记录型查询替身挂载真实分发器与真实请求链。 */
async function startService(
  readPublishedPlant: (plantIdentityRef: string) => Promise<PublishedPlantSqlRow | null>,
  auditEvents: RequestChainAuditEvent[] = []
): Promise<string> {
  const dispatch = createRouteDispatcher([
    {
      route: getPublishedPlantRoute,
      handler: createGetPublishedPlantRouteHandler({
        readPublishedPlant,
        writeAudit: event => {
          auditEvents.push(event)
        }
      })
    }
  ])
  server = createServer((request, response) => {
    dispatch(request, response).catch(() => undefined)
  })
  await new Promise<void>(resolve => server?.listen(ephemeralPort, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${String(address.port)}`
}

afterEach(async () => {
  await new Promise<void>(resolve => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => resolve())
  })
  server = undefined
})

/**
 * Expected 来源：plant-knowledge-public-read/v1（§1 路径参数、§2 五字段白名单、§3 统一 404、§4 错误）、
 * http-api/v1 §2 public 级别不解析主体、§3 错误形状；route-registry.json 的 getPublishedPlant 登记。
 * 层次：L1 / unit_fake。真实经过 node:http、冻结路由分发器、固定请求链与 AJV；只替换数据库查询端口。
 * 不覆盖：真实 SQL 可见性谓词（见 e2e/get-published-plant.mysql.spec.ts）、CloudBase 网关。
 */
describe('GET /api/v2/plant-knowledge/plants/{plantIdentityRef}', () => {
  test('路由常量与 route-registry.json 冻结登记完全一致', () => {
    const registry = JSON.parse(
      fs.readFileSync(
        path.join(findProjectRoot(), 'docs/backend-v2/api/route-registry.json'),
        'utf8'
      )
    ) as { routes: Array<{ method: string; path: string; operationId: string; security: string }> }
    const frozen = registry.routes.find(route => route.operationId === 'getPublishedPlant')
    expect(frozen).toBeDefined()
    expect(getPublishedPlantRoute).toEqual({
      method: frozen?.method,
      path: frozen?.path,
      operationId: frozen?.operationId,
      security: frozen?.security
    })
  })

  test('已发布身份返回 200 与仅含五个合同字段的公开 DTO', async () => {
    const queried: string[] = []
    const baseUrl = await startService(async ref => {
      queried.push(ref)
      return {
        ...publishedRow,
        id: Number('42'),
        _openid: '',
        review_status: 'ACTIVE'
      } as PublishedPlantSqlRow
    })

    const response = await fetch(`${baseUrl}${routePrefix}pid_monstera_001`)

    expect(response.status).toBe(okStatus)
    expect(await response.json()).toEqual({
      data: {
        plantIdentityRef: 'pid_monstera_001',
        displayNameZh: '龟背竹',
        identityKind: 'taxon',
        acceptedScientificName: 'Monstera deliciosa Liebm.',
        taxonRank: 'species'
      }
    })
    expect(queried).toEqual(['pid_monstera_001'])
  })

  test('不可见身份统一返回 404 NOT_FOUND', async () => {
    const baseUrl = await startService(async () => null)

    const response = await fetch(`${baseUrl}${routePrefix}pid_quarantined_001`)

    expect(response.status).toBe(notFoundStatus)
    expect(await response.json()).toEqual({
      error: { type: 'NOT_FOUND', message: '植物不存在或尚未发布' }
    })
  })

  test('路径参数长度或字符不合法时返回 400，且不访问数据库', async () => {
    const queried: string[] = []
    const baseUrl = await startService(async ref => {
      queried.push(ref)
      return publishedRow
    })

    for (const invalidRef of [
      'pid_1',
      'p'.repeat(Number('101')),
      'pid%20space01',
      "pid'or'1'='1"
    ]) {
      const response = await fetch(`${baseUrl}${routePrefix}${invalidRef}`)
      expect(response.status).toBe(badRequestStatus)
      expect(await response.json()).toEqual({
        error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' }
      })
    }
    expect(queried).toEqual([])
  })

  test('长度恰为 8 与 100 的合法引用可以进入查询', async () => {
    const queried: string[] = []
    const baseUrl = await startService(async ref => {
      queried.push(ref)
      return null
    })
    const shortest = 'pid_0001'
    const longest = `pid_${'a'.repeat(Number('96'))}`

    expect((await fetch(`${baseUrl}${routePrefix}${shortest}`)).status).toBe(notFoundStatus)
    expect((await fetch(`${baseUrl}${routePrefix}${longest}`)).status).toBe(notFoundStatus)
    expect(queried).toEqual([shortest, longest])
  })

  test('public 路由忽略 Authorization 头，结果与匿名请求一致', async () => {
    const baseUrl = await startService(async () => publishedRow)

    const anonymous = await fetch(`${baseUrl}${routePrefix}pid_monstera_001`)
    const withToken = await fetch(`${baseUrl}${routePrefix}pid_monstera_001`, {
      headers: { authorization: 'Bearer should-be-ignored-token' }
    })

    expect(withToken.status).toBe(anonymous.status)
    expect(await withToken.json()).toEqual(await anonymous.json())
  })

  test('数据库异常只返回泛化 500，不泄露 SQL 或连接信息', async () => {
    const baseUrl = await startService(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.8:3306 user='qhz' password='hunter2'")
    })

    const response = await fetch(`${baseUrl}${routePrefix}pid_monstera_001`)
    const text = await response.text()

    expect(response.status).toBe(internalErrorStatus)
    expect(JSON.parse(text)).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
    expect(text).not.toMatch(/hunter2|10\.0\.0\.8|ECONNREFUSED/u)
  })

  test('数据库返回合同外的枚举值时失败关闭为 500，不把脏数据公开', async () => {
    const baseUrl = await startService(async () => ({
      ...publishedRow,
      taxon_rank: 'unknown' as PublishedPlantSqlRow['taxon_rank']
    }))

    const response = await fetch(`${baseUrl}${routePrefix}pid_monstera_001`)

    expect(response.status).toBe(internalErrorStatus)
  })

  test('审计事件只含结果类别与稳定错误类型', async () => {
    const auditEvents: RequestChainAuditEvent[] = []
    const baseUrl = await startService(
      async ref => (ref === 'pid_monstera_001' ? publishedRow : null),
      auditEvents
    )

    await fetch(`${baseUrl}${routePrefix}pid_monstera_001`)
    await fetch(`${baseUrl}${routePrefix}pid_missing_0001`)
    await new Promise(resolve => setTimeout(resolve, Number('20')))

    expect(auditEvents).toEqual([
      { outcome: 'allowed' },
      { outcome: 'denied', errorType: 'NOT_FOUND' }
    ])
  })
})
