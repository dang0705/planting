/**
 * 室内热湿平衡研究候选：仅用于补充算法证据，禁止从运行入口导入。
 * 依据、简化条件和发布边界见 ../indoor-climate-experiment-contract.md。
 * 所有速率与初态均由实验显式提供，不代表获准住宅参数。
 */

/** 同一位置同时刻的温湿度实验状态；不授予实测资格。 */
export interface ResearchClimatePoint {
  /** 摄氏温度。 */
  readonly temperatureC: number
  /** 相对湿度百分数，0为有效值。 */
  readonly relativeHumidityPercent: number
}

/** 常系数时段内的热湿平衡参数；明确零值，不以缺值代替零。 */
export interface ResearchClimateCoefficients {
  /** 总换热能力除以有效热容量，单位1/秒，非负。 */
  readonly temperatureExchangePerSecond: number
  /** 净热功率除以有效热容量，单位摄氏度/秒；制冷可为负。 */
  readonly heatInputCPerSecond: number
  /** 空气水分交换的等效速率，单位1/秒，非负；不复用热交换速率。 */
  readonly moistureExchangePerSecond: number
  /** 净湿源按干空气质量归一，单位kg水/(kg干空气·秒)；除湿可为负。 */
  readonly moistureInputKgPerKgPerSecond: number
}

/** 一段时间的显式实验输入；没有后台场景映射或默认房屋参数。 */
export interface IndoorClimateExperiment {
  /** 起始室内状态，缺失不能直接以室外初值替代。 */
  readonly initialIndoor: ResearchClimatePoint | null
  /** 时段内固定的室外边界；实际逐时Provider适配不属于本候选。 */
  readonly outdoor: ResearchClimatePoint
  /** 固定气压kPa，不能以Pa数值直接代入。 */
  readonly pressureKpa: number
  /** 实际时段秒数，允许0以验证初始状态，不默认为一小时。 */
  readonly durationSeconds: number
  /** 缺系数直接缺证据，不由空气分类标签推定。 */
  readonly coefficients: ResearchClimateCoefficients | null
}

/** 候选始终隔离正式运行；不会签发发布资格或测量资格。 */
interface ResearchBoundary {
  readonly scope: 'offline_experiment'
  readonly productionAdmission: false
}

/** 缺输入、超出简化模型和数学候选结果分别表达。 */
export type IndoorClimateExperimentResult = ResearchBoundary & (
  | { readonly status: 'insufficient_evidence'; readonly reason: 'missing_initial_state' | 'missing_coefficients' }
  /** 时段无法排除凝结，或出现负含湿量；不是已观测凝结的事实。 */
  | { readonly status: 'outside_model_scope'; readonly reason: 'phase_change_or_moisture_deficit' }
  | {
    readonly status: 'candidate'
    /** 时段末温度；不是区间均值或实测。 */
    readonly temperatureC: number
    /** 由末态温度和含湿比重算的RH百分数。 */
    readonly relativeHumidityPercent: number
    /** kg水/kg干空气；不等于体积绝对湿度。 */
    readonly humidityRatioKgPerKg: number
    /** 时段末空气VPD，kPa；不是蒸腾速率或日均VPD。 */
    readonly vpdKpa: number
  }
)

/** 分子量比来源于含湿比定义，不是待调节的养护参数。 */
const waterToDryAirMolarMassRatio = 0.62198
/** 实验输出标签不可由调用方改为正式结果。 */
const boundary = { scope: 'offline_experiment', productionAdmission: false } as const

/** 明确拒绝NaN、Infinity和非数值，不把null转为0。 */
function requireFinite(value: number): void {
  if (!Number.isFinite(value)) {throw new RangeError('热湿平衡输入或结果不是有限数值')}
}

/** FAO-56式11，液态水参考；该实验不声明任意温度的计量精度。 */
function saturationPressureKpa(temperatureC: number): number {
  requireFinite(temperatureC)
  if (temperatureC + 237.3 <= 0) {throw new RangeError('温度超出饱和压公式数学域')}
  const pressure = 0.6108 * Math.exp(17.27 * temperatureC / (temperatureC + 237.3))
  requireFinite(pressure)
  if (pressure <= 0) {throw new RangeError('饱和压不可表示')}
  return pressure
}

/** 根据RH得到水汽分压，再按干空气质量求含湿比，始终使用kPa。 */
function humidityRatio(point: ResearchClimatePoint, pressureKpa: number): number {
  requireFinite(point.relativeHumidityPercent)
  if (point.relativeHumidityPercent < 0 || point.relativeHumidityPercent > 100) {throw new RangeError('相对湿度百分数非法')}
  const vaporPressure = saturationPressureKpa(point.temperatureC) * point.relativeHumidityPercent / 100
  if (vaporPressure >= pressureKpa) {throw new RangeError('水汽分压必须小于总气压')}
  const ratio = waterToDryAirMolarMassRatio * vaporPressure / (pressureKpa - vaporPressure)
  requireFinite(ratio)
  return ratio
}

/**
 * dx/dt = rate·(outside-x)+source 的常系数解析解。
 * expm1保留短时段变化；零交换仍允许内部热湿源产生变化。
 */
function advance(initial: number, outside: number, rate: number, source: number, seconds: number): number {
  if (seconds === 0) {return initial}
  const exponent = rate * seconds
  const exchanged = -Math.expm1(-exponent)
  const effectiveSeconds = exponent === 0 ? seconds : exchanged / rate
  const result = initial * Math.exp(-exponent) + outside * exchanged + source * effectiveSeconds
  requireFinite(result)
  return result
}

/** 显式参数的单时段研究回放；不读配置、不写事实、不连接生产VPD入口。 */
export function replayIndoorClimateStep(input: IndoorClimateExperiment): IndoorClimateExperimentResult {
  requireFinite(input.pressureKpa); requireFinite(input.durationSeconds)
  if (input.pressureKpa <= 0 || input.durationSeconds < 0) {throw new RangeError('气压或时长非法')}
  const outdoorHumidity = humidityRatio(input.outdoor, input.pressureKpa)
  if (input.initialIndoor === null) {return { ...boundary, status: 'insufficient_evidence', reason: 'missing_initial_state' }}
  const initialHumidity = humidityRatio(input.initialIndoor, input.pressureKpa)
  if (input.coefficients === null) {return { ...boundary, status: 'insufficient_evidence', reason: 'missing_coefficients' }}
  const c = input.coefficients
  for (const value of [c.temperatureExchangePerSecond, c.heatInputCPerSecond, c.moistureExchangePerSecond, c.moistureInputKgPerKgPerSecond]) {requireFinite(value)}
  if (c.temperatureExchangePerSecond < 0 || c.moistureExchangePerSecond < 0) {throw new RangeError('交换速率不得为负')}
  const temperatureC = advance(input.initialIndoor.temperatureC, input.outdoor.temperatureC, c.temperatureExchangePerSecond, c.heatInputCPerSecond, input.durationSeconds)
  const waterRatio = advance(initialHumidity, outdoorHumidity, c.moistureExchangePerSecond, c.moistureInputKgPerKgPerSecond, input.durationSeconds)
  if (waterRatio < 0) {return { ...boundary, status: 'outside_model_scope', reason: 'phase_change_or_moisture_deficit' }}
  const vaporPressure = input.pressureKpa * (waterRatio / (waterToDryAirMolarMassRatio + waterRatio))
  const saturatedPressure = saturationPressureKpa(temperatureC)
  // 常系数一阶解各自单调；端点给出全时段温度/含湿比包络，不靠任意采样间隔漏过凝结。
  const initialVaporPressure = saturationPressureKpa(input.initialIndoor.temperatureC) * input.initialIndoor.relativeHumidityPercent / 100
  const maximumVaporPressure = Math.max(initialVaporPressure, vaporPressure)
  const minimumSaturatedPressure = saturationPressureKpa(Math.min(input.initialIndoor.temperatureC, temperatureC))
  // 8倍机器精度仅容纳上述有限次浮点换算，不是湿度容忍策略或住宅模型参数。
  const roundingAllowance = 8 * Number.EPSILON * Math.max(maximumVaporPressure, minimumSaturatedPressure)
  if (maximumVaporPressure - minimumSaturatedPressure > roundingAllowance) {
    return { ...boundary, status: 'outside_model_scope', reason: 'phase_change_or_moisture_deficit' }
  }
  // 仅在已通过全时段包络检查后修正浮点舍入，实际超饱和不会到达此处。
  const relativeHumidityPercent = Math.min(100, 100 * vaporPressure / saturatedPressure)
  const vpdKpa = Math.max(0, saturatedPressure - vaporPressure)
  requireFinite(relativeHumidityPercent); requireFinite(vpdKpa)
  return { ...boundary, status: 'candidate', temperatureC, relativeHumidityPercent, humidityRatioKgPerKg: waterRatio, vpdKpa }
}
