'use strict'

// D0 timer 审计日志：按日期聚合的 storage JSON，append-only 事件历史。
// 审计只记录事件历史，不替代 manifest（manifest 是 job state，audit 是 invocation 历史）。
// scheduler 是唯一 D0 timer owner，所有 D0 timer invocation 和被忽略事件都写审计。

const { createWeatherObjectStorage } = require('./weather-object-storage')
const { buildD0TimerAuditPath } = require('./d0-slot-paths')
const { resolveTargetDate } = require('./d0-slot-manifest')
const { formatIsoInTimezone } = require('./now-sample-slots')

const AUDIT_SCHEMA_VERSION = 'weather-cache/v1/d0-timer-audit'

function normalizeAuditFile(raw, date) {
  if (!raw || typeof raw !== 'object') {
    return {
      schemaVersion: AUDIT_SCHEMA_VERSION,
      date,
     records: [],
      summary: { totalInvocations: 0, success: 0, failure: 0, ignored: 0 },
     updatedAt: ''
    }
  }
  return {
    schemaVersion: raw.schemaVersion || AUDIT_SCHEMA_VERSION,
    date: raw.date || date,
    records: Array.isArray(raw.records) ? raw.records : [],
    summary: raw.summary && typeof raw.summary === 'object' ? raw.summary : {},
    updatedAt: raw.updatedAt || ''
  }
}

// 审计状态契约：success | failure | ignored
// 某批只要存在失败城市，status 必须是 failure（不再用 advanced/completed 作状态）
function buildAuditSummary(records = []) {
  const summary = { totalInvocations: records.length, success: 0, failure: 0, ignored: 0 }
  for (const record of records) {
    const status = String(record && record.status || '')
    if (status === 'success') {
      summary.success += 1
    } else if (status === 'failure') {
      summary.failure += 1
    } else if (status === 'ignored') {
      summary.ignored += 1
    }
  }
  return summary
}

function createD0TimerAuditService({ storage = createWeatherObjectStorage() } = {}) {
  async function readAudit({ date = '' } = {}) {
    const resolvedDate = resolveTargetDate(date)
    const cloudPath = buildD0TimerAuditPath({ date: resolvedDate })
    const raw = await storage.downloadJson({ cloudPath })
    return { auditFile: normalizeAuditFile(raw, resolvedDate), cloudPath }
  }

  // 读-合并-写：同一 invocation 用 recordId 去重，避免重复写脏记录。
  async function appendAuditRecord({ date = '', record = {} } = {}) {
    const resolvedDate = resolveTargetDate(date)
    const cloudPath = buildD0TimerAuditPath({ date: resolvedDate })
    const raw = await storage.downloadJson({ cloudPath })
    const auditFile = normalizeAuditFile(raw, resolvedDate)

    const recordId = String((record && record.recordId) || '').trim()
    if (recordId && auditFile.records.some(r => String((r && r.recordId) || '') === recordId)) {
      return { cloudPath, recordId, deduped: true, auditFile }
    }

    auditFile.records.push(record)
    auditFile.summary = buildAuditSummary(auditFile.records)
    auditFile.updatedAt = formatIsoInTimezone(new Date(), 'Asia/Shanghai')

    await storage.uploadJson({ cloudPath, payload: auditFile })
    return { cloudPath, recordId, deduped: false, auditFile }
  }

  return { readAudit, appendAuditRecord }
}

module.exports = {
  AUDIT_SCHEMA_VERSION,
  buildAuditSummary,
  createD0TimerAuditService,
  normalizeAuditFile
}
