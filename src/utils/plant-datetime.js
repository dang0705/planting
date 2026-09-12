/**
 * 将植物业务日期解析为可比较的本地时间。
 * 日期字段（YYYY-MM-DD）代表用户所在设备的当天，不能交给 Date 构造器
 * 按 UTC 解析，否则东八区等时区会在当天上午提前显示为已到期。
 */
export function parsePlantDateTime(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const raw = String(value || '').trim()
  if (!raw) {
    return null
  }
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/u)
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    if (
      date.getFullYear() !== Number(dateOnly[1]) ||
      date.getMonth() !== Number(dateOnly[2]) - 1 ||
      date.getDate() !== Number(dateOnly[3])
    ) {
      return null
    }
    return date
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
