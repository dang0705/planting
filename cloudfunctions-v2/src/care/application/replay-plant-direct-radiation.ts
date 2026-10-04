import { normalizeOpenMeteoRadiation } from '../light/normalize-open-meteo-radiation.js'
import type { NormalizedOutdoorRadiation, RadiationNormalizationContext } from '../light/normalize-open-meteo-radiation.js'
import { boundPlantDirectInterval, validatePlantWindowIntervalTarget } from '../light/bound-plant-direct-interval.js'
import type { PlantDirectIntervalBound, PlantWindowIntervalTarget } from '../light/bound-plant-direct-interval.js'
import type { IrradianceRange } from '../light/project-window-direct.js'

/** 单时段几何直射均值；不包含玻璃，也不等于植物叶面测量。 */
export interface PlantDirectReplayInterval {
  /** 实际辐射时段开始UTC毫秒。 */
  readonly intervalStartMs: number
  /** 实际辐射时段结束UTC毫秒。 */
  readonly intervalEndMs: number
  /** 只输出区间均值界限，不宣称瞬时值或精确时序。 */
  readonly semantics: 'interval_mean_bounds'
  /** 可计算范围或缺少DNI；缺失不得被夜间零值吞掉。 */
  readonly state: 'bounded' | 'missing_radiation'
  /** 完整时段可达性，未知不能冒充实际整段变化。 */
  readonly reachState: PlantDirectIntervalBound['state']
  /** 窗面及目标点完整界限与依据，可独立回放。 */
  readonly geometry: PlantDirectIntervalBound
  /** 平行窗面、通过植物点的未透光几何辐照范围，单位瓦每平方米。 */
  readonly geometricDirectWattsPerM2: IrradianceRange | null
}

/** 来源制品与固定目标的离线回放，未取得正式光照发布资格。 */
export interface PlantDirectRadiationReplay extends Omit<NormalizedOutdoorRadiation, 'intervals'> {
  /** 界限只覆盖NOAA近似模型自身。 */
  readonly scope: 'model_only'
  /** 所选植物点引用，不混同窗面引用。 */
  readonly plantReference: string
  /** 太阳计算实际使用的地点，不能把天气网格默认当作目标地点。 */
  readonly location: {
    /** 北纬为正的太阳计算纬度，单位为度。 */
    readonly latitudeDeg: number
    /** 东经为正的太阳计算经度，单位为度。 */
    readonly longitudeDeg: number
  }
  /** 窗面原始几何参考引用。 */
  readonly sourceWindowReference: string
  /** 明确目标参考平面为通过植物点且平行窗面的数学平面。 */
  readonly referencePlaneDefinition: 'through_target_parallel_to_window'
  /** 玻璃和其他传播损失未计算，不以默认透过率代替准入。 */
  readonly transmissionApplied: false
  /** 只含Provider制品实际覆盖的时段，不生成缺失的整日记录。 */
  readonly intervals: readonly PlantDirectReplayInterval[]
}

/** 实际归一化与完整资格界限组合，不假设辐射与太阳方向统计独立。 */
export function replayPlantDirectRadiation(
  rawResponse: unknown,
  context: RadiationNormalizationContext,
  target: PlantWindowIntervalTarget,
): PlantDirectRadiationReplay {
  const { intervals: radiationIntervals, ...source } = normalizeOpenMeteoRadiation(rawResponse, context)
  validatePlantWindowIntervalTarget(target)
  const intervals = radiationIntervals.map((radiation): PlantDirectReplayInterval => {
    const geometry = boundPlantDirectInterval({ ...target, intervalStartMs: radiation.intervalStartMs, intervalEndMs: radiation.intervalEndMs })
    const dni = radiation.dniWattsPerM2
    const geometricDirectWattsPerM2 = dni === null ? null : {
      lower: dni * geometry.windowProjection.lower * geometry.lower,
      upper: dni * geometry.windowProjection.upper * geometry.upper,
    }
    return { intervalStartMs: radiation.intervalStartMs, intervalEndMs: radiation.intervalEndMs,
      semantics: 'interval_mean_bounds', state: dni === null ? 'missing_radiation' : 'bounded',
      reachState: geometry.state, geometry, geometricDirectWattsPerM2 }
  })
  return { ...source, scope: 'model_only', plantReference: target.plantReference,
    location: { latitudeDeg: target.latitudeDeg, longitudeDeg: target.longitudeDeg }, sourceWindowReference: target.plane.reference,
    referencePlaneDefinition: 'through_target_parallel_to_window', transmissionApplied: false, intervals }
}
