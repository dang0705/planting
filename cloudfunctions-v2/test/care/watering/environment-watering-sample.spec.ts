import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replayEnvironmentalWateringSample, type EnvironmentalWateringSample } from '../../../models/care/experiments/replay-environmental-watering-sample.js'

const origin = Date.UTC(2026, 9, 8)
const dayMs = 86_400_000
const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../../models/care/fixtures/environment-watering-sample.json'), 'utf8')) as Mutable<EnvironmentalWateringSample>

/** 测试专用可变副本，不放宽被测输入；Expected独立手算。 */
type Mutable<T> = T extends readonly (infer V)[] ? Mutable<V>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
function sample(): Mutable<EnvironmentalWateringSample> {
  return structuredClone(fixture)
}

/** 独立合成参数，不从被测输出提取；参考VPD来自FAO公式20°C、50%RH手算。 */
function nonlinearSample(): Mutable<EnvironmentalWateringSample> {
  const value = sample()
  value.watering.observedRemaining!.remainingDryUnits = { min: 0.5, max: 1 }
  value.days.forEach(day => {
    day.demand = { basis: 'nonlinear_research_candidate', sourceRef: 'synthetic:joint-response',
      parameters: { version: 'light-log-vpd-hypothesis/v1', sourceRef: 'synthetic:response-parameters', referenceRef: 'synthetic:reference',
        referencePpfd: 20, referenceVpdKpa: 1.169140635463723, lightHalfSaturationPpfd: 20, vpdSensitivity: 0.5,
        referenceTranspirationShare: 0.75, validPpfd: { min: 0, max: 1000 }, validVpdKpa: { min: 0, max: 10 } },
      soilEvaporation: { referenceRef: 'synthetic:reference', range: { min: 1, max: 1 } },
      lightTimeAssumption: 'interval_mean_held_constant', leafTemperatureAssumption: 'equals_air',
    }
  })
  return value
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
    const input = sample(); input.days.forEach(day => { if (day.demand.basis === 'synthetic_manual_assignment') { day.demand.range = { min: 2, max: 4 } } })
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

/** L3 unit_fake：不替换光照/气候/响应/积分；仅原始气象、参数和盆土定量状态为合成样本。 */
describe('同盆逐时非线性需求到日期', () => {
  it('夜间保留土壤失水，逐时响应给出16:30至次日13:30', () => {
    const input = nonlinearSample(); const result = replayEnvironmentalWateringSample(input)
    expect(result.demandMapping).toBe('experimental_nonlinear_response')
    expect(result.watering.currentCycleWindow.window!.earliestCheckAt).toBeCloseTo(origin + 16.5 * 3600000, 0)
    expect(result.watering.currentCycleWindow.window!.latestCheckAt).toBeCloseTo(origin + dayMs + 13.5 * 3600000, 0)
    expect(result.watering.snapshot.drying.baseline).toEqual(fixture.watering.drying.baseline)
    expect(result.productionAdmission).toBe(false)
    expect(replayEnvironmentalWateringSample(result.snapshot)).toEqual(result)
  })
  it('Lux翻倍驱动日期提前而基线不变', () => {
    const input = nonlinearSample()
    input.days.forEach(day => { day.light.observation = { ...day.light.observation, lux: { lower: 2000, upper: 2000 } } })
    const result = replayEnvironmentalWateringSample(input)
    expect(result.watering.currentCycleWindow.window!.earliestCheckAt).toBeCloseTo(origin + 14.4 * 3600000, 0)
    expect(result.watering.currentCycleWindow.window!.latestCheckAt).toBeCloseTo(origin + dayMs + 9.6 * 3600000, 0)
    expect(result.watering.snapshot.drying.baseline).toEqual(fixture.watering.drying.baseline)
  })
  it('日内升温保留逐时VPD包络，不把日末值铺满全天', () => {
    const input = nonlinearSample()
    input.days[0]!.climate.experiment.coefficients!.heatInputCPerSecond = 5 / 86400
    const result = replayEnvironmentalWateringSample(input)
    const intervals = result.days[0]!.responseIntervals!
    expect(intervals).toHaveLength(24)
    expect(intervals[0]!.vpdKpa.min).toBeCloseTo(1.169140635463723, 10)
    expect(intervals[0]!.vpdKpa.max).toBeLessThan(1.21)
    expect(intervals[23]!.vpdKpa.max).toBeCloseTo(1.9986370820431245, 10)
    expect(result.watering.currentCycleWindow.window!.earliestCheckAt).toBeLessThan(origin + 16.5 * 3600000)
  })
  it('缺非线性参数保持缺段，不退回人工需求', () => {
    const input = nonlinearSample()
    input.days.forEach(day => { if (day.demand.basis === 'nonlinear_research_candidate') { day.demand.parameters = null } })
    const result = replayEnvironmentalWateringSample(input)
    expect(result.watering.localCheckWindow.earliestCheckDate).toBeNull()
    expect(result.watering.snapshot.drying.intervals).toEqual([])
  })
  it('缺第二日环境不续用第一日响应补日期', () => {
    const input = nonlinearSample(); input.days[1]!.light.observation = { ...input.days[1]!.light.observation, source: 'experimental_camera' }
    const result = replayEnvironmentalWateringSample(input)
    expect(result.watering.currentCycleWindow.window!.earliestCheckAt).toBeCloseTo(origin + 16.5 * 3600000, 0)
    expect(result.watering.currentCycleWindow.window!.latestCheckAt).toBeNull()
  })
  it('拒绝把未声明叶温或时段假设的候选接入', () => {
    const input = nonlinearSample()
    if (input.days[0]!.demand.basis === 'nonlinear_research_candidate') { input.days[0]!.demand.lightTimeAssumption = 'instantaneous' as never }
    expect(() => replayEnvironmentalWateringSample(input)).toThrow()
  })
  it.each(['parameters', 'manual'] as const)('拒绝同轮%s变更破坏共同参考条件', kind => {
    const input = nonlinearSample()
    if (kind === 'manual') { input.days[1]!.demand = structuredClone(fixture.days[1]!.demand) }
    else if (input.days[1]!.demand.basis === 'nonlinear_research_candidate') { input.days[1]!.demand.parameters!.referencePpfd = 40 }
    expect(() => replayEnvironmentalWateringSample(input)).toThrow()
  })
})
