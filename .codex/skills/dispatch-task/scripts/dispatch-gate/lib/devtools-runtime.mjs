import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { readCurrentSessionProjectEvidence } from './devtools-session-log.mjs'

export { readCurrentSessionProjectEvidence } from './devtools-session-log.mjs'

export const DEVTOOLS_CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

const MAX_ANCESTOR_HOPS = 16
const RECOVERY_OBSERVATION_ATTEMPTS = 5
const RECOVERY_OBSERVATION_DELAY_MS = 500

export function normalizeRuntimePath(value) {
  return path.resolve(String(value ?? '')).replaceAll('\\', '/')
}

function commandText(commandRunner, command, args, options = {}) {
  try {
    const result = commandRunner(command, args, { encoding: 'utf8', ...options })
    return {
      status: result?.status ?? null,
      stdout: String(result?.stdout ?? ''),
      stderr: String(result?.stderr ?? result?.error?.message ?? '')
    }
  } catch (error) {
    return { status: null, stdout: '', stderr: error.message }
  }
}

function listenerPids(port, commandRunner) {
  const output = commandText(commandRunner, 'lsof', [
    '-nP',
    `-iTCP:${port}`,
    '-sTCP:LISTEN',
    '-t'
  ]).stdout
  return [...new Set(output.split(/\s+/).filter(value => /^\d+$/.test(value)))].map(Number)
}

function processInfo(pid, commandRunner) {
  const raw = commandText(commandRunner, 'ps', [
    '-p',
    String(pid),
    '-o',
    'ppid=,command='
  ]).stdout.trim()
  const match = raw.match(/^(\d+)\s+(.+)$/)
  return match
    ? { pid: Number(pid), parent_pid: Number(match[1]), command: match[2] }
    : { pid: Number(pid), parent_pid: null, command: '' }
}

function ancestorsFrom(pid, commandRunner) {
  const ancestors = []
  const visited = new Set()
  let currentPid = Number(pid)
  while (
    Number.isInteger(currentPid) &&
    currentPid > 1 &&
    !visited.has(currentPid) &&
    ancestors.length < MAX_ANCESTOR_HOPS
  ) {
    visited.add(currentPid)
    const current = processInfo(currentPid, commandRunner)
    ancestors.push(current)
    currentPid = current.parent_pid
  }
  return ancestors
}

function isMainDevToolsProcess(command = '') {
  return /\/Contents\/MacOS\/wechatdevtools(?:\s|$)/.test(command)
}

function controlPortFrom(command = '') {
  const match = command.match(/--remote-port(?:=|\s+)(\d+)/)
  return match ? Number(match[1]) : null
}

function projectPathsFromCommand(command = '') {
  const matches = command.matchAll(/--project(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/g)
  return [...matches]
    .map(match => match[1] ?? match[2] ?? match[3])
    .filter(Boolean)
    .map(normalizeRuntimePath)
}

function projectPathsFromOpenFiles(text = '') {
  return text
    .split('\n')
    .filter(line => line.startsWith('n') && line.endsWith('/project.config.json'))
    .map(line => normalizeRuntimePath(path.dirname(line.slice(1))))
}

function projectEvidenceForTopology(topology, commandRunner) {
  const records = []
  for (const process of topology) {
    const openFiles = commandText(commandRunner, 'lsof', [
      '-n',
      '-p',
      String(process.pid),
      '-Fn'
    ]).stdout
    const paths = [
      ...new Set([
        ...projectPathsFromCommand(process.command),
        ...projectPathsFromOpenFiles(openFiles)
      ])
    ]
    for (const projectPath of paths) {
      records.push({ pid: process.pid, project_path: projectPath })
    }
  }
  return records
}

function inspectAutomationOwner(pid, commandRunner) {
  const topology = ancestorsFrom(pid, commandRunner)
  const main = topology.find(process => isMainDevToolsProcess(process.command))
  const controlPort = controlPortFrom(main?.command)
  const projectEvidence = projectEvidenceForTopology(topology, commandRunner)
  return {
    automation_listener_pid: Number(pid),
    main_devtools_pid: main?.pid ?? null,
    main_devtools_parent_pid: main?.parent_pid ?? null,
    main_process: main ?? null,
    control_port: controlPort,
    control_port_source: controlPort ? 'main_devtools_remote_port' : 'unavailable',
    topology,
    project_evidence_records: projectEvidence,
    project_paths: [...new Set(projectEvidence.map(item => item.project_path))]
  }
}

function runtimeSnapshot(runtime = {}) {
  return {
    main_devtools_pid: runtime.main_devtools_pid ?? 'unavailable',
    automation_listener_pid:
      runtime.automation_listener_pid ?? runtime.port_owner_pid ?? 'unavailable',
    control_port: runtime.control_port ?? 'unavailable',
    control_port_source: runtime.control_port_source ?? 'unavailable',
    project_path: runtime.observed_project_path ?? 'unavailable',
    project_identity_verified: runtime.project_identity_verified === true,
    project_identity_source: runtime.project_identity_source ?? 'unavailable',
    project_evidence: runtime.project_evidence ?? [],
    project_evidence_records: runtime.project_evidence_records ?? []
  }
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function invocation(commandRunner, action, expectedProjectPath, controlPort, extraArgs = []) {
  const args = [
    action,
    '--project',
    expectedProjectPath,
    '--port',
    String(controlPort),
    ...extraArgs
  ]
  const result = commandText(commandRunner, DEVTOOLS_CLI, args, { timeout: 30000, shell: false })
  return {
    action,
    command: DEVTOOLS_CLI,
    args,
    exit_code: result.status,
    stdout_excerpt: result.stdout.slice(0, 1000),
    stderr_excerpt: result.stderr.slice(0, 1000)
  }
}

function validVerifiedRuntime(runtime, expectedProjectPath, wsPort) {
  return (
    runtime?.status === 'verified' &&
    runtime?.project_identity_verified === true &&
    normalizeRuntimePath(runtime?.observed_project_path) === expectedProjectPath &&
    positiveInteger(runtime?.main_devtools_pid) &&
    positiveInteger(runtime?.automation_listener_pid ?? runtime?.port_owner_pid) &&
    positiveInteger(runtime?.control_port) &&
    Number(runtime.control_port) !== Number(wsPort)
  )
}

function restartProven(before, after) {
  return (
    Number(before.main_devtools_pid) !== Number(after.main_devtools_pid) ||
    Number(before.automation_listener_pid) !== Number(after.automation_listener_pid)
  )
}

export function inspectDevToolsRuntime({
  expectedProjectPath,
  wsPort = 9420,
  commandRunner = spawnSync,
  sessionLogReader = readCurrentSessionProjectEvidence
} = {}) {
  const expected = normalizeRuntimePath(expectedProjectPath)
  const automatorListenerPids = listenerPids(wsPort, commandRunner)
  const owners = automatorListenerPids.map(pid => {
    const owner = inspectAutomationOwner(pid, commandRunner)
    const sessionLogEvidence = owner.main_process
      ? sessionLogReader({ mainProcess: owner.main_process, expectedProjectPath: expected, wsPort })
      : { status: 'unavailable', rejection: 'main_devtools_process_missing', evidence_records: [] }
    return { ...owner, session_log_evidence: sessionLogEvidence }
  })
  const controlPorts = [...new Set(owners.map(owner => owner.control_port).filter(positiveInteger))]
  const controlPortListeners = Object.fromEntries(
    controlPorts.map(port => [port, listenerPids(port, commandRunner)])
  )
  const observedPaths = [...new Set(owners.flatMap(owner => owner.project_paths))]
  const expectedOwners = owners.filter(
    owner =>
      owner.project_paths.every(projectPath => projectPath === expected) &&
      (owner.project_paths.includes(expected) || owner.session_log_evidence.status === 'verified')
  )
  const verifiedOwner = expectedOwners.find(
    owner =>
      owner.main_devtools_pid &&
      positiveInteger(owner.control_port) &&
      owner.control_port !== wsPort &&
      (owner.project_paths.length === 1 || owner.session_log_evidence.status === 'verified')
  )
  const projectConfigExists = fs.existsSync(path.join(expected, 'project.config.json'))
  const base = {
    automator_port: wsPort,
    automator_listener_pids: automatorListenerPids,
    expected_project_path: expected,
    project_config_exists: projectConfigExists,
    control_port_candidates: controlPorts,
    control_port_listener_pids: controlPortListeners,
    owners
  }
  if (verifiedOwner && projectConfigExists) {
    return {
      status: 'verified',
      ...base,
      main_devtools_pid: verifiedOwner.main_devtools_pid,
      main_devtools_parent_pid: verifiedOwner.main_devtools_parent_pid,
      automation_listener_pid: verifiedOwner.automation_listener_pid,
      port_owner_pid: verifiedOwner.automation_listener_pid,
      control_port: verifiedOwner.control_port,
      control_port_source: verifiedOwner.control_port_source,
      observed_project_path: expected,
      project_identity_verified: true,
      project_evidence: [expected],
      project_identity_source: verifiedOwner.project_paths.includes(expected)
        ? 'process_open_file'
        : 'weapp_log_current_session',
      project_evidence_records: [
        ...verifiedOwner.project_evidence_records,
        ...verifiedOwner.session_log_evidence.evidence_records
      ],
      session_log_evidence: verifiedOwner.session_log_evidence
    }
  }
  if (observedPaths.length) {
    return {
      status: 'wrong_project',
      ...base,
      main_devtools_pid: owners[0]?.main_devtools_pid ?? 'unavailable',
      automation_listener_pid: owners[0]?.automation_listener_pid ?? 'unavailable',
      port_owner_pid: owners[0]?.automation_listener_pid ?? 'unavailable',
      control_port: owners[0]?.control_port ?? 'unavailable',
      control_port_source: owners[0]?.control_port_source ?? 'unavailable',
      observed_project_path: observedPaths[0],
      project_identity_verified: false,
      project_evidence: observedPaths,
      project_evidence_records: owners.flatMap(owner => owner.project_evidence_records),
      session_log_evidence: owners.map(owner => owner.session_log_evidence)
    }
  }
  return {
    status: 'unavailable',
    ...base,
    main_devtools_pid: owners[0]?.main_devtools_pid ?? 'unavailable',
    automation_listener_pid: owners[0]?.automation_listener_pid ?? 'unavailable',
    port_owner_pid: owners[0]?.automation_listener_pid ?? 'unavailable',
    control_port: owners[0]?.control_port ?? 'unavailable',
    control_port_source: owners[0]?.control_port_source ?? 'unavailable',
    observed_project_path: 'unavailable',
    project_identity_verified: false,
    project_evidence: [],
    project_evidence_records: [],
    session_log_evidence: owners.map(owner => owner.session_log_evidence)
  }
}

export async function recoverVerifiedTargetDevTools({
  projectPath,
  wsPort = 9420,
  verifiedRuntime,
  runtimeInspector = inspectDevToolsRuntime,
  commandRunner = spawnSync,
  observationAttempts = RECOVERY_OBSERVATION_ATTEMPTS,
  observationDelayMs = RECOVERY_OBSERVATION_DELAY_MS
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
  if (!fs.existsSync(path.join(expected, 'project.config.json')) || !fs.existsSync(DEVTOOLS_CLI)) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_project_or_devtools_cli_missing',
      before,
      invocations: []
    }
  }
  const controlPort = Number(verifiedRuntime.control_port)
  const invocations = []
  for (const [action, extraArgs] of [
    ['close', []],
    ['open', []],
    ['auto', ['--trust-project']]
  ]) {
    const result = invocation(commandRunner, action, expected, controlPort, extraArgs)
    invocations.push(result)
    if (result.exit_code !== 0) {
      return {
        status: 'failed_environment',
        code: 'devtools_automator_blocker',
        reason: 'target_project_recovery_command_failed',
        before,
        invocations
      }
    }
  }
  let after
  const attempts = []
  for (let attempt = 1; attempt <= observationAttempts; attempt += 1) {
    after = await runtimeInspector({ expectedProjectPath: expected, wsPort })
    attempts.push(runtimeSnapshot(after))
    if (
      validVerifiedRuntime(after, expected, wsPort) &&
      restartProven(before, runtimeSnapshot(after))
    ) {
      return {
        status: 'recovered',
        recovery: 'repository_owned_target_project_close_open_auto',
        before,
        after: runtimeSnapshot(after),
        invocations,
        observation_attempts: attempts
      }
    }
    if (attempt < observationAttempts && observationDelayMs > 0) {
      await wait(observationDelayMs)
    }
  }
  return {
    status: 'failed_environment',
    code: 'devtools_automator_blocker',
    reason: validVerifiedRuntime(after, expected, wsPort)
      ? 'target_runtime_not_restarted'
      : 'target_runtime_not_reverified_after_recovery',
    before,
    after: runtimeSnapshot(after),
    invocations,
    observation_attempts: attempts
  }
}
