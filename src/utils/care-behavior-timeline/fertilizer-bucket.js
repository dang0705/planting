// 养护行为施肥 bucket 推导
// 根据施肥事件日期距参考日期的天数推导时间桶（within_10d/11_30d/31_60d/over_60d），
// 并与显式声明的 bucket 协调，遵循"10d 内有施肥事件优先 within_10d"的业务约束。

import { DAY_MS, DEFAULT_REFERENCE_DATE } from './constants.js'
import { coerceDateValue } from './date-utils.js'
import { normalizeBucket } from './normalize.js'

export function deriveLastFertilizedBucket(
  fertilizingDates = [],
  referenceDate = DEFAULT_REFERENCE_DATE,
  fallbackBucket = 'unknown'
) {
  const normalizedFallback = normalizeBucket(fallbackBucket)
  const validDates = Array.isArray(fertilizingDates)
    ? fertilizingDates
        .map(item => coerceDateValue(item?.date))
        .filter(Boolean)
        .sort()
    : []
  if (!validDates.length) {
    return normalizedFallback === 'almost_never' || normalizedFallback === 'over_60d'
      ? normalizedFallback
      : 'unknown'
  }

  const anchor =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
      ? new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
      : new Date()
  const latest = new Date(validDates[validDates.length - 1])
  const days = Math.floor((anchor - latest) / DAY_MS)

  if (!Number.isFinite(days) || days <= 10) {
    return 'within_10d'
  }
  if (days <= 30) {
    return '11_30d'
  }
  if (days <= 60) {
    return '31_60d'
  }
  return 'over_60d'
}
