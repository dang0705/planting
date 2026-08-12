'use strict'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SUPPORTED_UNITS = new Set(['week', 'month'])

function parseDate(value) {
  const text = String(value || '').trim()
  if (!DATE_PATTERN.test(text)) {
    return null
  }
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function addMonthsClamped(date, value) {
  const targetMonth = date.getUTCMonth() + value
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const day = Math.min(date.getUTCDate(), daysInMonth(targetYear, normalizedMonth))
  return new Date(Date.UTC(targetYear, normalizedMonth, day))
}

function addInterval(date, interval) {
  const value = Number(interval?.value)
  const unit = String(interval?.unit || '').trim()
  if (!(date instanceof Date) || !Number.isInteger(value) || value <= 0) {
    return null
  }
  if (unit === 'week') {
    return new Date(date.getTime() + value * 7 * 24 * 60 * 60 * 1000)
  }
  if (unit === 'month') {
    return addMonthsClamped(date, value)
  }
  return null
}

function midpointDate(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    return null
  }
  const startMs = start.getTime()
  const endMs = end.getTime()
  if (endMs < startMs) {
    return null
  }
  const days = Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000) / 2)
  return new Date(startMs + days * 24 * 60 * 60 * 1000)
}

function normalizeIntervalSchedule(schedule) {
  if (!schedule || Number(schedule.schemaVersion) !== 1 || schedule.kind !== 'interval') {
    return null
  }
  const min = normalizeInterval(schedule.interval?.min)
  const max = normalizeInterval(schedule.interval?.max)
  if (!min || !max) {
    return null
  }
  return {
    schemaVersion: 1,
    kind: 'interval',
    interval: { min, max },
    conditionCodes: Array.isArray(schedule.conditionCodes) ? schedule.conditionCodes : [],
    modifiers: Array.isArray(schedule.modifiers) ? schedule.modifiers : []
  }
}

function normalizeInterval(value) {
  const amount = Number(value?.value)
  const unit = String(value?.unit || '').trim()
  if (!Number.isInteger(amount) || amount <= 0 || !SUPPORTED_UNITS.has(unit)) {
    return null
  }
  return { value: amount, unit }
}

function calculateFertilizationCheck({
  schedule,
  lastAppliedDate = null,
  lastDateSource = 'recorded',
  referenceDate
} = {}) {
  const normalizedSchedule = normalizeIntervalSchedule(schedule)
  const today = parseDate(referenceDate) || parseDate(formatDate(new Date()))
  if (!normalizedSchedule || !today) {
    return { valid: false, reason: 'invalid_interval_or_reference_date' }
  }

  const earliestFrom = parseDate(lastAppliedDate)
  const hasRecordedDate = lastDateSource === 'recorded' && Boolean(earliestFrom)
  const minDate = addInterval(today, normalizedSchedule.interval.min)
  const maxDate = addInterval(today, normalizedSchedule.interval.max)
  if (!minDate || !maxDate) {
    return { valid: false, reason: 'invalid_interval' }
  }

  if (!hasRecordedDate) {
    const normalCheck = midpointDate(minDate, maxDate)
    const firstCheck = midpointDate(today, normalCheck)
    const todayText = formatDate(today)
    const calculatedCheckDate = formatDate(firstCheck)
    const nextCheckDate =
      calculatedCheckDate && calculatedCheckDate < todayText ? todayText : calculatedCheckDate
    return {
      valid: Boolean(nextCheckDate),
      nextCheckDate,
      dueNow: Boolean(nextCheckDate && nextCheckDate <= todayText),
      lastAppliedDate: null,
      lastDateSource: 'estimated',
      earliestDate: formatDate(minDate),
      latestDate: formatDate(maxDate),
      normalCheckDate: formatDate(normalCheck)
    }
  }

  const earliest = addInterval(earliestFrom, normalizedSchedule.interval.min)
  const latest = addInterval(earliestFrom, normalizedSchedule.interval.max)
  const nextCheck = midpointDate(earliest, latest)
  const calculatedCheckDate = formatDate(nextCheck)
  const todayText = formatDate(today)
  const dueNow = Boolean(calculatedCheckDate && calculatedCheckDate <= todayText)
  const nextCheckDate = dueNow ? todayText : calculatedCheckDate
  return {
    valid: Boolean(nextCheckDate),
    nextCheckDate,
    dueNow,
    lastAppliedDate: formatDate(earliestFrom),
    lastDateSource: 'recorded',
    earliestDate: formatDate(earliest),
    latestDate: formatDate(latest),
    normalCheckDate: calculatedCheckDate
  }
}

function resolveMonthlyCell(monthly, fertilizerType, month) {
  const rows = Array.isArray(monthly?.rows) ? monthly.rows : []
  const targetMonth = Number(month)
  const cell = rows.find(row => Number(row?.month) === targetMonth)?.[fertilizerType] || null
  if (!cell) {
    return { kind: 'unavailable', cell: null, schedule: null }
  }
  const schedule = cell.schedule || null
  if (schedule?.kind === 'interval') {
    return {
      kind: normalizeIntervalSchedule(schedule) ? 'interval' : 'manual_review',
      cell,
      schedule: normalizeIntervalSchedule(schedule)
    }
  }
  if (['pause', 'avoid'].includes(schedule?.kind)) {
    return { kind: schedule.kind, cell, schedule }
  }
  if (
    ['conditional', 'event', 'constraint', 'annual_count', 'unspecified'].includes(schedule?.kind)
  ) {
    return { kind: schedule.kind, cell, schedule }
  }
  return { kind: 'manual_review', cell, schedule }
}

function evaluateMonthlyRule(monthly, fertilizerType, month) {
  const result = resolveMonthlyCell(monthly, fertilizerType, month)
  return {
    ...result,
    available: result.kind === 'interval',
    displayText: result.cell?.displayText || '',
    sourceNames: Array.isArray(result.cell?.sourceNames) ? result.cell.sourceNames : []
  }
}

module.exports = {
  addInterval,
  calculateFertilizationCheck,
  evaluateMonthlyRule,
  formatDate,
  midpointDate,
  normalizeIntervalSchedule,
  parseDate,
  _test: {
    addMonthsClamped,
    daysInMonth,
    normalizeInterval
  }
}
