import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { localRuntimeLeasePath, normalizeLocalRuntimePath } from '../../../../../../scripts/dev/local-runtime-session.mjs'
import {
  inspectOwnedDevToolsRuntime,
  normalizeRuntimePath,
  recoverVerifiedTargetDevTools,
  requestDevToolsControl,
  verifyDevToolsOwnerProcess
} from './devtools-runtime.mjs'
import { stateDir } from './state.mjs'

export const ISOLATED_AUTOMATOR_PORT = 9421
export const ISOLATED_CONTROL_PORT = 9422
export const ISOLATED_OBSERVATION_ATTEMPTS = 40
export const ISOLATED_OBSERVATION_DELAY_MS = 500

const DEVTOOLS_EXECUTABLE =
  '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools'
const DEVTOOLS_PACKAGE_PAYLOAD =
  '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw'
export const OFFICIAL_IDE_PLUGIN_SOURCE = path.join(DEVTOOLS_PACKAGE_PAYLOAD, 'js', 'ideplugin')
const DEDICATED_PLUGIN_DIRECTORY = 'WeappPlugin'
const REQUIRED_PLUGIN_ASSETS = ['devtools', 'inspector']

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function processAlive(pid) {
  try {
    process.kill(Number(pid), 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function readJson(filePath, fsModule = fs) {
  try {
    return JSON.parse(fsModule.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(filePath, value, fsModule = fs) {
  fsModule.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fsModule.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  fsModule.renameSync(temporary, filePath)
}

function validPort(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0
}

export function persistentIsolatedAutomatorProfilePath({ homeDir = os.homedir } = {}) {
  const home = typeof homeDir === 'function' ? homeDir() : homeDir
  return path.join(home, 'Library', 'Application Support', '青花植', 'isolated-automator-devtools')
}

function isDedicatedPersistentProfile(userDataDir, persistentProfileDir) {
  return (
    Boolean(userDataDir) &&
    Boolean(persistentProfileDir) &&
    normalizeRuntimePath(userDataDir) === normalizeRuntimePath(persistentProfileDir)
  )
}

export function isolatedRuntimePaths({ dispatchRunId, runtimeRoot = stateDir, homeDir = os.homedir } = {}) {
  const root = runtimeRoot(dispatchRunId)
  const userDataDir = persistentIsolatedAutomatorProfilePath({ homeDir })
  return {
    root,
    userDataDir,
    pluginDir: path.join(userDataDir, DEDICATED_PLUGIN_DIRECTORY),
    ownerFile: path.join(root, 'qa-devtools-owner.json')
  }
}

export function isolatedRuntimeConfiguration({
  dispatchRunId,
  projectPath,
  wsPort = ISOLATED_AUTOMATOR_PORT,
  controlPort = ISOLATED_CONTROL_PORT,
  runtimeRoot = stateDir,
  homeDir = os.homedir
} = {}) {
  const paths = isolatedRuntimePaths({ dispatchRunId, runtimeRoot, homeDir })
  const expectedProjectPath = normalizeRuntimePath(projectPath)
  const userDataDir = normalizeRuntimePath(paths.userDataDir)
  const persistentProfileDir = normalizeRuntimePath(
    persistentIsolatedAutomatorProfilePath({ homeDir })
  )
  const valid =
    Boolean(dispatchRunId) &&
    path.isAbsolute(expectedProjectPath) &&
    Number(wsPort) === ISOLATED_AUTOMATOR_PORT &&
    validPort(controlPort) &&
    Number(controlPort) !== ISOLATED_AUTOMATOR_PORT &&
    Number(controlPort) !== 9420 &&
    isDedicatedPersistentProfile(userDataDir, persistentProfileDir)
  return {
    valid,
    code: valid ? '' : 'qa_isolated_runtime_configuration_invalid',
    dispatchRunId,
    projectPath: expectedProjectPath,
    wsPort: Number(wsPort),
    controlPort: Number(controlPort),
    ...paths,
    userDataDir,
    persistentProfileDir
  }
}

function pluginAssetStatus(pluginDir, fsModule) {
  try {
    if (!fsModule.statSync(pluginDir).isDirectory()) {
      return { valid: false, reason: 'plugin_directory_missing' }
    }
    const manifest = JSON.parse(fsModule.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf8'))
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return { valid: false, reason: 'plugin_manifest_invalid' }
    }
    for (const asset of REQUIRED_PLUGIN_ASSETS) {
      if (!fsModule.statSync(path.join(pluginDir, asset)).isDirectory()) {
        return { valid: false, reason: `plugin_${asset}_missing` }
      }
    }
    return { valid: true }
  } catch {
    return { valid: false, reason: 'plugin_assets_unreadable' }
  }
}

export function bootstrapDedicatedDevToolsPlugin({
  configuration,
  fsModule = fs,
  sourceDir = OFFICIAL_IDE_PLUGIN_SOURCE
} = {}) {
  const expectedPluginDir = path.join(configuration?.userDataDir || '', DEDICATED_PLUGIN_DIRECTORY)
  if (
    !isDedicatedPersistentProfile(configuration?.userDataDir, configuration?.persistentProfileDir) ||
    normalizeRuntimePath(configuration?.pluginDir) !== normalizeRuntimePath(expectedPluginDir)
  ) {
    return {
      status: 'blocked',
      code: 'qa_dedicated_plugin_bootstrap_blocker',
      reason: 'dedicated_plugin_destination_unverified'
    }
  }
  const sourceStatus = pluginAssetStatus(sourceDir, fsModule)
  if (!sourceStatus.valid) {
    return {
      status: 'blocked',
      code: 'qa_dedicated_plugin_bootstrap_blocker',
      reason: `official_ideplugin_${sourceStatus.reason}`,
      source_dir: sourceDir
    }
  }
  const destinationStatus = pluginAssetStatus(configuration.pluginDir, fsModule)
  if (destinationStatus.valid) {
    return {
      status: 'ready',
      initialized: false,
      source_dir: sourceDir,
      plugin_dir: configuration.pluginDir
    }
  }
  try {
    fsModule.mkdirSync(configuration.userDataDir, { recursive: true })
    fsModule.rmSync(configuration.pluginDir, { recursive: true, force: true })
    fsModule.cpSync(sourceDir, configuration.pluginDir, { recursive: true, dereference: true })
  } catch {
    return {
      status: 'blocked',
      code: 'qa_dedicated_plugin_bootstrap_blocker',
      reason: 'dedicated_plugin_initialization_failed',
      source_dir: sourceDir,
      plugin_dir: configuration.pluginDir
    }
  }
  const initializedStatus = pluginAssetStatus(configuration.pluginDir, fsModule)
  if (!initializedStatus.valid) {
    return {
      status: 'blocked',
      code: 'qa_dedicated_plugin_bootstrap_blocker',
      reason: `dedicated_ideplugin_${initializedStatus.reason}`,
      source_dir: sourceDir,
      plugin_dir: configuration.pluginDir
    }
  }
  return {
    status: 'ready',
    initialized: true,
    source_dir: sourceDir,
    plugin_dir: configuration.pluginDir
  }
}

export function verifySharedQaTarget({
  projectPath,
  leaseRoot,
  fsModule = fs,
  isProcessAlive = processAlive
} = {}) {
  const targetPath = normalizeLocalRuntimePath(projectPath)
  const root = leaseRoot || path.join(path.resolve(projectPath, '..', '..', '..'), '.tmp', 'local-runtime-sessions')
  const leaseFile = localRuntimeLeasePath(targetPath, root)
  const lease = readJson(leaseFile, fsModule)
  const valid =
    lease?.version === 1 &&
    normalizeLocalRuntimePath(lease.target_path) === targetPath &&
    Number.isInteger(Number(lease.owner_pid)) &&
    Number(lease.owner_pid) > 0 &&
    isProcessAlive(Number(lease.owner_pid))
  return {
    passed: valid,
    code: valid ? '' : 'shared_target_watcher_unverified',
    target_path: targetPath,
    lease_file: leaseFile,
    owner_pid: valid ? Number(lease.owner_pid) : 'unavailable',
    child_pid: valid ? Number(lease.child_pid) || 'unavailable' : 'unavailable',
    api_base_url: valid ? String(lease.api_base_url || 'unavailable') : 'unavailable'
  }
}

function ownerRecord(configuration, mainDevToolsPid, phase = 'bootstrap') {
  return {
    version: 2,
    kind: 'isolated_automator_runtime_owner',
    phase,
    dispatch_run_id: configuration.dispatchRunId,
    main_devtools_pid: Number(mainDevToolsPid),
    user_data_dir: configuration.userDataDir,
    control_port: configuration.controlPort,
    automator_port: configuration.wsPort,
    project_path: configuration.projectPath,
    created_at: new Date().toISOString()
  }
}

function ownerPhase(owner) {
  return owner?.phase || 'ready'
}

function ownerMatchesConfiguration(owner, configuration) {
  return (
    owner?.kind === 'isolated_automator_runtime_owner' &&
    ['bootstrap', 'ready'].includes(ownerPhase(owner)) &&
    owner?.dispatch_run_id === configuration.dispatchRunId &&
    Number(owner?.automator_port) === configuration.wsPort &&
    Number(owner?.control_port) === configuration.controlPort &&
    normalizeRuntimePath(owner?.project_path) === configuration.projectPath &&
    normalizeRuntimePath(owner?.user_data_dir) === configuration.userDataDir &&
    validPort(owner?.main_devtools_pid)
  )
}

function childExitEvidence(child) {
  if (!child || (child.exitCode === null || child.exitCode === undefined) && !child.signalCode) {
    return null
  }
  return {
    exit_code: child.exitCode ?? null,
    signal: child.signalCode ?? null
  }
}

function removeExitedOwnerRecord({ configuration, owner, fsModule, isProcessAlive }) {
  if (!ownerMatchesConfiguration(owner, configuration) || isProcessAlive(owner.main_devtools_pid)) {
    return false
  }
  const stored = readJson(configuration.ownerFile, fsModule)
  if (stored && ownerMatchesConfiguration(stored, configuration) && stored.main_devtools_pid === owner.main_devtools_pid) {
    fsModule.unlinkSync(configuration.ownerFile)
    return true
  }
  return false
}

function commandOutput(commandRunner, command, args) {
  try {
    return String(commandRunner(command, args, { encoding: 'utf8' })?.stdout ?? '')
  } catch {
    return ''
  }
}

function exactOption(command, name, value) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedValue = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)${escapedName}(?:=|\\s+)${escapedValue}(?=\\s|$)`).test(command)
}

function sameRunOrphanCandidates(configuration, commandRunner) {
  return commandOutput(commandRunner, 'ps', ['-ax', '-o', 'pid=,command='])
    .split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map(match => ({ pid: Number(match[1]), command: match[2] }))
    .filter(candidate =>
      candidate.command.includes(DEVTOOLS_EXECUTABLE) &&
      exactOption(candidate.command, '--user-data-dir', configuration.userDataDir) &&
      exactOption(candidate.command, '--project', configuration.projectPath) &&
      (exactOption(candidate.command, '--ide-http-port', configuration.controlPort) ||
        exactOption(candidate.command, '--remote-port', configuration.controlPort))
    )
}

function inspectUnownedIsolatedCandidate({ configuration, commandRunner }) {
  const candidates = sameRunOrphanCandidates(configuration, commandRunner)
  if (candidates.length === 0) {
    return { status: 'not_found', candidates: [] }
  }
  // A persistent profile is shared by dispatch runs. Without this run's owner
  // record, command-line similarity cannot prove ownership, so never adopt or
  // terminate it. The user must finish first-profile authorization in its owner run.
  return {
    status: 'blocked',
    code: 'qa_profile_auth_configuration_blocker',
    reason: 'requires_first_profile_setup',
    candidates
  }
}

function launchDedicatedDevTools(configuration, spawnProcess = spawn) {
  fs.mkdirSync(configuration.userDataDir, { recursive: true })
  return spawnProcess(
    DEVTOOLS_EXECUTABLE,
    [
      DEVTOOLS_PACKAGE_PAYLOAD,
      `--package-dir=${DEVTOOLS_PACKAGE_PAYLOAD}`,
      `--user-data-dir=${configuration.userDataDir}`,
      `-load-extension=${configuration.pluginDir}`,
      `--custom-devtools-frontend=${pathToFileURL(path.join(configuration.pluginDir, 'inspector')).href}`,
      '--ide-http-port',
      String(configuration.controlPort),
      '--enable-service-port',
      `--project=${configuration.projectPath}`
    ],
    { detached: true, stdio: 'ignore' }
  )
}

async function controlOwnedRuntime({ owner, configuration, controlRequest, commandRunner }) {
  const verification = verifyDevToolsOwnerProcess({ owner, commandRunner })
  if (!verification.verified) {
    return {
      status: 'blocked',
      code: 'qa_runtime_owner_unverified',
      verification,
      invocations: []
    }
  }
  const invocations = []
  for (const action of ['open', 'auto']) {
    const result = await controlRequest({
      action,
      projectPath: configuration.projectPath,
      controlPort: configuration.controlPort,
      wsPort: configuration.wsPort
    })
    invocations.push({ action, ...result })
    if (result?.status_code !== 200) {
      return {
        status: 'blocked',
        code: 'qa_profile_auth_configuration_blocker',
        reason: 'isolated_profile_control_request_unavailable',
        verification,
        invocations
      }
    }
  }
  return { status: 'controlled', verification, invocations }
}

export async function prepareIsolatedAutomatorRuntime({
  dispatchRunId,
  projectPath,
  wsPort = ISOLATED_AUTOMATOR_PORT,
  controlPort = ISOLATED_CONTROL_PORT,
  runtimeRoot = stateDir,
  spawnProcess = spawn,
  controlRequest = requestDevToolsControl,
  commandRunner = spawnSync,
  runtimeInspector = inspectOwnedDevToolsRuntime,
  sharedTargetProbe = verifySharedQaTarget,
  isProcessAlive = processAlive,
  observationAttempts = ISOLATED_OBSERVATION_ATTEMPTS,
  observationDelayMs = ISOLATED_OBSERVATION_DELAY_MS,
  waitForObservation = wait,
  homeDir = os.homedir,
  pluginBootstrap = bootstrapDedicatedDevToolsPlugin,
  fsModule = fs
} = {}) {
  const configuration = isolatedRuntimeConfiguration({
    dispatchRunId,
    projectPath,
    wsPort,
    controlPort,
    runtimeRoot,
    homeDir
  })
  if (!configuration.valid) {
    return { status: 'blocked', code: configuration.code, configuration }
  }
  const sharedTarget = sharedTargetProbe({ projectPath: configuration.projectPath })
  if (!sharedTarget.passed) {
    return { status: 'blocked', code: sharedTarget.code, configuration, shared_target: sharedTarget }
  }
  let owner = readJson(configuration.ownerFile, fsModule)
  let launched = false
  let launchedChild = null
  if (owner && !ownerMatchesConfiguration(owner, configuration)) {
    return { status: 'blocked', code: 'qa_runtime_owner_record_unverified', configuration }
  }
  if (owner && !isProcessAlive(owner.main_devtools_pid)) {
    removeExitedOwnerRecord({ configuration, owner, fsModule, isProcessAlive })
    owner = null
  }
  if (!owner) {
    const orphanCleanup = inspectUnownedIsolatedCandidate({
      configuration,
      commandRunner
    })
    if (orphanCleanup.status === 'blocked') {
      return {
        status: 'blocked',
        code: orphanCleanup.code,
        reason: orphanCleanup.reason,
        configuration,
        shared_target: sharedTarget,
        orphan_cleanup: orphanCleanup
      }
    }
  }
  if (!owner) {
    const pluginBootstrapResult = pluginBootstrap({ configuration, fsModule })
    if (pluginBootstrapResult.status !== 'ready') {
      return {
        status: 'blocked',
        code: pluginBootstrapResult.code,
        reason: pluginBootstrapResult.reason,
        configuration,
        shared_target: sharedTarget,
        plugin_bootstrap: pluginBootstrapResult
      }
    }
    let child
    try {
      child = launchDedicatedDevTools(configuration, spawnProcess)
    } catch (error) {
      return {
        status: 'blocked',
        code: 'qa_profile_auth_configuration_blocker',
        configuration,
        reason: String(error?.message || error)
      }
    }
    if (!validPort(child?.pid)) {
      return {
        status: 'blocked',
        code: 'qa_profile_auth_configuration_blocker',
        configuration,
        reason: 'isolated_devtools_process_pid_unavailable'
      }
    }
    owner = ownerRecord(configuration, child.pid)
    launchedChild = child
    launched = true
    // Preserve this run's authority to retry after the user authorizes the
    // dedicated persistent profile. This is state only; it never copies or reads
    // a daily DevTools profile.
    writeJson(configuration.ownerFile, owner, fsModule)
  }
  const earlyExit = () => childExitEvidence(launchedChild)
  const earlyExitBlocker = phase => {
    removeExitedOwnerRecord({ configuration, owner, fsModule, isProcessAlive })
    return {
      status: 'blocked',
      code: 'qa_profile_auth_configuration_blocker',
      reason: 'isolated_devtools_child_exited_before_owner_verification',
      phase,
      child_exit: earlyExit(),
      configuration,
      shared_target: sharedTarget,
      launched
    }
  }
  if (earlyExit()) {
    return earlyExitBlocker('launch')
  }
  let controlled
  const ownerVerificationAttempts = []
  for (let attempt = 1; attempt <= observationAttempts; attempt += 1) {
    if (earlyExit()) {
      return earlyExitBlocker('owner_control_verification')
    }
    controlled = await controlOwnedRuntime({
      owner,
      configuration,
      controlRequest,
      commandRunner
    })
    ownerVerificationAttempts.push({
      status: controlled.status,
      code: controlled.code ?? '',
      owner_verified: controlled.verification?.verified === true
    })
    if (controlled.status === 'controlled') {
      break
    }
    if (controlled.code !== 'qa_runtime_owner_unverified' || attempt === observationAttempts) {
      break
    }
    if (observationDelayMs > 0) {
      await waitForObservation(observationDelayMs)
    }
  }
  if (controlled.status !== 'controlled') {
    removeExitedOwnerRecord({ configuration, owner, fsModule, isProcessAlive })
    return {
      ...controlled,
      configuration,
      owner,
      shared_target: sharedTarget,
      launched,
      owner_verification_attempts: ownerVerificationAttempts
    }
  }
  const observations = []
  let stableSnapshots = 0
  let runtime
  for (let attempt = 1; attempt <= observationAttempts; attempt += 1) {
    if (earlyExit()) {
      return earlyExitBlocker('runtime_observation')
    }
    runtime = runtimeInspector({
      expectedProjectPath: configuration.projectPath,
      wsPort: configuration.wsPort,
      owner,
      commandRunner
    })
    observations.push({
      status: runtime.status,
      code: runtime.code ?? '',
      main_devtools_pid: runtime.main_devtools_pid ?? 'unavailable',
      automator_port: runtime.automator_port ?? configuration.wsPort,
      qa_owner_verified: runtime.qa_owner_verified === true
    })
    if (runtime.status === 'verified' && runtime.qa_owner_verified === true) {
      stableSnapshots += 1
      if (stableSnapshots >= 2) {
        if (earlyExit()) {
          return earlyExitBlocker('runtime_stabilization')
        }
        owner = { ...owner, phase: 'ready' }
        writeJson(configuration.ownerFile, owner, fsModule)
        return {
          status: 'ready',
          configuration,
          owner,
          launched,
          shared_target: sharedTarget,
          runtime,
          invocations: controlled.invocations,
          owner_verification_attempts: ownerVerificationAttempts,
          observations
        }
      }
    } else {
      stableSnapshots = 0
    }
    if (attempt < observationAttempts && observationDelayMs > 0) {
      await waitForObservation(observationDelayMs)
    }
  }
  removeExitedOwnerRecord({ configuration, owner, fsModule, isProcessAlive })
  return {
    status: 'blocked',
    code: 'qa_profile_auth_configuration_blocker',
    reason: 'isolated_profile_or_automator_port_not_verified',
    configuration,
    owner,
    launched,
    shared_target: sharedTarget,
    invocations: controlled.invocations,
    owner_verification_attempts: ownerVerificationAttempts,
    observations
  }
}

export async function recoverIsolatedAutomatorRuntime({
  prepared,
  controlRequest = requestDevToolsControl,
  commandRunner = spawnSync,
  runtimeInspector = inspectOwnedDevToolsRuntime
} = {}) {
  if (prepared?.status !== 'ready') {
    return { status: 'failed_environment', code: 'qa_runtime_owner_unverified', invocations: [] }
  }
  const { configuration, owner, runtime } = prepared
  const verification = verifyDevToolsOwnerProcess({ owner, commandRunner })
  if (!verification.verified) {
    return { status: 'failed_environment', code: 'qa_runtime_owner_unverified', invocations: [] }
  }
  return recoverVerifiedTargetDevTools({
    projectPath: configuration.projectPath,
    wsPort: configuration.wsPort,
    verifiedRuntime: runtime,
    commandRunner,
    controlRequest,
    runtimeInspector: options =>
      runtimeInspector({ ...options, owner, commandRunner })
  })
}

export async function runPreparedIsolatedPreflight({
  dispatchRunId,
  projectPath,
  wsPort,
  preflightOptions,
  runtimeFactory,
  preflightRunner
} = {}) {
  const isolatedRuntime = await runtimeFactory({ dispatchRunId, projectPath, wsPort })
  if (isolatedRuntime.status !== 'ready') {
    return { isolatedRuntime, report: null }
  }
  const report = await preflightRunner({
    ...preflightOptions,
    runtime: isolatedRuntime.runtime,
    runtimeInspector: options =>
      inspectOwnedDevToolsRuntime({ ...options, owner: isolatedRuntime.owner }),
    recoveryExecutor: options => recoverIsolatedAutomatorRuntime({ prepared: isolatedRuntime, ...options })
  })
  report.isolated_runtime = {
    owner: isolatedRuntime.owner,
    configuration: isolatedRuntime.configuration,
    shared_target: isolatedRuntime.shared_target,
    launched: isolatedRuntime.launched === true
  }
  return { isolatedRuntime, report }
}

export function cleanupIsolatedAutomatorRuntime({
  prepared,
  commandRunner = spawnSync,
  isProcessAlive = processAlive,
  terminateProcess = process.kill,
  fsModule = fs
} = {}) {
  const { configuration, owner } = prepared ?? {}
  if (!configuration || !owner) {
    return { status: 'blocked', code: 'qa_runtime_owner_unverified' }
  }
  if (
    !isDedicatedPersistentProfile(configuration.userDataDir, configuration.persistentProfileDir) ||
    !isDedicatedPersistentProfile(owner.user_data_dir, configuration.persistentProfileDir)
  ) {
    return { status: 'blocked', code: 'qa_user_profile_cleanup_forbidden' }
  }
  if (!ownerMatchesConfiguration(owner, configuration)) {
    return { status: 'blocked', code: 'qa_runtime_owner_unverified' }
  }
  if (!isProcessAlive(owner.main_devtools_pid)) {
    return { status: 'not_running', code: 'qa_runtime_owner_not_live' }
  }
  const verification = verifyDevToolsOwnerProcess({ owner, commandRunner })
  if (!verification.verified) {
    return { status: 'blocked', code: 'qa_runtime_owner_unverified', verification }
  }
  try {
    terminateProcess(Number(owner.main_devtools_pid), 'SIGTERM')
    // Owner state is run-scoped. The persistent QA profile is never removed here.
    fsModule.unlinkSync(configuration.ownerFile)
    return { status: 'terminated', owner_pid: Number(owner.main_devtools_pid) }
  } catch (error) {
    return { status: 'blocked', code: 'qa_runtime_cleanup_failed', reason: error.message }
  }
}
