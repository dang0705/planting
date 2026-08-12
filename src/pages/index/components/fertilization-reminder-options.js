import { addPhoneCalendar, resolvePlantDisplayName, todayStr } from './watering-reminder-options.js'

export { addPhoneCalendar, todayStr }

export const FERTILIZER_LABELS = {
  liquid: '液体肥',
  slowRelease: '缓释肥'
}

export function fertilizerLabel(type) {
  return FERTILIZER_LABELS[type] || '施肥'
}

export function currentMonthNumber(date = new Date()) {
  return date.getMonth() + 1
}

export function resolveCurrentMonthOptions(monthly, date = new Date()) {
  const month = currentMonthNumber(date)
  const row = (monthly?.rows || []).find(item => Number(item?.month) === month)
  return ['liquid', 'slowRelease']
    .map(type => {
      const cell = row?.[type]
      const schedule = cell?.schedule
      if (schedule?.schemaVersion !== 1 || schedule.kind !== 'interval') {
        return null
      }
      return { type, cell, label: fertilizerLabel(type) }
    })
    .filter(Boolean)
}

export function resolveCurrentMonthEvaluation(monthly, type, date = new Date()) {
  const month = currentMonthNumber(date)
  const cell = (monthly?.rows || []).find(item => Number(item?.month) === month)?.[type] || null
  const kind =
    cell?.schedule?.schemaVersion === 1 && cell?.schedule?.kind === 'interval'
      ? 'interval'
      : cell?.schedule?.kind || 'unavailable'
  return { month, kind, cell, available: kind === 'interval' }
}

export function buildFertilizationCalendarPayload({
  plant,
  nextCheckDate,
  ruleSnapshot,
  reminderKind = 'normal'
}) {
  const startDate = new Date(`${nextCheckDate}T09:00:00`)
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000)
  return {
    title: `${resolvePlantDisplayName(plant)}${reminderKind === 'first_confirmation' ? '首次确认提醒' : '施肥提醒'}`,
    startTime: Math.floor(startDate.getTime() / 1000),
    endTime: Math.floor(endDate.getTime() / 1000),
    description: [
      reminderKind === 'first_confirmation'
        ? '这是首次确认提醒。打开青花植查看当月施肥规则，再决定是否施肥。'
        : '按属级月度表生成。打开青花植查看当月施肥规则。',
      '如果本月提示暂停或没有固定周期，请不要直接施肥。',
      ruleSnapshot?.displayText ? `本次参考：${ruleSnapshot.displayText}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    allDay: false
  }
}

export function formatFertilizationCheckDate(value) {
  const text = String(value || '')
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${Number(match[2])}月${Number(match[3])}日` : '待定'
}

export function formatFertilizationCalculationGuidance(preview) {
  if (preview?.reminderKind === 'first_confirmation' || preview?.lastDateSource !== 'recorded') {
    return '首次确认：没有可靠的上次施肥日期，先按当前周期的一半安排确认提醒。'
  }
  if (preview?.lastAppliedDate) {
    return `按历史记录：以上次施肥日期（${formatFertilizationCheckDate(preview.lastAppliedDate)}）为起点，按当前周期推算。`
  }
  return '已按当前月施肥周期计算，请确认后再加入手机日历。'
}

export function formatFertilizationReminderState(reminder) {
  if (!reminder?.active) {
    return '还没有安排施肥提醒'
  }
  if (reminder.isDue) {
    return reminder.reminderKind === 'first_confirmation'
      ? '首次确认提醒已到期，打开查看本月规则'
      : '施肥提醒已到期，打开查看本月规则'
  }
  return `${reminder.reminderKind === 'first_confirmation' ? '首次确认提醒' : '下次施肥提醒'}：${formatFertilizationCheckDate(reminder.nextCheckDate)}`
}
