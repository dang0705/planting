import net from 'node:net'
import { spawnSync } from 'node:child_process'
import {
  inspectDevToolsRuntime,
  normalizeRuntimePath,
  recoverVerifiedTargetDevTools,
  enableAutomatorForVerifiedTargetDevTools
} from './devtools-runtime.mjs'
import {
  captureRuntimeEvidence,
  isRecoverableRuntimeFailure,
  PREFLIGHT_CAPTURE_TIMEOUT_MS,
  PREFLIGHT_SCREENSHOT_TIMEOUT_MS,
  probeWxRequest,
  withPreflightDeadline
} from './qa-preflight-runtime.mjs'

export { probeWxRequest } from './qa-preflight-runtime.mjs'
export { extractLeafReport } from './qa-leaf-report.mjs'
import { classifyLeafReport, extractLeafReport } from './qa-leaf-report.mjs'

function now() {
  return new Date().toISOString()
}

function failure(code, message, details = {}) {
  return { status: 'failed_environment', code, message, details }
}

function connectPort(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const settle = value => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(2500)
    socket.once('connect', () => settle(true))
    socket.once('error', () => settle(false))
    socket.once('timeout', () => settle(false))
  })
}

function lanFlowRunning() {
  const processList = spawnSync('ps', ['-ax', '-o', 'command='], { encoding: 'utf8' })
  const text = `${processList.stdout ?? ''}\n${processList.stderr ?? ''}`
  return /dev:mp-weixin:local-functions:lan/.test(text)
}

function emptyReport({ projectPath, wsEndpoint, wxRequestUrl, observedProjectPath }) {
  return {
    status: 'running',
    gate: 'qa_preflight',
    started_at: now(),
    projectPath,
    observed_project_path: 'unavailable',
    caller_observed_project_path: observedProjectPath ? 'ignored_untrusted_input' : 'not_provided',
    wsEndpoint,
    wx_request_url: wxRequestUrl || 'unavailable',
    checks: {},
    evidence_paths: [],
    failures: [],
    not_verified: [],
    targeted_restart: { attempted: false, reason: 'not_needed' }
  }
}

function probeSummary(report, extra = {}) {
  return {
    page_data: report.checks.page_data ?? { passed: false },
    screenshot: report.checks.screenshot ?? { passed: false },
    wx_request: report.checks.wx_request ?? { passed: false },
    rpc_steps: report.checks.rpc_steps ?? {},
    ...extra
  }
}

function addFailure(report, item) {
  report.failures.push(item)
  report.status = 'failed_environment'
  report.completed_at = now()
  return report
}

function preflightChecks({ report, projectPath, wsPort, runtimeInspector, lanFlowProbe, runtime }) {
  const inspectedRuntime = runtime ?? runtimeInspector({ expectedProjectPath: projectPath, wsPort })
  report.devtools_runtime = inspectedRuntime
  report.observed_project_path = inspectedRuntime.observed_project_path ?? 'unavailable'
  report.checks.project_identity = {
    expected: projectPath,
    observed: report.observed_project_path,
    main_devtools_pid: inspectedRuntime.main_devtools_pid ?? 'unavailable',
    automation_listener_pid:
      inspectedRuntime.automation_listener_pid ?? inspectedRuntime.port_owner_pid ?? 'unavailable',
    port_owner_pid: inspectedRuntime.port_owner_pid ?? 'unavailable',
    automator_port: inspectedRuntime.automator_port ?? wsPort,
    control_port: inspectedRuntime.control_port ?? 'unavailable',
    control_port_source: inspectedRuntime.control_port_source ?? 'unavailable',
    evidence: inspectedRuntime.project_evidence ?? [],
    identity_source: inspectedRuntime.project_identity_source ?? 'unavailable',
    evidence_records: inspectedRuntime.project_evidence_records ?? [],
    session_log_evidence: inspectedRuntime.session_log_evidence ?? [],
    passed: inspectedRuntime.status === 'verified' && inspectedRuntime.project_identity_verified === true
  }
  if (!report.checks.project_identity.passed) {
    return failure(
      inspectedRuntime.status === 'wrong_project' ? 'project_path_mismatch' : 'project_identity_unverified',
      `target project identity must be proven from the ${wsPort} owning runtime before QA`,
      report.checks.project_identity
    )
  }
  const lanReady = lanFlowProbe()
  report.checks.lan = { command: 'dev:mp-weixin:local-functions:lan', passed: lanReady }
  if (!lanReady) {
    return failure('lan_flow_not_running', 'complete LAN local-functions flow is not running')
  }
  report.checks.ws = { port: wsPort, passed: false }
  return null
}

function canTargetedRestart({ report, allowTargetedRestart }) {
  return (
    allowTargetedRestart === true &&
    report.checks.project_identity?.passed === true &&
    report.devtools_runtime?.status === 'verified' &&
    report.targeted_restart?.attempted !== true
  )
}

async function runTargetedRecovery({
  report,
  projectPath,
  wsPort,
  runtimeInspector,
  recoveryExecutor,
  reason
}) {
  const before = report.devtools_runtime
  const recovery = await recoveryExecutor({
    projectPath,
    wsPort,
    verifiedRuntime: before,
    runtimeInspector
  })
  report.targeted_restart = {
    attempted: true,
    reason,
    before: recovery.before ?? before,
    recovery_invocation: recovery.invocations ?? [],
    recovery
  }
  if (recovery.status !== 'recovered') {
    return failure(
      recovery.code ?? 'devtools_automator_blocker',
      'repository-owned target recovery was not proven safe',
      { recovery }
    )
  }
  const recoveryActions = new Set((recovery.invocations ?? []).map(item => item.action))
  if (!['close', 'open', 'auto'].every(action => recoveryActions.has(action))) {
    return failure(
      'devtools_automator_blocker',
      'target recovery did not provide a complete audited cycle',
      { recovery }
    )
  }
  const after = runtimeInspector({ expectedProjectPath: projectPath, wsPort })
  report.targeted_restart.after = after
  report.devtools_runtime = after
  report.observed_project_path = after.observed_project_path ?? 'unavailable'
  if (after.status !== 'verified' || after.project_identity_verified !== true) {
    return failure(
      'targeted_restart_identity_unverified',
      'target recovery did not re-prove project identity',
      { before, after }
    )
  }
  const beforeListener = Number(before.automation_listener_pid ?? before.port_owner_pid)
  const afterListener = Number(after.automation_listener_pid ?? after.port_owner_pid)
  if (
    Number(before.main_devtools_pid) === Number(after.main_devtools_pid) &&
    beforeListener === afterListener
  ) {
    return failure(
      'devtools_automator_blocker',
      'target project recovery did not prove a restarted runtime',
      { before, after, recovery }
    )
  }
  report.checks.project_identity_after_recovery = {
    passed: true,
    main_devtools_pid: after.main_devtools_pid,
    automation_listener_pid: after.automation_listener_pid ?? after.port_owner_pid,
    port_owner_pid: after.port_owner_pid,
    control_port: after.control_port,
    observed: after.observed_project_path,
    identity_source: after.project_identity_source ?? 'unavailable',
    evidence_records: after.project_evidence_records ?? []
  }
  return null
}

async function captureWithinDeadline({
  report,
  runtimeCapture,
  captureOptions,
  preflightTimeoutMs
}) {
  return withPreflightDeadline({
    report,
    step: 'overall_capture',
    timeoutMs: preflightTimeoutMs,
    action: () => runtimeCapture(captureOptions)
  })
}

export async function runQaPreflight({
  projectPath,
  observedProjectPath,
  wsPort = 9420,
  wxRequestUrl = '',
  screenshotPath,
  allowTargetedRestart = false,
  preflightTimeoutMs = PREFLIGHT_CAPTURE_TIMEOUT_MS,
  runtimeInspector = inspectDevToolsRuntime,
  recoveryExecutor = recoverVerifiedTargetDevTools,
  bootstrapExecutor = enableAutomatorForVerifiedTargetDevTools,
  lanFlowProbe = lanFlowRunning,
  portProbe = connectPort,
  runtimeCapture = captureRuntimeEvidence
}) {
  const resolvedProjectPath = normalizeRuntimePath(projectPath)
  const wsEndpoint = `ws://127.0.0.1:${wsPort}`
  const report = emptyReport({
    projectPath: resolvedProjectPath,
    observedProjectPath,
    wsEndpoint,
    wxRequestUrl
  })
  let runtime = runtimeInspector({ expectedProjectPath: resolvedProjectPath, wsPort })
  if (runtime.status === 'unavailable' && (runtime.automator_listener_pids ?? []).length === 0) {
    const bootstrap = await bootstrapExecutor({
      projectPath: resolvedProjectPath,
      wsPort,
      runtimeInspector
    })
    report.automator_bootstrap = {
      attempted: true,
      status: bootstrap.status,
      invocations: bootstrap.invocations ?? [],
      reason: bootstrap.reason ?? null
    }
    if (bootstrap.status !== 'enabled') {
      return addFailure(
        report,
        failure(
          bootstrap.code ?? 'devtools_automator_blocker',
          'target DevTools could not safely enable the Automator port',
          { bootstrap }
        )
      )
    }
    runtime = runtimeInspector({ expectedProjectPath: resolvedProjectPath, wsPort })
  } else {
    report.automator_bootstrap = { attempted: false, status: 'not_needed', invocations: [] }
  }
  const earlyFailure = preflightChecks({
    report,
    projectPath: resolvedProjectPath,
    wsPort,
    runtimeInspector,
    lanFlowProbe,
    runtime
  })
  if (earlyFailure) {
    return addFailure(report, earlyFailure)
  }
  if (!(await portProbe(wsPort))) {
    return addFailure(
      report,
      failure('automator_port_unavailable', `${wsPort} is not listening on ${wsEndpoint}`)
    )
  }
  const captureOptions = {
    report,
    wsEndpoint,
    screenshotPath,
    wxRequestUrl,
    screenshotTimeoutMs: PREFLIGHT_SCREENSHOT_TIMEOUT_MS
  }
  try {
    await captureWithinDeadline({ report, runtimeCapture, captureOptions, preflightTimeoutMs })
  } catch (error) {
    const failureCode =
      error.code === 'preflight_overall_capture_failed'
        ? 'runtime_preflight_failed'
        : (error.code ?? 'runtime_preflight_failed')
    if (
      !isRecoverableRuntimeFailure(error) ||
      !canTargetedRestart({ report, allowTargetedRestart })
    ) {
      return addFailure(report, failure(failureCode, error.message))
    }
    report.targeted_restart.pre_recovery_probes = probeSummary(report, {
      code: failureCode,
      error: error.message
    })
    const recoveryFailure = await runTargetedRecovery({
      report,
      projectPath: resolvedProjectPath,
      wsPort,
      runtimeInspector,
      recoveryExecutor,
      reason: error.code
    })
    if (recoveryFailure) {
      return addFailure(report, recoveryFailure)
    }
    try {
      const postRecoveryProbes = await captureWithinDeadline({
        report,
        runtimeCapture,
        captureOptions,
        preflightTimeoutMs
      })
      report.targeted_restart.post_recovery_probes = postRecoveryProbes ?? probeSummary(report)
    } catch (retryError) {
      report.targeted_restart.post_recovery_probes = probeSummary(report, {
        code:
          retryError.code === 'preflight_overall_capture_failed'
            ? 'runtime_preflight_failed'
            : (retryError.code ?? 'runtime_preflight_failed'),
        error: retryError.message
      })
      return addFailure(
        report,
        failure('runtime_preflight_unavailable_after_targeted_restart', retryError.message)
      )
    }
  }
  report.status = 'passed'
  report.completed_at = now()
  return report
}

export function classifyQaFailure({
  exitCode,
  stdout = '',
  stderr = '',
  forcedKind = '',
  leafReport = extractLeafReport({ stdout, stderr })
}) {
  if (['failed_environment', 'failed_product', 'failed_script', 'aborted'].includes(forcedKind)) {
    return forcedKind
  }
  const structuredKind = classifyLeafReport(leafReport)
  if (structuredKind) {
    return structuredKind
  }
  const output = `${stdout}\n${stderr}`.toLowerCase()
  if (/failed_product|product_blocker|assertionerror|assert\.?(?:equal|ok)/.test(output)) {
    return 'failed_product'
  }
  if (/script hash mismatch|syntaxerror|module_not_found|cannot find module/.test(output)) {
    return 'failed_script'
  }
  return exitCode === null ? 'aborted' : 'failed_environment'
}
