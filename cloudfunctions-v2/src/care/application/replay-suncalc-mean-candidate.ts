import { normalizeOpenMeteoRadiation } from '../light/normalize-open-meteo-radiation.js'
import type { NormalizedOutdoorRadiation, RadiationNormalizationContext } from '../light/normalize-open-meteo-radiation.js'
import { projectSunCalcWindowDirect } from './project-suncalc-window-direct.js'
import type { SolarWindowReplayLocation } from './replay-solar-window-radiation.js'

/** 三点 Gauss–Legendre 数学节点，映射到[0,1]；不是运营或采集参数。 */
const nodes = [(1 - Math.sqrt(3 / 5)) / 2, 0.5, (1 + Math.sqrt(3 / 5)) / 2] as const
/** 求积平均权重和为1；不是保水或光照修正倍率。 */
const weights = [5 / 18, 4 / 9, 5 / 18] as const

/**
 * 对单位区间投影求三点数值平均；不宣称覆盖所有时刻或误差界限。
 * NIST Gauss公式的固定定义；供本候选回放及独立多项式核验使用。
 */
export function estimateThreePointMean(evaluate: (fraction: number) => number): number {
  let result = 0
  for (const [index, node] of nodes.entries()) {
    const value = evaluate(node)
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError('候选平均投影必须在零至一之间')
    }
    result += value * weights[index]!
  }
  return result
}

/** 可追溯数值节点，不把三个点标成完整时段界限。 */
export interface SunCalcMeanSample {
  /** 实际使用的整数UTC毫秒，映射后四舍五入。 */
  readonly atMs: number
  /** 求积平均权重，来源为固定数学公式。 */
  readonly weight: number
  /** 此时刻截断后的窗面投影。 */
  readonly projectionFactor: number
  /** 精确太阳算法依赖版本。 */
  readonly solarMethod: 'suncalc@2.1.0'
}

/** 真实Provider时段与显式恒定DNI假设的实验结果。 */
export interface SunCalcMeanCandidateInterval {
  /** 原始前一时段的开始UTC毫秒。 */
  readonly intervalStartMs: number
  /** 原始时段标签结束UTC毫秒。 */
  readonly intervalEndMs: number
  /** 窗面外表面引用，不是植物叶面。 */
  readonly referencePlane: string
  /** 无法由平均DNI证明，必须保留的实验假设。 */
  readonly assumption: 'piecewise_constant_dni'
  /** 明确数值采样没有严格误差认证。 */
  readonly numericalGuarantee: 'not_certified'
  /** 三点估算的平均投影，不是全区间上下界。 */
  readonly estimatedMeanProjection: number
  /** 依赖恒定DNI假设的估计瓦每平方米；缺失保持null。 */
  readonly constantDniEstimateWattsPerM2: number | null
  /** 不依赖云量与投影相关性的普适范围；缺DNI保持null。 */
  readonly nonnegativePhysicalEnvelope: {
    /** 非负量普适下界，不证明具体窗口全程有光。 */
    readonly lower: number
    /** 不超过Provider平均DNI的普适上界。 */
    readonly upper: number
  } | null
  /** 实际使用的节点、版本与权重，便于离线回放。 */
  readonly samples: readonly SunCalcMeanSample[]
}

/** 不具有生产准入的完整候选回放；不生成DLI或行为。 */
export interface SunCalcMeanCandidateReplay {
  /** 明确只能用于已批准的离线比较。 */
  readonly scope: 'offline_candidate'
  /** 不允许被当作生产算法发布。 */
  readonly productionAdmission: false
  /** 原始响应来源、地点时区、均值语义与真实覆盖。 */
  readonly radiation: NormalizedOutdoorRadiation
  /** 太阳使用的地点，与Provider网格地点分开。 */
  readonly location: {
    /** 北纬为正的度数。 */
    readonly latitudeDeg: number
    /** 东经为正的度数。 */
    readonly longitudeDeg: number
  }
  /** 每条真实区间的候选估计与非负物理范围。 */
  readonly intervals: readonly SunCalcMeanCandidateInterval[]
}

/**
 * 实际原始制品→区间归一化→SunCalc与窗面投影→恒定DNI实验回放。
 * 不套NOAA界限，不将数值节点的极值声明为全区间保证。
 */
export function replaySunCalcMeanCandidate(
  rawResponse: unknown,
  context: RadiationNormalizationContext,
  location: SolarWindowReplayLocation,
): SunCalcMeanCandidateReplay {
  const radiation = normalizeOpenMeteoRadiation(rawResponse, context)
  // 空响应也必须验证明确地点与窗面；零DNI只用于无副作用的输入校验。
  projectSunCalcWindowDirect({ ...location, radiation: {
    atMs: context.fetchedAtMs, semantics: 'instantaneous', dniWattsPerM2: { lower: 0, upper: 0 }
  } })
  const intervals = radiation.intervals.map(interval => {
    const samples: SunCalcMeanSample[] = []
    const estimatedMeanProjection = estimateThreePointMean(fraction => {
      const atMs = Math.round(interval.intervalStartMs
        + fraction * (interval.intervalEndMs - interval.intervalStartMs))
      const result = projectSunCalcWindowDirect({ ...location, radiation: {
        atMs, semantics: 'instantaneous', dniWattsPerM2: null
      } })
      samples.push({ atMs, weight: weights[samples.length]!,
        projectionFactor: result.projection.projectionFactor, solarMethod: result.solar.method })
      return result.projection.projectionFactor
    })
    const dni = interval.dniWattsPerM2
    return {
      intervalStartMs: interval.intervalStartMs,
      intervalEndMs: interval.intervalEndMs,
      referencePlane: location.plane.reference,
      assumption: 'piecewise_constant_dni' as const,
      numericalGuarantee: 'not_certified' as const,
      estimatedMeanProjection,
      constantDniEstimateWattsPerM2: dni === null ? null : dni * estimatedMeanProjection,
      nonnegativePhysicalEnvelope: dni === null ? null : { lower: 0, upper: dni },
      samples
    }
  })
  return { scope: 'offline_candidate', productionAdmission: false, radiation,
    location: { latitudeDeg: location.latitudeDeg, longitudeDeg: location.longitudeDeg }, intervals }
}
