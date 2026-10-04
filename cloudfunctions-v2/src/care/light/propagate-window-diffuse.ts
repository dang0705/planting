import type { PlantWindowPosition, WindowAperture } from './trace-direct-through-window.js'

/** 显式均匀天空、实际竖窗开口与目标点；只计算无其他遮挡的几何候选。 */
export interface IsotropicApertureInput {
  /** 明确模型假设，不默认选择天空分布。 */
  readonly skyModel: 'isotropic'
  /** 穿过目标点、与竖窗平行且朝窗的接收平面引用；不是叶面。 */
  readonly planeReference: string
  /** 沿用直射链路的窗口坐标及实际离窗距离。 */
  readonly plant: PlantWindowPosition
  /** 实际矩形透光开口；重叠取并集，中间墙体保留。 */
  readonly apertures: readonly WindowAperture[]
  /** 水平散射辐照，W/m²；缺失与零分开。 */
  readonly dhiWattsPerM2: number | null
}

/** 目标位置的窗平行面候选，不包含玻璃、窗帘、外部建筑、反射或非均匀天空。 */
export interface IsotropicApertureResult {
  /** 固定离线候选范围。 */
  readonly scope: 'plant_window_parallel_candidate'
  /** 尚未取得正式策略准入。 */
  readonly productionAdmission: false
  /** 输入明确选择的接收平面引用。 */
  readonly planeReference: string
  /** 均匀天空下的余弦加权开口系数；本模型理论范围为零至二分之一。 */
  readonly skyGeometricFactor: number
  /** 目标窗平行面散射估计，W/m²；没有传播损失参数的默认值。 */
  readonly diffuseWattsPerM2: number | null
  /** 解析公式用浮点求值，未认证数值误差，也不是现场置信区间。 */
  readonly numericalGuarantee: 'not_certified'
}

/** 验证实际几何；不用虚构方位角或位置调用其他模型的守卫。 */
function validate(input: IsotropicApertureInput): void {
  if (!input || input.skyModel !== 'isotropic' || typeof input.planeReference !== 'string' || !input.planeReference.trim()) {
    throw new TypeError('缺少明确天空假设或目标接收平面')
  }
  const { plant, apertures, dhiWattsPerM2 } = input
  if (!plant || ![plant.xM, plant.yM, plant.perpendicularDistanceM].every(Number.isFinite) || plant.perpendicularDistanceM <= 0) {
    throw new RangeError('目标位置或离窗距离非法')
  }
  if (!Array.isArray(apertures) || apertures.length === 0) { throw new RangeError('实际窗洞缺失') }
  const references = new Set<string>()
  for (const aperture of apertures) {
    if (!aperture || typeof aperture.reference !== 'string' || !aperture.reference.trim() || references.has(aperture.reference) ||
      ![aperture.leftM, aperture.rightM, aperture.bottomM, aperture.topM].every(Number.isFinite) || aperture.rightM <= aperture.leftM || aperture.topM <= aperture.bottomM) {
      throw new RangeError('实际窗洞非法或引用重复')
    }
    references.add(aperture.reference)
  }
  if (dhiWattsPerM2 !== null && (typeof dhiWattsPerM2 !== 'number' || !Number.isFinite(dhiWattsPerM2) || dhiWattsPerM2 < 0)) {
    throw new RangeError('水平散射辐照非法')
  }
}

/**
 * 矩形积分原函数，坐标以离窗距离归一化。
 * 被积函数为 1/[π(1+x²+y²)²]：开口立体角乘接收余弦，非点光源距离折扣。
 * hypot/atan2 避免平方溢出；远小开口的差值仍可能有浮点消去误差。
 */
function primitive(x: number, y: number): number {
  const xHypot = Math.hypot(1, x)
  const yHypot = Math.hypot(1, y)
  return (x / xHypot * Math.atan2(y, xHypot) + y / yHypot * Math.atan2(x, yHypot)) / (2 * Math.PI)
}

/**
 * 均匀天空 L=DHI/π；只积分实际开口中朝向地平线以上的方向。
 * x 分条、y 合并保证开口并集只计算一次；不把连窗之间墙体并入开口。
 * 无太阳单方向投影、无玻璃默认值、无用户事实或建议写入。
 */
export function propagateIsotropicWindowDiffuse(input: IsotropicApertureInput): IsotropicApertureResult {
  validate(input)
  const { plant } = input
  const rectangles = input.apertures.map(aperture => ({
    left: (aperture.leftM - plant.xM) / plant.perpendicularDistanceM,
    right: (aperture.rightM - plant.xM) / plant.perpendicularDistanceM,
    bottom: Math.max(0, (aperture.bottomM - plant.yM) / plant.perpendicularDistanceM),
    top: (aperture.topM - plant.yM) / plant.perpendicularDistanceM,
  }))
  if (rectangles.some(rectangle => !Object.values(rectangle).every(Number.isFinite))) { throw new RangeError('相对窗口几何超出可表示范围') }
  const visible = rectangles.filter(rectangle => rectangle.top > rectangle.bottom)
  const edges = [...new Set(visible.flatMap(rectangle => [rectangle.left, rectangle.right]))].sort((a, b) => a - b)
  let factor = 0
  for (let index = 1; index < edges.length; index++) {
    const left = edges[index - 1]!
    const right = edges[index]!
    const strips = visible.filter(rectangle => rectangle.left <= left && rectangle.right >= right)
      .map(rectangle => [rectangle.bottom, rectangle.top] as const).sort((a, b) => a[0] - b[0])
    let bottom: number | null = null
    let top = 0
    const addStrip = (): void => {
      if (bottom !== null) {
        factor += primitive(right, top) - primitive(left, top) - primitive(right, bottom) + primitive(left, bottom)
      }
    }
    for (const strip of strips) {
      if (bottom === null) { bottom = strip[0]; top = strip[1] }
      else if (strip[0] <= top) { top = Math.max(top, strip[1]) }
      else { addStrip(); bottom = strip[0]; top = strip[1] }
    }
    addStrip()
  }
  // 浮点消去可能产生负数或越界；拒绝而非钳制成伪造的有效物理结果。
  if (!Number.isFinite(factor) || factor < 0 || factor > 0.5) { throw new RangeError('散射几何积分超出模型范围，需核验数值条件') }
  return { scope: 'plant_window_parallel_candidate', productionAdmission: false, planeReference: input.planeReference,
    skyGeometricFactor: factor, diffuseWattsPerM2: input.dhiWattsPerM2 === null ? null : input.dhiWattsPerM2 * factor,
    numericalGuarantee: 'not_certified' }
}
