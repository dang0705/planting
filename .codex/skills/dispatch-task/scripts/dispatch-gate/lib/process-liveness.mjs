import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

export function isProcessAlive(pid) {
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

export function readLockOwner(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'))
  } catch {
    return null
  }
}

export function canReclaimStaleLock({ lockPath }) {
  try {
    const ownerAlive = isProcessAlive(readLockOwner(lockPath)?.pid)
    if (!ownerAlive) {
      return true
    }
    // Age alone never proves ownership has ended. A live QA process may hold a
    // lock across a long build or renderer recovery window; reclaiming it based
    // only on mtime would permit a second runner to touch its DevTools session.
    return false
  } catch {
    return false
  }
}
