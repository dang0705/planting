import { describe, expect, it } from 'vitest'
import { replayCompletedDryCycle } from '../../src/care/application/replay-completed-dry-cycle.js'

/** unit_fake：依据批准计划的未校准残差、条件与版本失效、跨轮反馈规则；无替身，无数据库或实测循环。 */
describe('unit_fake 历史干湿循环资格与独立残差', () => {
  // 秒级手算区间差：[120, 150] - [100, 130] = [-10, 50]。
  const input = {
    actualWateredAtMs: 0,
    computedAtMs: 200_000,
    predictedTargetWindow: { earliestMs: 100_000, latestMs: 130_000 },
    observedTargetWindow: { earliestMs: 120_000, latestMs: 150_000 },
    reliableCompletedCycle: true,
    cultivationConditionsUnchanged: true,
    predictionVersionCompatible: true,
    predictionExcludesPersonalCalibration: true,
    calibrationPolicyApproved: false,
  } as const

  it('重叠预测与观察保留双向残差，未发布策略也能离线回放', () => {
    expect(replayCompletedDryCycle(input)).toEqual({
      scope: 'offline_replay', status: 'replay_ready',
      residualSeconds: { lower: -10, upper: 50 },
      calibrationEligible: false, personalCalibration: null,
    })
  })

  it('观察整体较晚，正残差；不从残差自由生成倍率', () => {
    const result = replayCompletedDryCycle({ ...input, observedTargetWindow: { earliestMs: 140_000, latestMs: 160_000 }, calibrationPolicyApproved: true })
    expect(result.residualSeconds).toEqual({ lower: 10, upper: 60 })
    expect(result.calibrationEligible).toBe(true)
    expect(result.personalCalibration).toBeNull()
  })

  it('观察整体较早，负残差', () => {
    expect(replayCompletedDryCycle({ ...input, observedTargetWindow: { earliestMs: 50_000, latestMs: 80_000 } }).residualSeconds)
      .toEqual({ lower: -80, upper: -20 })
  })

  it('点值与毫秒小数秒换算保持精度', () => {
    expect(replayCompletedDryCycle({ ...input, predictedTargetWindow: { earliestMs: 100_000, latestMs: 100_000 }, observedTargetWindow: { earliestMs: 100_250, latestMs: 100_250 } }).residualSeconds)
      .toEqual({ lower: 0.25, upper: 0.25 })
  })

  it.each(['reliableCompletedCycle', 'cultivationConditionsUnchanged', 'predictionVersionCompatible', 'predictionExcludesPersonalCalibration'] as const)('%s 必须明确满足', field => {
    for (const value of [false, null]) {
      expect(replayCompletedDryCycle({ ...input, [field]: value })).toMatchObject({ status: 'insufficient_evidence', residualSeconds: null, calibrationEligible: false, personalCalibration: null })
    }
  })

  it.each([false, null] as const)('策略=%s 不阻断离线残差，也不批准个体学习', calibrationPolicyApproved => {
    expect(replayCompletedDryCycle({ ...input, calibrationPolicyApproved })).toMatchObject({ status: 'replay_ready', calibrationEligible: false, personalCalibration: null })
  })

  it('缺实际浇水起点，不伪造零进度', () => {
    expect(replayCompletedDryCycle({ ...input, actualWateredAtMs: null })).toMatchObject({ status: 'insufficient_evidence', residualSeconds: null })
  })

  it.each(['predictedTargetWindow', 'observedTargetWindow'] as const)('%s 缺失，不猜测窗口', field => {
    expect(replayCompletedDryCycle({ ...input, [field]: null })).toMatchObject({ status: 'insufficient_evidence', residualSeconds: null })
  })

  it('观察尚在未来，不把本轮未完成循环当作历史反馈', () => {
    expect(replayCompletedDryCycle({ ...input, computedAtMs: 140_000 })).toMatchObject({ status: 'insufficient_evidence', residualSeconds: null })
  })

  it('观察或预测早于实际浇水，拒绝混用跨循环记录', () => {
    expect(() => replayCompletedDryCycle({ ...input, actualWateredAtMs: 125_000 })).toThrow(RangeError)
  })

  it.each(['predictedTargetWindow', 'observedTargetWindow'] as const)('%s 倒序或非法时间拒绝', field => {
    for (const window of [{ earliestMs: 2, latestMs: 1 }, { earliestMs: NaN, latestMs: 10 }, { earliestMs: '0', latestMs: 10 }, { earliestMs: 1.5, latestMs: 10 }, {}]) {
      expect(() => replayCompletedDryCycle({ ...input, [field]: window } as never)).toThrow()
    }
  })

  it('缺证据不能掩盖其他字段脏类型', () => {
    expect(() => replayCompletedDryCycle({ ...input, actualWateredAtMs: null, predictionExcludesPersonalCalibration: 'true' } as never)).toThrow(TypeError)
  })

  it('拒绝不存在的计算时刻或输入对象', () => {
    for (const computedAtMs of [undefined, NaN, Infinity, '200000', 8_640_000_000_000_001]) {
      expect(() => replayCompletedDryCycle({ ...input, computedAtMs } as never)).toThrow(TypeError)
    }
    expect(() => replayCompletedDryCycle(null as never)).toThrow(TypeError)
  })

  it('不可变历史输入不被追加校准或改写', () => {
    const frozen = Object.freeze({ ...input, predictedTargetWindow: Object.freeze({ ...input.predictedTargetWindow }), observedTargetWindow: Object.freeze({ ...input.observedTargetWindow }) })
    expect(replayCompletedDryCycle(frozen).residualSeconds).toEqual({ lower: -10, upper: 50 })
    expect(frozen).toEqual(input)
  })
})
