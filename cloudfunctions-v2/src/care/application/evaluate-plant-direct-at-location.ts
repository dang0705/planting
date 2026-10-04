import { projectWindowDirectAtLocation } from './project-window-direct-at-location.js'
import type { LocatedWindowDirectInput, LocatedWindowDirectResult } from './project-window-direct-at-location.js'
import { traceDirectThroughWindow, validateDirectReachGeometry } from '../light/trace-direct-through-window.js'
import type { DirectReachResult, PlantWindowPosition, WindowAperture } from '../light/trace-direct-through-window.js'

/** 单个目标植物点的瞬时几何判断；地点、辐射与窗面定义继承既有合同。 */
export interface LocatedPlantDirectInput extends LocatedWindowDirectInput {
  /** 已明确选中的目标点引用，不替代长期用户植物归属。 */
  readonly plantReference: string
  /** 同一竖窗局部坐标系内的植物点和垂直距离。 */
  readonly plant: PlantWindowPosition
  /** 实际透光矩形并集，不把中间墙体或窗框当作开口。 */
  readonly apertures: readonly WindowAperture[]
}

/** 分开解释窗面有多少直射与目标点能否接到射线，不伪造植物叶面强度。 */
export interface LocatedPlantDirectResult {
  /** 已完成给定几何判断或太阳方位无法定义。 */
  readonly state: 'evaluated' | 'undefined_solar_azimuth'
  /** 输入目标点引用，确保空间结果不会误归属到其他植物。 */
  readonly plantReference: string
  /** 近似太阳来源与同刻窗面外侧投影，强度仍属于窗面参考平面。 */
  readonly window: LocatedWindowDirectResult
  /** 给定窗口与目标的可达性；未定义方位时为空。 */
  readonly reach: DirectReachResult | null
}

/** 同轮太阳方向驱动窗面投影与目标求交，无默认距离、透光倍率或写入副作用。 */
export function evaluatePlantDirectAtLocation(input: LocatedPlantDirectInput): LocatedPlantDirectResult {
  if (typeof input.plantReference !== 'string' || !input.plantReference.trim()) {
    throw new RangeError('目标植物点引用非法')
  }
  if (input.plane.tiltDeg !== 90) {
    throw new RangeError('植物点求交仅支持竖窗')
  }
  validateDirectReachGeometry({ plant: input.plant, apertures: input.apertures, windowAzimuthDeg: input.plane.azimuthDeg })
  const window = projectWindowDirectAtLocation(input)
  if (window.solar.azimuthDeg === null) {
    return { state: 'undefined_solar_azimuth', plantReference: input.plantReference, window, reach: null }
  }
  const reach = traceDirectThroughWindow({
    sun: { atMs: window.solar.atMs, elevationDeg: window.solar.elevationDeg, azimuthDeg: window.solar.azimuthDeg },
    windowAzimuthDeg: input.plane.azimuthDeg,
    plant: input.plant,
    apertures: input.apertures,
  })
  return { state: 'evaluated', plantReference: input.plantReference, window, reach }
}
