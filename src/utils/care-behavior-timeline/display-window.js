const DEFAULT_DISPLAY_DAYS_BEFORE = 16
const DEFAULT_DISPLAY_DAYS_AFTER = 4
const DEFAULT_SELECTABLE_START_OFFSET = -10
const DEFAULT_SELECTABLE_END_OFFSET = -1

function toDateString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return ''
  }
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function coerceReferenceDate(referenceDate = new Date()) {
  const value = referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate)
  return Number.isNaN(value.getTime()) ? new Date() : value
}

export function buildCareBehaviorDisplayWindow(referenceDate = new Date(), options = {}) {
  const base = coerceReferenceDate(referenceDate)
  const anchor = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const displayDaysBefore = Number.isFinite(Number(options?.displayDaysBefore))
    ? Math.max(0, Number(options.displayDaysBefore))
    : DEFAULT_DISPLAY_DAYS_BEFORE
  const displayDaysAfter = Number.isFinite(Number(options?.displayDaysAfter))
    ? Math.max(0, Number(options.displayDaysAfter))
    : DEFAULT_DISPLAY_DAYS_AFTER
  const selectableStartOffset = Number.isFinite(Number(options?.selectableStartOffset))
    ? Number(options.selectableStartOffset)
    : DEFAULT_SELECTABLE_START_OFFSET
  const selectableEndOffset = Number.isFinite(Number(options?.selectableEndOffset))
    ? Number(options.selectableEndOffset)
    : DEFAULT_SELECTABLE_END_OFFSET

  const total = displayDaysBefore + displayDaysAfter + 1
  const startOffset = -displayDaysBefore

  return Array.from({ length: total }, (_, index) => {
    const offset = startOffset + index
    const date = new Date(anchor)
    date.setDate(anchor.getDate() + offset)
    const normalized = toDateString(date)
    return {
      date: normalized,
      day: date.getDate(),
      isToday: offset === 0,
      isFuture: offset > 0,
      isHistoricalOutOfRange: offset < selectableStartOffset,
      isSelectable: offset >= selectableStartOffset && offset <= selectableEndOffset,
      canOpenDetail: true,
      dayOffset: offset
    }
  })
}
