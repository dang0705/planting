import type { ResearchClimatePoint } from './indoor-climate.js'
import type { ClimatePrediction } from './indoor-climate-validation.js'

/** 仅作离线统计对照的配对代表点；不表示时段起点或真实小时积分。 */
export interface PairedClimateSample {
  /** 室外同小时温湿度代表点。 */
  readonly outdoor: ResearchClimatePoint
  /** 仅供训练或评分的室内真值，不能传入预测函数。 */
  readonly indoor: ResearchClimatePoint
}

/** 两解释变量的平面；系数来自指定住宅训练段，禁止作为默认房屋参数。 */
export interface ClimatePlane {
  readonly intercept: number
  readonly temperatureCoefficient: number
  readonly vaporCoefficient: number
}

/** 未准入的研究系数；不包含室内初态或验证集真值。 */
export interface OutdoorOnlyClimateFit {
  readonly productionAdmission: false
  readonly sampleCount: number
  readonly temperature: ClimatePlane
  readonly vapor: ClimatePlane
}

/** FAO-56 式11的数值关系；检查数学定义域，不声明整个定义域有生理适用性。 */
function saturation(temperature: number): number {
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature <= -237.3) {
    throw new RangeError('温度必须在饱和水汽压关系的有效数学定义域内')
  }
  const value = 0.6108 * Math.exp((17.27 * temperature) / (temperature + 237.3))
  if (!Number.isFinite(value) || value <= 0) {throw new RangeError('饱和水汽压不可计算')}
  return value
}

/** 从同刻温度与相对湿度恢复水汽分压，不需要总气压。 */
function vapor(point: ResearchClimatePoint): number {
  const rh = point.relativeHumidityPercent
  if (typeof rh !== 'number' || !Number.isFinite(rh) || rh < 0 || rh > 100) {
    throw new RangeError('相对湿度必须是0到100的有限数值')
  }
  return saturation(point.temperatureC) * (rh / 100)
}

/** 中心化最小二乘；只求解两个明确解释变量，不搜索模型或自动正则化。 */
function fitPlane(rows: readonly { x: number; z: number; y: number }[]): ClimatePlane {
  const mean = (key: 'x' | 'z' | 'y') => rows.reduce((sum, row) => sum + row[key], 0) / rows.length
  const mx = mean('x'),
    mz = mean('z'),
    my = mean('y')
  let xx = 0,
    zz = 0,
    xz = 0,
    xy = 0,
    zy = 0
  for (const row of rows) {
    const x = row.x - mx,
      z = row.z - mz,
      y = row.y - my
    xx += x * x
    zz += z * z
    xz += x * z
    xy += x * y
    zy += z * y
  }
  const determinant = xx * zz - xz * xz
  // 机器精度判断避免不可辨识矩阵被舍入噪声误认为可解；不是业务筛选阈值。
  if (!Number.isFinite(determinant) || determinant <= Number.EPSILON * (xx * zz + xz * xz)) {
    throw new RangeError('训练解释变量不足以辨识二维平面')
  }
  const temperatureCoefficient = (xy * zz - zy * xz) / determinant
  const vaporCoefficient = (zy * xx - xy * xz) / determinant
  const intercept = my - temperatureCoefficient * mx - vaporCoefficient * mz
  if (![intercept, temperatureCoefficient, vaporCoefficient].every(Number.isFinite)) {
    throw new RangeError('训练结果不是有限系数')
  }
  return { intercept, temperatureCoefficient, vaporCoefficient }
}

/** 仅消费显式训练集；固定拟合温度与水汽压两个平面，不推导生产参数。 */
export function fitOutdoorOnlyClimate(
  samples: readonly PairedClimateSample[]
): OutdoorOnlyClimateFit {
  if (samples.length < 3) {throw new RangeError('二维平面至少需要三个可辨识样本')}
  const rows = samples.map(sample => ({
    x: sample.outdoor.temperatureC,
    z: vapor(sample.outdoor),
    temperature: sample.indoor.temperatureC,
    vapor: vapor(sample.indoor)
  }))
  return {
    productionAdmission: false,
    sampleCount: rows.length,
    temperature: fitPlane(rows.map(row => ({ ...row, y: row.temperature }))),
    vapor: fitPlane(rows.map(row => ({ ...row, y: row.vapor })))
  }
}

/** 无室内初态的同小时回顾性预测；非法水汽状态返回不可用，禁止钳制后评分。 */
export function predictOutdoorOnlyClimate(
  outdoor: ResearchClimatePoint,
  fit: OutdoorOnlyClimateFit,
  elapsedSeconds: number
): ClimatePrediction {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {throw new RangeError('时间必须有效')}
  const eout = vapor(outdoor)
  const evaluate = (plane: ClimatePlane) =>
    plane.intercept +
    plane.temperatureCoefficient * outdoor.temperatureC +
    plane.vaporCoefficient * eout
  const temperatureC = evaluate(fit.temperature)
  const ein = evaluate(fit.vapor)
  const unavailable: ClimatePrediction = {
    elapsedSeconds,
    productionAdmission: false,
    status: 'outside_model_scope'
  }
  if (!Number.isFinite(temperatureC) || temperatureC <= -237.3 || !Number.isFinite(ein) || ein < 0)
    {return unavailable}
  let es: number
  try {
    es = saturation(temperatureC)
  } catch {
    return unavailable
  }
  if (ein > es) {return unavailable}
  return {
    elapsedSeconds,
    productionAdmission: false,
    status: 'candidate',
    temperatureC,
    relativeHumidityPercent: (100 * ein) / es,
    vpdKpa: es - ein
  }
}
