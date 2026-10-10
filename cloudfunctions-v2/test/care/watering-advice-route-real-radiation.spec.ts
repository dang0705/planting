import { readFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import { createWateringAdviceRoute, createWateringAdviceRouteHandler, type WateringAdviceRouteDependencies } from '../../src/care/http/watering-advice-route.js'
import { createOpenMeteoRadiationFetcher } from '../../src/care/provider/open-meteo-radiation-fetcher.js'
import type { GuestPrincipalDto, GuestSessionRef } from '../../src/contracts/types.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import { findProjectRoot } from '../support/project-root.js'
import { approvedV3Body, resolvedPolicy } from './watering/v3-policy-fixture.js'

/**
 * unit_real_data（L3，HTTP 路由层）。线上复验 2026-10-10：CLS 每次请求都有 provider_unavailable / normalize_failed。
 * 真实经过：node:http → 路由 → 真实 Open-Meteo 适配器（fetchOpenMeteoRadiation → normalizeOpenMeteoRadiation，与 care 入口同一组装）
 * → 单通道光照 → assessMvpWatering → 投影。替身：fetch 返回按函数同参数抓取的真实响应制品（不联网）；主体、归属、策略（审定 v3）、基线、事务。
 * Expected：radiation-interval-contract.md 修订 2026-10-10（单个负值按缺值）、mvp-watering-policy-contract.md §8、
 * watering-advice-http-contract.md 缺失码。复现线上请求：上海、南窗单层、Lux 2000（5 分钟前，meter）、根区微湿、四种盆。
 */
const now = Date.parse('2026-10-10T00:06:00Z')
const raw = readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation-negative-dhi.json'), 'utf8')
const guest: GuestPrincipalDto = { principalType: 'guest', guestSessionRef: 'gst_route_session_001' as GuestSessionRef, authProvider: 'server_issued_guest_token',
  issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() }
const policy = { releaseRef: 'bpr_care_mvp_watering03', snapshot: resolvedPolicy(approvedV3Body(), now) }
const servers: Server[] = []
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } })

const pots = {
  '12/9/11 颗粒土': { pot: [12, 9, 11], materials: ['gritty'] },
  '15/11/13 泥炭': { pot: [15, 11, 13], materials: ['peat'] },
  '20/15/18 泥炭': { pot: [20, 15, 18], materials: ['peat'] },
  '16/12/14 泥炭＋珍珠岩主料泥炭': { pot: [16, 12, 14], materials: ['peat', 'perlite'], primary: 'peat' },
} as const

async function post(potKey: keyof typeof pots) {
  const warnings: unknown[] = []
  const fetchRadiation = createOpenMeteoRadiationFetcher({ fetch: (async () => new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
    now: () => now, totalDeadlineMs: 8000, logger: { warn: event => { warnings.push(event) } } })
  const dependencies: WateringAdviceRouteDependencies = {
    resolvePrincipal: async () => guest, readOwnedCase: async () => 'owned', readWateringPolicy: async () => policy,
    readPlantBaseline: async () => ({ tier: 'regular', trigger: 'SURFACE_DRY', baselineDays: { min: 5, max: 8 } }), fetchRadiation,
    resolveCityCoordinates: async (cityCode: string) => (cityCode === 'shanghai' ? { latitude: 31.230416, longitude: 121.473701 } : null),
    createWateringAdvice: async input => ({ status: 200, body: { data: { resultRef: input.newResultRef, result: input.built.result } } }),
    createRef: kind => (kind === 'session' ? 'tcs_route_session_01' : 'cres_route_result_01'), now: () => now, writeAudit: () => undefined,
  }
  const dispatch = createRouteDispatcher([{ route: createWateringAdviceRoute, handler: createWateringAdviceRouteHandler(dependencies) }])
  const server = createServer((req, res) => { dispatch(req, res).catch(() => undefined) })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { pot, materials } = pots[potKey]
  const primary = 'primary' in pots[potKey] ? (pots[potKey] as { primary: string }).primary : null
  const body = {
    target: { kind: 'temporary_case', caseRef: 'gpc_route_case_00001' }, catalogTaxonRef: 'https://tropicals.cn/species/epipremnum-aureum',
    cityCode: 'shanghai', window: { orientation: 'S' },
    lightReading: { lux: 2000, measuredAt: new Date(now - 5 * 60_000).toISOString(), source: 'meter' }, indoorClimate: null, lastWatering: null,
    soil: { state: 'moist', scope: 'root_zone', observedAt: new Date(now - 60_000).toISOString() },
    pot: { isInnerPot: true, innerTopDiameterCm: pot[0], innerBottomDiameterCm: pot[1], innerHeightCm: pot[2], hasDrainageHole: true },
    substrateMaterials: materials, primarySubstrateMaterial: primary,
  }
  const port = (server.address() as AddressInfo).port
  const result = await new Promise<{ status: string, details: { action: string, missingEvidence: string[], checkWindow: { earliestAt: string | null } | null } }>((resolve, reject) => {
    const req = request(`http://127.0.0.1:${port}/api/v2/care/watering-advice`, { method: 'POST', headers: { 'content-type': 'application/json',
      authorization: `Bearer guest.${'A'.repeat(43)}`, 'idempotency-key': 'watering-key-0001' } }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString()).data.result))
    })
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })
  return { result, warnings }
}

describe('真实 Open-Meteo 响应经路由得到检查窗口（线上复验 2026-10-10）', () => {
  test.each(Object.keys(pots) as (keyof typeof pots)[])('%s：ready、check_later、有窗口，不缺室外辐射，无 normalize_failed 告警', async potKey => {
    const { result, warnings } = await post(potKey)
    expect(warnings).toEqual([])
    expect(result.status).toBe('ready')
    expect(result.details.action).toBe('check_later')
    expect(result.details.checkWindow?.earliestAt).toBeTruthy()
    expect(result.details.missingEvidence).not.toContain('outdoor_radiation')
  })
  test('盆型差异可见：12/9/11 颗粒土的最早检查早于 20/15/18 泥炭', async () => {
    const small = await post('12/9/11 颗粒土')
    const large = await post('20/15/18 泥炭')
    expect(Date.parse(small.result.details.checkWindow!.earliestAt!)).toBeLessThan(Date.parse(large.result.details.checkWindow!.earliestAt!))
  })
})
