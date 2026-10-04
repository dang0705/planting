import type { OutdoorRadiationInterval } from './normalize-open-meteo-radiation.js'
import type { IrradianceRange } from './project-window-direct.js'

/** 同一完整时段的投影界限；调用方必须提供可靠依据，来源字符串不构成证明。 */
export interface WholeIntervalProjectionBound {
  /** 完整覆盖的开始时刻，UTC 毫秒。 */
  intervalStartMs: number
  /** 完整覆盖的结束时刻，UTC 毫秒。 */
  intervalEndMs: number
  /** 区别于单点或采样极值的明确语义。 */
  semantics: 'whole_interval_bound'
  /** 窗面外侧参考平面引用。 */
  referencePlane: string
  /** 界限依据引用，不自动认证其有效性。 */
  evidenceRef: string
  /** 完整区间投影下界，范围零至一。 */
  lower: number
  /** 完整区间投影上界，范围零至一。 */
  upper: number
}

/** 窗面外侧直射均值的保守范围，不含猜测中值。 */
export interface WindowMeanDirectBound {
  /** 辐射原区间的开始时刻。 */
  intervalStartMs: number
  /** 辐射原区间的结束时刻。 */
  intervalEndMs: number
  /** 保守平均值界限，不能声明为精确时序。 */
  semantics: 'interval_mean_bounds'
  /** 窗面外侧参考平面，不能改称植物叶面。 */
  referencePlane: string
  /** 投影界限依据引用。 */
  geometryEvidenceRef: string
  /** 直射辐照范围，单位瓦每平方米；缺失保持空值。 */
  directWattsPerM2: IrradianceRange | null
}

/** 对非负 DNI 积分应用完整时段投影界限；不假设辐射与投影变化无关。 */
export function boundWindowMeanDirect(
  radiation: OutdoorRadiationInterval,
  geometry: WholeIntervalProjectionBound,
): WindowMeanDirectBound {
  if (radiation.semantics !== 'interval_mean') {throw new Error('辐射必须为区间均值')}
  if (geometry.semantics !== 'whole_interval_bound') {throw new Error('几何必须为全区间界限')}
  if (!Number.isSafeInteger(radiation.intervalStartMs) || !Number.isSafeInteger(radiation.intervalEndMs)
    || radiation.intervalEndMs <= radiation.intervalStartMs
    || geometry.intervalStartMs !== radiation.intervalStartMs
    || geometry.intervalEndMs !== radiation.intervalEndMs) {throw new Error('辐射与几何时段非法或不一致')}
  if (typeof geometry.referencePlane !== 'string' || !geometry.referencePlane.trim()
    || typeof geometry.evidenceRef !== 'string' || !geometry.evidenceRef.trim()
    || !Number.isFinite(geometry.lower) || !Number.isFinite(geometry.upper)
    || geometry.lower < 0 || geometry.upper > 1 || geometry.lower > geometry.upper) {
    throw new Error('几何界限或来源非法')
  }
  const dni = radiation.dniWattsPerM2
  if (dni !== null && (typeof dni !== 'number' || !Number.isFinite(dni) || dni < 0)) {
    throw new Error('辐射值非法')
  }
  return {
    intervalStartMs: radiation.intervalStartMs,
    intervalEndMs: radiation.intervalEndMs,
    semantics: 'interval_mean_bounds',
    referencePlane: geometry.referencePlane,
    geometryEvidenceRef: geometry.evidenceRef,
    directWattsPerM2: dni === null ? null : { lower: dni * geometry.lower, upper: dni * geometry.upper },
  }
}
