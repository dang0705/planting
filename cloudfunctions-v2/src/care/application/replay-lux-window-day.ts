import { projectSunCalcWindowDirect } from './project-suncalc-window-direct.js'
import { replaySunCalcMeanCandidate, type SunCalcMeanCandidateReplay } from './replay-suncalc-mean-candidate.js'
import { validateLocalLightDay, type LocalLightDay, type IndoorPpfdCandidateInterval } from './replay-indoor-ppfd-day.js'
import type { SolarWindowReplayLocation } from './replay-solar-window-radiation.js'
import { projectIsotropicWindowDiffuse } from '../light/project-window-diffuse.js'
import { deriveLuxCompositeAnchor, applyLuxCompositeAnchor, type LuxCompositeAnchor, type PlantLuxObservation } from '../light/lux-composite-anchor.js'
import { integratePpfdIntervals, type LightQuantityRange, type PpfdIntegrationResult } from '../light/integrate-ppfd-intervals.js'
import type { RadiationNormalizationContext } from '../light/normalize-open-meteo-radiation.js'

/** 双通道换算参数均为明确候选；缺失不得使用源码默认。 */
interface ChannelConversion {
  /** 窗面直射光谱换算范围。 */
  readonly direct: LightQuantityRange | null
  /** 窗面散射光谱换算范围，不能由直射默补。 */
  readonly diffuse: LightQuantityRange | null
}

/** 同刻标定与日回放的明确光谱候选，不等于正式发布策略。 */
export interface LuxWindowConversionCandidate {
  /** 实验制品来源，后续必须独立取得正式准入。 */
  readonly sourceRef: string
  /** 辐照度 W/m² 到照度 Lux 的系数。 */
  readonly luxPerWattPerM2: ChannelConversion
  /** 辐照度 W/m² 到 PPFD μmol/(m²·s) 的系数。 */
  readonly micromolPerJoule: ChannelConversion
}

/** 与植物位置 Lux 同时取得的瞬时室外参考，不接受平均字段冒充。 */
export interface LuxAnchorInstantRadiation {
  /** 系统记录的瞬时采集 UTC 毫秒时刻。 */
  readonly atMs: number
  /** 独立来源，平均制品不证明本瞬时参考真实存在。 */
  readonly sourceRef: string
  /** 原字段须明确为瞬时语义。 */
  readonly semantics: 'instantaneous'
  /** 三个参考平面的辐射量仍共用此国际单位。 */
  readonly unit: 'W/m²'
  /** 太阳法向直射，缺失为 null。 */
  readonly dniWattsPerM2: LightQuantityRange | null
  /** 水平面散射，缺失为 null。 */
  readonly dhiWattsPerM2: LightQuantityRange | null
}

/** 极简用户事实及内部已取得的来源制品；没有玻璃、距离或窗洞必填项。 */
export interface LuxWindowDayReplayInput {
  /** 保存的原始平均辐射制品，交给既有 AJV 校验。 */
  readonly raw: unknown
  /** 来源及小时／十五分钟平均语义。 */
  readonly context: RadiationNormalizationContext
  /** 植物地点与朝向对应的后端参考平面。 */
  readonly location: SolarWindowReplayLocation
  /** 明确目标完整当地日，不依赖服务器默认时区。 */
  readonly day: LocalLightDay
  /** 本次植物位置，改变后不能复用锚点。 */
  readonly plantReference: string
  /** 显式均匀天空实验假设，不猜外部遮挡。 */
  readonly skyModel: 'isotropic'
  /** 实际 Lux 读数及来源／确认记录。 */
  readonly observation: PlantLuxObservation
  /** 与读数严格同刻的瞬时参考。 */
  readonly instant: LuxAnchorInstantRadiation
  /** 明确换算候选，不向用户索取系数。 */
  readonly conversion: LuxWindowConversionCandidate
}

/** 锚点可用也不证明全天覆盖或正式建议准入。 */
export type LuxWindowDayReplayResult =
  | {
      /** 仅离线回放可以运行。 */
      readonly status: 'available'
      /** 本用例永远不授予正式准入。 */
      readonly productionAdmission: false
      /** 同刻共享传播候选与原始来源。 */
      readonly anchor: Extract<LuxCompositeAnchor, {
        /** 仅选择可计算的离线候选，不授予生产资格。 */
        status: 'available'
      }>
      /** 固定标定输入，调用方随后修改位置或读数不改历史回放。 */
      readonly calibration: {
        /** 原采集事实及单位／时刻／来源。 */
        readonly observation: PlantLuxObservation
        /** 原瞬时辐射，不借日序列重建此点。 */
        readonly instant: LuxAnchorInstantRadiation
        /** 当时植物地点与窗面朝向，避免只存引用无法回放。 */
        readonly location: SolarWindowReplayLocation
        /** 当时显式天空假设。 */
        readonly skyModel: 'isotropic'
      }
      /** 真实平均时段、SunCalc版本及三点候选假设。 */
      readonly solar: SunCalcMeanCandidateReplay
      /** 锁定换算候选，防止调用方随后修改版本。 */
      readonly conversion: LuxWindowConversionCandidate
      /** 经过校验的完整当地日边界。 */
      readonly day: LocalLightDay
      /** 两个通道及合计，均为区间平均候选。 */
      readonly intervals: readonly IndoorPpfdCandidateInterval[]
      /** 直射范围积分，不是太阳峰值或认证误差。 */
      readonly direct: PpfdIntegrationResult
      /** 明确天空假设下散射范围积分。 */
      readonly diffuse: PpfdIntegrationResult
      /** 总量积分及实际覆盖。 */
      readonly total: PpfdIntegrationResult
      /** 只有完整覆盖当地日才非空，仍然是候选。 */
      readonly dailyIntegralMolPerM2: LightQuantityRange | null
    }
  | {
      /** 缺标定证据时不输出植物位置成功结果。 */
      readonly status: 'insufficient_evidence'
      /** 缺失原因及非生产边界。 */
      readonly anchor: Extract<LuxCompositeAnchor, {
        /** 仅选择缺标定证据的结果分支。 */
        status: 'insufficient_evidence'
      }>
      /** 始终不授予正式准入。 */
      readonly productionAdmission: false
    }

/** 数学区间只有有限非负端点，不把空值强制转零。 */
function validateRange(range: LightQuantityRange | null): void {
  if (range !== null && (!range || !Number.isFinite(range.lower) || !Number.isFinite(range.upper) || range.lower < 0 || range.upper < range.lower)) {
    throw new RangeError('光照换算或辐射范围非法')
  }
}

/** 正系数区间相乘仍为上下界；溢出拒绝，不隐藏为可用结果。 */
function multiply(range: LightQuantityRange | null, coefficient: LightQuantityRange | null): LightQuantityRange | null {
  if (range === null || coefficient === null) { return null }
  const result = { lower: range.lower * coefficient.lower, upper: range.upper * coefficient.upper }
  validateRange(result)
  return result
}

/** 同一平面量相加；缺一个通道不冒充完整总量。 */
function add(a: LightQuantityRange | null, b: LightQuantityRange | null): LightQuantityRange | null {
  if (a === null || b === null) { return null }
  const result = { lower: a.lower + b.lower, upper: a.upper + b.upper }
  validateRange(result)
  return result
}

/** 明确均匀天空假设的范围投影，不复用太阳入射角。 */
function projectDiffuse(range: LightQuantityRange | null, input: LuxWindowDayReplayInput): LightQuantityRange | null {
  const plane = { skyModel: input.skyModel, tiltDeg: input.location.plane.tiltDeg, reference: input.location.plane.reference }
  const lower = projectIsotropicWindowDiffuse({ ...plane, dhiWattsPerM2: range?.lower ?? null }).unobstructedSkyDiffuseWattsPerM2
  const upper = projectIsotropicWindowDiffuse({ ...plane, dhiWattsPerM2: range?.upper ?? null }).unobstructedSkyDiffuseWattsPerM2
  return lower === null || upper === null ? null : { lower, upper }
}

/**
 * 平均制品和独立瞬时参考→SunCalc窗面→Lux共享候选→双通道PPFD→当地日积分。
 * 不调用旧NOAA界限、不叠玻璃、不写事实；全天共享因子的适用性尚未认证。
 */
export function replayLuxWindowDay(input: LuxWindowDayReplayInput): LuxWindowDayReplayResult {
  validateLocalLightDay(input.day)
  const instant = input.instant
  if (!instant || instant.unit !== 'W/m²' || instant.semantics !== 'instantaneous' || typeof instant.sourceRef !== 'string' || !instant.sourceRef.trim()) {
    throw new TypeError('缺少合法同刻瞬时辐射来源')
  }
  validateRange(instant.dniWattsPerM2)
  validateRange(instant.dhiWattsPerM2)
  const conversion = input.conversion
  if (!conversion || typeof conversion.sourceRef !== 'string' || !conversion.sourceRef.trim()) { throw new TypeError('缺少明确光照换算来源') }
  for (const branch of [conversion.luxPerWattPerM2, conversion.micromolPerJoule]) {
    if (!branch) { throw new TypeError('缺少双通道换算候选') }
    validateRange(branch.direct); validateRange(branch.diffuse)
  }
  const solar = replaySunCalcMeanCandidate(input.raw, input.context, input.location)
  if (solar.radiation.timezone !== input.day.timezone) { throw new TypeError('辐射与当地日时区不一致') }
  const snapshot = projectSunCalcWindowDirect({ ...input.location, radiation: {
    atMs: instant.atMs, semantics: instant.semantics, dniWattsPerM2: instant.dniWattsPerM2,
  } })
  const windowLux = add(multiply(snapshot.projection.directWattsPerM2, conversion.luxPerWattPerM2.direct),
    multiply(projectDiffuse(instant.dhiWattsPerM2, input), conversion.luxPerWattPerM2.diffuse))
  const anchor = deriveLuxCompositeAnchor({ mode: 'shared_channel_candidate', plantReference: input.plantReference,
    windowReference: input.location.plane.reference, observation: input.observation, window: {
      atMs: instant.atMs, windowReference: input.location.plane.reference, sourceRef: instant.sourceRef,
      semantics: 'instantaneous', unit: 'lux', lux: windowLux,
    } })
  if (anchor.status !== 'available') { return { status: 'insufficient_evidence', anchor, productionAdmission: false } }
  const intervals = solar.intervals.map((interval, index): IndoorPpfdCandidateInterval => {
    const dhi = solar.radiation.intervals[index]!.dhiWattsPerM2
    // 保留SunCalc采样估计于solar；区间输出采用普适包络，不将采样值伪装成严格界限。
    const directWindowPpfd = multiply(interval.nonnegativePhysicalEnvelope, conversion.micromolPerJoule.direct)
    const diffuseWindowPpfd = multiply(projectDiffuse(dhi === null ? null : { lower: dhi, upper: dhi }, input), conversion.micromolPerJoule.diffuse)
    const channels = applyLuxCompositeAnchor(anchor, { plantReference: input.plantReference, windowReference: input.location.plane.reference,
      directPpfd: directWindowPpfd, diffusePpfd: diffuseWindowPpfd })
    return { startMs: interval.intervalStartMs, endMs: interval.intervalEndMs, ...channels }
  })
  const window = { startMs: input.day.startMs, endMs: input.day.endMs, referencePlane: input.plantReference }
  const integrate = (branch: 'directPpfd' | 'diffusePpfd' | 'totalPpfd'): PpfdIntegrationResult => integratePpfdIntervals(window, intervals.map(interval => ({
    startMs: interval.startMs, endMs: interval.endMs, referencePlane: input.plantReference, semantics: 'interval_mean', ppfdMicromolPerM2PerSecond: interval[branch],
  })))
  const direct = integrate('directPpfd'); const diffuse = integrate('diffusePpfd'); const total = integrate('totalPpfd')
  return { status: 'available', productionAdmission: false, anchor, solar, calibration: structuredClone({ observation: input.observation, instant, location: input.location, skyModel: input.skyModel }), conversion: structuredClone(conversion), day: { ...input.day },
    intervals, direct, diffuse, total, dailyIntegralMolPerM2: total.completeIntegralMolPerM2 }
}
