import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createWeatherServer } from '../../src/weather/http/server.js'
import {
  getCityClimateFitRoute,
  getCityClimateProfileRoute,
  listCityClimateProfilesRoute,
  listCityClimateRecommendationsRoute
} from '../../src/weather/http/routes.js'
import { findProjectRoot } from '../support/project-root.js'
import { fixturePolicyPorts } from '../support/business-policy-fixtures.js'

/**
 * Expected：weather-city-climate-fit/v2（plantId=taxon_id）+ 已灌库列名 + v1 热门城重庆坐标。
 * 层次：L3 / unit_fake。真实 HTTP、路由、请求链与 Repository；仅替换 MySQL。
 */

const profileRow = {
  city_code: 'chongqing',
  display_name: '重庆',
  lat: 29.563,
  lon: 106.5516,
  timezone: 'Asia/Shanghai',
  source: 'open-meteo-archive',
  window_start: new Date(2021, 0, 1),
  window_end: new Date(2025, 11, 31),
  day_count: 1826,
  policy_version: 'v0-city-outdoor',
  monthly_json: [{ month: 1, t_mean: 8 }],
  daily_stats_json: { t_min: -2, t_max: 38 }
}

const fitRow = {
  city_code: 'chongqing',
  encyclopedia_id: '4857',
  taxon_id: 'https://tropicals.cn/species/nageia-nagi',
  policy_version: 'v0-city-outdoor',
  overall: 51,
  temperature_match: 64.5,
  humidity_match: 74.8,
  light_match: 33.4,
  primary_bottleneck: 'WINTER_COLD',
  risk_flags_json: ['frost'],
  name: '示例植物',
  scientific_name: 'Example plantae',
  cover_image_ref: 'cover-ref',
  care_difficulty: 'easy'
}

const expectedProfile = {
  cityCode: 'chongqing',
  displayName: '重庆',
  lat: 29.563,
  lon: 106.5516,
  timezone: 'Asia/Shanghai',
  source: 'open-meteo-archive',
  window: { start: '2021-01-01', end: '2025-12-31' },
  dayCount: 1826,
  policyVersion: 'v0-city-outdoor',
  monthly: [{ month: 1, t_mean: 8 }],
  dailyStats: { t_min: -2, t_max: 38 }
}

let server: Server | undefined
let queries: Array<{ sql: string; parameters: readonly (string | number | null)[] }> = []

async function start(
  handler: (
    sql: string,
    parameters: readonly (string | number | null)[]
  ) => Promise<readonly Record<string, unknown>[]>
): Promise<string> {
  const connection: Mysql2QueryConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    destroy: () => undefined,
    execute: async () => ({ affectedRows: 0, insertId: 0 }),
    query: async (sql, parameters) => {
      queries.push({ sql, parameters })
      return handler(sql, parameters)
    }
  }
  server = createWeatherServer({ ...fixturePolicyPorts(),
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
  queries = []
})

describe('weather city climate fit routes', () => {
  test('路由常量与 route-registry.json 冻结登记一致', () => {
    const registry = JSON.parse(
      fs.readFileSync(
        path.join(findProjectRoot(), 'docs/backend-v2/api/route-registry.json'),
        'utf8'
      )
    ) as {
      routes: Array<{ method: string; path: string; operationId: string; security: string }>
    }
    for (const route of [
      listCityClimateProfilesRoute,
      getCityClimateProfileRoute,
      getCityClimateFitRoute,
      listCityClimateRecommendationsRoute
    ]) {
      const frozen = registry.routes.find(item => item.operationId === route.operationId)
      expect(frozen).toBeDefined()
      expect(route).toEqual({
        method: frozen?.method,
        path: frozen?.path,
        operationId: frozen?.operationId,
        security: frozen?.security
      })
    }
  })

  test('列出全部城市剖面', async () => {
    const base = await start(async () => [profileRow])
    const response = await fetch(`${base}/api/v2/weather/city-climate/profiles`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { items: [expectedProfile] } })
    // 合同：策略版本固定读取 v0-city-outdoor（原断言 [] 由实现反推，E02 验收按合同改正）。
    expect(queries[0]?.parameters).toEqual(['v0-city-outdoor'])
  })

  test('单城剖面含重庆 v1 经纬度', async () => {
    const base = await start(async (_sql, parameters) => {
      expect(parameters).toEqual(['chongqing', 'v0-city-outdoor'])
      return [profileRow]
    })
    const response = await fetch(`${base}/api/v2/weather/city-climate/profiles/chongqing`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: expectedProfile })
  })

  test('fit 返回剖面与适配分数', async () => {
    const base = await start(async (sql, parameters) => {
      if (sql.includes('city_climate_profiles')) {
        expect(parameters).toEqual(['chongqing', 'v0-city-outdoor'])
        return [profileRow]
      }
      expect(parameters).toEqual([
        'chongqing',
        'https://tropicals.cn/species/nageia-nagi',
        'v0-city-outdoor'
      ])
      return [fitRow]
    })
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=${encodeURIComponent('https://tropicals.cn/species/nageia-nagi')}`
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        policyVersion: 'v0-city-outdoor',
        profile: expectedProfile,
        fit: {
          cityCode: 'chongqing',
          plantId: 'https://tropicals.cn/species/nageia-nagi',
          policyVersion: 'v0-city-outdoor',
          overall: 51,
          temperatureMatch: 64.5,
          humidityMatch: 74.8,
          lightMatch: 33.4,
          primaryBottleneck: 'WINTER_COLD',
          riskFlags: ['frost']
        }
      }
    })
  })

  test('推荐按 overall 查询并附带百科展示字段', async () => {
    const base = await start(async (sql, parameters) => {
      if (sql.includes('city_climate_profiles')) {
        return [profileRow]
      }
      expect(parameters).toEqual(['chongqing', 'v0-city-outdoor', 3])
      return [fitRow]
    })
    const response = await fetch(
      `${base}/api/v2/weather/city-climate/recommendations?cityCode=chongqing&top=3`
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        policyVersion: 'v0-city-outdoor',
        cityCode: 'chongqing',
        profile: expectedProfile,
        count: 1,
        recommendations: [
          {
            cityCode: 'chongqing',
            plantId: 'https://tropicals.cn/species/nageia-nagi',
            policyVersion: 'v0-city-outdoor',
            overall: 51,
            temperatureMatch: 64.5,
            humidityMatch: 74.8,
            lightMatch: 33.4,
            primaryBottleneck: 'WINTER_COLD',
            riskFlags: ['frost'],
            name: '示例植物',
            scientificName: 'Example plantae',
            coverImage: null,
            careDifficulty: 'easy'
          }
        ]
      }
    })
  })

  test('非法 cityCode / plantId 在 SQL 前拒绝', async () => {
    const base = await start(async () => {
      throw new Error('should not query')
    })
    expect((await fetch(`${base}/api/v2/weather/city-climate/profiles/ChongQing`)).status).toBe(400)
    expect(
      (await fetch(`${base}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=`)).status
    ).toBe(400)
    expect(queries).toEqual([])
  })

  test('缺城市剖面与缺适配缓存返回稳定 404', async () => {
    const missingCity = await start(async () => [])
    const cityResponse = await fetch(`${missingCity}/api/v2/weather/city-climate/profiles/shanghai`)
    expect(cityResponse.status).toBe(404)
    expect(await cityResponse.json()).toEqual({
      error: { type: 'NOT_FOUND', message: '城市气候剖面不存在' }
    })

    const missingFit = await start(async sql =>
      sql.includes('city_climate_profiles') ? [profileRow] : []
    )
    const fitResponse = await fetch(
      `${missingFit}/api/v2/weather/city-climate/fit?cityCode=chongqing&plantId=1`
    )
    expect(fitResponse.status).toBe(404)
    expect(await fitResponse.json()).toEqual({
      error: { type: 'NOT_FOUND', message: '城市气候适配缓存不存在' }
    })
  })

  test('SQL 失败不暴露内部错误', async () => {
    const base = await start(async () => {
      throw new Error('SQL credential hidden')
    })
    const response = await fetch(`${base}/api/v2/weather/city-climate/profiles`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
  })
})
