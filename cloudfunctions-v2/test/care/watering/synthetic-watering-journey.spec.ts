import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replayWateringTiming, type WateringTimingReplayInput } from '../../../src/care/application/replay-watering-timing.js'
import { deriveMeasuredPot } from '../../../src/care/cultivation/derive-measured-pot.js'

/** 单个合成场景的输入与先于测试落盘的独立手算答案。 */
interface SyntheticScenario {
  /** 仅供离线研究追踪的稳定场景标识，不是用户植物身份。 */
  readonly id: string
  /** 中文场景含义，说明本例要验证的行为。 */
  readonly title: string
  /** 各资格均为明示模拟假设，不是已发布真实植物策略。 */
  readonly input: WateringTimingReplayInput
  /** 用户已确认规则与人工区间算术确定的局部结果。 */
  readonly expected: Readonly<Record<string, unknown>>
  /** 独立净缺口手算值；不代表实际施水量。 */
  readonly expectedNetDeficitMl: { readonly min: number; readonly max: number } | null
}

/** JSON夹具只承载合成条件、来源边界及独立Expected，不包含计算实现。 */
interface SyntheticFixture {
  /** 明确实验性质，不能误报为真实采集样本。 */
  readonly classification: string
  /** 五场景共用的植物基线，仅为合成参考条件。 */
  readonly sharedPlantBaseline: WateringTimingReplayInput['drying']['baseline']
  /** 本轮最小五个业务数学场景。 */
  readonly scenarios: readonly SyntheticScenario[]
  /** V1只读来源外形与模拟资格分开，几何不能替代基质体积。 */
  readonly potSeed: {
    /** 非身份外形种子的厘米尺寸，不声称实际内盆已验真。 */
    readonly dimensionsCm: { readonly potTopDiameterCm: number; readonly potBottomDiameterCm: number; readonly potHeightCm: number }
    /** 原样资料不足时保留未知资格，不把字符串true当布尔验真。 */
    readonly unqualifiedInput: { readonly actualInnerPotConfirmed: null; readonly drainageAvailable: null }
    /** 仅用于本组合成回放的显式假设，未授予生产资格。 */
    readonly syntheticQualificationAssumptions: { readonly actualInnerPotConfirmed: true; readonly drainageAvailable: true }
    /** 外部圆台手算答案，不从被测函数结果取得。 */
    readonly independentExpected: { readonly containerVolumeMl: number }
  }
}

const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../../models/care/fixtures/synthetic-watering-journey.json'), 'utf8')) as SyntheticFixture

/**
 * L3 unit_fake：Expected先落合成制品，来自用户批准规则与独立区间手算。
 * 真实经过盆器派生→回放应用→历史/观察积分→当前窗口→安全门/日期/净缺口；无计算替身。
 * 身份、发布、Provider、映射/保水校准及数据库不在路径内；qualification=true仅模拟假设。
 * 不修改产品，不宣称TDD或正式日期验收。I1/I2/I3覆盖；I4/I5不适用，无鉴权入口和写操作。
 */
describe('合成浇水条件贯通回放，非正式策略', () => {
  it.each(fixture.scenarios.map(scenario => ({ scenario })))('$scenario.title', ({ scenario }) => {
    const pot = deriveMeasuredPot({ ...fixture.potSeed.dimensionsCm, ...fixture.potSeed.syntheticQualificationAssumptions })
    const input = { ...structuredClone(scenario.input), potSafety: pot.safety }
    const before = structuredClone(input)
    const result = replayWateringTiming(input)
    expect(fixture.classification).toBe('synthetic_experimental')
    expect(result).toMatchObject(scenario.expected)
    expect(result.snapshot.drying.baseline).toEqual(fixture.sharedPlantBaseline)
    expect(result.snapshot.drying.lastConfirmedWateringAt).toBeNull()
    expect(result.productionAdmission).toBe(false)
    expect(input).toEqual(before)
    expect(replayWateringTiming(result.snapshot)).toEqual(result)
    expect(pot.substrateVolumeMl).toBeNull()
    if (scenario.expectedNetDeficitMl === null) {
      expect(result.waterDeficit).toBeNull()
    } else {
      expect(result.waterDeficit!.netDeficitMl!.min).toBeCloseTo(scenario.expectedNetDeficitMl.min, 9)
      expect(result.waterDeficit!.netDeficitMl!.max).toBeCloseTo(scenario.expectedNetDeficitMl.max, 9)
      expect(result.waterDeficit!.appliedAmountMl).toBeNull()
      expect(input.waterDeficit!.effectiveSubstrateVolumeMl).toEqual({ min: 1800, max: 2400 })
    }
  })

  it.each(['mapping', 'reliability', 'surface'])('撤回%s资格不能沿用模拟日期', qualification => {
    const original = structuredClone(fixture.scenarios[0]!.input)
    const input: WateringTimingReplayInput = { ...original,
      observedRemaining: qualification === 'mapping' ? { ...original.observedRemaining!, mappingValidated: false } : original.observedRemaining!,
      soil: qualification === 'reliability' ? { ...original.soil!, reliable: false }
        : qualification === 'surface' ? { ...original.soil!, scope: 'surface' } : original.soil,
    }
    const result = replayWateringTiming(input)
    expect(result.observedCycle.status).toBe('insufficient_evidence')
    expect(result.currentCycleWindow.window).toBeNull()
    expect(result.localCheckWindow).toMatchObject({ earliestCheckDate: null, latestCheckDate: null })
    expect(result.decision.action).toBe('insufficient_evidence')
    expect(result.drying.progress).toBeNull()
  })

  it('V1原样外形资料不证明内盆与排水，不输出几何或浇水许可', () => {
    const pot = deriveMeasuredPot({ ...fixture.potSeed.dimensionsCm, ...fixture.potSeed.unqualifiedInput })
    expect(pot).toEqual({ geometry: null, safety: 'insufficient_evidence', substrateVolumeMl: null, waterRetention: null })
    const result = replayWateringTiming({ ...fixture.scenarios[4]!.input, potSafety: pot.safety })
    expect(result.decision.action).toBe('insufficient_evidence')
  })

  it('显式模拟内盆与排水资格可算875π几何，但不生成基质体积或保水', () => {
    const pot = deriveMeasuredPot({ ...fixture.potSeed.dimensionsCm, ...fixture.potSeed.syntheticQualificationAssumptions })
    expect(pot.safety).toBe('safe')
    expect(pot.geometry!.containerVolumeMl).toBeCloseTo(fixture.potSeed.independentExpected.containerVolumeMl, 9)
    expect(pot.geometry!.containerVolumeLiters).toBeCloseTo(2.748893571891069, 12)
    expect(pot.substrateVolumeMl).toBeNull()
    expect(pot.waterRetention).toBeNull()
  })
})
