#!/usr/bin/env node
// An isolated worker owns the screenshot RPC so a wedged DevTools capture cannot poison the
// primary Automator connection that drives page assertions. Its parent launcher is exported
// for diagnosis leaves and can SIGKILL this disposable process at a separate hard deadline.

import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  screenshotStabilityBudget,
  waitForScreenshotStability
} from '../../_shared/screenshot-stability.mjs'
import { connectAutomatorTransport } from '../../_shared/formal-leaf-harness.mjs'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const WORKER_PATH = fileURLToPath(import.meta.url)
const DEFAULT_WORKER_TIMEOUT_MS = 15000
const DEFAULT_PARENT_TIMEOUT_MS = 20000
const DISCONNECT_TIMEOUT_MS = 2000

async function loadAutomator() {
  try {
    const loaded = await import('miniprogram-automator')
    return loaded.default || loaded['module.exports'] || loaded
  } catch {
    return null
  }
}

export function isNonEmptyPng(filePath) {
  try {
    if (!existsSync(filePath) || statSync(filePath).size <= 8) {
      return false
    }
    const fd = openSync(filePath, 'r')
    try {
      const buffer = Buffer.alloc(8)
      readSync(fd, buffer, 0, 8, 0)
      return buffer.equals(PNG_MAGIC)
    } finally {
      closeSync(fd)
    }
  } catch {
    return false
  }
}

function emit(result) {
  process.stdout.write(JSON.stringify(result) + '\n')
}

function now() {
  return new Date().toISOString()
}

function emitStage(phase, detail = {}) {
  emit({
    type: 'screenshot_worker_event',
    phase,
    at: now(),
    ...detail
  })
}

function parseWorkerResult(stdout) {
  try {
    const lines = stdout.trim().split('\n').filter(Boolean)
    return JSON.parse(lines.at(-1))
  } catch {
    return null
  }
}

function failedWorkerResult(result, stderr, exitCode) {
  const timeout = result?.status === 'timeout'
  return {
    status: timeout ? 'timeout' : 'failed',
    validPng: false,
    detail: String(
      result?.error || stderr.trim() || `worker exited with code ${exitCode ?? 'unknown'}`
    )
  }
}

// The parent deadline is intentionally independent from the worker's own timeout. A process
// wedged below JS cannot clear its timer, so the parent always has authority to terminate it.
export function runIsolatedScreenshotWorker({
  wsEndpoint,
  outputPath,
  workerTimeoutMs = DEFAULT_WORKER_TIMEOUT_MS,
  parentTimeoutMs = DEFAULT_PARENT_TIMEOUT_MS,
  workerPath = WORKER_PATH,
  spawnProcess = spawn
} = {}) {
  return new Promise(resolve => {
    const startedAt = Date.now()
    let stdout = ''
    let stderr = ''
    let settled = false
    let killTimer = null
    const finish = result => {
      if (settled) {
        return
      }
      settled = true
      if (killTimer) {
        clearTimeout(killTimer)
      }
      resolve({ ...result, elapsedMs: Date.now() - startedAt })
    }
    let child
    try {
      child = spawnProcess(
        process.execPath,
        [workerPath, wsEndpoint, outputPath, String(workerTimeoutMs)],
        {
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
    } catch (error) {
      finish({ status: 'failed', validPng: false, detail: String(error?.message || error) })
      return
    }
    killTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // The disposable child may already be gone.
      }
      finish({
        status: 'timeout',
        validPng: false,
        detail: `parent screenshot deadline after ${parentTimeoutMs}ms; isolated worker killed`
      })
    }, parentTimeoutMs)
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', error =>
      finish({ status: 'failed', validPng: false, detail: String(error?.message || error) })
    )
    child.on('close', exitCode => {
      const result = parseWorkerResult(stdout)
      if (result?.status === 'passed' && result.path === outputPath && isNonEmptyPng(outputPath)) {
        finish({
          status: 'passed',
          validPng: true,
          path: outputPath,
          bytes: statSync(outputPath).size
        })
        return
      }
      finish(failedWorkerResult(result, stderr, exitCode))
    })
  })
}

async function disconnectOwnedSession(miniProgram, timeoutMs = DISCONNECT_TIMEOUT_MS) {
  if (!miniProgram?.disconnect) {
    return { status: 'not_needed' }
  }
  let timer
  try {
    const result = await Promise.race([
      Promise.resolve()
        .then(() => miniProgram.disconnect())
        .then(() => ({ status: 'passed' })),
      new Promise(resolve => {
        timer = setTimeout(() => resolve({ status: 'timed_out', timeoutMs }), timeoutMs)
      })
    ])
    return result
  } catch (error) {
    return { status: 'failed', detail: String(error?.message || error) }
  } finally {
    clearTimeout(timer)
  }
}

async function captureScreenshot(wsEndpoint, outputPath, timeoutMs, projectPath, expectedRoute) {
  const automator = await loadAutomator()
  if (!automator) {
    return { status: 'failed', error: 'miniprogram-automator not available' }
  }
  let miniProgram = null
  let settled = false
  let result = null
  let phase = 'starting'
  let stability = null
  let commandStartedAt = null
  emitStage('worker_started', { wsEndpoint, outputPath })
  const workerDeadline = setTimeout(() => {
    if (settled) {
      return
    }
    settled = true
    try {
      miniProgram?.disconnect?.()
    } catch {
      // The parent will still kill a wedged process at its own deadline.
    }
    emit({
      status: 'timeout',
      phase,
      error: `worker internal timeout during ${phase} after ${timeoutMs}ms`,
      stability,
      command: {
        method: 'App.captureScreenshot',
        started_at: commandStartedAt,
        response: commandStartedAt ? 'not_received' : 'not_started'
      }
    })
    process.exit(0)
  }, timeoutMs)
  try {
    phase = 'connect'
    emitStage('connect_started')
    // Screenshots use the same transport-only connection as the primary leaf.
    // Calling automator.connect directly makes this disposable worker depend on
    // the SDK's optional Tool.getInfo().SDKVersion field; recent DevTools can
    // omit it for isolated projects and the SDK then fails before the capture.
    miniProgram = await connectAutomatorTransport(automator, wsEndpoint)
    emitStage('automator_connected')
    phase = 'stability'
    emitStage('stability_started')
    stability = await waitForScreenshotStability({
      miniProgram,
      projectPath,
      expectedRoute,
      timeoutMs: screenshotStabilityBudget(timeoutMs)
    })
    emitStage('stability_passed', { stability })
    phase = 'screenshot'
    commandStartedAt = now()
    emitStage('command_started', {
      command: 'App.captureScreenshot',
      command_started_at: commandStartedAt
    })
    await miniProgram.screenshot({ path: outputPath })
    phase = 'png_validation'
    if (!isNonEmptyPng(outputPath)) {
      settled = true
      result = {
        status: 'failed',
        error: 'screenshot_file_missing_empty_or_not_png',
        phase,
        stability,
        command: {
          method: 'App.captureScreenshot',
          started_at: commandStartedAt,
          response: 'received'
        }
      }
    } else {
      settled = true
      result = {
        status: 'passed',
        path: outputPath,
        bytes: statSync(outputPath).size,
        phase: 'completed',
        stability,
        command: {
          method: 'App.captureScreenshot',
          started_at: commandStartedAt,
          response: 'received',
          responded_at: now()
        }
      }
    }
  } catch (error) {
    settled = true
    result = {
      status: 'failed',
      error: String(error?.message || error),
      code: error?.code || null,
      phase,
      stability: error?.stability || stability,
      command: {
        method: 'App.captureScreenshot',
        started_at: commandStartedAt,
        response: commandStartedAt ? 'failed' : 'not_started'
      }
    }
  } finally {
    clearTimeout(workerDeadline)
    // A normal close is awaited so the next connection cannot race it. The
    // cleanup itself is bounded because a renderer can wedge after a successful
    // screenshot; cleanup must never hide valid evidence behind the parent
    // screenshot deadline.
    const cleanup = await disconnectOwnedSession(miniProgram)
    result = { ...(result || { status: 'failed', error: 'screenshot_worker_no_result' }), cleanup }
  }
  return result
}

async function main() {
  const [, , wsEndpoint, outputPath, timeoutArg, projectPath, expectedRoute] = process.argv
  if (!wsEndpoint || !outputPath) {
    emit({
      status: 'failed',
      error: 'usage: screenshot-worker.mjs <wsEndpoint> <outputPath> [timeoutMs]'
    })
    return
  }
  const result = await captureScreenshot(
    wsEndpoint,
    outputPath,
    Number(timeoutArg || 20000),
    projectPath,
    expectedRoute
  )
  emit(result)
  if (result.cleanup?.status === 'timed_out') {
    // The owned worker is disposable. Once the terminal result is flushed, force
    // its process down so a wedged close cannot keep the parent from reusing 9420.
    setImmediate(() => process.exit(0))
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => emit({ status: 'failed', error: String(error?.message || error) }))
}
