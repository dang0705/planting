export function runtimeEvidence(runtime, verified, newRuntime) {
  return {
    status: runtime?.status ?? 'unavailable',
    main_devtools_pid: runtime?.main_devtools_pid ?? 'unavailable',
    automation_listener_pid:
      runtime?.automation_listener_pid ?? runtime?.port_owner_pid ?? 'unavailable',
    automator_port: runtime?.automator_port ?? 'unavailable',
    automator_listener_pids: runtime?.automator_listener_pids ?? [],
    control_port: runtime?.control_port ?? 'unavailable',
    control_port_verified: runtime?.control_port_verified === true,
    observed_project_path: runtime?.observed_project_path ?? 'unavailable',
    project_identity_verified: runtime?.project_identity_verified === true,
    project_identity_source: runtime?.project_identity_source ?? 'unavailable',
    current_session_proof: runtime?.session_log_evidence?.status ?? 'unavailable',
    target_runtime_verified: verified,
    new_runtime_identity_verified: newRuntime
  }
}

export async function waitForStableNewRuntime({
  runtimeInspector,
  isVerifiedRuntime,
  isNewRuntime,
  projectPath,
  wsPort,
  attempts,
  delayMs,
  waitForObservation
}) {
  const observations = []
  let stableSnapshots = 0
  let runtime
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    runtime = await runtimeInspector({ expectedProjectPath: projectPath, wsPort })
    const verified = isVerifiedRuntime(runtime)
    const newRuntime = verified && isNewRuntime(runtime)
    observations.push({ attempt, ...runtimeEvidence(runtime, verified, newRuntime) })
    stableSnapshots = newRuntime ? stableSnapshots + 1 : 0
    if (stableSnapshots === 2) {
      return { stable: true, runtime, observations }
    }
    if (attempt < attempts && delayMs > 0) {
      await waitForObservation(delayMs)
    }
  }
  return { stable: false, runtime, observations }
}

export function lacksAutomatorListenerForTwoObservations(observations) {
  return (
    observations.length >= 2 &&
    observations.every(
      ({ automator_listener_pids: listenerPids }) =>
        Array.isArray(listenerPids) && listenerPids.length === 0
    )
  )
}

export function runtimeFailureReason(observations, suffix = '') {
  const reason = observations.some(item => item.target_runtime_verified)
    ? 'stably_restarted'
    : 'reverified'
  return `target_runtime_not_${reason}_after_cli_fallback${suffix}`
}
