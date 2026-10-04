import { normalizeOpenMeteoRadiation } from '../light/normalize-open-meteo-radiation.js'
import type { RadiationNormalizationContext } from '../light/normalize-open-meteo-radiation.js'
import { boundSolarWindowInterval } from '../light/bound-solar-window-interval.js'
import type { ModelSolarWindowBound } from '../light/bound-solar-window-interval.js'
import type { WindowExteriorPlane } from '../light/project-window-direct.js'
import { replayWindowDirectRadiation } from './replay-window-direct-radiation.js'
import type { WindowDirectRadiationReplay } from './replay-window-direct-radiation.js'

/** 独立保存太阳计算地点；不把Provider天气网格自动当作植物地点。 */
export interface SolarWindowReplayLocation {
  /** 显式北纬为正的地点纬度。 */
  readonly latitudeDeg: number
  /** 显式东经为正的地点经度。 */
  readonly longitudeDeg: number
  /** 此位置的窗面外侧几何定义。 */
  readonly plane: WindowExteriorPlane
}

/** 完整时段模型界限与真实制品均值的离线组合，不具有发布资格。 */
export interface SolarWindowRadiationReplay {
  /** 不含现场误差、玻璃和植物位置传播的范围声明。 */
  readonly scope: 'model_only'
  /** 太阳计算实际使用的地点，与天气来源单独追溯。 */
  readonly location: {
    /** 太阳计算使用的纬度，单位为度，北纬为正。 */
    readonly latitudeDeg: number
    /** 太阳计算使用的经度，单位为度，东经为正。 */
    readonly longitudeDeg: number
  }
  /** 可追溯的完整时段模型几何与数学依据。 */
  readonly geometryBounds: readonly ModelSolarWindowBound[]
  /** 真实制品的来源、时间与均值直射界限。 */
  readonly radiation: WindowDirectRadiationReplay
}

/** 归一化→完整时段太阳界限→均值回放；不把瞬时样本伪装成整段均值。 */
export function replaySolarWindowRadiation(
  rawResponse: unknown,
  context: RadiationNormalizationContext,
  location: SolarWindowReplayLocation,
): SolarWindowRadiationReplay {
  const normalized = normalizeOpenMeteoRadiation(rawResponse, context)
  // 地点与窗面准入不依赖数据数量；空序列只表示无覆盖，不能绕过输入校验。
  if (!Number.isFinite(location.latitudeDeg) || Math.abs(location.latitudeDeg) > 90
    || !Number.isFinite(location.longitudeDeg) || Math.abs(location.longitudeDeg) > 180) {
    throw new RangeError('太阳回放位置非法')
  }
  if (typeof location.plane.reference !== 'string' || !location.plane.reference.trim()
    || !Number.isFinite(location.plane.tiltDeg) || location.plane.tiltDeg < 0 || location.plane.tiltDeg > 180
    || !Number.isFinite(location.plane.azimuthDeg) || location.plane.azimuthDeg < 0 || location.plane.azimuthDeg >= 360) {
    throw new RangeError('太阳回放窗面非法')
  }
  const geometryBounds = normalized.intervals.map(interval => boundSolarWindowInterval({
    intervalStartMs: interval.intervalStartMs,
    intervalEndMs: interval.intervalEndMs,
    latitudeDeg: location.latitudeDeg,
    longitudeDeg: location.longitudeDeg,
    plane: location.plane,
  }))
  return { scope: 'model_only', location: { latitudeDeg: location.latitudeDeg, longitudeDeg: location.longitudeDeg },
    geometryBounds, radiation: replayWindowDirectRadiation(rawResponse, context, location.plane.reference, geometryBounds) }
}
