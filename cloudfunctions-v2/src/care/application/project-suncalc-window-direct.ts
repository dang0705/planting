import { deriveSunCalcDirection } from '../light/derive-suncalc-direction.js'
import type { SunCalcDirectionResult } from '../light/derive-suncalc-direction.js'
import { projectWindowDirect } from '../light/project-window-direct.js'
import type { WindowDirectResult } from '../light/project-window-direct.js'
import type { LocatedWindowDirectInput } from './project-window-direct-at-location.js'

/** 使用同一位置、时刻和版本的瞬时窗面派生；不代表全天覆盖。 */
export interface SunCalcWindowDirectResult {
  /** 折射校正太阳视方向与依赖版本，禁止混成NOAA几何方向。 */
  readonly solar: SunCalcDirectionResult
  /** 使用该视方向的瞬时窗面结果；未包含玻璃或植物传播。 */
  readonly projection: WindowDirectResult
}

/**
 * 已批准SunCalc路线的离线瞬时协作用例，复用既有窗面几何职责。
 * 不使用小时DNI均值作为瞬时值，不接正式Care HTTP或旧NOAA时段界限。
 */
export function projectSunCalcWindowDirect(input: LocatedWindowDirectInput): SunCalcWindowDirectResult {
  const solar = deriveSunCalcDirection({ atMs: input.radiation.atMs,
    latitudeDeg: input.latitudeDeg, longitudeDeg: input.longitudeDeg })
  const projection = projectWindowDirect({ radiation: input.radiation, plane: input.plane,
    sun: { atMs: solar.atMs, elevationDeg: solar.apparentElevationDeg, azimuthDeg: solar.azimuthDeg } })
  return { solar, projection }
}
