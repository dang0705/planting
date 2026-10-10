import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildWateringAdvice } from '../../src/care/application/build-watering-advice.js'
import { parseWateringAdviceRequest, type WateringAdviceCommand } from '../../src/care/http/watering-advice-request.js'
import { normalizeOpenMeteoRadiation } from '../../src/care/light/normalize-open-meteo-radiation.js'
import { resolveMvpWateringPolicy } from '../../src/configuration/mvp-watering-policy.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_fake（L3）。Expected：watering-advice-http-test-matrix.md B1–B5（HTTP 合同、裁决 5/9、mvp 矩阵 I1 水量 40～300 mL）。
 * 真实经过：请求解析 → 单通道光照 → assessMvpWatering → 清单组装。辐射为真实 Open-Meteo 制品标准化结果；无网络与数据库。
 */
const root = findProjectRoot()
const now = 1_791_126_000_000
const payload = JSON.parse(readFileSync(join(root, 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v1.json'), 'utf8')) as CanonicalJsonObject
const resolution = resolveMvpWateringPolicy({ ...payload, releaseVersion: 'care-watering-mvp/v1.0.0', contentSha256: calculateCanonicalJsonSha256(payload),
  releaseStatus: 'active', effectiveAt: '2026-10-01T00:00:00Z' }, new Date(now).toISOString())
if (resolution.status !== 'available') { throw new Error('夹具策略必须可解析') }
const policy = { releaseRef: 'bpr_care_mvp_watering01', snapshot: resolution.snapshot }
const radiation = normalizeOpenMeteoRadiation(JSON.parse(readFileSync(join(root, 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8')),
  { series: 'hourly', sourceRef: 'open_meteo_forecast_v1', fetchedAtMs: now })
const baseline = { tier: 'regular', trigger: 'SURFACE_DRY', baselineDays: { min: 5, max: 8 } } as const
const body = {
  target: { kind: 'temporary_case', caseRef: 'gpc_build_case_00001' },
  catalogTaxonRef: 'https://tropicals.cn/species/epipremnum-aureum',
  cityCode: 'shanghai',
  window: { orientation: 'S' },
  lightReading: { lux: 2000, measuredAt: '2026-10-04T04:30:00.000Z', source: 'meter' },
  soil: { state: 'dry', scope: 'root_zone', observedAt: '2026-10-04T14:00:00.000Z' },
  pot: { isInnerPot: true, innerTopDiameterCm: 16, innerBottomDiameterCm: 12, innerHeightCm: 14, hasDrainageHole: true },
  substrateMaterials: ['peat', 'perlite']
}
function command(overrides: Record<string, unknown> = {}): WateringAdviceCommand {
  const parsed = parseWateringAdviceRequest({ ...body, ...overrides }, now)
  if (parsed.status !== 'ok') { throw new Error('夹具请求必须合法') }
  // 路由在调用 buildWateringAdvice 前用城市目录把城市代码换成中心坐标（降到 0.01°）；纯计算测试直接给出该结果。
  return { ...parsed.command, location: { latitude: 31.23, longitude: 121.47 } }
}

describe('浇水建议组装', () => {
  it('B1 无策略 → temporarily_unavailable，算法清单明确记录无发布', () => {
    const built = buildWateringAdvice({ command: command(), policy: null, baseline, radiation, nowMs: now })
    expect(built.result.status).toBe('temporarily_unavailable')
    expect(built.algorithmReleaseManifest.wateringPolicy).toEqual({ status: 'none_published' })
    expect(built.algorithmReleaseManifest.baselinePolicyVersion).toBe('v1')
  })
  it('B2 辐射不可用 → 无环境时段、时区 null；根区干＋有孔内盆＋材料仍可浇水 40～300 mL', () => {
    const built = buildWateringAdvice({ command: command(), policy, baseline, radiation: null, nowMs: now })
    expect(built.result).toMatchObject({ status: 'ready', confidence: 'low' })
    expect(built.result.details.action).toBe('water_allowed')
    expect(built.result.details.amountMl).toEqual({ min: 40, max: 300 })
    expect(built.result.details.checkWindow?.timezone ?? null).toBeNull()
    expect(built.derivations).toMatchObject({ environmentIntervalCount: 0, timezone: null })
    expect(built.algorithmReleaseManifest.radiation).toMatchObject({ provider: 'open_meteo', status: 'unavailable' })
    expect(built.algorithmReleaseManifest.wateringPolicy).toEqual({ status: 'published', releaseRef: 'bpr_care_mvp_watering01',
      releaseVersion: 'care-watering-mvp/v1.0.0', contentSha256: resolution.status === 'available' ? resolution.snapshot.contentSha256 : '' })
  })
  it('有辐射与 Lux：光照可用，时区来自 Provider', () => {
    const built = buildWateringAdvice({ command: command({ soil: { state: 'moist', scope: 'root_zone', observedAt: '2026-10-04T14:00:00.000Z' } }), policy, baseline, radiation, nowMs: now })
    expect(built.derivations).toMatchObject({ plantLight: { status: 'available' }, timezone: 'Asia/Shanghai' })
    expect(built.derivations.environmentIntervalCount).toBeGreaterThan(0)
  })
  it('无 Lux：光照缺证据，环境时段为空', () => {
    const built = buildWateringAdvice({ command: command({ lightReading: null }), policy, baseline, radiation, nowMs: now })
    expect(built.derivations).toMatchObject({ plantLight: { status: 'insufficient_evidence', reason: 'light_reading' }, environmentIntervalCount: 0 })
  })
  it('B3 根区湿 → 暂停浇水、无水量', () => {
    const built = buildWateringAdvice({ command: command({ soil: { state: 'wet', scope: 'root_zone', observedAt: '2026-10-04T14:00:00.000Z' } }), policy, baseline, radiation, nowMs: now })
    expect(built.result.details.action).toBe('pause_watering')
    expect(built.result.details.amountMl).toBeNull()
  })
  it('B4 基线缺失 → insufficient_evidence', () => {
    expect(buildWateringAdvice({ command: command(), policy, baseline: null, radiation, nowMs: now }).result.status).toBe('insufficient_evidence')
  })
  it('B5 输入清单只含 0.01° 坐标，不含精确坐标与目标归属', () => {
    const built = buildWateringAdvice({ command: command(), policy, baseline, radiation, nowMs: now })
    expect(built.inputManifest.location).toEqual({ latitude: 31.23, longitude: 121.47 })
    const text = JSON.stringify(built)
    expect(text).not.toContain('31.230416')
    expect(text).not.toContain('121.473701')
    expect(text).not.toContain('gpc_build_case_00001')
    expect(built.result.generatedAt).toBe(new Date(now).toISOString())
  })
})

/**
 * Expected：watering-advice-http-contract.md「长期植物的坐标」（2026-10-10 用户裁决）——长期植物档案无城市时不取辐射；
 * 结果为 insufficient_evidence 时追加 plant_location 而不是 outdoor_radiation；结论已安全（根区干可以浇水）时为 ready、不追加。
 */
describe('长期植物无城市坐标', () => {
  const userPlant = (overrides: Partial<WateringAdviceCommand> = {}): WateringAdviceCommand => ({ ...command(), target: { kind: 'user_plant', userPlantRef: 'upl_build_plant_0001' }, location: null, ...overrides })
  it('无坐标且证据不足 → insufficient_evidence，追加 plant_location，不追加 outdoor_radiation；输入清单 location 为 null', () => {
    const built = buildWateringAdvice({ command: userPlant({ soil: null }), policy, baseline, radiation: null, nowMs: now })
    expect(built.result.status).toBe('insufficient_evidence')
    expect(built.result.details.missingEvidence).toContain('plant_location')
    expect(built.result.details.missingEvidence).not.toContain('outdoor_radiation')
    expect(built.inputManifest.location).toBeNull()
  })
  it('无坐标但根区干 → 仍按原规则 ready，不追加缺失码', () => {
    const built = buildWateringAdvice({ command: userPlant(), policy, baseline, radiation: null, nowMs: now })
    expect(built.result.status).toBe('ready')
    expect(built.result.details.missingEvidence).not.toContain('plant_location')
  })
})
