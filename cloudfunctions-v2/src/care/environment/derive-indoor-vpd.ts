/** FAO-56式11的固定公式定义，不是可运营浇水倍率。 */
const saturationFormula = { scaleKpa: 0.6108, exponent: 17.27, denominatorC: 237.3 } as const

/** 同刻同位置的实测原子事实；此数学用例不进行Provider查询或发布审批。 */
export interface MeasuredIndoorClimate {
  /** 摄氏温度，null与有效0°C分开。 */
  readonly temperatureC: number | null
  /** 相对湿度百分数，null与有效0%分开。 */
  readonly relativeHumidityPercent: number | null
  /** 固定温度单位，拒绝开尔文或华氏度冒充。 */
  readonly temperatureUnit: 'celsius'
  /** 固定百分数单位，不接受0—1比例冒充。 */
  readonly humidityUnit: 'percent'
  /** 系统记录的共同采集UTC毫秒时刻。 */
  readonly observedAtMs: number
  /** 明确植物位置或室内区域引用。 */
  readonly positionRef: string
  /** 传感器或实测事实来源，不作为凭证。 */
  readonly sourceRef: string
  /** 锁定输入快照引用，本用例不修改它。 */
  readonly inputSnapshotRef: string
  /** 室外天气保留原范围，不允许改名为室内实测。 */
  readonly sourceScope: 'indoor' | 'plant_zone' | 'outdoor'
  /** 估算模型尚未接线，不能只凭字段赋予准入。 */
  readonly evidenceKind: 'measurement' | 'estimate'
  /** 调用方确认的事实资格，不猜有效期。 */
  readonly confirmed: boolean
}

/** 有限有序参考范围，不定义植物生理最适值。 */
export interface ClimateReferenceRange {
  /** 范围下端；温度允许合理负值，湿度另行校验。 */
  readonly min: number
  /** 不低于下端的范围上端。 */
  readonly max: number
}

/** plant-knowledge提供的审核知识，不读取百科SQL或自由文本。 */
export interface PlantClimateReference {
  /** 植物适温范围，缺失不使用通用默认。 */
  readonly temperatureRangeC: ClimateReferenceRange | null
  /** 植物适湿百分数范围，缺失不使用通用默认。 */
  readonly humidityRangePercent: ClimateReferenceRange | null
  /** 审核知识来源，引用本身不证明生产准入。 */
  readonly sourceRef: string
  /** 本次锁定的知识快照引用。 */
  readonly inputSnapshotRef: string
}

/** 仅表示事实或参考不足，不表示应当浇水或存在零VPD。 */
interface MissingVpdEvidence {
  /** 明确缺证据状态。 */
  readonly status: 'insufficient_evidence'
  /** 不生成正式策略资格。 */
  readonly productionAdmission: false
  /** 稳定原因，不回显原始输入。 */
  readonly reason: 'outdoor_source' | 'unapproved_estimate' | 'unconfirmed_measurement' | 'missing_temperature_or_humidity'
}

/** 点值数学结果，不等于全天平均、蒸腾量或耗水倍率。 */
interface VpdPoint {
  /** 点值推导可用，不代表建议可用。 */
  readonly status: 'available'
  /** 本增量无策略发布与精度认证。 */
  readonly productionAdmission: false
  /** 公式出处，不作为Care算法发布版本。 */
  readonly method: 'fao56_equation11_liquid_water'
  /** 蒸汽压及缺口统一使用千帕，不与帕混用。 */
  readonly unit: 'kPa'
  /** 实际或参考点摄氏温度。 */
  readonly temperatureC: number
  /** 实际或参考点湿度百分数。 */
  readonly relativeHumidityPercent: number
  /** 液态水参考饱和蒸汽压近似。 */
  readonly saturationPressureKpa: number
  /** 空气水汽压缺口，不是实际耗水。 */
  readonly vpdKpa: number
  /** 实测或知识来源。 */
  readonly sourceRef: string
  /** 与原输入保持关联的快照。 */
  readonly inputSnapshotRef: string
}

/** 室内测量结果和明确缺口，不把估算天气当作测量。 */
export type MeasuredIndoorVpdResult = MissingVpdEvidence | (VpdPoint & {
  /** 原观测时刻，不更换为当前时刻。 */
  readonly observedAtMs: number
  /** 原植物位置引用。 */
  readonly positionRef: string
  /** 原室内或植物区域范围。 */
  readonly sourceScope: 'indoor' | 'plant_zone'
})

/** 中点气候参考不具有生理最适或日平均的含义。 */
export type PlantClimateVpdAnchor = MissingVpdEvidence | (VpdPoint & {
  /** 用户已经确认的参考语义，不作为植物最适值。 */
  readonly referenceKind: 'climate_midpoint_not_optimal'
})

/** 百分数合法边界来自单位定义，不进行范围钳制。 */
function validateHumidity(value: number | null): void {
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) { throw new RangeError('相对湿度百分数非法') }
}

/** 只保证固定近似公式数学域与有限值，不宣称该域全段都达到计量精度。 */
function validateTemperature(value: number | null): void {
  if (value !== null && (!Number.isFinite(value) || value + saturationFormula.denominatorC <= 0)) {
    throw new RangeError('温度不在公式数学定义域')
  }
}

/** 内部来源必须明确；来源字符串存在不是已发布资格。 */
function validateReference(value: string): void {
  if (typeof value !== 'string' || !value.trim()) { throw new TypeError('VPD来源或快照引用缺失') }
}

/** 缺失保持缺失，绝不输出伪造零值。 */
function missing(reason: MissingVpdEvidence['reason']): MissingVpdEvidence {
  return { status: 'insufficient_evidence', productionAdmission: false, reason }
}

/** FAO相对湿度定义导出的点值；不加入温湿度分桶或季节修正。 */
function calculate(temperatureC: number, relativeHumidityPercent: number, sourceRef: string, inputSnapshotRef: string): VpdPoint {
  const saturationPressureKpa = saturationFormula.scaleKpa * Math.exp(saturationFormula.exponent * temperatureC / (temperatureC + saturationFormula.denominatorC))
  const vpdKpa = saturationPressureKpa * (1 - relativeHumidityPercent / 100)
  if (!Number.isFinite(saturationPressureKpa) || !Number.isFinite(vpdKpa)) { throw new RangeError('VPD计算超出有限数值范围') }
  if (saturationPressureKpa <= 0 || (relativeHumidityPercent < 100 && vpdKpa === 0)) {
    throw new RangeError('VPD计算发生数值下溢，不能表示有效零值')
  }
  return { status: 'available', productionAdmission: false, method: 'fao56_equation11_liquid_water', unit: 'kPa',
    temperatureC, relativeHumidityPercent, saturationPressureKpa, vpdKpa, sourceRef, inputSnapshotRef }
}

/** 明确室内实测→点值VPD，室外及未批准估算只报告缺口。 */
export function deriveMeasuredIndoorVpd(input: MeasuredIndoorClimate): MeasuredIndoorVpdResult {
  validateReference(input.sourceRef); validateReference(input.inputSnapshotRef); validateReference(input.positionRef)
  if (!Number.isSafeInteger(input.observedAtMs) || !Number.isFinite(new Date(input.observedAtMs).getTime()) || input.temperatureUnit !== 'celsius' || input.humidityUnit !== 'percent'
    || !['indoor', 'plant_zone', 'outdoor'].includes(input.sourceScope) || !['measurement', 'estimate'].includes(input.evidenceKind)
    || typeof input.confirmed !== 'boolean') { throw new TypeError('室内气候来源、时刻或单位非法') }
  validateTemperature(input.temperatureC); validateHumidity(input.relativeHumidityPercent)
  if (input.sourceScope === 'outdoor') { return missing('outdoor_source') }
  if (input.evidenceKind !== 'measurement') { return missing('unapproved_estimate') }
  if (!input.confirmed) { return missing('unconfirmed_measurement') }
  if (input.temperatureC === null || input.relativeHumidityPercent === null) { return missing('missing_temperature_or_humidity') }
  return { ...calculate(input.temperatureC, input.relativeHumidityPercent, input.sourceRef, input.inputSnapshotRef),
    observedAtMs: input.observedAtMs, positionRef: input.positionRef, sourceScope: input.sourceScope }
}

/** 只根据明确审核范围选择中点；缺知识不生成全球参考值。 */
export function derivePlantClimateVpdAnchor(input: PlantClimateReference): PlantClimateVpdAnchor {
  validateReference(input.sourceRef); validateReference(input.inputSnapshotRef)
  for (const range of [input.temperatureRangeC, input.humidityRangePercent]) {
    if (range !== null && (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max < range.min)) {
      throw new RangeError('植物气候参考范围非法')
    }
  }
  if (input.temperatureRangeC !== null) {
    validateTemperature(input.temperatureRangeC.min); validateTemperature(input.temperatureRangeC.max)
  }
  if (input.humidityRangePercent !== null) {
    validateHumidity(input.humidityRangePercent.min); validateHumidity(input.humidityRangePercent.max)
  }
  if (input.temperatureRangeC === null || input.humidityRangePercent === null) { return missing('missing_temperature_or_humidity') }
  const temperatureC = input.temperatureRangeC.min / 2 + input.temperatureRangeC.max / 2
  const relativeHumidityPercent = input.humidityRangePercent.min / 2 + input.humidityRangePercent.max / 2
  return { ...calculate(temperatureC, relativeHumidityPercent, input.sourceRef, input.inputSnapshotRef), referenceKind: 'climate_midpoint_not_optimal' }
}
