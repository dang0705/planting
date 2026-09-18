import { spawn } from 'node:child_process'

const DEFAULT_MAX_OUTPUT_CHARS = 32 * 1024 * 1024

function appendTail(current, chunk, maxOutputChars) {
  const value = `${current}${String(chunk || '')}`
  return value.length > maxOutputChars ? value.slice(-maxOutputChars) : value
}

/**
 * Run one QA Node command without blocking the parent event loop. macOS can
 * leave Node's synchronous process runner inside kevent while DevTools is
 * active; an async child keeps the supervisor responsive and gives timeout
 * cleanup a concrete, exact child handle.
 */
export function runQaNodeCommand({
  command,
  args = [],
  cwd,
  env,
  timeoutMs,
  maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS,
  abortSignal = null
} = {}) {
  return new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let forceKillTimer = null
    let timeoutTimer = null
    let spawnError = null
    let aborted = false
    let abortListener = null

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const finish = (status, signal) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutTimer)
      clearTimeout(forceKillTimer)
      if (abortSignal && abortListener) {
        abortSignal.removeEventListener('abort', abortListener)
      }
      resolve({
        status,
        signal,
        timedOut,
        aborted,
        spawnError: spawnError?.code || spawnError?.message || null,
        stdout,
        stderr
      })
    }

    child.stdout?.on('data', chunk => {
      stdout = appendTail(stdout, chunk, maxOutputChars)
    })
    child.stderr?.on('data', chunk => {
      stderr = appendTail(stderr, chunk, maxOutputChars)
    })
    child.once('error', error => {
      spawnError = error
      finish(null, null)
    })
    child.once('close', (status, signal) => finish(status, signal))

    abortListener = () => {
      if (settled) {
        return
      }
      aborted = true
      child.kill('SIGTERM')
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL')
        }
      }, 1000)
    }
    if (abortSignal) {
      if (abortSignal.aborted) {
        abortListener()
      } else {
        abortSignal.addEventListener('abort', abortListener, { once: true })
      }
    }

    timeoutTimer = setTimeout(
      () => {
        if (settled) {
          return
        }
        timedOut = true
        child.kill('SIGTERM')
        forceKillTimer = setTimeout(() => {
          if (!settled) {
            child.kill('SIGKILL')
          }
        }, 1000)
      },
      Math.max(1, Number(timeoutMs) || 1)
    )
  })
}
