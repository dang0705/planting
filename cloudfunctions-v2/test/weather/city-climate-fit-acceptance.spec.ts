import { afterEach, describe, expect, test } from 'vitest'

import {
  caryotaTaxon,
  chongqingLegacyProfileRow,
  chongqingProfileRow,
  fagraeaTaxon,
  fakeState,
  fatsiaTaxon,
  fitRow,
  policy,
  recommendationSqlMarker,
  start,
  stop,
  tables,
  type FakeRow as Row
} from './support/city-climate-fake.js'

/**
 * E02 z8v0kmuqv5 验收补充矩阵。
 *
 * Expected 来源（独立于当前实现）：
 * - 合同 docs/backend-v2/contracts/weather-city-climate-fit.md（weather-city-climate-fit/v2）：
 *   入口参数范围、`top` 默认 10、plantId 为 taxon_id、错误码与文案、DTO 字段表、
 *   「策略版本固定读取 v0-city-outdoor」、「行损坏 → 500」、riskFlags 非法 JSON 视为 []。
 * - ClickUp 票 z8v0kmuqv5：确定性排序、公开脱敏、缺失与损坏、profiles 策略版本一致性、失败恢复。
 * - 测试库只读核验的真实表结构：city_climate_profiles 唯一键为
 *   (city_code, window_start, window_end, policy_version)，同城可并存多个策略版本行；
 *   两表均含 id 主键、created_at/updated_at、profile_json/detail_json 等内部列；
 *   overall 同分组真实存在（315 组），DECIMAL/BIGINT 经 mysql2 bigNumberStrings 以字符串返回。
 *
 * 层次：L3 / unit_fake。真实 node:http、冻结路由、请求链、Repository 与映射；
 * 仅替换 MySQL 连接（按「绑定参数等值匹配」模拟 WHERE 的内存行表）。
 * 不证明：真实 SQL 排序与索引行为（另由测试库只读查询核验）、网关与部署。
 */

const profileKeys = [
  'cityCode',
  'dailyStats',
  'dayCount',
  'displayName',
  'lat',
  'lon',
  'monthly',
  'policyVersion',
  'source',
  'timezone',
  'window'
]
const fitKeys = [
  'cityCode',
  'humidityMatch',
  'lightMatch',
  'overall',
  'plantId',
  'policyVersion',
  'primaryBottleneck',
  'riskFlags',
  'temperatureMatch'
]
const recommendationKeys = [
  ...fitKeys,
  'careDifficulty',
  'coverImage',
  'name',
  'scientificName'
].sort()

/** 八角金盘 taxon_id 的 URL 编码查询值。 */
const fatsiaQuery = encodeURIComponent(fatsiaTaxon)

afterEach(stop)

describe('weather city climate fit acceptance: 策略版本一致性', () => {
  test('profiles 列表只返回 v0-city-outdoor 剖面，不混入同城旧策略行', async () => {
    const base = await start(tables([chongqingProfileRow, chongqingLegacyProfileRow], []))
    const response = await fetch(`${base}/api/v2/weather/city-climate/profiles`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { items: Array<{ policyVersion: string }> } }
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0]?.policyVersion).toBe(policy)
  })

  test('单城剖面在同城存在旧策略行时仍稳定读取 v0-city-outdoor', async () => {
    const base = await start(tables([chongqingProfileRow, chongqingLegacyProfileRow], []))
    const response = await fetch(`${base}/api/v2/weather/city-climate/profiles/chongqing`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { policyVersion: string; displayName: string } }
    expect(body.data.policyVersion).toBe(policy)
    expect(body.data.displayName).toBe('重庆')
  })

  test('只有旧策略剖面的城市视为剖面不存在', async () => {
    const base = await start(tables([chongqingLegacyProfileRow], []))
    const response = await fetch(`${base}/api/v2/weather/city-climate/profiles/chongqing`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { type: 'NOT_FOUND', message: '城市气候剖面不存在' }
    })
  })

  test('只有旧策略（过期）适配缓存时 fit 返回缓存不存在', async () => {
    const base = await start(
      tables(
        [chongqingProfileRow],
        [fitRow(fatsiaTaxon, '3761', '52.20', { policy_version: 'v-legacy' })]
      )
    )
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=${fatsiaQuery}`
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { type: 'NOT_FOUND', message: '城市气候适配缓存不存在' }
    })
  })
})

describe('weather city climate fit acceptance: fit 参数', () => {
  test('plantId 按 taxon_id 精确查询，响应 plantId 为 taxon_id 字符串', async () => {
    const base = await start(tables([chongqingProfileRow], [fitRow(fatsiaTaxon, '3761', '52.20')]))
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=${fatsiaQuery}`
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { fit: { plantId: unknown } } }
    expect(body.data.fit.plantId).toBe(fatsiaTaxon)
    expect(fakeState.queries.at(-1)?.parameters).toEqual(['chongqing', fatsiaTaxon, policy])
  })

  test('旧的百科内部数字 id 不再定位植物，返回缓存不存在', async () => {
    const base = await start(tables([chongqingProfileRow], [fitRow(fatsiaTaxon, '3761', '52.20')]))
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=3761`
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { type: 'NOT_FOUND', message: '城市气候适配缓存不存在' }
    })
    expect(fakeState.queries.at(-1)?.parameters).toEqual(['chongqing', '3761', policy])
  })

  test.each([
    ['首尾空白', ` ${fatsiaTaxon} `],
    ['大小写不同', fatsiaTaxon.toUpperCase()]
  ])(
    'plantId 与 taxon_id 仅%s时不命中（模拟忽略大小写与尾随空白的排序规则仍返回该行）',
    async (_label, requested) => {
      // 测试库 utf8mb4 *_ci 排序规则下 `e.taxon_id = ?` 可能命中仅大小写/空白不同的行。
      const base = await start(async sql =>
        sql.includes('city_climate_profiles')
          ? [chongqingProfileRow]
          : [fitRow(fatsiaTaxon, '3761', '52.20')]
      )
      const response = await fetch(
        `${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=${encodeURIComponent(requested)}`
      )
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: { type: 'NOT_FOUND', message: '城市气候适配缓存不存在' }
      })
      expect(fakeState.queries.at(-1)?.parameters).toEqual(['chongqing', requested, policy])
    }
  )

  test('plantId 恰为 512 个 Unicode 码点时合法', async () => {
    const base = await start(tables([chongqingProfileRow], []))
    const longest = '竹'.repeat(512)
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=${encodeURIComponent(longest)}`
    )
    expect(response.status).toBe(404)
    expect(fakeState.queries.at(-1)?.parameters).toEqual(['chongqing', longest, policy])
  })

  test.each([
    ['缺 plantId', 'cityCode=chongqing'],
    ['缺 cityCode', `plantId=${fatsiaQuery}`],
    ['plantId 为空串', 'cityCode=chongqing&plantId='],
    [
      'plantId 超过 512 个码点',
      `cityCode=chongqing&plantId=${encodeURIComponent('竹'.repeat(513))}`
    ],
    ['仅传已移除的 plant_id 别名', `cityCode=chongqing&plant_id=${fatsiaQuery}`],
    ['仅传已移除的 encyclopedia_id 别名', 'cityCode=chongqing&encyclopedia_id=3761'],
    ['cityCode 过短', 'cityCode=c&plantId=1'],
    ['cityCode 含大写', 'cityCode=ChongQing&plantId=1'],
    ['cityCode 超过 64 位', `cityCode=${'a'.repeat(65)}&plantId=1`]
  ])('%s 时在 SQL 前返回 400', async (_label, query) => {
    const base = await start(async () => {
      throw new Error('should not query')
    })
    const response = await fetch(`${base}/api/v2/weather/city-climate/fit?${query}`)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' }
    })
    expect(fakeState.queries).toEqual([])
  })

  test('城市剖面缺失时 fit 返回剖面不存在且不再查缓存', async () => {
    const base = await start(tables([], [fitRow(fatsiaTaxon, '3761', '52.20')]))
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=${fatsiaQuery}`
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { type: 'NOT_FOUND', message: '城市气候剖面不存在' }
    })
    expect(fakeState.queries.every(item => item.sql.includes('city_climate_profiles'))).toBe(true)
  })
})

describe('weather city climate fit acceptance: recommendations 参数与排序', () => {
  test('top 省略时默认 10', async () => {
    const base = await start(tables([chongqingProfileRow], [], []))
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/recommendations?cityCode=chongqing`
    )
    expect(response.status).toBe(200)
    expect(fakeState.queries.at(-1)?.parameters).toEqual(['chongqing', policy, 10])
  })

  test.each(['1', '50'])('top=%s 边界值合法', async top => {
    const base = await start(tables([chongqingProfileRow], [], []))
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/recommendations?cityCode=chongqing&top=${top}`
    )
    expect(response.status).toBe(200)
    expect(fakeState.queries.at(-1)?.parameters).toEqual(['chongqing', policy, Number(top)])
  })

  test.each([
    ['top=0', 'cityCode=chongqing&top=0'],
    ['top=51', 'cityCode=chongqing&top=51'],
    ['top=-1', 'cityCode=chongqing&top=-1'],
    ['top=1.5', 'cityCode=chongqing&top=1.5'],
    ['top=abc', 'cityCode=chongqing&top=abc'],
    ['top 为空串', 'cityCode=chongqing&top='],
    ['缺 cityCode', 'top=3']
  ])('%s 时在 SQL 前返回 400', async (_label, query) => {
    const base = await start(async () => {
      throw new Error('should not query')
    })
    const response = await fetch(`${base}/api/v2/weather/city-climate/recommendations?${query}`)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' }
    })
    expect(fakeState.queries).toEqual([])
  })

  test('城市剖面缺失时推荐返回剖面不存在且不查推荐', async () => {
    const base = await start(tables([], [], [fitRow(fatsiaTaxon, '3761', '52.20')]))
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/recommendations?cityCode=chongqing&top=3`
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { type: 'NOT_FOUND', message: '城市气候剖面不存在' }
    })
    expect(fakeState.queries.some(item => item.sql.includes(recommendationSqlMarker))).toBe(false)
  })

  test('推荐 SQL 以 overall 降序、plantId（taxon_id）升序作为确定性次序，响应保持该次序', async () => {
    const ordered = [
      fitRow(fatsiaTaxon, '3761', '52.20'),
      fitRow(caryotaTaxon, '72939', '52.10', { name: '鱼尾葵' }),
      fitRow(fagraeaTaxon, '3755', '52.10', { name: '灰莉' })
    ]
    const base = await start(tables([chongqingProfileRow], [], ordered))
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/recommendations?cityCode=chongqing&top=3`
    )
    expect(response.status).toBe(200)
    const sql =
      fakeState.queries.find(item => item.sql.includes(recommendationSqlMarker))?.sql ?? ''
    expect(sql.replace(/\s+/gu, ' ')).toMatch(
      /ORDER BY f\.overall DESC, e\.taxon_id ASC LIMIT \?$/u
    )
    const body = (await response.json()) as {
      data: { count: number; recommendations: Array<{ plantId: string; overall: number }> }
    }
    expect(body.data.count).toBe(3)
    expect(body.data.recommendations.map(item => [item.plantId, item.overall])).toEqual([
      [fatsiaTaxon, 52.2],
      [caryotaTaxon, 52.1],
      [fagraeaTaxon, 52.1]
    ])
  })
})

describe('weather city climate fit acceptance: 公开脱敏与联表', () => {
  test('剖面、fit 与推荐只输出合同字段，不暴露数据库 id（含百科内部 encyclopedia_id）、内部 JSON 或时间戳', async () => {
    const base = await start(
      tables(
        [chongqingProfileRow],
        [fitRow(fatsiaTaxon, '3761', '52.20')],
        [fitRow(fatsiaTaxon, '3761', '52.20')]
      )
    )
    const profile = (await (
      await fetch(`${base}/api/v2/weather/city-climate/profiles/chongqing`)
    ).json()) as { data: Row }
    expect(Object.keys(profile.data).sort()).toEqual(profileKeys)

    const fit = (await (
      await fetch(
        `${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=${fatsiaQuery}`
      )
    ).json()) as { data: { fit: Row; profile: Row } }
    expect(Object.keys(fit.data.fit).sort()).toEqual(fitKeys)
    expect(Object.keys(fit.data.profile).sort()).toEqual(profileKeys)

    const recommendationResponse = await fetch(
      `${base}/api/v2/weather/city-climate/recommendations?cityCode=chongqing&top=1`
    )
    const recommendationText = await recommendationResponse.text()
    const recommendation = JSON.parse(recommendationText) as {
      data: { recommendations: Row[] }
    }
    expect(Object.keys(recommendation.data.recommendations[0] ?? {}).sort()).toEqual(
      recommendationKeys
    )
    expect(fit.data.fit.plantId).toBe(fatsiaTaxon)
    expect(recommendation.data.recommendations[0]?.plantId).toBe(fatsiaTaxon)
    for (const forbidden of [
      '3761',
      '900',
      'detail_json',
      'profile_json',
      'USER_ACCEPTED',
      '2026-10-01'
    ]) {
      expect(recommendationText).not.toContain(forbidden)
    }
  })

  test('DECIMAL 字符串映射为合同 number，plantId 为 taxon_id 字符串', async () => {
    const base = await start(
      tables([chongqingProfileRow], [], [fitRow(caryotaTaxon, '72939', '52.10')])
    )
    const body = (await (
      await fetch(`${base}/api/v2/weather/city-climate/recommendations?cityCode=chongqing&top=1`)
    ).json()) as { data: { recommendations: Row[] } }
    expect(body.data.recommendations[0]).toMatchObject({
      plantId: caryotaTaxon,
      overall: 52.1,
      temperatureMatch: 55,
      humidityMatch: 74.8,
      lightMatch: 41.3
    })
  })

  test('推荐与 fit 均以内连接映射 taxon_id，不再用左连接产出无公开 plantId 的行', async () => {
    const base = await start(
      tables([chongqingProfileRow], [fitRow(fatsiaTaxon, '3761', '52.20')], [])
    )
    await fetch(`${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=${fatsiaQuery}`)
    await fetch(`${base}/api/v2/weather/city-climate/recommendations?cityCode=chongqing&top=1`)
    const cacheSql = fakeState.queries
      .filter(item => item.sql.includes('plant_city_climate_fit_cache'))
      .map(item => item.sql.replace(/\s+/gu, ' '))
    expect(cacheSql).toHaveLength(2)
    for (const sql of cacheSql) {
      expect(sql).not.toContain('LEFT JOIN')
      expect(sql).toContain(
        'JOIN tropicals_species_encyclopedia_ref AS e ON e.id = f.encyclopedia_id'
      )
      expect(sql).not.toMatch(/SELECT[^]*f\.encyclopedia_id[^]*FROM/u)
    }
  })

  test('百科可空展示字段为 null 时如实返回 null', async () => {
    const sparse = fitRow(fatsiaTaxon, '3761', '52.20', {
      scientific_name: null,
      care_difficulty: null
    })
    const base = await start(tables([chongqingProfileRow], [], [sparse]))
    const body = (await (
      await fetch(`${base}/api/v2/weather/city-climate/recommendations?cityCode=chongqing&top=1`)
    ).json()) as { data: { recommendations: Row[] } }
    expect(body.data.recommendations[0]).toMatchObject({
      plantId: fatsiaTaxon,
      overall: 52.2,
      name: '八角金盘',
      scientificName: null,
      careDifficulty: null
    })
  })
})

describe('weather city climate fit acceptance: 缺失、损坏与失败恢复', () => {
  test.each([
    ['非法 JSON 字符串', '{oops'],
    ['非数组 JSON', '{"flag":1}'],
    ['null', null]
  ])('riskFlags 来源为%s时视为 []', async (_label, value) => {
    const base = await start(
      tables(
        [chongqingProfileRow],
        [fitRow(fatsiaTaxon, '3761', '52.20', { risk_flags_json: value })]
      )
    )
    const body = (await (
      await fetch(
        `${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=${fatsiaQuery}`
      )
    ).json()) as { data: { fit: { riskFlags: unknown } } }
    expect(body.data.fit.riskFlags).toEqual([])
  })

  test.each([
    ['display_name 缺失', { display_name: null }],
    ['lat 非数值', { lat: 'north' }],
    ['window_start 缺失', { window_start: null }],
    ['monthly_json 为非法 JSON', { monthly_json: '{broken' }],
    ['daily_stats_json 为非法 JSON', { daily_stats_json: '[1,' }]
  ])('剖面行损坏（%s）返回脱敏 500', async (_label, overrides) => {
    const base = await start(tables([{ ...chongqingProfileRow, ...overrides }], []))
    const response = await fetch(`${base}/api/v2/weather/city-climate/profiles/chongqing`)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
    expect(text).not.toContain('城市气候')
  })

  test('适配缓存行损坏（联表 taxon_id 缺失）返回脱敏 500', async () => {
    const base = await start(async sql =>
      sql.includes('city_climate_profiles')
        ? [chongqingProfileRow]
        : [fitRow(fatsiaTaxon, '3761', '52.20', { taxon_id: null })]
    )
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=${fatsiaQuery}`
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
  })

  test('SQL 失败后销毁连接，下一次请求恢复正常并归还连接', async () => {
    let failNext = true
    const base = await start(async (sql, parameters) => {
      if (failNext) {
        failNext = false
        throw new Error('ER_ACCESS_DENIED password=hidden')
      }
      return tables([chongqingProfileRow], [])(sql, parameters)
    })
    const failed = await fetch(`${base}/api/v2/weather/city-climate/profiles`)
    expect(failed.status).toBe(500)
    expect(await failed.text()).not.toContain('password')
    expect(fakeState.destroyed).toBe(1)
    expect(fakeState.released).toBe(0)

    const recovered = await fetch(`${base}/api/v2/weather/city-climate/profiles`)
    expect(recovered.status).toBe(200)
    const body = (await recovered.json()) as { data: { items: unknown[] } }
    expect(body.data.items).toHaveLength(1)
    expect(fakeState.released).toBe(1)
    expect(fakeState.destroyed).toBe(1)
  })
})
