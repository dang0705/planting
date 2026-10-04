/** 同一参考平面上的辐照度上下界，单位始终为瓦每平方米。 */
export interface IrradianceRange {
  /** 有限、非负的辐照度下界，零是有效数据。 */
  readonly lower: number
  /** 有限且不低于下界的辐照度上界。 */
  readonly upper: number
}

/** 独立上游提供的太阳方向，不能与其他时刻辐射拼接。 */
export interface SolarDirection {
  /** 太阳方向对应的绝对安全整数 UTC 毫秒时刻。 */
  readonly atMs: number
  /** 相对地平线高度角，范围为负90至正90度。 */
  readonly elevationDeg: number
  /** 真北起点、顺时针的方位角，范围为零至小于360度。 */
  readonly azimuthDeg: number
}

/** 面向外界太阳的窗面外法线，尚未包含玻璃或遮挡。 */
export interface WindowExteriorPlane {
  /** 稳定窗面外侧参考引用，不得标成植物叶面。 */
  readonly reference: string
  /** 从水平朝上平面量起的倾角，范围零至180度，竖窗为90度。 */
  readonly tiltDeg: number
  /** 外法线投影的真北顺时针方位角，范围零至小于360度。 */
  readonly azimuthDeg: number
}

/** 单时刻直接法向辐射，不擅自将区间平均值改名为瞬时值。 */
export interface InstantaneousNormalRadiation {
  /** 辐射证据对应的绝对安全整数 UTC 毫秒时刻。 */
  readonly atMs: number
  /** 本用例只消费瞬时辐射；区间平均需独立建立时间转换策略。 */
  readonly semantics: 'instantaneous'
  /** 垂直太阳方向的 DNI 上下界；null 明确表示缺证据。 */
  readonly dniWattsPerM2: IrradianceRange | null
}

/** 一个太阳与辐射时刻严格一致的离线几何计算输入。 */
export interface WindowDirectInput {
  /** 同刻瞬时 DNI，不含玻璃、云量或视觉二次倍率。 */
  readonly radiation: InstantaneousNormalRadiation
  /** 与辐射时间相等的独立太阳位置输入。 */
  readonly sun: SolarDirection
  /** 不含内部传播的目标窗面外侧几何。 */
  readonly plane: WindowExteriorPlane
}

/** 只表达窗面外侧的直射，不能当成植物位置 PPFD。 */
export interface WindowDirectResult {
  /** 锁定的辐射及太阳方向绝对时刻。 */
  readonly atMs: number
  /** 与输入相同的稳定窗面外侧引用。 */
  readonly referencePlane: string
  /** 入射方向与窗面外法线点积，背面为负，保留几何解释。 */
  readonly incidenceCosine: number
  /** 背面及太阳不高于地平线时为零的非负投影因子。 */
  readonly projectionFactor: number
  /** 窗面外侧直射瓦每平方米上下界；缺失 DNI 仍为 null。 */
  readonly directWattsPerM2: IrradianceRange | null
}

/** 固定错误只描述问题类型，不回显坐标、引用或原始数据。 */
function validateInput(input: WindowDirectInput): void {
  const { radiation, sun, plane } = input
  if (
    !Number.isSafeInteger(sun.atMs) ||
    !Number.isSafeInteger(radiation.atMs) ||
    sun.atMs !== radiation.atMs
  ) {
    throw new RangeError('太阳与辐射时刻非法或不一致')
  }
  if (radiation.semantics !== 'instantaneous') {
    throw new RangeError('窗面直射仅接受瞬时辐射')
  }
  if (typeof plane.reference !== 'string' || plane.reference.trim().length === 0) {
    throw new RangeError('窗面参考引用缺失')
  }
  if (
    !Number.isFinite(sun.elevationDeg) ||
    sun.elevationDeg < -90 ||
    sun.elevationDeg > 90 ||
    !Number.isFinite(plane.tiltDeg) ||
    plane.tiltDeg < 0 ||
    plane.tiltDeg > 180 ||
    ![sun.azimuthDeg, plane.azimuthDeg].every(
      value => Number.isFinite(value) && value >= 0 && value < 360
    )
  ) {
    throw new RangeError('太阳或窗面角度非法')
  }
  const range = radiation.dniWattsPerM2
  if (
    range !== null &&
    (!range ||
      !Number.isFinite(range.lower) ||
      !Number.isFinite(range.upper) ||
      range.lower < 0 ||
      range.upper < range.lower)
  ) {
    throw new RangeError('直接法向辐射范围非法')
  }
}

/**
 * 按同刻太阳方向与平面法线点积投影 DNI；公式依据 Sandia 与 pvlib 的平面直射定义。
 * 不计算太阳位置、区间平均、玻璃或传播，不访问外部服务，也不写事实和建议。
 */
export function projectWindowDirect(input: WindowDirectInput): WindowDirectResult {
  validateInput(input)
  const { sun, plane, radiation } = input
  const elevation = (sun.elevationDeg * Math.PI) / 180
  const tilt = (plane.tiltDeg * Math.PI) / 180
  const azimuthDifference = ((sun.azimuthDeg - plane.azimuthDeg) * Math.PI) / 180
  const dotProduct =
    Math.sin(elevation) * Math.cos(tilt) +
    Math.cos(elevation) * Math.sin(tilt) * Math.cos(azimuthDifference)
  // 仅保护单位向量点积的数学范围，不引入业务阈值或人为放大。
  const incidenceCosine = Math.max(-1, Math.min(1, dotProduct))
  const projectionFactor = sun.elevationDeg <= 0 ? 0 : Math.max(0, incidenceCosine)
  const dni = radiation.dniWattsPerM2
  return {
    atMs: radiation.atMs,
    referencePlane: plane.reference,
    incidenceCosine,
    projectionFactor,
    directWattsPerM2:
      dni === null
        ? null
        : { lower: dni.lower * projectionFactor, upper: dni.upper * projectionFactor }
  }
}
