import { normalizeOpenMeteoRadiation, type RadiationNormalizationContext, type NormalizedOutdoorRadiation } from '../light/normalize-open-meteo-radiation.js'
import { propagateIsotropicWindowDiffuse, type IsotropicApertureInput } from '../light/propagate-window-diffuse.js'
import { traceDirectThroughWindow, validateDirectReachGeometry } from '../light/trace-direct-through-window.js'
import { projectSunCalcWindowDirect } from './project-suncalc-window-direct.js'
import { estimateThreePointMean } from './replay-suncalc-mean-candidate.js'
import type { SolarWindowReplayLocation } from './replay-solar-window-radiation.js'
import type { IrradianceRange } from '../light/project-window-direct.js'

/** 同一个实际竖窗坐标系及目标点，不把窗外平面量直接当作植物光照。 */
export interface IndoorLightTarget extends SolarWindowReplayLocation, Pick<IsotropicApertureInput, 'plant' | 'apertures' | 'skyModel'> {
  /** 目标植物点引用；输出数学接收面与窗面平行。 */
  readonly plantReference: string
}

/** 明确来源的实验透过率区间；直射与散射不能共用未经说明的倍率。 */
export interface TransmissionEvidence {
  /** 来源制品或实验策略引用；本用例不证明它已经生产审校。 */
  readonly sourceRef: string
  /** 直射透过率区间，零至一；null 表示未知。 */
  readonly direct: IrradianceRange | null
  /** 散射透过率区间，零至一；null 表示未知。 */
  readonly diffuse: IrradianceRange | null
}

/** 两个不同传播效应各出现一次；没有隐式无遮挡或玻璃默认值。 */
export interface IndoorTransmission {
  /** 玻璃传播损失，不包含窗洞几何、窗帘或现场校准。 */
  readonly glass: TransmissionEvidence
  /** 窗帘传播损失；明确无遮挡也须提供来源和单位区间。 */
  readonly curtain: TransmissionEvidence
}

/** 输入透过率区间作用于候选值，不把采样误差包装成严格全时段界限。 */
export interface IndoorLightInterval {
  /** Provider 实际时段开始，UTC 毫秒。 */
  readonly intervalStartMs: number
  /** Provider 实际时段结束，UTC 毫秒。 */
  readonly intervalEndMs: number
  /** 已锁定太阳方向算法及版本。 */
  readonly solarMethod: 'suncalc@2.1.0'
  /** 三点直射积分未认证误差，散射仍假设均匀天空。 */
  readonly numericalGuarantee: 'not_certified'
  /** 几何直射候选叠加显式损失区间；缺任何必要输入返回 null。 */
  readonly directWattsPerM2: IrradianceRange | null
  /** 有限开口天空散射候选叠加显式损失区间。 */
  readonly diffuseWattsPerM2: IrradianceRange | null
  /** 同一目标窗平行面上相加；缺一分支不能当作完整总量。 */
  readonly totalWattsPerM2: IrradianceRange | null
}

/** 真实制品经过直射和散射链路的离线组合；不产生正式建议或写入事实。 */
export interface IndoorNaturalLightReplay {
  /** 未审校的实验范围。 */
  readonly scope: 'offline_candidate'
  /** 禁止因完成回放就视为正式发布。 */
  readonly productionAdmission: false
  /** 固定数学参考面，不能与水平面、叶面或窗外面混用。 */
  readonly referencePlaneDefinition: 'through_target_parallel_to_window'
  /** 目标点引用，便于关联回放。 */
  readonly plantReference: string
  /** 实际来源、时段均值语义、时区及覆盖范围。 */
  readonly radiation: NormalizedOutdoorRadiation
  /** 显式保留玻璃与窗帘参数来源，避免传播与校准混同。 */
  readonly transmission: IndoorTransmission
  /** 未获得透过率的分支；不制造默认值。 */
  readonly missingTransmission: readonly string[]
  /** 每条真实区间的自然光候选；没有 PPFD 换算或全天补齐。 */
  readonly intervals: readonly IndoorLightInterval[]
}

/** 实验输入仍须符合纯传播损失范围；校准及反射增强不得塞入此输入。 */
function validateTransmission(losses: IndoorTransmission): string[] {
  const missing: string[] = []
  for (const name of ['glass', 'curtain'] as const) {
    const effect = losses?.[name]
    if (!effect || typeof effect.sourceRef !== 'string' || !effect.sourceRef.trim()) { throw new TypeError('传播损失缺少明确来源') }
    for (const branch of ['direct', 'diffuse'] as const) {
      const range = effect[branch]
      if (range === null) { missing.push(`${name}.${branch}`) }
      else if (!range || !Number.isFinite(range.lower) || !Number.isFinite(range.upper) || range.lower < 0 || range.upper > 1 || range.lower > range.upper) {
        throw new RangeError('传播透过率必须是零至一的有序区间，或明确未知')
      }
    }
  }
  return missing
}

/** 非负候选乘独立列出的传播区间；输入缺失严格保留 null。 */
function attenuate(value: number | null, first: IrradianceRange | null, second: IrradianceRange | null): IrradianceRange | null {
  if (value === null || first === null || second === null) { return null }
  return { lower: value * first.lower * second.lower, upper: value * first.upper * second.upper }
}

/**
 * 实际气象归一化→同轮 SunCalc/窗洞直射→均匀天空有限窗洞散射→显式玻璃和窗帘→同面相加。
 * 直射仍采用分段恒定 DNI 与三点求积假设；不能套用 NOAA 的严格区间界限。
 * 当前不计算其他建筑或室内物体遮挡，不声称现场误差范围或正式模型准入。
 */
export function replayIndoorNaturalLight(raw: unknown, context: RadiationNormalizationContext, target: IndoorLightTarget, losses: IndoorTransmission): IndoorNaturalLightReplay {
  const missingTransmission = validateTransmission(losses)
  if (target.plane.tiltDeg !== 90 || typeof target.plantReference !== 'string' || !target.plantReference.trim()) { throw new RangeError('需要明确目标点与实际竖窗') }
  validateDirectReachGeometry({ plant: target.plant, apertures: target.apertures, windowAzimuthDeg: target.plane.azimuthDeg })
  const diffuseGeometry = propagateIsotropicWindowDiffuse({ ...target, planeReference: target.plantReference, dhiWattsPerM2: null }).skyGeometricFactor
  // 空响应同样验证太阳位置；null 只用于几何守卫，不生成天气观测。
  projectSunCalcWindowDirect({ ...target, radiation: { atMs: context.fetchedAtMs, semantics: 'instantaneous', dniWattsPerM2: null } })
  const radiation = normalizeOpenMeteoRadiation(raw, context)
  const intervals = radiation.intervals.map(interval => {
    const projection = estimateThreePointMean(fraction => {
      const atMs = Math.round(interval.intervalStartMs + fraction * (interval.intervalEndMs - interval.intervalStartMs))
      const computed = projectSunCalcWindowDirect({ ...target, radiation: { atMs, semantics: 'instantaneous', dniWattsPerM2: null } })
      const reach = traceDirectThroughWindow({ plant: target.plant, apertures: target.apertures, windowAzimuthDeg: target.plane.azimuthDeg,
        sun: { atMs, elevationDeg: computed.solar.apparentElevationDeg, azimuthDeg: computed.solar.azimuthDeg } })
      // 边界采样本身也只作候选；不是整区间可达性或概率证明。
      return reach.status === 'reachable' || reach.status === 'boundary' ? computed.projection.projectionFactor : 0
    })
    const directWattsPerM2 = attenuate(interval.dniWattsPerM2 === null ? null : interval.dniWattsPerM2 * projection, losses.glass.direct, losses.curtain.direct)
    const diffuseWattsPerM2 = attenuate(interval.dhiWattsPerM2 === null ? null : interval.dhiWattsPerM2 * diffuseGeometry, losses.glass.diffuse, losses.curtain.diffuse)
    return { intervalStartMs: interval.intervalStartMs, intervalEndMs: interval.intervalEndMs,
      solarMethod: 'suncalc@2.1.0' as const, numericalGuarantee: 'not_certified' as const,
      directWattsPerM2, diffuseWattsPerM2, totalWattsPerM2: directWattsPerM2 === null || diffuseWattsPerM2 === null ? null : {
        lower: directWattsPerM2.lower + diffuseWattsPerM2.lower, upper: directWattsPerM2.upper + diffuseWattsPerM2.upper,
      } }
  })
  return { scope: 'offline_candidate', productionAdmission: false, referencePlaneDefinition: 'through_target_parallel_to_window', plantReference: target.plantReference,
    radiation, transmission: structuredClone(losses), missingTransmission, intervals }
}
