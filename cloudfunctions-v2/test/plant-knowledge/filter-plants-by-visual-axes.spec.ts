import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import {
  filterPlantsByVisualAxesRoute,
  listPlantVisualAxesRoute
} from '../../src/plant-knowledge/http/routes.js'
import {
  plantKnowledgePublicSearchRulesV1,
  plantKnowledgePublicSearchRulesV2,
  plantKnowledgePublicSearchV2ReleaseVersion
} from '../support/business-policy-fixtures.js'
import { findProjectRoot } from '../support/project-root.js'
import { visualFilterSourceKey } from '../../src/plant-knowledge/domain/visual-filter-index.js'
import {
  axesPath,
  bitRowsFor,
  catalogRows,
  fakeState,
  filterPath,
  filterSqlMarker,
  monstera,
  plantRow,
  readyFilterSetId,
  start,
  stop
} from './support/visual-axis-fake.js'

/**
 * Expected：docs/backend-v2/contracts/plant-visual-axis-filter.md（plant-visual-axis-filter/v1，用户 2026-10-10 审定）。
 * 层次：L3 / unit_fake。真实 node:http、冻结路由、请求链、Repository 映射；仅替换 MySQL 连接与策略快照端口。
 * 本层证明：参数校验与 400、策略 503、响应白名单脱敏、visualAxes 映射、limit+1 翻页信号与游标往返。
 * 不证明：SQL 语义（同轴 OR / 跨轴 AND、缺值不命中、可搜索过滤、排序）——见 test/e2e/plant-visual-axis-filter.mysql.spec.ts。
 * 枚举行与百科行照抄测试库 qinghuazhi_v2_test 只读抽样（2026-10-10）。
 */

afterEach(stop)

const filterCall = () => fakeState.calls.find(call => call.sql.includes(filterSqlMarker))
const validation = { error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' } }

describe('三轴筛选路由冻结', () => {
  test('路由常量与 route-registry.json 登记一致', () => {
    const registry = JSON.parse(
      fs.readFileSync(
        path.join(findProjectRoot(), 'docs/backend-v2/api/route-registry.json'),
        'utf8'
      )
    ) as { routes: Array<{ method: string; path: string; operationId: string; security: string }> }
    for (const route of [listPlantVisualAxesRoute, filterPlantsByVisualAxesRoute]) {
      const frozen = registry.routes.find(item => item.operationId === route.operationId)
      expect(route).toEqual({
        method: frozen?.method,
        path: frozen?.path,
        operationId: frozen?.operationId,
        security: frozen?.security
      })
    }
  })
})

describe('visual-filter 参数校验（400 先于业务查询）', () => {
  test.each([
    ['三轴都不传', ''],
    ['仅传 limit', '?limit=5'],
    ['空串', '?leafShape='],
    ['空段', '?leafShape=HEART,,ELLIPTIC'],
    ['尾随逗号', '?leafShape=HEART,'],
    ['小写代码', '?leafShape=heart'],
    ['含空格', '?leafShape=HEART%20'],
    ['超过 64 字符', `?leafShape=${'A'.repeat(65)}`],
    ['同名参数重复', '?leafShape=HEART&leafShape=ELLIPTIC'],
    ['limit=0', '?leafShape=HEART&limit=0'],
    ['limit=51 超过策略上限', '?leafShape=HEART&limit=51'],
    ['limit 前导零', '?leafShape=HEART&limit=020'],
    ['limit 小数', '?leafShape=HEART&limit=1.5'],
    ['limit 负数', '?leafShape=HEART&limit=-1'],
    ['limit 空串', '?leafShape=HEART&limit='],
    ['游标不是 base64url', '?leafShape=HEART&cursor=%21%21%21'],
    ['游标带填充符', `?leafShape=HEART&cursor=${Buffer.from('ab').toString('base64')}`],
    ['游标解码为空', '?leafShape=HEART&cursor='],
    [
      '游标解码超过 512 码点',
      `?leafShape=HEART&cursor=${Buffer.from('竹'.repeat(513)).toString('base64url')}`
    ],
    [
      '游标解码不是合法 UTF-8',
      `?leafShape=HEART&cursor=${Buffer.from([0xff, 0xfe]).toString('base64url')}`
    ]
  ])('%s → 400，不查询植物数据', async (_label, query) => {
    const base = await start()
    const response = await fetch(`${base}${filterPath}${query}`)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(validation)
    expect(filterCall()).toBeUndefined()
  })

  test.each([
    ['叶型未知值', '?leafShape=HEART,SQUARE'],
    ['株型使用叶型的值', '?growthForm=HEART'],
    ['未准入轴的值（叶缘 ENTIRE 当叶面）', '?leafSurface=ENTIRE']
  ])('%s → 400（按生效枚举校验），不执行筛选主查询', async (_label, query) => {
    const base = await start()
    const response = await fetch(`${base}${filterPath}${query}`)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(validation)
    const catalogCall = fakeState.calls.find(call =>
      call.sql.includes('FROM plant_visual_axis_values')
    )
    expect(catalogCall?.parameters).toEqual(expect.arrayContaining(['v1']))
    expect(filterCall()).toBeUndefined()
  })

  test('未知查询参数忽略；同参数内重复值去重', async () => {
    const base = await start()
    const response = await fetch(`${base}${filterPath}?leafShape=HEART,HEART,ELLIPTIC&unknown=1`)
    expect(response.status).toBe(200)
    const parameters = filterCall()?.parameters ?? []
    // 生效枚举顺序：HEART 位 0、ELLIPTIC 位 1 → 同轴 OR 掩码 3（预计算索引，修订 1）。
    expect(parameters).toContain('3')
  })
})

describe('visual-filter 策略快照', () => {
  test.each([
    ['策略不可用', async () => null],
    [
      '活动发布仍为 v1（无三轴字段）',
      async () => ({
        rules: plantKnowledgePublicSearchRulesV1(),
        releaseVersion: 'plant-knowledge-public-search/v1.0.0'
      })
    ],
    [
      '读取抛错',
      async () => {
        throw new Error('policy table down')
      }
    ]
  ])('%s → 503，不查询任何数据', async (_label, snapshot) => {
    const base = await start({ snapshot })
    for (const target of [`${filterPath}?leafShape=HEART`, axesPath]) {
      const response = await fetch(`${base}${target}`)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: { type: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' }
      })
    }
    expect(fakeState.calls).toEqual([])
  })

  test('策略不可用时 503 先于参数校验（三轴全空也 503）', async () => {
    const base = await start({ snapshot: async () => null })
    expect((await fetch(`${base}${filterPath}`)).status).toBe(503)
  })

  test('limit 省略取策略默认 20：主查询多取 1 条（21）；limit=50 取 51', async () => {
    const base = await start()
    await fetch(`${base}${filterPath}?leafShape=HEART`)
    expect(filterCall()?.parameters.at(-1)).toBe(21)
    await fetch(`${base}${filterPath}?leafShape=HEART&limit=50`)
    expect(
      fakeState.calls
        .filter(call => call.sql.includes(filterSqlMarker))
        .at(-1)
        ?.parameters.at(-1)
    ).toBe(51)
  })

  test('按策略 visualAxisSources 的 source_key 定位已就绪索引（三轴均 visual-axis-all-v1），主查询只读该索引', async () => {
    const base = await start()
    await fetch(`${base}${filterPath}?leafShape=HEART&growthForm=VINING&leafSurface=GLOSSY`)
    const sources = plantKnowledgePublicSearchRulesV2().visualAxisSources!
    expect([sources.LEAF_SHAPE, sources.GROWTH_FORM, sources.LEAF_SURFACE]).toEqual([
      'visual-axis-all-v1',
      'visual-axis-all-v1',
      'visual-axis-all-v1'
    ])
    const setCall = fakeState.calls.find(call => call.sql.includes('FROM plant_visual_filter_sets'))
    expect(setCall?.sql).toContain("status = 'ready'")
    expect(setCall?.parameters).toEqual([visualFilterSourceKey(sources)])
    const parameters = filterCall()?.parameters ?? []
    expect(parameters[0]).toBe(readyFilterSetId)
    // 叶型 HEART 位 0 → 1；株型 VINING 位 1 → 2；叶面 GLOSSY 位 0 → 1。
    expect(parameters.slice(1, 4)).toEqual(['1', '2', '1'])
    expect(filterCall()?.sql).not.toContain('plant_visual_axis_results')
  })

  test('策略指定版本尚无已就绪索引 → 503，不执行主查询', async () => {
    const base = await start({ filterSets: [] })
    const response = await fetch(`${base}${filterPath}?leafShape=HEART`)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: { type: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' }
    })
    expect(filterCall()).toBeUndefined()
  })

  test('值位表缺少某个生效枚举值（索引过期）→ 503，不执行主查询', async () => {
    const base = await start({
      bits: bitRowsFor(catalogRows).filter(row => row.value_code !== 'ELLIPTIC')
    })
    expect((await fetch(`${base}${filterPath}?leafShape=ELLIPTIC`)).status).toBe(503)
    expect(filterCall()).toBeUndefined()
  })
})

describe('visual-filter 响应', () => {
  test('白名单字段、封面 DTO、三轴取值按枚举排序且剔除目录外代码，顶层带策略版本', async () => {
    const base = await start()
    const response = await fetch(`${base}${filterPath}?leafShape=HEART`)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      data: {
        policyReleaseVersion: plantKnowledgePublicSearchV2ReleaseVersion,
        items: [
          {
            catalogTaxonRef: monstera,
            displayName: '龟背竹',
            scientificName: 'Monstera deliciosa',
            coverImage: {
              url: 'https://cdn.tropicals.cn/img/2026/04/95279010eb36.webp',
              source: {
                provider: 'Tropicals.cn',
                pageUrl: monstera,
                sourceName: null,
                originalUrl: null,
                creator: null,
                license: null,
                licenseUrl: null,
                attribution: null
              }
            },
            visualAxes: {
              leafShape: ['HEART', 'LOBED'],
              growthForm: ['VINING'],
              leafSurface: ['GLOSSY', 'LEATHERY']
            }
          }
        ],
        nextCursor: null
      }
    })
    for (const forbidden of [
      'encyclopedia',
      'EXTRACTED',
      'HIGH',
      '幼叶呈心形',
      'USER_ACCEPTED',
      'PENDING',
      'NOT_IN_CATALOG',
      'visual-axis',
      '"v1"'
    ]) {
      expect(text).not.toContain(forbidden)
    }
  })

  test('某轴无取值行或只剩目录外代码 → 该轴为 null（不补齐）', async () => {
    const base = await start({
      axisRows: [
        { encyclopedia_internal_id: 1, axis_code: 'LEAF_SHAPE', values_json: ['HEART'] },
        { encyclopedia_internal_id: 1, axis_code: 'GROWTH_FORM', values_json: ['NOT_IN_CATALOG'] }
      ]
    })
    const body = (await (await fetch(`${base}${filterPath}?leafShape=HEART`)).json()) as {
      data: { items: Array<{ visualAxes: unknown }> }
    }
    expect(body.data.items[0]?.visualAxes).toEqual({
      leafShape: ['HEART'],
      growthForm: null,
      leafSurface: null
    })
  })

  test('取值查询只按命中植物的内部 id 与策略版本读取 EXTRACTED 行', async () => {
    const base = await start()
    await fetch(`${base}${filterPath}?leafShape=HEART`)
    const valuesCall = fakeState.calls.find(
      call =>
        !call.sql.includes(filterSqlMarker) && call.sql.includes('FROM plant_visual_axis_results')
    )
    expect(valuesCall?.sql).toContain("status = 'EXTRACTED'")
    expect(valuesCall?.parameters).toEqual(expect.arrayContaining([1, 'visual-axis-all-v1']))
  })

  test('查到 limit+1 行时返回前 limit 项与 nextCursor；携带游标翻页时主查询从该 taxon 之后开始', async () => {
    const rows = ['a', 'b', 'c'].map((suffix, index) =>
      plantRow(`https://tropicals.cn/species/${suffix}`, index + 1)
    )
    const base = await start({ pageRows: rows, axisRows: [] })
    const first = (await (await fetch(`${base}${filterPath}?leafShape=HEART&limit=2`)).json()) as {
      data: { items: Array<{ catalogTaxonRef: string }>; nextCursor: string | null }
    }
    expect(first.data.items.map(item => item.catalogTaxonRef)).toEqual([
      'https://tropicals.cn/species/a',
      'https://tropicals.cn/species/b'
    ])
    expect(typeof first.data.nextCursor).toBe('string')
    expect(first.data.nextCursor).not.toContain('tropicals.cn')
    await fetch(`${base}${filterPath}?leafShape=HEART&limit=2&cursor=${first.data.nextCursor}`)
    const parameters =
      fakeState.calls.filter(call => call.sql.includes(filterSqlMarker)).at(-1)?.parameters ?? []
    expect(parameters).toContain('https://tropicals.cn/species/b')
    expect(parameters.at(-1)).toBe(3)
  })

  test('百科行损坏（name 缺失）→ 500，不泄露内部信息', async () => {
    const base = await start({ pageRows: [plantRow(monstera, 1, { name: null })] })
    const response = await fetch(`${base}${filterPath}?leafShape=HEART`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
  })

  test('SQL 失败 → 500 泛化', async () => {
    const base = await start({ failure: new Error('ER_ACCESS_DENIED password=hidden') })
    const response = await fetch(`${base}${filterPath}?leafShape=HEART`)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('password')
  })
})
