#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  QA_SHARED_AUTH_ROOT,
  QA_DEVTOOLS_HOME,
  resetOfficialQaSingletons
} from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-devtools-launch.mjs'
import {
  assertInstalledDevToolsBundle,
  ensureQaProfileNativePackage,
  ensureQaHomePluginManifest,
  ensureQaProfileExtension,
  ensureQaExtensionSnapshot,
  SYSTEM_APP_ASAR,
  SYSTEM_CLI,
  SYSTEM_ELECTRON,
  SYSTEM_NW_BINARY,
  SYSTEM_PACKAGE,
  SYSTEM_PRODUCT_HASH,
  isOfficialElectronBundle
} from './patch-wechat-devtools-launcher.mjs'
import {
  buildOfficialElectronDevToolsArgs,
  buildInstalledNativeDevToolsArgs,
  INSTALLED_DEVTOOLS_PACKAGE
} from './devtools-native-launch.mjs'
import { QA_PRODUCT_HASH } from './patch-wechat-devtools-cli.mjs'
import {
  assertQaAuthMaterialReady,
  findQaProfileAuthRecord,
  syncQaAuthFromDailyReadOnly,
  syncQaAuthFromProfile
} from './qa-auth-coordinator.mjs'
import {
  descendantsOf,
  processAlive,
  processTable,
  sendSignal
} from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs'
import { ancestorsFrom } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-process-topology.mjs'
import { ensureQaAuthBrokerSync } from './qa-auth-broker.mjs'
import {
  currentShared,
  DAILY_CAPABILITY_PATH,
  processStartIdentity
} from './qa-auth-broker-core.mjs'
import {
  QA_NATIVE_AUTH_DEBUG_PORT,
  assertNativeAuthDebugPortAvailable,
  syncNativeAuthRuntime
} from './devtools-native-auth-bridge.mjs'
import {
  CONTROL_PORTS,
  NATIVE_DEBUG_PORTS,
  SERVICE_PORTS,
  profileFromCommand
} from './qa-devtools-topology.mjs'
import {
  ensureManagedDailyProjectDisplayName,
  openManagedDailyProject,
  reconcileManagedDailyControlMarkers,
  resolveManagedDailyProject,
  writeManagedDailyCapability
} from './managed-daily-project.mjs'

const OFFICIAL_ELECTRON_ACTIVE = isOfficialElectronBundle()
const DEFAULT_DAILY_PROFILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  'Library',
  'Application Support',
  '微信开发者工具',
  SYSTEM_PRODUCT_HASH || '50a7d9210159a32f006158795f893857'
)
const QA_PROFILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'qa-devtools-home',
  'Library',
  'Application Support',
  '微信开发者工具',
  OFFICIAL_ELECTRON_ACTIVE
    ? SYSTEM_PRODUCT_HASH || '7a30d6576abfa238418b33c3c50ac14e'
    : QA_PRODUCT_HASH
)
function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    if (!item.startsWith('--')) {
      continue
    }
    const [key, inline] = item.slice(2).split('=', 2)
    result[key] = inline ?? argv[index + 1]
  }
  return result
}

function profileProcesses(profile) {
  const resolved = path.resolve(profile)
  const expected = new Set([resolved])
  if (OFFICIAL_ELECTRON_ACTIVE) {
    // Electron receives the profile root and appends the release product hash
    // internally, so the main command carries the parent directory rather
    // than the hash leaf used by auth/profile readers.
    expected.add(path.dirname(resolved))
  }
  return processTable().filter(item => expected.has(profileFromCommand(item.command)))
}

function resolveProfile(role, requested) {
  if (role === 'qa') {
    return path.resolve(requested || QA_PROFILE)
  }
  // Managed daily always uses the fixed profile; do not infer it from the first DevTools process.
  // can carry unrelated user-data-dir values, and a false match can launch a
  // second DevTools instance into the real daily profile.
  return path.resolve(DEFAULT_DAILY_PROFILE)
}

function ensureProfileAvailable(profile, role) {
  const resolved = path.resolve(profile)
  if (role === 'daily' && resolved !== path.resolve(DEFAULT_DAILY_PROFILE)) {
    const error = new Error('daily_profile_override_forbidden')
    error.code = 'daily_profile_override_forbidden'
    error.expected = path.resolve(DEFAULT_DAILY_PROFILE)
    error.observed = resolved
    throw error
  }
  if (!fs.existsSync(resolved)) {
    const error = new Error(`${role}_profile_missing: ${resolved}`)
    error.code = `${role}_profile_missing`
    throw error
  }
  const existing = profileProcesses(resolved)
  if (existing.length) {
    const error = new Error(`${role}_profile_in_use`)
    error.code = `${role}_profile_in_use`
    error.pids = existing.map(item => item.pid)
    throw error
  }
  return resolved
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

function hasLaunchArgument(command, flag, value) {
  const text = String(command || '')
  const expected = String(value)
  return text.includes(`${flag}=${expected}`) || text.includes(`${flag} ${expected}`)
}

function extensionProcessEvidence({ pid, profile, launch }) {
  if (launch.role !== 'qa' || launch.runtime_kind === 'official_electron') {
    return { required: false, verified: true, pids: [] }
  }
  const expectedProfile = `--user-data-dir=${path.resolve(launch.user_data_dir || profile)}`
  const expectedPackage = launch.package_dir ? path.resolve(launch.package_dir) : null
  const processes = [
    ...descendantsOf(pid),
    ...processTable().filter(item => Number(item.pid) === Number(pid))
  ]
  const matches = processes.filter(item => {
    const command = String(item.command || '')
    return (
      command.includes('--extension-process') &&
      command.includes(expectedProfile) &&
      (command.includes(`--nwapp-path=${expectedPackage}`) ||
        command.includes(`--package-dir=${expectedPackage}`))
    )
  })
  return {
    required: true,
    verified: matches.length > 0,
    pids: matches.map(item => Number(item.pid)).filter(Number.isInteger),
    commands: matches.map(item => item.command)
  }
}

function ensureFixedPortsAvailable(role) {
  const ports = [CONTROL_PORTS[role], SERVICE_PORTS[role]]
  if (NATIVE_DEBUG_PORTS[role] && !OFFICIAL_ELECTRON_ACTIVE) {
    ports.push(NATIVE_DEBUG_PORTS[role])
  }
  const conflicts = ports
    .map(port => ({ port, pids: listenerPids(port) }))
    .filter(item => item.pids.length)
  if (conflicts.length) {
    const error = new Error(`${role}_fixed_port_conflict`)
    error.code = 'devtools_fixed_port_conflict'
    error.role = role
    error.conflicts = conflicts
    throw error
  }
}

function launchProcessEvidence({
  pid,
  profile,
  launch,
  requiredListenerNames = ['control', 'service']
}) {
  const processes = profileProcesses(profile)
  const owner = processes.find(item => Number(item.pid) === Number(pid))
  const extension = extensionProcessEvidence({ pid, profile, launch })
  const ownerCommand = String(owner?.command || '')
  const expectedUserDataDir = path.resolve(launch.user_data_dir || profile)
  const ownerCommandVerified =
    launch.runtime_kind === 'official_electron'
      ? Boolean(
          owner &&
          ownerCommand.includes(SYSTEM_ELECTRON) &&
          ownerCommand.includes(SYSTEM_APP_ASAR) &&
          ownerCommand.includes('--cli') &&
          hasLaunchArgument(ownerCommand, '--user-data-dir', expectedUserDataDir) &&
          hasLaunchArgument(ownerCommand, '--remote-port', launch.service_port) &&
          hasLaunchArgument(ownerCommand, '--ide-http-port', launch.control_port)
        )
      : Boolean(
          owner &&
          ownerCommand.includes(launch.command) &&
          hasLaunchArgument(ownerCommand, '--user-data-dir', path.resolve(profile)) &&
          hasLaunchArgument(ownerCommand, '--package-dir', path.resolve(launch.package_dir)) &&
          hasLaunchArgument(ownerCommand, '--remote-port', launch.service_port) &&
          hasLaunchArgument(ownerCommand, '--ide-http-port', launch.control_port) &&
          (launch.role !== 'qa' ||
            (hasLaunchArgument(ownerCommand, '--load-extension', launch.extension.path) &&
              ownerCommand.includes(
                `--custom-devtools-frontend=${pathToFileURL(path.join(launch.extension.frontend_path || launch.extension.path, 'inspector')).href}`
              )))
        )
  const listeners = [
    { name: 'control', port: launch.control_port, pids: listenerPids(launch.control_port) },
    { name: 'service', port: launch.service_port, pids: listenerPids(launch.service_port) }
  ]
  const profilePids = new Set(processes.map(item => Number(item.pid)))
  const listenersVerified = listeners
    .filter(item => requiredListenerNames.includes(item.name))
    .every(
      item =>
        item.pids.length > 0 &&
        item.pids.every(
          pidValue =>
            profilePids.has(pidValue) &&
            (Number(pidValue) === Number(pid) ||
              ancestorsFrom(pidValue).some(itemValue => Number(itemValue.pid) === Number(pid)))
        )
    )
  return {
    pid: Number(pid),
    process_start_identity: processStartIdentity(pid),
    process_alive: processAlive(pid),
    owner_command_verified: ownerCommandVerified,
    owner_command: owner?.command || null,
    extension,
    profile_process_pids: processes.map(item => item.pid),
    listeners,
    listeners_verified: listenersVerified,
    ready: Boolean(
      processAlive(pid) && ownerCommandVerified && listenersVerified && extension.verified
    )
  }
}

function waitForLaunchReady({
  pid,
  profile,
  role,
  launch,
  requiredListenerNames,
  timeoutMs = 30_000
}) {
  const deadline = Date.now() + timeoutMs
  let evidence = launchProcessEvidence({ pid, profile, launch, requiredListenerNames })
  while (!evidence.ready && Date.now() < deadline) {
    const waitMs = Math.min(250, Math.max(1, deadline - Date.now()))
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs)
    evidence = launchProcessEvidence({ pid, profile, launch, requiredListenerNames })
  }
  if (!evidence.ready) {
    const extensionFailed = role === 'qa' && evidence.extension?.verified !== true
    const error = new Error(
      extensionFailed
        ? 'QA DevTools extension 未形成实际扩展进程，拒绝进入 ready'
        : `${role}_devtools_launch_readiness_timeout`
    )
    error.code = extensionFailed ? 'qa_extension_load_failed' : 'devtools_launch_readiness_timeout'
    error.role = role
    error.evidence = evidence
    throw error
  }
  return evidence
}

function stopSpawnedProcess({
  pid,
  profile,
  packageDir,
  runtimeKind = 'legacy_native',
  userDataDir = profile,
  runtimePackage = packageDir
}) {
  const expectedStartIdentity = processStartIdentity(pid)
  if (!expectedStartIdentity) {
    return
  }
  const processes = processTable()
  const root = processes.find(item => Number(item.pid) === Number(pid))
  const resolvedProfile = path.resolve(profile)
  const resolvedPackage = packageDir ? path.resolve(packageDir) : null
  const resolvedUserDataDir = path.resolve(userDataDir)
  const rootOwned = Boolean(
    root &&
    (runtimeKind === 'official_electron'
      ? profileFromCommand(root.command) === resolvedUserDataDir &&
        String(root.command || '').includes(path.resolve(runtimePackage)) &&
        String(root.command || '').includes('--cli')
      : profileFromCommand(root.command) === resolvedProfile &&
        String(root.command || '').includes(resolvedPackage)) &&
    processStartIdentity(root.pid) === expectedStartIdentity
  )
  if (!rootOwned) {
    return
  }
  // Once the root owner is verified, its entire descendant tree is owned by
  // this launch attempt. Renderer helpers may not repeat --package-dir or
  // --user-data-dir, so filtering descendants by command would leak them on
  // a failed readiness cleanup.
  const owned = [root, ...descendantsOf(pid)]
  for (const item of owned.reverse()) {
    sendSignal(item.pid, 'SIGTERM')
  }
}

export function isNewQaEnrollmentRecord(record, baseline = null) {
  if (!record) {
    return false
  }
  if (!baseline) {
    return true
  }
  const fingerprint = value =>
    `${value.record_sha256}:${value.ticket_expired_at}:${value.signature_expired_at}`
  return fingerprint(record) !== fingerprint(baseline)
}

async function waitForQaEnrollment({ profile, timeoutMs = 5 * 60 * 1000 } = {}) {
  // Enrollment must observe a new usable record produced by this login
  // window. If the profile already contains a still-fresh record, accepting it
  // immediately would make an expired server-side session look repaired and
  // would silently skip the QR login the operator was asked to complete.
  const baseline = findQaProfileAuthRecord(profile)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const record = findQaProfileAuthRecord(profile)
    if (isNewQaEnrollmentRecord(record, baseline)) {
      const adopted = syncQaAuthFromProfile({ profile })
      return {
        record: {
          name: record.name,
          filePath: record.filePath,
          bytes: record.bytes,
          hash: record.hash,
          storageFormat: record.storageFormat,
          storageKey: record.storageKey,
          profile_realpath: record.profile_realpath,
          identity_hash: record.identity_hash,
          ticket_expired_at: record.ticket_expired_at,
          signature_expired_at: record.signature_expired_at
        },
        baseline: baseline
          ? {
              record_sha256: baseline.record_sha256,
              ticket_expired_at: baseline.ticket_expired_at,
              signature_expired_at: baseline.signature_expired_at
            }
          : null,
        adopted
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const error = new Error('QA DevTools 二维码登录未在限定时间内完成')
  error.code = 'qa_devtools_enrollment_timeout'
  throw error
}

async function waitForEnrollmentProcess({
  pid,
  profile,
  packageDir,
  runtimeKind = 'legacy_native',
  userDataDir = profile,
  runtimePackage = packageDir,
  timeoutMs = 30_000
}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const owner = profileProcesses(profile).find(item => Number(item.pid) === Number(pid))
    const command = String(owner?.command || '')
    const expectedUserDataDir = path.resolve(userDataDir)
    const ownerVerified =
      runtimeKind === 'official_electron'
        ? command.includes(SYSTEM_ELECTRON) &&
          command.includes(path.resolve(runtimePackage)) &&
          command.includes('--cli') &&
          hasLaunchArgument(command, '--user-data-dir', expectedUserDataDir)
        : command.includes(path.resolve(packageDir)) &&
          profileFromCommand(command) === path.resolve(profile)
    if (processAlive(pid) && ownerVerified) {
      return {
        pid: Number(pid),
        process_start_identity: processStartIdentity(pid),
        owner_command_verified: true,
        listener_requirements: [],
        enrollment_process: true
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  const error = new Error('QA enrollment DevTools 进程未形成可验证的 QA profile owner')
  error.code = 'qa_devtools_enrollment_owner_unverified'
  throw error
}

async function waitForProcessExit(pid, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (processAlive(pid) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (processAlive(pid)) {
    const error = new Error('QA enrollment DevTools 未能在限定时间内退出')
    error.code = 'qa_devtools_enrollment_cleanup_failed'
    error.pid = pid
    throw error
  }
}

function clearQaControlMarkers(profile) {
  const resolved = path.resolve(profile)
  if (resolved !== path.resolve(QA_PROFILE)) {
    const error = new Error('qa_control_marker_profile_invalid')
    error.code = 'qa_control_marker_profile_invalid'
    throw error
  }
  if (profileProcesses(resolved).length) {
    const error = new Error('qa_profile_in_use')
    error.code = 'qa_profile_in_use'
    throw error
  }
  const removed = []
  for (const relative of ['Default/.ide', 'Default/.ide-status', 'Default/.cli']) {
    const target = path.join(resolved, relative)
    if (!fs.existsSync(target)) {
      continue
    }
    fs.rmSync(target, { force: true })
    removed.push(relative)
  }
  return removed
}

function resolveDailyProfileExtension(profile) {
  const extension = path.join(path.resolve(profile), 'WeappPlugin')
  const manifest = path.join(extension, 'manifest.json')
  const inspector = path.join(extension, 'inspector')
  if (
    !fs.existsSync(manifest) ||
    !fs.statSync(inspector, { throwIfNoEntry: false })?.isDirectory()
  ) {
    const error = new Error(`daily_profile_extension_missing: ${extension}`)
    error.code = 'daily_profile_extension_missing'
    error.profile = path.resolve(profile)
    throw error
  }
  return { path: extension, frontend_path: extension }
}

export function buildLaunch({
  role,
  profile,
  packageDir = SYSTEM_PACKAGE,
  command = SYSTEM_NW_BINARY,
  installedBundle = null
}) {
  const controlPort = CONTROL_PORTS[role]
  const servicePort = SERVICE_PORTS[role]
  const appSessionId = `${role}-${crypto.randomBytes(8).toString('hex')}`
  const runtimeKind =
    installedBundle?.runtime_kind ||
    (OFFICIAL_ELECTRON_ACTIVE ? 'official_electron' : 'legacy_native')
  if (runtimeKind === 'official_electron') {
    const resolvedProfile = path.resolve(profile)
    const userDataDir = path.dirname(resolvedProfile)
    return {
      command: SYSTEM_ELECTRON,
      args: buildOfficialElectronDevToolsArgs({
        servicePort,
        controlPort,
        userDataDir,
        appSessionId,
        appAsar: installedBundle?.app_asar || SYSTEM_APP_ASAR
      }),
      role,
      profile: resolvedProfile,
      user_data_dir: userDataDir,
      control_port: controlPort,
      service_port: servicePort,
      runtime_kind: 'official_electron',
      runtime_package: installedBundle?.app_asar || SYSTEM_APP_ASAR,
      package_dir: null,
      command_boundary: 'installed_official_electron',
      package_boundary: 'installed_app_asar',
      installed_bundle: installedBundle,
      extension: null
    }
  }
  const qa = role === 'qa'
  const extension = qa ? ensureQaExtensionSnapshot() : resolveDailyProfileExtension(profile)
  const profileExtension = qa
    ? (ensureQaHomePluginManifest(), ensureQaProfileExtension({ profile, extension }))
    : extension
  const selectedPackage = path.resolve(packageDir || SYSTEM_PACKAGE)
  const args = buildInstalledNativeDevToolsArgs({
    servicePort,
    controlPort,
    userDataDir: profile,
    extensionPath: profileExtension?.path || null,
    customFrontend: profileExtension
      ? pathToFileURL(path.join(extension.frontend_path, 'inspector')).href
      : null,
    appSessionId,
    packageDir: selectedPackage,
    browserDebugPort: NATIVE_DEBUG_PORTS[role]
  })
  return {
    command,
    args,
    role,
    profile: path.resolve(profile),
    user_data_dir: path.resolve(profile),
    control_port: controlPort,
    service_port: servicePort,
    runtime_kind: 'legacy_native',
    runtime_package: INSTALLED_DEVTOOLS_PACKAGE,
    package_dir: INSTALLED_DEVTOOLS_PACKAGE,
    command_boundary: 'installed_native_nw_executable',
    package_boundary: 'installed_native_package',
    installed_bundle: installedBundle,
    extension: { ...profileExtension }
  }
}

function openProjectWithOfficialCli({ projectPath, controlPort, environment, executable }) {
  const resolvedProject = path.resolve(String(projectPath || ''))
  if (
    !resolvedProject ||
    !fs.existsSync(path.join(resolvedProject, 'app.json')) ||
    !fs.existsSync(path.join(resolvedProject, 'project.config.json'))
  ) {
    const error = new Error('managed_daily_project_required_for_official_cli_bootstrap')
    error.code = 'qa_managed_daily_project_required_for_official_cli_bootstrap'
    error.project_path = resolvedProject || null
    throw error
  }
  const cliExecutable = executable || SYSTEM_CLI
  const result = spawnSync(
    cliExecutable,
    ['open', '--project', resolvedProject, '--port', String(controlPort)],
    {
      input: 'y\n',
      encoding: 'utf8',
      timeout: 30_000,
      env: environment,
      maxBuffer: 1024 * 1024
    }
  )
  const evidence = {
    executable: cliExecutable,
    args: ['open', '--project', resolvedProject, '--port', String(controlPort)],
    status: result.status ?? null,
    signal: result.signal ?? null,
    timed_out: result.error?.code === 'ETIMEDOUT',
    stdout: String(result.stdout || '').slice(-2000),
    stderr: String(result.stderr || result.error?.message || '').slice(-2000),
    project_path: resolvedProject,
    control_port: Number(controlPort),
    confirmation: 'y'
  }
  if (result.error || result.status !== 0) {
    const error = new Error('managed_daily_official_cli_open_failed')
    error.code = 'qa_managed_daily_official_cli_open_failed'
    error.evidence = evidence
    throw error
  }
  return evidence
}

function waitForRendererWarmup({ pid, profile, launch }) {
  // 官方 Electron 使用 profile 的父目录作为 userDataDir；legacy NW 才把
  // profile 本身作为 userDataDir。官方 bundle 没有 package_dir，不能解析空值。
  const expectedUserDataDir =
    launch.runtime_kind === 'official_electron'
      ? path.dirname(path.resolve(profile))
      : path.resolve(profile)
  const expectedProfile = `--user-data-dir=${expectedUserDataDir}`
  const expectedPackage =
    launch.runtime_kind === 'official_electron' ? null : path.resolve(launch.package_dir)
  const deadline = Date.now() + 15_000
  let evidence = null
  let stableSince = null
  while (Date.now() < deadline) {
    const processes = profileProcesses(profile)
    const owner = processes.find(item => Number(item.pid) === Number(pid))
    const renderers = processes.filter(item => {
      const command = String(item.command || '')
      return (
        command.includes('--type=renderer') &&
        command.includes(expectedProfile) &&
        (launch.runtime_kind === 'official_electron' ||
          command.includes(`--nwapp-path=${expectedPackage}`) ||
          command.includes(`--package-dir=${expectedPackage}`))
      )
    })
    const ownerCommand = String(owner?.command || '')
    evidence = {
      pid: Number(pid),
      owner_command: owner?.command || null,
      owner_verified: Boolean(
        owner &&
        ownerCommand.includes(expectedProfile) &&
        (launch.runtime_kind === 'official_electron'
          ? ownerCommand.includes(SYSTEM_ELECTRON) &&
            ownerCommand.includes(SYSTEM_APP_ASAR) &&
            ownerCommand.includes('--cli')
          : ownerCommand.includes(`--package-dir=${expectedPackage}`))
      ),
      renderer_pids: renderers.map(item => Number(item.pid)).filter(Number.isInteger),
      ready: Boolean(owner && renderers.length > 0)
    }
    if (evidence.owner_verified && evidence.ready) {
      stableSince ??= Date.now()
      if (Date.now() - stableSince >= 5_000) {
        evidence.stable_for_ms = Date.now() - stableSince
        return evidence
      }
    } else {
      stableSince = null
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
  }
  const error = new Error('managed_daily_devtools_renderer_warmup_timeout')
  error.code = 'qa_managed_daily_devtools_renderer_warmup_timeout'
  error.evidence = evidence
  throw error
}

export function buildEnrollmentEnvironment({ role, launch, baseEnv = process.env } = {}) {
  const official = launch?.runtime_kind === 'official_electron'
  const realHome = baseEnv.HOME || baseEnv.USERPROFILE || '/tmp'
  const runtimeHome = official ? realHome : role === 'qa' ? QA_DEVTOOLS_HOME : realHome
  return {
    ...baseEnv,
    HOME: runtimeHome,
    USERPROFILE: runtimeHome,
    WECHAT_DEVTOOLS_SHARED_AUTH_ROOT: QA_SHARED_AUTH_ROOT,
    WECHAT_DEVTOOLS_SHARED_AUTH_ROLE: role,
    WECHAT_QA_LAUNCHER_ROLE: role,
    WECHAT_QA_RUNTIME_KIND: launch.runtime_kind,
    WECHAT_QA_LAUNCHER_NW_BINARY: official ? '' : launch.command,
    WECHAT_QA_LAUNCHER_PACKAGE_DIR: official ? '' : launch.package_dir,
    WECHAT_QA_PROFILE_PATH: path.resolve(launch.profile),
    WECHAT_QA_CONTROL_PORT: String(launch.control_port),
    WECHAT_QA_SERVICE_PORT: String(launch.service_port),
    ...(launch.extension
      ? {
          WECHAT_QA_EXTENSION_PATH: launch.extension.path,
          WECHAT_QA_CUSTOM_FRONTEND: pathToFileURL(
            path.join(launch.extension.frontend_path, 'inspector')
          ).href
        }
      : {}),
    ...(role === 'qa' ? { WECHAT_QA_ENROLLMENT: '1' } : {})
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const role = args.role || 'qa'
  const enrollment = Object.hasOwn(args, 'enroll')
  if (!Object.hasOwn(CONTROL_PORTS, role)) {
    throw new Error('role must be daily or qa')
  }
  const profile = ensureProfileAvailable(resolveProfile(role, args.profile), role)
  ensureFixedPortsAvailable(role)
  const recoveredDailyControlMarkers =
    role === 'daily'
      ? reconcileManagedDailyControlMarkers({
          profile,
          expectedProfile: DEFAULT_DAILY_PROFILE,
          recoveryRoot: path.join(QA_SHARED_AUTH_ROOT, 'recovery'),
          profileProcesses,
          listenerPids
        })
      : { status: 'not_applicable', recovered: [] }
  const managedDailyProject = role === 'daily' ? resolveManagedDailyProject(args) : null
  const managedDailyProjectDisplay = managedDailyProject
    ? ensureManagedDailyProjectDisplayName(managedDailyProject)
    : null
  const clearedQaControlMarkers = role === 'qa' ? clearQaControlMarkers(profile) : []
  if (role === 'daily') {
    fs.rmSync(DAILY_CAPABILITY_PATH, { force: true })
  }
  // The daily process is the only allowed source that may refresh the shared
  // ticket. Do not require a fresh local record before launching the managed
  // daily process: that process is the only approved writer and may perform
  // the real refresh through the broker. QA may launch alongside a native
  // daily process only after a fresh ticket is observed in that profile; a
  // fresh shared generation alone is not sufficient evidence that the active
  // native process is still usable.
  const broker = enrollment ? null : ensureQaAuthBrokerSync({ sync: role === 'qa' })
  if (
    role === 'qa' &&
    broker?.daily_process?.active &&
    !broker.daily_process.managed &&
    !broker?.auth_generation
  ) {
    const error = new Error('qa_auth_broker_daily_unmanaged_process_conflict')
    error.code = 'qa_auth_broker_daily_unmanaged_process_conflict'
    error.daily_process = broker.daily_process
    throw error
  }
  let authBridge = null
  if (role === 'qa' && !enrollment) {
    authBridge = syncQaAuthFromDailyReadOnly({ qaProfile: profile })
  }
  const authState = role === 'qa' && !enrollment ? assertQaAuthMaterialReady({ profile }) : null
  // Both managed roles must use the same immutable installed DevTools build.
  // The legacy NW package path is retained only for older installations;
  // Electron releases launch app.asar directly and must never be copied or
  // patched into a QA profile.
  const installedBundle = assertInstalledDevToolsBundle()
  if (role === 'qa' && installedBundle.runtime_kind !== 'official_electron') {
    ensureQaProfileNativePackage({ profile })
  }
  const bundle = {
    command:
      installedBundle.runtime_kind === 'official_electron'
        ? installedBundle.electron
        : installedBundle.nw_binary,
    runtime_package:
      installedBundle.runtime_kind === 'official_electron'
        ? installedBundle.app_asar
        : installedBundle.package_dir,
    runtime_kind: installedBundle.runtime_kind || 'legacy_native',
    runtime_boundary:
      installedBundle.runtime_kind === 'official_electron'
        ? 'installed_official_electron'
        : 'installed_native_bundle'
  }
  const launch = buildLaunch({ role, profile, installedBundle })
  const singletonReset =
    launch.runtime_kind === 'official_electron' && role === 'qa'
      ? resetOfficialQaSingletons(launch.user_data_dir)
      : []
  if (role === 'qa' && launch.runtime_kind !== 'official_electron') {
    assertNativeAuthDebugPortAvailable({
      port: QA_NATIVE_AUTH_DEBUG_PORT,
      profile
    })
  }
  const environment = {
    ...buildEnrollmentEnvironment({
      role,
      launch: { ...launch, profile },
      baseEnv: process.env
    }),
    ...(role === 'daily'
      ? { WECHAT_QA_DAILY_CAPABILITY: crypto.randomBytes(32).toString('hex') }
      : {})
  }
  const child = spawn(launch.command, launch.args, {
    detached: true,
    env: environment,
    stdio: 'ignore'
  })
  child.unref?.()
  let readiness = null
  let nativeAuthSync = null
  if (role === 'daily') {
    const capabilityDeadline = Date.now() + 5_000
    let startIdentity = processStartIdentity(child.pid)
    while (!startIdentity && Date.now() < capabilityDeadline) {
      startIdentity = processStartIdentity(child.pid)
    }
    if (!startIdentity) {
      throw Object.assign(new Error('managed daily process start identity unavailable'), {
        code: 'qa_managed_daily_capability_unavailable'
      })
    }
    writeManagedDailyCapability({
      capabilityPath: DAILY_CAPABILITY_PATH,
      pid: child.pid,
      profile,
      capability: environment.WECHAT_QA_DAILY_CAPABILITY,
      process_start_identity: startIdentity,
      project_path: managedDailyProject,
      bundle_root: path.resolve(path.dirname(launch.command), '..', '..')
    })
  }
  let officialCliOpen = null
  try {
    if (role === 'daily') {
      const controlReadiness = waitForLaunchReady({
        pid: child.pid,
        profile,
        role,
        launch,
        requiredListenerNames: ['control']
      })
      officialCliOpen = openProjectWithOfficialCli({
        projectPath: managedDailyProject,
        controlPort: CONTROL_PORTS.daily,
        environment,
        profile,
        executable: SYSTEM_CLI
      })
      // Official Electron does not create the project renderer until the
      // project has been opened through the control plane. Waiting for a
      // renderer before /open creates a startup deadlock on fresh launches.
      const warmup = waitForRendererWarmup({ pid: child.pid, profile, launch })
      officialCliOpen.warmup = warmup
      officialCliOpen.control_readiness = controlReadiness
      await openManagedDailyProject({
        projectPath: managedDailyProject,
        controlPort: CONTROL_PORTS.daily,
        servicePort: SERVICE_PORTS.daily,
        runtimeKind: launch.runtime_kind
      })
    }
    readiness = enrollment
      ? await waitForEnrollmentProcess({
          pid: child.pid,
          profile,
          packageDir: launch.package_dir,
          runtimeKind: launch.runtime_kind,
          userDataDir: launch.user_data_dir,
          runtimePackage: launch.runtime_package
        })
      : waitForLaunchReady({
          pid: child.pid,
          profile,
          role,
          launch,
          // Electron 2.02.2609012 may keep the internal service port private;
          // the control listener is the authoritative readiness signal. The
          // managed-daily project opener performs its own service check when
          // a project actually needs the Automator channel.
          requiredListenerNames:
            launch.runtime_kind === 'official_electron' ? ['control'] : undefined
        })
    if (role === 'qa' && !enrollment && launch.runtime_kind !== 'official_electron') {
      nativeAuthSync = await syncNativeAuthRuntime({
        auth: currentShared(),
        mainPid: child.pid,
        profile,
        port: QA_NATIVE_AUTH_DEBUG_PORT
      })
    }
    if (role === 'qa' && enrollment) {
      const enrollmentResult = await waitForQaEnrollment({
        profile,
        timeoutMs: Number(args['enroll-timeout-ms']) || 5 * 60 * 1000
      })
      stopSpawnedProcess({
        pid: child.pid,
        profile,
        packageDir: launch.package_dir,
        runtimeKind: launch.runtime_kind,
        userDataDir: launch.user_data_dir,
        runtimePackage: launch.runtime_package
      })
      await waitForProcessExit(child.pid)
      readiness = { ...readiness, enrollment: enrollmentResult }
    }
  } catch (error) {
    stopSpawnedProcess({
      pid: child.pid,
      profile,
      packageDir: launch.package_dir,
      runtimeKind: launch.runtime_kind,
      userDataDir: launch.user_data_dir,
      runtimePackage: launch.runtime_package
    })
    if (role === 'daily') {
      let capability = null
      try {
        capability = JSON.parse(fs.readFileSync(DAILY_CAPABILITY_PATH, 'utf8'))
      } catch {
        capability = null
      }
      if (Number(capability?.pid) === Number(child.pid)) {
        fs.rmSync(DAILY_CAPABILITY_PATH, { force: true })
      }
    }
    throw error
  }
  console.log(
    JSON.stringify(
      {
        status: 'started',
        code: `${role}_devtools_started`,
        pid: child.pid ?? null,
        ...launch,
        runtime_kind: launch.runtime_kind,
        runtime_package: launch.runtime_package,
        command_boundary: launch.command_boundary,
        package_boundary: launch.package_boundary,
        nw_binary: launch.runtime_kind === 'official_electron' ? null : launch.command,
        shared_auth_root: QA_SHARED_AUTH_ROOT,
        auth_state: authState || readiness?.enrollment?.adopted?.manifest || null,
        auth_bridge: authBridge,
        native_auth_sync: nativeAuthSync,
        enrollment_mode: enrollment,
        project_path: managedDailyProject,
        project_display: managedDailyProjectDisplay,
        recovered_daily_control_markers: recoveredDailyControlMarkers,
        bundle,
        official_cli_open: officialCliOpen,
        cleared_qa_control_markers: clearedQaControlMarkers,
        reset_official_singletons: singletonReset,
        profiles_are_distinct:
          role === 'qa' ? profile !== path.resolve(DEFAULT_DAILY_PROFILE) : true,
        readiness
      },
      null,
      2
    )
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(
      JSON.stringify(
        {
          status: 'blocked',
          code: error.code || 'devtools_start_failed',
          message: error.message,
          pids: error.pids || [],
          role: error.role || null,
          evidence: error.evidence || null
        },
        null,
        2
      )
    )
    process.exitCode = 1
  })
}
