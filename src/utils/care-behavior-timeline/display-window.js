import dayjs from 'dayjs'

const DEFAULT_ANCHOR_OFFSET = 0
const DAY_FORMAT = 'YYYY-MM-DD'
const DAY_STEP = 'day'
const DEFAULT_DISPLAY_DAYS_BEFORE = 16
const DEFAULT_DISPLAY_DAYS_AFTER = 4
const DEFAULT_SELECTABLE_START_OFFSET = -10
const DEFAULT_SELECTABLE_END_OFFSET = 0
const DEFAULT_WEEK_START = 1
const WINDOW_PADDING = 1
const WEEK_DAY_COUNT = 7

function toDateString(date) {
  return date.format(DAY_FORMAT)
}

function coerceReferenceDate(referenceDate = dayjs()) {
  const value = dayjs(referenceDate)
  return value.isValid() ? value.startOf('day') : dayjs().startOf('day')
}

function getAlignedWeekStartDate(anchor, startOffset, alignAllowance) {
  const rawStart = anchor.add(startOffset, DAY_STEP)
  const rawWeekday = rawStart.day()
  const shiftBackwardToMonday = (rawWeekday - DEFAULT_WEEK_START + WEEK_DAY_COUNT) % WEEK_DAY_COUNT
  const shiftForwardToMonday = (DEFAULT_WEEK_START - rawWeekday + WEEK_DAY_COUNT) % WEEK_DAY_COUNT
  if (shiftBackwardToMonday <= alignAllowance) {
    return rawStart.subtract(shiftBackwardToMonday, DAY_STEP)
  }
  if (shiftForwardToMonday <= alignAllowance) {
    return rawStart.add(shiftForwardToMonday, DAY_STEP)
  }
  return rawStart
}

export function buildCareBehaviorDisplayWindow(referenceDate = dayjs(), options = {}) {
  const anchor = coerceReferenceDate(referenceDate)
  const displayDaysBefore = Number.isFinite(Number(options?.displayDaysBefore))
    ? Math.max(DEFAULT_ANCHOR_OFFSET, Number(options.displayDaysBefore))
    : DEFAULT_DISPLAY_DAYS_BEFORE
  const displayDaysAfter = Number.isFinite(Number(options?.displayDaysAfter))
    ? Math.max(DEFAULT_ANCHOR_OFFSET, Number(options.displayDaysAfter))
    : DEFAULT_DISPLAY_DAYS_AFTER
  const selectableStartOffset = Number.isFinite(Number(options?.selectableStartOffset))
    ? Number(options.selectableStartOffset)
    : DEFAULT_SELECTABLE_START_OFFSET
  const selectableEndOffset = Number.isFinite(Number(options?.selectableEndOffset))
    ? Number(options.selectableEndOffset)
    : DEFAULT_SELECTABLE_END_OFFSET

  const total = displayDaysBefore + displayDaysAfter + WINDOW_PADDING
  const rawStartOffset = -displayDaysBefore
  const alignedStartDate = getAlignedWeekStartDate(anchor, rawStartOffset, displayDaysAfter)

  return Array.from({ length: total }, (_, index) => {
    const date = alignedStartDate.add(index, DAY_STEP)
    const offset = date.diff(anchor, DAY_STEP)
    const normalized = toDateString(date)
    return {
      date: normalized,
      day: date.date(),
      isToday: offset === DEFAULT_ANCHOR_OFFSET,
      isFuture: offset > DEFAULT_ANCHOR_OFFSET,
      isHistoricalOutOfRange: offset < selectableStartOffset,
      isSelectable: offset >= selectableStartOffset && offset <= selectableEndOffset,
      canOpenDetail: true,
      dayOffset: offset
    }
  })
}
