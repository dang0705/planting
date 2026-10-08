import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replayRootZoneWateringSample, type RootZoneWateringSample } from '../../../models/care/experiments/replay-root-zone-watering-sample.js'
import type { EnvironmentalWateringSample } from '../../../models/care/experiments/replay-environmental-watering-sample.js'
import type { NonlinearResearchDemand } from '../../../models/care/experiments/joint-response-intervals.js'

type Mutable<T> = T extends readonly (infer V)[] ? Mutable<V>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
const origin = Date.UTC(2026, 9, 8); const dayMs = 86_400_000
const base = JSON.parse(readFileSync(resolve(__dirname, '../../../models/care/fixtures/environment-watering-sample.json'), 'utf8')) as Mutable<EnvironmentalWateringSample>
const profile = JSON.parse(readFileSync(resolve(__dirname, '../../../models/care/fixtures/joint-response-sample-profile.json'), 'utf8')) as { demand: NonlinearResearchDemand }

/** 合成历史日与未来日独立；既有生产计算不替身，Expected不从SUT取。 */
function sample(): Mutable<RootZoneWateringSample> {
  const environment = structuredClone(base)
  const history = structuredClone(environment.days[0]!)
  history.light.day.startMs -= dayMs; history.light.day.endMs -= dayMs
  history.light.day.date = '2026-10-07'
  const raw = history.light.raw as { hourly: { time: number[] } }
  raw.hourly.time = raw.hourly.time.map(t => t - dayMs / 1000)
  environment.days.unshift(history)
  environment.days.forEach(d => { d.demand = structuredClone(profile.demand) })
  const plantReference = history.light.plantReference
  return { classification: 'synthetic_experimental', environment,
    cultivationRef: 'synthetic:pot-substrate-v1',
    rootZone: { plantReference, cultivationRef: 'synthetic:pot-substrate-v1', sourceRef: 'synthetic:root-zone-volume', observedAt: origin,
      water: { volumeBasis: 'effective_substrate', effectiveSubstrateVolumeMl: { min: 2000, max: 2000 }, currentVwc: { min: 0.2, max: 0.2 }, targetVwc: { min: 0.3, max: 0.3 }, rootZoneEvidenceValid: true },
      triggerVwc: { min: 0.15, max: 0.15 } },
    reference: { plantReference, cultivationRef: 'synthetic:pot-substrate-v1', sourceRef: 'synthetic:net-water-loss',
      start: origin - dayMs, end: origin, netLossMl: { min: 62.5, max: 62.5 }, waterBalanceAccounted: true },
  }
}

/** L3 unit_fake I1-I3；无内部计算替身；不覆盖真实采集、资格发布、HTTP或数据库。 */
describe('同盆水分到日期及净缺口', () => {
  it('历史归一积分形成100ml尺度，剩余1单位到次日13:30，净缺口200ml', () => {
    const input = sample(); const before = structuredClone(input); const r = replayRootZoneWateringSample(input)
    expect(r.productionAdmission).toBe(false)
    expect(r.rootZoneReference.referenceMlPerDryUnit!.min).toBeCloseTo(100, 10)
    expect(r.rootZoneReference.remainingDryUnits!.min).toBeCloseTo(1, 10)
    expect(r.watering.currentCycleWindow.window!.earliestCheckAt).toBeCloseTo(origin + dayMs + 13.5 * 3600000, 0)
    expect(r.watering.currentCycleWindow.window!.latestCheckAt).toBeCloseTo(origin + dayMs + 13.5 * 3600000, 0)
    expect(r.watering.waterDeficit!.netDeficitMl!.min).toBeCloseTo(200, 10)
    expect(r.watering.waterDeficit!.appliedAmountMl).toBeNull()
    expect(r.watering.drying.progress).toBeNull()
    expect(input).toEqual(before)
    expect(replayRootZoneWateringSample(r.snapshot)).toEqual(r)
  })
  it('只改未来辐射，历史参考和当前净缺口不变，日期提前', () => {
    const input = sample()
    input.environment.days.filter(d => d.light.day.startMs >= origin).forEach(d => {
      const raw = d.light.raw as { hourly: { diffuse_radiation: number[]; shortwave_radiation: number[] } }
      raw.hourly.diffuse_radiation = raw.hourly.diffuse_radiation.map(v => v * 2)
      raw.hourly.shortwave_radiation = raw.hourly.shortwave_radiation.map(v => v * 2)
    })
    const r = replayRootZoneWateringSample(input)
    expect(r.rootZoneReference.referenceMlPerDryUnit!.min).toBeCloseTo(100, 10)
    expect(r.watering.currentCycleWindow.window!.earliestCheckAt).toBeCloseTo(origin + dayMs + 9.6 * 3600000, 0)
    expect(r.watering.waterDeficit!.netDeficitMl!.min).toBeCloseTo(200, 10)
  })
  it('过去光照缺段不校准、不借旧剩余量补日期，独立净缺口保留', () => {
    const input = sample(); input.environment.days[0]!.light.observation.source = 'experimental_camera'
    const r = replayRootZoneWateringSample(input)
    expect(r.rootZoneReference.remainingDryUnits).toBeNull()
    expect(r.watering.currentCycleWindow.window).toBeNull()
    expect(r.watering.waterDeficit!.netDeficitMl!.min).toBeCloseTo(200, 10)
  })
  it('缺补水目标仍能估计日期', () => {
    const input = sample(); input.rootZone.water.targetVwc = null
    const r = replayRootZoneWateringSample(input)
    expect(r.watering.currentCycleWindow.window!.earliestCheckAt).toBeCloseTo(origin + dayMs + 13.5 * 3600000, 0)
    expect(r.watering.waterDeficit!.netDeficitMl).toBeNull()
  })
  it('同盆当前更干时剩余时间缩短，净缺口增大', () => {
    const input = sample(); input.rootZone.water.currentVwc = { min: 0.175, max: 0.175 }
    const r = replayRootZoneWateringSample(input)
    expect(r.rootZoneReference.remainingDryUnits!.min).toBeCloseTo(0.5, 10)
    expect(r.watering.currentCycleWindow.window!.earliestCheckAt).toBeCloseTo(origin + 16.5 * 3600000, 0)
    expect(r.watering.waterDeficit!.netDeficitMl!.min).toBeCloseTo(250, 10)
  })
  it('湿土仍暂停浇水，正净缺口不是浇水许可', () => {
    const input = sample(); input.environment.watering.soil!.state = 'wet'
    const r = replayRootZoneWateringSample(input)
    expect(r.watering.decision.action).toBe('pause_watering')
    expect(r.watering.waterDeficit!.netDeficitMl!.min).toBeCloseTo(200, 10)
  })
  it.each(['future', 'cultivation', 'plant', 'water_balance', 'retention', 'calibration', 'old_observation'] as const)('拒绝%s破坏同盆时序或重复计权', kind => {
    const input = sample()
    if (kind === 'future') { input.reference.end = origin + dayMs }
    if (kind === 'cultivation') { input.reference.cultivationRef = 'repotted' }
    if (kind === 'plant') { input.rootZone.plantReference = 'other' }
    if (kind === 'water_balance') { input.reference.waterBalanceAccounted = false }
    if (kind === 'retention') { input.environment.days[0]!.cultivationRetention = { min: 2, max: 2 } }
    if (kind === 'calibration') { input.environment.days[0]!.personalCalibration = { min: 2, max: 2 } }
    if (kind === 'old_observation') { input.rootZone.observedAt -= dayMs }
    expect(() => replayRootZoneWateringSample(input)).toThrow()
  })
})
