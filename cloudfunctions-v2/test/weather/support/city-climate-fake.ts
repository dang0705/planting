import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { Mysql2QueryConnection } from '../../../src/foundation/database/mysql2-connection-source.js'
import { createWeatherServer } from '../../../src/weather/http/server.js'

/**
 * weather 城市气候 L3 / unit_fake 测试共用夹具。
 *
 * 真实经过：node:http、冻结路由、请求链、Repository 与映射。
 * 仅替换：MySQL 连接——用「绑定参数与公开过滤列等值匹配」模拟 WHERE 的内存行表。
 * 行形态照抄测试库 information_schema 与只读抽样（2026-10-09）：
 * DECIMAL/BIGINT 经 mysql2 bigNumberStrings 为字符串；含 id、时间戳、内部 JSON 等不得公开的列。
 */

/** 模拟的一行查询结果。 */
export type FakeRow = Record<string, unknown>
/** 参数化查询绑定值。 */
export type FakeParameters = readonly (string | number | null)[]
/** 模拟 SQL 执行器。 */
export type FakeHandler = (sql: string, parameters: FakeParameters) => Promise<readonly FakeRow[]>

/** 合同固定策略版本。 */
export const policy = 'v0-city-outdoor'

/** 真实测试库中竹柏（内部 id 4857）的公开分类引用。 */
export const nageiaTaxon = 'https://tropicals.cn/species/nageia-nagi'
/** 八角金盘（内部 id 3761）。 */
export const fatsiaTaxon = 'https://tropicals.cn/species/fatsia-japonica'
/** 灰莉（内部 id 3755）。 */
export const fagraeaTaxon = 'https://tropicals.cn/species/fagraea-ceilanica'
/** 鱼尾葵（内部 id 72939）。 */
export const caryotaTaxon = 'https://tropicals.cn/species/caryota-maxima'

/** 与真实表一致的剖面行，含不得公开的内部列。 */
export const chongqingProfileRow: FakeRow = {
  id: 7,
  city_code: 'chongqing',
  display_name: '重庆',
  lat: 29.563,
  lon: 106.5516,
  timezone: 'Asia/Shanghai',
  source: 'open-meteo-archive',
  window_start: '2021-01-01',
  window_end: '2025-12-31',
  day_count: 1826,
  policy_version: policy,
  monthly_json: [{ month: 1 }],
  daily_stats_json: { t_min: -2 },
  profile_json: { internal: true },
  created_at: '2026-10-01 00:00:00',
  updated_at: '2026-10-01 00:00:00'
}

/** 同城旧策略版本剖面行：唯一键允许它与 v0 行并存。 */
export const chongqingLegacyProfileRow: FakeRow = {
  ...chongqingProfileRow,
  id: 8,
  policy_version: 'v-legacy',
  display_name: '重庆（旧策略）'
}

/**
 * 缓存 × 百科联表后的一行：内部 encyclopedia_id 与 taxon_id 并存，
 * 以证明响应只用 taxon_id 作为公开 plantId。
 */
export function fitRow(
  taxonId: string,
  encyclopediaId: string,
  overall: string,
  overrides: FakeRow = {}
): FakeRow {
  return {
    id: 900,
    city_code: 'chongqing',
    encyclopedia_id: encyclopediaId,
    policy_version: policy,
    overall,
    temperature_match: '55.00',
    humidity_match: '74.80',
    light_match: '41.30',
    primary_bottleneck: 'WINTER_COLD',
    risk_flags_json: ['WINTER_COLD'],
    detail_json: { internal: true },
    created_at: '2026-10-01 00:00:00',
    updated_at: '2026-10-01 00:00:00',
    taxon_id: taxonId,
    name: '八角金盘',
    scientific_name: 'Fatsia japonica',
    cover_image_ref: null,
    cover_source_json: null,
    care_difficulty: 'beginner',
    ...overrides
  }
}

/** 测试运行时状态：服务、查询记录与连接归还/销毁计数。 */
export const fakeState = {
  server: undefined as Server | undefined,
  queries: [] as Array<{ sql: string; parameters: FakeParameters }>,
  released: 0,
  destroyed: 0
}

/** 启动真实 weather HTTP 服务，仅替换 MySQL 连接。 */
export async function start(handler: FakeHandler): Promise<string> {
  const connection: Mysql2QueryConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => {
      fakeState.released += 1
    },
    destroy: () => {
      fakeState.destroyed += 1
    },
    execute: async () => ({ affectedRows: 0, insertId: 0 }),
    query: async (sql, parameters) => {
      fakeState.queries.push({ sql, parameters })
      return handler(sql, parameters)
    }
  }
  const server = createWeatherServer({
    connectionSource: { getConnection: async () => connection },
    writeAudit: () => undefined
  })
  fakeState.server = server
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** 关闭服务并清空状态；供 afterEach 调用。 */
export async function stop(): Promise<void> {
  const server = fakeState.server
  if (server) {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  fakeState.server = undefined
  fakeState.queries = []
  fakeState.released = 0
  fakeState.destroyed = 0
}

/** 允许出现在 WHERE 等值条件里的公开过滤列；内部 id 不参与匹配。 */
const filterColumns = ['city_code', 'policy_version', 'taxon_id'] as const

/** 模拟 WHERE 等值：每个绑定参数都须等于该行某个公开过滤列，才视为命中。 */
export function whereEquals(
  rows: readonly FakeRow[],
  parameters: FakeParameters
): readonly FakeRow[] {
  return rows.filter(row =>
    parameters.every(parameter =>
      filterColumns.some(column => row[column] !== undefined && row[column] === parameter)
    )
  )
}

/** 推荐查询的识别片段：按 overall 排序的那条 SQL。 */
export const recommendationSqlMarker = 'ORDER BY f.overall'

/** 剖面表与缓存表的内存模拟；推荐查询直接返回给定有序行。 */
export function tables(
  profiles: readonly FakeRow[],
  fits: readonly FakeRow[],
  recommendations: readonly FakeRow[] = []
): FakeHandler {
  return async (sql, parameters) => {
    if (sql.includes('FROM city_climate_profiles')) {
      return whereEquals(profiles, parameters)
    }
    if (sql.includes(recommendationSqlMarker)) {
      return recommendations
    }
    return whereEquals(fits, parameters)
  }
}
