import { normalizeOpenMeteoRadiation, type RadiationNormalizationContext, type NormalizedOutdoorRadiation, type OutdoorRadiationInterval } from './normalize-open-meteo-radiation.js'

/** 显式实验模型及窗外接收平面，不假设太阳光束方向或室内距离倍率。 */
export interface IsotropicDiffusePlane {
  /** 必须明确选择均匀天空假设；不是自动 Provider 降级策略。 */
  readonly skyModel: 'isotropic'
  /** 相对水平面倾角，度；0 朝上水平，90 竖直，180 朝下。 */
  readonly tiltDeg: number
  /** 稳定窗外平面引用；不等同植物叶面引用。 */
  readonly reference: string
}

/** 与明确平面匹配的水平散射输入，单位 W/m²。 */
export interface IsotropicWindowDiffuseInput extends IsotropicDiffusePlane {
  /** 户外水平散射辐照；null 是缺值，不是零。 */
  readonly dhiWattsPerM2: number | null
}

/** 无遮挡均匀天空的窗外基准；不是最终室内或现场误差界限。 */
export interface IsotropicWindowDiffuseResult {
  /** 固定窗外实验范围。 */
  readonly scope: 'window_exterior_candidate'
  /** 尚未经过正式策略及现场校准准入。 */
  readonly productionAdmission: false
  /** 显式假设天空亮度均匀且无外遮挡，不假装该假设为现场事实。 */
  readonly assumption: 'uniform_unobstructed_sky'
  /** 对应的接收平面引用。 */
  readonly planeReference: string
  /** 窗外天空散射估计，W/m²；没有玻璃、窗帘、反射或室内传播。 */
  readonly unobstructedSkyDiffuseWattsPerM2: number | null
}

/** 逐时散射回放保留 Provider 原始时段与来源，不制造全天积分。 */
export interface IsotropicDiffuseReplay {
  /** 实际天气制品归一化结果，保持模型估算/预报语义。 */
  readonly radiation: NormalizedOutdoorRadiation
  /** 每个真实时段的实验窗外散射结果。 */
  readonly intervals: readonly (OutdoorRadiationInterval & {
    /** 独立散射分支，不把 DNI 或太阳方向代入散射角度。 */
    readonly diffuse: IsotropicWindowDiffuseResult
  })[]
}

/** pvlib isotropic：DHI × (1 + cos(窗面倾角)) / 2；均匀天空球面投影，不是经验折扣。 */
export function projectIsotropicWindowDiffuse(input: IsotropicWindowDiffuseInput): IsotropicWindowDiffuseResult {
  if (input === null || typeof input !== 'object' || input.skyModel !== 'isotropic' ||
    typeof input.reference !== 'string' || input.reference.trim().length === 0 ||
    typeof input.tiltDeg !== 'number' || !Number.isFinite(input.tiltDeg) || input.tiltDeg < 0 || input.tiltDeg > 180) {
    throw new TypeError('缺少明确均匀天空模型、窗外平面或合法倾角')
  }
  const dhi = input.dhiWattsPerM2
  if (dhi !== null && (typeof dhi !== 'number' || !Number.isFinite(dhi) || dhi < 0)) {
    throw new TypeError('水平散射辐照必须是有限非负数，或明确缺失 null')
  }
  const skyProjection = (1 + Math.cos(input.tiltDeg * Math.PI / 180)) / 2
  return {
    scope: 'window_exterior_candidate', productionAdmission: false,
    assumption: 'uniform_unobstructed_sky', planeReference: input.reference,
    unobstructedSkyDiffuseWattsPerM2: dhi === null ? null : dhi * skyProjection,
  }
}

/** 固定平面下按实际 DHI 均值回放；公式线性，不把瞬时太阳方向乘到小时均值上。 */
export function replayIsotropicWindowDiffuse(
  raw: unknown, context: RadiationNormalizationContext, plane: IsotropicDiffusePlane,
): IsotropicDiffuseReplay {
  // 空序列也验证平面；null 只用于验证，不返回人为补出的观测或零值。
  projectIsotropicWindowDiffuse({ ...plane, dhiWattsPerM2: null })
  const radiation = normalizeOpenMeteoRadiation(raw, context)
  return { radiation, intervals: radiation.intervals.map(interval => ({
    ...interval, diffuse: projectIsotropicWindowDiffuse({ ...plane, dhiWattsPerM2: interval.dhiWattsPerM2 }),
  })) }
}
