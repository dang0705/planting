import { normalizeOpenMeteoRadiation } from '../light/normalize-open-meteo-radiation.js'
import type { NormalizedOutdoorRadiation, RadiationNormalizationContext } from '../light/normalize-open-meteo-radiation.js'
import { boundWindowMeanDirect } from '../light/bound-window-mean-direct.js'
import type { WholeIntervalProjectionBound } from '../light/bound-window-mean-direct.js'
import type { IrradianceRange } from '../light/project-window-direct.js'

/** 单条窗面离线回放结果，缺失不补默认值。 */
export interface WindowDirectReplayInterval {
  /** 原响应对应的开始 UTC 毫秒，不按主机时区转换。 */
  readonly intervalStartMs: number
  /** 原响应对应的结束 UTC 毫秒，不把标签当成开始。 */
  readonly intervalEndMs: number
  /** 完整界限可算、缺几何或缺辐射；同时缺失详见 missingInputs。 */
  readonly state: 'bounded' | 'missing_geometry_bound' | 'missing_radiation'
  /** 保守区间均值界限，区别于精确时序或瞬时值。 */
  readonly semantics: 'interval_mean_bounds'
  /** 明确所有缺少的输入；即使另一个输入已缺失也不能隐藏此缺口。 */
  readonly missingInputs: readonly ('geometry' | 'dni')[]
  /** 几何依据仅用于追溯，不因引用存在就认证为生产策略。 */
  readonly geometryEvidenceRef: string | null
  /** 窗面外侧平均直射范围，瓦每平方米；缺证据保持空值。 */
  readonly directWattsPerM2: IrradianceRange | null
}

/** 原始辐射制品到窗面直射的回放输出；没有发布或持久化副作用。 */
export interface WindowDirectRadiationReplay extends Omit<NormalizedOutdoorRadiation, 'intervals'> {
  /** 本次明确选择的窗面外侧参考平面，所有界限必须一致。 */
  readonly referencePlane: string
  /** 仅含来源实际拥有的时段，不生成整天缺失样本。 */
  readonly intervals: readonly WindowDirectReplayInterval[]
}

/** 真实归一化器与界限算法按严格时段连接；外部 Adapter 负责取得响应。 */
export function replayWindowDirectRadiation(
  rawResponse: unknown,
  context: RadiationNormalizationContext,
  referencePlane: string,
  geometryBounds: readonly WholeIntervalProjectionBound[],
): WindowDirectRadiationReplay {
  if (typeof referencePlane !== 'string' || !referencePlane.trim()) {
    throw new Error('目标窗面引用非法')
  }
  if (!Array.isArray(geometryBounds)) {
    throw new Error('几何界限集合非法')
  }
  const { intervals: radiationIntervals, ...source } = normalizeOpenMeteoRadiation(rawResponse, context)
  const radiationByInterval = new Map(radiationIntervals.map(interval => [
    `${interval.intervalStartMs}/${interval.intervalEndMs}`, interval,
  ]))
  const boundsByInterval = new Map<string, WholeIntervalProjectionBound>()
  for (const geometry of geometryBounds) {
    if (!geometry || geometry.referencePlane !== referencePlane) {
      throw new Error('几何窗面与目标不一致')
    }
    const key = `${geometry.intervalStartMs}/${geometry.intervalEndMs}`
    if (boundsByInterval.has(key)) {
      throw new Error('几何时段重复')
    }
    const radiation = radiationByInterval.get(key)
    if (!radiation) {
      throw new Error('几何时段不属于当前辐射响应')
    }
    // 即使 DNI 缺失也校验几何完整性，禁止用短路掩盖非法输入。
    boundWindowMeanDirect(radiation, geometry)
    boundsByInterval.set(key, geometry)
  }
  const intervals = radiationIntervals.map((radiation): WindowDirectReplayInterval => {
    const geometry = boundsByInterval.get(`${radiation.intervalStartMs}/${radiation.intervalEndMs}`)
    const missingInputs: ('geometry' | 'dni')[] = []
    if (!geometry) { missingInputs.push('geometry') }
    if (radiation.dniWattsPerM2 === null) { missingInputs.push('dni') }
    const result = geometry ? boundWindowMeanDirect(radiation, geometry) : null
    return {
      intervalStartMs: radiation.intervalStartMs,
      intervalEndMs: radiation.intervalEndMs,
      semantics: 'interval_mean_bounds',
      state: !geometry ? 'missing_geometry_bound' : radiation.dniWattsPerM2 === null ? 'missing_radiation' : 'bounded',
      missingInputs,
      geometryEvidenceRef: result?.geometryEvidenceRef ?? null,
      directWattsPerM2: result?.directWattsPerM2 ?? null,
    }
  })
  return { ...source, referencePlane, intervals }
}
