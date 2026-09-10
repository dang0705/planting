import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { processStartIdentity } from '../../../../../../scripts/qa/qa-auth-broker-core.mjs'
import { currentShared } from '../../../../../../scripts/qa/qa-auth-broker-core.mjs'

import { assertQaAuthMaterialReady } from '../../../../../../scripts/qa/qa-auth-coordinator.mjs'
import {
  QA_NATIVE_AUTH_DEBUG_PORT,
  assertNativeAuthDebugPortAvailable,
  syncNativeAuthRuntime
} from '../../../../../../scripts/qa/devtools-native-auth-bridge.mjs'
import { QA_RUNTIME_SERVICE_PORT } from './qa-runtime-plane.mjs'
import {
  assertInstalledDevToolsBundle,
  ensureQaProfileNativePackage,
  ensureQaHomePluginManifest,
  ensureQaProfileExtension,
  ensureQaExtensionSnapshot,
  QA_EXTENSION_SNAPSHOT_DIR,
  OFFICIAL_ELECTRON_RUNTIME,
  SYSTEM_APP_ASAR,
  SYSTEM_ELECTRON,
  SYSTEM_PRODUCT_HASH,
  SYSTEM_NW_BINARY,
  SYSTEM_PACKAGE,
  isOfficialElectronBundle
} from '../../../../../../scripts/qa/patch-wechat-devtools-launcher.mjs'
import { processTable } from './test-owned-qa-support.mjs'
import { ancestorsFrom } from './devtools-process-topology.mjs'
import { buildInstalledNativeDevToolsArgs } from '../../../../../../scripts/qa/devtools-native-launch.mjs'

function qaFileUrl(filePath) {
  return encodeURI(`file://${path.resolve(filePath)}`).replaceAll('%20', ' ')
}

export const QA_DIRECT_DEVTOOLS_BINARY = SYSTEM_NW_BINARY
// The formal QA plane uses the immutable installed DevTools bundle. Electron
// releases run app.asar directly; the legacy native package is retained only
// as a compatibility path for older installations. A patched/copy launcher is
// never a runtime dependency: its server-window bootstrap can leave renderers
// alive without creating the fixed control listener.
export const QA_DIRECT_DEVTOOLS_PACKAGE = SYSTEM_PACKAGE
export const QA_OFFICIAL_ELECTRON = SYSTEM_ELECTRON
export const QA_OFFICIAL_APP_ASAR = SYSTEM_APP_ASAR
export { QA_EXTENSION_SNAPSHOT_DIR }
export const QA_SHARED_AUTH_ROOT = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'automator-qa',
  'v3',
  'auth'
)
export const QA_DEVTOOLS_HOME = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'qa-devtools-home'
)
function isManagedQaProfile(profile) {
  const normalized = path.resolve(profile)
  const root = path.resolve(QA_DEVTOOLS_HOME)
  return normalized === root || normalized.startsWith(`${root}${path.sep}`)
}

export function extensionProcessEvidence({
  processes = [],
  pid,
  profile,
  userDataDir = profile,
  packageDir,
  packageDirAlternates = []
} = {}) {
  const expectedProfiles = userDataDirArgumentVariants(userDataDir)
  const expectedPackages = [packageDir, ...packageDirAlternates]
    .filter(Boolean)
    .map(value => path.resolve(value))
  const processByPid = new Map(processes.map(item => [Number(item.pid), item]))
  const mainPid = Number(pid)
  const belongsToVerifiedMain = candidatePid => {
    let current = processByPid.get(Number(candidatePid))
    const visited = new Set()
    while (current && !visited.has(Number(current.pid))) {
      if (Number(current.pid) === mainPid) {
        return true
      }
      visited.add(Number(current.pid))
      current = processByPid.get(Number(current.parent_pid))
    }
    return false
  }
  const matches = processes.filter(item => {
    const command = String(item.command || '')
    const chain = belongsToVerifiedMain(item.pid)
    return (
      chain &&
      command.includes('--extension-process') &&
      expectedProfiles.some(expectedProfile => command.includes(expectedProfile)) &&
      expectedPackages.some(
        expectedPackage =>
          command.includes(`--nwapp-path=${expectedPackage}`) ||
          command.includes(`--package-dir=${expectedPackage}`)
      )
    )
  })
  return {
    required: true,
    verified: matches.length > 0,
    pids: matches.map(item => Number(item.pid)).filter(Number.isInteger),
    commands: matches.map(item => item.command)
  }
}

function userDataDirArgumentVariants(userDataDir) {
  const resolved = path.resolve(String(userDataDir || ''))
  const variants = new Set([resolved])
  try {
    variants.add(fs.realpathSync.native(resolved))
  } catch {
    // The caller may be validating a path before the directory is created.
  }
  return [...variants].map(value => `--user-data-dir=${value}`)
}

export function resetOfficialQaSingletons(userDataDir) {
  const root = path.resolve(String(userDataDir || ''))
  const qaRoot = path.resolve(QA_DEVTOOLS_HOME)
  if (root !== qaRoot && !root.startsWith(`${qaRoot}${path.sep}`)) {
    const error = new Error('official Electron singleton reset refused outside QA home')
    error.code = 'qa_official_singleton_path_invalid'
    throw error
  }
  if (listenerPids(9422).length > 0) {
    const error = new Error('official Electron control port is already owned')
    error.code = 'qa_official_control_port_in_use'
    throw error
  }
  const removed = []
  // Electron receives the parent Chromium data root and creates the
  // product-hash profile below it. Singleton links therefore live in the
  // hash leaf, not beside the root argument. Accept either form so recovery
  // can be called with a persisted profile path or the launch root.
  const profileRoot = path.basename(root) === SYSTEM_PRODUCT_HASH
    ? root
    : path.join(root, SYSTEM_PRODUCT_HASH)
  if (!profileRoot.startsWith(`${qaRoot}${path.sep}`)) {
    const error = new Error('official Electron singleton profile is outside QA home')
    error.code = 'qa_official_singleton_profile_invalid'
    throw error
  }
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const target = path.join(profileRoot, name)
    try {
      const stat = fs.lstatSync(target)
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(target)
        removed.push(name)
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }
  return removed
}

export function buildOfficialElectronDevToolsLaunch({
  profile,
  userDataDir,
  controlPort,
  projectPath,
  appSessionId = crypto.randomBytes(8).toString('hex'),
  installedBundle = null
} = {}) {
  const normalizedProfile = path.resolve(String(profile || ''))
  const normalizedUserDataDir = path.resolve(String(userDataDir || ''))
  const normalizedProjectPath = projectPath ? path.resolve(String(projectPath)) : null
  if (!normalizedProfile || !normalizedUserDataDir || !Number.isInteger(Number(controlPort))) {
    throw new Error('official Electron DevTools launch requires profile, user-data root and control port')
  }
  const verifiedBundle = assertInstalledDevToolsBundle()
  if (
    installedBundle &&
    (installedBundle.runtime_kind !== verifiedBundle.runtime_kind ||
      path.resolve(String(installedBundle.electron || '')) !== path.resolve(verifiedBundle.electron) ||
      path.resolve(String(installedBundle.app_asar || '')) !== path.resolve(verifiedBundle.app_asar) ||
      installedBundle.release_version !== verifiedBundle.release_version)
  ) {
    const error = new Error('official Electron launch bundle does not match the installed bundle')
    error.code = 'qa_official_electron_bundle_mismatch'
    throw error
  }
  if (verifiedBundle.runtime_kind !== 'official_electron') {
    const error = new Error('official Electron DevTools bundle is unavailable')
    error.code = 'qa_official_electron_bundle_unavailable'
    throw error
  }
  return {
    command: verifiedBundle.electron,
    args: [
      verifiedBundle.app_asar,
      '--cli',
      '--remote-port',
      String(QA_RUNTIME_SERVICE_PORT),
      '--enable-service-port',
      `--user-data-dir=${normalizedUserDataDir}`,
      `--app-session-id=${appSessionId}`,
      // The official 2.02.2609012 bootstrap parses this option as a
      // two-token argv pair (`indexOf('--ide-http-port')` followed by the
      // value). The equals form is silently ignored and makes the IDE pick a
      // random port, which then fails the fixed control-plane ownership gate.
      '--ide-http-port',
      String(controlPort)
    ],
    app_session_id: appSessionId,
    control_port: Number(controlPort),
    service_port: QA_RUNTIME_SERVICE_PORT,
    profile: normalizedProfile,
    user_data_dir: normalizedUserDataDir,
    project_path: normalizedProjectPath,
    runtime_kind: 'official_electron',
    bundle: {
      kind: OFFICIAL_ELECTRON_RUNTIME.kind,
      release: verifiedBundle.release_version || OFFICIAL_ELECTRON_RUNTIME.release,
      electron: verifiedBundle.electron,
      app_asar: verifiedBundle.app_asar,
      app_asar_unpacked: OFFICIAL_ELECTRON_RUNTIME.app_asar_unpacked,
      product_hash: verifiedBundle.product_hash
    },
    installed_bundle: {
      kind: OFFICIAL_ELECTRON_RUNTIME.kind,
      release: verifiedBundle.release_version || OFFICIAL_ELECTRON_RUNTIME.release,
      electron: verifiedBundle.electron,
      app_asar: verifiedBundle.app_asar,
      product_hash: verifiedBundle.product_hash
    },
    shared_auth_package: null,
    package_dir: null,
    runtime_package: verifiedBundle.app_asar,
    command_boundary: 'installed_official_electron',
    package_boundary: 'installed_app_asar',
    auth_state: null,
    extension: null
  }
}

export function buildTestOwnedDevToolsLaunch({
  profile,
  userDataDir,
  controlPort,
  projectPath,
  appSessionId = crypto.randomBytes(8).toString('hex')
} = {}) {
  const normalizedProfile = path.resolve(String(profile || ''))
  const normalizedUserDataDir = path.resolve(String(userDataDir || profile || ''))
  const normalizedProjectPath = projectPath ? path.resolve(String(projectPath)) : null
  if (!normalizedProfile || !Number.isInteger(Number(controlPort))) {
    throw new Error('test-owned DevTools launch requires profile and control port')
  }
  const installedBundle = assertInstalledDevToolsBundle()
  if (installedBundle.runtime_kind === 'official_electron') {
    return buildOfficialElectronDevToolsLaunch({
      profile: normalizedProfile,
      // The official Electron runtime treats this as the Chromium data root
      // and appends its product hash itself.  The legacy path receives the
      // already-resolved hash directory below.
      userDataDir: path.resolve(path.dirname(normalizedProfile)),
      controlPort,
      projectPath,
      appSessionId,
      installedBundle
    })
  }
  if (isManagedQaProfile(normalizedProfile)) {
    ensureQaProfileNativePackage({ profile: normalizedProfile })
  }
  const bundle = installedBundle
  const authState = isManagedQaProfile(normalizedProfile)
    ? assertQaAuthMaterialReady({ profile: normalizedProfile })
    : null
  const extension = ensureQaExtensionSnapshot()
  ensureQaHomePluginManifest()
  const profileExtension = isManagedQaProfile(normalizedProfile)
    ? ensureQaProfileExtension({ profile: normalizedProfile, extension })
    : extension
  const pluginPath = profileExtension.path
  // The installed native package owns the server-window/bootstrap code. The
  // QA profile contributes only user-data and the preserved extension.
  const frontendPath = profileExtension.path
  const runtimePackage = QA_DIRECT_DEVTOOLS_PACKAGE
  const customFrontend = qaFileUrl(path.join(frontendPath, 'inspector'))
  return {
    // Keep the executable/package pair native; HOME and user-data-dir provide
    // the QA ownership boundary without changing DevTools bootstrap code.
    command: QA_DIRECT_DEVTOOLS_BINARY,
    args: buildInstalledNativeDevToolsArgs({
      servicePort: QA_RUNTIME_SERVICE_PORT,
      controlPort,
      userDataDir: normalizedUserDataDir,
      extensionPath: pluginPath,
      customFrontend,
      appSessionId,
      packageDir: runtimePackage,
      browserDebugPort: QA_NATIVE_AUTH_DEBUG_PORT
    }),
    app_session_id: appSessionId,
    control_port: Number(controlPort),
    service_port: QA_RUNTIME_SERVICE_PORT,
    profile: normalizedProfile,
    user_data_dir: normalizedUserDataDir,
    project_path: normalizedProjectPath,
    bundle,
    installed_bundle: installedBundle,
    shared_auth_package: null,
    package_dir: QA_DIRECT_DEVTOOLS_PACKAGE,
    runtime_package: runtimePackage,
    command_boundary: 'installed_native_nw_executable',
    package_boundary: 'installed_native_package',
    auth_state: authState,
    nw_binary: QA_DIRECT_DEVTOOLS_BINARY,
    extension: { ...profileExtension, frontend_path: frontendPath }
  }
}

export function buildQaDevToolsEnvironment(
  baseEnv = process.env,
  { runtimeKind = isOfficialElectronBundle() ? 'official_electron' : 'legacy_native' } = {}
) {
  const official = runtimeKind === 'official_electron'
  // Electron's macOS safeStorage resolves its Keychain search list from HOME.
  // Keep the real OS home for the official runtime while --user-data-dir
  // continues to isolate all DevTools data under QA_DEVTOOLS_HOME. Redirecting
  // HOME makes macOS look for a second login keychain inside the disposable QA
  // directory and blocks startup with a "Keychain Not Found" dialog.
  const runtimeHome = official
    ? baseEnv.HOME || baseEnv.USERPROFILE || '/tmp'
    : QA_DEVTOOLS_HOME
  return {
    ...baseEnv,
    HOME: runtimeHome,
    USERPROFILE: runtimeHome,
    WECHAT_DEVTOOLS_SHARED_AUTH_ROOT: QA_SHARED_AUTH_ROOT,
    WECHAT_DEVTOOLS_SHARED_AUTH_ROLE: 'qa',
    WECHAT_QA_LAUNCHER_ROLE: 'qa',
    WECHAT_QA_RUNTIME_KIND: runtimeKind,
    // The Electron bootstrap must not receive retired NW package hints. Keep
    // the variables present as empty strings so a caller's ambient environment
    // cannot silently route the new runtime back through the legacy path.
    WECHAT_QA_LAUNCHER_NW_BINARY: official ? '' : QA_DIRECT_DEVTOOLS_BINARY,
    WECHAT_QA_LAUNCHER_PACKAGE_DIR: official ? '' : QA_DIRECT_DEVTOOLS_PACKAGE,
    WECHAT_QA_EXTENSION_PATH: official ? '' : baseEnv.WECHAT_QA_EXTENSION_PATH || '',
    WECHAT_QA_CUSTOM_FRONTEND: official ? '' : baseEnv.WECHAT_QA_CUSTOM_FRONTEND || ''
  }
}

function findQaMainProcess({
  profile,
  userDataDir,
  controlPort,
  packageDir,
  runtimeKind = 'legacy_native'
}) {
  const expectedProfile = `--user-data-dir=${path.resolve(userDataDir || profile)}`
  const expectedPackage = packageDir ? path.resolve(packageDir) : null
  return processTable()
    .filter(item => {
      const command = String(item.command || '')
      if (runtimeKind === 'official_electron') {
        return (
          command.includes(path.resolve(QA_OFFICIAL_ELECTRON)) &&
          command.includes(path.resolve(QA_OFFICIAL_APP_ASAR)) &&
          command.includes(expectedProfile) &&
          hasLaunchArgument(command, '--ide-http-port', controlPort) &&
          hasLaunchArgument(command, '--remote-port', QA_RUNTIME_SERVICE_PORT) &&
          command.includes('--cli')
        )
      }
      return (
        command.includes('/wechatdevtools') &&
        !command.includes(' Helper') &&
        !command.includes(' Daemon ') &&
        command.includes(expectedProfile) &&
        hasLaunchArgument(command, '--package-dir', expectedPackage) &&
        hasLaunchArgument(command, '--ide-http-port', controlPort)
      )
    })
    .sort((left, right) => Number(left.pid) - Number(right.pid))[0]
}

function waitForQaMainProcess({ profile, userDataDir, controlPort, packageDir, runtimeKind }) {
  const deadline = Date.now() + 30_000
  let evidence = null
  while (Date.now() < deadline) {
    const main = findQaMainProcess({ profile, userDataDir, controlPort, packageDir, runtimeKind })
    evidence = {
      pid: main?.pid ?? null,
      command: main?.command ?? null,
      ready: Boolean(main)
    }
    if (main) {
      return { ...main, evidence }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
  }
  const error = new Error('qa_devtools_main_process_timeout')
  error.code = 'qa_devtools_main_process_timeout'
  error.evidence = evidence
  throw error
}

export async function launchTestOwnedDevTools(options = {}) {
  const launch = buildTestOwnedDevToolsLaunch(options)
  let pid = null
  let readiness
  let nativeAuthSync = null
  try {
    if (launch.runtime_kind === 'official_electron') {
      launch.reset_singletons = resetOfficialQaSingletons(launch.user_data_dir)
    }
    if (launch.runtime_kind !== 'official_electron') {
      assertNativeAuthDebugPortAvailable({
        port: QA_NATIVE_AUTH_DEBUG_PORT,
        profile: launch.user_data_dir
      })
    }
    const environment = buildQaDevToolsEnvironment({
      ...process.env,
      WECHAT_QA_PROFILE_PATH: launch.profile,
      WECHAT_QA_CONTROL_PORT: String(launch.control_port),
      WECHAT_QA_SERVICE_PORT: String(launch.service_port),
      ...(launch.extension
        ? {
            WECHAT_QA_EXTENSION_PATH: launch.extension.path,
            WECHAT_QA_CUSTOM_FRONTEND: qaFileUrl(
              path.join(launch.extension.frontend_path, 'inspector')
            )
          }
        : {}),
      WECHAT_QA_RUNTIME_KIND: launch.runtime_kind || 'legacy_native'
    }, { runtimeKind: launch.runtime_kind || 'legacy_native' })
    const child = spawn(launch.command, launch.args, {
      detached: true,
      env: environment,
      stdio: 'ignore'
    })
    child.unref?.()
    pid = child.pid
    const main = waitForQaMainProcess({
      profile: launch.profile,
      userDataDir: launch.user_data_dir,
      controlPort: launch.control_port,
      packageDir: launch.package_dir,
      runtimeKind: launch.runtime_kind
    })
    pid = main.pid
    readiness = waitForDevToolsLaunchReadiness({
      ...launch,
      pid,
      command: launch.command,
      packageDir: launch.package_dir,
      userDataDir: launch.user_data_dir,
      runtime_kind: launch.runtime_kind,
      requiredListenerNames: ['control'],
      direct_runtime: {
        command:
          launch.runtime_kind === 'official_electron'
            ? QA_OFFICIAL_ELECTRON
            : QA_DIRECT_DEVTOOLS_BINARY,
        args: launch.args,
        pid
      }
    })
    if (launch.runtime_kind !== 'official_electron') {
      nativeAuthSync = await syncNativeAuthRuntime({
        auth: currentShared(),
        mainPid: pid,
        profile: launch.user_data_dir,
        port: QA_NATIVE_AUTH_DEBUG_PORT
      })
    }
    launch.launch_mode =
      launch.runtime_kind === 'official_electron'
        ? 'official_electron_control_plane'
        : 'direct_runtime_control_plane_only'
    launch.project_opened = false
    launch.direct_runtime = {
      command:
        launch.runtime_kind === 'official_electron' ? QA_OFFICIAL_ELECTRON : QA_DIRECT_DEVTOOLS_BINARY,
      args: launch.args,
      pid
    }
    launch.effective_command = launch.command
    launch.effective_pid = pid
  } catch (error) {
    const discovered = findQaMainProcess({
      profile: launch.profile,
      userDataDir: launch.user_data_dir,
      controlPort: launch.control_port,
      packageDir: launch.package_dir,
      runtimeKind: launch.runtime_kind
    })
    pid ??= discovered?.pid ?? null
    terminateFailedLaunch({
      pid,
      profile: launch.profile,
      userDataDir: launch.user_data_dir,
      packageDir: launch.package_dir,
      runtimeKind: launch.runtime_kind,
      expectedStartIdentity:
        error.evidence?.process_start_identity || (pid ? processStartIdentity(pid) : null)
    })
    throw error
  }
  // Launch readiness proves only the native control plane. Authentication
  // consumption is deliberately deferred until the supervisor has completed
  // a real authenticated wx.request; a shared snapshot alone is not runtime
  // proof and must never create a consumption receipt.
  return {
    ...launch,
    pid,
    readiness,
    native_auth_sync: nativeAuthSync,
    auth_consumption: null,
    auth_consumption_deferred: 'real_authenticated_wx_request'
  }
}

function terminateFailedLaunch({
  pid,
  profile,
  userDataDir = profile,
  packageDir,
  runtimeKind = 'legacy_native',
  expectedStartIdentity
}) {
  if (!expectedStartIdentity || processStartIdentity(pid) !== expectedStartIdentity) {
    return
  }
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
  const processes = String(result.stdout || '')
    .split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/u))
    .filter(Boolean)
    .map(match => ({ pid: Number(match[1]), parent_pid: Number(match[2]), command: match[3] }))
  const children = new Map()
  for (const item of processes) {
    const list = children.get(item.parent_pid) || []
    list.push(item)
    children.set(item.parent_pid, list)
  }
  const queue = [Number(pid)]
  const owned = []
  while (queue.length) {
    const current = queue.shift()
    const item = processes.find(candidate => candidate.pid === current)
    if (item) {
      owned.push(item)
    }
    queue.push(...(children.get(current) || []).map(itemValue => itemValue.pid))
  }
  for (const item of owned.reverse()) {
    if (
      userDataDirArgumentVariants(userDataDir).some(argument => item.command.includes(argument)) &&
      (runtimeKind === 'official_electron'
        ? item.command.includes(path.resolve(QA_OFFICIAL_APP_ASAR))
        : item.command.includes(path.resolve(packageDir))) &&
      (Number(item.pid) !== Number(pid) || processStartIdentity(item.pid) === expectedStartIdentity)
    ) {
      try {
        process.kill(item.pid, 'SIGTERM')
      } catch {
        // The exact owned process may have exited between ps and kill.
      }
    }
  }
}

function listenerPids(port) {
  const result = spawnSync('lsof', [`-tiTCP:${Number(port)}`, '-sTCP:LISTEN'], {
    encoding: 'utf8'
  })
  return result.status === 0
    ? String(result.stdout || '')
        .split(/\s+/u)
        .filter(Boolean)
        .map(Number)
        .filter(Number.isInteger)
    : []
}

function processCommand(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  return String(result.stdout || '').trim()
}

function listenerOwnedByProcess(listenerPid, ownerPid) {
  return (
    Number(listenerPid) === Number(ownerPid) ||
    ancestorsFrom(listenerPid).some(item => Number(item.pid) === Number(ownerPid))
  )
}

function hasLaunchArgument(command, flag, value) {
  const text = String(command || '')
  const expected = String(value)
  return text.includes(`${flag}=${expected}`) || text.includes(`${flag} ${expected}`)
}

function waitForDevToolsLaunchReadiness({
  pid,
  profile,
  userDataDir = profile,
  control_port,
  command,
  args,
  extension,
  packageDir = args[0],
  runtime_kind = 'legacy_native',
  requiredListenerNames = ['control', 'service']
}) {
  const deadline = Date.now() + 30_000
  let evidence = null
  while (Date.now() < deadline) {
    const startIdentity = processStartIdentity(pid)
    const commandText = processCommand(pid)
    const controlListeners = listenerPids(control_port)
    const servicePort = Number(args[args.indexOf('--remote-port') + 1])
    if (runtime_kind === 'official_electron') {
      const ownerCommandChecks = {
        command: commandText.includes(path.resolve(QA_OFFICIAL_ELECTRON)),
        app_asar: commandText.includes(path.resolve(QA_OFFICIAL_APP_ASAR)),
        cli_mode: commandText.includes('--cli'),
        user_data_dir: hasLaunchArgument(commandText, '--user-data-dir', path.resolve(userDataDir)),
        control_port: hasLaunchArgument(commandText, '--ide-http-port', control_port),
        service_port: hasLaunchArgument(commandText, '--remote-port', servicePort)
      }
      const controlOwnershipVerified = controlListeners.every(listenerPid =>
        listenerOwnedByProcess(listenerPid, pid)
      )
      const requiredListenerEvidence = {
        control: {
          present: controlListeners.length > 0,
          owned: controlOwnershipVerified
        },
        service: {
          // The new Electron control plane may keep the internal service port
          // private. It is intentionally not required for readiness.
          present: listenerPids(servicePort).length > 0,
          owned: true
        }
      }
      const requiredListenersReady = requiredListenerNames.every(name => {
        const item = requiredListenerEvidence[name]
        return item?.present === true && item.owned === true
      })
      evidence = {
        pid,
        process_start_identity: startIdentity,
        command: commandText || null,
        control_port,
        service_port: Number.isFinite(servicePort) ? servicePort : null,
        runtime_kind,
        extension: { required: false, verified: true, reason: 'official_app_asar_runtime' },
        control_listener_pids: controlListeners,
        service_listener_pids: listenerPids(servicePort),
        owner_command_verified: Object.values(ownerCommandChecks).every(Boolean),
        owner_command_checks: ownerCommandChecks,
        control_listener_ownership_verified: controlOwnershipVerified,
        service_listener_ownership_verified: true,
        required_listener_names: requiredListenerNames,
        required_listener_evidence: requiredListenerEvidence,
        ready: Boolean(
          startIdentity &&
          commandText &&
          Object.values(ownerCommandChecks).every(Boolean) &&
          requiredListenersReady
        )
      }
      if (evidence.ready) {
        return evidence
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
      continue
    }
    const extensionEvidence = extensionProcessEvidence({
      processes: readProcessTable(),
      pid,
      profile,
      userDataDir,
      packageDir,
      packageDirAlternates: [path.join(path.resolve(profile), 'WeappCode', 'package.nw')]
    })
    const serviceListeners = listenerPids(servicePort)
    const extensionArgument = args.find(argument => /^(?:--|-)(?:load-extension)=/u.test(argument))
    const frontendArgument = args.find(argument =>
      argument.startsWith('--custom-devtools-frontend=')
    )
    const expectedExtensionArgument = `--load-extension=${path.resolve(extension?.path || '')}`
    const expectedFrontendArgument = `--custom-devtools-frontend=${qaFileUrl(
      path.join(extension?.frontend_path || extension?.path || '', 'inspector')
    )}`
    const ownerCommandChecks = {
      command: commandText.includes(command),
      user_data_dir: hasLaunchArgument(commandText, '--user-data-dir', path.resolve(userDataDir)),
      package_dir: hasLaunchArgument(commandText, '--package-dir', path.resolve(packageDir)),
      control_port: hasLaunchArgument(commandText, '--ide-http-port', control_port),
      service_port: hasLaunchArgument(commandText, '--remote-port', servicePort),
      load_extension:
        extensionArgument === expectedExtensionArgument ||
        extensionArgument === expectedExtensionArgument.replace('--', '-'),
      custom_frontend: frontendArgument === expectedFrontendArgument
    }
    const ownerCommandVerified = Object.values(ownerCommandChecks).every(Boolean)
    const controlOwnershipVerified = controlListeners.every(listenerPid =>
      listenerOwnedByProcess(listenerPid, pid)
    )
    const serviceOwnershipVerified = serviceListeners.every(listenerPid =>
      listenerOwnedByProcess(listenerPid, pid)
    )
    const requiredListenerEvidence = {
      control: {
        present: controlListeners.length > 0,
        owned: controlOwnershipVerified
      },
      service: {
        present: serviceListeners.length > 0,
        owned: serviceOwnershipVerified
      }
    }
    const requiredListenersReady = requiredListenerNames.every(name => {
      const item = requiredListenerEvidence[name]
      return item?.present === true && item.owned === true
    })
    evidence = {
      pid,
      process_start_identity: startIdentity,
      command: commandText || null,
      control_port: control_port,
      service_port: servicePort,
      extension: extensionEvidence,
      control_listener_pids: controlListeners,
      service_listener_pids: serviceListeners,
      owner_command_verified: ownerCommandVerified,
      owner_command_checks: ownerCommandChecks,
      control_listener_ownership_verified: controlOwnershipVerified,
      service_listener_ownership_verified: serviceOwnershipVerified,
      required_listener_names: requiredListenerNames,
      required_listener_evidence: requiredListenerEvidence,
      ready: Boolean(
        startIdentity &&
        commandText &&
        ownerCommandVerified &&
        requiredListenersReady &&
        extensionEvidence.verified
      )
    }
    if (evidence.ready) {
      return evidence
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
  }
  const extensionFailed = evidence?.extension?.verified !== true
  const error = new Error(
    extensionFailed
      ? 'QA DevTools extension 未形成实际扩展进程，拒绝进入 ready'
      : 'qa_devtools_launch_readiness_timeout'
  )
  error.code = extensionFailed ? 'qa_extension_load_failed' : 'qa_devtools_launch_readiness_timeout'
  error.evidence = evidence
  throw error
}

function readProcessTable() {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
  return String(result.stdout || '')
    .split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/u))
    .filter(Boolean)
    .map(match => ({ pid: Number(match[1]), parent_pid: Number(match[2]), command: match[3] }))
}
