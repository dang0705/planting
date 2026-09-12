import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

export const LOCAL_RUNTIME_LEASE_VERSION = 1
export const DEFAULT_LAN_REFRESH_INTERVAL_MS = 5000
const DEFAULT_STOP_TIMEOUT_MS = 5000

export function normalizeLocalRuntimePath(value) {
  return path.resolve(String(value ?? '')).replaceAll('\\', '/')
}

export function localRuntimeLeasePath(targetPath, leaseRoot) {
  const identity = createHash('sha256').update(normalizeLocalRuntimePath(targetPath)).digest('hex')
  return path.join(leaseRoot, `${identity}.json`)
}

export function isMpWeixinWatchCommand(command = []) {
  const values = command.map(value => String(value))
  return (
    values.some(value => /(?:^|\/)uni(?:\.cmd)?$/.test(value) || value === 'uni') &&
    values.some(value => value === 'mp-weixin') &&
    !values.includes('build')
  )
}

export function getFirstLanAddress(networkInterfaces = os.networkInterfaces) {
  return (
    Object.values(networkInterfaces())
      .flat()
      .find(item => item && item.family === 'IPv4' && !item.internal)?.address || ''
  )
}

function defaultProcessAlive(pid) {
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

function readLease(filePath, fsModule = fs) {
  try {
    const raw = fsModule.readFileSync(filePath, 'utf8')
    const value = JSON.parse(raw)
    return { raw, value }
  } catch (error) {
    return { error }
  }
}

function validLease(lease, targetPath) {
  return (
    lease &&
    lease.version === LOCAL_RUNTIME_LEASE_VERSION &&
    normalizeLocalRuntimePath(lease.target_path) === normalizeLocalRuntimePath(targetPath) &&
    Number.isInteger(Number(lease.owner_pid)) &&
    Number(lease.owner_pid) > 0 &&
    typeof lease.owner_id === 'string' &&
    lease.owner_id.length > 0
  )
}

function writeLease(filePath, lease, { fsModule = fs, exclusive = false } = {}) {
  fsModule.mkdirSync(path.dirname(filePath), { recursive: true })
  fsModule.writeFileSync(filePath, `${JSON.stringify(lease, null, 2)}\n`, {
    encoding: 'utf8',
    flag: exclusive ? 'wx' : 'w'
  })
}

export function acquireLocalRuntimeLease({
  targetPath,
  leaseRoot,
  ownerPid = process.pid,
  ownerId = randomUUID(),
  nowMs = Date.now,
  fsModule = fs,
  isProcessAlive = defaultProcessAlive
} = {}) {
  const target = normalizeLocalRuntimePath(targetPath)
  const filePath = localRuntimeLeasePath(target, leaseRoot)
  const lease = {
    version: LOCAL_RUNTIME_LEASE_VERSION,
    target_path: target,
    owner_pid: Number(ownerPid),
    owner_id: ownerId,
    created_at: new Date(nowMs()).toISOString(),
    updated_at: new Date(nowMs()).toISOString(),
    child_pid: null,
    api_base_url: ''
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      writeLease(filePath, lease, { fsModule, exclusive: true })
      return { status: 'acquired', file_path: filePath, lease }
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        return {
          status: 'blocked',
          code: 'local_runtime_lease_write_failed',
          file_path: filePath,
          error
        }
      }
    }
    const existing = readLease(filePath, fsModule)
    if (!validLease(existing.value, target)) {
      return {
        status: 'blocked',
        code: 'local_runtime_lease_identity_unverified',
        file_path: filePath,
        reason: 'existing_lease_invalid_or_target_mismatch'
      }
    }
    if (isProcessAlive(existing.value.owner_pid)) {
      return {
        status: 'reused',
        file_path: filePath,
        lease: existing.value,
        reason: 'verified_same_target_owner_alive'
      }
    }
    try {
      if (fsModule.readFileSync(filePath, 'utf8') !== existing.raw) {
        continue
      }
      fsModule.unlinkSync(filePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        return {
          status: 'blocked',
          code: 'local_runtime_stale_lease_cleanup_failed',
          file_path: filePath,
          error
        }
      }
    }
  }
  return { status: 'blocked', code: 'local_runtime_lease_contention', file_path: filePath }
}

export function updateLocalRuntimeLease({
  filePath,
  lease,
  patch = {},
  fsModule = fs,
  nowMs = Date.now
} = {}) {
  const current = readLease(filePath, fsModule)
  if (
    !validLease(current.value, lease?.target_path) ||
    current.value.owner_id !== lease?.owner_id ||
    Number(current.value.owner_pid) !== Number(lease?.owner_pid)
  ) {
    return { status: 'blocked', code: 'local_runtime_lease_owner_unverified', file_path: filePath }
  }
  const next = { ...current.value, ...patch, updated_at: new Date(nowMs()).toISOString() }
  writeLease(filePath, next, { fsModule })
  return { status: 'updated', lease: next }
}

export function releaseLocalRuntimeLease({ filePath, lease, fsModule = fs } = {}) {
  const current = readLease(filePath, fsModule)
  if (
    !validLease(current.value, lease?.target_path) ||
    current.value.owner_id !== lease?.owner_id ||
    Number(current.value.owner_pid) !== Number(lease?.owner_pid)
  ) {
    return { status: 'blocked', code: 'local_runtime_lease_owner_unverified', file_path: filePath }
  }
  try {
    fsModule.unlinkSync(filePath)
    return { status: 'released', file_path: filePath }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { status: 'released', file_path: filePath }
    }
    return {
      status: 'blocked',
      code: 'local_runtime_lease_release_failed',
      file_path: filePath,
      error
    }
  }
}

function waitForChildExit(child, timeoutMs, setTimer = setTimeout, clearTimer = clearTimeout) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null || child.signalCode) {
      resolve({ code: child?.exitCode ?? null, signal: child?.signalCode ?? null })
      return
    }
    const timer = setTimer(() => resolve({ code: null, signal: 'timeout' }), timeoutMs)
    child.once('exit', (code, signal) => {
      clearTimer(timer)
      resolve({ code, signal })
    })
  })
}

export function createManagedLocalRuntimeSession({
  targetPath,
  leaseRoot,
  command,
  environment = {},
  mode = 'loopback',
  reuseOutput = false,
  cleanOutput = false,
  initialApiBaseUrl,
  resolveLanApiBaseUrl,
  ownerPid = process.pid,
  ownerId = randomUUID(),
  fsModule = fs,
  spawnProcess = spawn,
  isProcessAlive = defaultProcessAlive,
  nowMs = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  refreshIntervalMs = DEFAULT_LAN_REFRESH_INTERVAL_MS,
  stopTimeoutMs = DEFAULT_STOP_TIMEOUT_MS,
  onEvent = () => {}
} = {}) {
  let ownership = null
  let child = null
  let apiBaseUrl = initialApiBaseUrl
  let interval = null
  let restarting = false
  let stopped = false
  let finalExit = null
  let outputPrepared = false
  let finalExitResolve
  const finalExitPromise = new Promise(resolve => {
    finalExitResolve = resolve
  })

  const release = () => {
    if (ownership?.status !== 'acquired') {
      return { status: 'not_owner' }
    }
    return releaseLocalRuntimeLease({
      filePath: ownership.file_path,
      lease: ownership.lease,
      fsModule
    })
  }

  const complete = result => {
    if (finalExit) {
      return
    }
    finalExit = result
    finalExitResolve(result)
  }

  const launch = nextApiBaseUrl => {
    if (stopped || ownership?.status !== 'acquired') {
      return null
    }
    apiBaseUrl = nextApiBaseUrl
    const nextChild = spawnProcess(command[0], command.slice(1), {
      env: { ...environment, VITE_API_BASE_URL: nextApiBaseUrl },
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    child = nextChild
    const updated = updateLocalRuntimeLease({
      filePath: ownership.file_path,
      lease: ownership.lease,
      patch: { child_pid: Number(nextChild.pid) || null, api_base_url: nextApiBaseUrl },
      fsModule,
      nowMs
    })
    if (updated.status === 'updated') {
      ownership = { ...ownership, lease: updated.lease }
    }
    nextChild.once('exit', (code, signal) => {
      if (child !== nextChild || restarting) {
        return
      }
      complete({ code, signal, api_base_url: apiBaseUrl })
    })
    nextChild.once('error', error => {
      if (child !== nextChild || restarting) {
        return
      }
      complete({ code: 1, signal: null, error: error.message, api_base_url: apiBaseUrl })
    })
    onEvent({
      type: 'build_started',
      api_base_url: nextApiBaseUrl,
      child_pid: Number(nextChild.pid) || null
    })
    return nextChild
  }

  const stopOwnedChild = async () => {
    const currentChild = child
    if (!currentChild || currentChild.exitCode !== null || currentChild.signalCode) {
      return
    }
    currentChild.kill('SIGINT')
    const firstExit = await waitForChildExit(currentChild, stopTimeoutMs, setTimer, clearTimer)
    if (firstExit.signal !== 'timeout') {
      return
    }
    currentChild.kill('SIGTERM')
    const secondExit = await waitForChildExit(currentChild, stopTimeoutMs, setTimer, clearTimer)
    if (secondExit.signal !== 'timeout') {
      return
    }
    currentChild.kill('SIGKILL')
  }

  const refresh = async () => {
    if (
      stopped ||
      restarting ||
      mode !== 'lan' ||
      typeof resolveLanApiBaseUrl !== 'function' ||
      !child
    ) {
      return { status: 'not_needed' }
    }
    const nextApiBaseUrl = resolveLanApiBaseUrl()
    if (!nextApiBaseUrl || nextApiBaseUrl === apiBaseUrl) {
      return { status: 'unchanged' }
    }
    restarting = true
    onEvent({
      type: 'lan_address_changed',
      previous_api_base_url: apiBaseUrl,
      api_base_url: nextApiBaseUrl
    })
    await stopOwnedChild()
    if (!stopped) {
      launch(nextApiBaseUrl)
    }
    restarting = false
    return { status: 'restarted', api_base_url: nextApiBaseUrl }
  }

  return {
    claim() {
      // A reused lease is only an observation of another live owner. Do not
      // cache that observation forever: once the owner exits and releases (or
      // becomes stale), a waiting caller must be able to claim the target and
      // become the new runtime owner.
      if (!ownership || ownership.status === 'reused') {
        ownership = acquireLocalRuntimeLease({
          targetPath,
          leaseRoot,
          ownerPid,
          ownerId,
          fsModule,
          nowMs,
          isProcessAlive
        })
      }
      return ownership
    },
    start() {
      const claim = this.claim()
      if (claim.status !== 'acquired') {
        return claim
      }
      if (cleanOutput && !reuseOutput && !outputPrepared) {
        fsModule.rmSync(targetPath, { recursive: true, force: true })
        outputPrepared = true
        onEvent({ type: 'build_output_cleaned', target_path: targetPath })
      }
      const startedChild = reuseOutput ? null : launch(apiBaseUrl)
      if (reuseOutput) {
        const updated = updateLocalRuntimeLease({
          filePath: ownership.file_path,
          lease: ownership.lease,
          patch: { api_base_url: apiBaseUrl, child_pid: null },
          fsModule,
          nowMs
        })
        if (updated.status === 'updated') {
          ownership = { ...ownership, lease: updated.lease }
        }
        onEvent({ type: 'build_reused', api_base_url: apiBaseUrl, target_path: targetPath })
      }
      if (!reuseOutput && mode === 'lan' && typeof resolveLanApiBaseUrl === 'function') {
        interval = setIntervalFn(() => {
          refresh().catch(error => {
            onEvent({ type: 'lan_address_refresh_failed', error: error?.message ?? String(error) })
          })
        }, refreshIntervalMs)
      }
      return {
        status: 'started',
        child: startedChild,
        api_base_url: apiBaseUrl,
        lease: ownership.lease
      }
    },
    refresh,
    async stop() {
      stopped = true
      if (interval) {
        clearIntervalFn(interval)
      }
      interval = null
      await stopOwnedChild()
      const released = release()
      complete({ code: child?.exitCode ?? 0, signal: child?.signalCode ?? null, stopped: true })
      return released
    },
    waitForExit() {
      return finalExitPromise
    },
    release,
    get state() {
      return {
        ownership,
        api_base_url: apiBaseUrl,
        child_pid: Number(child?.pid) || null,
        stopped,
        finalExit
      }
    }
  }
}
