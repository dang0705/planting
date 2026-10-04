import { serializeCanonicalJson, type CanonicalJsonObject, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'

/** 只保存用户明确申报的时间线；不是已完成养护事实。 */
export interface TimelineAnswerEvidence {
  /** 用户明确提供的公历参考日期，不补系统当前日期。 */
  readonly referenceDate: string
  /** 明确浇水事件；未知用量保留null。 */
  readonly wateringEvents: readonly CanonicalJsonObject[]
  /** 明确施肥事件，不生成默认浓度。 */
  readonly fertilizingEvents: readonly CanonicalJsonObject[]
  /** 明确位置或光照变化，不转换成光照量。 */
  readonly lightChangeEvents: readonly CanonicalJsonObject[]
  /** 明确每日行为，false与未知null分开。 */
  readonly dailyRecords: readonly CanonicalJsonObject[]
  /** 只保留已知V1施肥时间段，缺失为未知。 */
  readonly lastFertilizedBucket: string
}

/** 限定纯数据对象，阻止隐式对象转换。 */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

/** 只接受精确公历日期；不会把不存在的日期滚动到下月。 */
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) { throw new TypeError('时间线缺少有效日期') }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) { throw new TypeError('时间线公历日期非法') }
  return value
}

/** 同时出现的两种V1别名不得互相覆盖。 */
function alias(source: Record<string, unknown>, camel: string, snake: string): unknown {
  if (Object.hasOwn(source, camel) && Object.hasOwn(source, snake)
    && serializeCanonicalJson(source[camel] as CanonicalJsonValue) !== serializeCanonicalJson(source[snake] as CanonicalJsonValue)) {
    throw new TypeError('时间线字段别名冲突')
  }
  return Object.hasOwn(source, camel) ? source[camel] : source[snake]
}

/** 保留明确描述，缺失为空；不从用量档位猜测实际毫升。 */
function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) { return null }
  if (typeof value !== 'string' || !value.length || value.trim() !== value) { throw new TypeError('时间线描述非法') }
  return value
}

/** 明确布尔值；缺失与false互相独立。 */
function optionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null) { return null }
  if (typeof value !== 'boolean') { throw new TypeError('每日行为必须为布尔值') }
  return value
}

/** 校验与排序，同日相同证据去重，矛盾证据拒绝。 */
function events(value: unknown, reference: string, kind: 'watering' | 'fertilizing' | 'light' | 'daily'): CanonicalJsonObject[] {
  if (value === undefined) { return [] }
  if (!Array.isArray(value)) { throw new TypeError('时间线记录必须为数组') }
  const byDate = new Map<string, CanonicalJsonObject>()
  for (const entry of value) {
    if (!record(entry)) { throw new TypeError('时间线记录非法') }
    const day = date(entry.date)
    if (day > reference) { throw new TypeError('实际行为不能晚于参考日期') }
    let normalized: CanonicalJsonObject
    if (kind === 'watering') {
      if (entry.watered !== undefined && entry.watered !== true) { throw new TypeError('非浇水行为不能写成浇水事件') }
      const amountMl = entry.amountMl === undefined ? null : entry.amountMl
      if (amountMl !== null && (typeof amountMl !== 'number' || !Number.isFinite(amountMl) || amountMl < 0)) { throw new TypeError('浇水量必须为非负有限数值或未知') }
      normalized = { date: day, watered: true, amount: optionalText(entry.amount), amountMl }
    } else if (kind === 'fertilizing') {
      if (entry.fertilized !== undefined && entry.fertilized !== true) { throw new TypeError('非施肥行为不能写成施肥事件') }
      normalized = { date: day, fertilized: true, strength: optionalText(entry.strength) }
    } else if (kind === 'light') {
      if (typeof entry.event !== 'string' || !['moved_to_stronger_light', 'moved_to_weaker_light', 'direct_sun_exposure',
        'grow_light_changed', 'none', 'unknown'].includes(entry.event)) { throw new TypeError('光照变化代码非法') }
      normalized = { date: day, event: entry.event }
    } else {
      const watered = optionalBoolean(entry.watered)
      const fertilized = optionalBoolean(entry.fertilized)
      if (watered === null && fertilized === null) { throw new TypeError('天气数据不能充当行为记录') }
      normalized = { date: day, watered, fertilized }
    }
    const existing = byDate.get(day)
    if (existing && serializeCanonicalJson(existing) !== serializeCanonicalJson(normalized)) { throw new TypeError('同日同类行为证据冲突') }
    byDate.set(day, normalized)
  }
  return [...byDate.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)))
}

/** 深度冻结完整拷贝，保留引用期间不可被请求方修改。 */
function freeze(value: CanonicalJsonValue): void {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) { freeze(item) }
    Object.freeze(value)
  }
}

/**
 * 校验明确日期和行为，不读取当前时间、不裁剪历史、不生成默认剂量或环境派生。
 * 返回null表示证据不足或非法；上层不能将null当作没有浇水。
 */
export function normalizeV1TimelineEvidence(input: unknown): TimelineAnswerEvidence | null {
  try {
    if (!record(input)) { return null }
    const referenceDate = date(alias(input, 'referenceDate', 'reference_date'))
    const wateringEvents = events(alias(input, 'wateringEvents10d', 'watering_events_10d'), referenceDate, 'watering')
    const fertilizingEvents = events(alias(input, 'fertilizingEvents10d', 'fertilizing_events_10d'), referenceDate, 'fertilizing')
    const lightChangeEvents = events(alias(input, 'lightChangeEvents10d', 'light_change_events_10d'), referenceDate, 'light')
    const dailyRecords = events(alias(input, 'dailyRecords', 'daily_records'), referenceDate, 'daily')
    for (const daily of dailyRecords) {
      if ((daily.watered === false && wateringEvents.some(event => event.date === daily.date))
        || (daily.fertilized === false && fertilizingEvents.some(event => event.date === daily.date))) { return null }
    }
    const bucket = alias(input, 'lastFertilizedBucket', 'last_fertilized_bucket')
    const lastFertilizedBucket = bucket === undefined ? 'unknown' : bucket
    if (typeof lastFertilizedBucket !== 'string' || !['within_10d', '11_30d', '31_60d', 'over_60d', 'almost_never', 'unknown'].includes(lastFertilizedBucket)) { return null }
    if (!wateringEvents.length && !fertilizingEvents.length && !lightChangeEvents.length && !dailyRecords.length && lastFertilizedBucket === 'unknown') { return null }
    const result = { referenceDate, wateringEvents, fertilizingEvents, lightChangeEvents, dailyRecords, lastFertilizedBucket }
    freeze(result as unknown as CanonicalJsonValue)
    return result
  } catch { return null }
}
