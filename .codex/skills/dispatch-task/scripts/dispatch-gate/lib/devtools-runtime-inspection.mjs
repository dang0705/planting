import { spawnSync } from 'node:child_process'
import { readCurrentSessionProjectEvidence } from './devtools-session-log.mjs'
import {
  ancestorsFrom,
  controlPortFromIdeFile,
  controlPortListenerEvidence,
  directControlPortEvidence,
  isMainDevToolsProcess,
  listenerPids,
  mainDevToolsProcesses,
  normalizeRuntimePath,
  positiveInteger,
  projectEvidenceForTopology,
  userDataDirFromCommand
} from './devtools-process-topology.mjs'

function inspectListener(pid, expectedProjectPath, wsPort, commandRunner, sessionLogReader) {
  const topology = ancestorsFrom(pid, commandRunner)
  const main = topology.find(item => isMainDevToolsProcess(item.command))
  const direct = directControlPortEvidence(main?.command)
  const ide = !direct.port && main ? controlPortFromIdeFile(main, commandRunner, wsPort) : null
  const controlPort = direct.port ?? ide?.port ?? null
  const evidence = projectEvidenceForTopology(topology, commandRunner)
  const paths = [...new Set(evidence.map(item => item.project_path))]
  const session = main
    ? sessionLogReader({
        mainProcess: main,
        expectedProjectPath,
        wsPort,
        requireAutomatorPort: true
      })
    : { status: 'unavailable', evidence_records: [] }
  return {
    automation_listener_pid: Number(pid),
    main_devtools_pid: main?.pid ?? null,
    main_process: main ?? null,
    topology,
    control_port: controlPort,
    control_port_source: direct.port ? direct.source : (ide?.source ?? 'unavailable'),
    project_evidence_records: evidence,
    project_paths: paths,
    session_log_evidence: session
  }
}

function runtimeSnapshot(runtime = {}) {
  return {
    main_devtools_pid: runtime.main_devtools_pid ?? 'unavailable',
    automation_listener_pid:
      runtime.automation_listener_pid ?? runtime.port_owner_pid ?? 'unavailable',
    control_port: runtime.control_port ?? 'unavailable',
    control_port_verified: runtime.control_port_verified === true,
    project_path: runtime.observed_project_path ?? 'unavailable',
    project_identity_verified: runtime.project_identity_verified === true,
    project_evidence_records: runtime.project_evidence_records ?? [],
    session_log_evidence: runtime.session_log_evidence ?? null
  }
}

export function inspectDevToolsRuntime({
  expectedProjectPath,
  wsPort = 9420,
  commandRunner = spawnSync,
  sessionLogReader = readCurrentSessionProjectEvidence
} = {}) {
  const expected = normalizeRuntimePath(expectedProjectPath)
  const owners = listenerPids(wsPort, commandRunner).map(pid =>
    inspectListener(pid, expected, wsPort, commandRunner, sessionLogReader)
  )
  const matching = owners.filter(
    owner =>
      owner.main_devtools_pid &&
      (owner.project_paths.includes(expected) ||
        (owner.project_paths.length === 0 &&
          ['verified', 'bootstrap_verified'].includes(owner.session_log_evidence.status)))
  )
  const base = {
    expected_project_path: expected,
    automator_port: Number(wsPort),
    automator_listener_pids: owners.map(owner => owner.automation_listener_pid),
    owners
  }
  if (matching.length !== 1) {
    return {
      status: matching.length > 1 ? 'ambiguous' : 'unavailable',
      code: matching.length > 1 ? 'project_identity_ambiguous' : 'project_identity_unverified',
      ...base
    }
  }
  const owner = matching[0]
  const control = controlPortListenerEvidence(
    owner.control_port,
    owner.main_devtools_pid,
    commandRunner
  )
  if (!control.verified || Number(owner.control_port) === Number(wsPort)) {
    return {
      status: 'unavailable',
      code: 'ide_control_port_unverified',
      ...base,
      ...owner,
      control_port_verified: false,
      control_port_listener_evidence: control
    }
  }
  return {
    status: 'verified',
    ...base,
    ...owner,
    port_owner_pid: owner.automation_listener_pid,
    control_port_verified: true,
    control_port_listener_evidence: control,
    observed_project_path: expected,
    project_identity_verified: true,
    project_identity_source: owner.project_paths.includes(expected)
      ? 'process_open_file'
      : 'weapp_log_current_session',
    project_evidence: [expected]
  }
}

export function verifyDevToolsOwnerProcess({ owner, commandRunner = spawnSync } = {}) {
  const expectedPid = Number(owner?.main_devtools_pid)
  const expectedUserDataDir = normalizeRuntimePath(owner?.user_data_dir)
  const expectedControlPort = Number(owner?.control_port)
  const main = ancestorsFrom(expectedPid, commandRunner)[0]
  const direct = directControlPortEvidence(main?.command)
  const control = controlPortListenerEvidence(expectedControlPort, expectedPid, commandRunner)
  const verified =
    positiveInteger(expectedPid) &&
    isMainDevToolsProcess(main?.command) &&
    Boolean(expectedUserDataDir) &&
    normalizeRuntimePath(userDataDirFromCommand(main.command)) === expectedUserDataDir &&
    Number(direct.port) === expectedControlPort &&
    control.verified
  return {
    verified,
    code: verified ? '' : 'qa_runtime_owner_unverified',
    main_process: main ?? null,
    observed_user_data_dir: userDataDirFromCommand(main?.command) || 'unavailable',
    observed_control_port: direct.port ?? 'unavailable',
    control_port_listener_evidence: control
  }
}

export function inspectOwnedDevToolsRuntime({
  expectedProjectPath,
  wsPort = 9420,
  owner,
  commandRunner = spawnSync,
  sessionLogReader = readCurrentSessionProjectEvidence
} = {}) {
  const runtime = inspectDevToolsRuntime({
    expectedProjectPath,
    wsPort,
    commandRunner,
    sessionLogReader
  })
  const ownerCheck = verifyDevToolsOwnerProcess({ owner, commandRunner })
  const verified =
    runtime.status === 'verified' &&
    ownerCheck.verified &&
    Number(runtime.main_devtools_pid) === Number(owner?.main_devtools_pid) &&
    Number(runtime.control_port) === Number(owner?.control_port)
  return verified
    ? { ...runtime, qa_owner_verified: true }
    : {
        ...runtime,
        status: 'unavailable',
        code: 'qa_runtime_owner_unverified',
        qa_owner_verified: false,
        owner_verification: ownerCheck
      }
}

export function discoverTargetDevToolsRuntime({
  expectedProjectPath,
  wsPort = 9420,
  commandRunner = spawnSync,
  sessionLogReader = readCurrentSessionProjectEvidence
} = {}) {
  const expected = normalizeRuntimePath(expectedProjectPath)
  const candidates = mainDevToolsProcesses(commandRunner).map(main => {
    const direct = directControlPortEvidence(main.command)
    const ide = !direct.port ? controlPortFromIdeFile(main, commandRunner, wsPort) : null
    const evidence = projectEvidenceForTopology([main], commandRunner)
    const paths = [...new Set(evidence.map(item => item.project_path))]
    const session = sessionLogReader({
      mainProcess: main,
      expectedProjectPath: expected,
      wsPort,
      requireAutomatorPort: false
    })
    return {
      main_devtools_pid: main.pid,
      main_process: main,
      control_port: direct.port ?? ide?.port ?? null,
      control_port_source: direct.port ? direct.source : (ide?.source ?? 'unavailable'),
      project_paths: paths,
      project_evidence_records: evidence,
      session_log_evidence: session,
      target_verified:
        paths.includes(expected) || (paths.length === 0 && session.status === 'bootstrap_verified')
    }
  })
  const target = candidates.filter(item => item.target_verified)
  if (target.length !== 1) {
    return {
      status: 'unavailable',
      code: target.length > 1 ? 'project_identity_ambiguous' : 'project_identity_unverified',
      expected_project_path: expected,
      candidates
    }
  }
  const selected = target[0]
  const control = controlPortListenerEvidence(
    selected.control_port,
    selected.main_devtools_pid,
    commandRunner
  )
  if (!control.verified || Number(selected.control_port) === Number(wsPort)) {
    return {
      status: 'unavailable',
      code: 'ide_control_port_unverified',
      expected_project_path: expected,
      candidates,
      target: selected
    }
  }
  return {
    status: 'target_ready',
    expected_project_path: expected,
    project_identity_verified: true,
    observed_project_path: expected,
    ...selected,
    control_port_verified: true,
    control_port_listener_evidence: control
  }
}

export { normalizeRuntimePath, runtimeSnapshot }
