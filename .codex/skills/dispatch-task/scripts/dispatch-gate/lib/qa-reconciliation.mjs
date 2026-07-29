import path from 'node:path'
import {
  classifyLeafReport,
  extractLeafReport,
  LEAF_CLASSIFICATION_VERSION
} from './qa-leaf-report.mjs'
import { appendEvent, readJson, repoRoot, stateDir, writeJsonAtomic } from './state.mjs'

const RECONCILABLE_STATUSES = new Set([
  'aborted',
  'failed_environment',
  'failed_product',
  'failed_script'
])
const FAILURE_STATUSES = new Set(['failed_environment', 'failed_product', 'failed_script'])

function recordFile(dispatchRunId, executionId) {
  return path.join(stateDir(dispatchRunId), 'qa-runs', `${executionId}.json`)
}

function rawReportFile(dispatchRunId, rawReportRef) {
  const qaRunsDir = path.resolve(stateDir(dispatchRunId), 'qa-runs')
  const file = path.resolve(repoRoot, String(rawReportRef ?? ''))
  const relative = path.relative(qaRunsDir, file)
  if (!rawReportRef || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }
  return file
}

function blocked(code, message, details = {}) {
  return { status: 'blocked', gate: 'qa_run_reconcile', code, message, details }
}

export function reconcileQaRunClassification({
  dispatchRunId,
  executionId,
  now = () => new Date()
}) {
  if (!dispatchRunId || !executionId) {
    return blocked(
      'reconciliation_target_required',
      'dispatch run id and execution id are required'
    )
  }
  const file = recordFile(dispatchRunId, executionId)
  const record = readJson(file, null)
  if (!record || record.gate !== 'qa_run' || record.execution_id !== executionId) {
    return blocked('qa_execution_record_not_found', 'existing qa-run record is required')
  }
  if (!RECONCILABLE_STATUSES.has(record.status)) {
    return blocked(
      'qa_execution_not_reconcilable',
      'only terminal failed or aborted records can reconcile'
    )
  }
  const rawRef = record.leaf_report?.raw_report_ref
  const rawFile = rawReportFile(dispatchRunId, rawRef)
  const artifact = rawFile ? readJson(rawFile, null) : null
  if (!artifact?.raw_report) {
    return blocked(
      'qa_leaf_raw_report_unavailable',
      'raw_report_ref must resolve to a captured raw report'
    )
  }
  const leafReport = extractLeafReport({ stdout: artifact.raw_report })
  const classification = classifyLeafReport(leafReport)
  if (!FAILURE_STATUSES.has(classification)) {
    return blocked(
      'qa_leaf_classification_unavailable',
      'raw report cannot produce a failed terminal class',
      {
        parse_status: leafReport.parse_status,
        classification: classification ?? 'unavailable'
      }
    )
  }
  const currentClassification = record.leaf_report?.failure_kind
  const currentVersion = record.leaf_report?.classification_version
  if (record.status === classification && currentClassification === classification) {
    return {
      status: 'already_reconciled',
      gate: 'qa_run_reconcile',
      dispatch_run_id: dispatchRunId,
      execution_id: executionId,
      classification,
      classification_version: currentVersion ?? LEAF_CLASSIFICATION_VERSION,
      raw_report_ref: rawRef,
      execution_record: path.relative(repoRoot, file)
    }
  }
  const reconciledAt = now().toISOString()
  const history = Array.isArray(record.classification_history) ? record.classification_history : []
  const historyEntry = {
    version: LEAF_CLASSIFICATION_VERSION,
    reconciled_at: reconciledAt,
    prior_status: record.status,
    prior_classification: record.leaf_report?.failure_kind ?? 'unavailable',
    recomputed_classification: classification,
    raw_report_ref: rawRef
  }
  const next = {
    ...record,
    status: classification,
    leaf_report: {
      ...record.leaf_report,
      failure_kind: classification,
      classification_version: LEAF_CLASSIFICATION_VERSION
    },
    classification_history: [...history, historyEntry]
  }
  writeJsonAtomic(file, next)
  appendEvent(dispatchRunId, {
    event: 'qa-run-reconcile',
    outcome: classification,
    execution_id: executionId,
    prior_status: historyEntry.prior_status,
    prior_classification: historyEntry.prior_classification,
    classification_version: LEAF_CLASSIFICATION_VERSION,
    raw_report_ref: rawRef
  })
  return {
    status: 'reconciled',
    gate: 'qa_run_reconcile',
    dispatch_run_id: dispatchRunId,
    execution_id: executionId,
    prior_status: historyEntry.prior_status,
    classification,
    classification_version: LEAF_CLASSIFICATION_VERSION,
    raw_report_ref: rawRef,
    execution_record: path.relative(repoRoot, file)
  }
}
