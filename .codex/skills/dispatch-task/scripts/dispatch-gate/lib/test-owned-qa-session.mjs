import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  allocatePortLock,
  cleanupEvidence,
  cloneTestProfile,
  descendantsOf,
  localRuntimeEvidence,
  localRuntimeOwned,
  mainForSession,
  ownedRuntimeEvidence,
  processAlive,
  processTable,
  QA_RUNTIME_PROFILE_PRODUCT_HASH,
  QA_RUNTIME_SESSION_ROOT,
  QA_RUNTIME_AUTH_PROFILE_ROOT,
  QA_RUNTIME_TARGET,
  reapStaleQaPortLocks,
  releaseStaleLocalRuntimeLease,
  registerQaProjectInProfile,
  resetTransientQaProfileState,
  runDevToolsCli,
  sendSignal,
  terminateProcessIds,
  terminateProcessTree,
  restoreQaProjectInProfile,
  waitFor
} from './test-owned-qa-support.mjs'
import { requestDevToolsControl } from './devtools-runtime-control.mjs'
import { recoverTestOwnedDevToolsStartup } from './test-owned-qa-startup-recovery.mjs'
import { launchTestOwnedDevTools } from './test-owned-devtools-launch.mjs'
import { readCurrentSessionProjectEvidence } from './devtools-session-log.mjs'
import {
  listenerPids,
  mainDevToolsProcesses,
  normalizeRuntimePath,
  projectPathsFromCommand,
  userDataDirFromCommand
} from './devtools-process-topology.mjs'
import { repoRoot } from './state.mjs'

const LOCAL_RUNTIME_SCRIPT = path.join(repoRoot, 'scripts', 'dev', 'run-local-api-env.mjs')
const FULL_LAN_STARTUP_COMMAND = 'npm run dev:mp-weixin:local-functions:lan'
const START_TIMEOUT_MS = 90_000
const AUTOMATOR_STARTUP_RETRY_TIMEOUT_MS = 20_000
const AUTOMATOR_PREPARE_DELAY_MS = 4_000
const CLEANUP_DEVTOOLS_GRACE_MS = 5000
const CLEANUP_LOCAL_RUNTIME_GRACE_MS = 8000
const QA_RUNTIME_REGISTRY_ROOT = path.join(QA_RUNTIME_SESSION_ROOT, 'registry')
const activeQaSessions = new Set()
let signalCleanupPromise = null

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

function outputTail(filePath, maxLength = 4000) {
  try {
    return fs.readFileSync(filePath, 'utf8').slice(-maxLength)
  } catch {
    return ''
  }
}

function cliInvocationEvidence(action, result, outputPath) {
  return {
    action,
    pid: result.pid ?? null,
    exit_code: result.exitCode ?? null,
    timed_out: Boolean(result.timedOut),
    output_tail: outputTail(outputPath)
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
  try {
    return Number(fs.readFileSync(markerPath, 'utf8').trim()) === Number(session.controlPort)
  } catch {
    return false
  }
}

function launchSessionDevTools(session) {
  const launch = launchTestOwnedDevTools({
    profile: session.profile,
    controlPort: session.controlPort
  })
  session.devtoolsCliPid = launch.pid
  session.direct_devtools_launches = [...(session.direct_devtools_launches ?? []), launch]
  persistSessionRecord(session)
  return launch
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

function localRuntimeSupervisorProcess(pid) {
  const process = processTable().find(item => Number(item.pid) === Number(pid))
  return Boolean(
    process &&
    /run-local-api-env\.mjs/.test(String(process.command || '')) &&
    /--mode=lan/.test(String(process.command || ''))
  )
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

function createQaProjectSnapshot(session) {
  const sourceProjectPath = session.projectPath
  const snapshotPath = path.join(session.sessionRoot, 'project')
  fs.cpSync(sourceProjectPath, snapshotPath, { recursive: true })
  const privateConfigPath = path.join(snapshotPath, 'project.private.config.json')
  const projectConfigPath = path.join(snapshotPath, 'project.config.json')
  const projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'))
  if (fs.existsSync(privateConfigPath)) {
    const privateConfig = JSON.parse(fs.readFileSync(privateConfigPath, 'utf8'))
    fs.unlinkSync(privateConfigPath)
    projectConfig.libVersion = projectConfig.libVersion || privateConfig.libVersion || '3.15.2'
    projectConfig.setting = {
      ...(privateConfig.setting || {}),
      ...(projectConfig.setting || {})
    }
  } else {
    projectConfig.libVersion = projectConfig.libVersion || '3.15.2'
  }
  // miniprogram-automator communicates with the classic single-frame
  // simulator. New host-process/multi-frame modes can leave the appservice
  // webview alive enough for the CLI gate but unable to answer Automator
  // page/screenshot RPCs. This is a test-snapshot-only compatibility mode;
  // the user's source project configuration is never modified.
  projectConfig.setting = {
    ...(projectConfig.setting || {}),
    minifyWXML: true,
    minifyWXSS: true,
    minified: false,
    useApiHook: process.env.QA_AUTOMATOR_USE_HOST === '1',
    useApiHostProcess: process.env.QA_AUTOMATOR_USE_HOST === '1',
    useMultiFrameRuntime:
      process.env.QA_AUTOMATOR_SINGLE_FRAME === '0'
        ? Boolean(projectConfig.setting?.useMultiFrameRuntime)
        : false,
    compileHotReLoad: false,
    useStaticServer: false,
    useLanDebug: false
  }
  fs.writeFileSync(projectConfigPath, `${JSON.stringify(projectConfig, null, 2)}\n`)
  const marker = {
    version: 1,
    session_id: session.sessionId,
    source_project_path: sourceProjectPath,
    snapshot_project_path: snapshotPath,
    runtime_mode: session.localRuntimeMode,
    created_at: new Date().toISOString()
  }
  fs.writeFileSync(
    path.join(snapshotPath, '.qa-runtime-snapshot.json'),
    `${JSON.stringify(marker, null, 2)}\n`
  )
  return { sourceProjectPath, snapshotPath, marker }
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
  const lease = localRuntimeEvidence(session.runtimeTargetPath)
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
    profile_persistence: 'persistent_across_process_cleanup',
    project_path: session.projectPath,
    runtime_target_path: session.runtimeTargetPath,
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
  fs.mkdirSync(QA_RUNTIME_REGISTRY_ROOT, { recursive: true })
  const records = []
  for (const file of fs.readdirSync(QA_RUNTIME_REGISTRY_ROOT)) {
    if (!file.endsWith('.json')) {
      continue
    }
    try {
      records.push(JSON.parse(fs.readFileSync(path.join(QA_RUNTIME_REGISTRY_ROOT, file), 'utf8')))
    } catch {
      // The owning runner may be writing the record. The next pass can retry it.
    }
  }
  const protectedProfiles = records
    .filter(record => processAlive(record.runner_pid))
    .map(record => record.profile)
  const unregistered = await reapUnregisteredQaDevTools(protectedProfiles)
  const reclaimedLocks = reapStaleQaPortLocks()
  const removedSessionDirectories = reapStaleQaSessionDirectories(
    records.filter(record => processAlive(record.runner_pid)).map(record => record.session_root)
  )
  const recovered = []
  for (const file of fs.readdirSync(QA_RUNTIME_REGISTRY_ROOT)) {
    if (!file.endsWith('.json')) {
      continue
    }
    const filePath = path.join(QA_RUNTIME_REGISTRY_ROOT, file)
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
      projectPath: record.project_path,
      runtimeTargetPath: record.runtime_target_path,
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
    const projectListRestore =
      after.session_profile_pids.length === 0
        ? restoreQaProjectInProfile(staleSession.projectListRegistration)
        : { status: 'deferred' }
    const transientProfileState =
      after.session_profile_pids.length === 0
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
  return { recovered, unregistered, reclaimedLocks, removedSessionDirectories }
}

export async function createTestOwnedQaSession({
  dispatchRunId,
  projectPath,
  screenshotPath,
  wxRequestUrl,
  runtimeTargetPath = QA_RUNTIME_TARGET,
  startTimeoutMs = START_TIMEOUT_MS,
  forceFullLanRebuild = false,
  fullLanRebuildReason = null,
  spawnProcess = spawn
} = {}) {
  await reapStaleQaSessions()
  fs.mkdirSync(QA_RUNTIME_SESSION_ROOT, { recursive: true })
  const sessionId = `${safeSessionPart(dispatchRunId)}-${crypto.randomUUID()}`
  const sessionRoot = fs.mkdtempSync(
    path.join(QA_RUNTIME_SESSION_ROOT, `${safeSessionPart(dispatchRunId)}-`)
  )
  const session = {
    status: 'starting',
    sessionId,
    sessionRoot,
    projectPath: path.resolve(String(projectPath)),
    runtimeTargetPath: path.resolve(String(runtimeTargetPath)),
    screenshotPath,
    wxRequestUrl,
    wsPort: null,
    controlPort: null,
    home: null,
    profile: null,
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
    portLocks: []
  }
  registerQaSession(session)
  try {
    persistSessionRecord(session)
    const forbiddenPorts = new Set([9420])
    const wsLock = await allocatePortLock('automator', { forbidden: forbiddenPorts })
    session.portLocks.push(wsLock)
    session.wsPort = wsLock.port
    forbiddenPorts.add(session.wsPort)
    const controlLock = await allocatePortLock('control', { forbidden: forbiddenPorts })
    session.portLocks.push(controlLock)
    session.controlPort = controlLock.port
    const profile = cloneTestProfile()
    session.home = profile.home
    session.profile = profile.profile
    session.profileLock = profile.profileLock
    session.transient_profile_state = profile.transientState
    persistSessionRecord(session)
    const existingRuntime = borrowedLocalRuntimeEvidence(session.runtimeTargetPath)
    if ((existingRuntime.healthy || existingRuntime.recoverable) && !forceFullLanRebuild) {
      session.localRuntimeMode = 'borrowed'
      session.borrowedLocalRuntimePid = existingRuntime.ownerPid
      session.borrowedLocalRuntimeChildPid = existingRuntime.childPid
      persistSessionRecord(session)
      await waitFor(
        () => {
          const current = borrowedLocalRuntimeEvidence(session.runtimeTargetPath)
          if (!current.healthy) {
            return false
          }
          if (session.borrowedLocalRuntimeChildPid !== current.childPid) {
            session.borrowedLocalRuntimeChildPid = current.childPid
            persistSessionRecord(session)
          }
          return true
        },
        startTimeoutMs,
        'healthy borrowed local LAN runtime'
      )
      await waitForStableBuildOutput(session.projectPath, startTimeoutMs)
    } else {
      if ((existingRuntime.healthy || existingRuntime.recoverable) && forceFullLanRebuild) {
        const error = new Error(
          '已有用户 LAN watcher 正在使用构建目录，不能在不接管用户进程的情况下强制重建'
        )
        error.code = 'qa_full_lan_rebuild_conflicts_with_user_runtime'
        throw error
      }
      session.buildStartedAtMs = Date.now()
      const localRuntime = spawnProcess(
        process.execPath,
        [LOCAL_RUNTIME_SCRIPT, '--mode=lan', '--', 'uni', '-p', 'mp-weixin'],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            PATH: appendLocalRuntimePath(),
            QA_FULL_LAN_REBUILD_ATTEMPT: forceFullLanRebuild ? '1' : '0'
          },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
      session.localRuntimePid = localRuntime.pid
      session.localRuntimeMode = 'owned'
      persistSessionRecord(session)
      const localLog = path.join(sessionRoot, 'local-runtime.log')
      const localLogStream = fs.createWriteStream(localLog, { flags: 'a' })
      localRuntime.stdout?.on('data', chunk =>
        localLogStream.write(`[local-runtime] ${String(chunk)}`)
      )
      localRuntime.stderr?.on('data', chunk =>
        localLogStream.write(`[local-runtime] ${String(chunk)}`)
      )
      localRuntime.once('close', () => localLogStream.end())
      await waitFor(
        () => {
          const lease = localRuntimeEvidence(session.runtimeTargetPath)
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
          return localRuntimeOwned(lease, localRuntime.pid, session.runtimeTargetPath)
        },
        startTimeoutMs,
        'local LAN runtime'
      )
      await waitFor(
        () => buildOutputReady(session.projectPath, session.buildStartedAtMs),
        startTimeoutMs,
        'fresh mp-weixin build output'
      )
      await waitForStableBuildOutput(session.projectPath, startTimeoutMs)
    }
    const projectSnapshot = createQaProjectSnapshot(session)
    session.sourceProjectPath = projectSnapshot.sourceProjectPath
    session.projectPath = projectSnapshot.snapshotPath
    session.projectListRegistration = registerQaProjectInProfile({
      profilePath: session.profile,
      projectPath: session.projectPath,
      sourceProjectPath: session.sourceProjectPath,
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
    const initialDevToolsLaunch = launchSessionDevTools(session)
    session.initial_devtools_launch = initialDevToolsLaunch
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
    const openCli = await runDevToolsCli({
      home: session.home,
      args: ['open', '--project', session.projectPath, '--port', String(session.controlPort)],
      outputPath: devtoolsLog,
      timeoutMs: startTimeoutMs
    })
    const openCliAttempts = [cliInvocationEvidence('open', openCli, devtoolsLog)]
    session.open_cli_pid = openCli.pid
    session.open_cli_exit_code = openCli.exitCode
    session.open_cli_timed_out = Boolean(openCli.timedOut)
    session.open_cli_attempts = openCliAttempts
    persistSessionRecord(session)
    if (cliRequiresTestProfileLogin(openCliAttempts[0].output_tail)) {
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
          launchDevTools: () => launchSessionDevTools(session),
          automatorPrepareDelayMs: AUTOMATOR_PREPARE_DELAY_MS,
          onInvocation: (invocation, result) => {
            openCliAttempts.push({
              ...invocation,
              output_tail: outputTail(devtoolsLog)
            })
            if (invocation.action === 'open') {
              session.open_cli_pid = result?.pid ?? null
              session.open_cli_exit_code = result?.exitCode ?? null
              session.open_cli_timed_out = Boolean(result?.timedOut)
            }
            session.open_cli_attempts = openCliAttempts
            persistSessionRecord(session)
          }
        })
        session.startup_recovery = startupRecovery
        persistSessionRecord(session)
      } catch (recoveryError) {
        session.runtime_evidence = {
          status: 'unavailable',
          project_open_attempts: openCliAttempts,
          project_open_recovery: startupRecovery
        }
        persistSessionRecord(session)
        const error = new Error(
          `隔离项目打开失败，已完成一次测试专属恢复：${recoveryError.message}`
        )
        error.code = openCli.timedOut ? 'qa_project_open_timeout' : 'qa_project_open_failed'
        throw error
      }
    }
    session.runtime_evidence = {
      status: 'starting',
      project_open_attempts: openCliAttempts,
      project_open_recovery: startupRecovery
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
    // project. Simulator compile/webview attach follows asynchronously; firing
    // /auto in that gap intermittently closes the test-owned window before an
    // Automator listener can be created.
    await new Promise(resolve => setTimeout(resolve, AUTOMATOR_PREPARE_DELAY_MS))
    // The official CLI does not support an extra Automator-port flag. Keep the IDE control
    // port on the CLI, and enable the isolated Automator port through the
    // verified DevTools control endpoint that accepts ?port=<wsPort>.
    if (startupRecovery) {
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
        transport: 'devtools_control_endpoint',
        status_code: autoControl.status_code ?? null,
        url: autoControl.url ?? '',
        body_excerpt: String(autoControl.body_excerpt ?? autoControl.error ?? '').slice(0, 1000),
        automator_port: session.wsPort,
        control_port: session.controlPort
      }
      fs.appendFileSync(
        devtoolsLog,
        `[devtools-control] ${JSON.stringify({ action: 'auto', ...session.auto_control })}\n`
      )
    }
    session.auto_cli_pid = null
    session.auto_cli_exit_code = null
    session.auto_cli_timed_out = false
    persistSessionRecord(session)
    if (Number(session.auto_control?.status_code) !== 200) {
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
    try {
      runtime = await waitFor(
        () => {
          const evidence = ownedRuntimeEvidence(session)
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
      startupRecovery = await recoverTestOwnedDevToolsStartup({
        session,
        home: session.home,
        outputPath: devtoolsLog,
        mainForSessionFn: mainForSession,
        projectOpenEvidenceFn: projectOpenEvidence,
        idePortReadyFn: idePortMarkerReady,
        launchDevTools: () => launchSessionDevTools(session),
        automatorPrepareDelayMs: AUTOMATOR_PREPARE_DELAY_MS
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
    session.status = 'ready'
    persistSessionRecord(session)
    session.runtime_evidence = {
      mode:
        session.localRuntimeMode === 'borrowed'
          ? 'borrowed_user_lan_runtime'
          : 'test_owned_runtime',
      owned: session.localRuntimeMode !== 'borrowed',
      local_runtime_owner: session.localRuntimeMode === 'borrowed' ? 'user_owned' : 'qa_owned',
      session_id: session.sessionId,
      profile: session.profile,
      profile_persistence: 'persistent_across_process_cleanup',
      automator_port: session.wsPort,
      control_port: session.controlPort,
      local_runtime_pid: session.localRuntimePid,
      local_runtime_child_pid: session.localRuntimeChildPid,
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
      user_devtools_cleanup: session.user_devtools_cleanup,
      ...runtime
    }
    session.preflight_options = {
      projectPath: session.projectPath,
      wsPort: session.wsPort,
      wsEndpoint: `ws://127.0.0.1:${session.wsPort}`,
      screenshotPath,
      wxRequestUrl,
      allowTargetedRestart: false,
      requireIsolatedProject: true,
      runtime,
      preverifiedRuntime: runtime,
      runtimeInspector: () => ownedRuntimeEvidence(session),
      recoveryExecutor: null,
      lanFlowProbe: () => {
        if (session.localRuntimeMode === 'borrowed') {
          return borrowedLocalRuntimeEvidence(session.runtimeTargetPath).healthy
        }
        return localRuntimeOwned(
          localRuntimeEvidence(session.runtimeTargetPath),
          session.localRuntimePid,
          session.runtimeTargetPath
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
    return { status: 'blocked', code: 'qa_runtime_cleanup_in_progress' }
  }
  session.cleanup_in_progress = true
  session.cleanup_attempts = Number(session.cleanup_attempts || 0) + 1
  const before = cleanupEvidence(session)
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
    const after = cleanupEvidence(session)
    const projectListRestore =
      after.session_profile_pids.length === 0
        ? restoreQaProjectInProfile(session.projectListRegistration)
        : { status: 'deferred' }
    const transientProfileState =
      after.session_profile_pids.length === 0
        ? resetPersistentQaTransientState(session)
        : { status: 'deferred', reason: 'test_owned_profile_process_still_alive' }
    const clean =
      after.main_pid === null &&
      after.control_listener_pids.length === 0 &&
      after.automator_listener_pids.length === 0 &&
      (session.localRuntimeMode === 'borrowed' ||
        (!after.local_runtime_owner_alive && !after.local_runtime_child_alive)) &&
      !after.auto_cli_alive &&
      after.session_profile_pids.length === 0 &&
      (session.localRuntimeMode === 'borrowed' || !after.local_runtime_lease)
    for (const lock of session.portLocks || []) {
      lock.release()
    }
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
    if (sessionProfileProcessIds(session).length === 0) {
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
