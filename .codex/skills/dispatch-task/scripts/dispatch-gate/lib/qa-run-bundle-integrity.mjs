import fs from 'node:fs'
import path from 'node:path'
import { catalogExecutionBundleFingerprint, readCatalog, validateCatalog } from './catalog.mjs'
import { appendEvent, repoRoot, stateDir } from './state.mjs'

export function validQaExecutionTimeout(value) {
  if (!value) {
    return true
  }
  const timeout = Number(value)
  return Number.isInteger(timeout) && timeout >= 1000 && timeout <= 15 * 60 * 1000
}

export function resolveCatalogExecutionBundle({
  catalogId,
  executionId,
  validExecutionId,
  catalogReader = readCatalog,
  catalogValidator = validateCatalog,
  bundleFingerprint = (script, { entry } = {}) =>
    catalogExecutionBundleFingerprint(script, { entry })
}) {
  const errors = []
  if (!catalogId) {
    errors.push('--catalog-id is required')
  }
  if (!validExecutionId(executionId)) {
    errors.push('--execution-id must be 8-160 chars of [a-zA-Z0-9._-]')
  }
  const catalogReport = catalogValidator()
  if (catalogReport.status !== 'passed') {
    errors.push(...catalogReport.errors)
  }
  const entry = catalogReader().entries.find(item => item.id === catalogId)
  if (!entry) {
    errors.push(`unknown catalog id: ${catalogId}`)
  }
  const scriptPath = entry?.leaf_script ?? entry?.script
  const script = scriptPath ? path.join(repoRoot, scriptPath) : ''
  let executionBundleFiles = []
  let scriptHash = ''
  if (script && fs.existsSync(script)) {
    try {
      const bundle = bundleFingerprint(script, { entry })
      scriptHash = bundle.hash
      executionBundleFiles = bundle.files
    } catch (error) {
      errors.push(`execution bundle resolution failed for ${catalogId}: ${error.message}`)
    }
  }
  if (entry && entry.script_sha256 !== scriptHash) {
    errors.push(
      `script hash mismatch for ${catalogId}: expected ${entry.script_sha256}, got ${scriptHash}`
    )
  }
  return { errors, entry, scriptPath, script, scriptHash, executionBundleFiles }
}

export function createFrozenBundleQaRecord({
  dispatchRunId,
  catalogId,
  executionId,
  entry,
  scriptPath,
  scriptHash,
  executionBundleFiles = [],
  attempt
}) {
  return {
    status: 'running',
    gate: 'qa_run',
    dispatch_run_id: dispatchRunId,
    catalog_id: catalogId,
    execution_id: executionId,
    script: scriptPath,
    script_sha256: scriptHash,
    frozen_script_sha256: scriptHash,
    execution_bundle_files: executionBundleFiles,
    category_path: entry.category_path,
    data_mode: entry.data_mode,
    auth_mode: entry.auth_mode,
    mutation_policy: entry.mutation_policy,
    id_policy_refs: entry.id_policy?.refs ?? entry.required_id_policy_refs,
    requirements: entry.requirements,
    live_attempt: attempt,
    live_attempt_consumed: attempt > 0,
    runner_pid: process.pid,
    started_at: new Date().toISOString()
  }
}

export function createBundlePreflightRecord(options) {
  return {
    ...createFrozenBundleQaRecord({ ...options, attempt: 0 }),
    gate: 'qa_preflight',
    live_attempt: 0,
    live_attempt_consumed: false
  }
}

export function previousFrozenBundleAttemptGate({
  records,
  catalogId,
  executionId,
  scriptHash,
  runInstanceId = null
}) {
  const relevant = records.filter(
    record =>
      record.catalog_id === catalogId &&
      record.execution_id === executionId &&
      (!runInstanceId || record.run_instance_id === runInstanceId) &&
      record.frozen_script_sha256 === scriptHash &&
      record.live_attempt > 0 &&
      record.live_attempt_consumed !== false
  )
  if (relevant.some(record => record.status === 'failed_product')) {
    return {
      blocked: true,
      reason: 'failed_product_requires_implementation_recovery',
      attempts: relevant.length
    }
  }
  if (relevant.length >= 2) {
    return {
      blocked: true,
      reason: 'live_attempt_budget_exhausted_for_frozen_hash',
      attempts: relevant.length
    }
  }
  return { blocked: false, attempts: relevant.length }
}

export function isLiveAttemptConsumed({ status, leafReport }) {
  return !(
    status === 'failed_script' ||
    (status === 'failed_environment' && leafReport.failure_kind === 'failed_environment')
  )
}

export function inspectFrozenExecutionBundle({
  script,
  frozenScriptHash,
  bundleFingerprint = (targetScript, { entry } = {}) =>
    catalogExecutionBundleFingerprint(targetScript, { entry }),
  entry = {},
  additionalFiles = []
}) {
  try {
    const bundle = bundleFingerprint(script, { entry, additionalFiles })
    return {
      changed: bundle.hash !== frozenScriptHash,
      observedScriptHash: bundle.hash,
      observedExecutionBundleFiles: bundle.files,
      terminalReason:
        bundle.hash !== frozenScriptHash
          ? 'frozen_execution_bundle_changed_during_execution'
          : undefined
    }
  } catch (error) {
    return {
      changed: true,
      observedScriptHash: '',
      observedExecutionBundleFiles: [],
      terminalReason: `execution_bundle_unresolvable_after_run: ${error.message}`
    }
  }
}

export function frozenExecutionBundleEvidence(integrity) {
  return {
    observed_script_sha256_after_run: integrity.observedScriptHash,
    observed_execution_bundle_files_after_run: integrity.observedExecutionBundleFiles,
    terminal_reason: integrity.terminalReason
  }
}

export function failedExecutionBundleEvidence(integrity) {
  return { ...frozenExecutionBundleEvidence(integrity), live_attempt_consumed: false }
}

export function appendBundleQaEvent(dispatchRunId, record, outcome) {
  appendEvent(dispatchRunId, {
    event: 'qa-run',
    outcome,
    catalog_id: record.catalog_id,
    execution_id: record.execution_id,
    script: record.script,
    script_sha256: record.frozen_script_sha256,
    execution_bundle_files: record.execution_bundle_files,
    execution_record: path.relative(
      repoRoot,
      record.run_instance_id
        ? path.join(
            stateDir(dispatchRunId),
            'qa-runs',
            record.run_instance_id,
            `${record.execution_id}.json`
          )
        : path.join(stateDir(dispatchRunId), 'qa-runs', `${record.execution_id}.json`)
    )
  })
}

export function classifyFrozenBundleRun({
  integrity,
  lifecycle,
  reportEvidence,
  leafReport,
  classifyFailure
}) {
  if (integrity.changed) {
    return 'failed_script'
  }
  if (reportEvidence.failure_kind !== 'unavailable') {
    return reportEvidence.failure_kind
  }
  if (lifecycle.exit_code === 0) {
    return 'passed'
  }
  if (reportEvidence.failure_kind === 'unavailable') {
    return 'failed_script'
  }
  return classifyFailure(leafReport)
}
