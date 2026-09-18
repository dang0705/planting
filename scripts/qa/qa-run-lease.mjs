import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const SAFE_ID = /^[A-Za-z0-9._-]{8,160}$/u
export const QA_RUN_LEASE_ROOT = path.join(
  os.homedir(),
  '.planting',
  'automator-qa',
  'v3',
  'supervisor',
  'runs'
)

function processStartIdentity(pid) {
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

function processAlive(pid, expectedStartIdentity = null) {
  const numericPid = Number(pid)
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false
  }
  try {
    process.kill(numericPid, 0)
  } catch (error) {
    return error?.code === 'EPERM'
  }
  const state = spawnSync('ps', ['-p', String(numericPid), '-o', 'state='], {
    encoding: 'utf8'
  }).stdout
  if (/^\s*Z/u.test(String(state || ''))) {
    return false
  }
  return !expectedStartIdentity || processStartIdentity(numericPid) === expectedStartIdentity
}

function leasePath(dispatchRunId) {
  if (!SAFE_ID.test(String(dispatchRunId || ''))) {
    const error = new Error('dispatch-run-id 格式无效')
    error.code = 'qa_run_lease_dispatch_id_invalid'
    throw error
  }
  return path.join(QA_RUN_LEASE_ROOT, `${dispatchRunId}.json`)
}

export function readQaRunLease(dispatchRunId) {
  try {
    return JSON.parse(fs.readFileSync(leasePath(dispatchRunId), 'utf8'))
  } catch {
    return null
  }
}

function writeExclusive(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const descriptor = fs.openSync(filePath, 'wx', 0o600)
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`)
  } finally {
    fs.closeSync(descriptor)
  }
}

export function acquireQaRunLease({ dispatchRunId, kind = 'automator', runInstanceId } = {}) {
  const filePath = leasePath(dispatchRunId)
  const existing = readQaRunLease(dispatchRunId)
  if (existing && processAlive(existing.owner_pid, existing.owner_start_identity)) {
    const error = new Error('该 dispatch run 已被另一个执行器占用')
    error.code = 'qa_run_lease_conflict'
    error.details = { lease_path: filePath, existing }
    throw error
  }
  if (existing) {
    fs.rmSync(filePath, { force: true })
  }
  const lease = {
    schema_version: 1,
    dispatch_run_id: dispatchRunId,
    run_instance_id: runInstanceId || crypto.randomUUID(),
    kind,
    token: crypto.randomUUID(),
    owner_pid: process.pid,
    owner_start_identity: processStartIdentity(process.pid),
    acquired_at: new Date().toISOString()
  }
  if (!SAFE_ID.test(lease.run_instance_id)) {
    const error = new Error('run-instance-id 格式无效')
    error.code = 'qa_run_lease_run_instance_id_invalid'
    throw error
  }
  try {
    writeExclusive(filePath, lease)
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const race = readQaRunLease(dispatchRunId)
      const conflict = new Error('该 dispatch run 在获取租约时被另一个执行器占用')
      conflict.code = 'qa_run_lease_conflict'
      conflict.details = { lease_path: filePath, existing: race }
      throw conflict
    }
    throw error
  }
  return {
    ...lease,
    lease_path: filePath,
    release() {
      const current = readQaRunLease(dispatchRunId)
      if (
        current?.token === lease.token &&
        Number(current.owner_pid) === process.pid &&
        current.owner_start_identity === lease.owner_start_identity
      ) {
        fs.rmSync(filePath, { force: true })
        return true
      }
      return false
    }
  }
}

export function assertQaRunLease({ dispatchRunId, token, runInstanceId } = {}) {
  const current = readQaRunLease(dispatchRunId)
  if (!current) {
    const error = new Error('dispatch run 租约不存在')
    error.code = 'qa_run_lease_missing'
    throw error
  }
  if (current.token !== token) {
    const error = new Error('dispatch run 租约令牌不匹配')
    error.code = 'qa_run_lease_token_mismatch'
    throw error
  }
  if (runInstanceId && current.run_instance_id !== runInstanceId) {
    const error = new Error('执行实例不属于当前 dispatch run lease')
    error.code = 'qa_run_lease_run_instance_id_mismatch'
    error.details = { expected: runInstanceId, observed: current.run_instance_id || null }
    throw error
  }
  if (!processAlive(current.owner_pid, current.owner_start_identity)) {
    const error = new Error('dispatch run 租约持有者已退出')
    error.code = 'qa_run_lease_owner_dead'
    throw error
  }
  return current
}

/**
 * Resolve a lease for a standalone runner or a shared v3 suite.  A supplied
 * lease is only observed; only the process that acquired it may release it.
 */
export function resolveQaRunLease({
  dispatchRunId,
  kind = 'automator',
  runInstanceId,
  runLeaseToken,
  runLease
} = {}) {
  if (runLease) {
    if (!dispatchRunId || runLease.dispatch_run_id !== dispatchRunId) {
      const error = new Error('提供的 run lease 不属于当前 dispatch run')
      error.code = 'qa_run_lease_dispatch_id_mismatch'
      error.details = {
        expected: dispatchRunId || null,
        observed: runLease.dispatch_run_id || null
      }
      throw error
    }
    const current = assertQaRunLease({
      dispatchRunId,
      runInstanceId: runLease.run_instance_id,
      token: runLease.token
    })
    return { ...current, release: () => false, owned: false }
  }
  if (runInstanceId || runLeaseToken) {
    if (!dispatchRunId || !runInstanceId || !runLeaseToken) {
      const error = new Error('dispatch-run-id、run-instance-id 和 run-lease-token 必须同时提供')
      error.code = 'qa_run_lease_arguments_incomplete'
      throw error
    }
    const current = assertQaRunLease({
      dispatchRunId,
      runInstanceId,
      token: runLeaseToken
    })
    return { ...current, release: () => false, owned: false }
  }
  const acquired = acquireQaRunLease({ dispatchRunId, kind })
  return { ...acquired, owned: true }
}

export function qaRunLeaseArgs(lease) {
  return [
    `--dispatch-run-id=${lease.dispatch_run_id}`,
    `--run-instance-id=${lease.run_instance_id}`,
    `--run-lease-token=${lease.token}`
  ]
}
