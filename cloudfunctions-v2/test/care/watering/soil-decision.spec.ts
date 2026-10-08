import { describe, expect, it } from 'vitest'
import { evaluateWateringDecision, type WateringDecisionInput } from '../../../src/care/watering/evaluate-watering-decision.js'
const now = Date.UTC(2026, 9, 8)
const soil = (state: 'wet' | 'waterlogged' | 'target_dry' | 'unknown', scope: 'surface' | 'root_zone' = 'root_zone') => ({ state, scope, reliable: true, targetCriteriaConfirmed: true, collectedAt: now - 1000, validUntil: now + 1000 })
const input = (): WateringDecisionInput => ({ now, wateringPolicyApproved: true, potSafety: 'safe', soil: null, progress: { min: 12, max: 12 }, baseline: { min: 5, max: 8 } })
/** L1 unit_fake：批准计划的盆土优先级、范围/有效期和独立预测窗口规则。 */
describe('当前盆土安全门与浇水行动', () => {
  it.each(['wet', 'waterlogged'] as const)('可靠%s否决已超窗的预测', state => {
    expect(evaluateWateringDecision({ ...input(), soil: soil(state) })).toMatchObject({ action: 'pause_watering', soilGate: 'pause_watering' })
  })
  it('缺进度仍可用可靠根区目标证据', () => {
    expect(evaluateWateringDecision({ ...input(), progress: null, baseline: null, soil: soil('target_dry') })).toMatchObject({ action: 'water_allowed' })
  })
  // Expected 来源更新：用户 2026-10-08 裁决——“表土干再浇”与喜湿类植物，表土已干即达到目标；
  // 是否达到目标由上游按植物触发条件写入 targetCriteriaConfirmed，干透型植物的表土观察不会被确认。
  it('表土干且上游已按植物触发条件确认达到目标 → 可以浇水', () => {
    expect(evaluateWateringDecision({ ...input(), progress: null, baseline: null, soil: soil('target_dry', 'surface') }))
      .toMatchObject({ action: 'water_allowed', soilGate: 'target_dry_confirmed' })
  })
  it('Reverse：表土干但植物要求根区确认（未确认目标）→ 不放行', () => {
    expect(evaluateWateringDecision({ ...input(), progress: null, baseline: null, soil: { ...soil('target_dry', 'surface'), targetCriteriaConfirmed: false } }))
      .toMatchObject({ action: 'insufficient_evidence', soilGate: 'unknown' })
  })
  it('过期、不可靠和未确认目标的证据不能放行', () => {
    for (const evidence of [{ ...soil('target_dry'), validUntil: now }, { ...soil('target_dry'), reliable: false }, { ...soil('target_dry'), targetCriteriaConfirmed: false }]) {
      expect(evaluateWateringDecision({ ...input(), soil: evidence })).toMatchObject({ action: 'priority_check', soilGate: 'unknown' })
    }
  })
  it('排水风险优先于干土；缺内盆证据不能获得浇水许可', () => {
    expect(evaluateWateringDecision({ ...input(), soil: soil('target_dry'), potSafety: 'drainage_risk' })).toMatchObject({ action: 'review_drainage' })
    expect(evaluateWateringDecision({ ...input(), soil: soil('target_dry'), potSafety: 'insufficient_evidence' })).toMatchObject({ action: 'insufficient_evidence' })
  })
  it('无获准算法不启用旧规则；可靠证据安全状态仍独立可见', () => {
    expect(evaluateWateringDecision({ ...input(), wateringPolicyApproved: false, soil: soil('wet') })).toMatchObject({ action: 'temporarily_unavailable', soilGate: 'pause_watering' })
  })
  it.each([[1, 2, 'check_later'], [5, 8, 'check_now'], [9, 10, 'priority_check'], [2, 10, 'check_now']])('预测[%s,%s]只决定检查行为', (min, max, action) => {
    expect(evaluateWateringDecision({ ...input(), progress: { min: min as number, max: max as number } })).toMatchObject({ action })
  })
  it('缺起点/进度不猜窗口；未来证据与脏类型拒绝', () => {
    expect(evaluateWateringDecision({ ...input(), progress: null })).toMatchObject({ action: 'insufficient_evidence', windowState: null })
    expect(() => evaluateWateringDecision({ ...input(), soil: { ...soil('wet'), collectedAt: now + 1 } })).toThrow()
    expect(() => evaluateWateringDecision({ ...input(), wateringPolicyApproved: 'true' } as unknown as WateringDecisionInput)).toThrow()
    expect(() => evaluateWateringDecision({ ...input(), soil: { ...soil('wet'), reliable: 'true' } } as unknown as WateringDecisionInput)).toThrow()
  })
})
