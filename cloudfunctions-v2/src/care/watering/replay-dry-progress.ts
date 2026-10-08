/** 等效干燥单位或无量纲倍率的有序非负区间。 */
export interface DryingRange {
  /** 区间下端，不用中值抹掉不确定性。 */
  readonly min: number
  /** 不低于下端的有限区间上端。 */
  readonly max: number
}
/** 同一条件与版本下的区间平均输入；上游负责模型映射与策略准入。 */
export interface DryingInterval {
  /** UTC整数毫秒的区间起点，包含该时刻。 */
  readonly start: number
  /** UTC整数毫秒的区间终点，不包含该时刻。 */
  readonly end: number
  /** 每参考日的环境干燥需求，允许有效零值。 */
  readonly environmentDemand: DryingRange
  /** 栽培系统保水倍率，必须为有限正数。 */
  readonly cultivationRetention: DryingRange
  /** 历史残差校准倍率，必须为有限正数。 */
  readonly personalCalibration: DryingRange
}
/** 已明确量纲与参考依据的干燥基线；名义日策略不能直接传入。 */
export interface DryingBaseline extends DryingRange {
  /** 只能是等效干燥单位，拒绝旧天数改名。 */
  readonly basis: 'equivalent_dry_units'
  /** 参考条件及转换依据是否已经明确确认。 */
  readonly referenceConditionsConfirmed: boolean
}
/** 离线计算输入，不读取天气、数据库或隐式默认值。 */
export interface DryProgressInput {
  /** 本次回放的UTC整数毫秒时刻。 */
  readonly now: number
  /** 最近确认实际浇水的起点；缺失明确为null。 */
  readonly lastConfirmedWateringAt: number | null
  /** 已确认参考依据的基线，缺失不输出窗口。 */
  readonly baseline: DryingBaseline | null
  /** 历史和未来区间输入；每个区间单独保留三类倍率。 */
  readonly intervals: readonly DryingInterval[]
}
/** 基线阈值的未来交点区间，不是自动浇水预约。 */
export interface DryCheckWindow {
  /** 可能最早进入检查窗口的UTC毫秒，未覆盖为null。 */
  readonly earliestCheckAt: number | null
  /** 可能最晚达到上阈值的UTC毫秒，未覆盖为null。 */
  readonly latestCheckAt: number | null
  /** 未来连续覆盖终点，缺段之后不外推。 */
  readonly coverageEnd: number
}
/** 数学回放不代表算法发布、用户事实或公开建议。 */
export interface DryProgressResult {
  /** 完整历史可计算，或明确缺少必要证据。 */
  readonly status: 'ready_candidate' | 'insufficient_evidence'
  /** 离线实验永远不自行授予生产资格。 */
  readonly productionAdmission: false
  /** 本次积分所需证据缺口；成功明确为null。 */
  readonly reason: 'missing_origin' | 'missing_baseline' | 'reference_unconfirmed' | 'history_gap' | null
  /** 最近实际浇水至本时刻的积分区间，缺段不输出部分值。 */
  readonly progress: DryingRange | null
  /** 连续未来输入形成的检查窗口，不猜未覆盖日期。 */
  readonly window: DryCheckWindow | null
}
/** 一标准参考日是24小时，实际按秒积分；不是当地日历日长度。 */
const referenceDayMs = 86_400_000
/** 拒绝设备隐式时区和超出Date范围的整数。 */
function validateTime(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) {
    throw new TypeError('干燥积分时间必须为可表示的UTC整数毫秒')
  }
}
/** 区间算术拒绝字符串、反序及不支持的零分母。 */
function validateRange(value: DryingRange, positive: boolean): void {
  if (!value || typeof value !== 'object' || typeof value.min !== 'number' || typeof value.max !== 'number'
    || !Number.isFinite(value.min) || !Number.isFinite(value.max) || value.min < 0 || value.max < value.min
    || (positive && value.min === 0)) { throw new TypeError('干燥模型区间必须有限、有序且满足正值要求') }
}
/** 调整运算顺序避免可抵消的中间溢出；正数下溢不冒充有效零值。 */
function multiplyDivide(value: number, multiplier: number, divisor: number): number {
  if (value === 0) { return 0 }
  // 避免先生成次正规中间值而丢失有效位；最终值仍允许合法次正规数。
  const minimumNormal = 2 ** -1022
  const operations = [
    { intermediate: multiplier / divisor, finish: (ratio: number) => value * ratio },
    { intermediate: value / divisor, finish: (ratio: number) => ratio * multiplier },
    { intermediate: value * multiplier, finish: (product: number) => product / divisor },
  ]
  for (const operation of operations) {
    if (!Number.isFinite(operation.intermediate) || operation.intermediate < minimumNormal) { continue }
    const result = operation.finish(operation.intermediate)
    if (Number.isFinite(result) && result > 0) { return result }
  }
  throw new RangeError('干燥模型正值运算超出可表示或可靠中间精度范围')
}
/** 只使用已提供的倍率；不重复读取光照、VPD或盆器。 */
function rate(value: DryingInterval): DryingRange {
  validateRange(value.environmentDemand, false)
  validateRange(value.personalCalibration, true)
  validateRange(value.cultivationRetention, true)
  const min = multiplyDivide(value.environmentDemand.min, value.personalCalibration.min, value.cultivationRetention.max)
  const max = multiplyDivide(value.environmentDemand.max, value.personalCalibration.max, value.cultivationRetention.min)
  if (!Number.isFinite(min) || !Number.isFinite(max) || (value.environmentDemand.max > 0 && max === 0)) {
    throw new RangeError('干燥倍率运算超出可表示范围')
  }
  return { min, max }
}
/** 统一校验及排序，两个积分起点消费相同的区间规则。 */
function prepareIntervals(values: readonly DryingInterval[]) {
  if (!Array.isArray(values)) { throw new TypeError('缺少干燥区间清单') }
  const intervals = Array.from(values, value => {
    if (!value) { throw new TypeError('干燥区间不能缺少元素') }
    validateTime(value.start); validateTime(value.end)
    if (value.end <= value.start) { throw new TypeError('干燥区间必须有正时长') }
    return { start: value.start, end: value.end, rate: rate(value) }
  }).sort((a, b) => a.start - b.start)
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i]!.start < intervals[i - 1]!.end) { throw new TypeError('干燥区间重复或重叠') }
  }
  return intervals
}
/** 任意已确认起点之后的数学积分；起点本身不代表浇水事实。 */
export interface AnchoredDryingResult {
  /** 仅从给定起点开始的消耗，不能命名为完整历史进度。 */
  readonly consumed: DryingRange
  /** 当前及未来连续覆盖内的目标交点。 */
  readonly window: DryCheckWindow
}
/** 共享数值内核；只处理时间与量纲一致的阈值，不签发事实或策略资格。 */
function integrate(now: number, anchorAt: number, target: DryingRange, intervals: ReturnType<typeof prepareIntervals>): AnchoredDryingResult | null {
  let cursor = anchorAt
  const progress = { min: 0, max: 0 }
  for (const item of intervals) {
    if (cursor >= now || item.end <= cursor || item.start >= now) { continue }
    if (item.start > cursor) { return null }
    const end = Math.min(item.end, now)
    progress.min += multiplyDivide(item.rate.min, end - cursor, referenceDayMs)
    progress.max += multiplyDivide(item.rate.max, end - cursor, referenceDayMs)
    cursor = end
  }
  if (cursor < now) { return null }
  if (!Number.isFinite(progress.max)) { throw new RangeError('干燥进度积分溢出') }
  let earliestCheckAt: number | null = progress.max >= target.min ? now : null
  let latestCheckAt: number | null = progress.min >= target.max ? now : null
  const future = { ...progress }; cursor = now
  for (const item of intervals) {
    if (item.end <= cursor) { continue }
    if (item.start > cursor) { break }
    const incrementMin = multiplyDivide(item.rate.min, item.end - cursor, referenceDayMs)
    const incrementMax = multiplyDivide(item.rate.max, item.end - cursor, referenceDayMs)
    const crossing = (remaining: number, velocity: number): number => {
      const offset = multiplyDivide(remaining, referenceDayMs, velocity)
      // 输出整数毫秒；尚未达阈值的正交点不能因日期精度舍入到当前原点。
      return Math.max(cursor + 1, Math.ceil(cursor + offset))
    }
    if (earliestCheckAt === null && item.rate.max > 0 && target.min - future.max <= incrementMax) {
      const earliest = crossing(target.min - future.max, item.rate.max)
      if (earliest <= item.end) { earliestCheckAt = earliest }
    }
    if (latestCheckAt === null && item.rate.min > 0 && target.max - future.min <= incrementMin) {
      const latest = crossing(target.max - future.min, item.rate.min)
      if (latest <= item.end) { latestCheckAt = latest }
    }
    future.min += incrementMin; future.max += incrementMax
    if (!Number.isFinite(future.max)) { throw new RangeError('未来干燥进度积分溢出') }
    cursor = item.end
  }
  return { consumed: progress, window: { earliestCheckAt, latestCheckAt, coverageEnd: cursor } }
}
/** 仅累计连续覆盖；完整历史仍要求实际浇水事实。 */
export function replayDryProgress(input: DryProgressInput): DryProgressResult {
  validateTime(input.now)
  const intervals = prepareIntervals(input.intervals)
  const missing = (reason: DryProgressResult['reason']): DryProgressResult => ({ status: 'insufficient_evidence', productionAdmission: false, reason, progress: null, window: null })
  if (input.lastConfirmedWateringAt === null) { return missing('missing_origin') }
  validateTime(input.lastConfirmedWateringAt)
  if (input.lastConfirmedWateringAt > input.now) { throw new TypeError('实际浇水起点不能晚于回放时刻') }
  if (input.baseline === null) { return missing('missing_baseline') }
  validateRange(input.baseline, true)
  if (input.baseline.basis !== 'equivalent_dry_units' || typeof input.baseline.referenceConditionsConfirmed !== 'boolean') { throw new TypeError('缺少明确干燥量纲及参考依据') }
  if (!input.baseline.referenceConditionsConfirmed) { return missing('reference_unconfirmed') }
  const integrated = integrate(input.now, input.lastConfirmedWateringAt, input.baseline, intervals)
  return integrated === null ? missing('history_gap')
    : { status: 'ready_candidate', productionAdmission: false, reason: null, progress: integrated.consumed, window: integrated.window }
}
/** 观察起点复用时间积分；调用方另行校验观察和映射资格。 */
export function integrateDryingFromAnchor(now: number, anchorAt: number, target: DryingRange, values: readonly DryingInterval[]): AnchoredDryingResult | null {
  validateTime(now); validateTime(anchorAt); validateRange(target, false)
  if (anchorAt > now) { throw new TypeError('积分起点不能晚于当前时刻') }
  return integrate(now, anchorAt, target, prepareIntervals(values))
}
