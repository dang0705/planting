#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { runAuthConcurrencyMatrixWithLease } from './automator-auth-concurrency.mjs'
import { createAuthRuntimeProbe } from './automator-auth-runtime-probe.mjs'
import { rebindNativeQaAuthRuntime } from './qa-supervisor-client.mjs'
import { runAutomatorStress } from './automator-stress.mjs'
import { runAutomatorWarmStability } from './automator-warm-stability.mjs'
import {
  AUTH_RENEWAL_MIN_INITIAL_REMAINING_MS,
  controlledDailyRenewalAvailable,
  createAuthRenewalGuard,
  readAuthRenewalState
} from './automator-auth-renewal-guard.mjs'
import { runLiveMatrix } from './automator-live-matrix.mjs'
import { AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS, runAutomatorSoak } from './automator-soak.mjs'
import { acquireQaRunLease } from './qa-run-lease.mjs'
import { ensureQaAuthAvailable, readQaAuthManifest } from './qa-auth-coordinator.mjs'
import { validateAutomatorV3BusinessCoverage } from './automator-v3-final-gate.mjs'
import { AUTOMATOR_V3_SAFE_ID, automatorV3SuiteDirectory } from './automator-v3-run-context.mjs'
import { qaRunLeaseArgs } from './qa-run-lease.mjs'
import { validateCatalog } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/catalog.mjs'
import { runQaNodeCommand } from './qa-node-command.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const finalGateScript = path.join(repoRoot, 'scripts', 'qa', 'automator-v3-final-gate.mjs')
const runtimeScript = path.join(repoRoot, 'scripts', 'qa', 'automator-runtime.mjs')
const AUTH_RUNTIME_PROBE_SETUP_TIMEOUT_MS = 120_000
const AUTH_RUNTIME_PROBE_CALL_TIMEOUT_MS = 60_000
const SUITE_PHASE_AUTH_SAFETY_BUFFER_MS = 30_000
const SOAK_AUTH_FRESHNESS_WINDOW_MS = AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS
const BOOTSTRAP_PHASE_TIMEOUT_MS = 7 * 60 * 1000
const SUITE_PHASE_TIMEOUTS_MS = Object.freeze({
  auth: 35 * 60 * 1000,
  cold_start: 20 * 60 * 1000,
  warm: 30 * 60 * 1000,
  live: 2 * 60 * 60 * 1000,
  soak: AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS
})

function timeoutError(code, timeoutMs) {
  const error = new Error(`${code} after ${timeoutMs}ms`)
  error.code = code
  error.timeoutMs = timeoutMs
  return error
}

async function withTimeout(task, timeoutMs, code) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError(code, timeoutMs)), timeoutMs)
  })
  try {
    return await Promise.race([Promise.resolve().then(task), timeout])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function parseJsonOutput(output) {
  const text = String(output || '').trim()
  try {
    return JSON.parse(text)
  } catch {
    for (let index = text.lastIndexOf('{'); index >= 0; index = text.lastIndexOf('{', index - 1)) {
      try {
        return JSON.parse(text.slice(index))
      } catch {
        // Continue until the terminal JSON object is found.
      }
    }
    return null
  }
}

async function invokeRuntime(command, lease) {
  const result = await runQaNodeCommand({
    command: process.execPath,
    args: [runtimeScript, command, '--json', ...qaRunLeaseArgs(lease)],
    cwd: repoRoot,
    timeoutMs: 7 * 60 * 1000,
    maxOutputChars: 8 * 1024 * 1024,
    env: { ...process.env, QA_AUTOMATOR_V3_SUITE: '1' }
  })
  return {
    command,
    status: result.status,
    signal: result.signal,
    timed_out: result.timedOut,
    value: parseJsonOutput(result.stdout),
    stdout: String(result.stdout || '').slice(-12_000),
    stderr: String(result.stderr || '').slice(-12_000)
  }
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temp, file)
}

function authMaterialPrecondition() {
  try {
    const broker = ensureQaAuthAvailable()
    const auth = readQaAuthManifest()
    if (!auth.material_ready) {
      return {
        status: 'blocked',
        code: auth.code || 'qa_auth_material_unavailable',
        broker: {
          status: broker?.status || null,
          code: broker?.code || null,
          auth_mode: broker?.auth_mode || null
        },
        auth: {
          code: auth.code || null,
          material_ready: auth.material_ready === true,
          server_validated: auth.server_validated === true,
          runtime_ready: auth.runtime_ready === true
        }
      }
    }
    const serverRevalidationRequired = auth.code === 'qa_auth_server_invalidated'
    return {
      status: 'ready',
      code: serverRevalidationRequired
        ? 'qa_auth_revalidation_pending'
        : 'qa_auth_material_precondition_ready',
      broker: {
        status: broker?.status || null,
        code: broker?.code || null,
        auth_mode: broker?.auth_mode || null
      },
      auth: {
        code: auth.code || null,
        material_ready: true,
        server_validated: auth.server_validated === true,
        server_revalidation_required: serverRevalidationRequired,
        runtime_ready: auth.runtime_ready === true,
        auth_generation: Number(auth.value?.auth_generation) || null,
        identity_hash: auth.value?.identity_hash || null
      }
    }
  } catch (error) {
    return {
      status: 'blocked',
      code: error?.code || 'qa_auth_material_precondition_failed',
      message: error?.message || String(error)
    }
  }
}

export function authPhaseFreshnessPrecondition(
  phase,
  requiredDurationMs,
  {
    now = Date.now(),
    safetyBufferMs = SUITE_PHASE_AUTH_SAFETY_BUFFER_MS,
    authState = null,
    allowDelegatedDailyRenewal = false,
    dailyRenewalState = null
  } = {}
) {
  const auth = authState || readQaAuthManifest()
  if (!auth.material_ready || !auth.value) {
    return {
      status: 'blocked',
      code: auth.code || 'qa_auth_material_unavailable',
      phase,
      auth_code: auth.code || null,
      material_ready: false
    }
  }
  const ticketExpiredAt = Number(auth.value.ticket_expired_at)
  const signatureExpiredAt = Number(auth.value.signature_expired_at)
  const expiresAt = Math.min(ticketExpiredAt, signatureExpiredAt)
  const requiredMs = Math.max(0, Number(requiredDurationMs) || 0)
  const requiredUntil = now + requiredMs + Math.max(0, Number(safetyBufferMs) || 0)
  const remainingMs = expiresAt - now
  if (!Number.isFinite(expiresAt) || expiresAt <= requiredUntil) {
    const renewalState = allowDelegatedDailyRenewal
      ? dailyRenewalState || readAuthRenewalState()
      : null
    if (
      allowDelegatedDailyRenewal &&
      remainingMs > Math.max(5_000, AUTH_RENEWAL_MIN_INITIAL_REMAINING_MS) &&
      controlledDailyRenewalAvailable(renewalState) &&
      renewalState.shared?.identityHash === auth.value.identity_hash
    ) {
      return {
        status: 'ready',
        code: 'qa_auth_ticket_renewal_delegated_to_daily_runtime',
        phase,
        auth_code: auth.code || null,
        auth_generation: Number(auth.value.auth_generation) || null,
        identity_hash: auth.value.identity_hash || null,
        ticket_expired_at: ticketExpiredAt,
        signature_expired_at: signatureExpiredAt,
        remaining_ms: Number.isFinite(remainingMs) ? remainingMs : null,
        required_ms: requiredMs,
        safety_buffer_ms: Math.max(0, Number(safetyBufferMs) || 0),
        renewal_mode: 'native_daily_official_tool_refresh_observed',
        renewal_grace_ms: 30_000,
        daily_owner_pid: renewalState.daily.owner_pid,
        daily_owner_start_identity: renewalState.daily.owner_start_identity
      }
    }
    return {
      status: 'blocked',
      code: `qa_auth_ticket_will_expire_during_${phase}`,
      phase,
      auth_code: auth.code || null,
      auth_generation: Number(auth.value.auth_generation) || null,
      identity_hash: auth.value.identity_hash || null,
      ticket_expired_at: ticketExpiredAt,
      signature_expired_at: signatureExpiredAt,
      remaining_ms: Number.isFinite(remainingMs) ? remainingMs : null,
      required_ms: requiredMs,
      safety_buffer_ms: Math.max(0, Number(safetyBufferMs) || 0)
    }
  }
  return {
    status: 'ready',
    code: 'qa_auth_ticket_covers_phase',
    phase,
    auth_code: auth.code || null,
    auth_generation: Number(auth.value.auth_generation) || null,
    identity_hash: auth.value.identity_hash || null,
    ticket_expired_at: ticketExpiredAt,
    signature_expired_at: signatureExpiredAt,
    remaining_ms: remainingMs,
    required_ms: requiredMs,
    safety_buffer_ms: Math.max(0, Number(safetyBufferMs) || 0)
  }
}

function businessCoveragePrecondition() {
  const coveragePath = path.join(repoRoot, 'test', 'e2e', 'automator', 'business-coverage.json')
  try {
    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'))
    const validation = validateAutomatorV3BusinessCoverage(coverage, { root: repoRoot })
    return {
      status: validation.passed ? 'ready' : 'blocked',
      code: validation.passed
        ? 'qa_business_coverage_precondition_ready'
        : 'qa_business_coverage_incomplete',
      coverage_path: coveragePath,
      blocked_surface_routes: validation.blocked_surface_routes,
      blocked_capabilities: validation.blocked_capabilities,
      errors: validation.errors
    }
  } catch (error) {
    return {
      status: 'blocked',
      code: error?.code || 'qa_business_coverage_precondition_failed',
      coverage_path: coveragePath,
      message: error?.message || String(error)
    }
  }
}

function catalogPrecondition() {
  try {
    const validation = validateCatalog()
    return {
      status: validation.status === 'passed' ? 'ready' : 'blocked',
      code:
        validation.status === 'passed'
          ? 'qa_catalog_precondition_ready'
          : 'qa_catalog_precondition_failed',
      catalog_path: validation.catalog_path,
      errors: validation.errors,
      warnings: validation.warnings,
      entries: validation.entries,
      discovered_executable_leaves: validation.discovered_executable_leaves
    }
  } catch (error) {
    return {
      status: 'blocked',
      code: error?.code || 'qa_catalog_precondition_unreadable',
      catalog_path: 'test/e2e/automator/catalog.json',
      message: error?.message || String(error)
    }
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const result = {
    dispatchRunId: `automator-v3-suite-${Date.now()}`,
    allowLive: false,
    infraOnly: false,
    executionPrefix: `suite-${Date.now()}-${process.pid}`
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index])
    if (argument === '--allow-live') {
      result.allowLive = true
      continue
    }
    if (argument === '--infra-only') {
      result.infraOnly = true
      continue
    }
    if (!argument.startsWith('--')) {
      continue
    }
    const [key, inlineValue] = argument.slice(2).split('=', 2)
    const value = inlineValue ?? argv[index + 1]
    if (inlineValue === undefined) {
      index += 1
    }
    if (key === 'dispatch-run-id') {
      result.dispatchRunId = String(value || '')
    }
    if (key === 'execution-prefix') {
      result.executionPrefix = String(value || '')
    }
  }
  if (!result.allowLive) {
    throw new Error('v3 suite 必须显式提供 --allow-live')
  }
  if (!AUTOMATOR_V3_SAFE_ID.test(result.dispatchRunId)) {
    throw new Error('dispatch-run-id 格式无效')
  }
  if (!AUTOMATOR_V3_SAFE_ID.test(result.executionPrefix)) {
    throw new Error('execution-prefix 格式无效')
  }
  return result
}

async function finalGate(run, reports) {
  const args = [
    finalGateScript,
    `--dispatch-run-id=${run.dispatch_run_id}`,
    `--run-instance-id=${run.run_instance_id}`,
    `--auth-report=${reports.auth.output_directory}/auth-concurrency-report.json`,
    `--cold-start-report=${reports.cold_start.output_directory}/stress-report.json`,
    `--warm-report=${reports.warm.output_directory}/warm-report.json`,
    `--live-report=${reports.live.output_directory}/live-matrix-report.json`,
    `--soak-report=${reports.soak.output_directory}/soak-report.json`
  ]
  const child = await runQaNodeCommand({
    command: process.execPath,
    args,
    cwd: repoRoot,
    timeoutMs: 7 * 60 * 1000,
    maxOutputChars: 32 * 1024 * 1024,
    env: { ...process.env, QA_AUTOMATOR_V3_SUITE: '1' }
  })
  let value = null
  try {
    value = JSON.parse(String(child.stdout || '').trim())
  } catch {
    value = { status: 'blocked', code: 'qa_v3_suite_final_gate_unreadable' }
  }
  return { ...value, exit_code: child.status, stderr_tail: String(child.stderr || '').slice(-4000) }
}

export async function runAutomatorV3Suite({
  dispatchRunId,
  executionPrefix,
  allowLive = false,
  infraOnly = false,
  now = () => new Date()
} = {}) {
  if (!allowLive) {
    throw new Error('v3 suite 必须显式允许 live')
  }
  const lease = acquireQaRunLease({ dispatchRunId, kind: 'automator-v3-suite' })
  const suite = automatorV3SuiteDirectory(dispatchRunId, lease.run_instance_id)
  const run = {
    status: 'running',
    gate: 'automator_v3_suite',
    schema_version: 1,
    dispatch_run_id: dispatchRunId,
    run_instance_id: lease.run_instance_id,
    execution_prefix: executionPrefix,
    execution_mode: infraOnly ? 'infrastructure_only_diagnostic' : 'full_completion_candidate',
    completion_eligible: false,
    output_directory: suite,
    started_at: now().toISOString(),
    current_phase: {
      name: 'preconditions',
      status: 'running',
      started_at: now().toISOString(),
      deadline_at: null
    },
    reports: {}
  }
  const stateFile = path.join(suite, 'suite-state.json')
  const reportFile = path.join(suite, 'suite-report.json')
  fs.mkdirSync(suite, { recursive: true, mode: 0o700 })
  writeAtomic(stateFile, run)
  const writeTerminal = () => {
    writeAtomic(stateFile, run)
    writeAtomic(reportFile, run)
    return run
  }
  const markPhase = (name, status = 'running', deadlineMs = null, extra = {}) => {
    const startedAt = now()
    run.current_phase = {
      name,
      status,
      started_at: startedAt.toISOString(),
      deadline_at:
        Number.isFinite(deadlineMs) && deadlineMs > 0
          ? new Date(startedAt.getTime() + deadlineMs).toISOString()
          : null,
      ...extra
    }
    writeAtomic(stateFile, run)
  }
  const shared = {
    dispatchRunId,
    runInstanceId: lease.run_instance_id,
    runLease: lease,
    executionPrefix,
    suiteBootstrap: null
  }
  let runtimeStarted = false
  let runtimeAttempted = false
  let cleanupFailure = null
  const authRenewalGuard = createAuthRenewalGuard({
    onGenerationTransition: ({ generation, phase }) =>
      rebindNativeQaAuthRuntime({
        expectedGeneration: generation,
        reason: `auth_generation_rebind_${phase || 'phase'}`
      })
  })
  const stopRuntime = async () => {
    if (!runtimeAttempted) {
      return { status: 0, value: { status: 'ready', code: 'qa_runtime_not_started' } }
    }
    const stop = await invokeRuntime('stop', lease)
    if (stop.status !== 0 || stop.value?.code !== 'qa_runtime_stopped') {
      cleanupFailure = {
        code: stop.value?.code || 'qa_v3_suite_cleanup_failed',
        stop
      }
    }
    runtimeStarted = false
    runtimeAttempted = false
    return stop
  }
  const infrastructurePhases = [
    [
      'auth',
      async () => {
        const runtimeProbe = await withTimeout(
          () =>
            createAuthRuntimeProbe({
              dispatchRunId,
              runInstanceId: lease.run_instance_id,
              runLeaseToken: lease.token,
              includeDaily: true
            }),
          AUTH_RUNTIME_PROBE_SETUP_TIMEOUT_MS,
          'qa_auth_runtime_probe_setup_timeout'
        )
        try {
          // The broker matrix is a control-plane assertion, but the first
          // sample must not be allowed to decide account identity before the
          // real daily and QA runtimes have each resolved native WeChat
          // identity and completed a live wx.request. This also covers the
          // normal ticket-refresh window where daily local storage is briefly
          // stale while the managed runtime already uses the broker snapshot.
          const initialRuntimeProbe = await withTimeout(
            () =>
              runtimeProbe.probe({
                expectedGeneration: runtimeProbe.session.auth_generation,
                expectedIdentityHash: runtimeProbe.session.identity_hash
              }),
            AUTH_RUNTIME_PROBE_CALL_TIMEOUT_MS,
            'qa_auth_initial_runtime_probe_timeout'
          )
          if (initialRuntimeProbe.status !== 'passed') {
            return {
              status: 'blocked',
              primary_failure: {
                code: initialRuntimeProbe.code || 'qa_auth_initial_runtime_probe_failed',
                runtime_probe: initialRuntimeProbe
              },
              initial_runtime_probe: initialRuntimeProbe,
              samples: [],
              continuity: { status: 'not_started' }
            }
          }
          const matrix = await runAuthConcurrencyMatrixWithLease({
            ...shared,
            allowLive: true,
            continuity: true,
            continuityProbe: runtimeProbe.probe,
            artifactRunInstanceId: lease.run_instance_id
          })
          matrix.initial_runtime_probe = initialRuntimeProbe
          return matrix
        } finally {
          await runtimeProbe.close()
        }
      }
    ],
    ['cold_start', () => runAutomatorStress(shared)],
    ['warm', () => runAutomatorWarmStability({ ...shared, infrastructureOnly: infraOnly })]
  ]
  try {
    // Static source and catalog gates are deliberately checked before auth.
    // They are read-only and must fail before asking for a QR scan or starting
    // any QA-owned process when the full completion candidate is impossible.
    const catalogPreconditionResult = catalogPrecondition()
    const businessCoveragePreconditionResult = businessCoveragePrecondition()
    run.catalog_precondition = catalogPreconditionResult
    run.business_coverage_precondition = businessCoveragePreconditionResult
    writeAtomic(stateFile, run)
    if (
      !infraOnly &&
      (catalogPreconditionResult.status !== 'ready' ||
        businessCoveragePreconditionResult.status !== 'ready')
    ) {
      run.status = 'blocked'
      const primary =
        catalogPreconditionResult.status !== 'ready'
          ? catalogPreconditionResult
          : businessCoveragePreconditionResult
      run.primary_failure = {
        code: primary.code,
        catalog_precondition: catalogPreconditionResult,
        business_coverage_precondition: businessCoveragePreconditionResult
      }
      run.ended_at = now().toISOString()
      return writeTerminal()
    }

    // Authentication material is checked before any QA-owned DevTools or LAN
    // process is started. Server validation is deliberately not required here:
    // it is established only after bootstrap through the real mini-program
    // home and authenticated wx.request probe.
    const authPrecondition = authMaterialPrecondition()
    run.auth_precondition = authPrecondition
    writeAtomic(stateFile, run)
    if (authPrecondition.status !== 'ready') {
      run.status = 'blocked'
      run.primary_failure = {
        code: authPrecondition.code,
        auth_precondition: authPrecondition
      }
      run.ended_at = now().toISOString()
      return writeTerminal()
    }
    // The auth matrix proves same-account concurrency, so QA must already be
    // running.  Bootstrap is still owned by this suite lease and is cleaned
    // up before any failure is returned.
    const authTicketPrecondition = authPhaseFreshnessPrecondition(
      'auth',
      BOOTSTRAP_PHASE_TIMEOUT_MS + SUITE_PHASE_TIMEOUTS_MS.auth,
      { allowDelegatedDailyRenewal: true }
    )
    run.auth_ticket_precondition = authTicketPrecondition
    writeAtomic(stateFile, run)
    if (authTicketPrecondition.status !== 'ready') {
      run.status = 'blocked'
      run.primary_failure = authTicketPrecondition
      run.ended_at = now().toISOString()
      return writeTerminal()
    }
    markPhase('bootstrap', 'running', BOOTSTRAP_PHASE_TIMEOUT_MS)
    runtimeAttempted = true
    const bootstrap = await invokeRuntime('bootstrap', lease)
    run.bootstrap = bootstrap
    shared.suiteBootstrap = bootstrap
    runtimeStarted = bootstrap.status === 0 && bootstrap.value?.status === 'ready'
    writeAtomic(stateFile, run)
    if (!runtimeStarted) {
      run.status = 'blocked'
      run.primary_failure = {
        code: bootstrap.value?.code || 'qa_v3_suite_bootstrap_blocked',
        bootstrap
      }
      run.ended_at = now().toISOString()
      return writeTerminal()
    }
    for (const [name, execute] of infrastructurePhases) {
      const phaseAuthPrecondition = authPhaseFreshnessPrecondition(
        name,
        SUITE_PHASE_TIMEOUTS_MS[name],
        { allowDelegatedDailyRenewal: true }
      )
      run.phase_auth_preconditions = {
        ...run.phase_auth_preconditions,
        [name]: phaseAuthPrecondition
      }
      writeAtomic(stateFile, run)
      if (phaseAuthPrecondition.status !== 'ready') {
        run.current_phase = {
          name,
          status: 'blocked',
          started_at: now().toISOString(),
          deadline_at: null,
          ended_at: now().toISOString(),
          report_status: 'blocked',
          auth_precondition: phaseAuthPrecondition
        }
        run.status = 'blocked'
        run.primary_failure = phaseAuthPrecondition
        run.ended_at = now().toISOString()
        return writeTerminal()
      }
      markPhase(name, 'running', SUITE_PHASE_TIMEOUTS_MS[name])
      let report
      try {
        report = await withTimeout(
          execute,
          SUITE_PHASE_TIMEOUTS_MS[name],
          `qa_v3_suite_${name}_phase_timeout`
        )
      } catch (error) {
        report = {
          status: 'blocked',
          primary_failure: {
            code: error?.code || `qa_v3_suite_${name}_phase_timeout`,
            timeout_ms: error?.timeoutMs || SUITE_PHASE_TIMEOUTS_MS[name],
            phase: name
          }
        }
      }
      run.reports[name] = report
      run.current_phase = {
        ...run.current_phase,
        status: report.status === 'passed' ? 'passed' : 'blocked',
        ended_at: now().toISOString(),
        report_status: report.status
      }
      writeAtomic(stateFile, run)
      if (report.status !== 'passed') {
        run.status = 'blocked'
        run.primary_failure = report.primary_failure || { code: `qa_v3_suite_${name}_blocked` }
        run.ended_at = now().toISOString()
        return writeTerminal()
      }
    }
    if (infraOnly) {
      const soakAuthPrecondition = authPhaseFreshnessPrecondition(
        'soak',
        SOAK_AUTH_FRESHNESS_WINDOW_MS,
        {
          safetyBufferMs: SUITE_PHASE_AUTH_SAFETY_BUFFER_MS,
          allowDelegatedDailyRenewal: true
        }
      )
      run.phase_auth_preconditions = {
        ...run.phase_auth_preconditions,
        soak: soakAuthPrecondition
      }
      writeAtomic(stateFile, run)
      if (soakAuthPrecondition.status !== 'ready') {
        run.current_phase = {
          name: 'soak',
          status: 'blocked',
          started_at: now().toISOString(),
          deadline_at: null,
          ended_at: now().toISOString(),
          report_status: 'blocked',
          auth_precondition: soakAuthPrecondition
        }
        run.status = 'blocked'
        run.primary_failure = soakAuthPrecondition
        run.ended_at = now().toISOString()
        return writeTerminal()
      }
      markPhase('soak', 'running', SUITE_PHASE_TIMEOUTS_MS.soak)
      const soakReport = await runAutomatorSoak({
        ...shared,
        authHealthCheck: () => authRenewalGuard.check({ phase: 'soak' })
      })
      run.reports.soak = soakReport
      run.current_phase = {
        ...run.current_phase,
        status: soakReport.status === 'passed' ? 'passed' : 'blocked',
        ended_at: now().toISOString(),
        report_status: soakReport.status
      }
      writeAtomic(stateFile, run)
      if (soakReport.status !== 'passed') {
        run.status = 'blocked'
        run.primary_failure = soakReport.primary_failure || { code: 'qa_v3_suite_soak_blocked' }
        run.ended_at = now().toISOString()
        return writeTerminal()
      }
      run.current_phase = {
        ...run.current_phase,
        name: 'complete',
        status: 'passed',
        ended_at: now().toISOString()
      }
      run.status = 'diagnostic_passed'
      run.diagnostic_note =
        '基础设施证据已完成，但未执行业务覆盖、live matrix 或最终 Completion Gate；不得据此宣称拉起即用。'
      run.ended_at = now().toISOString()
      return writeTerminal()
    }
    // Full completion runs validate the entire live catalog before starting
    // the long soak. A missing real fixture or a business leaf blocker must
    // stop early instead of consuming hours of cold-start evidence first.
    const liveAuthPrecondition = authPhaseFreshnessPrecondition(
      'live',
      SUITE_PHASE_TIMEOUTS_MS.live,
      { allowDelegatedDailyRenewal: true }
    )
    run.phase_auth_preconditions = {
      ...run.phase_auth_preconditions,
      live: liveAuthPrecondition
    }
    writeAtomic(stateFile, run)
    if (liveAuthPrecondition.status !== 'ready') {
      run.current_phase = {
        name: 'live',
        status: 'blocked',
        started_at: now().toISOString(),
        deadline_at: null,
        ended_at: now().toISOString(),
        report_status: 'blocked',
        auth_precondition: liveAuthPrecondition
      }
      run.status = 'blocked'
      run.primary_failure = liveAuthPrecondition
      run.ended_at = now().toISOString()
      return writeTerminal()
    }
    markPhase('live', 'running', SUITE_PHASE_TIMEOUTS_MS.live)
    let liveReport
    try {
      liveReport = await withTimeout(
        () =>
          runLiveMatrix({
            ...shared,
            authHealthCheck: () => authRenewalGuard.check({ phase: 'live' })
          }),
        SUITE_PHASE_TIMEOUTS_MS.live,
        'qa_v3_suite_live_phase_timeout'
      )
    } catch (error) {
      liveReport = {
        status: 'blocked',
        primary_failure: {
          code: error?.code || 'qa_v3_suite_live_phase_timeout',
          timeout_ms: error?.timeoutMs || SUITE_PHASE_TIMEOUTS_MS.live,
          phase: 'live'
        }
      }
    }
    run.reports.live = liveReport
    writeAtomic(stateFile, run)
    if (liveReport.status !== 'passed') {
      run.status = 'blocked'
      run.primary_failure = liveReport.primary_failure || { code: 'qa_v3_suite_live_blocked' }
      run.ended_at = now().toISOString()
      return writeTerminal()
    }
    const soakAuthPrecondition = authPhaseFreshnessPrecondition(
      'soak',
      SOAK_AUTH_FRESHNESS_WINDOW_MS,
      {
        safetyBufferMs: SUITE_PHASE_AUTH_SAFETY_BUFFER_MS,
        allowDelegatedDailyRenewal: true
      }
    )
    run.phase_auth_preconditions = {
      ...run.phase_auth_preconditions,
      soak: soakAuthPrecondition
    }
    writeAtomic(stateFile, run)
    if (soakAuthPrecondition.status !== 'ready') {
      run.current_phase = {
        name: 'soak',
        status: 'blocked',
        started_at: now().toISOString(),
        deadline_at: null,
        ended_at: now().toISOString(),
        report_status: 'blocked',
        auth_precondition: soakAuthPrecondition
      }
      run.status = 'blocked'
      run.primary_failure = soakAuthPrecondition
      run.ended_at = now().toISOString()
      return writeTerminal()
    }
    markPhase('soak', 'running', SUITE_PHASE_TIMEOUTS_MS.soak)
    const soakReport = await runAutomatorSoak({
      ...shared,
      authHealthCheck: () => authRenewalGuard.check({ phase: 'soak' })
    })
    run.reports.soak = soakReport
    run.current_phase = {
      ...run.current_phase,
      status: soakReport.status === 'passed' ? 'passed' : 'blocked',
      ended_at: now().toISOString(),
      report_status: soakReport.status
    }
    writeAtomic(stateFile, run)
    if (soakReport.status !== 'passed') {
      run.status = 'blocked'
      run.primary_failure = soakReport.primary_failure || { code: 'qa_v3_suite_soak_blocked' }
      run.ended_at = now().toISOString()
      return writeTerminal()
    }
    run.final_gate = await finalGate(run, run.reports)
    run.status =
      run.final_gate.status === 'passed' && run.final_gate.exit_code === 0 ? 'passed' : 'blocked'
    if (run.status !== 'passed') {
      run.primary_failure = run.final_gate.validation?.errors?.[0] || {
        code: 'qa_v3_suite_final_gate_blocked'
      }
    }
    run.ended_at = now().toISOString()
    return writeTerminal()
  } catch (error) {
    run.current_phase = {
      ...run.current_phase,
      status: 'blocked',
      ended_at: now().toISOString(),
      error_code: error?.code || 'qa_v3_suite_phase_threw'
    }
    run.status = 'blocked'
    run.primary_failure = {
      code: error?.code || 'qa_v3_suite_phase_threw',
      message: error?.message || String(error),
      details: error?.details || null
    }
    run.ended_at = now().toISOString()
    return writeTerminal()
  } finally {
    await stopRuntime()
    if (cleanupFailure && run.status === 'passed') {
      run.status = 'blocked'
      run.primary_failure = cleanupFailure
      run.ended_at = now().toISOString()
      writeTerminal()
    } else if (cleanupFailure) {
      run.cleanup_failure = cleanupFailure
      writeTerminal()
    }
    lease.release()
  }
}

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  try {
    const report = await runAutomatorV3Suite(parseArgs())
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = ['passed', 'diagnostic_passed'].includes(report.status) ? 0 : 1
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ status: 'blocked', code: 'qa_v3_suite_configuration_invalid', message: error.message }, null, 2)}\n`
    )
    process.exitCode = 1
  }
}
