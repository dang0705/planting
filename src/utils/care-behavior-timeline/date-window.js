// 养护行为时间线日期窗口
// 以参考日期为锚点生成最近 N 天的可选日期窗口与集合。

import { CARE_BEHAVIOR_DEFAULT_DAYS, DEFAULT_REFERENCE_DATE } from './constants.js'
import { toDateString, toDateValue } from './date-utils.js'

export function getCareBehaviorDateWindow(referenceDate = DEFAULT_REFERENCE_DATE) {
  const base =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
      ? new Date(referenceDate)
      : toDateValue(referenceDate) || new Date()
  const anchor = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  return Array.from({ length: CARE_BEHAVIOR_DEFAULT_DAYS + 1 }, (_, index) => {
    const date = new Date(anchor)
    date.setDate(anchor.getDate() - (CARE_BEHAVIOR_DEFAULT_DAYS - index))
    const normalized = toDateString(date)
    return {
      date: normalized,
      day: date.getDate(),
      isToday: normalized === toDateString(anchor),
      isFuture: false
    }
  })
}

export const getCareBehaviorDateSet = (referenceDate = DEFAULT_REFERENCE_DATE) =>
  new Set(getCareBehaviorDateWindow(referenceDate).map(item => item.date))
