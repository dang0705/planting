import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { getFunctionPorts } from '../../../../../../scripts/dev/local-api-env-config.mjs'
import {
  isOfficialElectronBundle,
  SYSTEM_PRODUCT_HASH
} from '../../../../../../scripts/qa/patch-wechat-devtools-launcher.mjs'

export const QA_RUNTIME_PLANE_VERSION = 3
export const QA_RUNTIME_ROOT = path.join(os.homedir(), '.planting', 'automator-qa', 'v3')
export const QA_RUNTIME_SESSIONS_ROOT = path.join(QA_RUNTIME_ROOT, 'sessions')
export const QA_RUNTIME_REGISTRY_ROOT = path.join(QA_RUNTIME_ROOT, 'registry')
export const QA_RUNTIME_RUNTIMES_ROOT = path.join(QA_RUNTIME_ROOT, 'runtimes')
// Runtime metadata must live outside the directory opened by DevTools.  A
// metadata write inside mp-weixin is itself a project change and can trigger
// a compile, invalidate the quiet window, and race the first screenshot.
export const QA_RUNTIME_MANIFEST_ROOT = path.join(QA_RUNTIME_ROOT, 'manifests')
export const QA_RUNTIME_SUPERVISOR_ROOT = path.join(QA_RUNTIME_ROOT, 'supervisor')
export const QA_RUNTIME_QUEUE_ROOT = path.join(QA_RUNTIME_SUPERVISOR_ROOT, 'queue')
export const QA_RUNTIME_PORT_ROOT = path.join(QA_RUNTIME_SUPERVISOR_ROOT, 'ports')
export const QA_RUNTIME_LEASE_ROOT = path.join(QA_RUNTIME_ROOT, 'leases')
export const QA_RUNTIME_OWNER_MARKER = path.join(QA_RUNTIME_ROOT, 'owner.json')
export const QA_RUNTIME_PROFILE_HOME = path.join(os.homedir(), '.planting', 'qa-devtools-home')
export const QA_RUNTIME_DEVTOOLS_PROFILE_ROOT = path.join(
  'Library',
  'Application Support',
  '微信开发者工具'
)
export const QA_RUNTIME_WS_PORT = 9421
export const QA_RUNTIME_CONTROL_PORT = 9422
export const QA_RUNTIME_SERVICE_PORT = 3799
export const QA_RUNTIME_NATIVE_AUTH_DEBUG_PORT = 9424
export const QA_RUNTIME_LAN_PORT = 3011
export const QA_RUNTIME_FUNCTION_PORT_BASE = 9100
export const QA_RUNTIME_DEVTOOLS_RUNTIME_KIND = isOfficialElectronBundle()
  ? 'official_electron'
  : 'legacy_native'
export const QA_RUNTIME_PROFILE_PRODUCT_HASH =
  QA_RUNTIME_DEVTOOLS_RUNTIME_KIND === 'official_electron' && SYSTEM_PRODUCT_HASH
    ? SYSTEM_PRODUCT_HASH
    : '7a30d6576abfa238418b33c3c50ac14e'

export function resolveQaDevToolsProfile({ profileHome = QA_RUNTIME_PROFILE_HOME } = {}) {
  const home = ensureRegularDirectory(profileHome, 'qa_profile_path_invalid')
  assertNotDailyProfile(home)
  const root = path.join(home, QA_RUNTIME_DEVTOOLS_PROFILE_ROOT)
  const preferred = path.join(root, QA_RUNTIME_PROFILE_PRODUCT_HASH)
  if (QA_RUNTIME_DEVTOOLS_RUNTIME_KIND === 'official_electron' && !fs.existsSync(preferred)) {
    // The Electron bundle creates its product-hash directory lazily on first
    // launch. Create only the empty QA-owned container so auth migration and
    // project registration have a deterministic target; no daily profile
    // files or credentials are copied here.
    fs.mkdirSync(path.join(preferred, 'Default'), { recursive: true })
    fs.mkdirSync(path.join(preferred, 'WeappLocalData'), { recursive: true })
  }
  // `.cli` is a transient control marker and is deliberately removed during
  // QA cleanup. It must not decide which persistent profile owns the account;
  // otherwise the next run can fall back to an unrelated legacy profile.
  const preferredInitialized =
    fs.existsSync(preferred) &&
    fs.statSync(preferred).isDirectory() &&
    fs.existsSync(path.join(preferred, 'Default')) &&
    fs.existsSync(path.join(preferred, 'WeappLocalData'))
  const candidates = fs.existsSync(root)
    ? fs
        .readdirSync(root, { withFileTypes: true })
        .filter(item => item.isDirectory())
        .map(item => path.join(root, item.name))
        .filter(
          item =>
            fs.existsSync(path.join(item, 'Default')) &&
            fs.existsSync(path.join(item, 'WeappLocalData'))
        )
    : []
  const profile = preferredInitialized
    ? fs.realpathSync(preferred)
    : candidates.length === 1
      ? fs.realpathSync(candidates[0])
      : ''
  if (!profile) {
    const error = new Error('QA DevTools profile is not initialized; login is required')
    error.code = 'qa_devtools_auth_required'
    throw error
  }
  return { home, profile }
}

function isPidAlive(pid) {
  const numericPid = Number(pid)
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false
  }
  try {
    process.kill(numericPid, 0)
    const state = spawnSync('ps', ['-p', String(numericPid), '-o', 'state='], {
      encoding: 'utf8'
    }).stdout
    return !/^\s*Z/u.test(String(state || ''))
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

export function processStartIdentity(pid) {
  const numericPid = Number(pid)
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return null
  }
  const result = spawnSync('ps', ['-p', String(numericPid), '-o', 'lstart='], {
    encoding: 'utf8'
  })
  const value = String(result.stdout || '').trim()
  return result.status === 0 && value ? value : null
}

const currentProcessStartIdentity = processStartIdentity(process.pid)

function leaseOwnerAlive(owner) {
  if (!isPidAlive(owner?.pid)) {
    return false
  }
  if (!owner?.process_start_identity) {
    // Old leases did not persist a process identity. Keep them blocking until
    // their PID disappears; only the explicit QA stop/recovery path may remove
    // an owner record whose provenance is unknown.
    return true
  }
  return processStartIdentity(owner.pid) === owner.process_start_identity
}

function ensureRegularDirectory(target, code) {
  const absolute = path.resolve(target)
  let stat
  try {
    stat = fs.lstatSync(absolute)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
    fs.mkdirSync(absolute, { recursive: true })
    stat = fs.lstatSync(absolute)
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    const failure = new Error(`QA path must be a real directory: ${absolute}`)
    failure.code = code
    throw failure
  }
  return fs.realpathSync(absolute)
}

function assertNotDailyProfile(profileHome) {
  const dailyHome = path.join(os.homedir(), 'Library', 'Application Support', '微信开发者工具')
  const profile = path.resolve(profileHome)
  const daily = path.resolve(dailyHome)
  if (profile === daily || profile.startsWith(`${daily}${path.sep}`)) {
    const error = new Error('QA profile may not be inside the daily DevTools profile')
    error.code = 'qa_profile_overlaps_daily_profile'
    throw error
  }
}

export function ensureQaRuntimeRoot() {
  for (const directory of [
    QA_RUNTIME_ROOT,
    QA_RUNTIME_SESSIONS_ROOT,
    QA_RUNTIME_REGISTRY_ROOT,
    QA_RUNTIME_RUNTIMES_ROOT,
    QA_RUNTIME_MANIFEST_ROOT,
    QA_RUNTIME_SUPERVISOR_ROOT,
    QA_RUNTIME_QUEUE_ROOT,
    QA_RUNTIME_PORT_ROOT,
    QA_RUNTIME_LEASE_ROOT
  ]) {
    ensureRegularDirectory(directory, 'qa_runtime_root_invalid')
  }
  return QA_RUNTIME_ROOT
}

export function ensureQaOwnerMarker({ profileHome = QA_RUNTIME_PROFILE_HOME } = {}) {
  ensureQaRuntimeRoot()
  const profile = ensureRegularDirectory(profileHome, 'qa_profile_path_invalid')
  assertNotDailyProfile(profile)
  let existing = null
  try {
    existing = JSON.parse(fs.readFileSync(QA_RUNTIME_OWNER_MARKER, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      const failure = new Error('QA owner marker is unreadable; refusing to take ownership')
      failure.code = 'qa_owner_marker_invalid'
      failure.cause = error
      throw failure
    }
  }
  if (existing) {
    if (
      existing.schema_version !== QA_RUNTIME_PLANE_VERSION ||
      existing.owner !== 'planting-automator-qa' ||
      path.resolve(String(existing.profile_home || '')) !== profile
    ) {
      const failure = new Error('QA owner marker belongs to another runtime contract')
      failure.code = 'qa_owner_marker_conflict'
      failure.marker = existing
      throw failure
    }
    return {
      status: 'preserved',
      marker_path: QA_RUNTIME_OWNER_MARKER,
      profile_home: profile,
      owner_token: existing.owner_token
    }
  }
  const marker = {
    schema_version: QA_RUNTIME_PLANE_VERSION,
    owner: 'planting-automator-qa',
    profile_home: profile,
    owner_token: crypto.randomUUID(),
    created_by_pid: process.pid,
    created_at: new Date().toISOString()
  }
  const temporary = `${QA_RUNTIME_OWNER_MARKER}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 })
  try {
    if (!atomicCreate(QA_RUNTIME_OWNER_MARKER, marker)) {
      const failure = new Error('QA owner marker was created concurrently')
      failure.code = 'qa_owner_marker_conflict'
      throw failure
    }
  } finally {
    fs.rmSync(temporary, { force: true })
  }
  return {
    status: 'created',
    marker_path: QA_RUNTIME_OWNER_MARKER,
    profile_home: profile,
    owner_token: marker.owner_token
  }
}

function sourceWorktreeFromProjectPath(projectPath) {
  const project = path.resolve(projectPath)
  if (path.basename(project) !== 'mp-weixin') {
    const error = new Error(`QA project must be an mp-weixin output directory: ${project}`)
    error.code = 'qa_project_path_invalid'
    throw error
  }
  const dist = path.dirname(path.dirname(project))
  if (path.basename(dist) !== 'dist') {
    const error = new Error(`QA project output must be under dist/dev/mp-weixin: ${project}`)
    error.code = 'qa_project_path_invalid'
    throw error
  }
  return fs.realpathSync(path.dirname(dist))
}

function projectAppId(projectPath) {
  const configPath = path.join(path.resolve(projectPath), 'project.config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const appid = String(config.appid || '').trim()
  if (!appid) {
    const error = new Error(`QA project.config.json lacks appid: ${configPath}`)
    error.code = 'qa_project_appid_missing'
    throw error
  }
  return appid
}

function gitHead(worktree) {
  const result = spawnSync('git', ['-C', worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'uncommitted'
}

function fingerprintFiles(worktree, include) {
  const digest = crypto.createHash('sha256')
  const tracked = spawnSync(
    'git',
    ['-C', worktree, 'ls-files', '-co', '--exclude-standard', '-z'],
    {
      encoding: 'buffer'
    }
  )
  const files =
    tracked.status === 0
      ? tracked.stdout
          .toString('utf8')
          .split('\0')
          .filter(Boolean)
          .filter(
            relative => !/(^|\/)(node_modules|dist|\.tmp|\.e2e-artifacts)(\/|$)/u.test(relative)
          )
          .filter(include)
      : []
  for (const relative of files.sort()) {
    const filePath = path.join(worktree, relative)
    try {
      const stat = fs.statSync(filePath)
      digest.update(relative)
      digest.update('\0')
      digest.update(fs.readFileSync(filePath))
      digest.update(`\0${stat.size}`)
    } catch {
      digest.update(`${relative}\0missing`)
    }
  }
  return digest.digest('hex')
}

function sourceFingerprint(worktree) {
  return fingerprintFiles(
    worktree,
    relative =>
      relative.startsWith('src/') ||
      relative.startsWith('cloudfunctions/') ||
      relative === 'pages.json' ||
      relative === 'package.json' ||
      relative.startsWith('vite.config.')
  )
}

function backendSourceFingerprint(worktree) {
  return fingerprintFiles(worktree, relative => relative.startsWith('cloudfunctions/'))
}

function qaHarnessFingerprint(worktree) {
  return fingerprintFiles(
    worktree,
    relative =>
      relative.startsWith('scripts/dev/') ||
      relative.startsWith('scripts/qa/') ||
      relative.startsWith('test/e2e/automator/') ||
      relative.startsWith('.codex/skills/dispatch-task/scripts/dispatch-gate/lib/') ||
      relative === 'test/e2e/automator/catalog.json' ||
      relative === 'docs/ai-rules/frontend-automation-id-policy.md'
  )
}

export function deriveQaRuntime({ sourceProjectPath } = {}) {
  ensureQaRuntimeRoot()
  const sourceProject = path.resolve(String(sourceProjectPath || ''))
  const sourceWorktree = sourceWorktreeFromProjectPath(sourceProject)
  const appid = projectAppId(sourceProject)
  const runtimeKey = crypto
    .createHash('sha256')
    .update(`${sourceWorktree}\0${appid}`)
    .digest('hex')
    .slice(0, 32)
  const runtimePath = path.join(QA_RUNTIME_RUNTIMES_ROOT, runtimeKey, 'mp-weixin')
  ensureRegularDirectory(path.dirname(runtimePath), 'qa_runtime_path_invalid')
  return {
    runtimeKey,
    runtimePath,
    sourceProjectPath: sourceProject,
    sourceWorktree,
    appid,
    sourceHead: gitHead(sourceWorktree),
    sourceFingerprint: sourceFingerprint(sourceWorktree),
    backendSourceFingerprint: backendSourceFingerprint(sourceWorktree),
    qaHarnessFingerprint: qaHarnessFingerprint(sourceWorktree)
  }
}

function runtimeKeyFromPath(runtimePath) {
  const resolved = path.resolve(runtimePath)
  const parent = path.basename(path.dirname(resolved))
  const runtimesRoot = path.resolve(QA_RUNTIME_RUNTIMES_ROOT)
  const expectedParent = path.dirname(resolved)
  if (expectedParent.startsWith(`${runtimesRoot}${path.sep}`) && /^[a-f0-9]{32}$/u.test(parent)) {
    return parent
  }
  return null
}

export function qaRuntimeManifestPath(runtimeOrPath) {
  const runtimePath = typeof runtimeOrPath === 'string' ? runtimeOrPath : runtimeOrPath?.runtimePath
  const resolved = path.resolve(String(runtimePath || ''))
  const runtimeKey =
    typeof runtimeOrPath === 'object' && runtimeOrPath?.runtimeKey
      ? String(runtimeOrPath.runtimeKey)
      : runtimeKeyFromPath(resolved)
  const isManagedRuntimePath = resolved.startsWith(
    `${path.resolve(QA_RUNTIME_RUNTIMES_ROOT)}${path.sep}`
  )
  if (isManagedRuntimePath && /^[a-f0-9]{32}$/u.test(runtimeKey || '')) {
    return path.join(QA_RUNTIME_MANIFEST_ROOT, `${runtimeKey}.json`)
  }
  // Non-production callers (notably isolated contract tests) may use a
  // temporary runtime path that has no runtime-key parent.  Keep their
  // metadata beside the temporary generation, still outside mp-weixin.
  return path.join(path.dirname(resolved), '.qa-runtime-manifest.json')
}

export function readQaRuntimeManifest(runtimePath) {
  try {
    return JSON.parse(fs.readFileSync(qaRuntimeManifestPath(runtimePath), 'utf8'))
  } catch {
    return null
  }
}

export function writeQaRuntimeManifest(runtime, patch = {}) {
  const target = path.resolve(runtime.runtimePath)
  fs.mkdirSync(target, { recursive: true })
  const metadataPath = qaRuntimeManifestPath(runtime)
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true, mode: 0o700 })
  const previous = readQaRuntimeManifest(runtime)
  const manifest = {
    schema_version: QA_RUNTIME_PLANE_VERSION,
    runtime_key: runtime.runtimeKey,
    source_worktree: runtime.sourceWorktree,
    source_head: runtime.sourceHead,
    source_fingerprint: runtime.sourceFingerprint,
    backend_source_fingerprint:
      runtime.backendSourceFingerprint || previous?.backend_source_fingerprint || '',
    qa_harness_fingerprint: runtime.qaHarnessFingerprint || previous?.qa_harness_fingerprint || '',
    generation: Object.hasOwn(patch, 'generation')
      ? Number(patch.generation)
      : Number(previous?.generation || 0) + 1,
    appid: runtime.appid,
    project_path: target,
    manifest_path: metadataPath,
    build_output_path: Object.hasOwn(patch, 'build_output_path')
      ? path.resolve(patch.build_output_path)
      : previous?.build_output_path || target,
    api_base_url: Object.hasOwn(patch, 'api_base_url')
      ? patch.api_base_url
      : previous?.api_base_url || '',
    identity_hash: Object.hasOwn(patch, 'identity_hash')
      ? patch.identity_hash
      : previous?.identity_hash || '',
    build_status: patch.build_status || 'building',
    built_at: Object.hasOwn(patch, 'built_at') ? patch.built_at : previous?.built_at || null,
    function_port_base:
      patch.function_port_base || previous?.function_port_base || QA_RUNTIME_FUNCTION_PORT_BASE,
    auth_generation: Number(patch.auth_generation || previous?.auth_generation || 0),
    devtools_package_hash: Object.hasOwn(patch, 'devtools_package_hash')
      ? patch.devtools_package_hash
      : previous?.devtools_package_hash || '',
    qa_owner_pid: Object.hasOwn(patch, 'qa_owner_pid')
      ? patch.qa_owner_pid
      : previous?.qa_owner_pid || process.pid,
    lan_owner_pid: Object.hasOwn(patch, 'lan_owner_pid')
      ? patch.lan_owner_pid
      : previous?.lan_owner_pid || process.pid,
    devtools_owner_pid: Object.hasOwn(patch, 'devtools_owner_pid')
      ? patch.devtools_owner_pid
      : previous?.devtools_owner_pid || null,
    updated_at: new Date().toISOString()
  }
  const temporary = `${metadataPath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, metadataPath)
  return manifest
}

export function prepareQaRuntimeProject(runtime, { sessionId = null, projectPath = null } = {}) {
  const configPath = path.join(runtime.runtimePath, 'project.config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const baseProjectName = String(config.projectname || '青花植').replace(
    /(?:【日常】|【QA】)$/u,
    ''
  )
  // The QA mirror must be visually distinguishable from the user's daily
  // project in DevTools. This is display metadata only; appid, project path,
  // profile, runtime and authentication remain unchanged.
  config.projectname = `${baseProjectName}【QA】`
  config.libVersion = config.libVersion || '3.15.2'
  config.setting = {
    ...config.setting,
    minifyWXML: true,
    minifyWXSS: true,
    minified: false,
    useApiHook: false,
    useApiHostProcess: false,
    useMultiFrameRuntime: false,
    compileHotReLoad: false,
    useStaticServer: false,
    useLanDebug: false
  }
  const temporary = `${configPath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`)
  fs.renameSync(temporary, configPath)
  // Older v3 revisions placed these files in the watched project. Remove only
  // those exact QA-generated files from the QA-owned mirror; never touch the
  // source worktree or any user-owned dist directory.
  for (const generatedPath of [
    path.join(runtime.runtimePath, '.qa-runtime-snapshot.json'),
    path.join(runtime.runtimePath, '.qa-runtime-manifest.json'),
    path.join(runtime.runtimePath, '.qa-runtime-project.json')
  ]) {
    fs.rmSync(generatedPath, { force: true })
  }
  const markerPath = path.join(QA_RUNTIME_MANIFEST_ROOT, `${runtime.runtimeKey}.project.json`)
  fs.mkdirSync(path.dirname(markerPath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(
    markerPath,
    `${JSON.stringify({ schema_version: QA_RUNTIME_PLANE_VERSION, runtime_key: runtime.runtimeKey, source_project_path: runtime.sourceProjectPath, project_path: path.resolve(projectPath || runtime.runtimePath), session_id: sessionId || null }, null, 2)}\n`
  )
  return { configPath, markerPath }
}

function assertRuntimeGenerationPath(runtime, candidate, prefix) {
  const root = path.resolve(path.dirname(runtime.runtimePath))
  const resolved = path.resolve(candidate)
  const relative = path.relative(root, resolved)
  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    !relative.startsWith(`${prefix}-`) ||
    path.basename(resolved) !== 'mp-weixin'
  ) {
    const error = new Error(`QA generation path is outside the runtime key: ${resolved}`)
    error.code = 'qa_generation_path_invalid'
    throw error
  }
  const parent = path.dirname(resolved)
  ensureRegularDirectory(parent, 'qa_generation_path_invalid')
  return resolved
}

export function createQaRuntimeStagingPath(runtime, token) {
  const safeToken = String(token || '').replace(/[^a-zA-Z0-9_-]/gu, '_')
  if (!safeToken) {
    const error = new Error('QA generation token is required')
    error.code = 'qa_generation_token_invalid'
    throw error
  }
  const root = path.join(path.dirname(runtime.runtimePath), `.staging-${safeToken}`)
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  return path.join(root, 'mp-weixin')
}

export function promoteQaRuntimeGeneration(runtime, { stagingPath, token } = {}) {
  const target = path.resolve(runtime.runtimePath)
  const staging = assertRuntimeGenerationPath(runtime, stagingPath, '.staging')
  const targetParent = path.dirname(target)
  ensureRegularDirectory(targetParent, 'qa_runtime_path_invalid')
  const targetStat = fs.existsSync(target) ? fs.lstatSync(target) : null
  if (targetStat?.isSymbolicLink()) {
    const error = new Error(`QA active runtime must not be a symlink: ${target}`)
    error.code = 'qa_runtime_path_invalid'
    throw error
  }
  if (
    !fs.existsSync(path.join(staging, 'app.json')) ||
    !fs.existsSync(path.join(staging, 'project.config.json'))
  ) {
    const error = new Error(`QA staging generation is incomplete: ${staging}`)
    error.code = 'qa_generation_incomplete'
    throw error
  }
  const safeToken = String(
    token || path.basename(path.dirname(staging)).slice('.staging-'.length)
  ).replace(/[^a-zA-Z0-9_-]/gu, '_')
  const retiredRoot = path.join(targetParent, `.retired-${safeToken}-${Date.now()}`)
  const retired = path.join(retiredRoot, 'mp-weixin')
  fs.mkdirSync(retiredRoot, { recursive: true, mode: 0o700 })
  let movedOld = false
  try {
    if (targetStat) {
      fs.renameSync(target, retired)
      movedOld = true
    }
    fs.renameSync(staging, target)
  } catch (error) {
    try {
      if (fs.existsSync(target) && movedOld) {
        fs.renameSync(target, path.join(retiredRoot, 'failed-mp-weixin'))
      }
      if (movedOld && fs.existsSync(retired)) {
        fs.renameSync(retired, target)
      }
    } catch (restoreError) {
      error.code = 'qa_generation_switch_restore_failed'
      error.restore_error = restoreError.message
      throw error
    }
    error.code ??= 'qa_generation_switch_failed'
    throw error
  }
  return {
    status: 'promoted',
    active_path: target,
    staging_path: staging,
    retired_path: movedOld ? retired : null,
    switched_at: new Date().toISOString()
  }
}

export function restoreQaRuntimeGeneration(runtime, { retiredPath, token } = {}) {
  const target = path.resolve(runtime.runtimePath)
  const retired = assertRuntimeGenerationPath(runtime, retiredPath, '.retired')
  if (!fs.existsSync(retired)) {
    const error = new Error(`QA retired generation is unavailable: ${retired}`)
    error.code = 'qa_generation_rollback_source_missing'
    throw error
  }
  const safeToken = String(
    token || path.basename(path.dirname(retired)).slice('.retired-'.length)
  ).replace(/[^a-zA-Z0-9_-]/gu, '_')
  const failedRoot = path.join(path.dirname(target), `.failed-${safeToken}-${Date.now()}`)
  const failed = path.join(failedRoot, 'mp-weixin')
  fs.mkdirSync(failedRoot, { recursive: true, mode: 0o700 })
  let movedCurrent = false
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, failed)
      movedCurrent = true
    }
    fs.renameSync(retired, target)
  } catch (error) {
    try {
      if (movedCurrent && fs.existsSync(failed) && !fs.existsSync(target)) {
        fs.renameSync(failed, target)
      }
    } catch (restoreError) {
      error.code = 'qa_generation_rollback_failed'
      error.restore_error = restoreError.message
      throw error
    }
    error.code ??= 'qa_generation_rollback_failed'
    throw error
  }
  return {
    status: 'restored',
    active_path: target,
    restored_path: retired,
    failed_path: movedCurrent ? failed : null,
    restored_at: new Date().toISOString()
  }
}

export function runtimeManifestIsReady(
  runtime,
  manifest = readQaRuntimeManifest(runtime.runtimePath)
) {
  return Boolean(
    manifest &&
    manifest.schema_version === QA_RUNTIME_PLANE_VERSION &&
    manifest.runtime_key === runtime.runtimeKey &&
    manifest.source_worktree === runtime.sourceWorktree &&
    manifest.source_head === runtime.sourceHead &&
    manifest.source_fingerprint === runtime.sourceFingerprint &&
    manifest.backend_source_fingerprint === runtime.backendSourceFingerprint &&
    manifest.qa_harness_fingerprint === runtime.qaHarnessFingerprint &&
    manifest.appid === runtime.appid &&
    manifest.project_path === path.resolve(runtime.runtimePath) &&
    manifest.build_output_path === path.resolve(runtime.runtimePath) &&
    manifest.build_status === 'ready' &&
    /^[a-f0-9]{64}$/u.test(String(manifest.identity_hash || '')) &&
    Number.isInteger(Number(manifest.auth_generation)) &&
    Number(manifest.auth_generation) > 0 &&
    Number(manifest.generation) > 0 &&
    typeof manifest.built_at === 'string' &&
    Number.isFinite(Date.parse(manifest.built_at)) &&
    Number.isInteger(Number(manifest.function_port_base)) &&
    /^https?:\/\/[^\s/]+(?::\d+)?(?:\/[^\s]*)?$/u.test(String(manifest.api_base_url || '')) &&
    Number(manifest.qa_owner_pid) > 0 &&
    Number(manifest.lan_owner_pid) > 0 &&
    Number(manifest.devtools_owner_pid) > 0 &&
    /^[a-f0-9]{64}$/u.test(String(manifest.devtools_package_hash || ''))
  )
}

export function assertQaRuntimeReady(runtime) {
  const manifest = readQaRuntimeManifest(runtime.runtimePath)
  if (!runtimeManifestIsReady(runtime, manifest)) {
    const error = new Error(`QA runtime is not ready: ${runtime.runtimePath}`)
    error.code = 'qa_runtime_not_ready'
    error.manifest = manifest
    throw error
  }
  return manifest
}

export function watchQaRuntimeSource(runtime, { onChange = () => {} } = {}) {
  const watched = []
  let stopped = false
  let timer = null
  let lastFingerprint = `${runtime.sourceHead}\0${runtime.sourceFingerprint}\0${runtime.backendSourceFingerprint}\0${runtime.qaHarnessFingerprint}`
  const invalidate = () => {
    if (stopped) {
      return
    }
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (stopped) {
        return
      }
      const next = deriveQaRuntime({ sourceProjectPath: runtime.sourceProjectPath })
      const nextFingerprint = `${next.sourceHead}\0${next.sourceFingerprint}\0${next.backendSourceFingerprint}\0${next.qaHarnessFingerprint}`
      if (nextFingerprint === lastFingerprint) {
        return
      }
      lastFingerprint = nextFingerprint
      writeQaRuntimeManifest(next, {
        build_status: 'stale',
        built_at: null,
        qa_owner_pid: process.pid,
        lan_owner_pid: null
      })
      onChange({ status: 'stale', runtime, current: next })
    }, 250)
  }
  const watchDirectory = directory => {
    if (!fs.existsSync(directory)) {
      return
    }
    try {
      watched.push(fs.watch(directory, { recursive: true }, invalidate))
    } catch {
      // The manifest is still checked against a fresh fingerprint at every QA start.
    }
  }
  watchDirectory(path.join(runtime.sourceWorktree, 'src'))
  watchDirectory(path.join(runtime.sourceWorktree, 'cloudfunctions'))
  watchDirectory(path.join(runtime.sourceWorktree, 'scripts', 'dev'))
  watchDirectory(path.join(runtime.sourceWorktree, 'scripts', 'qa'))
  watchDirectory(
    path.join(
      runtime.sourceWorktree,
      '.codex',
      'skills',
      'dispatch-task',
      'scripts',
      'dispatch-gate',
      'lib'
    )
  )
  for (const file of ['pages.json', 'package.json', 'vite.config.js', 'vite.config.mjs']) {
    const filePath = path.join(runtime.sourceWorktree, file)
    if (fs.existsSync(filePath)) {
      fs.watchFile(filePath, { interval: 1000 }, invalidate)
      watched.push({ close: () => fs.unwatchFile(filePath, invalidate) })
    }
  }
  return {
    stop() {
      stopped = true
      clearTimeout(timer)
      watched.forEach(item => item.close())
    }
  }
}

function atomicCreate(filePath, value) {
  try {
    const fd = fs.openSync(filePath, 'wx', 0o600)
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`)
    fs.closeSync(fd)
    return true
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return false
    }
    throw error
  }
}

export async function acquireQaSupervisorLease({
  runtimeKey,
  timeoutMs = 90_000,
  supervisorRoot = QA_RUNTIME_SUPERVISOR_ROOT
} = {}) {
  if (supervisorRoot === QA_RUNTIME_SUPERVISOR_ROOT) {
    ensureQaRuntimeRoot()
  } else {
    fs.mkdirSync(path.join(supervisorRoot, 'queue'), { recursive: true, mode: 0o700 })
  }
  const queueRoot = path.join(supervisorRoot, 'queue')
  const token = crypto.randomUUID()
  const queueFile = path.join(queueRoot, `${Date.now()}-${process.pid}-${token}.json`)
  atomicCreate(queueFile, {
    token,
    runtime_key: runtimeKey,
    pid: process.pid,
    process_start_identity: currentProcessStartIdentity,
    queued_at: new Date().toISOString()
  })
  const leasePath = path.join(supervisorRoot, 'lease.json')
  const deadline = Date.now() + timeoutMs
  try {
    while (Date.now() < deadline) {
      const queue = fs
        .readdirSync(queueRoot)
        .filter(file => file.endsWith('.json'))
        .sort()
        .filter(file => {
          const candidate = path.join(queueRoot, file)
          try {
            const owner = JSON.parse(fs.readFileSync(candidate, 'utf8'))
            if (leaseOwnerAlive(owner)) {
              return true
            }
            fs.unlinkSync(candidate)
            return false
          } catch {
            // Queue entries are QA-owned disposable state. A malformed or
            // unreadable entry cannot establish ownership and must not block
            // every future project forever.
            try {
              fs.unlinkSync(candidate)
            } catch {
              // Another cleanup pass may have removed it.
            }
            return false
          }
        })
      let current = null
      try {
        current = JSON.parse(fs.readFileSync(leasePath, 'utf8'))
      } catch {
        // An absent lease is the idle state.
      }
      if (current && !leaseOwnerAlive(current)) {
        try {
          fs.unlinkSync(leasePath)
        } catch {
          // A concurrent stale-owner cleanup may have removed the lease.
        }
        current = null
      }
      if (!current && queue[0] === path.basename(queueFile)) {
        if (
          atomicCreate(leasePath, {
            token,
            runtime_key: runtimeKey,
            pid: process.pid,
            process_start_identity: currentProcessStartIdentity,
            acquired_at: new Date().toISOString()
          })
        ) {
          return {
            status: 'acquired',
            token,
            leasePath,
            queueFile,
            release() {
              let owner = null
              try {
                owner = JSON.parse(fs.readFileSync(leasePath, 'utf8'))
              } catch {
                // The lease may already be gone after owner release.
              }
              if (owner?.token === token && Number(owner?.pid) === process.pid) {
                try {
                  fs.unlinkSync(leasePath)
                } catch {
                  // A concurrent cleanup pass may have removed the lease.
                }
              }
              try {
                fs.unlinkSync(queueFile)
              } catch {
                // The queue entry is disposable after release.
              }
            }
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    const error = new Error('QA supervisor FIFO lease timeout')
    error.code = 'qa_supervisor_lease_timeout'
    throw error
  } finally {
    if (fs.existsSync(queueFile)) {
      try {
        fs.unlinkSync(queueFile)
      } catch {
        // The queue entry may already have been removed by the owner.
      }
    }
  }
}

function listenerPids(port) {
  const result = spawnSync('lsof', ['-tiTCP:' + Number(port), '-sTCP:LISTEN'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.split(/\s+/).filter(Boolean).map(Number) : []
}

export function acquireFixedQaPortLock({ kind, port, runtimeKey } = {}) {
  ensureQaRuntimeRoot()
  const filePath = path.join(QA_RUNTIME_PORT_ROOT, `${kind}-${Number(port)}.json`)
  const listeners = listenerPids(port)
  if (listeners.length) {
    const error = new Error(`QA fixed port ${port} is occupied by a non-QA-owned process`)
    error.code = 'qa_port_conflict'
    error.listeners = listeners
    throw error
  }
  const record = {
    schema_version: QA_RUNTIME_PLANE_VERSION,
    kind,
    port: Number(port),
    runtime_key: runtimeKey,
    pid: process.pid,
    process_start_identity: currentProcessStartIdentity,
    acquired_at: new Date().toISOString()
  }
  if (!atomicCreate(filePath, record)) {
    let owner = null
    try {
      owner = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      // A malformed lock is left for the next explicit repair pass.
    }
    if (owner?.pid && leaseOwnerAlive(owner)) {
      const error = new Error(`QA fixed port ${port} is owned by another QA process`)
      error.code = 'qa_port_conflict'
      throw error
    }
    try {
      fs.unlinkSync(filePath)
    } catch {
      // Stale owner cleanup is best effort; atomicCreate below remains the gate.
    }
    if (!atomicCreate(filePath, record)) {
      const error = new Error(`QA fixed port ${port} lease contention`)
      error.code = 'qa_port_conflict'
      throw error
    }
  }
  return {
    status: 'acquired',
    port: Number(port),
    filePath,
    release() {
      let owner = null
      try {
        owner = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      } catch {
        // A concurrent stale-lock cleanup may have removed the file.
      }
      if (
        owner?.pid === process.pid &&
        owner?.runtime_key === runtimeKey &&
        (!owner.process_start_identity ||
          owner.process_start_identity === currentProcessStartIdentity)
      ) {
        try {
          fs.unlinkSync(filePath)
        } catch {
          // A concurrent owner may have removed the file after verification.
        }
      }
    }
  }
}

export function reapStaleQaFixedPortLocks() {
  ensureQaRuntimeRoot()
  const removed = []
  for (const file of fs.readdirSync(QA_RUNTIME_PORT_ROOT)) {
    if (!file.endsWith('.json')) {
      continue
    }
    const filePath = path.join(QA_RUNTIME_PORT_ROOT, file)
    let owner
    try {
      owner = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      continue
    }
    if (!leaseOwnerAlive(owner)) {
      try {
        fs.unlinkSync(filePath)
        removed.push(file)
      } catch {
        // A concurrent owner or cleanup pass may have removed it.
      }
    }
  }
  return removed
}

export function qaRuntimeFixedPorts() {
  const ports = [
    { kind: 'automator', port: QA_RUNTIME_WS_PORT },
    { kind: 'control', port: QA_RUNTIME_CONTROL_PORT },
    { kind: 'service', port: QA_RUNTIME_SERVICE_PORT },
    { kind: 'lan', port: QA_RUNTIME_LAN_PORT },
    ...Object.entries(getFunctionPorts(QA_RUNTIME_FUNCTION_PORT_BASE)).map(([name, port]) => ({
      kind: `function-${name}`,
      port
    }))
  ]
  if (QA_RUNTIME_DEVTOOLS_RUNTIME_KIND !== 'official_electron') {
    ports.splice(3, 0, {
      kind: 'native-auth-debug',
      port: QA_RUNTIME_NATIVE_AUTH_DEBUG_PORT
    })
  }
  return ports
}
