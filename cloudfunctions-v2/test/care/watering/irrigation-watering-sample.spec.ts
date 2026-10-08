import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replayIrrigationWateringSample, type IrrigationWateringSample } from '../../../models/care/experiments/replay-irrigation-watering-sample.js'
import type { RootZoneWateringSample } from '../../../models/care/experiments/replay-root-zone-watering-sample.js'

type Mutable<T> = T extends readonly (infer V)[] ? Mutable<V>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
const base = JSON.parse(readFileSync(resolve(__dirname, '../../../models/care/root-zone-watering-sample-results.json'), 'utf8')) as { baseSnapshot: RootZoneWateringSample }
/** 既有明确合成输入；Expected来自手算合同，绝不消费制品中的结果作为Expected。 */
function sample(): Mutable<IrrigationWateringSample> {
  const rootZone = structuredClone(base.baseSnapshot) as Mutable<RootZoneWateringSample>
  rootZone.rootZone.water.currentVwc = { min: 0.15, max: 0.15 }
  rootZone.environment.watering.soil!.state = 'target_dry'
  rootZone.environment.watering.soil!.targetCriteriaConfirmed = true
  return { classification: 'synthetic_experimental', rootZone, methodRef: 'synthetic:slow-top-watering',
    application: { sourceRef: 'synthetic:delivery-balance', plantReference: rootZone.rootZone.plantReference,
      cultivationRef: rootZone.cultivationRef, methodRef: 'synthetic:slow-top-watering', observedAt: rootZone.reference.end,
      rootObservationRef: rootZone.rootZone.sourceRef, waterBalanceAccounted: true, drainage: 'free',
      retentionFraction: { min: 0.8, max: 0.8 }, allowedNetAdditionMl: { min: 300, max: 320 },
      calibratedAppliedMl: { min: 0, max: 500 }, maximumSingleApplicationMl: 390 } }
}
/** L3 unit_fake：内部物理与安全门不替身；不覆盖真实供排水、发布、HTTP及事实写入。 */
describe('同盆当前安全门与实际施水候选', () => {
  it('可靠达到干燥条件时同时保留日期、净缺口和有界施水候选', () => {
    const x = sample(); const before = structuredClone(x); const r = replayIrrigationWateringSample(x)
    expect(r.productionAdmission).toBe(false)
    expect(r.rootZone.watering.decision.action).toBe('water_allowed')
    expect(r.rootZone.watering.currentCycleWindow.window!.earliestCheckAt).toBe(x.rootZone.environment.watering.drying.now)
    expect(r.rootZone.watering.waterDeficit!.netDeficitMl!.min).toBeCloseTo(300, 10)
    expect(r.application.appliedAmountCandidateMl!.min).toBeCloseTo(375, 10)
    expect(r.application.appliedAmountCandidateMl!.max).toBe(390)
    expect(r.application.retainedEnvelopeMl!.max).toBe(312)
    expect(r.rootZone.watering.waterDeficit!.appliedAmountMl).toBeNull()
    expect(r.rootZone.watering.snapshot.drying.lastConfirmedWateringAt).toBeNull()
    expect(x).toEqual(before); expect(replayIrrigationWateringSample(r.snapshot)).toEqual(r)
  })
  it.each(['wet', 'unknown', 'expired', 'surface', 'pot_risk', 'unpublished'] as const)('%s阻止正缺口直接变成施水候选', kind => {
    const x = sample(); const w = x.rootZone.environment.watering
    if (kind === 'wet' || kind === 'unknown') { w.soil!.state = kind }
    if (kind === 'expired') { w.soil!.validUntil = w.drying.now; w.soil!.collectedAt -= 1; x.rootZone.rootZone.observedAt -= 1 }
    if (kind === 'surface') { w.soil!.scope = 'surface' }
    if (kind === 'pot_risk') { w.potSafety = 'drainage_risk' }
    if (kind === 'unpublished') { w.wateringPolicyApproved = false }
    if (kind === 'expired') { expect(() => replayIrrigationWateringSample(x)).toThrow(); return }
    const r = replayIrrigationWateringSample(x)
    expect(r.application.appliedAmountCandidateMl).toBeNull()
  })
  it.each(['limited', 'none', 'unknown'] as const)('非自由排水%s不套用本候选', drainage => {
    const x = sample(); x.application!.drainage = drainage
    expect(replayIrrigationWateringSample(x).application.appliedAmountCandidateMl).toBeNull()
  })
  it.each(['method', 'cultivation', 'observation', 'future', 'unaccounted'] as const)('拒绝%s破坏参考资格', kind => {
    const x = sample()
    if (kind === 'method') { x.methodRef = 'different' }
    if (kind === 'cultivation') { x.application!.cultivationRef = 'repotted' }
    if (kind === 'observation') { x.application!.rootObservationRef = 'other' }
    if (kind === 'future') { x.application!.observedAt += 1 }
    if (kind === 'unaccounted') { x.application!.waterBalanceAccounted = false }
    expect(() => replayIrrigationWateringSample(x)).toThrow()
  })
  it('缺供排水参考保留根区和日期，不猜实际浇入量', () => {
    const x = sample(); x.application = null
    const r = replayIrrigationWateringSample(x)
    expect(r.application.appliedAmountCandidateMl).toBeNull()
    expect(r.rootZone.watering.waterDeficit!.netDeficitMl!.min).toBeCloseTo(300, 10)
  })
  it('定量根区明显未到检查阈值时不相信矛盾的目标干燥标签', () => {
    const x = sample(); x.rootZone.rootZone.water.currentVwc = { min: 0.2, max: 0.2 }
    const r = replayIrrigationWateringSample(x)
    expect(r.application.status).toBe('conflicting_evidence')
    expect(r.application.appliedAmountCandidateMl).toBeNull()
  })
})
