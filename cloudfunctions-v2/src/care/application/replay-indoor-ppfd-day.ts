import { replayIndoorNaturalLight, type IndoorLightTarget, type IndoorTransmission, type IndoorNaturalLightReplay } from './replay-indoor-natural-light.js'
import { integratePpfdIntervals, type LightQuantityRange, type PpfdIntegrationResult } from '../light/integrate-ppfd-intervals.js'
import type { RadiationNormalizationContext } from '../light/normalize-open-meteo-radiation.js'

/** 光谱换算实验策略；不会从玻璃类型或Lux反推一个默认值。 */
export interface SpectralConversionCandidate {
  /** 换算制品或实验策略的来源引用，不代表正式发布。 */
  readonly sourceRef: string
  /** 辐射W/m²乘此系数得到微摩尔每平方米每秒。 */
  readonly unit: 'micromol_per_joule'
  /** 直射光谱换算区间；未知必须明确为null。 */
  readonly direct: LightQuantityRange | null
  /** 散射光谱换算区间，独立于直射；不强制使用同一系数。 */
  readonly diffuse: LightQuantityRange | null
}

/** 上游提供目标地点完整当地日的绝对边界，后端独立验证。 */
export interface LocalLightDay {
  /** 明确的公历当地日期，YYYY-MM-DD。 */
  readonly date: string
  /** 明确的IANA时区，不依赖服务器时区。 */
  readonly timezone: string
  /** 当地日开始的安全整数UTC毫秒。 */
  readonly startMs: number
  /** 次日开始的安全整数UTC毫秒；夏令时日不一定24小时。 */
  readonly endMs: number
}

/** 对每个实际平均辐射时段分别转换双通道光子量。 */
export interface IndoorPpfdCandidateInterval {
  /** Provider实际区间开始，UTC毫秒。 */
  readonly startMs: number
  /** Provider实际区间结束，UTC毫秒。 */
  readonly endMs: number
  /** 直射PPFD候选区间；不是瞬时峰值。 */
  readonly directPpfd: LightQuantityRange | null
  /** 散射PPFD候选区间；没有光谱参数保持未知。 */
  readonly diffusePpfd: LightQuantityRange | null
  /** 同一接收平面双通道相加；任一缺失时为null。 */
  readonly totalPpfd: LightQuantityRange | null
}

/** 完整自然光候选到双通道光子量和当地日期积分，不进入正式养护决策。 */
export interface IndoorPpfdDayReplay {
  /** 固定离线比较范围。 */
  readonly scope: 'offline_candidate'
  /** 正式发布与现场校准尚未验收。 */
  readonly productionAdmission: false
  /** 上游太阳、传播假设与真实天气来源。 */
  readonly naturalLight: IndoorNaturalLightReplay
  /** 显式光谱换算参数及来源。 */
  readonly conversion: SpectralConversionCandidate
  /** 经过当地日期边界核验的目标日。 */
  readonly day: LocalLightDay
  /** 实际时段双通道结果，不补时段、不合成瞬时轨迹。 */
  readonly intervals: readonly IndoorPpfdCandidateInterval[]
  /** 直射的已知积分和缺段。 */
  readonly direct: PpfdIntegrationResult
  /** 散射的已知积分和缺段。 */
  readonly diffuse: PpfdIntegrationResult
  /** 双通道都可用时的总积分及覆盖。 */
  readonly total: PpfdIntegrationResult
  /** 仅完整覆盖完整当地日才给出DLI候选，单位摩尔每平方米；否则null。 */
  readonly dailyIntegralMolPerM2: LightQuantityRange | null
}

/** 拒绝无来源、错误单位、非法区间；不替pending参数填值。 */
function validateConversion(conversion: SpectralConversionCandidate): void {
  if (!conversion || conversion.unit !== 'micromol_per_joule' || typeof conversion.sourceRef !== 'string' || !conversion.sourceRef.trim()) {
    throw new TypeError('缺少明确光谱换算来源或单位')
  }
  for (const range of [conversion.direct, conversion.diffuse]) {
    if (range !== null && (!range || !Number.isFinite(range.lower) || !Number.isFinite(range.upper) || range.lower < 0 || range.upper < range.lower)) {
      throw new RangeError('光谱换算区间非法')
    }
  }
}

/** 校验真实当地日期边界；午夜跳时可能从01:00开始，不能假设每天24小时。 */
export function validateLocalLightDay(day: LocalLightDay): void {
  if (!day || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || typeof day.timezone !== 'string' || !day.timezone.trim()) {
    throw new TypeError('缺少明确当地日期或时区')
  }
  const calendar = new Date(`${day.date}T00:00:00Z`)
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day.date) { throw new RangeError('当地公历日期非法') }
  if (![day.startMs, day.endMs].every(Number.isSafeInteger) || day.endMs <= day.startMs) { throw new RangeError('当地日绝对边界非法') }
  const nextDate = new Date(calendar.getTime() + 86_400_000).toISOString().slice(0, 10)
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: day.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  const format = (atMs: number): string => {
    const parts = Object.fromEntries(formatter.formatToParts(atMs).map(part => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
  }
  if (day.startMs % 1000 !== 0 || day.endMs % 1000 !== 0 || format(day.startMs).slice(0, 10) !== day.date || format(day.endMs).slice(0, 10) !== nextDate ||
    format(day.startMs - 1).slice(0, 10) === day.date || format(day.endMs - 1).slice(0, 10) !== day.date) {
    throw new RangeError('提供的区间不是目标时区完整当地日')
  }
}

/** 辐射区间与光谱区间均非负，端点相乘；拒绝溢出，不将有限检查当作误差认证。 */
function convert(value: LightQuantityRange | null, coefficient: LightQuantityRange | null): LightQuantityRange | null {
  if (value === null || coefficient === null) { return null }
  const result = { lower: value.lower * coefficient.lower, upper: value.upper * coefficient.upper }
  if (!Number.isFinite(result.lower) || !Number.isFinite(result.upper)) { throw new RangeError('PPFD候选超出有限数值范围') }
  return result
}

/**
 * 自然光回放→独立光谱参数→同面双通道PPFD→按真实时间积分。
 * 积分结果仍继承上游候选假设；完整覆盖也不代表预测精度或发布准入。
 */
export function replayIndoorPpfdDay(
  raw: unknown, context: RadiationNormalizationContext, target: IndoorLightTarget,
  losses: IndoorTransmission, conversion: SpectralConversionCandidate, day: LocalLightDay,
): IndoorPpfdDayReplay {
  validateConversion(conversion)
  validateLocalLightDay(day)
  const naturalLight = replayIndoorNaturalLight(raw, context, target, losses)
  const intervals = naturalLight.intervals.map(interval => {
    const directPpfd = convert(interval.directWattsPerM2, conversion.direct)
    const diffusePpfd = convert(interval.diffuseWattsPerM2, conversion.diffuse)
    const totalPpfd = directPpfd === null || diffusePpfd === null ? null : { lower: directPpfd.lower + diffusePpfd.lower, upper: directPpfd.upper + diffusePpfd.upper }
    return { startMs: interval.intervalStartMs, endMs: interval.intervalEndMs, directPpfd, diffusePpfd, totalPpfd }
  })
  const window = { startMs: day.startMs, endMs: day.endMs, referencePlane: target.plantReference }
  const integrate = (branch: 'directPpfd' | 'diffusePpfd' | 'totalPpfd'): PpfdIntegrationResult => integratePpfdIntervals(window, intervals.map(interval => ({
    startMs: interval.startMs, endMs: interval.endMs, referencePlane: target.plantReference, semantics: 'interval_mean', ppfdMicromolPerM2PerSecond: interval[branch],
  })))
  const direct = integrate('directPpfd')
  const diffuse = integrate('diffusePpfd')
  const total = integrate('totalPpfd')
  return { scope: 'offline_candidate', productionAdmission: false, naturalLight, conversion: structuredClone(conversion), day: { ...day }, intervals,
    direct, diffuse, total, dailyIntegralMolPerM2: total.completeIntegralMolPerM2 }
}
