import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test } from 'vitest'
import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createPlantKnowledgeServer } from '../../src/plant-knowledge/http/server.js'

// Happy 的名称、分类与别名来自测试库龟背竹实际展示行；可空列用 null 覆盖合同空值路径。
const row = {
  taxon_id: 'https://tropicals.cn/species/monstera-deliciosa',
  name: '龟背竹',
  scientific_name: 'Monstera deliciosa',
  taxon_rank: 'species',
  family: 'Araceae',
  genus: 'Monstera',
  order_name: null,
  additional_names_json: ['蓬莱蕉', '铁丝兰', '电线草'],
  description: null,
  bio_morphology: null,
  bio_distribution: null,
  bio_varieties: null,
  bio_habitat: null,
  bio_propagation: null,
  bio_commercial: null,
  bio_pests: null,
  care_difficulty: null,
  temperature_range: null,
  humidity_range: null,
  light_requirement: null,
  cover_image_ref: 'https://unreviewed.example/image.jpg',
  water_frequency_source_json: { internal: true },
  id: 1
}
let server: Server | undefined
let parameters: readonly (string | number | null)[] = []
async function start(
  rows: readonly Record<string, unknown>[] = [row],
  failure?: Error
): Promise<string> {
  const connection: Mysql2QueryConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    destroy: () => undefined,
    execute: async () => ({ affectedRows: 0, insertId: 0 }),
    query: async (_sql, bound) => {
      parameters = bound
      if (failure) {
        throw failure
      }
      return rows
    }
  }
  server = createPlantKnowledgeServer({
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
  parameters = []
})
const path = '/api/v2/plant-knowledge/encyclopedia/monstera-deliciosa'
const reference = encodeURIComponent(row.taxon_id)
/** Expected：plant-encyclopedia-read/v1；L3 / unit_fake。真实 HTTP、路由、请求链与 Repository，仅替换 MySQL。 */
describe('独立 SQL 百科公开读取', () => {
  test('展示白名单、空值和署名完整，无内部字段、无未经许可图片', async () => {
    const base = await start()
    const response = await fetch(`${base}${path}?catalogTaxonRef=${reference}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        catalogTaxonRef: row.taxon_id,
        scientificNameSlug: 'monstera-deliciosa',
        displayName: '龟背竹',
        scientificName: 'Monstera deliciosa',
        additionalNames: ['蓬莱蕉', '铁丝兰', '电线草'],
        taxonomy: { rank: 'species', order: null, family: 'Araceae', genus: 'Monstera' },
        description: null,
        sections: {
          morphology: null,
          distribution: null,
          varieties: null,
          habitat: null,
          propagation: null,
          commercial: null,
          pests: null
        },
        careDisplay: {
          difficulty: null,
          temperatureRange: null,
          humidityRange: null,
          lightRequirement: null
        },
        coverImage: null,
        attribution: {
          name: 'Tropicals.cn',
          sourceUrl: 'https://tropicals.cn/datasets',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
        }
      }
    })
    expect(parameters).toEqual([row.taxon_id])
  })
  test.each(['', '?catalogTaxonRef=', `?catalogTaxonRef=${'a'.repeat(513)}`])(
    '非法引用 %s 在 SQL 前拒绝',
    async query => {
      const base = await start()
      expect((await fetch(`${base}${path}${query}`)).status).toBe(400)
      expect(parameters).toEqual([])
    }
  )
  test('路径 slug 必须与该目录百科学名一致', async () => {
    const base = await start()
    expect(
      (
        await fetch(
          `${base}/api/v2/plant-knowledge/encyclopedia/not-monstera?catalogTaxonRef=${reference}`
        )
      ).status
    ).toBe(400)
  })
  test('学名引号和标点移除后才折叠空白，不要求内部身份', async () => {
    const base = await start([
      { ...row, scientific_name: "Monstera deliciosa 'Thai Constellation'" }
    ])
    expect(
      (await fetch(`${base}${path}-thai-constellation?catalogTaxonRef=${reference}`)).status
    ).toBe(200)
  })
  test('无百科行返回 404，数据库失败返回泛化 500', async () => {
    const base = await start([])
    const response = await fetch(`${base}${path}?catalogTaxonRef=${reference}`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { type: 'NOT_FOUND', message: '植物百科不存在' }
    })
  })
  test('损坏别名 JSON 不进入响应', async () => {
    const base = await start([{ ...row, additional_names_json: { raw: 'bad' } }])
    expect((await fetch(`${base}${path}?catalogTaxonRef=${reference}`)).status).toBe(500)
  })
  test('SQL 失败不暴露敏感错误', async () => {
    const base = await start([], new Error('SQL credential hidden'))
    const response = await fetch(`${base}${path}?catalogTaxonRef=${reference}`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
  })
})
