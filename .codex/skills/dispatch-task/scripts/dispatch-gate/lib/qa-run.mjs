import fs from 'node:fs'
import path from 'node:path'
import { readCatalog, sha256File, validateCatalog } from './catalog.mjs'
import { defaultProjectPath } from './episode-state.mjs'
import { runLeafWithWatchdog, withAutomatorPortLock } from './qa-execution.mjs'
import { classifyQaFailure, runQaPreflight } from './qa-preflight.mjs'
import { extractLeafReport, leafReportEvidence } from './qa-leaf-report.mjs'
import { isProcessAlive } from './process-liveness.mjs'
import {
  appendEvent,
  findHandoff,
  readJson,
  repoRoot,
  stateDir,
  writeJsonAtomic
} from './state.mjs'

const qaGateOptionsWithValue = new Set([
  '--catalog-id',
  '--execution-id',
  '--dispatch-run-id',
  '--project-path',
  '--observed-project-path',
  '--ws-port',
  '--wx-request-url',
  '--execution-timeout-ms',
  '--targeted-restart-command',
  '--failure-kind'
])
const qaGateOptionPrefixes = [...qaGateOptionsWithValue].map(option => `${option}=`)

function stripQaGateArgs(rawArgs) {
  const stripped = []
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]
    if (['--allow-live', '--dry-run', '--allow-targeted-restart'].includes(arg)) {
      continue
    }
    if (qaGateOptionsWithValue.has(arg)) {
      index += 1
      continue
    }
    if (qaGateOptionPrefixes.some(prefix => arg.startsWith(prefix))) {
      continue
    }
    stripped.push(arg)
  }
  return stripped
}

function containsUnsafeRestartCommand(rawArgs) {
  return rawArgs.some(
    arg => arg === '--targeted-restart-command' || arg.startsWith('--targeted-restart-command=')
  )
}

function validExecutionTimeout(value) {
  if (!value) {
    return true
  }
  const timeout = Number(value)
  return Number.isInteger(timeout) && timeout >= 1000 && timeout <= 15 * 60 * 1000
}

function recordPath(dispatchRunId, executionId) {
  return path.join(stateDir(dispatchRunId), 'qa-runs', `${executionId}.json`)
}

function safeExecutionId(value) {
  return /^[a-zA-Z0-9._-]{8,160}$/.test(value)
}

function expectedProjectPathForRun(dispatchRunId) {
  const handoff = dispatchRunId ? readJson(findHandoff(dispatchRunId), {}) : {}
  const external = handoff.external_contract ?? handoff.zcode_contract ?? {}
  const provider = external.provider ?? external.external_implementer ?? ''
  const isWebExternal =
    ['trae', 'chrome_cloud_agent'].includes(provider) ||
    external.prompt_transport === 'browser_plugin'
  const worktree = external?.remote_sync?.planned_worktree_path
  return isWebExternal && worktree
    ? path.join(worktree, 'dist', 'dev', 'mp-weixin')
    : defaultProjectPath()
}

function readQaRecords(dispatchRunId) {
  const dir = path.join(stateDir(dispatchRunId), 'qa-runs')
  if (!fs.existsSync(dir)) {
    return []
  }
  return fs
    .readdirSync(dir)
    .filter(file => file.endsWith('.json') && !file.endsWith('.leaf-report.json'))
    .map(file => readJson(path.join(dir, file), null))
    .filter(Boolean)
}

export function recoverStaleQaRuns(dispatchRunId, staleMs = 15 * 60 * 1000) {
  const recovered = []
  const skippedLive = []
  for (const record of readQaRecords(dispatchRunId)) {
    if (record.status !== 'running') {
      continue
    }
    const startedAt = Date.parse(record.started_at ?? '')
    if (Number.isNaN(startedAt) || Date.now() - startedAt <= staleMs) {
      continue
    }
    const ownerPid = record.leaf_pid ?? record.runner_pid
    if (isProcessAlive(ownerPid)) {
      skippedLive.push(record.execution_id)
      continue
    }
    const next = {
      ...record,
      status: 'aborted',
      terminal_reason: 'stale_running_recovery',
      completed_at: new Date().toISOString()
    }
    writeJsonAtomic(recordPath(dispatchRunId, record.execution_id), next)
    recovered.push(record.execution_id)
  }
  return { recovered, skipped_live: skippedLive }
}

function catalogGate({ catalogId, executionId }) {
  const errors = []
  if (!catalogId) {
    errors.push('--catalog-id is required')
  }
  if (!safeExecutionId(executionId)) {
    errors.push('--execution-id must be 8-160 chars of [a-zA-Z0-9._-]')
  }
  const catalogReport = validateCatalog()
  if (catalogReport.status !== 'passed') {
    errors.push(...catalogReport.errors)
  }
  const entry = readCatalog().entries.find(item => item.id === catalogId)
  if (!entry) {
    errors.push(`unknown catalog id: ${catalogId}`)
  }
  const scriptPath = entry?.leaf_script ?? entry?.script
  const script = scriptPath ? path.join(repoRoot, scriptPath) : ''
  const scriptHash = script && fs.existsSync(script) ? sha256File(script) : ''
  if (entry && entry.script_sha256 !== scriptHash) {
    errors.push(
      `script hash mismatch for ${catalogId}: expected ${entry.script_sha256}, got ${scriptHash}`
    )
  }
  return { errors, entry, scriptPath, script, scriptHash }
}

function baseQaRecord({
  dispatchRunId,
  catalogId,
  executionId,
  entry,
  scriptPath,
  scriptHash,
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
    category_path: entry.category_path,
    id_policy_refs: entry.id_policy?.refs ?? entry.required_id_policy_refs,
    requirements: entry.requirements,
    live_attempt: attempt,
    runner_pid: process.pid,
    started_at: new Date().toISOString()
  }
}

function terminalRecord(file, record, status, extra = {}) {
  const next = { ...record, ...extra, status, completed_at: new Date().toISOString() }
  writeJsonAtomic(file, next)
  return next
}

export function persistLeafReportEvidence(recordFile, lifecycle) {
  const leafReport = extractLeafReport({ stdout: lifecycle.stdout, stderr: lifecycle.stderr })
  if (!leafReport.raw_report) {
    return leafReportEvidence(leafReport, 'unavailable')
  }
  const evidenceFile = recordFile.replace(/\.json$/, '.leaf-report.json')
  writeJsonAtomic(evidenceFile, {
    gate: 'qa_leaf_report',
    captured_at: new Date().toISOString(),
    ...leafReport
  })
  return leafReportEvidence(leafReport, path.relative(repoRoot, evidenceFile))
}

function previousAttemptGate({ dispatchRunId, catalogId, scriptHash }) {
  const relevant = readQaRecords(dispatchRunId).filter(
    record =>
      record.catalog_id === catalogId &&
      record.frozen_script_sha256 === scriptHash &&
      record.live_attempt
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

function appendQaEvent(dispatchRunId, record, outcome) {
  appendEvent(dispatchRunId, {
    event: 'qa-run',
    outcome,
    catalog_id: record.catalog_id,
    execution_id: record.execution_id,
    script: record.script,
    script_sha256: record.frozen_script_sha256,
    execution_record: path.relative(repoRoot, recordPath(dispatchRunId, record.execution_id))
  })
}

function prepareQaGate({ args, argValue, hasFlag }) {
  const catalogId = argValue('catalog-id')
  const executionId = argValue('execution-id')
  const dispatchRunId = argValue('dispatch-run-id') || `manual-qa-${executionId || 'unbound'}`
  const gate = catalogGate({ catalogId, executionId })
  const expectedProjectPath = expectedProjectPathForRun(dispatchRunId)
  const requestedProjectPath = argValue('project-path') || expectedProjectPath
  if (path.resolve(requestedProjectPath) !== path.resolve(expectedProjectPath)) {
    gate.errors.push(`project-path must match the dispatch target: ${expectedProjectPath}`)
  }
  if (containsUnsafeRestartCommand(args)) {
    gate.errors.push('caller-supplied targeted restart commands are forbidden')
  }
  if (!validExecutionTimeout(argValue('execution-timeout-ms'))) {
    gate.errors.push('--execution-timeout-ms must be 1000-900000 milliseconds')
  }
  return {
    catalogId,
    executionId,
    dispatchRunId,
    gate,
    expectedProjectPath,
    allowTargetedRestart: hasFlag('allow-targeted-restart')
  }
}

function preflightOptions({
  argValue,
  expectedProjectPath,
  allowTargetedRestart,
  dispatchRunId,
  executionId
}) {
  return {
    projectPath: expectedProjectPath,
    observedProjectPath: argValue('observed-project-path'),
    wsPort: Number(argValue('ws-port') || 9420),
    wxRequestUrl: argValue('wx-request-url'),
    screenshotPath: path.join(stateDir(dispatchRunId), 'qa-runs', `${executionId}-preflight.png`),
    allowTargetedRestart
  }
}

export function createQaRunCommands({ args, argValue, hasFlag, emit }) {
  async function qaRun() {
    const prepared = prepareQaGate({ args, argValue, hasFlag })
    const { catalogId, executionId, dispatchRunId, gate, expectedProjectPath } = prepared
    const dryRun = hasFlag('dry-run')
    if (!dryRun && !hasFlag('allow-live')) {
      gate.errors.push(
        'live automator execution requires --allow-live after catalog/hash/execution-id checks'
      )
    }
    if (gate.errors.length) {
      return emit(
        {
          status: 'blocked',
          gate: 'qa_run',
          catalog_id: catalogId,
          execution_id: executionId,
          errors: gate.errors
        },
        1
      )
    }
    const recordFile = recordPath(dispatchRunId, executionId)
    if (dryRun) {
      const record = baseQaRecord({
        dispatchRunId,
        catalogId,
        executionId,
        entry: gate.entry,
        scriptPath: gate.scriptPath,
        scriptHash: gate.scriptHash,
        attempt: 0
      })
      const dry = terminalRecord(recordFile, record, 'passed_dry_run', {
        terminal_reason: 'deterministic_gate_only'
      })
      appendQaEvent(dispatchRunId, dry, 'dry_run_checked')
      return emit({ ...dry, execution_record: path.relative(repoRoot, recordFile) })
    }
    try {
      return await withAutomatorPortLock(async () => {
        recoverStaleQaRuns(dispatchRunId)
        const attemptGate = previousAttemptGate({
          dispatchRunId,
          catalogId,
          scriptHash: gate.scriptHash
        })
        if (attemptGate.blocked) {
          return emit(
            {
              status: 'blocked',
              gate: 'qa_run',
              catalog_id: catalogId,
              execution_id: executionId,
              errors: [attemptGate.reason],
              previous_live_attempts: attemptGate.attempts
            },
            1
          )
        }
        let record = baseQaRecord({
          dispatchRunId,
          catalogId,
          executionId,
          entry: gate.entry,
          scriptPath: gate.scriptPath,
          scriptHash: gate.scriptHash,
          attempt: attemptGate.attempts + 1
        })
        writeJsonAtomic(recordFile, record)
        appendQaEvent(dispatchRunId, record, 'live_started')
        try {
          const preflight = await runQaPreflight(
            preflightOptions({ ...prepared, argValue, expectedProjectPath })
          )
          if (preflight.status !== 'passed') {
            const failed = terminalRecord(recordFile, record, 'failed_environment', { preflight })
            appendQaEvent(dispatchRunId, failed, failed.status)
            return emit({ ...failed, execution_record: path.relative(repoRoot, recordFile) }, 1)
          }
          let terminalFromLifecycle
          const lifecycle = await runLeafWithWatchdog({
            script: gate.script,
            args: stripQaGateArgs(args),
            env: { ...process.env, DISPATCH_QA_EXECUTION_ID: executionId },
            timeoutMs: argValue('execution-timeout-ms'),
            onStarted: started => {
              record = { ...record, ...started }
              writeJsonAtomic(recordFile, record)
            },
            onTerminal: terminal => {
              terminalFromLifecycle = terminalRecord(recordFile, record, terminal.status, terminal)
              appendQaEvent(dispatchRunId, terminalFromLifecycle, terminal.status)
            },
            onStdout: chunk => process.stdout.write(chunk),
            onStderr: chunk => process.stderr.write(chunk)
          })
          if (terminalFromLifecycle) {
            return emit(
              { ...terminalFromLifecycle, execution_record: path.relative(repoRoot, recordFile) },
              1
            )
          }
          const currentHash = sha256File(gate.script)
          const leafReport = extractLeafReport({
            stdout: lifecycle.stdout,
            stderr: lifecycle.stderr
          })
          const reportEvidence = persistLeafReportEvidence(recordFile, lifecycle)
          const status =
            currentHash !== gate.scriptHash
              ? 'failed_script'
              : lifecycle.exit_code === 0
                ? 'passed'
                : classifyQaFailure({
                    exitCode: lifecycle.exit_code,
                    stdout: lifecycle.stdout,
                    stderr: lifecycle.stderr,
                    forcedKind: argValue('failure-kind'),
                    leafReport
                  })
          const completed = terminalRecord(recordFile, record, status, {
            exit_code: lifecycle.exit_code,
            signal: lifecycle.signal ?? null,
            leaf_pid: lifecycle.leaf_pid,
            execution_timeout_ms: lifecycle.execution_timeout_ms,
            preflight,
            observed_script_sha256_after_run: currentHash,
            leaf_report: reportEvidence,
            stdout_excerpt: lifecycle.stdout.slice(-2000),
            stderr_excerpt: lifecycle.stderr.slice(-2000),
            terminal_reason:
              currentHash !== gate.scriptHash ? 'frozen_hash_changed_during_execution' : undefined
          })
          appendQaEvent(dispatchRunId, completed, completed.status)
          return emit(
            { ...completed, execution_record: path.relative(repoRoot, recordFile) },
            status === 'passed' ? 0 : 1
          )
        } catch (error) {
          const aborted = terminalRecord(recordFile, record, 'aborted', {
            terminal_reason: error.message
          })
          appendQaEvent(dispatchRunId, aborted, aborted.status)
          return emit({ ...aborted, execution_record: path.relative(repoRoot, recordFile) }, 1)
        }
      })
    } catch (error) {
      const lockFailure = terminalRecord(
        recordFile,
        baseQaRecord({
          dispatchRunId,
          catalogId,
          executionId,
          entry: gate.entry,
          scriptPath: gate.scriptPath,
          scriptHash: gate.scriptHash,
          attempt: 0
        }),
        'failed_environment',
        {
          terminal_reason: 'automator_9420_lock_unavailable',
          failure: {
            code: 'automator_9420_lock_unavailable',
            message: error.message
          },
          live_attempt_consumed: false
        }
      )
      appendQaEvent(dispatchRunId, lockFailure, lockFailure.status)
      return emit({ ...lockFailure, execution_record: path.relative(repoRoot, recordFile) }, 1)
    }
  }

  async function qaPreflight() {
    const prepared = prepareQaGate({ args, argValue, hasFlag })
    if (prepared.gate.errors.length) {
      return emit(
        { status: 'failed_environment', gate: 'qa_preflight', failures: prepared.gate.errors },
        1
      )
    }
    const report = await runQaPreflight(preflightOptions({ ...prepared, argValue }))
    return emit(report, report.status === 'passed' ? 0 : 1)
  }

  return { qaRun, qaPreflight }
}
