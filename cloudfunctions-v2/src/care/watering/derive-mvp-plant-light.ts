import type { NormalizedOutdoorRadiation } from '../light/normalize-open-meteo-radiation.js'
import type { DryingRange } from './replay-dry-progress.js'

/** 每天毫秒数。 */
const millisecondsPerDay = 86_400_000
/** 每小时毫秒数。 */
const millisecondsPerHour = 3_600_000

/** 单通道光照所需的已发布策略字段。 */
export interface MvpPlantLightPolicy {
  /** 日光下多少 lux 对应 1 μmol/(m²·s) PPFD 的区间。 */
  readonly luxPerPpfd: DryingRange
  /** 锚点可用的测量时段最低室外 GHI（W/m²）。 */
  readonly luxAnchorMinGhiWm2: number
  /** 各 Lux 来源的相对读数误差（0～1）。 */
  readonly luxUncertainty: {
    /** 照度计读数的相对误差。 */
    readonly meter: number
    /** 摄像头估算读数的相对误差。 */
    readonly camera_estimate: number
  }
  /** Lux 读数可继续使用的最长天数。 */
  readonly luxAnchorMaxAgeDays: number
  /** 全波段日光每 W/m² 光合光子通量的物理上界（μmol/J；v4 来自发布，v1–v3 按版本语义为 2.3）。 */
  readonly maximumPpfdPerGhi: number
  /** 室内实测温湿度覆盖测量后的小时数（合同 2a 节；v4 来自发布，v1–v3 按版本语义为 24）。 */
  readonly indoorClimateWindowHours: number
}

/** 植物位置的一次 Lux 读数。 */
export interface MvpLightReading {
  /** 照度（lux），非负。 */
  readonly lux: number
  /** 测量 UTC 毫秒。 */
  readonly measuredAtMs: number
  /** 读数来源：照度计或摄像头估算。 */
  readonly source: 'meter' | 'camera_estimate'
}

/** 室内一次温湿度实测。 */
export interface MvpIndoorClimateReading {
  /** 室内温度（°C）。 */
  readonly temperatureC: number
  /** 室内相对湿度（%，0～100）。 */
  readonly relativeHumidityPercent: number
  /** 测量 UTC 毫秒。 */
  readonly measuredAtMs: number
}

/** 光照推导输入。 */
export interface MvpPlantLightInput {
  /** 已解析的活动策略字段。 */
  readonly policy: MvpPlantLightPolicy
  /** 已标准化的 Open-Meteo 辐射时段序列。 */
  readonly radiation: NormalizedOutdoorRadiation
  /** 植物位置 Lux 读数；未测为 null。 */
  readonly lightReading: MvpLightReading | null
  /** 室内温湿度实测；未测为 null。 */
  readonly indoorClimate: MvpIndoorClimateReading | null
  /** 本次计算 UTC 毫秒。 */
  readonly now: number
}

/** 组合用例可直接消费的环境时段。 */
export interface MvpPlantLightInterval {
  /** 时段 UTC 起点（含）。 */
  readonly start: number
  /** 时段 UTC 终点（不含）。 */
  readonly end: number
  /** 植物位置时段平均 PPFD 区间。 */
  readonly ppfd: DryingRange
  /** 室内实测 VPD 区间；null 表示用策略兜底估算。 */
  readonly indoorVpdKpa: DryingRange | null
}

/** 推导结果；缺证据时给稳定原因。 */
export type MvpPlantLightResult = {
  /** 植物位置光照可用。 */
  readonly status: 'available'
  /** 有 GHI 的时段（缺 GHI 的时段已跳过，作为缺段）。 */
  readonly intervals: readonly MvpPlantLightInterval[]
} | {
  /** 植物位置光照缺证据。 */
  readonly status: 'insufficient_evidence'
  /** 缺证据原因代码。 */
  readonly reason: 'light_reading' | 'light_reading_stale' | 'anchor_radiation' | 'anchor_too_dark' | 'anchor_inconsistent'
}

/** Tetens 饱和水汽压（kPa）。 */
const saturationVaporPressureKpa = (temperatureC: number) => 0.6108 * Math.exp(17.27 * temperatureC / (temperatureC + 237.3))

/**
 * 合同 2a 节单通道比例法：PPFD(h) = Lux 换算区间 × GHI(h) ÷ GHI(测量时段)。
 * Lux 已包含玻璃、距离与遮挡，不再叠加衰减；不区分直射与散射（已记录局限）。
 */
export function deriveMvpPlantLightIntervals(input: MvpPlantLightInput): MvpPlantLightResult {
  const { policy, radiation, lightReading, indoorClimate, now } = input
  if (lightReading === null) { return { status: 'insufficient_evidence', reason: 'light_reading' } }
  if (!Number.isFinite(lightReading.lux) || lightReading.lux < 0 || !Number.isSafeInteger(lightReading.measuredAtMs) || lightReading.measuredAtMs > now) {
    throw new TypeError('Lux 读数非法')
  }
  if (now - lightReading.measuredAtMs > policy.luxAnchorMaxAgeDays * millisecondsPerDay) {
    return { status: 'insufficient_evidence', reason: 'light_reading_stale' }
  }
  const anchor = radiation.intervals.find(item => item.intervalStartMs <= lightReading.measuredAtMs && lightReading.measuredAtMs < item.intervalEndMs)
  if (!anchor || anchor.ghiWattsPerM2 === null) { return { status: 'insufficient_evidence', reason: 'anchor_radiation' } }
  const anchorGhi = anchor.ghiWattsPerM2
  if (anchorGhi < policy.luxAnchorMinGhiWm2) { return { status: 'insufficient_evidence', reason: 'anchor_too_dark' } }
  const uncertainty = policy.luxUncertainty[lightReading.source]
  const measured = {
    min: lightReading.lux * (1 - uncertainty) / policy.luxPerPpfd.max,
    max: lightReading.lux * (1 + uncertainty) / policy.luxPerPpfd.min,
  }
  if (measured.min > anchorGhi * input.policy.maximumPpfdPerGhi) { return { status: 'insufficient_evidence', reason: 'anchor_inconsistent' } }
  const climateVpd = indoorClimate === null ? null
    : saturationVaporPressureKpa(indoorClimate.temperatureC) * (1 - indoorClimate.relativeHumidityPercent / 100)
  const intervals: MvpPlantLightInterval[] = []
  for (const item of radiation.intervals) {
    if (item.ghiWattsPerM2 === null) { continue }
    const scale = item.ghiWattsPerM2 / anchorGhi
    const measuredClimate = indoorClimate !== null && climateVpd !== null && item.intervalStartMs >= indoorClimate.measuredAtMs
      && item.intervalStartMs < indoorClimate.measuredAtMs + input.policy.indoorClimateWindowHours * millisecondsPerHour
    intervals.push({
      start: item.intervalStartMs, end: item.intervalEndMs,
      ppfd: { min: measured.min * scale, max: measured.max * scale },
      indoorVpdKpa: measuredClimate ? { min: climateVpd, max: climateVpd } : null,
    })
  }
  return { status: 'available', intervals }
}
