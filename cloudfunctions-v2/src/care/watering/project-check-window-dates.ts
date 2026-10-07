import type { DryCheckWindow } from './replay-dry-progress.js'

/** 植物所在地的检查日期；覆盖范围与阈值日期分别表达。 */
export interface LocalCheckWindowResult {
  /** 至少一端可用才返回候选；无日期不假装有效零值。 */
  readonly status: 'ready_candidate' | 'insufficient_evidence'
  /** 无默认地点；输出保留调用者显式给出的时区。 */
  readonly timezone: string | null
  /** 缺失原因只解释日期可用性，不授予浇水许可。 */
  readonly reason: 'missing_timezone' | 'missing_window' | 'threshold_not_covered' | null
  /** 公历最早检查日期，未覆盖则为null。 */
  readonly earliestCheckDate: string | null
  /** 公历最晚检查日期，未覆盖则为null。 */
  readonly latestCheckDate: string | null
  /** 连续预测覆盖的结束日期，不作为检查日期兜底。 */
  readonly coverageEndDate: string | null
}

/** 使用明确时区及公历，不受服务器默认时区或语言设置影响。 */
function createPlantDateFormatter(timezone: string): Intl.DateTimeFormat {
  if (typeof timezone !== 'string' || !timezone.trim()) { throw new TypeError('植物所在地时区必须明确提供') }
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn', era: 'short', year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** UTC整数毫秒转为公历日期；拒绝超范围年份而非截断。 */
function formatPlantDate(value: number, formatter: Intl.DateTimeFormat): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) { throw new TypeError('检查时刻必须为有效UTC整数毫秒') }
  const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]))
  if (parts.era !== 'AD' || !parts.year || Number(parts.year) > 9999) { throw new RangeError('检查日期超出公历1至9999年范围') }
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`
}

/** 仅转换现有阈值交点，绝不重算干燥进度或制造未覆盖的端点。 */
export function projectCheckWindowDates(window: DryCheckWindow | null, timezone: string | null): LocalCheckWindowResult {
  const empty = (reason: LocalCheckWindowResult['reason']): LocalCheckWindowResult => ({ status: 'insufficient_evidence', timezone, reason, earliestCheckDate: null, latestCheckDate: null, coverageEndDate: null })
  if (timezone === null) { return empty('missing_timezone') }
  const formatter = createPlantDateFormatter(timezone)
  if (window === null) { return empty('missing_window') }
  if (!window || typeof window !== 'object' || Array.isArray(window)) { throw new TypeError('缺少检查窗口对象') }
  const coverageEndDate = formatPlantDate(window.coverageEnd, formatter)
  const project = (value: number | null): string | null => {
    if (value === null) { return null }
    const date = formatPlantDate(value, formatter)
    if (value > window.coverageEnd) { throw new TypeError('检查时刻不能超出连续预测范围') }
    return date
  }
  const earliestCheckDate = project(window.earliestCheckAt)
  const latestCheckDate = project(window.latestCheckAt)
  if (window.earliestCheckAt !== null && window.latestCheckAt !== null && window.earliestCheckAt > window.latestCheckAt) { throw new TypeError('检查窗口不可反序') }
  const available = earliestCheckDate !== null || latestCheckDate !== null
  return { status: available ? 'ready_candidate' : 'insufficient_evidence', timezone, reason: available ? null : 'threshold_not_covered', earliestCheckDate, latestCheckDate, coverageEndDate }
}
