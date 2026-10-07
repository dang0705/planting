import { replayIndoorClimateStep } from './indoor-climate.js'
import type { ResearchClimateCoefficients, ResearchClimatePoint } from './indoor-climate.js'

/** 离线实测记录。elapsedSeconds只表示选定数据段内的时间差，不签发时区事实。 */
export interface ClimateObservation {
  readonly elapsedSeconds: number
  readonly indoor: ResearchClimatePoint
  readonly outdoor: ResearchClimatePoint
  readonly pressureKpa: number
}

/** 研究预测不具有正式准入资格；不可用结果不能从误差分母剔除。 */
export type ClimatePrediction = { readonly elapsedSeconds: number; readonly productionAdmission: false } & (
  | { readonly status: 'candidate'; readonly temperatureC: number; readonly relativeHumidityPercent: number; readonly vpdKpa: number }
  | { readonly status: 'outside_model_scope' | 'previous_step_unavailable' }
)

/** 数学公式常数，沿用本研究候选的FAO饱和压和含湿比定义，不属于可调房屋参数。 */
const molarMassRatio = 0.62198
function finite(value: number): void {
  if (!Number.isFinite(value)) {throw new RangeError('研究样本必须为有限数值')}
}
function saturation(temperatureC: number): number {
  finite(temperatureC)
  if (temperatureC <= -237.3) {throw new RangeError('温度超出公式数学域')}
  const value = 0.6108 * Math.exp(17.27 * temperatureC / (temperatureC + 237.3))
  finite(value)
  if (value <= 0) {throw new RangeError('饱和压不可表示')}
  return value
}
function vapor(point: ResearchClimatePoint): number {
  finite(point.relativeHumidityPercent)
  if (point.relativeHumidityPercent < 0 || point.relativeHumidityPercent > 100) {throw new RangeError('湿度非法')}
  return saturation(point.temperatureC) * point.relativeHumidityPercent / 100
}
function waterRatio(point: ResearchClimatePoint, pressure: number): number {
  const partial = vapor(point)
  if (partial >= pressure) {throw new RangeError('水汽分压超过总压')}
  return molarMassRatio * partial / (pressure - partial)
}
/** 在新的压力下保持含湿比，不把上一时刻的相对湿度误当作水分质量。 */
function relativeHumidity(temperatureC: number, ratio: number, pressure: number): number {
  return 100 * pressure * ratio / (molarMassRatio + ratio) / saturation(temperatureC)
}
function mean(values: readonly number[]): number {return values.reduce((sum, value) => sum + value, 0) / values.length}

/**
 * 仅从传入的校准样本拟合 Δx=f·(x_out-x_in)+h。
 * 使用带截距最小二乘；f不在[0,1)时拒绝，不钳制成“可用参数”。
 * 常边界解析解给出k=-log(1-f)/dt及q=h·k/f。零交换单独取q=h/dt。
 */
export function fitClimateExchange(contrasts: readonly number[], changes: readonly number[], intervalSeconds: number) {
  finite(intervalSeconds)
  if (contrasts.length < 2 || contrasts.length !== changes.length || intervalSeconds <= 0) {throw new RangeError('校准样本数量或时长非法')}
  contrasts.forEach(finite); changes.forEach(finite)
  const xMean = mean(contrasts); const yMean = mean(changes)
  const variance = contrasts.reduce((sum, value) => sum + (value - xMean) ** 2, 0)
  if (variance === 0) {throw new RangeError('没有可辨识的室内外差异')}
  const covariance = contrasts.reduce((sum, value, index) => sum + (value - xMean) * (changes[index]! - yMean), 0)
  const fraction = covariance / variance; const increment = yMean - fraction * xMean
  finite(fraction); finite(increment)
  if (fraction < 0 || fraction >= 1) {throw new RangeError('拟合不满足非负有限交换假设')}
  const exchangePerSecond = -Math.log1p(-fraction) / intervalSeconds
  const sourcePerSecond = fraction === 0 ? increment / intervalSeconds : increment * exchangePerSecond / fraction
  finite(exchangePerSecond); finite(sourcePerSecond)
  return { fraction: fraction === 0 ? 0 : fraction, increment, exchangePerSecond: exchangePerSecond === 0 ? 0 : exchangePerSecond, sourcePerSecond }
}

/** 研究序列必须明确每个边界时刻；不去重、补段或静默修复。 */
function validateTimeline(rows: readonly ClimateObservation[]): void {
  if (rows.length < 2) {throw new RangeError('至少需要两个边界记录')}
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!
    finite(row.elapsedSeconds); finite(row.pressureKpa)
    if (row.pressureKpa <= 0 || (index > 0 && row.elapsedSeconds <= rows[index - 1]!.elapsedSeconds)) {throw new RangeError('气压或记录顺序非法')}
    waterRatio(row.outdoor, row.pressureKpa)
  }
}

/** 只接受等间隔校准段；验证数据必须由调用方分离，不提供自动调参或筛选。 */
export function calibrateIndoorClimate(rows: readonly ClimateObservation[]) {
  validateTimeline(rows)
  const seconds = rows[1]!.elapsedSeconds - rows[0]!.elapsedSeconds
  const temperatureContrasts: number[] = []; const temperatureChanges: number[] = []
  const moistureContrasts: number[] = []; const moistureChanges: number[] = []
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1]!; const next = rows[index]!
    if (next.elapsedSeconds - previous.elapsedSeconds !== seconds) {throw new RangeError('校准时段必须等间隔')}
    const initialWater = waterRatio(previous.indoor, previous.pressureKpa)
    temperatureContrasts.push(previous.outdoor.temperatureC - previous.indoor.temperatureC)
    temperatureChanges.push(next.indoor.temperatureC - previous.indoor.temperatureC)
    moistureContrasts.push(waterRatio(previous.outdoor, previous.pressureKpa) - initialWater)
    moistureChanges.push(waterRatio(next.indoor, next.pressureKpa) - initialWater)
  }
  const temperature = fitClimateExchange(temperatureContrasts, temperatureChanges, seconds)
  const moisture = fitClimateExchange(moistureContrasts, moistureChanges, seconds)
  const coefficients: ResearchClimateCoefficients = {
    temperatureExchangePerSecond: temperature.exchangePerSecond,
    heatInputCPerSecond: temperature.sourcePerSecond,
    moistureExchangePerSecond: moisture.exchangePerSecond,
    moistureInputKgPerKgPerSecond: moisture.sourcePerSecond,
  }
  return { coefficients, temperature, moisture, sampleCount: rows.length, transitionCount: rows.length - 1, productionAdmission: false as const }
}

/**
 * 只使用首条室内状态，此后以过去预测递推。后续室内真值只应由评分器读取。
 * 每段沿用段首室外边界和压力；段末按新压力保持含湿比重建RH。
 * 一旦不适用则余下均不可用，不借后续实测重启而夸大覆盖或精度。
 */
export function replayHeldOutClimate(rows: readonly ClimateObservation[], coefficients: ResearchClimateCoefficients): ClimatePrediction[] {
  validateTimeline(rows)
  let temperatureC = rows[0]!.indoor.temperatureC
  let ratio = waterRatio(rows[0]!.indoor, rows[0]!.pressureKpa)
  let available = true
  const predictions: ClimatePrediction[] = []
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1]!; const next = rows[index]!
    const label = { elapsedSeconds: next.elapsedSeconds, productionAdmission: false as const }
    if (!available) {predictions.push({ ...label, status: 'previous_step_unavailable' }); continue}
    const initialRh = relativeHumidity(temperatureC, ratio, previous.pressureKpa)
    // 新压力下超饱和也属于适用边界；不钳成饱和继续递推。
    if (initialRh < 0 || initialRh > 100) {available = false; predictions.push({ ...label, status: 'outside_model_scope' }); continue}
    const result = replayIndoorClimateStep({ initialIndoor: { temperatureC, relativeHumidityPercent: initialRh }, outdoor: previous.outdoor, pressureKpa: previous.pressureKpa, durationSeconds: next.elapsedSeconds - previous.elapsedSeconds, coefficients })
    if (result.status !== 'candidate') {available = false; predictions.push({ ...label, status: 'outside_model_scope' }); continue}
    temperatureC = result.temperatureC; ratio = result.humidityRatioKgPerKg
    const rh = relativeHumidity(temperatureC, ratio, next.pressureKpa)
    if (rh < 0 || rh > 100) {available = false; predictions.push({ ...label, status: 'outside_model_scope' }); continue}
    predictions.push({ ...label, status: 'candidate', temperatureC, relativeHumidityPercent: rh, vpdKpa: saturation(temperatureC) * (1 - rh / 100) })
  }
  return predictions
}

/** 诊断对照也明确为研究候选，不得借此生成生产降级结果。 */
export function climateComparisonPoint(point: ResearchClimatePoint, elapsedSeconds: number): ClimatePrediction {
  const vpdKpa = saturation(point.temperatureC) - vapor(point)
  return { elapsedSeconds, productionAdmission: false, status: 'candidate', ...point, vpdKpa }
}

/** 误差统计不提供“合格”阈值；无有效输出时返回null，不把缺失当零误差。 */
export function summarizeClimateErrors(observed: readonly ResearchClimatePoint[], predicted: readonly ClimatePrediction[]) {
  if (observed.length === 0 || observed.length !== predicted.length) {throw new RangeError('评分必须逐时段对齐')}
  const temperatures: number[] = []; const humidities: number[] = []; const deficits: number[] = []
  for (let index = 0; index < observed.length; index++) {
    const truth = observed[index]!; const prediction = predicted[index]!
    const truthVpd = saturation(truth.temperatureC) - vapor(truth)
    if (prediction.status !== 'candidate') {continue}
    for (const value of [prediction.temperatureC, prediction.relativeHumidityPercent, prediction.vpdKpa]) {finite(value)}
    temperatures.push(prediction.temperatureC - truth.temperatureC)
    humidities.push(prediction.relativeHumidityPercent - truth.relativeHumidityPercent)
    deficits.push(prediction.vpdKpa - truthVpd)
  }
  const metrics = (errors: readonly number[]) => errors.length === 0 ? null : ({ meanAbsoluteError: mean(errors.map(Math.abs)), rootMeanSquareError: Math.sqrt(mean(errors.map((error) => error ** 2))), maximumAbsoluteError: errors.reduce((max, error) => Math.max(max, Math.abs(error)), 0) })
  return { total: observed.length, valid: temperatures.length, unavailable: observed.length - temperatures.length, coverage: temperatures.length / observed.length, temperatureC: metrics(temperatures), relativeHumidityPercent: metrics(humidities), vpdKpa: metrics(deficits) }
}
