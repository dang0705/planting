import type { ResearchClimatePoint } from './indoor-climate.js'
import type { ClimatePrediction } from './indoor-climate-validation.js'

/** 数值闭区间；这里只表示校准样本残差包络，不是概率区间。 */
interface Range {
  readonly min: number
  readonly max: number
}

/** 固定点估算模型在独立校准段的经验残差，不具备正式发布资格。 */
export interface ClimateEnvelope {
  readonly productionAdmission: false
  /** 所有校准记录数，包括点预测不可用的记录。 */
  readonly total: number
  readonly used: number
  readonly unavailable: number
  readonly temperatureResidualC: Range
  readonly vaporResidualKpa: Range
}

/** 同一小时已配对的模型点和室内真值；配对、质控和版本固定由研究回放入口执行。 */
interface CalibrationPair {
  readonly prediction: ClimatePrediction
  readonly observed: ResearchClimatePoint
}

/** 范围估算保留研究属性，不伪装成室内实测或正式准入的模型输出。 */
export type ClimateEnvelopePrediction = {
  readonly productionAdmission: false
  readonly method: 'empirical_residual_envelope'
  readonly elapsedSeconds: number
} & (
  | { readonly status: 'outside_model_scope' }
  | {
      readonly status: 'candidate'
      readonly temperatureC: Range
      readonly vaporKpa: Range
      readonly relativeHumidityPercent: Range
      readonly vpdKpa: Range
    }
)

/** 与原候选一致的饱和压关系，拒绝非数和浮点溢出／下溢。 */
function saturation(t: number): number {
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= -237.3) {
    throw new RangeError('温度超出公式数学域')
  }
  const value = 0.6108 * Math.exp((17.27 * t) / (t + 237.3))
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('饱和水汽压不可计算')
  }
  return value
}

/** 由同一代表点的温湿度恢复水汽压；不接受缺失值被转换成零。 */
function vapor(point: ResearchClimatePoint): number {
  if (
    !point ||
    typeof point.relativeHumidityPercent !== 'number' ||
    !Number.isFinite(point.relativeHumidityPercent) ||
    point.relativeHumidityPercent < 0 ||
    point.relativeHumidityPercent > 100
  ) {
    throw new RangeError('湿度必须是0到100的有限数值')
  }
  return (saturation(point.temperatureC) * point.relativeHumidityPercent) / 100
}

function validateRange(range: Range): void {
  if (
    !range ||
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    range.min > range.max
  ) {
    throw new RangeError('包络上下界必须是有序有限数值')
  }
}

/** 保留残差方向与全体计数；不加入验证真值，不搜索容错倍数。 */
export function buildClimateEnvelope(rows: readonly CalibrationPair[]): ClimateEnvelope {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new RangeError('缺少包络校准记录')
  }
  let tmin = Infinity,
    tmax = -Infinity,
    emin = Infinity,
    emax = -Infinity,
    used = 0
  for (const row of rows) {
    if (!row?.prediction) {
      throw new RangeError('校准记录缺失')
    }
    const actualVapor = vapor(row.observed)
    if (row.prediction.status !== 'candidate') {
      continue
    }
    const dt = row.observed.temperatureC - row.prediction.temperatureC
    const de = actualVapor - vapor(row.prediction)
    if (!Number.isFinite(dt) || !Number.isFinite(de)) {
      throw new RangeError('残差不可计算')
    }
    tmin = Math.min(tmin, dt)
    tmax = Math.max(tmax, dt)
    emin = Math.min(emin, de)
    emax = Math.max(emax, de)
    used++
  }
  if (used === 0) {
    throw new RangeError('没有可用于包络校准的预测')
  }
  return {
    productionAdmission: false,
    total: rows.length,
    used,
    unavailable: rows.length - used,
    temperatureResidualC: { min: tmin, max: tmax },
    vaporResidualKpa: { min: emin, max: emax }
  }
}

/**
 * 固定残差包络应用于新点；温度与水汽压分别传播，再由单调边界恢复RH／VPD。
 * 包络出现过饱和或负水汽时整项不可用，不通过裁剪提高可输出率。
 */
export function applyClimateEnvelope(
  point: ClimatePrediction,
  envelope: ClimateEnvelope
): ClimateEnvelopePrediction {
  if (!point || !Number.isFinite(point.elapsedSeconds) || point.elapsedSeconds < 0) {
    throw new RangeError('预测时间无效')
  }
  validateRange(envelope.temperatureResidualC)
  validateRange(envelope.vaporResidualKpa)
  const base = {
    productionAdmission: false as const,
    method: 'empirical_residual_envelope' as const,
    elapsedSeconds: point.elapsedSeconds
  }
  const unavailable = { ...base, status: 'outside_model_scope' as const }
  if (point.status !== 'candidate') {
    return unavailable
  }
  const e = vapor(point)
  const temperatureC = {
    min: point.temperatureC + envelope.temperatureResidualC.min,
    max: point.temperatureC + envelope.temperatureResidualC.max
  }
  const vaporKpa = {
    min: e + envelope.vaporResidualKpa.min,
    max: e + envelope.vaporResidualKpa.max
  }
  try {
    validateRange(temperatureC)
    validateRange(vaporKpa)
    const esMin = saturation(temperatureC.min),
      esMax = saturation(temperatureC.max)
    if (vaporKpa.min < 0 || vaporKpa.max > esMin) {
      return unavailable
    }
    return {
      ...base,
      status: 'candidate',
      temperatureC,
      vaporKpa,
      relativeHumidityPercent: {
        min: (100 * vaporKpa.min) / esMax,
        max: (100 * vaporKpa.max) / esMin
      },
      vpdKpa: { min: esMin - vaporKpa.max, max: esMax - vaporKpa.min }
    }
  } catch {
    return unavailable
  }
}
