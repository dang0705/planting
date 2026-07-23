import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { canReclaimStaleLock } from './process-liveness.mjs'

export const repoRoot = path.resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)))
export const dispatchRoot = path.join(repoRoot, '.tmp', 'dispatch-task')

export function normalizePath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
}

export function stateDir(dispatchRunId) {
  return path.join(dispatchRoot, dispatchRunId)
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
  fs.renameSync(tmp, file)
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function withRunLock(dispatchRunId, fn, { timeoutMs = 5000, staleMs = 30000 } = {}) {
  const dir = stateDir(dispatchRunId)
  fs.mkdirSync(dir, { recursive: true })
  const lockPath = path.join(dir, 'gate.lock')
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx')
      try {
        fs.writeFileSync(
          fd,
          JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })
        )
        return fn()
      } finally {
        fs.closeSync(fd)
        try {
          fs.unlinkSync(lockPath)
        } catch {
          // Lock cleanup is best-effort; stale locks are reclaimed below.
        }
      }
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error
      }
      try {
        if (canReclaimStaleLock({ lockPath, staleMs })) {
          fs.unlinkSync(lockPath)
        }
      } catch {
        // Another process may have released the lock between retries.
      }
      if (Date.now() >= deadline) {
        throw new Error(`dispatch gate lock timeout: ${lockPath}`)
      }
      sleepSync(50)
    }
  }
}

export function appendEvent(dispatchRunId, event) {
  return withRunLock(dispatchRunId, () => {
    const file = path.join(stateDir(dispatchRunId), 'events.jsonl')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(
      file,
      `${JSON.stringify({ ...event, recorded_at: new Date().toISOString() })}\n`
    )
    return file
  })
}

export function readEvents(dispatchRunId) {
  const file = path.join(stateDir(dispatchRunId), 'events.jsonl')
  if (!fs.existsSync(file)) {
    return []
  }
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

export function readRunState(dispatchRunId) {
  return readJson(path.join(stateDir(dispatchRunId), 'state.json'), {})
}

export function updateRunState(dispatchRunId, updater) {
  return withRunLock(dispatchRunId, () => {
    const file = path.join(stateDir(dispatchRunId), 'state.json')
    const current = readJson(file, {})
    const next = updater(current) ?? current
    writeJsonAtomic(file, next)
    return next
  })
}

export function findHandoff(dispatchRunId) {
  const exact = path.join(dispatchRoot, `${dispatchRunId}-handoff.json`)
  if (fs.existsSync(exact)) {
    return exact
  }
  return null
}

export function inferDispatchRunId(payload = {}) {
  const direct =
    payload.dispatch_run_id ||
    payload.dispatchRunId ||
    payload?.handoff?.dispatch_run_id ||
    process.env.DISPATCH_RUN_ID
  if (direct) {
    return String(direct)
  }
  return ''
}
