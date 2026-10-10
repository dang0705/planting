import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test } from 'vitest'

import type { MysqlConnectionPoolPort } from '../../src/foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createPlantKnowledgeServer } from '../../src/plant-knowledge/http/server.js'
import type { PublishedPlantSqlRow } from '../../src/plant-knowledge/repository/mysql-published-plant-repository.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

const okStatus = 200
const badRequestStatus = 400
const internalErrorStatus = 500
const ephemeralPort = 0
const searchPath = '/api/v2/plant-knowledge/search'
const zero = 0
const one = 1
const overLimitCodePointCount = 65

const publishedRows: readonly PublishedPlantSqlRow[] = [
  {
    public_identity_ref: 'pid_search_monstera_001',
    display_name_zh: '龟背竹',
    identity_kind: 'taxon',
    accepted_scientific_name: 'Monstera deliciosa Liebm.',
    taxon_rank: 'species'
  }
]

type FakeDatabase = {
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  readonly queryCount: () => number
}

/** 只替换 MySQL 边界；HTTP 服务、路由分发和固定请求链使用真实实现。 */
function createFakeDatabase(
  rows: readonly Record<string, unknown>[] = publishedRows,
  failure?: Error
): FakeDatabase {
  let currentQueryCount = 0
  const connection: Mysql2QueryConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    destroy: () => undefined,
    query: async () => {
      currentQueryCount += one
      if (failure) {
        throw failure
      }
      return rows
    },
    execute: async () => ({ affectedRows: 0, insertId: 0 })
  }
  return {
    connectionSource: { getConnection: async () => connection },
    queryCount: () => currentQueryCount
  }
}

let server: Server | undefined

/** 挂载真实 plant-knowledge HTTP 服务，仅替换 Repository 下方的 MySQL 连接。 */
async function startService(database: FakeDatabase): Promise<string> {
  server = createPlantKnowledgeServer({
    ...fixturePolicyPorts(),
    connectionSource: database.connectionSource,
    writeAudit: () => undefined
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
 * Expected 来源：plant-knowledge-public-search/v1 §1–§5（q 校验、搜索响应封装、五字段 DTO、泛化错误）与
 * plant-knowledge-public-read/v1 §2（唯一允许的身份字段）。层次：L3 / unit_fake。真实路径：node:http →
 * plant-knowledge HTTP 服务 → 冻结路由分发 → 固定请求链 → 搜索处理器；只替换 MySQL 连接，SQL 与发布准入
 * 由 `test/e2e/get-published-plant-search.mysql.spec.ts` 的真实 MySQL 测试覆盖。不覆盖 CloudBase 网关。
 */
describe('GET /api/v2/plant-knowledge/search', () => {
  test('命中已发布身份时返回 items、truncated 和严格五字段 DTO', async () => {
    const database = createFakeDatabase()
    const baseUrl = await startService(database)

    const response = await fetch(`${baseUrl}${searchPath}?q=${encodeURIComponent('Monstera')}`)

    expect(response.status).toBe(okStatus)
    expect(await response.json()).toEqual({
      data: {
        items: [
          {
            plantIdentityRef: 'pid_search_monstera_001',
            displayNameZh: '龟背竹',
            identityKind: 'taxon',
            acceptedScientificName: 'Monstera deliciosa Liebm.',
            taxonRank: 'species'
          }
        ],
        truncated: false
      }
    })
    expect(database.queryCount()).toBe(one)
  })

  test('空词或超过 64 个 Unicode 码点的 q 返回 400 且不查询数据库', async () => {
    const database = createFakeDatabase()
    const baseUrl = await startService(database)

    const invalidRequests = [
      `${searchPath}?q=`,
      `${searchPath}?q=${encodeURIComponent('🌿'.repeat(overLimitCodePointCount))}`,
      searchPath
    ]
    for (const requestPath of invalidRequests) {
      const response = await fetch(`${baseUrl}${requestPath}`)
      expect(response.status).toBe(badRequestStatus)
      expect(await response.json()).toEqual({
        error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' }
      })
    }
    expect(database.queryCount()).toBe(zero)
  })

  test('公开搜索忽略 Authorization 头，不改变公开结果', async () => {
    const database = createFakeDatabase()
    const baseUrl = await startService(database)
    const searchUrl = `${baseUrl}${searchPath}?q=${encodeURIComponent('Monstera')}`

    const anonymousResponse = await fetch(searchUrl)
    const withAuthorizationResponse = await fetch(searchUrl, {
      headers: { authorization: 'Bearer ignored-public-search-token' }
    })

    expect(anonymousResponse.status).toBe(okStatus)
    expect(withAuthorizationResponse.status).toBe(anonymousResponse.status)
    expect(await withAuthorizationResponse.json()).toEqual(await anonymousResponse.json())
  })

  test('数据库失败只返回脱敏的 500 INTERNAL_ERROR', async () => {
    const database = createFakeDatabase([], new Error('SQL failed at 10.0.0.8:3306'))
    const baseUrl = await startService(database)

    const response = await fetch(`${baseUrl}${searchPath}?q=${encodeURIComponent('Monstera')}`)
    const responseText = await response.text()

    expect(response.status).toBe(internalErrorStatus)
    expect(JSON.parse(responseText)).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
    expect(responseText).not.toMatch(/10\.0\.0\.8|SQL failed/u)
  })

  test('已发布数据枚举损坏时只返回脱敏的 500 INTERNAL_ERROR', async () => {
    const database = createFakeDatabase([
      {
        ...publishedRows[zero],
        identity_kind: 'unreviewed_internal_kind'
      }
    ])
    const baseUrl = await startService(database)

    const response = await fetch(`${baseUrl}${searchPath}?q=${encodeURIComponent('Monstera')}`)
    const responseText = await response.text()

    expect(response.status).toBe(internalErrorStatus)
    expect(JSON.parse(responseText)).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
    expect(responseText).not.toMatch(/unreviewed_internal_kind|已发布植物数据/u)
  })
})
