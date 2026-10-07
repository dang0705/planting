import { describe, expect, it } from 'vitest'
import { replayIndoorClimateStep } from '../../../models/care/experiments/indoor-climate.js'

/** L1 unit_fake：EnergyPlus平衡关系、FAO式11及独立手算；只验证研究候选，不授权生产。 */
const scenario = () => ({
  initialIndoor: { temperatureC: 20, relativeHumidityPercent: 50 },
  outdoor: { temperatureC: 20, relativeHumidityPercent: 50 },
  pressureKpa: 101.325, durationSeconds: 3600,
  coefficients: { temperatureExchangePerSecond: 0, heatInputCPerSecond: 0, moistureExchangePerSecond: 0, moistureInputKgPerKgPerSecond: 0 },
})

describe('unit_fake 室内热湿平衡研究候选', () => {
  it('没有热湿交换时保持室内状态与研究属性', () => {
    const result = replayIndoorClimateStep(scenario())
    expect(result).toMatchObject({ status: 'candidate', scope: 'offline_experiment', productionAdmission: false, temperatureC: 20 })
    if (result.status !== 'candidate') {throw new Error('手算场景应可算')}
    expect(result.relativeHumidityPercent).toBeCloseTo(50, 10)
    expect(result.vpdKpa).toBeCloseTo(1.169140635463723, 10)
  })
  it('封闭空气只加热时不保持原相对湿度', () => {
    const input = scenario(); input.coefficients.heatInputCPerSecond = 5 / 3600
    const result = replayIndoorClimateStep(input)
    if (result.status !== 'candidate') {throw new Error('手算加热场景应可算')}
    expect(result.temperatureC).toBeCloseTo(25, 10)
    expect(result.relativeHumidityPercent).toBeCloseTo(36.9072813727561, 8)
    expect(result.vpdKpa).toBeCloseTo(1.9986370820431243, 8)
  })
  it('热响应和水分交换分别按含湿比推进，不平均RH', () => {
    const input = scenario(); input.outdoor = { temperatureC: 10, relativeHumidityPercent: 80 }
    input.coefficients.temperatureExchangePerSecond = Math.LN2 / 3600
    input.coefficients.moistureExchangePerSecond = Math.LN2 / 3600
    const result = replayIndoorClimateStep(input)
    if (result.status !== 'candidate') {throw new Error('半衰期场景应可算')}
    expect(result.temperatureC).toBeCloseTo(15, 10)
    expect(result.humidityRatioKgPerKg).toBeCloseTo(0.00667489328361234, 10)
    expect(result.relativeHumidityPercent).toBeCloseTo(63.08644757717663, 8)
    expect(result.relativeHumidityPercent).not.toBeCloseTo(65, 1)
  })
  it('同一室外条件下增加房间净热输入会改变室内结果', () => {
    const input = scenario(); input.coefficients.temperatureExchangePerSecond = Math.LN2 / 3600
    input.coefficients.heatInputCPerSecond = 10 * Math.LN2 / 3600
    const result = replayIndoorClimateStep(input)
    if (result.status !== 'candidate') {throw new Error('带热输入场景应可算')}
    expect(result.temperatureC).toBeCloseTo(25, 10)
    expect(result.relativeHumidityPercent).toBeCloseTo(36.9072813727561, 8)
  })
  it('相同常系数条件分两段与整段一致，输入不被改变', () => {
    const input = scenario(); input.outdoor = { temperatureC: 25, relativeHumidityPercent: 40 }
    input.coefficients.temperatureExchangePerSecond = 0.0001
    input.coefficients.moistureExchangePerSecond = 0.0002
    const before = structuredClone(input); const whole = replayIndoorClimateStep(input)
    const first = replayIndoorClimateStep({ ...input, durationSeconds: 1800 })
    if (whole.status !== 'candidate' || first.status !== 'candidate') {throw new Error('时段场景应可算')}
    const second = replayIndoorClimateStep({ ...input, durationSeconds: 1800, initialIndoor: first })
    if (second.status !== 'candidate') {throw new Error('第二段应可算')}
    expect(second.temperatureC).toBeCloseTo(whole.temperatureC, 10)
    expect(second.relativeHumidityPercent).toBeCloseTo(whole.relativeHumidityPercent, 10)
    expect(input).toEqual(before)
  })
  it('零交换时湿源仍增加含湿量，不随温度分支丢失', () => {
    const input = scenario(); input.initialIndoor.relativeHumidityPercent = 0
    input.coefficients.moistureInputKgPerKgPerSecond = 0.001 / 3600
    const result = replayIndoorClimateStep(input)
    if (result.status !== 'candidate') {throw new Error('正湿源场景应可算')}
    expect(result.humidityRatioKgPerKg).toBeCloseTo(0.001, 12)
  })
  it('降温超饱和不钳成百分之百继续输出VPD', () => {
    const input = scenario(); input.coefficients.heatInputCPerSecond = -15 / 3600
    const result = replayIndoorClimateStep(input)
    expect(result).toMatchObject({ status: 'outside_model_scope', reason: 'phase_change_or_moisture_deficit' })
    expect(result).not.toHaveProperty('vpdKpa')
  })
  it('负含湿量不钳成零继续计算', () => {
    const input = scenario(); input.coefficients.moistureInputKgPerKgPerSecond = -0.01
    expect(replayIndoorClimateStep(input)).toMatchObject({ status: 'outside_model_scope' })
  })
  it('原状态恰好饱和不会因浮点往返误判凝结', () => {
    const input = scenario(); input.initialIndoor = { temperatureC: 25, relativeHumidityPercent: 100 }
    input.outdoor = { temperatureC: 25, relativeHumidityPercent: 100 }; input.durationSeconds = 0
    expect(replayIndoorClimateStep(input)).toMatchObject({ status: 'candidate', temperatureC: 25, relativeHumidityPercent: 100, vpdKpa: 0 })
  })
  it('末态恢复未饱和不能掩盖时段内已超出无凝结假设', () => {
    // 独立解析解：100s时15.518°C/RH约133.55%，3600s末态RH约54.35%。
    const input = scenario(); input.initialIndoor = { temperatureC: 25, relativeHumidityPercent: 80 }
    input.outdoor = { temperatureC: 10, relativeHumidityPercent: 50 }
    input.coefficients.temperatureExchangePerSecond = 0.01
    input.coefficients.moistureExchangePerSecond = 0.001
    expect(replayIndoorClimateStep(input)).toMatchObject({ status: 'outside_model_scope' })
  })
  it('有效零湿度保持零；没有研究参数时不补默认', () => {
    const input = scenario(); input.initialIndoor.relativeHumidityPercent = 0
    expect(replayIndoorClimateStep(input)).toMatchObject({ status: 'candidate', relativeHumidityPercent: 0 })
    expect(replayIndoorClimateStep({ ...input, initialIndoor: null })).toMatchObject({ status: 'insufficient_evidence', reason: 'missing_initial_state' })
    expect(replayIndoorClimateStep({ ...input, coefficients: null })).toMatchObject({ status: 'insufficient_evidence', reason: 'missing_coefficients' })
  })
  it.each([
    { pressureKpa: 0 }, { pressureKpa: 0.1 }, { pressureKpa: NaN }, { durationSeconds: -1 }, { durationSeconds: Infinity },
    { initialIndoor: { temperatureC: 20, relativeHumidityPercent: 101 } },
    { outdoor: { temperatureC: NaN, relativeHumidityPercent: 50 } },
    { coefficients: { ...scenario().coefficients, temperatureExchangePerSecond: -0.1 } },
    { coefficients: { ...scenario().coefficients, moistureExchangePerSecond: NaN } },
  ])('拒绝非法物理量 %j', (change) => {
    expect(() => replayIndoorClimateStep({ ...scenario(), ...change })).toThrow()
  })
})
