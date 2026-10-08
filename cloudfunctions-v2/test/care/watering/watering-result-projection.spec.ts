import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replayIrrigationWateringSample, type IrrigationWateringSample } from '../../../models/care/experiments/replay-irrigation-watering-sample.js'
import type { RootZoneWateringSample } from '../../../models/care/experiments/replay-root-zone-watering-sample.js'

type Mutable<T> = T extends readonly (infer V)[] ? Mutable<V>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
const artifact = JSON.parse(readFileSync(resolve(__dirname, '../../../models/care/root-zone-watering-sample-results.json'), 'utf8')) as { baseSnapshot: RootZoneWateringSample }
/** 仅取已批准合成输入；不读取制品输出作为Expected。 */
function sample(): Mutable<IrrigationWateringSample> {
  const rootZone = structuredClone(artifact.baseSnapshot) as Mutable<RootZoneWateringSample>
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
/** L3 unit_fake。Expected：独立结果合同和手算375～390mL；经过完整样本回放，不替换内部模块。 */
describe('浇水最外层结果出口', () => {
  it('同一结果给出当前许可与有界水量，检查时间不改名为浇水日期', () => {
    const x = sample(); const { candidate } = replayIrrigationWateringSample(x).assessment
    expect(candidate).toMatchObject({ capabilityType: 'watering', contractVersion: 'care-capability-result/v1',
      detailsSchemaVersion: 'watering-assessment/v1', status: 'ready', confidence: 'medium',
      generatedAt: new Date(x.rootZone.environment.watering.drying.now).toISOString(),
      details: { action: 'water_allowed', amountMl: { min: 375, max: 390 }, checkWindow: { purpose: 'soil_check' } } })
    expect(candidate.details.netDeficitMl!.min).toBeCloseTo(300, 10)
    expect(candidate.details).not.toHaveProperty('nextWateringDate')
  })
  it('定量与干燥标签冲突撤回内层许可、日期和水量', () => {
    const x = sample(); x.rootZone.rootZone.water.currentVwc = { min: 0.2, max: 0.2 }
    const r = replayIrrigationWateringSample(x)
    expect(r.rootZone.watering.decision.action).toBe('water_allowed')
    expect(r.assessment.candidate).toMatchObject({ status: 'insufficient_evidence',
      details: { action: 'check_now', checkWindow: null, amountMl: null, netDeficitMl: null, missingEvidence: ['consistent_root_zone_state'] } })
  })
  it('湿土不得与仍保留的正净缺口拼成施水指令', () => {
    const x = sample(); x.rootZone.environment.watering.soil!.state = 'wet'
    const r = replayIrrigationWateringSample(x)
    expect(r.rootZone.watering.waterDeficit!.netDeficitMl!.min).toBeGreaterThan(0)
    expect(r.assessment.candidate).toMatchObject({ status: 'ready', details: { action: 'pause_watering', checkWindow: null, amountMl: null, netDeficitMl: null } })
  })
  it.each(['limited', 'none', 'unknown'] as const)('%s排水不展示可执行日期和水量', drainage => {
    const x = sample(); x.application!.drainage = drainage
    expect(replayIrrigationWateringSample(x).assessment.candidate).toMatchObject({ status: 'insufficient_evidence',
      details: { action: 'review_drainage', checkWindow: null, amountMl: null } })
  })
  it('缺供排水参考仍保留可靠根区的定性许可，但量不猜测', () => {
    const x = sample(); x.application = null
    expect(replayIrrigationWateringSample(x).assessment.candidate).toMatchObject({ status: 'ready',
      details: { action: 'water_allowed', amountMl: null, missingEvidence: ['application_reference'] } })
  })
  it('没有安全单次交集时不截短成较小剂量', () => {
    const x = sample(); x.application!.maximumSingleApplicationMl = 350
    expect(replayIrrigationWateringSample(x).assessment.candidate).toMatchObject({ status: 'insufficient_evidence',
      details: { action: 'check_now', amountMl: null, checkWindow: null, missingEvidence: ['safe_application_range'] } })
  })
  it('零净缺口返回复查，不生成零毫升动作', () => {
    const x = sample(); x.rootZone.rootZone.water.targetVwc = { min: 0.15, max: 0.15 }
    expect(replayIrrigationWateringSample(x).assessment.candidate.details).toMatchObject({ action: 'check_now', amountMl: null })
  })
  it('只预测检查窗口时，不把数学施水包络放进结果', () => {
    const x = sample(); x.rootZone.rootZone.water.currentVwc = { min: 0.2, max: 0.2 }
    x.rootZone.environment.watering.soil!.state = 'unknown'
    const r = replayIrrigationWateringSample(x).assessment.candidate
    expect(r.status).toBe('ready')
    expect(r.details).toMatchObject({ action: 'check_later', amountMl: null, checkWindow: { purpose: 'soil_check' } })
    expect(r.details.checkWindow!.earliestAt).toBe('2026-10-09T13:30:00.000Z')
  })
  it('实验中存在日期和水量也不能通过正式出口泄漏', () => {
    const r = replayIrrigationWateringSample(sample())
    expect(r.assessment.candidate.status).toBe('ready')
    expect(r.assessment.publicResult).toMatchObject({ status: 'temporarily_unavailable', confidence: 'low',
      recommendedActions: [], validUntil: null,
      details: { action: 'temporarily_unavailable', checkWindow: null, amountMl: null, netDeficitMl: null } })
    expect(JSON.stringify(r.assessment.publicResult)).not.toMatch(/synthetic:|snapshotHash|sourceRef|plantReference|cultivationRef|375|390/)
  })
  it('输入未发布同样不能产生离线许可', () => {
    const x = sample(); x.rootZone.environment.watering.wateringPolicyApproved = false
    expect(replayIrrigationWateringSample(x).assessment.candidate).toMatchObject({ status: 'temporarily_unavailable',
      recommendedActions: [], details: { amountMl: null, checkWindow: null } })
  })
  it('实际浇水之前或同刻的盆土观察不能重新进入摘要', () => {
    const x = sample(); x.rootZone.environment.watering.drying.lastConfirmedWateringAt = x.rootZone.environment.watering.drying.now
    const r = replayIrrigationWateringSample(x)
    expect(r.rootZone.watering.currentCycleWindow.ignoredObservationReason).toBe('not_after_confirmed_watering')
    expect(r.assessment.candidate.details.soilState).toBe('unknown')
    expect(r.assessment.candidate.validUntil).toBeNull()
  })
  it('表土可见状态必须保留范围，不冒充根区判断', () => {
    const x = sample(); x.rootZone.environment.watering.soil!.scope = 'surface'
    const r = replayIrrigationWateringSample(x).assessment.candidate
    expect(r.details.soilScope).toBe('surface')
    expect(r.details.action).not.toBe('water_allowed')
    expect(r.details.amountMl).toBeNull()
  })
  it('输出不暴露内部证据，输入和原回放可重复且不产生浇水事实', () => {
    const x = sample(); const before = structuredClone(x); const r = replayIrrigationWateringSample(x)
    expect(x).toEqual(before)
    expect(replayIrrigationWateringSample(r.snapshot).assessment).toEqual(r.assessment)
    expect(r.rootZone.watering.snapshot.drying.lastConfirmedWateringAt).toBeNull()
    expect(JSON.stringify(r.assessment.candidate)).not.toMatch(/synthetic:|snapshotHash|sourceRef|plantReference|cultivationRef/)
    expect(Date.parse(r.assessment.candidate.validUntil!)).toBe(x.rootZone.environment.watering.soil!.validUntil)
  })
})
