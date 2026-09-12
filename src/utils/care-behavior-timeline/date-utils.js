// 养护行为时间线日期工具
// 处理日期字符串归一化、Date 与日期字符串互转、参考日期解析。

import { DEFAULT_REFERENCE_DATE } from './constants.js'

function toDateString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function parseDateParts(raw = '') {
  const parts = raw.includes('-') ? raw.split('-') : raw.split('/')
  if (parts.length !== 3) {
    return null
  }
  const [y, m, d] = parts
  const yi = Number(y),
    mi = Number(m),
    di = Number(d)
  if (
    !Number.isInteger(yi) ||
    !Number.isInteger(mi) ||
    !Number.isInteger(di) ||
    mi < 1 ||
    mi > 12 ||
    di < 1 ||
    di > 31
  ) {
    return null
  }
  const date = new Date(yi, mi - 1, di)
  return Number.isNaN(date.getTime()) ? null : date
}

function coerceDateValue(value) {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateString(value)
  }
  const raw = String(value).trim()
  if (!raw) {
    return ''
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw) || /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(raw)) {
    const parsed = parseDateParts(raw)
    return parsed ? toDateString(parsed) : ''
  }
  if (/^\d{10,}$/.test(raw)) {
    const numeric = Number(raw)
    const parsed = new Date(numeric > 1e12 ? numeric : numeric * 1000)
    return Number.isNaN(parsed.getTime()) ? '' : toDateString(parsed)
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : toDateString(parsed)
}

const toDateValue = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  const normalized = coerceDateValue(value)
  if (!normalized) {
    return null
  }
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export { toDateString, coerceDateValue, toDateValue, parseDateParts }

// 默认参考日期锚点（截断到当天 0 点），供主流程复用
export const anchorReferenceDate = (referenceDate = DEFAULT_REFERENCE_DATE) => {
  const date = toDateValue(referenceDate) || new Date()
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
