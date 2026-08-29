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
import {
  createSupervisorQaSession,
  cleanupSupervisorQaSession
} from '../../../../../../scripts/qa/qa-supervisor-client.mjs'
import { isProcessAlive } from './process-liveness.mjs'
import { findHandoff, readJson, repoRoot, stateDir, writeJsonAtomic } from './state.mjs'
import {
  DEFAULT_PORT,
  DEFAULT_FUNCTION_PORT_BASE,
  resolveLocalApiBaseUrl
} from '../../../../../../scripts/dev/local-api-env-config.mjs'
import {
  QA_RUNTIME_FUNCTION_PORT_BASE,
  QA_RUNTIME_LAN_PORT,
  deriveQaRuntime
} from './qa-runtime-plane.mjs'
import { assertQaRunLease } from '../../../../../../scripts/qa/qa-run-lease.mjs'
import { automatorV3RunQaRecordRoot } from '../../../../../../scripts/qa/automator-v3-run-context.mjs'
import { resolveQaBackendTarget } from '../../../../../../scripts/qa/qa-backend-target.mjs'

const qaGateOptionsWithValue = new Set([
  '--catalog-id',
  '--execution-id',
  '--dispatch-run-id',
  '--run-instance-id',
  '--project-path',
  '--observed-project-path',
  '--ws-port',
  '--wx-request-url',
  '--execution-timeout-ms',
  '--targeted-restart-command',
  '--failure-kind',
  '--run-lease-token'
])
const qaGateOptionPrefixes = [...qaGateOptionsWithValue].map(option => `${option}=`)
const forbiddenFormalRuntimeOptions = new Set([
  '--project',
  '--project-path',
  '--mp-project-path',
  '--observed-project-path',
  '--miniprogram-automator-ws',
  '--ws-endpoint',
  '--ws-port',
  '--automator-port',
  '--control-port',
  '--port',
  '--devtools-pid',
  '--e2e-artifact-dir',
  '--artifact-dir',
  '--output-dir',
  '--uni-output-dir',
  '--wx-request-url'
])

export function forbiddenFormalRuntimeArgs(rawArgs) {
  return rawArgs
    .map(String)
    .map(arg => arg.split('=', 1)[0])
    .filter(arg => forbiddenFormalRuntimeOptions.has(arg))
}

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

function recordPath(dispatchRunId, executionId, runInstanceId = null) {
  const root = runInstanceId
    ? automatorV3RunQaRecordRoot(dispatchRunId, runInstanceId)
    : path.join(stateDir(dispatchRunId), 'qa-runs')
  return path.join(root, `${executionId}.json`)
}

function qaArtifactDir(dispatchRunId, executionId, runInstanceId = null) {
  const root = runInstanceId
    ? path.join(stateDir(dispatchRunId), 'qa-artifacts', runInstanceId)
    : path.join(stateDir(dispatchRunId), 'qa-artifacts')
  return path.join(root, executionId)
}

const safeExecutionId = value => /^[a-zA-Z0-9._-]{8,160}$/.test(value)
const LOCAL_QA_WX_REQUEST_PATH = 'plant-user-http/user-plants?page=1&pageSize=1'

export function resolveQaWxRequestUrl(value, environment = process.env, { formal = false } = {}) {
  if (formal) {
    const target = resolveQaBackendTarget(environment, {
      port: QA_RUNTIME_LAN_PORT,
      functionPortBase: QA_RUNTIME_FUNCTION_PORT_BASE
    })
    return {
      url: target.wxRequestUrl,
      source: target.source
    }
  }
  const explicit = String(value || '').trim()
  if (explicit) {
    return { url: explicit, source: 'cli' }
  }
  const envUrl = String(environment.QA_WX_REQUEST_URL || '').trim()
  if (envUrl) {
    return { url: envUrl, source: 'environment' }
  }
  try {
    const port = Number(
      environment.CLOUDBASE_LOCAL_FUNCTIONS_PORT || QA_RUNTIME_LAN_PORT || DEFAULT_PORT
    )
    const baseUrl = resolveLocalApiBaseUrl(
      {
        mode: 'lan',
        port,
        functionPortBase: Number(
          environment.CLOUDBASE_LOCAL_FUNCTIONS_FUNCTION_PORT_BASE ||
            QA_RUNTIME_FUNCTION_PORT_BASE ||
            DEFAULT_FUNCTION_PORT_BASE
        )
      },
      environment
    )
    return {
      url: `${baseUrl}/${LOCAL_QA_WX_REQUEST_PATH}`,
      source: 'derived_local_lan_health'
    }
  } catch (error) {
    return {
      url: '',
      source: 'unavailable',
      reason: error?.message || 'unable to derive local LAN health URL'
    }
  }
}

function sourceProjectPathForRun(dispatchRunId) {
  const handoff = dispatchRunId ? readJson(findHandoff(dispatchRunId), {}) : {}
  const external = handoff.external_contract ?? handoff.zcode_contract ?? {}
  const provider = external.provider ?? external.external_implementer ?? ''
  const isWebExternal =
    ['trae', 'chrome_cloud_agent'].includes(provider) ||
    external.prompt_transport === 'browser_plugin'
  const worktree = external?.remote_sync?.planned_worktree_path
  const sourceProjectPath =
    isWebExternal && worktree
      ? path.join(worktree, 'dist', 'dev', 'mp-weixin')
      : defaultProjectPath()
  return sourceProjectPath
}

function expectedProjectPathForRun(dispatchRunId) {
  return deriveQaRuntime({ sourceProjectPath: sourceProjectPathForRun(dispatchRunId) }).runtimePath
}

function readQaRecords(dispatchRunId, runInstanceId = null) {
  const dir = runInstanceId
    ? automatorV3RunQaRecordRoot(dispatchRunId, runInstanceId)
    : path.join(stateDir(dispatchRunId), 'qa-runs')
  if (!fs.existsSync(dir)) {
    return []
  }
  return fs
    .readdirSync(dir)
    .filter(file => file.endsWith('.json') && !file.endsWith('.leaf-report.json'))
    .map(file => readJson(path.join(dir, file), null))
    .filter(Boolean)
}

export function recoverStaleQaRuns(dispatchRunId, staleMs = 15 * 60 * 1000, runInstanceId = null) {
  const recovered = []
  const skippedLive = []
  for (const record of readQaRecords(dispatchRunId, runInstanceId)) {
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
    writeJsonAtomic(recordPath(dispatchRunId, record.execution_id, runInstanceId), next)
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
  const runInstanceId = argValue('run-instance-id')
  const runLeaseToken = argValue('run-lease-token')
  const gate = resolveCatalogExecutionBundle({
    catalogId,
    executionId,
    validExecutionId: safeExecutionId,
    catalogReader,
    catalogValidator,
    bundleFingerprint
  })
  if (!runLeaseToken && !hasFlag('dry-run')) {
    gate.errors.push('正式 qa-run 必须绑定 dispatch run lease')
  }
  if (!runLeaseToken || !runInstanceId) {
    if (!hasFlag('dry-run')) {
      gate.errors.push('正式 qa-run 必须绑定 run-instance-id')
    }
  }
  if (runLeaseToken) {
    try {
      assertQaRunLease({ dispatchRunId, runInstanceId, token: runLeaseToken })
    } catch (error) {
      gate.errors.push(error.code || 'qa_run_lease_invalid')
    }
  }
  const sourceProjectPath = sourceProjectPathForRun(dispatchRunId)
  const expectedProjectPath = expectedProjectPathForRun(dispatchRunId)
  if (argValue('project-path')) {
    gate.errors.push(
      '正式 qa-run 不接受 caller project-path；由 supervisor 提供固定 runtime mirror'
    )
  }
  if (argValue('observed-project-path')) {
    gate.errors.push(
      '正式 qa-run 不接受 caller observed-project-path；项目身份必须来自 owner runtime 证据'
    )
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
  if (argValue('targeted-restart-command')) {
    gate.errors.push(
      'formal QA 不接受 caller restart command；只能由 owner supervisor 执行一次 target-only recovery'
    )
  }
  const forbiddenRuntimeArgs = forbiddenFormalRuntimeArgs(args)
  if (forbiddenRuntimeArgs.length) {
    gate.errors.push(
      `正式 QA 禁止 caller 覆盖运行时归属参数: ${[...new Set(forbiddenRuntimeArgs)].join(', ')}`
    )
  }
  return {
    catalogId,
    executionId,
    dispatchRunId,
    runInstanceId,
    gate,
    sourceProjectPath,
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
  runtimeFactory = createSupervisorQaSession,
  runtimeCleanup = cleanupSupervisorQaSession,
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
    const {
      catalogId,
      executionId,
      dispatchRunId,
      runInstanceId,
      gate,
      sourceProjectPath,
      expectedProjectPath
    } = prepared
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
          dispatch_run_id: dispatchRunId,
          run_instance_id: runInstanceId || null,
          errors: gate.errors
        },
        1
      )
    }
    const recordFile = recordPath(dispatchRunId, executionId, runInstanceId)
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
        terminal_reason: 'deterministic_gate_only',
        run_instance_id: runInstanceId
      })
      appendQaEvent(dispatchRunId, dry, 'dry_run_checked')
      return emit({ ...dry, execution_record: path.relative(repoRoot, recordFile) })
    }
    const wxRequest = resolveQaWxRequestUrl(argValue('wx-request-url'), process.env, {
      formal: true
    })
    const outcome = await runFormalQaExecution({
      dispatchRunId,
      runInstanceId,
      catalogId,
      executionId,
      gate,
      sourceProjectPath,
      expectedProjectPath,
      screenshotPath: path.join(
        qaArtifactDir(dispatchRunId, executionId, runInstanceId),
        'preflight.png'
      ),
      wxRequestUrl: wxRequest.url,
      allowTargetedRestart: prepared.allowTargetedRestart,
      args,
      argValue,
      stripArgs: stripQaGateArgs,
      recordFile,
      recoverStaleRuns: currentDispatchRunId =>
        recoverStaleQaRuns(currentDispatchRunId, 15 * 60 * 1000, runInstanceId),
      createPreflightRecord: () => ({
        ...createBundlePreflightRecord({
          dispatchRunId,
          catalogId,
          executionId,
          entry: gate.entry,
          scriptPath: gate.scriptPath,
          scriptHash: gate.scriptHash,
          executionBundleFiles: gate.executionBundleFiles
        }),
        run_instance_id: runInstanceId
      }),
      createLiveRecord: attempt => ({
        ...createFrozenBundleQaRecord({
          dispatchRunId,
          catalogId,
          executionId,
          entry: gate.entry,
          scriptPath: gate.scriptPath,
          scriptHash: gate.scriptHash,
          executionBundleFiles: gate.executionBundleFiles,
          attempt
        }),
        run_instance_id: runInstanceId
      }),
      readRecords: currentDispatchRunId => readQaRecords(currentDispatchRunId, runInstanceId),
      previousAttemptGate: options =>
        previousFrozenBundleAttemptGate({ ...options, runInstanceId }),
      writeRecord: writeJsonAtomic,
      terminalRecord,
      appendEvent: (record, event) => appendQaEvent(dispatchRunId, record, event),
      preflightRunner,
      leafRunner,
      runtimeFactory: options => runtimeFactory({ ...options, wxRequestUrl: undefined }),
      runtimeCleanup,
      inspectBundle: options =>
        inspectFrozenExecutionBundle({
          ...options,
          bundleFingerprint,
          entry: gate.entry,
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
      {
        ...outcome.record,
        run_instance_id: runInstanceId,
        execution_record: path.relative(repoRoot, recordFile)
      },
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
    const wxRequest = resolveQaWxRequestUrl(argValue('wx-request-url'), process.env, {
      formal: true
    })
    const allowTargetedRestart =
      prepared.gate.entry?.data_mode === 'fixture_diagnostic' && prepared.allowTargetedRestart
    const report = await runFormalQaPreflight({
      dispatchRunId: prepared.dispatchRunId,
      sourceProjectPath: prepared.sourceProjectPath,
      projectPath: prepared.expectedProjectPath,
      screenshotPath: path.join(
        qaArtifactDir(prepared.dispatchRunId, prepared.executionId, prepared.runInstanceId),
        'preflight.png'
      ),
      wxRequestUrl: wxRequest.url,
      allowTargetedRestart,
      runtimeFactory: options => runtimeFactory({ ...options, wxRequestUrl: undefined }),
      runtimeCleanup,
      preflightRunner
    })
    return emit(
      { ...report, run_instance_id: prepared.runInstanceId },
      report.status === 'passed' ? 0 : 1
    )
  }

  return { qaRun, qaPreflight }
}
