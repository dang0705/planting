import { estimateSolarDirection } from '../light/estimate-solar-direction.js'
import type { SolarDirectionEstimate } from '../light/estimate-solar-direction.js'
import { projectWindowDirect } from '../light/project-window-direct.js'
import type { InstantaneousNormalRadiation, WindowExteriorPlane, WindowDirectResult } from '../light/project-window-direct.js'

/** 已明确地点与同刻瞬时辐射的离线用例输入。 */
export interface LocatedWindowDirectInput {
  /** 北纬为正的纬度；不使用默认城市。 */
  readonly latitudeDeg: number
  /** 东经为正的经度；不使用默认窗位。 */
  readonly longitudeDeg: number
  /** 同一时刻的瞬时DNI，不能塞入小时均值。 */
  readonly radiation: InstantaneousNormalRadiation
  /** 明确的窗面外侧几何输入。 */
  readonly plane: WindowExteriorPlane
}

/** 近似太阳方向与窗面结果，未定义方位保持明确状态。 */
export interface LocatedWindowDirectResult {
  /** 近似可算或当前方位无法定义；不代表生产策略已准入。 */
  readonly state: 'estimated' | 'undefined_solar_azimuth'
  /** NOAA近似来源与方向结果。 */
  readonly solar: SolarDirectionEstimate
  /** 有效方位下的窗面外侧投影，不能当作植物叶面。 */
  readonly projection: WindowDirectResult | null
}

/** 对未定义太阳方位仍执行输入守卫，不用虚构方位调用下游计算。 */
function validateUndefinedDirectionInputs(input: LocatedWindowDirectInput): void {
  if (input.radiation.semantics !== 'instantaneous') { throw new Error('窗面直射仅接受瞬时辐射') }
  const plane = input.plane
  if (typeof plane.reference !== 'string' || !plane.reference.trim()
    || !Number.isFinite(plane.tiltDeg) || plane.tiltDeg < 0 || plane.tiltDeg > 180
    || !Number.isFinite(plane.azimuthDeg) || plane.azimuthDeg < 0 || plane.azimuthDeg >= 360) {
    throw new Error('窗面角度或引用非法')
  }
  const range = input.radiation.dniWattsPerM2
  if (range !== null && (!range || !Number.isFinite(range.lower) || !Number.isFinite(range.upper)
    || range.lower < 0 || range.upper < range.lower)) { throw new Error('直接法向辐射范围非法') }
}

/** 地点/时刻→NOAA近似太阳方向→窗面瞬时投影；无网络、事件或发布副作用。 */
export function projectWindowDirectAtLocation(input: LocatedWindowDirectInput): LocatedWindowDirectResult {
  const solar = estimateSolarDirection({ atMs: input.radiation.atMs,
    latitudeDeg: input.latitudeDeg, longitudeDeg: input.longitudeDeg })
  if (solar.azimuthDeg === null) {
    validateUndefinedDirectionInputs(input)
    return { state: 'undefined_solar_azimuth', solar, projection: null }
  }
  const projection = projectWindowDirect({ radiation: input.radiation, plane: input.plane,
    sun: { atMs: solar.atMs, elevationDeg: solar.elevationDeg, azimuthDeg: solar.azimuthDeg } })
  return { state: 'estimated', solar, projection }
}
