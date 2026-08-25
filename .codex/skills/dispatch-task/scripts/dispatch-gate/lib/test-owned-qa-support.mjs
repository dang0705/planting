import fs from 'node:fs'
import crypto from 'node:crypto'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { localRuntimeLeasePath } from '../../../../../../scripts/dev/local-runtime-session.mjs'
import {
  LOCAL_RUNTIME_LEASE_ROOT,
  MP_WEIXIN_RUNTIME_TARGET
} from '../../../../../../scripts/dev/local-api-env-config.mjs'
import {
  QA_RUNTIME_LEASE_ROOT as QA_RUNTIME_PLANE_LEASE_ROOT,
  QA_RUNTIME_MANIFEST_ROOT,
  QA_RUNTIME_PROFILE_PRODUCT_HASH as QA_RUNTIME_PLANE_PROFILE_PRODUCT_HASH,
  processStartIdentity
} from './qa-runtime-plane.mjs'
import { readCurrentSessionProjectEvidence } from './devtools-session-log.mjs'
import {
  ancestorsFrom,
  controlPortListenerEvidence,
  directControlPortEvidence,
  listenerPids,
  mainDevToolsProcesses,
  normalizeRuntimePath,
  userDataDirFromCommand
} from './devtools-process-topology.mjs'
import { canReclaimStaleLock } from './process-liveness.mjs'
import { repoRoot } from './state.mjs'
import {
  QA_CLI,
  SYSTEM_CLI,
  isOfficialElectronBundle
} from '../../../../../../scripts/qa/patch-wechat-devtools-launcher.mjs'
import { QA_SHARED_AUTH_ROOT } from './test-owned-devtools-launch.mjs'

export const QA_RUNTIME_SESSION_ROOT = path.join(
  repoRoot,
  '.tmp',
  'dispatch-task',
  'qa-runtime-sessions'
)
export const QA_RUNTIME_PROFILE_PRODUCT_HASH =
  isOfficialElectronBundle()
    ? QA_RUNTIME_PLANE_PROFILE_PRODUCT_HASH
    : '7a30d6576abfa238418b33c3c50ac14e'
// The CLI is only a profile-routing adapter: the stock CLI hardcodes the
// daily product/profile and fails under the isolated QA HOME. It may issue
// open/quit requests, but it must never be used as the DevTools runtime
// executable; the runtime itself is always the installed native binary/package.
export const QA_RUNTIME_DEVTOOLS_CLI = isOfficialElectronBundle() ? SYSTEM_CLI : QA_CLI
export const QA_RUNTIME_PROFILE_ROOT = path.join('Library', 'Application Support', '微信开发者工具')
// Keep the test account separate from the operator's normal DevTools profile,
// but persist it across QA runs so a one-time QR login survives process
// cleanup and restart.
export const QA_RUNTIME_AUTH_HOME = path.join(os.homedir(), '.planting', 'qa-devtools-home')
export const QA_RUNTIME_AUTH_PROFILE_ROOT = path.join(QA_RUNTIME_AUTH_HOME, QA_RUNTIME_PROFILE_ROOT)
export const QA_RUNTIME_TARGET = MP_WEIXIN_RUNTIME_TARGET
export const QA_RUNTIME_LEASE_ROOT = LOCAL_RUNTIME_LEASE_ROOT
export const QA_RUNTIME_POLL_MS = 250
export const QA_RUNTIME_CLEANUP_TIMEOUT_MS = 15_000
const QA_PROFILE_PROJECT_LIST_KEY = 'reduxPersist:projectList'

// These directories contain compiler artefacts only. Simulator storage may
// carry the test account's authenticated mini-program state, so it must remain
// outside this list for a QR login to survive owned-process cleanup.
const QA_TRANSIENT_PROFILE_PATHS = Object.freeze([
  // The IDE writes the previous session's random HTTP control port here. It is
  // not authentication state; preserving it makes the next CLI invocation
  // connect to a dead test-owned port instead of opening its isolated project.
  'Default/.ide',
  'Default/.ide-status',
  'Default/.cli',
  'WeappApplication',
  'WeappCache/WeappCompileCache',
  'WeappCache/WeappTraceFiles',
  'WeappCache/requireCache',
  'WeappCache/skeletonCache',
  'WeappCache/bufferUrlCache',
  'WeappCache/ProxyCache',
  'WeappCache/dirCache',
  'WeappSimulator/WeappFileSystem',
  'WeappSimulator/WeappFileCache'
])

const QA_RUNTIME_PROFILE_LOCK = path.join(QA_RUNTIME_AUTH_HOME, '.profile.lock')

export function reapStaleQaPortLocks() {
  const lockRoot = path.join(QA_RUNTIME_SESSION_ROOT, 'locks')
  if (!fs.existsSync(lockRoot)) {
    return []
  }
  const removed = []
  for (const file of fs.readdirSync(lockRoot)) {
    if (!file.endsWith('.lock')) {
      continue
    }
    const filePath = path.join(lockRoot, file)
    let ownerPid = null
    try {
      ownerPid = JSON.parse(fs.readFileSync(filePath, 'utf8')).pid
    } catch {
      // A malformed lock cannot prove ownership. It is safe to reclaim only
      // when no process is using the lock file itself.
      try {
        if (fs.statSync(filePath).size === 0) {
          fs.unlinkSync(filePath)
          removed.push(file)
        }
      } catch {
        // Another cleanup pass may have removed it.
      }
      continue
    }
    if (processAlive(ownerPid)) {
      continue
    }
    try {
      fs.unlinkSync(filePath)
      removed.push(file)
    } catch {
      // Another cleanup pass may have won the race.
    }
  }
  return removed
}

export function processAlive(pid) {
  if (!pid || Number(pid) <= 0) {
    return false
  }
  try {
    process.kill(Number(pid), 0)
    const state = spawnSync('ps', ['-p', String(pid), '-o', 'state='], {
      encoding: 'utf8'
    }).stdout
    return !/^\s*Z/u.test(String(state || ''))
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

export function processTable() {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
  return result.stdout
    .split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map(match => ({ pid: Number(match[1]), parent_pid: Number(match[2]), command: match[3] }))
}

export function descendantsOf(rootPid) {
  const children = new Map()
  for (const item of processTable()) {
    const list = children.get(item.parent_pid) || []
    list.push(item)
    children.set(item.parent_pid, list)
  }
  const descendants = []
  const queue = [...(children.get(Number(rootPid)) || [])]
  while (queue.length) {
    const item = queue.shift()
    descendants.push(item)
    queue.push(...(children.get(item.pid) || []))
  }
  return descendants
}

export function sendSignal(pid, signal) {
  try {
    process.kill(Number(pid), signal)
    return true
  } catch (error) {
    return error?.code === 'ESRCH'
  }
}

function currentProcessLineage() {
  const table = processTable()
  const byPid = new Map(table.map(item => [Number(item.pid), item]))
  const lineage = new Set([process.pid])
  let current = byPid.get(Number(process.pid))
  const visited = new Set()
  while (current && !visited.has(Number(current.pid))) {
    visited.add(Number(current.pid))
    const parentPid = Number(current.parent_pid)
    if (!parentPid || parentPid === Number(current.pid)) {
      break
    }
    lineage.add(parentPid)
    current = byPid.get(parentPid)
  }
  return lineage
}

export async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await predicate()
      if (value) {
        return value
      }
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, QA_RUNTIME_POLL_MS))
  }
  const suffix = lastError?.message ? `: ${lastError.message}` : ''
  const error = new Error(`${label} exceeded ${timeoutMs}ms${suffix}`)
  error.code = 'qa_runtime_start_timeout'
  error.cause = lastError
  throw error
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(error => (error ? reject(error) : resolve(port)))
    })
  })
}

function portLockPath(kind, port) {
  return path.join(QA_RUNTIME_SESSION_ROOT, 'locks', `${kind}-${Number(port)}.lock`)
}

function acquirePortLock(kind, port) {
  const filePath = portLockPath(kind, port)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  try {
    const fd = fs.openSync(filePath, 'wx')
    fs.writeFileSync(
      fd,
      `${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`
    )
    return {
      status: 'acquired',
      port: Number(port),
      filePath,
      release() {
        try {
          fs.closeSync(fd)
        } catch {
          // The descriptor may already be closed during failure cleanup.
        }
        try {
          fs.unlinkSync(filePath)
        } catch {
          // The lock may already have been reclaimed by this owner.
        }
      }
    }
  } catch (error) {
    if (error.code === 'EEXIST' && canReclaimStaleLock({ lockPath: filePath })) {
      try {
        fs.unlinkSync(filePath)
        return acquirePortLock(kind, port)
      } catch {
        // Another owner may have won the race after stale-lock inspection.
      }
    }
    return { status: 'blocked', port: Number(port), filePath, code: error.code }
  }
}

export async function allocatePortLock(kind, { forbidden = new Set() } = {}) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const port = await freePort()
    if (forbidden.has(port)) {
      continue
    }
    const lock = acquirePortLock(kind, port)
    if (lock.status === 'acquired') {
      return lock
    }
  }
  const error = new Error(`unable to allocate unique ${kind} port`)
  error.code = 'qa_runtime_port_allocation_failed'
  throw error
}

function findSourceProfile() {
  const configured = process.env.WECHAT_DEVTOOLS_PROFILE_PATH
  if (configured && fs.existsSync(path.join(configured, 'Default', '.cli'))) {
    return path.resolve(configured)
  }
  const root = path.join(os.homedir(), QA_RUNTIME_PROFILE_ROOT)
  const candidates = fs.existsSync(root)
    ? fs
        .readdirSync(root, { withFileTypes: true })
        .filter(item => item.isDirectory())
        .map(item => path.join(root, item.name))
        .filter(candidate => fs.existsSync(path.join(candidate, 'Default', '.cli')))
    : []
  const preferred = path.join(root, QA_RUNTIME_PROFILE_PRODUCT_HASH)
  if (candidates.includes(preferred)) {
    return preferred
  }
  if (candidates.length === 1) {
    return candidates[0]
  }
  const error = new Error('微信开发者工具测试 profile 不可用')
  error.code = 'qa_test_profile_unavailable'
  throw error
}

export function acquirePersistentProfileLock() {
  fs.mkdirSync(QA_RUNTIME_AUTH_HOME, { recursive: true })
  try {
    const fd = fs.openSync(QA_RUNTIME_PROFILE_LOCK, 'wx')
    fs.writeFileSync(
      fd,
      `${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`
    )
    return {
      status: 'acquired',
      filePath: QA_RUNTIME_PROFILE_LOCK,
      release() {
        try {
          fs.closeSync(fd)
        } catch {
          // The descriptor may already be closed during failure cleanup.
        }
        try {
          fs.unlinkSync(QA_RUNTIME_PROFILE_LOCK)
        } catch {
          // A stale-lock recovery pass may already have removed it.
        }
      }
    }
  } catch (error) {
    if (error.code === 'EEXIST' && canReclaimStaleLock({ lockPath: QA_RUNTIME_PROFILE_LOCK })) {
      try {
        fs.unlinkSync(QA_RUNTIME_PROFILE_LOCK)
        return acquirePersistentProfileLock()
      } catch {
        // Another QA owner may have won the race after stale-lock inspection.
      }
    }
    const blocked = new Error('QA DevTools 登录 profile 正在被另一个测试占用')
    blocked.code = 'qa_test_profile_locked'
    blocked.cause = error
    throw blocked
  }
}

function shouldCopyProfilePath(source, sourcePath) {
  const relative = path.relative(source, sourcePath)
  const parts = relative ? relative.split(path.sep) : []
  const basename = path.basename(sourcePath)
  return (
    !parts.includes('WeappLog') &&
    !['LOCK', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'].includes(basename) &&
    relative !== path.join('Default', '.ide')
  )
}

export function resetTransientQaProfileState(profilePath) {
  const profile = path.resolve(String(profilePath || ''))
  const expectedRoot = path.resolve(QA_RUNTIME_AUTH_PROFILE_ROOT, QA_RUNTIME_PROFILE_PRODUCT_HASH)
  if (profile !== expectedRoot) {
    const error = new Error('QA transient cache reset refused outside the persistent QA profile')
    error.code = 'qa_transient_profile_path_invalid'
    throw error
  }

  const removed = []
  for (const relativePath of QA_TRANSIENT_PROFILE_PATHS) {
    const target = path.join(profile, relativePath)
    if (!fs.existsSync(target)) {
      continue
    }
    fs.rmSync(target, { recursive: true, force: true })
    removed.push(relativePath)
  }
  return {
    status: 'reset',
    profile,
    preserved: ['WeappLocalData', 'Default', 'WeappLog'],
    removed
  }
}

export function resetQaIdePortMarkers(profilePath) {
  const profile = path.resolve(String(profilePath || ''))
  const expectedRoot = path.resolve(QA_RUNTIME_AUTH_PROFILE_ROOT, QA_RUNTIME_PROFILE_PRODUCT_HASH)
  if (profile !== expectedRoot) {
    const error = new Error('QA IDE marker reset refused outside the persistent QA profile')
    error.code = 'qa_ide_marker_profile_invalid'
    throw error
  }

  const removed = []
  for (const relativePath of ['Default/.ide', 'Default/.ide-status', 'Default/.cli']) {
    const target = path.join(profile, relativePath)
    if (!fs.existsSync(target)) {
      continue
    }
    fs.rmSync(target, { recursive: true, force: true })
    removed.push(relativePath)
  }
  return {
    status: 'reset',
    profile,
    preserved: ['login', 'storage', 'WeappLocalData', 'WeappApplication', 'WeappCache'],
    removed
  }
}

function qaProfileLocalStorageFile(profilePath, key) {
  const profile = path.resolve(String(profilePath || ''))
  const expectedRoot = path.resolve(QA_RUNTIME_AUTH_PROFILE_ROOT, QA_RUNTIME_PROFILE_PRODUCT_HASH)
  if (profile !== expectedRoot) {
    const error = new Error('QA project registration refused outside the persistent QA profile')
    error.code = 'qa_project_list_profile_path_invalid'
    throw error
  }
  // DevTools' local-storage filename is the MD5 of the exact key.  Deriving
  // it directly makes the key deterministic and avoids selecting an
  // unrelated project by scanning hash_key_map_2/localstorage_*.json.
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) {
    const error = new Error('QA profile local-storage key is unavailable')
    error.code = 'qa_project_list_key_unavailable'
    throw error
  }
  return path.join(
    profile,
    'WeappLocalData',
    `localstorage_${crypto.createHash('md5').update(normalizedKey).digest('hex')}.json`
  )
}

function qaProfileProjectStateFile(profilePath, projectPath) {
  const profile = path.resolve(String(profilePath || ''))
  const expectedRoot = path.resolve(QA_RUNTIME_AUTH_PROFILE_ROOT, QA_RUNTIME_PROFILE_PRODUCT_HASH)
  if (profile !== expectedRoot) {
    const error = new Error(
      'QA project state registration refused outside the persistent QA profile'
    )
    error.code = 'qa_project_state_profile_path_invalid'
    throw error
  }
  const key = `project2_${path.resolve(String(projectPath))}`
  return {
    key,
    filePath: path.join(
      profile,
      'WeappLocalData',
      `localstorage_${crypto.createHash('md5').update(key).digest('hex')}.json`
    )
  }
}

function writeQaProfileJson(filePath, content) {
  const temporaryPath = `${filePath}.qa-tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temporaryPath, content)
  fs.renameSync(temporaryPath, filePath)
}

/**
 * Resolve the cached DevTools runtime state without treating the project hash
 * map as a source of truth.  The caller supplies the two exact MD5-derived
 * files; this helper never scans the profile or accepts an unrelated project.
 */
export function resolveQaProjectRuntimeStateCandidate({
  sourceStatePath,
  targetStatePath,
  sourceProjectPath,
  targetProjectPath,
  expectedAppId
} = {}) {
  const sourceProject = path.resolve(String(sourceProjectPath || ''))
  const targetProject = path.resolve(String(targetProjectPath || ''))
  const readState = filePath => {
    try {
      return { filePath, state: JSON.parse(fs.readFileSync(filePath, 'utf8')) }
    } catch {
      return null
    }
  }
  const stateMatchesAppId = state =>
    state?.appid === expectedAppId ||
    state?.appId === expectedAppId ||
    state?.attr?.appid === expectedAppId ||
    state?.attr?.appId === expectedAppId
  const stateProjectPath = state =>
    state?.projectpath || state?.projectPath || state?.projectid || state?.projectId || ''
  const exactStateFor = (filePath, expectedProject) => {
    const loaded = readState(filePath)
    if (!loaded || !stateMatchesAppId(loaded.state)) {
      return null
    }
    if (
      normalizeRuntimePath(stateProjectPath(loaded.state)) !==
      normalizeRuntimePath(expectedProject)
    ) {
      return null
    }
    return { ...loaded, expectedProject }
  }
  return (
    exactStateFor(targetStatePath, targetProject) ||
    exactStateFor(sourceStatePath, sourceProject)
  )
}

function qaProjectStateManifestPath(runtimeKey) {
  const value = String(runtimeKey || '')
  if (!/^[a-f0-9]{32}$/u.test(value)) {
    const error = new Error('QA project state runtime key is invalid')
    error.code = 'qa_project_runtime_key_invalid'
    throw error
  }
  return path.join(QA_RUNTIME_MANIFEST_ROOT, `${value}.project-state.json`)
}

function buildQaProjectStateManifest({
  runtimeKey,
  sourceProjectPath,
  targetProjectPath,
  appid,
  sourceStatePath,
  targetStatePath,
  sourceState
}) {
  const manifestPath = qaProjectStateManifestPath(runtimeKey)
  const manifest = {
    schema_version: 1,
    runtime_key: runtimeKey,
    source_project_path: path.resolve(sourceProjectPath),
    target_project_path: path.resolve(targetProjectPath),
    appid,
    source_state_path: path.resolve(sourceStatePath),
    target_state_path: path.resolve(targetStatePath),
    source_state_sha256: crypto
      .createHash('sha256')
      .update(JSON.stringify(sourceState))
      .digest('hex'),
    registered_at: new Date().toISOString()
  }
  return { manifestPath, manifest }
}

export function buildQaProjectRuntimeState({
  sourceState = {},
  projectPath,
  projectConfig = {}
} = {}) {
  const normalizedProjectPath = path.resolve(String(projectPath))
  const projectSettings = projectConfig.setting || {}
  return {
    ...sourceState,
    projectid: normalizedProjectPath,
    projectpath: normalizedProjectPath,
    projectPath: normalizedProjectPath,
    appid: projectConfig.appid || sourceState.appid,
    projectname: projectConfig.projectname || sourceState.projectname,
    // DevTools stores this runtime discriminator as `weapp` even though the
    // generated project.config.json uses the public config value
    // `miniprogram`. Replacing the cached runtime value with the public
    // config value makes a fresh project fail during appservice bootstrap.
    // Keep the cached runtime discriminator when it is available.
    compileType: sourceState.compileType || 'weapp',
    libVersion: projectConfig.libVersion || sourceState.libVersion,
    setting: {
      ...sourceState.setting,
      ...projectSettings
    },
    attr: sourceState.attr
      ? {
          ...sourceState.attr,
          setting: {
            ...sourceState.attr.setting,
            ...projectSettings
          }
        }
      : sourceState.attr
  }
}

export function registerQaProjectInProfile({
  profilePath,
  projectPath,
  sourceProjectPath,
  projectConfig,
  runtimeKey
} = {}) {
  const filePath = qaProfileLocalStorageFile(profilePath, QA_PROFILE_PROJECT_LIST_KEY)
  const previousRaw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null
  const mapPath = path.join(
    path.resolve(String(profilePath)),
    'WeappLocalData',
    'hash_key_map_2.json'
  )
  const previousMapRaw = fs.existsSync(mapPath) ? fs.readFileSync(mapPath, 'utf8') : '{}\n'
  const sourceStateRecord = (() => {
    const sourceProject = path.resolve(String(sourceProjectPath))
    const targetProject = path.resolve(String(projectPath))
    const expectedAppId = projectConfig?.appid
    const exactSource = qaProfileProjectStateFile(profilePath, sourceProject)
    const exactTarget = qaProfileProjectStateFile(profilePath, targetProject)
    const readState = filePath => {
      try {
        return { filePath, state: JSON.parse(fs.readFileSync(filePath, 'utf8')) }
      } catch {
        return null
      }
    }
    const stateMatchesAppId = state =>
      state?.appid === expectedAppId ||
      state?.appId === expectedAppId ||
      state?.attr?.appid === expectedAppId ||
      state?.attr?.appId === expectedAppId
    const stateProjectPath = state =>
      state?.projectpath || state?.projectPath || state?.projectid || state?.projectId || ''
    const manifestPath = runtimeKey ? qaProjectStateManifestPath(runtimeKey) : null
    if (manifestPath && fs.existsSync(manifestPath)) {
      let manifest
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      } catch (error) {
        const invalid = new Error('QA project runtime-state manifest is unreadable')
        invalid.code = 'qa_project_runtime_state_manifest_invalid'
        invalid.cause = error
        throw invalid
      }
      const sourceStatePath = path.resolve(String(manifest?.source_state_path || ''))
      const targetStatePath = path.resolve(String(manifest?.target_state_path || ''))
      const exactSourcePath = path.resolve(exactSource.filePath)
      const exactTargetPath = path.resolve(exactTarget.filePath)
      const sourcePathMatches = [
        exactSourcePath,
        exactTargetPath
      ].includes(sourceStatePath)
      const targetPathMatches = targetStatePath === path.resolve(exactTarget.filePath)
      const manifestValid =
        manifest?.schema_version === 1 &&
        manifest.runtime_key === runtimeKey &&
        path.resolve(String(manifest.source_project_path || '')) === sourceProject &&
        path.resolve(String(manifest.target_project_path || '')) === targetProject &&
        manifest.appid === expectedAppId &&
        targetPathMatches &&
        sourcePathMatches
      if (!manifestValid) {
        // A QA product-hash migration changes the profile directory while
        // retaining the same runtime key and project.  Preserve the strict
        // manifest contract for every other mismatch, but allow this one
        // recoverable case to rebuild the manifest from the exact state files
        // in the current persistent QA profile.  This never scans the
        // profile, accepts the daily profile, or trusts the stale paths.
        const qaProfileRoot = path.resolve(QA_RUNTIME_AUTH_PROFILE_ROOT)
        const isQaProfileStatePath = filePath => {
          const relative = path.relative(qaProfileRoot, filePath)
          const parts = relative.split(path.sep)
          return (
            parts.length === 3 &&
            /^[a-f0-9]{32}$/u.test(parts[0]) &&
            parts[1] === 'WeappLocalData' &&
            /^localstorage_[a-f0-9]{32}\.json$/u.test(parts[2])
          )
        }
        const manifestIdentityMatchesTarget =
          manifest?.schema_version === 1 &&
          manifest.runtime_key === runtimeKey &&
          path.resolve(String(manifest.source_project_path || '')) === sourceProject &&
          path.resolve(String(manifest.target_project_path || '')) === targetProject &&
          manifest.appid === expectedAppId
        const manifestUsesCurrentProfileState =
          sourceStatePath === exactSourcePath && targetStatePath === exactTargetPath
        const currentCandidate = resolveQaProjectRuntimeStateCandidate({
          sourceStatePath: exactSourcePath,
          targetStatePath: exactTargetPath,
          sourceProjectPath: sourceProject,
          targetProjectPath: targetProject,
          expectedAppId
        })
        if (
          manifestIdentityMatchesTarget &&
          !manifestUsesCurrentProfileState &&
          isQaProfileStatePath(sourceStatePath) &&
          isQaProfileStatePath(targetStatePath) &&
          currentCandidate
        ) {
          return currentCandidate
        }
        const invalid = new Error('QA project runtime-state manifest does not match the target')
        invalid.code = 'qa_project_runtime_state_manifest_invalid'
        invalid.manifest = manifest
        throw invalid
      }
      const canonical = readState(sourceStatePath)
      if (!canonical || !stateMatchesAppId(canonical.state)) {
        const invalid = new Error('QA project runtime-state manifest points to unavailable state')
        invalid.code = 'qa_project_runtime_state_manifest_invalid'
        invalid.manifest = manifest
        throw invalid
      }
      const expectedStatePath = stateProjectPath(canonical.state)
      const statePathMatches =
        normalizeRuntimePath(expectedStatePath) === sourceProject ||
        normalizeRuntimePath(expectedStatePath) === targetProject
      if (!statePathMatches) {
        const invalid = new Error('QA project runtime-state manifest state path is inconsistent')
        invalid.code = 'qa_project_runtime_state_manifest_invalid'
        invalid.manifest = manifest
        throw invalid
      }
      return canonical
    }
    // The target mirror is the strongest source because it has already been
    // registered for this runtime key.  The source worktree's exact state
    // filename is the only permitted bootstrap fallback.  No project list,
    // hash-map, or local-storage directory scan is allowed here.
    return resolveQaProjectRuntimeStateCandidate({
      sourceStatePath: exactSource.filePath,
      targetStatePath: exactTarget.filePath,
      sourceProjectPath: sourceProject,
      targetProjectPath: targetProject,
      expectedAppId
    })
  })()
  if (!sourceStateRecord) {
    const error = new Error(
      `QA profile has no cached project runtime state for appid ${projectConfig?.appid || 'unknown'}`
    )
    error.code = 'qa_project_runtime_state_unavailable'
    throw error
  }
  const sourceState = sourceStateRecord.state
  const targetState = qaProfileProjectStateFile(profilePath, projectPath)
  const targetStatePreviousRaw = fs.existsSync(targetState.filePath)
    ? fs.readFileSync(targetState.filePath, 'utf8')
    : null
  let projectList = {}
  try {
    projectList = previousRaw ? JSON.parse(previousRaw) : {}
  } catch (error) {
    error.code = 'qa_project_list_parse_failed'
    throw error
  }
  const normalizedSourceProjectPath = path.resolve(String(sourceProjectPath))
  const sourceEntry =
    projectList[normalizedSourceProjectPath] || projectList[sourceProjectPath] || {}
  const normalizedProjectPath = path.resolve(String(projectPath))
  projectList[normalizedProjectPath] = {
    ...sourceEntry,
    projectId: normalizedProjectPath,
    appId: projectConfig?.appid || sourceEntry.appId,
    projectPath: normalizedProjectPath,
    projectName: sourceEntry.projectName || projectConfig?.projectname || 'QA snapshot',
    compileType: sourceEntry.compileType || 'weapp',
    isGame: false,
    appType: Number(sourceEntry.appType || 0),
    storage: sourceEntry.storage || {},
    accessTime: Date.now()
  }
  const nextMap = { ...JSON.parse(previousMapRaw) }
  nextMap[crypto.createHash('md5').update(targetState.key).digest('hex')] = targetState.key
  const state = buildQaProjectRuntimeState({ sourceState, projectPath, projectConfig })
  const sourceStatePath = sourceStateRecord.filePath
  let projectStateManifest = null
  let previousProjectStateManifestRaw = null
  if (runtimeKey) {
    const manifestPath = qaProjectStateManifestPath(runtimeKey)
    previousProjectStateManifestRaw = fs.existsSync(manifestPath)
      ? fs.readFileSync(manifestPath, 'utf8')
      : null
    projectStateManifest = buildQaProjectStateManifest({
      runtimeKey,
      sourceProjectPath,
      targetProjectPath: normalizedProjectPath,
      appid: projectConfig?.appid,
      sourceStatePath,
      targetStatePath: targetState.filePath,
      sourceState
    })
  }
  try {
    writeQaProfileJson(filePath, `${JSON.stringify(projectList)}\n`)
    writeQaProfileJson(mapPath, `${JSON.stringify(nextMap, null, 2)}\n`)
    writeQaProfileJson(targetState.filePath, `${JSON.stringify(state)}\n`)
    if (projectStateManifest) {
      writeQaProfileJson(
        projectStateManifest.manifestPath,
        `${JSON.stringify(projectStateManifest.manifest, null, 2)}\n`
      )
    }
  } catch (error) {
    if (previousRaw === null) {
      try {
        fs.unlinkSync(filePath)
      } catch {
        // The file may have been removed by a concurrent profile cleanup.
      }
    } else {
      writeQaProfileJson(filePath, previousRaw)
    }
    writeQaProfileJson(mapPath, previousMapRaw)
    if (targetStatePreviousRaw === null) {
      try {
        fs.unlinkSync(targetState.filePath)
      } catch {
        // The file may have been removed by a concurrent profile cleanup.
      }
    } else {
      writeQaProfileJson(targetState.filePath, targetStatePreviousRaw)
    }
    if (projectStateManifest) {
      if (previousProjectStateManifestRaw === null) {
        try {
          fs.unlinkSync(projectStateManifest.manifestPath)
        } catch {
          // The manifest may not have been written before the failure.
        }
      } else {
        writeQaProfileJson(projectStateManifest.manifestPath, previousProjectStateManifestRaw)
      }
    }
    throw error
  }
  return {
    status: 'registered',
    filePath,
    projectPath: normalizedProjectPath,
    previousRaw,
    mapPath,
    previousMapRaw,
    statePath: targetState.filePath,
    statePreviousRaw: targetStatePreviousRaw,
    projectStateManifestPath: projectStateManifest?.manifestPath || null,
    projectStateManifestPreviousRaw: previousProjectStateManifestRaw,
    projectStateManifest
  }
}

export function restoreQaProjectInProfile(registration) {
  if (!registration?.filePath) {
    return { status: 'not_needed' }
  }
  if (registration.previousRaw === null || registration.previousRaw === undefined) {
    try {
      fs.unlinkSync(registration.filePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        return { status: 'blocked', error: error.message }
      }
    }
  } else {
    writeQaProfileJson(registration.filePath, registration.previousRaw)
  }
  if (registration.statePath) {
    if (registration.statePreviousRaw === null || registration.statePreviousRaw === undefined) {
      try {
        fs.unlinkSync(registration.statePath)
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          return { status: 'blocked', error: error.message }
        }
      }
    } else {
      writeQaProfileJson(registration.statePath, registration.statePreviousRaw)
    }
  }
  if (registration.mapPath && registration.previousMapRaw) {
    writeQaProfileJson(registration.mapPath, registration.previousMapRaw)
  }
  if (registration.projectStateManifestPath) {
    if (
      registration.projectStateManifestPreviousRaw === null ||
      registration.projectStateManifestPreviousRaw === undefined
    ) {
      try {
        fs.unlinkSync(registration.projectStateManifestPath)
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          return { status: 'blocked', error: error.message }
        }
      }
    } else {
      writeQaProfileJson(
        registration.projectStateManifestPath,
        registration.projectStateManifestPreviousRaw
      )
    }
  }
  return { status: 'restored', filePath: registration.filePath }
}

export function cloneTestProfile() {
  const source = findSourceProfile()
  const home = QA_RUNTIME_AUTH_HOME
  const target = path.join(QA_RUNTIME_AUTH_PROFILE_ROOT, path.basename(source))
  const profileLock = acquirePersistentProfileLock()
  fs.mkdirSync(target, { recursive: true })
  try {
    // Initialize once from the installed user's profile. Subsequent runs retain
    // the completed QR login and mini-program storage, while per-run IDE port
    // markers and compiler artefacts are reset below.
    if (!fs.existsSync(path.join(target, 'Default', '.cli'))) {
      fs.cpSync(source, target, {
        recursive: true,
        filter(sourcePath) {
          return shouldCopyProfilePath(source, sourcePath)
        }
      })
    }
    const transientState = resetTransientQaProfileState(target)
    fs.mkdirSync(path.join(target, 'WeappLog', 'logs'), { recursive: true })
    return { home, profile: target, profileLock, transientState }
  } catch (error) {
    profileLock.release()
    throw error
  }
}

function runtimeLease(targetPath) {
  const target = normalizeRuntimePath(targetPath)
  const preferredRoot = target.startsWith(
    `${path.join(os.homedir(), '.planting', 'automator-qa')}${path.sep}`
  )
    ? QA_RUNTIME_PLANE_LEASE_ROOT
    : QA_RUNTIME_LEASE_ROOT
  const filePath = localRuntimeLeasePath(targetPath, preferredRoot)
  try {
    return { filePath, value: JSON.parse(fs.readFileSync(filePath, 'utf8')) }
  } catch {
    return { filePath, value: null }
  }
}

export function localRuntimeOwned(lease, ownerPid, targetPath) {
  return Boolean(
    lease?.value?.owner_pid &&
    Number(lease.value.owner_pid) === Number(ownerPid) &&
    normalizeRuntimePath(lease.value.target_path) === normalizeRuntimePath(targetPath) &&
    processAlive(ownerPid) &&
    (!lease.value.child_pid || processAlive(lease.value.child_pid))
  )
}

export function localRuntimeEvidence(targetPath) {
  return runtimeLease(targetPath)
}

export function mainForSession({ profile, devtools_user_data_dir, controlPort }) {
  const expectedUserDataDir = normalizeRuntimePath(
    String(devtools_user_data_dir || profile || '')
  )
  const expectedControlPort = Number(controlPort)
  if (
    !expectedUserDataDir ||
    !Number.isInteger(expectedControlPort) ||
    expectedControlPort <= 0
  ) {
    return null
  }
  const main = mainDevToolsProcesses().find(item => {
    const direct = directControlPortEvidence(item.command)
    return (
      normalizeRuntimePath(userDataDirFromCommand(item.command)) === expectedUserDataDir &&
      Number(direct.port) === expectedControlPort
    )
  })
  if (!main) {
    return null
  }
  return {
    ...main,
    // Official Electron writes timestamp-named WeappLog files instead of
    // embedding the argv session id in the filename. Keep the process start
    // identity alongside the verified owner so the log reader can reject
    // residue from an older cold start.
    process_start_identity: processStartIdentity(main.pid)
  }
}

export function ownedRuntimeEvidence(session) {
  const main = mainForSession(session)
  if (!main) {
    return {
      status: 'unavailable',
      code: 'qa_owned_devtools_not_found',
      automator_port: session.wsPort,
      control_port: session.controlPort,
      owners: []
    }
  }
  const control = controlPortListenerEvidence(session.controlPort, main.pid)
  const directControl = directControlPortEvidence(main.command)
  const wsOwners = listenerPids(session.wsPort).map(pid => ({
    automation_listener_pid: pid,
    main_devtools_pid: main.pid,
    owned: ancestorsFrom(pid).some(item => Number(item.pid) === Number(main.pid))
  }))
  const sessionLog = readCurrentSessionProjectEvidence({
    mainProcess: main,
    expectedProjectPath: session.projectPath,
    wsPort: session.wsPort,
    requireAutomatorPort: false
  })
  const projectProof =
    sessionLog.status === 'bootstrap_verified' &&
    sessionLog.evidence_records?.some(
      item =>
        item.type === 'FileUtils' &&
        normalizeRuntimePath(item.project_path) === normalizeRuntimePath(session.projectPath)
    )
  const wsOwner = wsOwners.filter(item => item.owned)
  const verified = control.verified && projectProof && wsOwner.length === 1
  return {
    status: verified ? 'verified' : 'unavailable',
    code: verified ? null : 'qa_owned_runtime_identity_unverified',
    expected_project_path: normalizeRuntimePath(session.projectPath),
    observed_project_path: projectProof ? normalizeRuntimePath(session.projectPath) : 'unavailable',
    project_identity_verified: projectProof,
    project_identity_source: projectProof ? 'test_owned_session_fileutils' : 'unavailable',
    main_devtools_pid: main.pid,
    process_start_identity: processStartIdentity(main.pid),
    identity_hash: session.identity_hash || null,
    auth_generation: Number(session.auth_generation || 0) || null,
    automation_listener_pid: wsOwner[0]?.automation_listener_pid ?? null,
    port_owner_pid: wsOwner[0]?.automation_listener_pid ?? null,
    automator_listener_pids: wsOwners.map(item => item.automation_listener_pid),
    automator_port: session.wsPort,
    control_port: session.controlPort,
    control_port_source: directControl.source,
    control_port_verified: control.verified,
    user_data_dir: session.profile,
    session_log_evidence: sessionLog,
    owners: wsOwners
  }
}

function appendChildOutput(child, filePath, label) {
  const stream = fs.createWriteStream(filePath, { flags: 'a' })
  const append = chunk => stream.write(`[${label}] ${String(chunk)}`)
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  child.once('close', () => stream.end())
}

export async function runDevToolsCli({ home, args, outputPath, timeoutMs = 30_000 }) {
  const child = spawn(QA_RUNTIME_DEVTOOLS_CLI, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      WECHAT_DEVTOOLS_SHARED_AUTH_ROOT: QA_SHARED_AUTH_ROOT,
      WECHAT_QA_LAUNCHER_ROLE: 'qa'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  child.stdin.end('y\n')
  appendChildOutput(child, outputPath, 'devtools-cli')
  return new Promise((resolve, reject) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      terminateProcessTree(child.pid, Math.min(timeoutMs, QA_RUNTIME_CLEANUP_TIMEOUT_MS)).then(
        remaining =>
          resolve({
            pid: child.pid,
            exitCode: null,
            signal: 'timeout',
            timedOut: true,
            remaining
          }),
        () =>
          resolve({
            pid: child.pid,
            exitCode: null,
            signal: 'timeout',
            timedOut: true,
            remaining: []
          })
      )
    }, timeoutMs)
    const finish = value => {
      clearTimeout(timer)
      resolve(value)
    }
    child.once('error', error => {
      if (timedOut) {
        return
      }
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      if (timedOut) {
        return
      }
      finish({
        pid: child.pid,
        exitCode: code,
        signal,
        timedOut: false,
        remaining: []
      })
    })
  })
}

export async function terminateProcessTree(rootPid, timeoutMs = QA_RUNTIME_CLEANUP_TIMEOUT_MS) {
  if (!rootPid || !processAlive(rootPid)) {
    return []
  }
  const descendants = descendantsOf(rootPid)
    .map(item => item.pid)
    .reverse()
  const pids = [...descendants, Number(rootPid)]
  const protectedPids = currentProcessLineage()
  if (pids.some(pid => protectedPids.has(Number(pid)))) {
    // A cleanup target that contains the runner itself or one of its parents
    // is never safe to terminate. This guard is intentionally below the
    // ownership checks so a stale/incorrect port PID cannot kill the test
    // runner and strand its profile lock.
    return []
  }
  for (const pid of pids) {
    sendSignal(pid, 'SIGTERM')
  }
  await waitFor(
    () => pids.every(pid => !processAlive(pid)),
    Math.floor(timeoutMs / 2),
    `process tree ${rootPid} termination`
  ).catch(() => {})
  for (const pid of pids) {
    if (processAlive(pid)) {
      sendSignal(pid, 'SIGKILL')
    }
  }
  await waitFor(
    () => pids.every(pid => !processAlive(pid)),
    Math.floor(timeoutMs / 2),
    `process tree ${rootPid} kill`
  ).catch(() => {})
  return pids.filter(processAlive)
}

export async function terminateProcessIds(pids = [], timeoutMs = QA_RUNTIME_CLEANUP_TIMEOUT_MS) {
  const unique = [...new Set(pids.map(pid => Number(pid)).filter(pid => pid > 0))]
  const remaining = new Set()
  for (const pid of unique) {
    const residue = await terminateProcessTree(pid, timeoutMs)
    residue.forEach(item => remaining.add(item))
  }
  return [...remaining].filter(processAlive)
}

export function cleanupEvidence(session) {
  const lease = runtimeLease(session.localRuntimeTargetPath || session.runtimeTargetPath)
  const borrowed = session.localRuntimeMode === 'borrowed'
  return {
    main_pid: mainForSession(session)?.pid ?? null,
    control_listener_pids: session.controlPort ? listenerPids(session.controlPort) : [],
    automator_listener_pids: session.wsPort ? listenerPids(session.wsPort) : [],
    local_runtime_owner_alive: processAlive(session.localRuntimePid),
    local_runtime_child_alive: processAlive(session.localRuntimeChildPid),
    local_runtime_mode: session.localRuntimeMode || 'owned',
    borrowed_local_runtime_owner_alive: borrowed
      ? processAlive(session.borrowedLocalRuntimePid)
      : false,
    borrowed_local_runtime_child_alive: borrowed
      ? processAlive(session.borrowedLocalRuntimeChildPid)
      : false,
    borrowed_local_runtime_preserved: borrowed,
    auto_cli_alive: processAlive(session.auto_cli_pid),
    session_profile_pids: sessionProfilePids(session),
    local_runtime_lease: lease.value,
    local_runtime_lease_path: lease.filePath
  }
}

function sessionProfilePids(session) {
  const roots = [session?.home, session?.profile, session?.devtools_user_data_dir]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .map(value => normalizeRuntimePath(value))
  if (roots.length === 0) {
    return []
  }
  return processTable()
    .filter(item => {
      const command = String(item.command || '')
      const match = command.match(
        /--user-data-dir(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(.*?)(?=\s+-{1,2}[\w-]|\s*$))/
      )
      const userDataDir = match ? (match[1] ?? match[2] ?? match[3]?.trim() ?? '') : ''
      const normalizedUserDataDir = userDataDir ? normalizeRuntimePath(userDataDir) : ''
      return roots.some(
        root =>
          normalizedUserDataDir === root ||
          normalizedUserDataDir.startsWith(`${root}${path.sep}`)
      )
    })
    .map(item => Number(item.pid))
    .filter(pid => pid > 0)
}

export function releaseStaleLocalRuntimeLease(session) {
  const lease = runtimeLease(session.localRuntimeTargetPath || session.runtimeTargetPath)
  if (
    lease.value &&
    !processAlive(lease.value.owner_pid) &&
    (!lease.value.child_pid || !processAlive(lease.value.child_pid))
  ) {
    try {
      fs.unlinkSync(lease.filePath)
    } catch {
      // Cleanup verification reports the lease if it remains.
    }
  }
}
