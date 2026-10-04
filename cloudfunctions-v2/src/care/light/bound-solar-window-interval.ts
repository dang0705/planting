import { estimateSolarDirection } from './estimate-solar-direction.js'
import type { WindowExteriorPlane } from './project-window-direct.js'
import type { WholeIntervalProjectionBound } from './bound-window-mean-direct.js'

/** 固定地点、窗面和完整UTC时段，禁止默认朝向或位置。 */
export interface SolarWindowIntervalInput {
  /** 左闭开始UTC毫秒。 */
  readonly intervalStartMs: number
  /** 右开结束UTC毫秒，必须晚于开始。 */
  readonly intervalEndMs: number
  /** 北纬为正的纬度。 */
  readonly latitudeDeg: number
  /** 东经为正的经度。 */
  readonly longitudeDeg: number
  /** 窗面外侧单位法线的角度定义。 */
  readonly plane: WindowExteriorPlane
}

/** 仅覆盖NOAA近似模型的时段界限，不覆盖真实太阳与模型的误差。 */
export interface ModelSolarWindowBound extends WholeIntervalProjectionBound {
  /** 精度与误差声明不能被来源字符串取代。 */
  readonly scope: 'model_only'
  /** 全局谐波角速度证明，非样本极值。 */
  readonly method: 'global_rotation_rate_bound'
  /** 实际计算的UTC年子段数量。 */
  readonly segmentCount: number
  /** 投影与向上分量的共同变化速度上界，每秒。 */
  readonly maxRatePerSecond: number
}

/** NOAA固定公式的谐波导数上界；不属于运营可调倍率。 */
const declinationDerivative = 0.399912 + 0.070257 + 2 * 0.006758 + 2 * 0.000907 + 3 * 0.002697 + 3 * 0.00148
/** 时间方程对年内角的导数绝对值上界，分钟每弧度。 */
const equationDerivative = 229.18 * (0.001868 + 0.032077 + 2 * 0.014615 + 2 * 0.040849)
/** 取平年最大角速度也覆盖闰年，单位弧度每秒。 */
const gammaRate = 2 * Math.PI / (365 * 86400)
/** 旋转向量导数范数和，包含太阳时与赤纬两条变化来源。 */
const maxRatePerSecond = declinationDerivative * gammaRate + 2 * Math.PI / 86400 + Math.PI / 720 * equationDerivative * gammaRate

/** 在每个UTC年内用全局变化速度形成时段界限，跨年联合以覆盖全年角切换。 */
export function boundSolarWindowInterval(input: SolarWindowIntervalInput): ModelSolarWindowBound {
  const { intervalStartMs: start, intervalEndMs: end, plane } = input
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start
    || !Number.isSafeInteger(end - start) || !Number.isFinite(new Date(end).getTime())) {
    throw new Error('太阳界限时段非法')
  }
  if (typeof plane.reference !== 'string' || !plane.reference.trim()
    || !Number.isFinite(plane.tiltDeg) || plane.tiltDeg < 0 || plane.tiltDeg > 180
    || !Number.isFinite(plane.azimuthDeg) || plane.azimuthDeg < 0 || plane.azimuthDeg >= 360) {
    throw new Error('太阳界限窗面非法')
  }
  // 先验证开始时刻和位置，避免长区间或夜间绕过输入守卫。
  estimateSolarDirection({ atMs: start, latitudeDeg: input.latitudeDeg, longitudeDeg: input.longitudeDeg })
  const radians = Math.PI / 180
  const tilt = plane.tiltDeg * radians
  const azimuth = plane.azimuthDeg * radians
  const normal = { east: Math.sin(tilt) * Math.sin(azimuth), north: Math.sin(tilt) * Math.cos(azimuth), up: Math.cos(tilt) }
  const latitude = input.latitudeDeg * radians
  let cursor = start
  let lower = 1
  let upper = 0
  let segmentCount = 0
  while (cursor < end) {
    const nextYear = new Date(cursor)
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1, 0, 1)
    nextYear.setUTCHours(0, 0, 0, 0)
    const boundary = nextYear.getTime()
    const segmentEnd = Number.isFinite(boundary) ? Math.min(end, boundary) : end
    const midpoint = cursor + Math.floor((segmentEnd - cursor) / 2)
    const solar = estimateSolarDirection({ atMs: midpoint, latitudeDeg: input.latitudeDeg, longitudeDeg: input.longitudeDeg })
    const declination = solar.declinationRad
    const hourAngle = solar.hourAngleDeg * radians
    const east = -Math.cos(declination) * Math.sin(hourAngle)
    const north = Math.cos(latitude) * Math.sin(declination) - Math.sin(latitude) * Math.cos(declination) * Math.cos(hourAngle)
    const up = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)
    const dot = east * normal.east + north * normal.north + up * normal.up
    const radius = maxRatePerSecond * Math.max(midpoint - cursor, segmentEnd - midpoint) / 1000
    const segmentLower = up - radius > 0 ? Math.max(0, Math.min(1, dot - radius)) : 0
    const segmentUpper = up + radius <= 0 ? 0 : Math.max(0, Math.min(1, dot + radius))
    lower = Math.min(lower, segmentLower)
    upper = Math.max(upper, segmentUpper)
    segmentCount++
    cursor = segmentEnd
    // 已覆盖物理全域[0,1]时，剩余子段不可能扩大界限；不以采样替代证明。
    if (lower === 0 && upper === 1) { break }
  }
  return { intervalStartMs: start, intervalEndMs: end, referencePlane: plane.reference,
    semantics: 'whole_interval_bound', evidenceRef: 'noaa_general_solar_position:global_rotation_rate_bound:model_only',
    lower, upper, scope: 'model_only', method: 'global_rotation_rate_bound', segmentCount, maxRatePerSecond }
}
