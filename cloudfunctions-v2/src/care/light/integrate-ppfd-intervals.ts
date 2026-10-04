/** 有限非负的 PPFD 或积分上下界，不以中值替代不确定区间。 */
export interface LightQuantityRange {
  /** 可信的非负下界；单位由使用该类型的字段明确。 */
  readonly lower: number
  /** 不低于下界的有限上界；不得填入猜测的缺段增量。 */
  readonly upper: number
}

/** 已解析为绝对时刻的左闭右开目标区间。 */
export interface LightIntegrationWindow {
  /** 开始时刻的整数毫秒时间戳，由地点日期解析上游提供。 */
  readonly startMs: number
  /** 结束时刻的整数毫秒时间戳，必须严格晚于开始。 */
  readonly endMs: number
  /** 稳定参考平面标识，禁止窗面与植物位置混合计算。 */
  readonly referencePlane: string
}

/** 可积分的 PPFD 区间平均值；null 与观测到零不同。 */
export interface PpfdMeanInterval extends LightIntegrationWindow {
  /** 明确为区间平均值；瞬时读数须先由上游建立合法平均值证据。 */
  readonly semantics: 'interval_mean'
  /** 微摩尔每平方米每秒的上下界；null 表示缺失数据。 */
  readonly ppfdMicromolPerM2PerSecond: LightQuantityRange | null
}

/** 光照证据缺失的绝对时间范围，不自行补成零光照。 */
export interface MissingLightInterval {
  /** 缺段开始的绝对整数毫秒时间戳。 */
  readonly startMs: number
  /** 缺段结束的绝对整数毫秒时间戳。 */
  readonly endMs: number
}

/** 离线积分结果；是否可命名为 DLI 由完整当地日期上游判定。 */
export interface PpfdIntegrationResult {
  /** 只描述证据覆盖完整、部分或完全缺失，不代表建议准入。 */
  readonly status: 'complete' | 'partial' | 'none'
  /** 有效非空 PPFD 证据实际覆盖的毫秒总数。 */
  readonly coveredMs: number
  /** 已知时段的摩尔每平方米积分；必须连同覆盖信息消费。 */
  readonly knownIntegralMolPerM2: LightQuantityRange
  /** 完整覆盖目标时的积分；缺段或无证据时为 null。 */
  readonly completeIntegralMolPerM2: LightQuantityRange | null
  /** 按时间顺序列出的缺段，不含有效零光照时段。 */
  readonly missingIntervals: readonly MissingLightInterval[]
}

/** 国际单位定义，已登记为不可配置硬规则，不是业务参数。 */
const millisecondsPerSecond = 1_000
/** 微摩尔到摩尔的国际单位前缀换算，不是辐射换算系数。 */
const micromolesPerMole = 1_000_000

/** 拒绝非法时刻与空参考平面，不依赖主机时区或猜测日期。 */
function validateWindow(window: LightIntegrationWindow): void {
  if (
    !Number.isSafeInteger(window.startMs) ||
    !Number.isSafeInteger(window.endMs) ||
    window.endMs <= window.startMs ||
    !Number.isSafeInteger(window.endMs - window.startMs)
  ) {
    throw new RangeError('光照时间区间非法')
  }
  if (typeof window.referencePlane !== 'string' || window.referencePlane.trim().length === 0) {
    throw new RangeError('光照参考平面缺失')
  }
}

/** 校验 PPFD 的数值范围；缺证据只允许显式 null。 */
function validateRange(value: LightQuantityRange | null): void {
  if (value === null) {
    return
  }
  if (
    !value ||
    !Number.isFinite(value.lower) ||
    !Number.isFinite(value.upper) ||
    value.lower < 0 ||
    value.upper < value.lower
  ) {
    throw new RangeError('PPFD 区间非法')
  }
}

/**
 * 对明确的区间平均 PPFD 积分，只报告已知总量及覆盖，不写任何业务数据。
 * 缺段不补零，重叠不猜优先级；算法发布、传播和 Provider 准入仍由上游负责。
 */
export function integratePpfdIntervals(
  window: LightIntegrationWindow,
  intervals: readonly PpfdMeanInterval[]
): PpfdIntegrationResult {
  validateWindow(window)
  const unique = new Map<string, PpfdMeanInterval>()
  for (const interval of intervals) {
    validateWindow(interval)
    if (interval.referencePlane !== window.referencePlane) {
      throw new RangeError('光照参考平面不一致')
    }
    if (interval.semantics !== 'interval_mean') {
      throw new RangeError('光照积分只接受区间平均值')
    }
    validateRange(interval.ppfdMicromolPerM2PerSecond)
    const startMs = Math.max(window.startMs, interval.startMs)
    const endMs = Math.min(window.endMs, interval.endMs)
    if (endMs <= startMs) {
      continue
    }
    // 按原区间去重；仅裁切后相同而原证据不同的区间仍属于重叠冲突。
    const quantity = interval.ppfdMicromolPerM2PerSecond
    const key = JSON.stringify([
      interval.startMs,
      interval.endMs,
      quantity?.lower ?? null,
      quantity?.upper ?? null
    ])
    unique.set(key, { ...interval, startMs, endMs })
  }
  const sorted = [...unique.values()].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  let previousEnd = window.startMs
  for (const interval of sorted) {
    if (interval.startMs < previousEnd) {
      throw new RangeError('光照证据时间区间重叠')
    }
    previousEnd = interval.endMs
  }
  let cursor = window.startMs
  let coveredMs = 0
  let lower = 0
  let upper = 0
  const missingIntervals: MissingLightInterval[] = []
  for (const interval of sorted) {
    const quantity = interval.ppfdMicromolPerM2PerSecond
    if (quantity === null) {
      continue
    }
    if (interval.startMs > cursor) {
      missingIntervals.push({ startMs: cursor, endMs: interval.startMs })
    }
    const durationMs = interval.endMs - interval.startMs
    const durationSeconds = durationMs / millisecondsPerSecond
    lower += (quantity.lower * durationSeconds) / micromolesPerMole
    upper += (quantity.upper * durationSeconds) / micromolesPerMole
    coveredMs += durationMs
    cursor = interval.endMs
  }
  if (cursor < window.endMs) {
    missingIntervals.push({ startMs: cursor, endMs: window.endMs })
  }
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    throw new RangeError('PPFD 积分超出有限数值范围')
  }
  const knownIntegralMolPerM2 = { lower, upper }
  const status = coveredMs === 0 ? 'none' : missingIntervals.length === 0 ? 'complete' : 'partial'
  return {
    status,
    coveredMs,
    knownIntegralMolPerM2,
    completeIntegralMolPerM2: status === 'complete' ? { ...knownIntegralMolPerM2 } : null,
    missingIntervals
  }
}
