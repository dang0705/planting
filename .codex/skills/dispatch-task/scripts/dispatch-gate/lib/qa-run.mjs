import fs from 'node:fs'
import path from 'node:path'
import { defaultProjectPath } from './episode-state.mjs'
import { runLeafWithWatchdog } from './qa-execution.mjs'
import {
  appendBundleQaEvent as appendQaEvent,
  classifyFrozenBundleRun,
  createBundlePreflightRecord,
  createFrozenBundleQaRecord,
  failedExecutionBundleEvidence,
  frozenExecutionBundleEvidence,
  inspectFrozenExecutionBundle,
  isLiveAttemptConsumed,
  previousFrozenBundleAttemptGate,
  resolveCatalogExecutionBundle,
  validQaExecutionTimeout
} from './qa-run-bundle-integrity.mjs'
import { classifyQaFailure, runQaPreflight } from './qa-preflight.mjs'
import { extractLeafReport, leafReportEvidence } from './qa-leaf-report.mjs'
import { runFormalQaExecution, runFormalQaPreflight } from './formal-isolated-qa-execution.mjs'
import { cleanupTestOwnedQaSession, createTestOwnedQaSession } from './test-owned-qa-session.mjs'
import { isProcessAlive } from './process-liveness.mjs'
import { findHandoff, readJson, repoRoot, stateDir, writeJsonAtomic } from './state.mjs'

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

export function stripQaGateArgs(rawArgs) {
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

function recordPath(dispatchRunId, executionId) {
  return path.join(stateDir(dispatchRunId), 'qa-runs', `${executionId}.json`)
}

const safeExecutionId = value => /^[a-zA-Z0-9._-]{8,160}$/.test(value)

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

function terminalRecord(file, record, status, extra = {}) {
  const next = { ...record, ...extra, status, completed_at: new Date().toISOString() }
  writeJsonAtomic(file, next)
  return next
}

export function persistLeafReportEvidence(recordFile, lifecycle, attempt = 1) {
  const leafReport = extractLeafReport({ stdout: lifecycle.stdout, stderr: lifecycle.stderr })
  if (!leafReport.raw_report) {
    return leafReportEvidence(leafReport, 'unavailable')
  }
  const suffix = attempt > 1 ? `.attempt-${attempt}` : ''
  const evidenceFile = recordFile.replace(/\.json$/, `${suffix}.leaf-report.json`)
  writeJsonAtomic(evidenceFile, {
    gate: 'qa_leaf_report',
    captured_at: new Date().toISOString(),
    ...leafReport
  })
  return leafReportEvidence(leafReport, path.relative(repoRoot, evidenceFile))
}

function prepareQaGate({
  args,
  argValue,
  hasFlag,
  catalogReader,
  catalogValidator,
  bundleFingerprint
}) {
  const catalogId = argValue('catalog-id')
  const executionId = argValue('execution-id')
  const dispatchRunId = argValue('dispatch-run-id') || `manual-qa-${executionId || 'unbound'}`
  const gate = resolveCatalogExecutionBundle({
    catalogId,
    executionId,
    validExecutionId: safeExecutionId,
    catalogReader,
    catalogValidator,
    bundleFingerprint
  })
  const expectedProjectPath = expectedProjectPathForRun(dispatchRunId)
  const requestedProjectPath = argValue('project-path') || expectedProjectPath
  if (path.resolve(requestedProjectPath) !== path.resolve(expectedProjectPath)) {
    gate.errors.push(`project-path must match the dispatch target: ${expectedProjectPath}`)
  }
  if (containsUnsafeRestartCommand(args)) {
    gate.errors.push('caller-supplied targeted restart commands are forbidden')
  }
  if (!validQaExecutionTimeout(argValue('execution-timeout-ms'))) {
    gate.errors.push('--execution-timeout-ms must be 1000-900000 milliseconds')
  }
  if (argValue('ws-port')) {
    gate.errors.push('formal QA 每次自动分配唯一 Automator 端口；--ws-port 不可指定')
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

export function createQaRunCommands({
  args,
  argValue,
  hasFlag,
  emit,
  preflightRunner = runQaPreflight,
  leafRunner = runLeafWithWatchdog,
  runtimeFactory = createTestOwnedQaSession,
  runtimeCleanup = cleanupTestOwnedQaSession,
  catalogReader,
  catalogValidator,
  bundleFingerprint
}) {
  async function qaRun() {
    const prepared = prepareQaGate({
      args,
      argValue,
      hasFlag,
      catalogReader,
      catalogValidator,
      bundleFingerprint
    })
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
      const record = createFrozenBundleQaRecord({
        dispatchRunId,
        catalogId,
        executionId,
        entry: gate.entry,
        scriptPath: gate.scriptPath,
        scriptHash: gate.scriptHash,
        executionBundleFiles: gate.executionBundleFiles,
        attempt: 0
      })
      const dry = terminalRecord(recordFile, record, 'passed_dry_run', {
        terminal_reason: 'deterministic_gate_only'
      })
      appendQaEvent(dispatchRunId, dry, 'dry_run_checked')
      return emit({ ...dry, execution_record: path.relative(repoRoot, recordFile) })
    }
    const outcome = await runFormalQaExecution({
      dispatchRunId,
      catalogId,
      executionId,
      gate,
      expectedProjectPath,
      screenshotPath: path.join(stateDir(dispatchRunId), 'qa-runs', `${executionId}-preflight.png`),
      wxRequestUrl: argValue('wx-request-url'),
      allowTargetedRestart: prepared.allowTargetedRestart,
      args,
      argValue,
      stripArgs: stripQaGateArgs,
      recordFile,
      recoverStaleRuns: recoverStaleQaRuns,
      createPreflightRecord: () =>
        createBundlePreflightRecord({
          dispatchRunId,
          catalogId,
          executionId,
          entry: gate.entry,
          scriptPath: gate.scriptPath,
          scriptHash: gate.scriptHash,
          executionBundleFiles: gate.executionBundleFiles
        }),
      createLiveRecord: attempt =>
        createFrozenBundleQaRecord({
          dispatchRunId,
          catalogId,
          executionId,
          entry: gate.entry,
          scriptPath: gate.scriptPath,
          scriptHash: gate.scriptHash,
          executionBundleFiles: gate.executionBundleFiles,
          attempt
        }),
      readRecords: readQaRecords,
      previousAttemptGate: previousFrozenBundleAttemptGate,
      writeRecord: writeJsonAtomic,
      terminalRecord,
      appendEvent: (record, event) => appendQaEvent(dispatchRunId, record, event),
      preflightRunner,
      leafRunner,
      runtimeFactory: options => runtimeFactory(options),
      runtimeCleanup,
      inspectBundle: options =>
        inspectFrozenExecutionBundle({
          ...options,
          bundleFingerprint,
          additionalFiles: gate.entry?.integrity_files ?? []
        }),
      failedBundleEvidence: failedExecutionBundleEvidence,
      frozenBundleEvidence: frozenExecutionBundleEvidence,
      persistLeafReport: persistLeafReportEvidence,
      classifyRun: ({ integrity, lifecycle, reportEvidence }) => {
        const leafReport = extractLeafReport({ stdout: lifecycle.stdout, stderr: lifecycle.stderr })
        return classifyFrozenBundleRun({
          integrity,
          lifecycle,
          reportEvidence,
          leafReport,
          classifyFailure: report =>
            classifyQaFailure({
              exitCode: lifecycle.exit_code,
              stdout: lifecycle.stdout,
              stderr: lifecycle.stderr,
              forcedKind: argValue('failure-kind'),
              leafReport: report
            })
        })
      },
      isLiveAttemptConsumed
    })
    return emit(
      { ...outcome.record, execution_record: path.relative(repoRoot, recordFile) },
      outcome.exitCode
    )
  }

  async function qaPreflight() {
    const prepared = prepareQaGate({
      args,
      argValue,
      hasFlag,
      catalogReader,
      catalogValidator,
      bundleFingerprint
    })
    if (prepared.gate.errors.length) {
      return emit(
        { status: 'failed_environment', gate: 'qa_preflight', failures: prepared.gate.errors },
        1
      )
    }
    const report = await runFormalQaPreflight({
      dispatchRunId: prepared.dispatchRunId,
      projectPath: prepared.expectedProjectPath,
      screenshotPath: path.join(
        stateDir(prepared.dispatchRunId),
        'qa-runs',
        `${prepared.executionId}-preflight.png`
      ),
      wxRequestUrl: argValue('wx-request-url'),
      allowTargetedRestart: prepared.allowTargetedRestart,
      runtimeFactory: options => runtimeFactory(options),
      runtimeCleanup,
      preflightRunner
    })
    return emit(report, report.status === 'passed' ? 0 : 1)
  }

  return { qaRun, qaPreflight }
}
