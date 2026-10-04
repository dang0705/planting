import type { SolarDirection } from './project-window-direct.js'

/** 在竖直窗面自身坐标系中定义的实际透光矩形，不包含相邻墙体。 */
export interface WindowAperture {
  /** 唯一非空开口引用，多个开口不能共享同一引用。 */
  readonly reference: string
  /** 从室内面朝室外向右的左边界坐标，单位为米。 */
  readonly leftM: number
  /** 严格大于左边界的右边界坐标，单位为米。 */
  readonly rightM: number
  /** 窗面坐标原点向上的下边界坐标，单位为米。 */
  readonly bottomM: number
  /** 严格大于下边界的上边界坐标，单位为米。 */
  readonly topM: number
}

/** 单个目标植物点，不把整株叶片或估算档位冒充精确坐标。 */
export interface PlantWindowPosition {
  /** 与窗口开口同原点、同右向轴的植物横向坐标，单位为米。 */
  readonly xM: number
  /** 与窗口开口同原点、同向上轴的植物高度坐标，单位为米。 */
  readonly yM: number
  /** 植物到竖窗平面的室内侧垂直距离，严格为正，单位为米。 */
  readonly perpendicularDistanceM: number
}

/** 固定竖窗平面上的离线直射求交输入，没有默认位置或窗口。 */
export interface DirectReachInput {
  /** 独立上游提供的同轮太阳方向与绝对时刻。 */
  readonly sun: SolarDirection
  /** 竖窗外法线的真北顺时针方位角，零至小于360度。 */
  readonly windowAzimuthDeg: number
  /** 给定窗口坐标系中的目标植物点与垂直离窗距离。 */
  readonly plant: PlantWindowPosition
  /** 非空的实际透光开口矩形集合，不以整体包围盒代替墙体间隔。 */
  readonly apertures: readonly WindowAperture[]
}

/** 同一窗口坐标系中的射线与竖窗交点。 */
export interface WindowIntersection {
  /** 交点从坐标原点向右的横向米坐标。 */
  readonly xM: number
  /** 交点从坐标原点向上的纵向米坐标。 */
  readonly yM: number
}

/** 只解释给定几何的可达性，不计算强度，也不保证其他遮挡不存在。 */
export interface DirectReachResult {
  /** 该次可达性判断的太阳方向绝对毫秒时刻。 */
  readonly atMs: number
  /** 严格内部可达、边界待判、开口之外、无向前射线或地平线以下。 */
  readonly status:
    | 'reachable'
    | 'boundary'
    | 'outside_apertures'
    | 'no_forward_ray'
    | 'below_horizon'
  /** 有向前交点时保留坐标；背面、平行或地平线以下返回 null。 */
  readonly intersection: WindowIntersection | null
  /** 命中矩形的稳定排序引用；未命中时为空。 */
  readonly apertureReferences: readonly string[]
}

/** 角度制完整转角的数学定义，不是运营阈值。 */
const fullTurnDeg = 360
/** 角度制半转角与竖窗前后半空间界线。 */
const halfTurnDeg = 180
/** 正交方向与太阳头顶方向的角度制定义。 */
const quarterTurnDeg = 90

/** 验证几何形状与空间定义，不为缺失值填入默认窗口或植物位置。 */
export function validateDirectReachGeometry(
  input: Pick<DirectReachInput, 'plant' | 'apertures' | 'windowAzimuthDeg'>
): void {
  const { plant, apertures } = input
  if (!Number.isFinite(input.windowAzimuthDeg) || input.windowAzimuthDeg < 0 || input.windowAzimuthDeg >= fullTurnDeg) {
    throw new RangeError('太阳或窗口方向非法')
  }
  if (
    ![plant.xM, plant.yM, plant.perpendicularDistanceM].every(Number.isFinite) ||
    plant.perpendicularDistanceM <= 0
  ) {
    throw new RangeError('植物位置或垂直离窗距离非法')
  }
  if (!Array.isArray(apertures) || apertures.length === 0) {
    throw new RangeError('窗口透光开口缺失')
  }
  const references = new Set<string>()
  for (const aperture of apertures) {
    if (
      typeof aperture.reference !== 'string' ||
      aperture.reference.trim().length === 0 ||
      references.has(aperture.reference) ||
      ![aperture.leftM, aperture.rightM, aperture.bottomM, aperture.topM].every(Number.isFinite) ||
      aperture.rightM <= aperture.leftM ||
      aperture.topM <= aperture.bottomM
    ) {
      throw new RangeError('窗口透光开口非法')
    }
    references.add(aperture.reference)
  }
}

/**
 * 从植物点沿太阳方向与竖窗求交；多个透光矩形逐一验证，不跨过中间墙体。
 * 本用例不计算玻璃、遮挡、叶片角度或辐照度，不写任何事实或建议。
 */
export function traceDirectThroughWindow(input: DirectReachInput): DirectReachResult {
  if (!Number.isSafeInteger(input.sun.atMs)) {
    throw new RangeError('太阳时刻非法')
  }
  if (!Number.isFinite(input.sun.elevationDeg) || input.sun.elevationDeg < -quarterTurnDeg
    || input.sun.elevationDeg > quarterTurnDeg || !Number.isFinite(input.sun.azimuthDeg)
    || input.sun.azimuthDeg < 0 || input.sun.azimuthDeg >= fullTurnDeg) {
    throw new RangeError('太阳或窗口方向非法')
  }
  validateDirectReachGeometry(input)
  const { sun, plant } = input
  const base = { atMs: sun.atMs, intersection: null, apertureReferences: [] }
  if (sun.elevationDeg <= 0) {
    return { ...base, status: 'below_horizon' }
  }
  const azimuthDifferenceDeg =
    ((sun.azimuthDeg - input.windowAzimuthDeg + fullTurnDeg + halfTurnDeg) % fullTurnDeg) -
    halfTurnDeg
  if (Math.abs(azimuthDifferenceDeg) >= quarterTurnDeg || sun.elevationDeg === quarterTurnDeg) {
    return { ...base, status: 'no_forward_ray' }
  }
  const azimuthDifference = (azimuthDifferenceDeg * Math.PI) / halfTurnDeg
  const elevation = (sun.elevationDeg * Math.PI) / halfTurnDeg
  const xM = plant.xM + plant.perpendicularDistanceM * Math.tan(azimuthDifference)
  const yM =
    plant.yM + (plant.perpendicularDistanceM * Math.tan(elevation)) / Math.cos(azimuthDifference)
  if (!Number.isFinite(xM) || !Number.isFinite(yM)) {
    throw new RangeError('窗口求交结果不可表示')
  }
  const hits = input.apertures.filter(
    aperture =>
      xM >= aperture.leftM && xM <= aperture.rightM && yM >= aperture.bottomM && yM <= aperture.topM
  )
  const interior = hits.some(
    aperture =>
      xM > aperture.leftM && xM < aperture.rightM && yM > aperture.bottomM && yM < aperture.topM
  )
  return {
    atMs: sun.atMs,
    status: interior ? 'reachable' : hits.length > 0 ? 'boundary' : 'outside_apertures',
    intersection: { xM, yM },
    apertureReferences: hits.map(aperture => aperture.reference).sort()
  }
}
