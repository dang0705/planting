import { spawnSync } from 'node:child_process'
import {
  lacksAutomatorListenerForTwoObservations,
  runtimeEvidence,
  runtimeFailureReason,
  waitForStableNewRuntime
} from './devtools-cli-runtime-observations.mjs'

export const DEVTOOLS_CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

const CLI_FALLBACK_REASONS = new Set([
  'target_runtime_not_reverified_after_recovery',
  'target_runtime_not_stably_restarted'
])
const DEFAULT_CLI_TIMEOUT_MS = 20_000
const DEFAULT_EXIT_ATTEMPTS = 40
const DEFAULT_EXIT_DELAY_MS = 500
const DEFAULT_POST_OPEN_ATTEMPTS = 40
const DEFAULT_POST_OPEN_DELAY_MS = 500
const DEFAULT_RUNTIME_ATTEMPTS = 40
const DEFAULT_RUNTIME_DELAY_MS = 500

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0
}

function commandEvidence(cliPath, args, result = {}, error = null) {
  const timedOut = result?.error?.code === 'ETIMEDOUT' || error?.code === 'ETIMEDOUT'
  return {
    executable: cliPath,
    args,
    status: result?.status ?? null,
    signal: result?.signal ?? null,
    timed_out: timedOut,
    stdout: String(result?.stdout ?? '').slice(0, 1000),
    stderr: String(result?.stderr ?? result?.error?.message ?? error?.message ?? '').slice(0, 1000)
  }
}

function invokeCli({ cliRunner, cliPath, args, timeoutMs }) {
  try {
    return commandEvidence(
      cliPath,
      args,
      cliRunner(cliPath, args, { encoding: 'utf8', timeout: timeoutMs })
    )
  } catch (error) {
    return commandEvidence(cliPath, args, {}, error)
  }
}

function collectOldListenerPids({ verifiedRuntime, wsPort, listenerPids }) {
  const inspected = listenerPids(wsPort)
  const recorded = [
    ...(verifiedRuntime?.automator_listener_pids ?? []),
    verifiedRuntime?.automation_listener_pid,
    verifiedRuntime?.port_owner_pid
  ]
  return [...new Set([...inspected, ...recorded].map(Number).filter(positiveInteger))]
}

async function waitForPreviousRuntimeExit({
  oldMainPid,
  oldListenerPids,
  wsPort,
  isProcessAlive,
  listenerPids,
  attempts,
  delayMs,
  waitForObservation
}) {
  const observations = []
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let oldMainAlive
    let listeners
    try {
      oldMainAlive = isProcessAlive(oldMainPid)
      listeners = listenerPids(wsPort)
    } catch (error) {
      return {
        settled: false,
        reason: 'target_cli_quit_exit_unverifiable',
        observations,
        probe_error: String(error?.message || error)
      }
    }
    const oldListenersRemaining = listeners.filter(pid => oldListenerPids.includes(Number(pid)))
    observations.push({
      attempt,
      old_main_pid: oldMainPid,
      old_main_alive: oldMainAlive === true,
      observed_listener_pids: listeners,
      old_listener_pids_remaining: oldListenersRemaining
    })
    if (oldMainAlive !== true && oldListenersRemaining.length === 0) {
      return { settled: true, observations }
    }
    if (attempt < attempts && delayMs > 0) {
      await waitForObservation(delayMs)
    }
  }
  return { settled: false, reason: 'target_cli_quit_did_not_settle_within_window', observations }
}

export function isVerifiedPostOpenTargetRuntime({
  runtime,
  projectPath,
  wsPort,
  verifiedRuntime
} = {}) {
  const currentSession = runtime?.session_log_evidence
  return (
    runtime?.status === 'target_ready' &&
    runtime?.project_identity_verified === true &&
    runtime?.observed_project_path === projectPath &&
    positiveInteger(runtime?.main_devtools_pid) &&
    Number(runtime.main_devtools_pid) !== Number(verifiedRuntime?.main_devtools_pid) &&
    positiveInteger(runtime?.control_port) &&
    Number(runtime.control_port) !== Number(wsPort) &&
    runtime?.control_port_verified === true &&
    currentSession?.status === 'bootstrap_verified' &&
    typeof currentSession.session_id === 'string' &&
    currentSession.session_id.length > 0
  )
}

async function waitForPostOpenTargetRuntime({
  postOpenRuntimeInspector,
  isPostOpenRuntime,
  projectPath,
  wsPort,
  attempts,
  delayMs,
  waitForObservation
}) {
  const observations = []
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let runtime
    try {
      runtime = await postOpenRuntimeInspector({ expectedProjectPath: projectPath, wsPort })
    } catch (error) {
      observations.push({
        attempt,
        status: 'unavailable',
        target_runtime_verified: false,
        inspection_error: String(error?.message || error)
      })
      runtime = null
    }
    const verified = isPostOpenRuntime(runtime)
    observations.push({ attempt, ...runtimeEvidence(runtime, verified, verified) })
    if (verified) {
      return { verified: true, runtime, observations }
    }
    if (attempt < attempts && delayMs > 0) {
      await waitForObservation(delayMs)
    }
  }
  return { verified: false, observations }
}

async function invokePostOpenAuto({ postOpenAuto, projectPath, controlPort, wsPort }) {
  try {
    return await postOpenAuto({ projectPath, controlPort, wsPort })
  } catch (error) {
    return {
      action: 'auto',
      control_port: Number(controlPort),
      project_path: projectPath,
      automator_port: Number(wsPort),
      status_code: null,
      body_excerpt: String(error?.message || error)
    }
  }
}

export function canUseDevToolsCliFallback({
  sameProcessRecovery,
  verifiedRuntime,
  isVerifiedRuntime
}) {
  return (
    sameProcessRecovery?.status === 'failed_environment' &&
    CLI_FALLBACK_REASONS.has(sameProcessRecovery.reason) &&
    isVerifiedRuntime(verifiedRuntime) === true
  )
}

export async function recoverVerifiedTargetWithDevToolsCli({
  sameProcessRecovery,
  projectPath,
  wsPort,
  verifiedRuntime,
  isVerifiedRuntime,
  isNewRuntime,
  runtimeInspector,
  listenerPids,
  isProcessAlive,
  cliRunner = spawnSync,
  cliPath = DEVTOOLS_CLI_PATH,
  cliTimeoutMs = DEFAULT_CLI_TIMEOUT_MS,
  exitAttempts = DEFAULT_EXIT_ATTEMPTS,
  exitDelayMs = DEFAULT_EXIT_DELAY_MS,
  postOpenRuntimeInspector,
  isPostOpenRuntime = runtime =>
    isVerifiedPostOpenTargetRuntime({ runtime, projectPath, wsPort, verifiedRuntime }),
  postOpenAttempts = DEFAULT_POST_OPEN_ATTEMPTS,
  postOpenDelayMs = DEFAULT_POST_OPEN_DELAY_MS,
  postOpenAuto,
  runtimeAttempts = DEFAULT_RUNTIME_ATTEMPTS,
  runtimeDelayMs = DEFAULT_RUNTIME_DELAY_MS,
  waitForObservation = wait
} = {}) {
  if (!canUseDevToolsCliFallback({ sameProcessRecovery, verifiedRuntime, isVerifiedRuntime })) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_cli_fallback_preconditions_not_met',
      same_process_recovery: sameProcessRecovery ?? null,
      cli_invocations: []
    }
  }
  const controlPort = Number(verifiedRuntime.control_port)
  const oldMainPid = Number(verifiedRuntime.main_devtools_pid)
  if (!positiveInteger(controlPort) || !positiveInteger(oldMainPid)) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_cli_fallback_preconditions_not_met',
      same_process_recovery: sameProcessRecovery,
      cli_invocations: []
    }
  }

  const oldListenerPids = collectOldListenerPids({ verifiedRuntime, wsPort, listenerPids })
  const cliInvocations = []
  const quit = invokeCli({
    cliRunner,
    cliPath,
    args: ['quit', '--port', String(controlPort)],
    timeoutMs: cliTimeoutMs
  })
  cliInvocations.push(quit)
  if (quit.status !== 0 || quit.timed_out) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_cli_quit_failed',
      same_process_recovery: sameProcessRecovery,
      cli_invocations: cliInvocations
    }
  }

  const exitEvidence = await waitForPreviousRuntimeExit({
    oldMainPid,
    oldListenerPids,
    wsPort,
    isProcessAlive,
    listenerPids,
    attempts: exitAttempts,
    delayMs: exitDelayMs,
    waitForObservation
  })
  if (!exitEvidence.settled) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: exitEvidence.reason,
      same_process_recovery: sameProcessRecovery,
      cli_invocations: cliInvocations,
      old_runtime_exit_evidence: exitEvidence
    }
  }

  const open = invokeCli({
    cliRunner,
    cliPath,
    args: ['open', '--project', projectPath, '--port', String(controlPort)],
    timeoutMs: cliTimeoutMs
  })
  cliInvocations.push(open)
  if (open.status !== 0 || open.timed_out) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_cli_open_failed',
      same_process_recovery: sameProcessRecovery,
      cli_invocations: cliInvocations,
      old_runtime_exit_evidence: exitEvidence
    }
  }

  const postOpenEvidence = await waitForPostOpenTargetRuntime({
    postOpenRuntimeInspector,
    isPostOpenRuntime,
    projectPath,
    wsPort,
    attempts: postOpenAttempts,
    delayMs: postOpenDelayMs,
    waitForObservation
  })
  if (!postOpenEvidence.verified) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_post_open_new_session_not_verified',
      same_process_recovery: sameProcessRecovery,
      cli_invocations: cliInvocations,
      old_runtime_exit_evidence: exitEvidence,
      post_open_observation_attempts: postOpenEvidence.observations,
      post_open_auto_invocations: []
    }
  }

  const postOpenAutoInvocations = [
    await invokePostOpenAuto({
      postOpenAuto,
      projectPath,
      controlPort: postOpenEvidence.runtime.control_port,
      wsPort
    })
  ]
  if (postOpenAutoInvocations[0].status_code !== 200) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_post_open_auto_failed',
      same_process_recovery: sameProcessRecovery,
      cli_invocations: cliInvocations,
      old_runtime_exit_evidence: exitEvidence,
      post_open_observation_attempts: postOpenEvidence.observations,
      post_open_auto_invocations: postOpenAutoInvocations
    }
  }

  const firstAutoProof = await waitForStableNewRuntime({
    runtimeInspector,
    isVerifiedRuntime,
    isNewRuntime,
    projectPath,
    wsPort,
    attempts: runtimeAttempts,
    delayMs: runtimeDelayMs,
    waitForObservation
  })
  const recoveryEvidence = {
    same_process_recovery: sameProcessRecovery,
    cli_invocations: cliInvocations,
    old_runtime_exit_evidence: exitEvidence,
    post_open_observation_attempts: postOpenEvidence.observations,
    post_open_auto_invocations: postOpenAutoInvocations,
    observation_attempts: firstAutoProof.observations
  }
  if (firstAutoProof.stable) {
    return {
      status: 'recovered',
      recovery: 'official_cli_quit_open_then_verified_target_scoped_auto',
      before: runtimeEvidence(verifiedRuntime, true, false),
      after: runtimeEvidence(firstAutoProof.runtime, true, true),
      post_open_retry_observation_attempts: [],
      post_open_auto_retry_invocations: [],
      ...recoveryEvidence
    }
  }
  if (!lacksAutomatorListenerForTwoObservations(firstAutoProof.observations)) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: runtimeFailureReason(firstAutoProof.observations),
      post_open_retry_observation_attempts: [],
      post_open_auto_retry_invocations: [],
      ...recoveryEvidence
    }
  }

  const samePostOpenRuntime = runtime =>
    isPostOpenRuntime(runtime) &&
    Number(runtime?.main_devtools_pid) === Number(postOpenEvidence.runtime?.main_devtools_pid) &&
    Number(runtime?.control_port) === Number(postOpenEvidence.runtime?.control_port)
  const retryPostOpenEvidence = await waitForPostOpenTargetRuntime({
    postOpenRuntimeInspector,
    isPostOpenRuntime: samePostOpenRuntime,
    projectPath,
    wsPort,
    attempts: postOpenAttempts,
    delayMs: postOpenDelayMs,
    waitForObservation
  })
  if (!retryPostOpenEvidence.verified) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_post_open_retry_same_session_not_verified',
      post_open_retry_observation_attempts: retryPostOpenEvidence.observations,
      post_open_auto_retry_invocations: [],
      ...recoveryEvidence
    }
  }

  const postOpenAutoRetryInvocations = [
    await invokePostOpenAuto({
      postOpenAuto,
      projectPath,
      controlPort: retryPostOpenEvidence.runtime.control_port,
      wsPort
    })
  ]
  if (postOpenAutoRetryInvocations[0].status_code !== 200) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_post_open_auto_retry_failed',
      post_open_retry_observation_attempts: retryPostOpenEvidence.observations,
      post_open_auto_retry_invocations: postOpenAutoRetryInvocations,
      ...recoveryEvidence
    }
  }

  const retryProof = await waitForStableNewRuntime({
    runtimeInspector,
    isVerifiedRuntime,
    isNewRuntime,
    projectPath,
    wsPort,
    attempts: runtimeAttempts,
    delayMs: runtimeDelayMs,
    waitForObservation
  })
  const retryEvidence = {
    post_open_retry_observation_attempts: retryPostOpenEvidence.observations,
    post_open_auto_retry_invocations: postOpenAutoRetryInvocations,
    retry_observation_attempts: retryProof.observations,
    ...recoveryEvidence
  }
  if (retryProof.stable) {
    return {
      status: 'recovered',
      recovery: 'official_cli_quit_open_then_verified_target_scoped_auto_retry',
      before: runtimeEvidence(verifiedRuntime, true, false),
      after: runtimeEvidence(retryProof.runtime, true, true),
      ...retryEvidence
    }
  }
  return {
    status: 'failed_environment',
    code: 'devtools_automator_blocker',
    reason: runtimeFailureReason(retryProof.observations, '_after_auto_retry'),
    ...retryEvidence
  }
}
