import { spawnSync } from 'node:child_process'
import { listenerPids, normalizeRuntimePath } from './devtools-process-topology.mjs'
import { inspectDevToolsRuntime, runtimeSnapshot } from './devtools-runtime-inspection.mjs'
import {
  invokeTargetControl,
  requestDevToolsControl,
  validVerifiedRuntime
} from './devtools-runtime-control.mjs'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const DEFAULT_CLOSE_SETTLE_ATTEMPTS = 40
const DEFAULT_CLOSE_SETTLE_DELAY_MS = 500
const DEFAULT_OPEN_SETTLE_DELAY_MS = 5_000
// The official /auto endpoint can return while the renderer is still restoring
// the page bridge.  A verified 9420 listener is therefore not yet equivalent to
// a renderer that can answer App.captureScreenshot.  Keep this settle window in
// the recovery primitive so every caller gets the same readiness boundary.
const DEFAULT_POST_AUTO_SETTLE_DELAY_MS = 10_000

async function waitForAutomatorListenerToSettle({
  wsPort,
  oldListenerPids,
  commandRunner,
  attempts = DEFAULT_CLOSE_SETTLE_ATTEMPTS,
  delayMs = DEFAULT_CLOSE_SETTLE_DELAY_MS,
  waitForObservation = wait
}) {
  const expectedOldPids = new Set(oldListenerPids.map(Number).filter(Number.isInteger))
  const observations = []
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const activeListenerPids = listenerPids(wsPort, commandRunner)
    const oldListenerPresent = activeListenerPids.some(pid => expectedOldPids.has(pid))
    observations.push({
      attempt,
      listener_pids: activeListenerPids,
      old_listener_present: oldListenerPresent
    })
    if (!oldListenerPresent) {
      return {
        settled: true,
        budget_attempts: attempts,
        budget_delay_ms: delayMs,
        attempts_used: attempt,
        old_listener_pids: [...expectedOldPids],
        observations
      }
    }
    if (attempt < attempts && delayMs > 0) {
      await waitForObservation(delayMs)
    }
  }
  return {
    settled: false,
    budget_attempts: attempts,
    budget_delay_ms: delayMs,
    attempts_used: attempts,
    old_listener_pids: [...expectedOldPids],
    observations
  }
}

export async function recoverVerifiedTargetDevTools({
  projectPath,
  wsPort = 9420,
  verifiedRuntime,
  runtimeInspector = inspectDevToolsRuntime,
  commandRunner = spawnSync,
  sessionLogReader,
  controlRequest = requestDevToolsControl,
  observationAttempts = 40,
  observationDelayMs = 500,
  waitForObservation = wait,
  closeSettleAttempts = DEFAULT_CLOSE_SETTLE_ATTEMPTS,
  closeSettleDelayMs = DEFAULT_CLOSE_SETTLE_DELAY_MS,
  openSettleDelayMs = DEFAULT_OPEN_SETTLE_DELAY_MS,
  postAutoSettleDelayMs = DEFAULT_POST_AUTO_SETTLE_DELAY_MS
} = {}) {
  const expected = normalizeRuntimePath(projectPath)
  const before = runtimeSnapshot(verifiedRuntime)
  if (!validVerifiedRuntime(verifiedRuntime, expected, wsPort)) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_project_runtime_not_safely_preverified',
      before,
      invocations: []
    }
  }
  const invocations = []
  const close = await invokeTargetControl({
    action: 'close',
    projectPath: expected,
    controlPort: verifiedRuntime.control_port,
    wsPort,
    controlRequest
  })
  invocations.push(close)
  if (close.status_code !== 200) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_project_recovery_command_failed',
      before,
      invocations
    }
  }

  const oldListenerPids = [
    ...(verifiedRuntime?.automator_listener_pids ?? []),
    verifiedRuntime?.automation_listener_pid,
    verifiedRuntime?.port_owner_pid
  ]
    .map(Number)
    .filter(Number.isInteger)
  const closeSettleEvidence = await waitForAutomatorListenerToSettle({
    wsPort,
    oldListenerPids,
    commandRunner,
    attempts: closeSettleAttempts,
    delayMs: closeSettleDelayMs,
    waitForObservation
  })
  if (!closeSettleEvidence.settled) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_close_did_not_settle_within_window',
      before,
      invocations,
      close_settle_evidence: closeSettleEvidence
    }
  }

  for (const action of ['open', 'auto']) {
    const result = await invokeTargetControl({
      action,
      projectPath: expected,
      controlPort: verifiedRuntime.control_port,
      wsPort,
      controlRequest
    })
    invocations.push(result)
    if (result.status_code !== 200) {
      return {
        status: 'failed_environment',
        code: 'devtools_automator_blocker',
        reason: 'target_project_recovery_command_failed',
        before,
        invocations
      }
    }
    if (action === 'open' && openSettleDelayMs > 0) {
      await waitForObservation(openSettleDelayMs)
    }
    if (action === 'auto' && postAutoSettleDelayMs > 0) {
      await waitForObservation(postAutoSettleDelayMs)
    }
  }
  const observations = []
  let stable = 0
  let sawVerifiedObservation = false
  let sawUnverifiedAfterVerified = false
  for (let attempt = 1; attempt <= observationAttempts; attempt += 1) {
    const after = await runtimeInspector({
      expectedProjectPath: expected,
      wsPort,
      commandRunner,
      sessionLogReader
    })
    observations.push(runtimeSnapshot(after))
    const verified = validVerifiedRuntime(after, expected, wsPort)
    if (!verified && sawVerifiedObservation) {
      sawUnverifiedAfterVerified = true
    }
    sawVerifiedObservation = sawVerifiedObservation || verified
    stable = verified ? stable + 1 : 0
    if (stable === 2) {
      return {
        status: 'recovered',
        recovery: 'verified_target_project_close_open_auto_once',
        before,
        after: runtimeSnapshot(after),
        invocations,
        close_settle_evidence: closeSettleEvidence,
        observation_attempts: observations
      }
    }
    if (attempt < observationAttempts && observationDelayMs > 0) {
      await waitForObservation(observationDelayMs)
    }
  }
  return {
    status: 'failed_environment',
    code: 'devtools_automator_blocker',
    reason: sawUnverifiedAfterVerified
      ? 'target_runtime_not_reverified_after_recovery'
      : 'target_runtime_not_stably_reverified_after_recovery',
    before,
    invocations,
    close_settle_evidence: closeSettleEvidence,
    observation_attempts: observations
  }
}
