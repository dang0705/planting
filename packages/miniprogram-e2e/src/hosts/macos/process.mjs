import { spawn } from 'node:child_process'

/**
 * Start a host process without assuming an application path, a profile path,
 * fixed ports, or a project. Those values are injected by the platform or
 * project adapter.
 */
export function startManagedProcess({ command, args = [], cwd, env, name = 'process' }) {
  if (!command) {throw new TypeError('command is required')}
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
  child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
  return Object.freeze({
    pid: child.pid || null,
    async stop({ signal = 'SIGTERM', timeoutMs = 5_000 } = {}) {
      if (child.exitCode !== null || child.signalCode) {
        return { status: 'already_stopped', code: child.exitCode, signal: child.signalCode, stdout, stderr }
      }
      child.kill(signal)
      const result = await waitForExit(child, timeoutMs)
      return { status: 'stopped', name, ...result, stdout, stderr }
    },
    output() { return { stdout, stderr } }
  })
}

function append(value, chunk) {
  return `${value}${String(chunk)}`.slice(0, 256 * 1024)
}

function waitForExit(child, timeoutMs) {
  return new Promise(resolve => {
    let settled = false
    const finish = result => {
      if (settled) {return}
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    child.once('close', (code, signal) => finish({ code, signal, timedOut: false }))
    const timer = setTimeout(() => finish({ code: child.exitCode, signal: child.signalCode, timedOut: true }), timeoutMs)
  })
}
