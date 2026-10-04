import { evaluatePotSafety, type PotEvidenceState, type PotSafetyState } from './evaluate-pot-safety.js'

/** 已确认单位为厘米的圆形内盆尺寸；null 表示缺测量，不从其他字段猜值。 */
export interface MeasuredPotInput {
  /** 是否确认当前尺寸来自实际种植内盆，而非装饰外盆。 */
  readonly actualInnerPotConfirmed: PotEvidenceState
  /** 内盆排水孔及通道是否有效；不是照片中有没有孔的猜测。 */
  readonly drainageAvailable: PotEvidenceState
  /** 内盆开口的内直径，厘米；不含盆壁厚度。 */
  readonly potTopDiameterCm: number | null
  /** 内盆底部的内直径，厘米；必须为正数。 */
  readonly potBottomDiameterCm: number | null
  /** 内盆容器内深，厘米；不是植物高度或外盆高度。 */
  readonly potHeightCm: number | null
}

/** 圆台近似的容器几何体积；不包含基质孔隙、根系排水量或储水能力。 */
export interface PotContainerGeometry {
  /** 容器体积，毫升；1 立方厘米等于 1 毫升。 */
  readonly containerVolumeMl: number
  /** 同一容器体积，升；1 升等于 1000 毫升。 */
  readonly containerVolumeLiters: number
}

/** 几何派生和安全判断的独立结果；可用于后续回放，不产生浇水建议。 */
export interface MeasuredPotResult {
  /** 只有实际内盆已确认且三项尺寸齐备才返回几何量。 */
  readonly geometry: PotContainerGeometry | null
  /** 复用三值盆器安全门；safe 不代表应该浇水。 */
  readonly safety: PotSafetyState
  /** 缺少实际填充高度与根系等证据，不能将容器容积当作基质填充体积。 */
  readonly substrateVolumeMl: null
  /** 缺少已发布保水策略与物理证据，本用例不计算持水量或倍率。 */
  readonly waterRetention: null
}

/** 拒绝字符串、零值及非有限值；缺失必须明确为 null。 */
function validateDimension(value: unknown): asserts value is number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
    throw new TypeError('盆器内尺寸必须是有限正数（厘米），或明确的未知值 null')
  }
}

/**
 * 计算圆台容器体积并接通既有安全门。相同上下直径自然退化为圆柱。
 * 数学公式使用内半径；无经验系数、推测尺寸、持水倍率、数据库写入或策略发布。
 */
export function deriveMeasuredPot(input: MeasuredPotInput): MeasuredPotResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('缺少实测盆器输入对象')
  }
  const { potTopDiameterCm, potBottomDiameterCm, potHeightCm } = input
  validateDimension(potTopDiameterCm)
  validateDimension(potBottomDiameterCm)
  validateDimension(potHeightCm)
  const complete = potTopDiameterCm !== null && potBottomDiameterCm !== null && potHeightCm !== null
  const safety = evaluatePotSafety({
    actualInnerPotConfirmed: input.actualInnerPotConfirmed,
    drainageAvailable: input.drainageAvailable,
    potGeometryValid: complete ? true : null,
  })
  let geometry: PotContainerGeometry | null = null
  if (complete && input.actualInnerPotConfirmed === true) {
    const upperRadius = potTopDiameterCm / 2
    const lowerRadius = potBottomDiameterCm / 2
    const containerVolumeMl = Math.PI * potHeightCm / 3 *
      (upperRadius ** 2 + upperRadius * lowerRadius + lowerRadius ** 2)
    const containerVolumeLiters = containerVolumeMl / 1000
    if (!Number.isFinite(containerVolumeMl) || containerVolumeMl <= 0 || containerVolumeLiters <= 0) {
      throw new RangeError('盆器体积超出可表示数值范围，不能形成有效几何证据')
    }
    geometry = { containerVolumeMl, containerVolumeLiters }
  }
  return { geometry, safety, substrateVolumeMl: null, waterRetention: null }
}
