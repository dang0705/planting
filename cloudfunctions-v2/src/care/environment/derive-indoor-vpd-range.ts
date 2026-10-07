import { deriveMeasuredIndoorVpd, type ClimateReferenceRange } from './derive-indoor-vpd.js'

/** 单个气候量的实测范围；范围必须已有依据，本用例不生成传感器误差。 */
export interface IndoorClimateRangeObservation<Unit extends 'celsius' | 'percent'> {
  /** 有限有序范围，null表示缺失；端点本身不得为空。 */
  readonly range: ClimateReferenceRange | null
  /** 温度摄氏度、湿度百分数，禁止隐式换算。 */
  readonly unit: Unit
  /** 系统记录的采集UTC毫秒时刻，不以计算时刻代替。 */
  readonly observedAtMs: number
  /** 植物所在位置或室内区域。 */
  readonly positionRef: string
  /** 室外证据不能因具有范围而进入室内用例。 */
  readonly sourceScope: 'indoor' | 'plant_zone' | 'outdoor'
  /** 保留测量和估算区别，本增量不放宽估算发布门。 */
  readonly evidenceKind: 'measurement' | 'estimate'
  /** 调用方已经确认的事实资格，不在此猜有效期。 */
  readonly confirmed: boolean
  /** 该气候量对应的证据来源。 */
  readonly sourceRef: string
  /** 本次锁定快照，两路必须相同。 */
  readonly inputSnapshotRef: string
}

/** 两路观察显式分开，才能验证共同时间、位置和快照。 */
export interface MeasuredIndoorClimateRange {
  /** 已有温度范围及其原始来源。 */
  readonly temperature: IndoorClimateRangeObservation<'celsius'>
  /** 已有相对湿度范围及其原始来源。 */
  readonly humidity: IndoorClimateRangeObservation<'percent'>
}

/** 稳定的缺证据原因；不回显原始输入或构造默认区间。 */
type MissingReason =
  | 'missing_temperature_or_humidity'
  | 'outdoor_source'
  | 'unapproved_estimate'
  | 'unconfirmed_measurement'
  | 'time_mismatch'
  | 'space_mismatch'
  | 'snapshot_mismatch'

/** 包络仅说明可能范围，不赋予生产策略、概率或日均语义。 */
export type MeasuredIndoorVpdRangeResult =
  | {
      /** 必要测量事实或共同来源边界不足，不能输出数值包络。 */
      readonly status: 'insufficient_evidence'
      /** 缺证据结果始终不具有正式养护策略的生产准入资格。 */
      readonly productionAdmission: false
      /** 缺失或不匹配的稳定原因，不回显未经授权的原始证据。 */
      readonly reason: MissingReason
    }
  | {
      /** 已确认实测输入的数学包络可计算，不表示养护建议获准。 */
      readonly status: 'available'
      /** 数值可计算仍属于内部候选，不能自动签发正式策略资格。 */
      readonly productionAdmission: false
      /** 固定公式与单调极值推导的出处，不是已发布Care算法版本。 */
      readonly method: 'fao56_equation11_monotone_envelope'
      /** 保守包络不代表端点可达，也不是统计置信区间。 */
      readonly semantics: 'range_enclosure_not_confidence_interval'
      /** 本用例只接实测；不把数学包络标成已准入室内估算。 */
      readonly evidenceKind: 'measurement'
      /** 水汽压亏缺统一以千帕表达，不与帕或湿度百分数混用。 */
      readonly unit: 'kPa'
      /** VPD上下界；100%RH的真实零值保持为零。 */
      readonly vpdKpa: ClimateReferenceRange
      /** 本次消费的摄氏温度证据范围，保留原端点且独立复制。 */
      readonly temperatureRangeC: ClimateReferenceRange
      /** 本次消费的相对湿度百分数范围，不转换为概率或置信水平。 */
      readonly humidityRangePercent: ClimateReferenceRange
      /** 两路观察共同的采集UTC毫秒时刻，不替换为计算时间。 */
      readonly observedAtMs: number
      /** 两路测量共同所属的植物位置或室内区域引用。 */
      readonly positionRef: string
      /** 已核对一致的室内或植物区域来源范围，不接室外事实冒名。 */
      readonly sourceScope: 'indoor' | 'plant_zone'
      /** 两路证据共同锁定的输入快照引用，禁止跨快照拼接。 */
      readonly inputSnapshotRef: string
      /** 两路来源均保留，不用温度来源冒充湿度来源。 */
      readonly sourceRefs: {
        /** 温度范围的原始测量来源引用，不赋予湿度测量资格。 */
        readonly temperature: string
        /** 湿度范围的原始测量来源引用，不以温度来源替代。 */
        readonly humidity: string
      }
    }

/** 校验观察结构与原始范围，不修改输入、不钳制或生成专业参数。 */
function validateObservation(
  observation: IndoorClimateRangeObservation<'celsius' | 'percent'>,
  unit: 'celsius' | 'percent'
): void {
  if (
    !observation ||
    observation.unit !== unit ||
    !Number.isSafeInteger(observation.observedAtMs) ||
    !Number.isFinite(new Date(observation.observedAtMs).getTime()) ||
    typeof observation.confirmed !== 'boolean' ||
    !['indoor', 'plant_zone', 'outdoor'].includes(observation.sourceScope) ||
    !['measurement', 'estimate'].includes(observation.evidenceKind)
  ) {
    throw new TypeError('室内气候观察单位、时刻或资格字段非法')
  }
  for (const ref of [
    observation.positionRef,
    observation.sourceRef,
    observation.inputSnapshotRef
  ]) {
    if (typeof ref !== 'string' || !ref.trim()) {
      throw new TypeError('室内气候证据引用缺失')
    }
  }
  const range = observation.range
  if (range === null) {
    return
  }
  if (
    !range ||
    typeof range.min !== 'number' ||
    typeof range.max !== 'number' ||
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    range.min > range.max
  ) {
    throw new RangeError('室内气候范围必须有限且有序')
  }
  if (unit === 'percent' && (range.min < 0 || range.max > 100)) {
    throw new RangeError('相对湿度范围非法')
  }
}

/** 同刻同空间的已确认室内测量范围→VPD包络；估算准入由后续独立用例处理。 */
export function deriveMeasuredIndoorVpdRange(
  input: MeasuredIndoorClimateRange
): MeasuredIndoorVpdRangeResult {
  const { temperature, humidity } = input
  validateObservation(temperature, 'celsius')
  validateObservation(humidity, 'percent')
  const missing = (reason: MissingReason): MeasuredIndoorVpdRangeResult => ({
    status: 'insufficient_evidence',
    productionAdmission: false,
    reason
  })
  if (temperature.sourceScope === 'outdoor' || humidity.sourceScope === 'outdoor') {
    return missing('outdoor_source')
  }
  if (temperature.evidenceKind !== 'measurement' || humidity.evidenceKind !== 'measurement') {
    return missing('unapproved_estimate')
  }
  if (!temperature.confirmed || !humidity.confirmed) {
    return missing('unconfirmed_measurement')
  }
  if (temperature.observedAtMs !== humidity.observedAtMs) {
    return missing('time_mismatch')
  }
  if (
    temperature.positionRef !== humidity.positionRef ||
    temperature.sourceScope !== humidity.sourceScope
  ) {
    return missing('space_mismatch')
  }
  if (temperature.inputSnapshotRef !== humidity.inputSnapshotRef) {
    return missing('snapshot_mismatch')
  }
  const t = temperature.range,
    rh = humidity.range
  if (t === null || rh === null) {
    return missing('missing_temperature_or_humidity')
  }
  // 复用同一固定点值公式及数值域守卫，不维护第二套饱和水汽压常数。
  const point = (temperatureC: number, relativeHumidityPercent: number) =>
    deriveMeasuredIndoorVpd({
      temperatureC,
      relativeHumidityPercent,
      temperatureUnit: 'celsius',
      humidityUnit: 'percent',
      observedAtMs: temperature.observedAtMs,
      positionRef: temperature.positionRef,
      sourceRef: temperature.sourceRef,
      inputSnapshotRef: temperature.inputSnapshotRef,
      sourceScope: temperature.sourceScope,
      evidenceKind: temperature.evidenceKind,
      confirmed: temperature.confirmed
    })
  const lower = point(t.min, rh.max),
    upper = point(t.max, rh.min)
  if (lower.status !== 'available') {
    return lower
  }
  if (upper.status !== 'available') {
    return upper
  }
  return {
    status: 'available',
    productionAdmission: false,
    method: 'fao56_equation11_monotone_envelope',
    semantics: 'range_enclosure_not_confidence_interval',
    evidenceKind: 'measurement',
    unit: 'kPa',
    vpdKpa: { min: lower.vpdKpa, max: upper.vpdKpa },
    temperatureRangeC: { ...t },
    humidityRangePercent: { ...rh },
    observedAtMs: temperature.observedAtMs,
    positionRef: temperature.positionRef,
    sourceScope: temperature.sourceScope,
    inputSnapshotRef: temperature.inputSnapshotRef,
    sourceRefs: { temperature: temperature.sourceRef, humidity: humidity.sourceRef }
  }
}
