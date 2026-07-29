'use strict'

// D0 slot manifest 和 timer audit 的 Cloud Storage 路径构造
// manifest 是跨城市全局 job state，不属于单个 locationKey

const D0_SLOT_MANIFEST_BASE = 'weather-cache/v1/d0-slot-jobs'
const D0_TIMER_AUDIT_BASE = 'weather-cache/v1/d0-audit/timers'

function normalizeDate(value = '') {
  const safeDate = String(value || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    throw new Error('D0 路径缺少合法日期 YYYY-MM-DD')
  }
  return safeDate
}

function buildD0SlotManifestPath({ date = '', triggerName = '' } = {}) {
  const safeDate = normalizeDate(date)
  const safeTrigger = String(triggerName || '').trim()
  if (!safeTrigger) {
    throw new Error('D0 slot manifest 路径缺少 triggerName')
  }
  return `${D0_SLOT_MANIFEST_BASE}/${safeDate}/${safeTrigger}.json`
}

function buildD0TimerAuditPath({ date = '' } = {}) {
  const safeDate = normalizeDate(date)
  return `${D0_TIMER_AUDIT_BASE}/${safeDate}.json`
}

module.exports = {
  D0_SLOT_MANIFEST_BASE,
  D0_TIMER_AUDIT_BASE,
  buildD0SlotManifestPath,
  buildD0TimerAuditPath,
  normalizeDate
}
