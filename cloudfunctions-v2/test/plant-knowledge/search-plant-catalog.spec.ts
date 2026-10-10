import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test } from 'vitest'
import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createPlantKnowledgeServer } from '../../src/plant-knowledge/http/server.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

const route = '/api/v2/plant-knowledge/catalog/search'
type CatalogBody = { data: { items: Array<{ plantIdentityRef?: string }>; truncated: boolean } }
const row = {
  taxon_id: 'catalog:monstera',
  preferred_display_name: '龟背竹',
  scientific_name: 'Monstera deliciosa',
  taxon_rank: 'species',
  taxonomic_status: 'accepted',
  is_selectable: 1,
  has_encyclopedia: 1,
  has_image: 0,
  public_identity_ref: null,
  id: 345,
  target_identity_internal_id: 678,
  source_record_ref: '不得公开'
}
let server: Server | undefined
let calls: Array<{ sql: string; parameters: readonly (string | number | null)[] }> = []

/** 真实 HTTP 与请求链；仅替换 MySQL 边界，不证明 SQL 匹配或生产部署。 */
async function start(
  rows: readonly Record<string, unknown>[] = [row],
  failure?: Error
): Promise<string> {
  calls = []
  const connection: Mysql2QueryConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    destroy: () => undefined,
    execute: async () => ({ affectedRows: 0, insertId: 0 }),
    query: async (sql, parameters) => {
      calls.push({ sql, parameters })
      if (failure) {
        throw failure
      }
      return rows
    }
  }
  server = createPlantKnowledgeServer({ ...fixturePolicyPorts(),
    connectionSource: { getConnection: async () => connection },
    writeAudit: () => undefined
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
afterEach(async () => {
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()))
  }
  server = undefined
})

/**
 * Expected：冻结 plant-catalog-search/v1（OV 已核验）及批准计划 §3.2。
 * L3 / unit_fake：真实 node:http → 路由 → 请求链 → Repository；只替换数据库。
 * 真实查询语义、排序与去重另由 MySQL 验收；不覆盖 CloudBase 网关。
 */
describe('植物目录公开搜索合同', () => {
  test('未准入身份的目录仍可读，公开字段不含内部 ID', async () => {
    const base = await start()
    const response = await fetch(`${base}${route}?q=${encodeURIComponent('龟背竹')}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        items: [
          {
            catalogTaxonRef: 'catalog:monstera',
            displayName: '龟背竹',
            scientificName: 'Monstera deliciosa',
            taxonRank: 'species',
            taxonomicStatus: 'accepted',
            selectable: true,
            hasEncyclopedia: true,
            hasImage: false
          }
        ],
        truncated: false
      }
    })
  })
  test('只附带 Repository 确认的公开身份引用', async () => {
    const base = await start([{ ...row, public_identity_ref: 'pid_published' }])
    const response = await fetch(`${base}${route}?q=Monstera`)
    expect(((await response.json()) as CatalogBody).data.items[0]!.plantIdentityRef).toBe(
      'pid_published'
    )
  })
  test('trim 与 NFC 规范化发生在查询之前，64 个码点有效', async () => {
    const base = await start([])
    for (const q of ['  Cafe\u0301  ', '🌿'.repeat(64)]) {
      expect((await fetch(`${base}${route}?q=${encodeURIComponent(q)}`)).status).toBe(200)
    }
    expect(calls[0]!.parameters).toContain('Café')
  })
  test('缺省 limit 为 10，向前读取一条判定 truncated', async () => {
    const base = await start(
      Array.from({ length: 11 }, (_, index) => ({ ...row, taxon_id: `catalog:${index}` }))
    )
    const response = await fetch(`${base}${route}?q=Monstera`)
    const body = (await response.json()) as CatalogBody
    expect(response.status).toBe(200)
    expect(body.data.items).toHaveLength(10)
    expect(body.data.truncated).toBe(true)
    expect(calls[0]!.parameters).toContain(11)
  })
  test('limit 支持 1 与 20，并按选定上限返回', async () => {
    const base = await start([row, { ...row, taxon_id: 'catalog:other' }])
    const response = await fetch(`${base}${route}?q=Monstera&limit=1`)
    expect(((await response.json()) as CatalogBody).data).toMatchObject({
      items: [expect.any(Object)],
      truncated: true
    })
    expect((await fetch(`${base}${route}?q=Monstera&limit=20`)).status).toBe(200)
  })
  test.each([
    '',
    '?q=',
    '?q=%20',
    `?q=${'a'.repeat(65)}`,
    '?q=a&limit=0',
    '?q=a&limit=21',
    '?q=a&limit=1.5',
    '?q=a&limit=',
    '?q=a&limit=no',
    '?q=a&limit=1e1'
  ])('非法查询 %s 在访问数据库前拒绝', async query => {
    const base = await start()
    const response = await fetch(`${base}${route}${query}`)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' }
    })
    expect(calls).toHaveLength(0)
  })
  test('空结果合法，公开只读忽略无效 Authorization', async () => {
    const base = await start([])
    const response = await fetch(`${base}${route}?q=NoMatch`, {
      headers: { authorization: 'Bearer invalid' }
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { items: [], truncated: false } })
  })
  test('数据库失败不披露 SQL、凭证或内部状态', async () => {
    const base = await start([], new Error('SQL password=secret host=private'))
    const response = await fetch(`${base}${route}?q=Monstera`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
  })
  test('前缀召回直接比较裸 normalized_term 列，保证可走 idx_search_term_exact', async () => {
    const base = await start([])
    expect((await fetch(`${base}${route}?q=${encodeURIComponent('绿萝')}`)).status).toBe(200)
    const sql = calls[0]!.sql
    // 列侧包 COLLATE 会变成表达式，测试库 172 万词条上退化为全量嵌套扫描并超时。
    expect(sql).toMatch(/AND term\.normalized_term LIKE /u)
    expect(sql).not.toMatch(/term\.normalized_term\s+COLLATE/u)
    expect(calls[0]!.parameters).toEqual(['绿萝', '绿萝%', 11])
  })
  test('损坏的布尔标志失败关闭，不把字符串 false 当成 true', async () => {
    const base = await start([{ ...row, has_image: 'false' }])
    expect((await fetch(`${base}${route}?q=Monstera`)).status).toBe(500)
  })
})
