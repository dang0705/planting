const GRID_COLUMN_COUNT = 7
const DATE_CELL_HEIGHT_PX = 75
const DATE_CELL_WIDTH_PX = 42
const GRID_GAP_PX = 4
const POPOVER_OFFSET_PX = 8
const POPOVER_WIDTH_PX = 95

export const POPOVER_REOPEN_SUPPRESS_MS = 220

export function getDatePopoverStyle(index = -1) {
  if (index < 0) {return {}}
  const column = index % GRID_COLUMN_COUNT
  const row = Math.floor(index / GRID_COLUMN_COUNT)
  const top = `${row * (DATE_CELL_HEIGHT_PX + GRID_GAP_PX) + DATE_CELL_HEIGHT_PX + POPOVER_OFFSET_PX}px`
  if (column === 0) {return { left: '0', top, transform: 'none' }}
  if (column === GRID_COLUMN_COUNT - 1) {
    return { left: '100%', top, transform: 'translateX(-100%)' }
  }
  return {
    left: `${((column + 0.5) / GRID_COLUMN_COUNT) * 100}%`,
    top,
    transform: 'translateX(-50%)'
  }
}

export function getDatePopoverArrowStyle(index = -1) {
  if (index < 0) {return {}}
  const column = index % GRID_COLUMN_COUNT
  if (column === 0) {return { left: `${DATE_CELL_WIDTH_PX / 2}px` }}
  if (column === GRID_COLUMN_COUNT - 1) {
    return { left: `${POPOVER_WIDTH_PX - DATE_CELL_WIDTH_PX / 2}px` }
  }
  return { left: '50%' }
}
