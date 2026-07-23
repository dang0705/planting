import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { canReclaimStaleLock } from './process-liveness.mjs'
import { repoRoot } from './state.mjs'

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withAutomatorPortLock(
  fn,
  {
    lockPath = path.join(repoRoot, '.tmp', 'dispatch-task', 'automator-9420.lock'),
    timeoutMs = 5000,
    staleMs = 30 * 60 * 1000
  } = {}
) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  const deadline = Date.now() + timeoutMs
  let fd
  while (!fd) {
    try {
      fd = fs.openSync(lockPath, 'wx')
      fs.writeFileSync(
        fd,
        JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })
      )
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error
      }
      if (canReclaimStaleLock({ lockPath, staleMs })) {
        fs.unlinkSync(lockPath)
        continue
      }
      if (Date.now() >= deadline) {
        throw new Error('automator 9420 lock timeout')
      }
      await wait(50)
    }
  }
  try {
    return await fn()
  } finally {
    fs.closeSync(fd)
    try {
      fs.unlinkSync(lockPath)
    } catch {
      // The owner may have been removed only after its PID was no longer live.
    }
  }
}

function boundedTimeout(value) {
  const timeout = Number(value)
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 15 * 60 * 1000) {
    return DEFAULT_TIMEOUT_MS
  }
  return timeout
}

function streamText(stream, onChunk) {
  let text = ''
  stream?.on?.('data', chunk => {
    const value = String(chunk)
    text += value
    onChunk?.(value)
  })
  return () => text
}

export function runLeafWithWatchdog({
  script,
  args = [],
  cwd = repoRoot,
  env = process.env,
  timeoutMs,
  onStarted,
  onTerminal,
  onStdout,
  onStderr,
  spawnChild = spawn,
  signalSource = process,
  terminateGraceMs = 2000
} = {}) {
  const executionTimeoutMs = boundedTimeout(timeoutMs)
  return new Promise(resolve => {
    let settled = false
    let terminal = null
    let child
    let timeout = null
    let killDeadline
    const onSigint = () => stopForSignal('SIGINT')
    const onSigterm = () => stopForSignal('SIGTERM')
    const cleanup = () => {
      clearTimeout(timeout)
      clearTimeout(killDeadline)
      signalSource.removeListener?.('SIGINT', onSigint)
      signalSource.removeListener?.('SIGTERM', onSigterm)
    }
    const finish = result => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(result)
    }
    const terminalize = result => {
      if (terminal) {
        return terminal
      }
      terminal = {
        ...result,
        leaf_pid: child?.pid ?? 'unavailable',
        execution_timeout_ms: executionTimeoutMs
      }
      onTerminal?.(terminal)
      return terminal
    }
    const terminateChild = reason => {
      try {
        child?.kill?.('SIGTERM')
      } catch {
        // Terminal state is already persisted; forced cleanup is best-effort.
      }
      killDeadline = setTimeout(() => {
        try {
          child?.kill?.('SIGKILL')
        } catch {
          // Child may have exited after SIGTERM.
        }
        finish(terminalize({ status: 'aborted', terminal_reason: reason }))
      }, terminateGraceMs)
    }
    const stopForSignal = signal => {
      terminalize({ status: 'aborted', terminal_reason: `parent_${signal.toLowerCase()}` })
      terminateChild(`parent_${signal.toLowerCase()}`)
    }
    try {
      child = spawnChild(process.execPath, [script, ...args], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      return finish(terminalize({ status: 'failed_script', terminal_reason: error.message }))
    }
    onStarted?.({ leaf_pid: child?.pid ?? 'unavailable', execution_timeout_ms: executionTimeoutMs })
    const stdout = streamText(child.stdout, onStdout)
    const stderr = streamText(child.stderr, onStderr)
    child.once?.('error', error =>
      finish(
        terminalize({
          status: 'failed_script',
          terminal_reason: error.message,
          stdout: stdout(),
          stderr: stderr()
        })
      )
    )
    child.once?.('close', (exitCode, signal) => {
      if (terminal) {
        return finish({
          ...terminal,
          exit_code: exitCode,
          signal,
          stdout: stdout(),
          stderr: stderr()
        })
      }
      finish({
        status: 'completed',
        exit_code: exitCode,
        signal,
        stdout: stdout(),
        stderr: stderr(),
        leaf_pid: child?.pid ?? 'unavailable',
        execution_timeout_ms: executionTimeoutMs
      })
    })
    signalSource.once?.('SIGINT', onSigint)
    signalSource.once?.('SIGTERM', onSigterm)
    timeout = setTimeout(() => {
      terminalize({ status: 'aborted', terminal_reason: 'watchdog_timeout' })
      terminateChild('watchdog_timeout')
    }, executionTimeoutMs)
  })
}
