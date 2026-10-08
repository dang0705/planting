import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replayEnvironmentalWateringSample, type EnvironmentalWateringSample } from '../../../models/care/experiments/replay-environmental-watering-sample.js'

const origin = Date.UTC(2026, 9, 8)
const dayMs = 86_400_000
const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../../models/care/fixtures/environment-watering-sample.json'), 'utf8')) as Mutable<EnvironmentalWateringSample>

/** 测试专用可变副本，允许构造错误场景；不放宽被测输入合同。 */
type Mutable<T> = T extends readonly (infer V)[] ? Mutable<V>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T

/** 输入直接来自合成制品；各Expected仍独立手算。 */
function sample(): Mutable<EnvironmentalWateringSample> {
  return structuredClone(fixture)
}

/**
 * L3 unit_fake，I1协作/I2缺段/I3语义拒绝；I4/I5不适用（无HTTP鉴权或写入）。
 * 来源：environment-watering-sample-contract.md的独立数学Expected与用户模拟授权。
 * 实际经过Lux→SunCalc/窗面→双通道积分、室内热湿候选、观察剩余积分和盆土安全门。
 * 模拟需求是显式替换的未准入边界；不声称已完成非线性响应或生产建议。
 */
describe('同盆环境派生到模拟浇水回放', () => {
  it('四日光照与室内候选准备后获得1至4天窗口，保留人工需求标记', () => {
    const input = sample(); const before = structuredClone(input)
    const result = replayEnvironmentalWateringSample(input)
    expect(result.productionAdmission).toBe(false)
    expect(result.demandMapping).toBe('pending_response_model')
    expect(result.days).toHaveLength(4)
    expect(result.days.every(day => day.light.status === 'available' && day.light.calibration.observation.atMs === origin - dayMs / 2)).toBe(true)
    expect(result.days[0]!.light.dailyIntegralMolPerM2!.lower).toBeCloseTo(0.864, 10)
    expect(result.days[0]!.climate).toMatchObject({ atMs: origin + dayMs, semantics: 'interval_end_estimate', result: { temperatureC: 20, relativeHumidityPercent: 50 } })
    expect(result.days[0]!.climate.result.vpdKpa).toBeCloseTo(1.169140635463723, 10)
    expect(result.watering.currentCycleWindow.window).toMatchObject({ earliestCheckAt: origin + dayMs, latestCheckAt: origin + 4 * dayMs })
    expect(result.watering.drying.progress).toBeNull()
    expect(input).toEqual(before)
    expect(replayEnvironmentalWateringSample(result.snapshot)).toEqual(result)
  })

  it('Lux翻倍只改变光照，不把DLI直接冒充需求倍率', () => {
    const input = sample(); input.days.forEach(day => { day.light.observation = { ...day.light.observation, lux: { lower: 2000, upper: 2000 } } })
    const result = replayEnvironmentalWateringSample(input)
    expect(result.days[0]!.light.dailyIntegralMolPerM2!.lower).toBeCloseTo(1.728, 10)
    expect(result.watering.currentCycleWindow.window).toMatchObject({ earliestCheckAt: origin + dayMs, latestCheckAt: origin + 4 * dayMs })
  })

  it('显式需求对照变为2至4时，窗口为0.5至2天', () => {
    const input = sample(); input.days.forEach(day => { day.demand.range = { min: 2, max: 4 } })
    expect(replayEnvironmentalWateringSample(input).watering.currentCycleWindow.window).toMatchObject({ earliestCheckAt: origin + dayMs / 2, latestCheckAt: origin + 2 * dayMs })
  })

  it('固定气压实验日末升温5度，重算RH且不作为日均VPD', () => {
    const input = sample(); input.days[0]!.climate.experiment.coefficients!.heatInputCPerSecond = 5 / 86400
    const result = replayEnvironmentalWateringSample(input)
    expect(result.days[0]!.climate.semantics).toBe('interval_end_estimate')
    expect(result.days[0]!.climate.result.temperatureC).toBeCloseTo(25, 10)
    expect(result.days[0]!.climate.result.relativeHumidityPercent).toBeCloseTo(36.90728137275609, 10)
    expect(result.days[0]!.climate.result.vpdKpa).toBeCloseTo(1.9986370820431245, 10)
    expect(result.watering.currentCycleWindow.window).toMatchObject({ earliestCheckAt: origin + dayMs, latestCheckAt: origin + 4 * dayMs })
  })

  it('第2日光照缺段时不沿调用者预填的10日需求补齐窗口', () => {
    const input = sample(); input.days[1]!.light.observation = { ...input.days[1]!.light.observation, source: 'experimental_camera' }
    const result = replayEnvironmentalWateringSample(input)
    expect(result.days[1]!.eligibleForSyntheticDemand).toBe(false)
    expect(result.watering.currentCycleWindow.window).toMatchObject({ earliestCheckAt: origin + dayMs, latestCheckAt: null, coverageEnd: origin + dayMs })
  })

  it.each(['initialIndoor', 'coefficients'] as const)('缺%s时不补室内初态或参数，也不生成日期', key => {
    const input = sample(); input.days.forEach(day => { day.climate.experiment[key] = null })
    const result = replayEnvironmentalWateringSample(input)
    expect(result.days.every(day => !day.eligibleForSyntheticDemand)).toBe(true)
    expect(result.watering.localCheckWindow.earliestCheckDate).toBeNull()
    expect(result.watering.localCheckWindow.latestCheckDate).toBeNull()
  })

  it.each(['position', 'duration', 'source', 'overlap'] as const)('拒绝%s错误，不拼接为同盆证据', kind => {
    const input = sample()
    if (kind === 'position') { input.days[0]!.climate.plantReference = 'other-plant' }
    if (kind === 'duration') { input.days[0]!.climate.experiment.durationSeconds = 3600 }
    if (kind === 'source') { input.days[0]!.demand.basis = 'published' as never }
    if (kind === 'overlap') { input.days[1] = structuredClone(input.days[0]!) }
    expect(() => replayEnvironmentalWateringSample(input)).toThrow()
  })

  it('无样本不借用已填干燥输入，湿土仍可独立暂停', () => {
    const input = sample(); input.days = []; input.watering.soil = { ...input.watering.soil!, state: 'wet' }
    const result = replayEnvironmentalWateringSample(input)
    expect(result.watering.drying.window).toBeNull()
    expect(result.watering.localCheckWindow.earliestCheckDate).toBeNull()
    expect(result.watering.decision.action).toBe('pause_watering')
  })
})
