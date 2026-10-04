import { boundSolarWindowInterval } from './bound-solar-window-interval.js'
import type { ModelSolarWindowBound, SolarWindowIntervalInput } from './bound-solar-window-interval.js'
import { estimateSolarDirection } from './estimate-solar-direction.js'
import { solarDirectionMaxRatePerSecond } from './solar-direction-rate-bound.js'
import { validateDirectReachGeometry } from './trace-direct-through-window.js'
import type { PlantWindowPosition, WindowAperture } from './trace-direct-through-window.js'

/** 明确地点、竖窗及单个目标点，不把坐标估算档位当作测量。 */
export interface PlantWindowIntervalTarget extends Omit<SolarWindowIntervalInput, 'intervalStartMs' | 'intervalEndMs'> {
  /** 选定目标点引用，不代替长期用户植物归属键。 */
  readonly plantReference: string
  /** 同一窗口坐标系中的植物点及垂直距离，单位为米。 */
  readonly plant: PlantWindowPosition
  /** 实际透光开口矩形并集，不包含墙体或窗框。 */
  readonly apertures: readonly WindowAperture[]
}

/** 完整左闭右开时段，瞬时判断不能直接充当本输入。 */
export interface PlantDirectIntervalInput extends PlantWindowIntervalTarget {
  /** 开始UTC毫秒，必须能安全表示。 */
  readonly intervalStartMs: number
  /** 结束UTC毫秒，必须晚于开始。 */
  readonly intervalEndMs: number
}

/** 给定几何与近似模型中的全时段可达资格，不含光强或测量误差。 */
export interface PlantDirectIntervalBound {
  /** 本界限对应的开始UTC毫秒。 */
  readonly intervalStartMs: number
  /** 本界限对应的结束UTC毫秒。 */
  readonly intervalEndMs: number
  /** 计算属于NOAA近似模型自身，不是现场精度保证。 */
  readonly scope: 'model_only'
  /** 整段已证明可达、不可达或界限不够紧；未知不证明实际发生变化。 */
  readonly state: 'all_reachable' | 'all_blocked' | 'mixed_or_uncertain'
  /** 可达资格整段下界，只能为零或一。 */
  readonly lower: 0 | 1
  /** 可达资格整段上界，只能为零或一。 */
  readonly upper: 0 | 1
  /** 明确选定的目标点引用。 */
  readonly plantReference: string
  /** 线性半空间与方向变化上界的数学依据引用。 */
  readonly evidenceRef: string
  /** 实际计算的UTC年子段数量。 */
  readonly segmentCount: number
  /** 同一时段窗面外侧投影界限；不能改称植物叶面。 */
  readonly windowProjection: ModelSolarWindowBound
}

/** 仅检查地点和目标几何，不生成虚构太阳时段；空序列也必须执行。 */
export function validatePlantWindowIntervalTarget(input: PlantWindowIntervalTarget): void {
  if (!Number.isFinite(input.latitudeDeg) || Math.abs(input.latitudeDeg) > 90
    || !Number.isFinite(input.longitudeDeg) || Math.abs(input.longitudeDeg) > 180) {
    throw new RangeError('植物点回放位置非法')
  }
  if (typeof input.plantReference !== 'string' || !input.plantReference.trim()
    || typeof input.plane.reference !== 'string' || !input.plane.reference.trim()) {
    throw new RangeError('植物点或窗口引用非法')
  }
  if (input.plane.tiltDeg !== 90) { throw new RangeError('全时段植物点求交仅支持竖窗') }
  validateDirectReachGeometry({ plant: input.plant, apertures: input.apertures, windowAzimuthDeg: input.plane.azimuthDeg })
}

/** 以线性半空间完整时段界限证明可达性，不把中点或采样极值当作证书。 */
export function boundPlantDirectInterval(input: PlantDirectIntervalInput): PlantDirectIntervalBound {
  validatePlantWindowIntervalTarget(input)
  const windowProjection = boundSolarWindowInterval(input)
  const radians = Math.PI / 180
  const latitude = input.latitudeDeg * radians
  const azimuth = input.plane.azimuthDeg * radians
  const normal = [Math.sin(azimuth), Math.cos(azimuth), 0] as const
  const right = [Math.cos(azimuth), -Math.sin(azimuth), 0] as const
  const up = [0, 0, 1] as const
  let cursor = input.intervalStartMs
  let lower: 0 | 1 = 1
  let upper: 0 | 1 = 0
  let segmentCount = 0
  while (cursor < input.intervalEndMs) {
    const nextYear = new Date(cursor)
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1, 0, 1)
    nextYear.setUTCHours(0, 0, 0, 0)
    const boundary = nextYear.getTime()
    const end = Number.isFinite(boundary) ? Math.min(input.intervalEndMs, boundary) : input.intervalEndMs
    const midpoint = cursor + Math.floor((end - cursor) / 2)
    const solar = estimateSolarDirection({ atMs: midpoint, latitudeDeg: input.latitudeDeg, longitudeDeg: input.longitudeDeg })
    const declination = solar.declinationRad
    const hourAngle = solar.hourAngleDeg * radians
    const direction = [-Math.cos(declination) * Math.sin(hourAngle),
      Math.cos(latitude) * Math.sin(declination) - Math.sin(latitude) * Math.cos(declination) * Math.cos(hourAngle),
      Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)] as const
    const durationRadius = Math.max(midpoint - cursor, end - midpoint) / 1000
    // 任意固定线性式的变化界限由向量范数缩放；严格符号判断不增加人为容差。
    const boundForm = (vector: readonly number[]): readonly [number, number] => {
      const value = vector.reduce((sum, coefficient, index) => sum + coefficient * direction[index]!, 0)
      const radius = Math.hypot(...vector) * solarDirectionMaxRatePerSecond * durationRadius
      if (![value - radius, value + radius].every(Number.isFinite)) { throw new RangeError('开口线性界限不可表示') }
      return [value - radius, value + radius]
    }
    const normalBound = boundForm(normal)
    const upBound = boundForm(up)
    const { xM: x, yM: y, perpendicularDistanceM: distance } = input.plant
    const openings = input.apertures.map(aperture => {
      const form = (normalScale: number, other: readonly number[], otherScale: number) => boundForm(
        normal.map((coefficient, index) => coefficient * normalScale + other[index]! * otherScale)
      )
      return [form(x - aperture.leftM, right, distance), form(aperture.rightM - x, right, -distance),
        form(y - aperture.bottomM, up, distance), form(aperture.topM - y, up, -distance)]
    })
    const reachable = normalBound[0] > 0 && upBound[0] > 0 && openings.some(forms => forms.every(form => form[0] > 0))
    const blocked = normalBound[1] <= 0 || upBound[1] <= 0 || openings.every(forms => forms.some(form => form[1] < 0))
    lower = lower === 1 && reachable ? 1 : 0
    upper = upper === 1 || !blocked ? 1 : 0
    segmentCount++
    cursor = end
    // 已联合成[0,1]后，剩余子段不能再扩大资格界限。
    if (lower === 0 && upper === 1) { break }
  }
  return { intervalStartMs: input.intervalStartMs, intervalEndMs: input.intervalEndMs, scope: 'model_only',
    state: lower === 1 ? 'all_reachable' : upper === 0 ? 'all_blocked' : 'mixed_or_uncertain',
    lower, upper, plantReference: input.plantReference,
    evidenceRef: 'linear_window_half_spaces:global_rotation_rate_bound:model_only', segmentCount, windowProjection }
}
