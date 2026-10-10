import { readFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { createWateringAdviceRoute, createWateringAdviceRouteHandler, type WateringAdviceRouteDependencies } from '../../src/care/http/watering-advice-route.js'
import { normalizeOpenMeteoRadiation } from '../../src/care/light/normalize-open-meteo-radiation.js'
import type { GuestPrincipalDto, GuestSessionRef } from '../../src/contracts/types.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import { findProjectRoot } from '../support/project-root.js'
import { approvedV3Body, resolvedPolicy } from './watering/v3-policy-fixture.js'

/**
 * unit_fake（L3，HTTP 路由层）。线上复验（2026-10-10）：游客请求 lightReading=null 时 moist 永远 insufficient_evidence、wet 永远无窗口。
 * 本文件判定这是合同规定行为而非映射缺陷，并钉住“能拿到检查窗口”的最小请求。
 * Expected 来源：mvp-watering-policy-contract.md §2a（植物位置光照只来自 Lux 锚点；无锚点 = 植物光照缺证据）、
 * mvp-watering-test-matrix.md H.U1（无 Lux → light_reading 缺证据）、watering-advice-wiring-plan.md（无环境时段 → 窗口开放）、
 * watering-result-projection-contract.md 第 3 条（可靠湿土优先暂停，预测日期不进入最终候选）、§3 盆土映射表（moist → 安全门 unknown）。
 * 真实经过：node:http → 冻结分发 → 请求链 → DTO 解析 → 单通道光照 → assessMvpWatering → 投影；
 * 替身：主体、归属、策略读取（审定 v3 正文经真实解析器）、基线、事务。辐射：真实 Open-Meteo 上海逐小时制品（24h）按天平移复制出
 * 回看 1 天＋预报 16 天的合成序列（只为覆盖未来，非真实预报）。未覆盖：真实 Provider、MySQL、部署环境。
 */
const day = 86_400_000
const now = 1_791_126_000_000
const guest: GuestPrincipalDto = { principalType: 'guest', guestSessionRef: 'gst_route_session_001' as GuestSessionRef, authProvider: 'server_issued_guest_token',
  issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + day).toISOString() }
const policy = { releaseRef: 'bpr_care_mvp_watering03', snapshot: resolvedPolicy(approvedV3Body(), now) }
const fixture = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8')) as
  { hourly: { time: number[], shortwave_radiation: number[], direct_normal_irradiance: number[], diffuse_radiation: number[] } } & Record<string, unknown>
/** 真实 24h 制品按天平移：第 -1 天（原样）至第 +16 天。 */
const shifted = (field: 'shortwave_radiation' | 'direct_normal_irradiance' | 'diffuse_radiation') => Array.from({ length: 17 }, () => fixture.hourly[field]).flat()
const radiation = normalizeOpenMeteoRadiation({ ...fixture, hourly: {
  time: Array.from({ length: 17 }, (_, k) => fixture.hourly.time.map(t => t + k * 86_400)).flat(),
  shortwave_radiation: shifted('shortwave_radiation'), direct_normal_irradiance: shifted('direct_normal_irradiance'), diffuse_radiation: shifted('diffuse_radiation'),
} }, { series: 'hourly', sourceRef: 'open_meteo_forecast_v1', fetchedAtMs: now })

/** 线上复验请求的形态：游客临时案例、上海、南窗单层玻璃、无 Lux、无室内温湿度、无上次浇水。 */
const onlineBody = {
  target: { kind: 'temporary_case', caseRef: 'gpc_route_case_00001' },
  catalogTaxonRef: 'https://tropicals.cn/species/epipremnum-aureum',
  cityCode: 'shanghai',
  window: { orientation: 'S' },
  lightReading: null, indoorClimate: null, lastWatering: null,
  soil: { state: 'moist', scope: 'root_zone', observedAt: new Date(now - 3_600_000).toISOString() },
  pot: { isInnerPot: true, innerTopDiameterCm: 15, innerBottomDiameterCm: 11, innerHeightCm: 13, hasDrainageHole: true },
  substrateMaterials: ['peat'],
}
/** 最小可得窗口：在上面基础上只补一次 Lux（白天、GHI ≥ 50 W/m² 的时段测得、30 天内）。 */
const lux = { lux: 2000, measuredAt: '2026-10-04T04:30:00.000Z', source: 'meter' }

const servers: Server[] = []
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } })

type Details = { action: string, soilState: string, checkWindow: { earliestAt: string | null, latestAt: string | null } | null, missingEvidence: string[] }
async function post(value: unknown, overrides: Partial<WateringAdviceRouteDependencies> = {}) {
  const dependencies: WateringAdviceRouteDependencies = {
    resolvePrincipal: async () => guest,
    readOwnedCase: async () => 'owned',
    readWateringPolicy: async () => policy,
    readPlantBaseline: async () => ({ tier: 'regular', trigger: 'SURFACE_DRY', baselineDays: { min: 5, max: 8 } }),
    // 2026-10-10 纠偏：城市代码由城市目录换中心坐标（测试替身只认识上海）。
    resolveCityCoordinates: async (cityCode: string) => (cityCode === 'shanghai' ? { latitude: 31.230416, longitude: 121.473701 } : null),
    fetchRadiation: async () => radiation,
    createWateringAdvice: async input => ({ status: 200, body: { data: { resultRef: input.newResultRef, result: input.built.result } } }),
    createRef: kind => (kind === 'session' ? 'tcs_route_session_01' : 'cres_route_result_01'),
    now: () => now,
    writeAudit: () => undefined,
    ...overrides,
  }
  const dispatch = createRouteDispatcher([{ route: createWateringAdviceRoute, handler: createWateringAdviceRouteHandler(dependencies) }])
  const server = createServer((req, res) => { dispatch(req, res).catch(() => undefined) })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return new Promise<{ status: number, result: { status: string, details: Details } }>((resolve, reject) => {
    const req = request(`http://127.0.0.1:${port}/api/v2/care/watering-advice`, { method: 'POST', headers: { 'content-type': 'application/json',
      authorization: `Bearer guest.${'A'.repeat(43)}`, 'idempotency-key': 'watering-key-0001' } }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => { const parsed = JSON.parse(Buffer.concat(chunks).toString()); resolve({ status: res.statusCode!, result: parsed.data?.result }) })
    })
    req.on('error', reject)
    req.end(JSON.stringify(value))
  })
}

describe('POST /api/v2/care/watering-advice 检查窗口可得性（线上复验 2026-10-10）', () => {
  test('W1 线上形态（无 Lux）＋根区微湿 → 合同行为：植物光照缺证据、无环境时段 → insufficient_evidence，无窗口', async () => {
    const response = await post(onlineBody)
    expect(response.status).toBe(200)
    expect(response.result.status).toBe('insufficient_evidence')
    expect(response.result.details.soilState).toBe('unknown')
    expect(response.result.details.checkWindow).toBeNull()
  })
  test('W2 只补一次 Lux → 200 ready、check_later，检查窗口最早端存在', async () => {
    const response = await post({ ...onlineBody, lightReading: lux })
    expect(response.result.status).toBe('ready')
    expect(response.result.details.action).toBe('check_later')
    expect(response.result.details.checkWindow?.earliestAt).toBeTruthy()
  })
  test('W3 补 Lux 后盆型/基质差异可见：12/9/11 颗粒土的最早检查早于 20/15/18 泥炭', async () => {
    const small = await post({ ...onlineBody, lightReading: lux, substrateMaterials: ['gritty'],
      pot: { isInnerPot: true, innerTopDiameterCm: 12, innerBottomDiameterCm: 9, innerHeightCm: 11, hasDrainageHole: true } })
    const large = await post({ ...onlineBody, lightReading: lux,
      pot: { isInnerPot: true, innerTopDiameterCm: 20, innerBottomDiameterCm: 15, innerHeightCm: 18, hasDrainageHole: true } })
    expect(Date.parse(small.result.details.checkWindow!.earliestAt!)).toBeLessThan(Date.parse(large.result.details.checkWindow!.earliestAt!))
  })
  test('W4 根区湿（即使有 Lux）→ 合同行为：pause_watering，不公开检查窗口', async () => {
    const response = await post({ ...onlineBody, lightReading: lux, soil: { ...onlineBody.soil, state: 'wet' } })
    expect(response.result.details.action).toBe('pause_watering')
    expect(response.result.details.checkWindow).toBeNull()
  })
  test('W5 不观察盆土、只给上次浇水时间＋Lux → 也能得到检查窗口', async () => {
    const response = await post({ ...onlineBody, lightReading: lux, soil: null, lastWatering: { wateredAt: new Date(now - day).toISOString() } })
    expect(response.result.details.checkWindow?.earliestAt).toBeTruthy()
  })

  // 以下 Expected：watering-advice-http-contract.md「光照与室外辐射缺失码」（2026-10-10 增补）。
  test('M1 有室外辐射、未测 Lux → missingEvidence 追加 plant_light，不含 outdoor_radiation', async () => {
    const missing = (await post(onlineBody)).result.details.missingEvidence
    expect(missing).toContain('plant_light')
    expect(missing).not.toContain('outdoor_radiation')
  })
  test('M2 Provider 不可用（返回空）＋已测 Lux → 追加 outdoor_radiation，不含 plant_light', async () => {
    const response = await post({ ...onlineBody, lightReading: lux }, { fetchRadiation: async () => null })
    expect(response.result.status).toBe('insufficient_evidence')
    expect(response.result.details.missingEvidence).toContain('outdoor_radiation')
    expect(response.result.details.missingEvidence).not.toContain('plant_light')
  })
  test('M3 Provider 抛错 → 同样追加 outdoor_radiation，仍 200', async () => {
    const response = await post({ ...onlineBody, lightReading: lux }, { fetchRadiation: async () => { throw new Error('network') } })
    expect(response.status).toBe(200)
    expect(response.result.details.missingEvidence).toContain('outdoor_radiation')
  })
  test('M4 夜间测光（测量时段 GHI=0 < 50）→ plant_light', async () => {
    const response = await post({ ...onlineBody, lightReading: { ...lux, measuredAt: '2026-10-03T19:30:00.000Z' } })
    expect(response.result.details.missingEvidence).toContain('plant_light')
  })
  test('M5 辐射序列不覆盖 Lux 测量时刻 → outdoor_radiation', async () => {
    const response = await post({ ...onlineBody, lightReading: { ...lux, measuredAt: new Date(now - 10 * day).toISOString() } })
    expect(response.result.details.missingEvidence).toContain('outdoor_radiation')
  })
  test('M6 根区湿（ready 暂停）、未测 Lux → 不追加光照缺失码', async () => {
    const response = await post({ ...onlineBody, soil: { ...onlineBody.soil, state: 'wet' } })
    expect(response.result.details.action).toBe('pause_watering')
    expect(response.result.details.missingEvidence).not.toContain('plant_light')
  })
  test('M7 有 Lux 能出窗口 → 不追加光照缺失码', async () => {
    const missing = (await post({ ...onlineBody, lightReading: lux })).result.details.missingEvidence
    expect(missing).not.toContain('plant_light')
    expect(missing).not.toContain('outdoor_radiation')
  })
})
