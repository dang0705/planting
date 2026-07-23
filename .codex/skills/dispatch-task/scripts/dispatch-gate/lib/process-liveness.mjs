import fs from 'node:fs'

export function isProcessAlive(pid) {
  const numericPid = Number(pid)
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false
  }
  try {
    process.kill(numericPid, 0)
    return true
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

export function canReclaimStaleLock({ lockPath, staleMs, nowMs = Date.now() }) {
  try {
    const stat = fs.statSync(lockPath)
    if (nowMs - stat.mtimeMs <= staleMs) {
      return false
    }
    return !isProcessAlive(readLockOwner(lockPath)?.pid)
  } catch {
    return false
  }
}
