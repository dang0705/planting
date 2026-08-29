import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  acquirePersistentProfileLock,
  cleanupEvidence,
  descendantsOf,
  localRuntimeEvidence,
  localRuntimeOwned,
  mainForSession,
  ownedRuntimeEvidence,
  processAlive,
  processTable,
  QA_RUNTIME_SESSION_ROOT,
  QA_RUNTIME_AUTH_PROFILE_ROOT,
  QA_RUNTIME_TARGET,
  reapStaleQaPortLocks,
  releaseStaleLocalRuntimeLease,
  registerQaProjectInProfile,
  resetQaIdePortMarkers,
  resetTransientQaProfileState,
  runDevToolsCli,
  sendSignal,
  terminateProcessIds,
  terminateProcessTree,
  restoreQaProjectInProfile,
  waitFor
} from './test-owned-qa-support.mjs'
import { requestDevToolsControl } from './devtools-runtime-control.mjs'
import { recoverVerifiedTargetDevTools } from './devtools-runtime-recovery.mjs'
import { recoverTestOwnedDevToolsStartup } from './test-owned-qa-startup-recovery.mjs'
import { launchTestOwnedDevTools } from './test-owned-devtools-launch.mjs'
import {
  ensureQaAuthAvailable,
  markQaAuthServerFailure,
  readQaAuthManifest
} from '../../../../../../scripts/qa/qa-auth-coordinator.mjs'
import { currentShared } from '../../../../../../scripts/qa/qa-auth-broker-core.mjs'
import { readCurrentSessionProjectEvidence } from './devtools-session-log.mjs'
import {
  controlPortListenerEvidence,
  listenerPids,
  mainDevToolsProcesses,
  normalizeRuntimePath,
  projectPathsFromCommand,
  userDataDirFromCommand
} from './devtools-process-topology.mjs'
import { repoRoot } from './state.mjs'
import {
  resolveQaBackendTarget,
  resolveQaBackendMode
} from '../../../../../../scripts/qa/qa-backend-target.mjs'
import {
  acquireFixedQaPortLock,
  acquireQaSupervisorLease,
  createQaRuntimeStagingPath,
  deriveQaRuntime,
  ensureQaOwnerMarker,
  prepareQaRuntimeProject,
  promoteQaRuntimeGeneration,
  restoreQaRuntimeGeneration,
  qaRuntimeFixedPorts,
  reapStaleQaFixedPortLocks,
  resolveQaDevToolsProfile,
  readQaRuntimeManifest,
  qaRuntimeManifestPath,
  runtimeManifestIsReady,
  writeQaRuntimeManifest,
  watchQaRuntimeSource,
  QA_RUNTIME_CONTROL_PORT,
  QA_RUNTIME_DEVTOOLS_RUNTIME_KIND,
  QA_RUNTIME_FUNCTION_PORT_BASE,
  QA_RUNTIME_LAN_PORT,
  QA_RUNTIME_PROFILE_HOME,
  QA_RUNTIME_PROFILE_PRODUCT_HASH,
  QA_RUNTIME_REGISTRY_ROOT as QA_RUNTIME_PLANE_REGISTRY_ROOT,
  QA_RUNTIME_ROOT,
  QA_RUNTIME_SESSIONS_ROOT,
  QA_RUNTIME_WS_PORT,
  processStartIdentity
} from './qa-runtime-plane.mjs'

const LOCAL_RUNTIME_SCRIPT = path.join(repoRoot, 'scripts', 'dev', 'run-local-api-env.mjs')
const LOCAL_RUNTIME_GATEWAY_SCRIPT = path.join(
  repoRoot,
  'scripts',
  'dev',
  'local-functions-gateway.mjs'
)
const FULL_LAN_STARTUP_COMMAND = 'npm run dev:mp-weixin:local-functions:lan'
// A cold QA runtime starts eight local function workers before the mini-program
// watcher. Keep this bounded, but do not classify a healthy first boot as a
// failure merely because the host is still warming its function processes.
const START_TIMEOUT_MS = 180_000
const AUTOMATOR_STARTUP_RETRY_TIMEOUT_MS = 20_000
const AUTOMATOR_PREPARE_TIMEOUT_MS = 30_000
const AUTOMATOR_BUILD_QUIET_WINDOW_MS = 1_000
const CLEANUP_DEVTOOLS_GRACE_MS = 5000
const CLEANUP_LOCAL_RUNTIME_GRACE_MS = 8000
const QA_RUNTIME_REGISTRY_ROOT = QA_RUNTIME_PLANE_REGISTRY_ROOT
const QA_RUNTIME_LEGACY_REGISTRY_ROOT = path.join(QA_RUNTIME_SESSION_ROOT, 'registry')
const activeQaSessions = new Set()
let signalCleanupPromise = null

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function qaBackendTarget() {
  return resolveQaBackendTarget(process.env, {
    port: QA_RUNTIME_LAN_PORT,
    functionPortBase: QA_RUNTIME_FUNCTION_PORT_BASE
  })
}

function registerQaSession(session) {
  activeQaSessions.add(session)
}

function unregisterQaSession(session) {
  activeQaSessions.delete(session)
}

function installQaSignalHandlers() {
  if (installQaSignalHandlers.installed) {
    return
  }
  installQaSignalHandlers.installed = true
  const handleSignal = signal => {
    if (signalCleanupPromise) {
      return
    }
    const sessions = [...activeQaSessions]
    if (!sessions.length) {
      process.exit(128 + (signal === 'SIGTERM' ? 15 : 2))
      return
    }
    signalCleanupPromise = Promise.all(
      sessions.map(session => cleanupTestOwnedQaSession({ session }))
    ).finally(() => {
      process.exit(128 + (signal === 'SIGTERM' ? 15 : 2))
    })
  }
  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)
}

installQaSignalHandlers()

function safeSessionPart(value) {
  return String(value || 'manual')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80)
}

function localRuntimeTargetPath(session) {
  return session.localRuntimeTargetPath || session.runtimeTargetPath
}

function projectOpenEvidence(session) {
  const main = mainForSession(session)
  if (!main) {
    return false
  }
  const evidence = readCurrentSessionProjectEvidence({
    mainProcess: main,
    expectedProjectPath: session.projectPath,
    wsPort: session.wsPort,
    requireAutomatorPort: false
  })
  return evidence.status === 'bootstrap_verified'
}

function projectRuntimeLogEvidence(session) {
  const main = mainForSession(session)
  if (!main) {
    return {
      status: 'unavailable',
      rejection: 'qa_devtools_main_process_unavailable',
      runtime_lifecycle: { failures: [] }
    }
  }
  return readCurrentSessionProjectEvidence({
    mainProcess: main,
    expectedProjectPath: session.projectPath,
    wsPort: session.wsPort,
    requireAutomatorPort: false
  })
}

async function waitForProjectCompileReady(session, timeoutMs = AUTOMATOR_PREPARE_TIMEOUT_MS) {
  let previousSignature = null
  let stableSince = 0
  return waitFor(
    () => {
      const evidence = projectRuntimeLogEvidence(session)
      const failures = evidence.runtime_lifecycle?.failures ?? []
      if (failures.length) {
        const error = new Error('DevTools AppService 在 Automator 启动前已报告失败')
        error.code = 'qa_devtools_appservice_failed_before_automator'
        error.details = {
          runtime_lifecycle: evidence.runtime_lifecycle,
          project_evidence: evidence
        }
        throw error
      }
      if (
        evidence.status !== 'bootstrap_verified' ||
        !evidence.runtime_lifecycle?.compile_started_at ||
        // The official Electron /v2/auto endpoint is only reliable after the
        // AppService webview has emitted loadstop, not merely after webpack
        // output becomes quiet.
        !evidence.runtime_lifecycle?.appservice_loadstop_at ||
        !buildOutputPresent(session.projectPath)
      ) {
        previousSignature = null
        stableSince = 0
        return false
      }
      const signature = buildOutputSignature(session.projectPath)
      if (signature !== previousSignature) {
        previousSignature = signature
        stableSince = Date.now()
        return false
      }
      if (Date.now() - stableSince < AUTOMATOR_BUILD_QUIET_WINDOW_MS) {
        return false
      }
      return {
        status: 'ready_for_automator',
        project_evidence: evidence,
        build_signature: signature,
        quiet_window_ms: AUTOMATOR_BUILD_QUIET_WINDOW_MS
      }
    },
    timeoutMs,
    'project compile quiet window before Automator'
  )
}

function outputTail(filePath, maxLength = 4000) {
  try {
    return fs.readFileSync(filePath, 'utf8').slice(-maxLength)
  } catch {
    return ''
  }
}

function controlInvocationEvidence(
  action,
  result,
  session,
  transport = 'devtools_control_endpoint'
) {
  return {
    action,
    transport,
    control_port: Number(session.controlPort),
    status_code: result?.status_code ?? null,
    url: result?.url ?? '',
    body_excerpt: String(result?.body_excerpt ?? result?.error ?? '').slice(0, 1000)
  }
}

function officialCliInvocationEvidence(action, result, session, outputPath) {
  const statusCode = Number(result?.exitCode) === 0 ? 200 : null
  return {
    action,
    transport: 'official_cli',
    control_port: Number(session.controlPort),
    status_code: statusCode,
    exit_code: result?.exitCode ?? null,
    signal: result?.signal ?? null,
    timed_out: Boolean(result?.timedOut),
    pid: result?.pid ?? null,
    url: `official-cli://${session.projectPath}`,
    body_excerpt: outputTail(outputPath)
  }
}

export function cliRequiresTestProfileLogin(output) {
  const text = String(output || '')
  return /需要重新登录/u.test(text) || (/re-?login/iu.test(text) && /code\s*10/iu.test(text))
}

function sessionUsesPersistentQaProfile(session) {
  const expectedProfile = path.join(QA_RUNTIME_AUTH_PROFILE_ROOT, QA_RUNTIME_PROFILE_PRODUCT_HASH)
  return path.resolve(String(session?.profile || '')) === path.resolve(expectedProfile)
}

function resetPersistentQaTransientState(session) {
  if (!sessionUsesPersistentQaProfile(session)) {
    return { status: 'not_needed', reason: 'non_persistent_qa_profile' }
  }
  return resetTransientQaProfileState(session.profile)
}

function idePortMarkerReady(session) {
  const markerPath = path.join(session.profile, 'Default', '.ide')
  const main = mainForSession(session)
  try {
    if (Number(fs.readFileSync(markerPath, 'utf8').trim()) !== Number(session.controlPort)) {
      return false
    }
    return controlPortListenerEvidence(session.controlPort, main?.pid).verified
  } catch {
    return false
  }
}

async function launchSessionDevTools(session) {
  // The persistent QA profile is the authenticated DevTools user-data store.
  // Per-run isolation is provided by the exclusive profile lock plus the
  // explicit transient-state reset, not by replacing Chromium's user-data
  // directory with an empty directory (which would force a QR login on every
  // cold start).
  const normalizedProfile = normalizedPathOrEmpty(session.profile)
  if (!normalizedProfile || !sessionUsesPersistentQaProfile(session)) {
    const error = new Error('QA DevTools requires the persistent QA profile user-data store')
    error.code = 'qa_persistent_profile_required'
    throw error
  }
  session.devtools_user_data_dir =
    QA_RUNTIME_DEVTOOLS_RUNTIME_KIND === 'official_electron'
      ? path.dirname(normalizedProfile)
      : normalizedProfile
  session.devtools_runtime_kind = QA_RUNTIME_DEVTOOLS_RUNTIME_KIND
  session.prelaunch_ide_markers = resetQaIdePortMarkers(normalizedProfile)
  try {
    const launch = await launchTestOwnedDevTools({
      profile: session.profile,
      userDataDir: session.devtools_user_data_dir,
      controlPort: session.controlPort,
      projectPath: session.projectPath
    })
    session.devtoolsCliPid = launch.pid
    session.direct_devtools_launches = [...(session.direct_devtools_launches ?? []), launch]
    persistSessionRecord(session)
    return {
      ...launch,
      project_opened: launch.launch_mode === 'official_cli_only'
    }
  } catch (error) {
    session.direct_devtools_launches = [
      ...(session.direct_devtools_launches ?? []),
      {
        status: 'failed',
        code: error?.code || 'qa_devtools_launch_failed',
        message: error?.message || String(error),
        evidence: error?.evidence || null
      }
    ]
    persistSessionRecord(session)
    throw error
  }
}

function appendLocalRuntimePath() {
  return [path.join(repoRoot, 'node_modules', '.bin'), process.env.PATH]
    .filter(Boolean)
    .join(path.delimiter)
}

function buildOutputReady(projectPath, startedAtMs) {
  const requiredFiles = [
    path.join(projectPath, 'app.json'),
    path.join(projectPath, 'project.config.json'),
    path.join(projectPath, 'pages', 'index', 'index.js')
  ]
  return requiredFiles.every(filePath => {
    try {
      return fs.statSync(filePath).mtimeMs >= startedAtMs - 1000
    } catch {
      return false
    }
  })
}

function buildOutputPresent(projectPath) {
  const requiredFiles = [
    path.join(projectPath, 'app.json'),
    path.join(projectPath, 'project.config.json'),
    path.join(projectPath, 'pages', 'index', 'index.js')
  ]
  return requiredFiles.every(filePath => {
    try {
      return fs.statSync(filePath).isFile()
    } catch {
      return false
    }
  })
}

function buildOutputSignature(projectPath) {
  const candidates = [
    projectPath,
    path.join(projectPath, 'app.js'),
    path.join(projectPath, 'app.json'),
    path.join(projectPath, 'app.wxss'),
    path.join(projectPath, 'common', 'vendor.js'),
    path.join(projectPath, 'project.config.json'),
    path.join(projectPath, 'pages', 'index', 'index.js')
  ]
  return candidates
    .map(filePath => {
      try {
        const stat = fs.statSync(filePath)
        return `${filePath}:${stat.mtimeMs}:${stat.size}`
      } catch {
        return `${filePath}:missing`
      }
    })
    .join('|')
}

async function waitForStableBuildOutput(projectPath, timeoutMs) {
  let previousSignature = null
  let stableSince = 0
  return waitFor(
    () => {
      if (!buildOutputPresent(projectPath)) {
        previousSignature = null
        stableSince = 0
        return false
      }
      const signature = buildOutputSignature(projectPath)
      if (signature !== previousSignature) {
        previousSignature = signature
        stableSince = Date.now()
        return false
      }
      return Date.now() - stableSince >= 1000
    },
    timeoutMs,
    'stable mp-weixin build output'
  )
}

function localRuntimeStartArguments(targetPath, { reuseOutput = false } = {}) {
  const backend = qaBackendTarget()
  return [
    LOCAL_RUNTIME_SCRIPT,
    '--mode=lan',
    `--port=${QA_RUNTIME_LAN_PORT}`,
    `--function-port-base=${QA_RUNTIME_FUNCTION_PORT_BASE}`,
    `--output-dir=${targetPath}`,
    ...(backend.mode === 'online'
      ? [`--base-url=${backend.baseUrl}`, '--skip-health-check', '--no-start-functions']
      : []),
    ...(reuseOutput ? ['--reuse-output'] : []),
    '--',
    'uni',
    '-p',
    'mp-weixin'
  ]
}

function localRuntimeStartEnvironment(targetPath, forceFullLanRebuild, session) {
  const shared = currentShared()
  const openid = String(shared?.openid || '')
  const identityHash = openid ? crypto.createHash('sha256').update(openid).digest('hex') : ''
  if (!openid || identityHash !== session.identity_hash) {
    const error = new Error('QA LAN runtime 身份与 auth manifest 不一致')
    error.code = 'qa_runtime_identity_propagation_mismatch'
    error.details = {
      expected_identity_hash: session.identity_hash || null,
      observed_identity_hash: identityHash || null
    }
    throw error
  }
  return {
    ...process.env,
    PATH: appendLocalRuntimePath(),
    UNI_OUTPUT_DIR: targetPath,
    LOCAL_RUNTIME_LEASE_ROOT: path.join(QA_RUNTIME_ROOT, 'leases'),
    CLOUDBASE_LOCAL_FUNCTIONS_PORT: String(QA_RUNTIME_LAN_PORT),
    CLOUDBASE_LOCAL_FUNCTIONS_FUNCTION_PORT_BASE: String(QA_RUNTIME_FUNCTION_PORT_BASE),
    QA_BACKEND_MODE: resolveQaBackendMode(process.env),
    VITE_QA_LIVE_REAL_API: '1',
    VITE_DEV_OPENID: openid,
    QA_FULL_LAN_REBUILD_ATTEMPT: forceFullLanRebuild ? '1' : '0'
  }
}

async function startOwnedLocalRuntime({
  session,
  targetPath,
  startTimeoutMs,
  spawnProcess,
  forceFullLanRebuild,
  requireFreshBuild = true,
  reuseOutput = false
}) {
  const target = path.resolve(targetPath)
  const localRuntime = spawnProcess(
    process.execPath,
    localRuntimeStartArguments(target, { reuseOutput }),
    {
      cwd: repoRoot,
      env: localRuntimeStartEnvironment(target, forceFullLanRebuild, session),
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  if (!Number.isInteger(Number(localRuntime.pid)) || Number(localRuntime.pid) <= 0) {
    const error = new Error('本地 watcher 未返回有效 owner PID')
    error.code = 'qa_local_runtime_owner_unverified'
    throw error
  }
  session.localRuntimeTargetPath = target
  session.localRuntimePid = localRuntime.pid
  session.localRuntimeChildPid = null
  session.localRuntimeMode = 'owned'
  session.buildStartedAtMs = Date.now()
  persistSessionRecord(session)
  const localLog = path.join(session.sessionRoot, 'local-runtime.log')
  const localLogStream = fs.createWriteStream(localLog, { flags: 'a' })
  localRuntime.stdout?.on('data', chunk =>
    localLogStream.write(`[local-runtime:${target}] ${String(chunk)}`)
  )
  localRuntime.stderr?.on('data', chunk =>
    localLogStream.write(`[local-runtime:${target}] ${String(chunk)}`)
  )
  localRuntime.once('close', () => localLogStream.end())
  await waitFor(
    () => {
      const lease = localRuntimeEvidence(target)
      if (localRuntime.exitCode !== null || localRuntime.signalCode) {
        const error = new Error(
          `本地 watcher 启动失败: ${localRuntime.exitCode ?? localRuntime.signalCode}`
        )
        error.code = 'qa_local_runtime_start_failed'
        throw error
      }
      const childPid = Number(lease.value?.child_pid) || null
      if (session.localRuntimeChildPid !== childPid) {
        session.localRuntimeChildPid = childPid
        persistSessionRecord(session)
      }
      return localRuntimeOwned(lease, localRuntime.pid, target)
    },
    startTimeoutMs,
    'local LAN runtime'
  )
  if (requireFreshBuild) {
    await waitFor(
      () => buildOutputReady(target, session.buildStartedAtMs),
      startTimeoutMs,
      'fresh mp-weixin build output'
    )
    await waitForStableBuildOutput(target, startTimeoutMs)
  }
  return localRuntime
}

async function stopOwnedLocalRuntime(
  session,
  { targetPath, timeoutMs = CLEANUP_LOCAL_RUNTIME_GRACE_MS } = {}
) {
  const target = path.resolve(targetPath || localRuntimeTargetPath(session))
  const lease = localRuntimeEvidence(target)
  const ownerPid = Number(lease.value?.owner_pid) || Number(session.localRuntimePid) || null
  const childPid = Number(lease.value?.child_pid) || Number(session.localRuntimeChildPid) || null
  const targetMatches =
    !lease.value || normalizeRuntimePath(lease.value.target_path) === normalizeRuntimePath(target)
  const ownerMatches = !ownerPid || Number(ownerPid) === Number(session.localRuntimePid)
  if (
    !targetMatches ||
    !ownerMatches ||
    (ownerPid && (!localRuntimeSupervisorProcess(ownerPid) || !processAlive(ownerPid)))
  ) {
    const error = new Error(`拒绝停止未验证归属的本地 watcher: ${target}`)
    error.code = 'qa_local_runtime_owner_unverified'
    error.target_path = target
    error.lease = lease.value
    throw error
  }
  const tracked = [ownerPid, childPid].filter(Boolean)
  if (ownerPid && processAlive(ownerPid)) {
    sendSignal(ownerPid, 'SIGINT')
  }
  await waitFor(
    () => tracked.every(pid => !processAlive(pid)),
    timeoutMs,
    'local runtime graceful shutdown'
  ).catch(() => {})
  const stillAlive = tracked.filter(pid => processAlive(pid))
  if (stillAlive.length) {
    await terminateProcessIds(stillAlive, timeoutMs)
  }
  releaseStaleLocalRuntimeLease({ ...session, localRuntimeTargetPath: target })
  const after = localRuntimeEvidence(target)
  if (tracked.some(pid => processAlive(pid)) || after.value?.owner_pid || after.value?.child_pid) {
    const error = new Error(`本地 watcher 未完全退出，禁止切换 generation: ${target}`)
    error.code = 'qa_local_runtime_stop_residue'
    error.target_path = target
    error.lease = after.value
    throw error
  }
  if (normalizeRuntimePath(localRuntimeTargetPath(session)) === normalizeRuntimePath(target)) {
    session.localRuntimePid = null
    session.localRuntimeChildPid = null
    persistSessionRecord(session)
  }
  return {
    status: 'stopped',
    target_path: target,
    owner_pid: ownerPid,
    child_pid: childPid
  }
}

function localRuntimeSupervisorProcess(pid) {
  const process = processTable().find(item => Number(item.pid) === Number(pid))
  return Boolean(
    process &&
    /run-local-api-env\.mjs/.test(String(process.command || '')) &&
    /--mode=lan/.test(String(process.command || ''))
  )
}

function qaLocalRuntimeGatewayProcesses() {
  const expectedPort = `--port=${QA_RUNTIME_LAN_PORT}`
  const expectedFunctionPortBase = `--function-port-base=${QA_RUNTIME_FUNCTION_PORT_BASE}`
  return processTable().filter(item => {
    const command = String(item.command || '')
    return (
      command.includes(LOCAL_RUNTIME_GATEWAY_SCRIPT) &&
      command.includes(expectedPort) &&
      command.includes(expectedFunctionPortBase)
    )
  })
}

export function borrowedLocalRuntimeState({
  targetPath,
  leaseValue,
  supervisorAlive,
  ownerAlive,
  childAlive,
  buildPresent
} = {}) {
  const ownerPid = Number(leaseValue?.owner_pid) || null
  const childPid = Number(leaseValue?.child_pid) || null
  const targetMatches =
    normalizeRuntimePath(leaseValue?.target_path) === normalizeRuntimePath(targetPath)
  const recoverable = Boolean(
    ownerPid && supervisorAlive && ownerAlive && targetMatches && buildPresent
  )
  return {
    healthy: Boolean(recoverable && (!childPid || childAlive)),
    recoverable,
    supervisorAlive: Boolean(supervisorAlive),
    targetMatches,
    buildPresent: Boolean(buildPresent),
    ownerPid,
    childPid
  }
}

function borrowedLocalRuntimeEvidence(targetPath) {
  const lease = localRuntimeEvidence(targetPath)
  const ownerPid = Number(lease.value?.owner_pid) || null
  const childPid = Number(lease.value?.child_pid) || null
  const ownerAlive = Boolean(ownerPid && processAlive(ownerPid))
  const supervisorAlive = Boolean(ownerPid && localRuntimeSupervisorProcess(ownerPid) && ownerAlive)
  const state = borrowedLocalRuntimeState({
    targetPath,
    leaseValue: lease.value,
    supervisorAlive,
    ownerAlive,
    childAlive: !childPid || processAlive(childPid),
    buildPresent: buildOutputPresent(targetPath)
  })
  return {
    ...state,
    lease
  }
}

function sessionProfileProcessIds(session) {
  const rawProfile = String(session?.profile || '')
  if (!rawProfile) {
    return []
  }
  const profile = path.resolve(rawProfile)
  return processTable()
    .filter(item => {
      const command = String(item.command || '')
      const match = command.match(
        /--user-data-dir(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(.*?)(?=\s+-{1,2}[\w-]|\s*$))/
      )
      const userDataDir = match ? (match[1] ?? match[2] ?? match[3]?.trim() ?? '') : ''
      const normalized = userDataDir ? path.resolve(userDataDir) : ''
      return normalized === profile || normalized.startsWith(`${profile}${path.sep}`)
    })
    .map(item => Number(item.pid))
    .filter(pid => pid > 0)
}

function sessionProcessIds(session) {
  const table = processTable()
  const byPid = new Map(table.map(item => [Number(item.pid), item]))
  const ids = new Set(sessionProfileProcessIds(session))
  const verifiedMain = mainForSession(session)?.pid ?? null
  if (verifiedMain) {
    ids.add(Number(verifiedMain))
    const devToolsRoot = qaDevToolsTreeRoot(verifiedMain, byPid)
    if (devToolsRoot) {
      ids.add(Number(devToolsRoot.pid))
    }
    for (const port of [session?.wsPort, session?.controlPort].filter(Boolean)) {
      for (const pid of listenerPids(port)) {
        let current = byPid.get(Number(pid))
        const visited = new Set()
        while (current && !visited.has(Number(current.pid))) {
          if (Number(current.pid) === Number(verifiedMain)) {
            ids.add(Number(pid))
            break
          }
          visited.add(Number(current.pid))
          current = byPid.get(Number(current.parent_pid))
        }
      }
    }
  }
  for (const pid of [session?.auto_cli_pid, session?.open_cli_pid, session?.devtoolsCliPid]) {
    const item = byPid.get(Number(pid))
    if (
      item &&
      String(item.command || '').includes('wechatwebdevtools') &&
      projectPathsFromCommand(item.command).includes(normalizeRuntimePath(session.projectPath))
    ) {
      ids.add(Number(pid))
    }
  }
  const localRuntimeItem = byPid.get(Number(session?.localRuntimePid))
  if (localRuntimeItem && /run-local-api-env\.mjs/.test(String(localRuntimeItem.command || ''))) {
    ids.add(Number(session.localRuntimePid))
  }
  const lease = localRuntimeEvidence(localRuntimeTargetPath(session))
  if (
    session?.localRuntimeChildPid &&
    Number(lease.value?.child_pid) === Number(session.localRuntimeChildPid) &&
    Number(lease.value?.owner_pid) === Number(session.localRuntimePid)
  ) {
    ids.add(Number(session.localRuntimeChildPid))
  }
  for (const rootPid of [session?.localRuntimePid, verifiedMain].filter(Boolean)) {
    descendantsOf(rootPid).forEach(item => ids.add(Number(item.pid)))
  }
  for (const gateway of qaLocalRuntimeGatewayProcesses()) {
    ids.add(Number(gateway.pid))
    descendantsOf(gateway.pid).forEach(item => ids.add(Number(item.pid)))
  }
  return [...ids]
}

function sessionRecordPath(session) {
  return path.join(QA_RUNTIME_REGISTRY_ROOT, `${safeSessionPart(session.sessionId)}.json`)
}

function normalizedPathOrEmpty(value) {
  const raw = String(value || '')
  return raw ? normalizeRuntimePath(raw) : ''
}

function isWithinPath(candidate, root) {
  const normalizedCandidate = normalizedPathOrEmpty(candidate)
  const normalizedRoot = normalizedPathOrEmpty(root)
  return Boolean(
    normalizedCandidate &&
    normalizedRoot &&
    (normalizedCandidate === normalizedRoot ||
      normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`))
  )
}

function qaDevToolsTreeRoot(pid, processByPid) {
  let current = processByPid.get(Number(pid))
  const visited = new Set()
  while (current && !visited.has(Number(current.pid))) {
    visited.add(Number(current.pid))
    const parent = processByPid.get(Number(current.parent_pid))
    if (!parent || !/wechatwebdevtools/i.test(String(parent.command || ''))) {
      break
    }
    current = parent
  }
  return current
}

async function reapUnregisteredQaDevTools(protectedProfiles = []) {
  const processList = processTable()
  const processByPid = new Map(processList.map(item => [Number(item.pid), item]))
  const protectedRoots = protectedProfiles
    .map(profile => normalizedPathOrEmpty(profile))
    .filter(Boolean)
  const targets = new Map()
  const qaMainPids = new Set()
  const managedProfileRoots = [QA_RUNTIME_SESSION_ROOT, QA_RUNTIME_AUTH_PROFILE_ROOT]
  for (const main of mainDevToolsProcesses()) {
    const profile = userDataDirFromCommand(main.command)
    if (!managedProfileRoots.some(root => isWithinPath(profile, root))) {
      continue
    }
    if (protectedRoots.some(root => isWithinPath(profile, root))) {
      continue
    }
    qaMainPids.add(Number(main.pid))
    const root = qaDevToolsTreeRoot(main.pid, processByPid) || main
    targets.set(Number(root.pid), {
      pid: Number(root.pid),
      reason: 'stale_unregistered_qa_devtools_tree'
    })
  }
  for (const item of processList) {
    if (!/wechatwebdevtools\s+Daemon/i.test(String(item.command || ''))) {
      continue
    }
    const ownsQaMain = descendantsOf(item.pid).some(descendant =>
      qaMainPids.has(Number(descendant.pid))
    )
    if (ownsQaMain && !targets.has(Number(item.pid))) {
      targets.set(Number(item.pid), {
        pid: Number(item.pid),
        reason: 'stale_unregistered_qa_devtools_daemon'
      })
    }
  }
  const terminated = []
  for (const target of targets.values()) {
    const remaining = await terminateProcessTree(target.pid)
    terminated.push({ ...target, remaining })
  }
  return terminated
}

function reapStaleQaSessionDirectories(protectedRoots = []) {
  const protectedPaths = [
    ...protectedRoots,
    ...[...activeQaSessions].map(session => session.sessionRoot)
  ]
    .map(root => normalizedPathOrEmpty(root))
    .filter(Boolean)
  const liveProcessCommands = processTable()
  const removed = []
  for (const entry of fs.readdirSync(QA_RUNTIME_SESSION_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || ['locks', 'registry'].includes(entry.name)) {
      continue
    }
    const sessionRoot = path.join(QA_RUNTIME_SESSION_ROOT, entry.name)
    if (protectedPaths.some(root => isWithinPath(sessionRoot, root))) {
      continue
    }
    const hasLiveProcess = liveProcessCommands.some(item =>
      isWithinPath(userDataDirFromCommand(item.command), sessionRoot)
    )
    if (hasLiveProcess) {
      continue
    }
    try {
      fs.rmSync(sessionRoot, { recursive: true, force: true })
      removed.push(entry.name)
    } catch {
      // A concurrent cleanup pass may own the directory.
    }
  }
  return removed
}

function persistSessionRecord(session) {
  const filePath = sessionRecordPath(session)
  fs.mkdirSync(QA_RUNTIME_REGISTRY_ROOT, { recursive: true })
  const record = {
    version: 1,
    runner_pid: process.pid,
    session_id: session.sessionId,
    session_root: session.sessionRoot,
    profile: session.profile,
    home: session.home,
    devtools_user_data_dir: session.devtools_user_data_dir || null,
    profile_persistence: 'persistent_across_process_cleanup',
    project_path: session.projectPath,
    runtime_target_path: session.runtimeTargetPath,
    build_output_path: session.localRuntimeTargetPath || null,
    source_project_path: session.sourceProjectPath,
    runtime_key: session.runtime_key,
    runtime_plane_root: session.runtime_plane_root,
    runtime_manifest_path: session.runtimeTargetPath
      ? qaRuntimeManifestPath({
          runtimePath: session.runtimeTargetPath,
          runtimeKey: session.runtime_key
        })
      : null,
    identity_hash: session.identity_hash || null,
    auth_generation: session.auth_generation || null,
    devtools_package_hash: session.devtools_package_hash || null,
    runtime_channel: 'formal_qa_v3',
    local_runtime_mode: session.localRuntimeMode,
    local_runtime_pid: session.localRuntimePid,
    local_runtime_child_pid: session.localRuntimeChildPid,
    borrowed_local_runtime_pid: session.borrowedLocalRuntimePid,
    borrowed_local_runtime_child_pid: session.borrowedLocalRuntimeChildPid,
    auto_cli_pid: session.auto_cli_pid,
    open_cli_pid: session.open_cli_pid,
    open_cli_attempts: session.open_cli_attempts ?? [],
    devtools_cli_pid: session.devtoolsCliPid,
    main_devtools_pid: session.main_devtools_pid,
    startup_recovery: session.startup_recovery ?? null,
    project_list_registration: session.projectListRegistration,
    automator_port: session.wsPort,
    control_port: session.controlPort,
    updated_at: new Date().toISOString()
  }
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`)
  session.recordPath = filePath
  return filePath
}

function recordAuthFailureFromControl(session, response) {
  const body = String(response?.body_excerpt || response?.body || '')
  if (
    Number(response?.status_code) >= 400 &&
    /invalid[_ ]?token|invalid credential|not latest/iu.test(body)
  ) {
    markQaAuthServerFailure({
      authGeneration: session.auth_generation,
      identityHash: session.identity_hash,
      reason: 'devtools_control_auth_rejected'
    })
  }
}

const QA_AUTH_CONTROL_FAILURE_PATTERN =
  /invalid[_ ]?token|invalid credential|not latest|access_token is invalid/iu

function controlResponseShowsAuthFailure(response) {
  const body = String(response?.body_excerpt || response?.body || '')
  return Number(response?.status_code) >= 400 && QA_AUTH_CONTROL_FAILURE_PATTERN.test(body)
}

export function classifyQaProjectOpenFailure({
  openCli = {},
  openCliAttempts = [],
  recoveryError = null
} = {}) {
  const responses = [
    ...(Array.isArray(openCliAttempts) ? openCliAttempts : []),
    recoveryError?.details || null,
    recoveryError?.response || null
  ]
  if (
    recoveryError?.code === 'qa_auth_server_invalidated' ||
    responses.some(controlResponseShowsAuthFailure)
  ) {
    return 'qa_auth_server_invalidated'
  }
  return openCli.timedOut ? 'qa_project_open_timeout' : 'qa_project_open_failed'
}

function removeSessionRecord(session) {
  const filePath = session.recordPath || sessionRecordPath(session)
  try {
    fs.unlinkSync(filePath)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      return { status: 'blocked', file_path: filePath, error: error.message }
    }
  }
  return { status: 'removed', file_path: filePath }
}

function removeEphemeralSessionRoot(session) {
  const sessionRoot = normalizedPathOrEmpty(session.sessionRoot)
  const profile = normalizedPathOrEmpty(session.profile)
  if (profile && sessionRoot && isWithinPath(profile, sessionRoot)) {
    const error = new Error('QA 清理拒绝删除持久登录 profile：profile 不得位于临时 session 目录内')
    error.code = 'qa_persistent_profile_path_invalid'
    throw error
  }
  fs.rmSync(session.sessionRoot, { recursive: true, force: true })
}

export async function reapStaleQaSessions() {
  const registryRoots = [...new Set([QA_RUNTIME_REGISTRY_ROOT, QA_RUNTIME_LEGACY_REGISTRY_ROOT])]
  registryRoots.forEach(root => fs.mkdirSync(root, { recursive: true }))
  const records = []
  for (const registryRoot of registryRoots) {
    for (const file of fs.readdirSync(registryRoot)) {
      if (!file.endsWith('.json')) {
        continue
      }
      try {
        records.push({
          ...JSON.parse(fs.readFileSync(path.join(registryRoot, file), 'utf8')),
          __registry_root: registryRoot
        })
      } catch {
        // The owning runner may be writing the record. The next pass can retry it.
      }
    }
  }
  const protectedProfiles = records
    .filter(record => processAlive(record.runner_pid))
    .map(record => record.profile)
  const unregistered = await reapUnregisteredQaDevTools(protectedProfiles)
  const reclaimedLocks = [...reapStaleQaPortLocks(), ...reapStaleQaFixedPortLocks()]
  const removedSessionDirectories = reapStaleQaSessionDirectories(
    records.filter(record => processAlive(record.runner_pid)).map(record => record.session_root)
  )
  const recovered = []
  for (const registryRoot of registryRoots) {
    for (const file of fs.readdirSync(registryRoot)) {
      if (!file.endsWith('.json')) {
        continue
      }
      const filePath = path.join(registryRoot, file)
      let record
      try {
        record = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      } catch {
        continue
      }
      if (processAlive(record.runner_pid)) {
        continue
      }
      const staleSession = {
        ...record,
        sessionId: record.session_id,
        sessionRoot: record.session_root,
        home: record.home || null,
        devtools_user_data_dir: record.devtools_user_data_dir || record.profile || null,
        projectPath: record.project_path,
        runtimeTargetPath: record.runtime_target_path,
        sourceProjectPath: record.source_project_path,
        runtime_key: record.runtime_key,
        runtime_plane_root: record.runtime_plane_root,
        localRuntimeMode: record.local_runtime_mode || 'owned',
        localRuntimePid: record.local_runtime_pid,
        localRuntimeChildPid: record.local_runtime_child_pid,
        borrowedLocalRuntimePid: record.borrowed_local_runtime_pid,
        borrowedLocalRuntimeChildPid: record.borrowed_local_runtime_child_pid,
        auto_cli_pid: record.auto_cli_pid,
        open_cli_pid: record.open_cli_pid,
        devtoolsCliPid: record.devtools_cli_pid,
        projectListRegistration: record.project_list_registration || null,
        main_devtools_pid: record.main_devtools_pid,
        wsPort: record.automator_port,
        controlPort: record.control_port,
        portLocks: []
      }
      const before = cleanupEvidence(staleSession)
      const residue = await terminateProcessIds(sessionProcessIds(staleSession))
      releaseStaleLocalRuntimeLease(staleSession)
      const after = cleanupEvidence(staleSession)
      const projectListRestore = staleSession.runtime_plane_root
        ? { status: 'preserved_persistent_profile', reason: 'qa_runtime_plane_contract' }
        : after.session_profile_pids.length === 0
          ? restoreQaProjectInProfile(staleSession.projectListRegistration)
          : { status: 'deferred' }
      const transientProfileState = staleSession.runtime_plane_root
        ? { status: 'preserved_persistent_profile', reason: 'qa_runtime_plane_contract' }
        : after.session_profile_pids.length === 0
          ? resetPersistentQaTransientState(staleSession)
          : { status: 'deferred', reason: 'test_owned_profile_process_still_alive' }
      if (
        residue.length === 0 &&
        after.session_profile_pids.length === 0 &&
        (staleSession.localRuntimeMode === 'borrowed' ||
          (!after.local_runtime_owner_alive &&
            !after.local_runtime_child_alive &&
            !after.local_runtime_lease))
      ) {
        removeSessionRecord({ ...staleSession, recordPath: filePath })
        if (staleSession.sessionRoot && fs.existsSync(staleSession.sessionRoot)) {
          fs.rmSync(staleSession.sessionRoot, { recursive: true, force: true })
        }
      }
      recovered.push({
        session_id: staleSession.sessionId,
        before,
        after,
        residue,
        projectListRestore,
        transientProfileState
      })
    }
  }
  return { recovered, unregistered, reclaimedLocks, removedSessionDirectories }
}

export async function createTestOwnedQaSession({
  dispatchRunId,
  sourceProjectPath,
  projectPath,
  screenshotPath,
  wxRequestUrl,
  _runtimeTargetPath = QA_RUNTIME_TARGET,
  startTimeoutMs = START_TIMEOUT_MS,
  forceFullLanRebuild = false,
  fullLanRebuildReason = null,
  spawnProcess = spawn
} = {}) {
  await reapStaleQaSessions()
  ensureQaOwnerMarker({ profileHome: QA_RUNTIME_PROFILE_HOME })
  const sourceRuntime = deriveQaRuntime({ sourceProjectPath: sourceProjectPath || projectPath })
  const supervisorLease = await acquireQaSupervisorLease({ runtimeKey: sourceRuntime.runtimeKey })
  const fixedPorts = []
  try {
    for (const port of qaRuntimeFixedPorts()) {
      fixedPorts.push(
        acquireFixedQaPortLock({
          kind: port.kind,
          port: port.port,
          runtimeKey: sourceRuntime.runtimeKey
        })
      )
    }
  } catch (error) {
    fixedPorts.forEach(lock => lock.release())
    supervisorLease.release()
    throw error
  }
  const sessionId = `${safeSessionPart(dispatchRunId)}-${crypto.randomUUID()}`
  const sessionRoot = fs.mkdtempSync(
    path.join(QA_RUNTIME_SESSIONS_ROOT, `${safeSessionPart(dispatchRunId)}-`)
  )
  const session = {
    status: 'starting',
    sessionId,
    sessionRoot,
    sourceProjectPath: sourceRuntime.sourceProjectPath,
    projectPath: sourceRuntime.runtimePath,
    runtimeTargetPath: sourceRuntime.runtimePath,
    localRuntimeTargetPath: createQaRuntimeStagingPath(
      sourceRuntime,
      `${safeSessionPart(dispatchRunId)}-${sessionId}`
    ),
    runtime_key: sourceRuntime.runtimeKey,
    runtime_source_worktree: sourceRuntime.sourceWorktree,
    runtime_appid: sourceRuntime.appid,
    screenshotPath,
    wxRequestUrl,
    wsPort: QA_RUNTIME_WS_PORT,
    controlPort: QA_RUNTIME_CONTROL_PORT,
    home: null,
    profile: null,
    // Filled with the authenticated QA profile immediately after profile
    // resolution. Do not default this to an empty session directory.
    devtools_user_data_dir: null,
    profileLock: null,
    localRuntimePid: null,
    localRuntimeChildPid: null,
    localRuntimeMode: 'owned',
    borrowedLocalRuntimePid: null,
    borrowedLocalRuntimeChildPid: null,
    full_lan_rebuild_requested: forceFullLanRebuild,
    full_lan_rebuild_command: FULL_LAN_STARTUP_COMMAND,
    full_lan_rebuild_reason: fullLanRebuildReason,
    main_devtools_pid: null,
    projectListRegistration: null,
    cleanup_done: false,
    cleanup_in_progress: false,
    cleanup_attempts: 0,
    portLocks: fixedPorts,
    supervisorLease,
    runtime_plane_root: QA_RUNTIME_ROOT,
    runtime_function_port_base: QA_RUNTIME_FUNCTION_PORT_BASE
  }
  registerQaSession(session)
  try {
    persistSessionRecord(session)
    const profile = resolveQaDevToolsProfile({ profileHome: QA_RUNTIME_PROFILE_HOME })
    session.home = profile.home
    session.profile = profile.profile
    session.devtools_user_data_dir = path.resolve(session.profile)
    let authState = readQaAuthManifest()
    // A server-invalidated proof is a revalidation state, not a reason to
    // refuse the isolated QA session. The session must be able to open the
    // real QA profile and prove the identity again; only missing material is
    // a pre-start authentication block.
    if (!authState.material_ready) {
      try {
        ensureQaAuthAvailable({
          qaProfile: session.profile
        })
      } catch (error) {
        if (
          error?.code === 'qa_auth_broker_daily_unmanaged_process_conflict' ||
          error?.code === 'qa_auth_broker_daily_observed_ticket_unavailable' ||
          String(error?.code || '').startsWith('qa_auth_broker_') ||
          error?.code === 'qa_auth_identity_mismatch' ||
          error?.code === 'qa_auth_server_invalidated'
        ) {
          throw error
        }
        // The auth terminal code below remains the only source of truth. The
        // normal path asks the local single-writer broker to observe the
        // managed daily source; it never opens or mutates the daily profile.
      }
      authState = readQaAuthManifest()
    }
    if (
      !authState.material_ready ||
      authState.value?.profile_realpath !== path.resolve(profile.profile)
    ) {
      const error = new Error(authState.code || 'qa_devtools_auth_required')
      error.code = authState.code || 'qa_devtools_auth_required'
      throw error
    }
    session.identity_hash = authState.value.identity_hash
    session.auth_generation = Number(authState.value.auth_generation)
    session.profileLock = acquirePersistentProfileLock()
    session.transient_profile_state = { status: 'preserved_persistent_profile' }
    session.runtime_source_watcher = watchQaRuntimeSource(sourceRuntime, {
      onChange: change => {
        session.runtime_source_invalidated_at = new Date().toISOString()
        session.runtime_source_invalidated = change.status === 'stale'
        persistSessionRecord(session)
      }
    })
    persistSessionRecord(session)
    const activeManifest = readQaRuntimeManifest(session.runtimeTargetPath)
    const backend = qaBackendTarget()
    const canReuseActiveGeneration = Boolean(
      !forceFullLanRebuild &&
      runtimeManifestIsReady(sourceRuntime, activeManifest) &&
      buildOutputPresent(session.runtimeTargetPath) &&
      activeManifest.identity_hash === session.identity_hash &&
      activeManifest.api_base_url === backend.baseUrl
    )
    let builtRuntime = sourceRuntime
    let readyManifest
    if (canReuseActiveGeneration) {
      // A same-identity WeChat auth ticket can rotate while the persistent
      // QA DevTools session remains healthy. The ticket generation is
      // manifest/session evidence, not compiled app input; rebuilding the
      // unchanged mirror here creates a new runtime generation during an
      // otherwise normal cold start. Keep the source/runtime identity gates
      // above strict, and atomically refresh only the manifest generation
      // metadata when auth_generation changed.
      const reusedManifest =
        Number(activeManifest.auth_generation) === Number(session.auth_generation)
          ? activeManifest
          : writeQaRuntimeManifest(sourceRuntime, {
              generation: Number(activeManifest.generation),
              api_base_url: activeManifest.api_base_url,
              build_output_path: activeManifest.build_output_path,
              build_status: activeManifest.build_status,
              built_at: activeManifest.built_at,
              identity_hash: session.identity_hash,
              auth_generation: session.auth_generation,
              qa_owner_pid: activeManifest.qa_owner_pid,
              lan_owner_pid: activeManifest.lan_owner_pid,
              devtools_owner_pid: activeManifest.devtools_owner_pid,
              devtools_package_hash: activeManifest.devtools_package_hash
            })
      session.generation_switch = {
        status: reusedManifest === activeManifest ? 'reused' : 'reused_auth_generation_refresh',
        generation: Number(reusedManifest.generation),
        active_path: session.runtimeTargetPath,
        source_fingerprint: sourceRuntime.sourceFingerprint,
        auth_generation: Number(session.auth_generation),
        reused_at: new Date().toISOString()
      }
      session.localRuntimeTargetPath = session.runtimeTargetPath
      await startOwnedLocalRuntime({
        session,
        targetPath: session.runtimeTargetPath,
        startTimeoutMs,
        spawnProcess,
        forceFullLanRebuild: false,
        requireFreshBuild: false,
        reuseOutput: true
      })
      readyManifest = reusedManifest
    } else {
      writeQaRuntimeManifest(sourceRuntime, {
        api_base_url: qaBackendTarget().baseUrl,
        build_status: 'building',
        built_at: null,
        qa_owner_pid: process.pid,
        lan_owner_pid: null,
        devtools_owner_pid: null,
        devtools_package_hash: ''
      })
      await startOwnedLocalRuntime({
        session,
        targetPath: localRuntimeTargetPath(session),
        startTimeoutMs,
        spawnProcess,
        forceFullLanRebuild
      })
      builtRuntime = deriveQaRuntime({ sourceProjectPath: session.sourceProjectPath })
      if (builtRuntime.runtimeKey !== sourceRuntime.runtimeKey) {
        const error = new Error('源码 appid 或工作树发生变化，QA runtime key 已改变')
        error.code = 'qa_runtime_key_changed'
        throw error
      }
      if (
        builtRuntime.sourceHead !== sourceRuntime.sourceHead ||
        builtRuntime.sourceFingerprint !== sourceRuntime.sourceFingerprint ||
        builtRuntime.backendSourceFingerprint !== sourceRuntime.backendSourceFingerprint ||
        builtRuntime.qaHarnessFingerprint !== sourceRuntime.qaHarnessFingerprint
      ) {
        const error = new Error('源码在 QA generation 构建期间发生变化，拒绝发布不一致镜像')
        error.code = 'qa_source_changed_during_build'
        throw error
      }
      const stagedRuntime = { ...builtRuntime, runtimePath: localRuntimeTargetPath(session) }
      prepareQaRuntimeProject(stagedRuntime, {
        sessionId: session.sessionId,
        projectPath: session.projectPath
      })
      const stoppedGeneration = await stopOwnedLocalRuntime(session, {
        targetPath: localRuntimeTargetPath(session)
      })
      let promotedGeneration = null
      try {
        promotedGeneration = promoteQaRuntimeGeneration(builtRuntime, {
          stagingPath: localRuntimeTargetPath(session),
          token: session.sessionId
        })
        session.generation_switch = promotedGeneration
        session.localRuntimeTargetPath = session.runtimeTargetPath
        await startOwnedLocalRuntime({
          session,
          targetPath: session.runtimeTargetPath,
          startTimeoutMs,
          spawnProcess,
          forceFullLanRebuild,
          requireFreshBuild: false,
          reuseOutput: true
        })
      } catch (error) {
        let rollback = null
        let cleanupError = null
        try {
          if (session.localRuntimePid) {
            await stopOwnedLocalRuntime(session, { targetPath: session.runtimeTargetPath })
          }
        } catch (stopError) {
          cleanupError = stopError
        }
        if (promotedGeneration?.retired_path) {
          try {
            rollback = restoreQaRuntimeGeneration(builtRuntime, {
              retiredPath: promotedGeneration.retired_path,
              token: session.sessionId
            })
          } catch (rollbackError) {
            error.code = 'qa_generation_rollback_failed'
            error.rollback_error = rollbackError.message
          }
        }
        error.generation_rollback = rollback
        error.generation_cleanup_error = cleanupError?.message || null
        throw error
      }
      session.generation_switch = {
        ...session.generation_switch,
        stopped_generation: stoppedGeneration,
        restarted_active_runtime: {
          status: 'started',
          target_path: session.runtimeTargetPath,
          owner_pid: session.localRuntimePid,
          child_pid: session.localRuntimeChildPid
        }
      }
      readyManifest = writeQaRuntimeManifest(builtRuntime, {
        api_base_url: qaBackendTarget().baseUrl,
        build_output_path: session.projectPath,
        build_status: 'ready',
        built_at: new Date().toISOString(),
        identity_hash: session.identity_hash,
        auth_generation: session.auth_generation,
        qa_owner_pid: process.pid,
        lan_owner_pid: session.localRuntimePid,
        devtools_owner_pid: null,
        devtools_package_hash: ''
      })
    }
    session.projectListRegistration = registerQaProjectInProfile({
      profilePath: session.profile,
      projectPath: session.projectPath,
      sourceProjectPath: session.sourceProjectPath,
      runtimeKey: session.runtime_key,
      projectConfig: JSON.parse(
        fs.readFileSync(path.join(session.projectPath, 'project.config.json'), 'utf8')
      )
    })
    persistSessionRecord(session)
    session.user_devtools_cleanup = {
      status: 'not_needed',
      protected_root: 'user-owned DevTools are not part of the QA ownership set',
      terminated: [],
      reason: 'isolated_profile_and_ports'
    }
    const initialDevToolsLaunch = await launchSessionDevTools(session)
    session.initial_devtools_launch = initialDevToolsLaunch
    if (initialDevToolsLaunch.runtime_kind === 'official_electron') {
      const appAsar = initialDevToolsLaunch.runtime_package
      if (!appAsar || !fs.existsSync(appAsar)) {
        const error = new Error('QA official DevTools app.asar is unavailable')
        error.code = 'qa_devtools_app_asar_unavailable'
        throw error
      }
      session.devtools_package_hash = sha256File(appAsar)
      session.devtools_package_boundary = 'installed_app_asar'
    } else {
      const launchedPackage = initialDevToolsLaunch.args?.[0]
      const launchedPackageCore = launchedPackage ? path.join(launchedPackage, 'core.wxvpkg') : null
      if (!launchedPackageCore || !fs.existsSync(launchedPackageCore)) {
        const error = new Error('QA DevTools package core is unavailable')
        error.code = 'qa_devtools_package_unavailable'
        throw error
      }
      session.devtools_package_hash = sha256File(launchedPackageCore)
      session.devtools_package_boundary = 'installed_native_package'
    }
    persistSessionRecord(session)
    await waitFor(
      () => mainForSession(session),
      startTimeoutMs,
      'test-owned DevTools direct launch'
    )
    await waitFor(
      () => idePortMarkerReady(session),
      startTimeoutMs,
      'test-owned DevTools control-port marker'
    )
    const devtoolsLog = path.join(sessionRoot, 'devtools.log')
    let startupRecovery = null
    const openCliAttempts = []
    const openProjectWithOfficialCli = async ({ record = true } = {}) => {
      const result = await runDevToolsCli({
        home: session.home,
        args: ['open', '--project', session.projectPath, '--port', String(session.controlPort)],
        outputPath: devtoolsLog,
        timeoutMs: startTimeoutMs
      })
      const invocation = officialCliInvocationEvidence('open', result, session, devtoolsLog)
      const normalized = {
        ...result,
        status_code: invocation.status_code,
        url: invocation.url,
        body_excerpt: invocation.body_excerpt,
        invocation
      }
      if (record) {
        openCliAttempts.push(invocation)
        session.open_cli_pid = result.pid ?? null
        session.open_cli_exit_code = result.exitCode ?? null
        session.open_cli_timed_out = Boolean(result.timedOut)
        session.open_cli_attempts = openCliAttempts
        persistSessionRecord(session)
      }
      return normalized
    }
    const recoveryControlRequest = async ({ action, projectPath, controlPort, wsPort }) => {
      if (session.devtools_runtime_kind === 'official_electron' && action === 'auto') {
        const result = await requestDevToolsControl({
          action,
          projectPath,
          controlPort,
          wsPort,
          protocol: 'v2'
        })
        return {
          ...result,
          transport: 'devtools_control_endpoint_v2'
        }
      }
      return requestDevToolsControl({ action, projectPath, controlPort, wsPort })
    }
    const openCli = await openProjectWithOfficialCli()
    if (cliRequiresTestProfileLogin(openCli.body_excerpt)) {
      session.runtime_evidence = {
        status: 'unavailable',
        project_open_attempts: openCliAttempts,
        authentication: 'test_profile_login_required'
      }
      persistSessionRecord(session)
      const error = new Error('测试专属 DevTools profile 需要重新登录（官方 CLI code 10）')
      error.code = 'qa_test_profile_login_required'
      throw error
    }
    if (openCli.timedOut || openCli.exitCode !== 0) {
      try {
        startupRecovery = await recoverTestOwnedDevToolsStartup({
          session,
          home: session.home,
          outputPath: devtoolsLog,
          mainForSessionFn: mainForSession,
          projectOpenEvidenceFn: projectOpenEvidence,
          idePortReadyFn: idePortMarkerReady,
          controlRequest: recoveryControlRequest,
          launchDevTools: () => launchSessionDevTools(session),
          openProjectFn: () => openProjectWithOfficialCli({ record: false }),
          projectCompileReadyFn: waitForProjectCompileReady,
          onInvocation: (invocation, result) => {
            recordAuthFailureFromControl(session, result)
            openCliAttempts.push({
              ...invocation,
              output_tail: outputTail(devtoolsLog)
            })
            if (invocation.action === 'open') {
              session.open_cli_pid = result?.pid ?? null
              session.open_cli_exit_code = result?.exitCode ?? (result?.status_code === 200 ? 0 : 1)
              session.open_cli_timed_out = Boolean(result?.timedOut)
            }
            session.open_cli_attempts = openCliAttempts
            persistSessionRecord(session)
          }
        })
        session.startup_recovery = startupRecovery
        persistSessionRecord(session)
      } catch (recoveryError) {
        const primaryFailure = {
          action: 'open',
          response: openCliAttempts[0] || null
        }
        const cleanupFailure = {
          code: recoveryError?.code || 'qa_startup_recovery_failed',
          message: recoveryError?.message || String(recoveryError),
          details: recoveryError?.details || null,
          recovery_invocations: recoveryError?.recovery_invocations || openCliAttempts
        }
        session.runtime_evidence = {
          status: 'unavailable',
          project_open_attempts: openCliAttempts,
          project_open_recovery: startupRecovery,
          primary_failure: primaryFailure,
          cleanup_failure: cleanupFailure
        }
        session.startup_recovery = {
          status: 'failed',
          primary_failure: primaryFailure,
          cleanup_failure: cleanupFailure
        }
        persistSessionRecord(session)
        const error = new Error(
          `隔离项目打开失败，已完成一次测试专属恢复：${recoveryError.message}`
        )
        error.code = classifyQaProjectOpenFailure({
          openCli,
          openCliAttempts,
          recoveryError
        })
        error.details = {
          primary_failure: primaryFailure,
          cleanup_failure: cleanupFailure,
          terminal_code: error.code
        }
        throw error
      }
    }
    session.runtime_evidence = {
      status: 'starting',
      project_open_attempts: openCliAttempts,
      project_open_recovery: startupRecovery,
      project_compile_ready: null,
      auto_control: null,
      final_runtime_evidence: null
    }
    persistSessionRecord(session)
    await waitFor(
      () => mainForSession(session),
      startTimeoutMs,
      'test-owned DevTools after project open'
    )
    await waitFor(
      () => projectOpenEvidence(session),
      startTimeoutMs,
      'test-owned project open after project open'
    )
    // FileUtils/ProjectConfig evidence only proves that the IDE accepted the
    // project. Wait for the current compile event and a real quiet window in
    // the fixed mirror. A blind sleep is unsafe because DevTools may still be
    // replacing the AppService webview when /auto is sent.
    const projectCompileReady = await waitForProjectCompileReady(
      session,
      AUTOMATOR_PREPARE_TIMEOUT_MS
    )
    session.runtime_evidence.project_compile_ready = projectCompileReady
    persistSessionRecord(session)
    // The official Electron CLI exposes the Automator port through its hidden
    // --auto-port option. Legacy native bundles retain the verified control
    // endpoint path; the two mechanisms must not be conflated.
    let autoControlRecovery = null
    if (session.devtools_runtime_kind === 'official_electron') {
      const autoResult = await requestDevToolsControl({
        action: 'auto',
        projectPath: session.projectPath,
        controlPort: session.controlPort,
        wsPort: session.wsPort,
        protocol: 'v2'
      })
      session.auto_control = {
        ...controlInvocationEvidence('auto', autoResult, session, 'devtools_control_endpoint_v2'),
        automator_port: session.wsPort,
        protocol: 'v2',
        request_query: {
          project: session.projectPath,
          autoPort: String(session.wsPort)
        }
      }

      // The official Electron endpoint can apply the automation switch and
      // then keep the HTTP request open until its renderer work settles. A
      // socket timeout therefore does not prove that the switch failed. Keep
      // the transport result intact, but accept it only after the QA-owned
      // 9421 listener and project identity are independently verified.
      if (
        Number(autoResult?.status_code) !== 200 &&
        autoResult?.error === 'devtools_control_timeout'
      ) {
        try {
          autoControlRecovery = await waitFor(
            () => {
              const evidence = ownedRuntimeEvidence(session)
              if (evidence.session_log_evidence?.runtime_lifecycle?.failures?.length) {
                const runtimeFailure = new Error('DevTools AppService 在 Automator 控制超时后报告失败')
                runtimeFailure.code = 'qa_devtools_appservice_failed_after_automator_control_timeout'
                runtimeFailure.details = {
                  runtime_lifecycle: evidence.session_log_evidence.runtime_lifecycle,
                  runtime_evidence: evidence
                }
                throw runtimeFailure
              }
              return evidence.status === 'verified' ? evidence : false
            },
            Math.min(startTimeoutMs, AUTOMATOR_STARTUP_RETRY_TIMEOUT_MS),
            'test-owned Automator runtime after control timeout'
          )
        } catch (error) {
          if (error.code !== 'qa_runtime_start_timeout') {
            throw error
          }
          autoControlRecovery = null
        }
      }
      session.auto_control = {
        ...session.auto_control,
        transport_status_code: autoResult?.status_code ?? null,
        recovered_runtime: autoControlRecovery
          ? {
              status: autoControlRecovery.status,
              automator_port: autoControlRecovery.automator_port,
              main_devtools_pid: autoControlRecovery.main_devtools_pid,
              automation_listener_pid: autoControlRecovery.automation_listener_pid,
              project_identity_verified: autoControlRecovery.project_identity_verified,
              verification: 'owned_runtime_evidence_after_control_timeout'
            }
          : null
      }
    } else if (startupRecovery) {
      const recoveredAuto = startupRecovery.invocations.find(item => item.action === 'auto')
      session.auto_control = recoveredAuto ?? null
    } else {
      const autoControl = await requestDevToolsControl({
        action: 'auto',
        projectPath: session.projectPath,
        controlPort: session.controlPort,
        wsPort: session.wsPort
      })
      session.auto_control = {
        ...controlInvocationEvidence('auto', autoControl, session),
        automator_port: session.wsPort
      }
      fs.appendFileSync(
        devtoolsLog,
        `[devtools-control] ${JSON.stringify({ action: 'auto', ...session.auto_control })}\n`
      )
    }
    session.auto_cli_pid = null
    session.auto_cli_exit_code = null
    session.auto_cli_timed_out = false
    session.runtime_evidence = {
      ...session.runtime_evidence,
      status: 'automator_starting',
      auto_control: session.auto_control,
      project_compile_ready: projectCompileReady
    }
    persistSessionRecord(session)
    const automatorControlPassed =
      Number(session.auto_control?.status_code) === 200 ||
      session.auto_control?.recovered_runtime?.status === 'verified'
    if (!automatorControlPassed) {
      const error = new Error(
        `Automator 端口开启失败，DevTools control status: ${session.auto_control?.status_code ?? 'unknown'}`
      )
      error.code = 'qa_automator_enable_failed'
      throw error
    }
    const detectedMain = await waitFor(
      () => mainForSession(session),
      startTimeoutMs,
      'test-owned DevTools'
    )
    session.main_devtools_pid = detectedMain.pid
    persistSessionRecord(session)
    await waitFor(() => projectOpenEvidence(session), startTimeoutMs, 'test-owned project open')
    let runtime
    let finalRuntimeEvidence = null
    try {
      runtime = await waitFor(
        () => {
          const evidence = ownedRuntimeEvidence(session)
          finalRuntimeEvidence = evidence
          if (evidence.session_log_evidence?.runtime_lifecycle?.failures?.length) {
            const runtimeFailure = new Error('DevTools AppService 在 Automator 建链期间报告失败')
            runtimeFailure.code = 'qa_devtools_appservice_failed_during_automator_start'
            runtimeFailure.details = {
              runtime_lifecycle: evidence.session_log_evidence.runtime_lifecycle,
              runtime_evidence: evidence
            }
            throw runtimeFailure
          }
          return evidence.status === 'verified' ? evidence : false
        },
        Math.min(startTimeoutMs, AUTOMATOR_STARTUP_RETRY_TIMEOUT_MS),
        'test-owned Automator runtime initial startup'
      )
    } catch (error) {
      if (error.code !== 'qa_runtime_start_timeout') {
        throw error
      }
      if (startupRecovery) {
        throw error
      }
      session.runtime_evidence = {
        ...session.runtime_evidence,
        status: 'automator_unavailable_before_recovery',
        final_runtime_evidence: finalRuntimeEvidence,
        project_runtime_log: projectRuntimeLogEvidence(session)
      }
      persistSessionRecord(session)
      startupRecovery = await recoverTestOwnedDevToolsStartup({
        session,
        home: session.home,
        outputPath: devtoolsLog,
        mainForSessionFn: mainForSession,
        projectOpenEvidenceFn: projectOpenEvidence,
        idePortReadyFn: idePortMarkerReady,
        controlRequest: recoveryControlRequest,
        launchDevTools: () => launchSessionDevTools(session),
        openProjectFn: () => openProjectWithOfficialCli({ record: false }),
        projectCompileReadyFn: waitForProjectCompileReady
      })
      runtime = await waitFor(
        () => {
          const evidence = ownedRuntimeEvidence(session)
          return evidence.status === 'verified' ? evidence : false
        },
        startTimeoutMs,
        'test-owned Automator runtime after startup recovery'
      )
    }
    session.main_devtools_pid = runtime.main_devtools_pid
    session.devtoolsCliPid = null
    session.startup_recovery = startupRecovery
    const runtimeManifest = writeQaRuntimeManifest(builtRuntime, {
      generation: readyManifest.generation,
      api_base_url: qaBackendTarget().baseUrl,
      build_output_path: session.projectPath,
      build_status: 'ready',
      built_at: readyManifest.built_at,
      identity_hash: session.identity_hash,
      auth_generation: session.auth_generation,
      qa_owner_pid: process.pid,
      lan_owner_pid: session.localRuntimePid,
      devtools_owner_pid: runtime.main_devtools_pid,
      devtools_package_hash: session.devtools_package_hash
    })
    if (!runtimeManifestIsReady(builtRuntime, runtimeManifest)) {
      const error = new Error('QA runtime manifest did not become runtime-ready')
      error.code = 'qa_runtime_manifest_invalid'
      error.manifest = runtimeManifest
      throw error
    }
    session.status = 'ready'
    persistSessionRecord(session)
    session.runtime_evidence = {
      backend_mode: resolveQaBackendMode(process.env),
      backend_base_url: qaBackendTarget().baseUrl,
      mode:
        session.localRuntimeMode === 'borrowed'
          ? 'borrowed_user_lan_runtime'
          : 'test_owned_runtime',
      owned: session.localRuntimeMode !== 'borrowed',
      local_runtime_owner: session.localRuntimeMode === 'borrowed' ? 'user_owned' : 'qa_owned',
      session_id: session.sessionId,
      profile: session.profile,
      identity_hash: session.identity_hash,
      auth_generation: session.auth_generation,
      profile_persistence: 'persistent_across_process_cleanup',
      automator_port: session.wsPort,
      control_port: session.controlPort,
      main_devtools_pid: runtime.main_devtools_pid,
      process_start_identity: processStartIdentity(runtime.main_devtools_pid),
      local_runtime_pid: session.localRuntimePid,
      local_runtime_child_pid: session.localRuntimeChildPid,
      local_runtime_target_path: localRuntimeTargetPath(session),
      borrowed_local_runtime_pid: session.borrowedLocalRuntimePid,
      borrowed_local_runtime_child_pid: session.borrowedLocalRuntimeChildPid,
      full_lan_rebuild_requested: session.full_lan_rebuild_requested,
      full_lan_rebuild_command: session.full_lan_rebuild_command,
      full_lan_rebuild_reason: session.full_lan_rebuild_reason,
      build_started_at: session.buildStartedAtMs
        ? new Date(session.buildStartedAtMs).toISOString()
        : null,
      devtools_cli_pid: session.devtoolsCliPid,
      open_cli_pid: session.open_cli_pid,
      open_cli_exit_code: session.open_cli_exit_code,
      open_cli_attempts: session.open_cli_attempts ?? [],
      auto_cli_pid: session.auto_cli_pid,
      auto_cli_exit_code: session.auto_cli_exit_code,
      auto_control: session.auto_control ?? null,
      startup_recovery: session.startup_recovery ?? null,
      devtools_package_hash: session.devtools_package_hash,
      user_devtools_cleanup: session.user_devtools_cleanup,
      ...runtime
    }
    session.preflight_options = {
      projectPath: session.projectPath,
      wsPort: session.wsPort,
      wsEndpoint: `ws://127.0.0.1:${session.wsPort}`,
      runtimeChannel: 'formal_qa_v3',
      initialRoute: '/pages/index/index',
      screenshotPath,
      wxRequestUrl,
      allowTargetedRestart: true,
      requireAuthenticatedWxRequest: true,
      requireIsolatedProject: true,
      runtime,
      preverifiedRuntime: runtime,
      runtimeInspector: () => ownedRuntimeEvidence(session),
      recoveryExecutor: recoverVerifiedTargetDevTools,
      lanFlowProbe: () => {
        if (session.localRuntimeMode === 'borrowed') {
          return borrowedLocalRuntimeEvidence(session.runtimeTargetPath).healthy
        }
        return localRuntimeOwned(
          localRuntimeEvidence(localRuntimeTargetPath(session)),
          session.localRuntimePid,
          localRuntimeTargetPath(session)
        )
      }
    }
    return session
  } catch (error) {
    const cleanup = await cleanupTestOwnedQaSession({ session })
    return {
      ...session,
      status: 'failed_environment',
      code: error.code || 'qa_owned_runtime_start_failed',
      reason: error.message,
      runtime_cleanup: cleanup
    }
  }
}

export async function cleanupTestOwnedQaSession({ session } = {}) {
  if (!session) {
    return { status: 'not_needed', code: 'qa_runtime_not_started' }
  }
  if (session.cleanup_done) {
    return session.runtime_cleanup || { status: 'terminated', code: 'already_cleaned' }
  }
  if (session.cleanup_in_progress) {
    try {
      return await waitFor(
        () => (session.cleanup_done ? session.runtime_cleanup : false),
        CLEANUP_DEVTOOLS_GRACE_MS + CLEANUP_LOCAL_RUNTIME_GRACE_MS + 1000,
        'existing QA runtime cleanup'
      )
    } catch {
      return { status: 'blocked', code: 'qa_runtime_cleanup_in_progress' }
    }
  }
  session.cleanup_in_progress = true
  session.cleanup_attempts = Number(session.cleanup_attempts || 0) + 1
  const before = {
    ...cleanupEvidence(session),
    local_runtime_gateway_pids: qaLocalRuntimeGatewayProcesses().map(item => Number(item.pid))
  }
  const trackedBefore = sessionProcessIds(session)
  try {
    if (session.controlPort && before.control_listener_pids.length) {
      await requestDevToolsControl({
        action: 'close',
        projectPath: session.projectPath,
        controlPort: session.controlPort,
        wsPort: session.wsPort
      })
      await runDevToolsCli({
        home: session.home,
        args: ['quit', '--port', String(session.controlPort)],
        outputPath: path.join(session.sessionRoot, 'devtools.log'),
        timeoutMs: 15_000
      }).catch(() => {})
    }
    session.runtime_source_watcher?.stop?.()
    session.runtime_source_watcher = null
    await waitFor(
      () =>
        !mainForSession(session) && cleanupEvidence(session).automator_listener_pids.length === 0,
      CLEANUP_DEVTOOLS_GRACE_MS,
      'DevTools graceful shutdown'
    ).catch(() => {})
    const ownedMain = mainForSession(session)
    if (ownedMain) {
      await terminateProcessTree(ownedMain.pid)
    }
    await terminateProcessIds(
      [
        ...trackedBefore,
        session.auto_cli_pid,
        session.open_cli_pid,
        session.devtoolsCliPid,
        session.main_devtools_pid
      ],
      CLEANUP_DEVTOOLS_GRACE_MS
    )
    const orphanedListenerPids = new Set([
      ...before.control_listener_pids,
      ...before.automator_listener_pids,
      ...cleanupEvidence(session).control_listener_pids,
      ...cleanupEvidence(session).automator_listener_pids
    ])
    for (const pid of orphanedListenerPids) {
      await terminateProcessTree(pid)
    }
    const ownedLocalRuntimePids = new Set(sessionProcessIds(session))
    if (ownedLocalRuntimePids.size) {
      if (session.localRuntimePid && ownedLocalRuntimePids.has(Number(session.localRuntimePid))) {
        sendSignal(session.localRuntimePid, 'SIGINT')
      }
      if (
        session.localRuntimeChildPid &&
        session.localRuntimeChildPid !== session.localRuntimePid &&
        ownedLocalRuntimePids.has(Number(session.localRuntimeChildPid))
      ) {
        sendSignal(session.localRuntimeChildPid, 'SIGINT')
      }
      await waitFor(
        () => !processAlive(session.localRuntimePid) && !processAlive(session.localRuntimeChildPid),
        CLEANUP_LOCAL_RUNTIME_GRACE_MS,
        'local runtime graceful shutdown'
      ).catch(() => {})
      await terminateProcessIds([...ownedLocalRuntimePids], CLEANUP_LOCAL_RUNTIME_GRACE_MS)
    }
    releaseStaleLocalRuntimeLease(session)
    session.user_devtools_cleanup_after = {
      status: 'not_needed',
      protected_root: 'user-owned DevTools are not part of the QA ownership set',
      terminated: [],
      reason: 'isolated_profile_and_ports'
    }
    const after = {
      ...cleanupEvidence(session),
      local_runtime_gateway_pids: qaLocalRuntimeGatewayProcesses().map(item => Number(item.pid))
    }
    const projectListRestore = session.runtime_plane_root
      ? { status: 'preserved_persistent_profile', reason: 'qa_runtime_plane_contract' }
      : after.session_profile_pids.length === 0
        ? restoreQaProjectInProfile(session.projectListRegistration)
        : { status: 'deferred' }
    const transientProfileState = session.runtime_plane_root
      ? { status: 'preserved_persistent_profile', reason: 'qa_runtime_plane_contract' }
      : after.session_profile_pids.length === 0
        ? resetPersistentQaTransientState(session)
        : { status: 'deferred', reason: 'test_owned_profile_process_still_alive' }
    const clean =
      after.main_pid === null &&
      after.control_listener_pids.length === 0 &&
      after.automator_listener_pids.length === 0 &&
      (session.localRuntimeMode === 'borrowed' ||
        (!after.local_runtime_owner_alive && !after.local_runtime_child_alive)) &&
      after.local_runtime_gateway_pids.length === 0 &&
      !after.auto_cli_alive &&
      after.session_profile_pids.length === 0 &&
      (session.localRuntimeMode === 'borrowed' || !after.local_runtime_lease)
    for (const lock of session.portLocks || []) {
      lock.release()
    }
    session.supervisorLease?.release()
    if (clean) {
      session.profileLock?.release()
      session.cleanup_done = true
      unregisterQaSession(session)
      removeSessionRecord(session)
      removeEphemeralSessionRoot(session)
    }
    const result = {
      status: clean ? 'terminated' : 'cleanup_failed',
      code: clean ? 'test_owned_runtime_terminated' : 'qa_owned_runtime_residue',
      before,
      after,
      user_devtools_cleanup_before: session.user_devtools_cleanup ?? null,
      user_devtools_cleanup_after: session.user_devtools_cleanup_after ?? null,
      ports: { automator: session.wsPort, control: session.controlPort },
      session_id: session.sessionId,
      transient_profile_state: transientProfileState
    }
    result.project_list_restore = projectListRestore
    session.runtime_cleanup = result
    session.cleanup_in_progress = false
    if (!clean && session.recordPath) {
      persistSessionRecord(session)
    }
    return result
  } catch (error) {
    for (const lock of session.portLocks || []) {
      lock.release()
    }
    session.supervisorLease?.release()
    if (!session.profile || !session.profileLock) {
      session.profileLock?.release()
    }
    session.cleanup_in_progress = false
    const result = {
      status: 'cleanup_failed',
      code: error.code || 'qa_owned_runtime_cleanup_failed',
      reason: error.message,
      before,
      after: cleanupEvidence(session),
      user_devtools_cleanup_before: session.user_devtools_cleanup ?? null,
      user_devtools_cleanup_after: session.user_devtools_cleanup_after ?? null,
      session_id: session.sessionId
    }
    if (!session.runtime_plane_root && sessionProfileProcessIds(session).length === 0) {
      result.project_list_restore = restoreQaProjectInProfile(session.projectListRegistration)
    }
    session.runtime_cleanup = result
    if (session.recordPath) {
      persistSessionRecord(session)
    }
    return result
  }
}

export function qaCleanupPassed(cleanup) {
  return ['terminated', 'not_needed'].includes(cleanup?.status)
}

export const testOwnedQaRuntimeRoot = QA_RUNTIME_SESSION_ROOT
export const testOwnedRuntimeModulePath = fileURLToPath(import.meta.url)
