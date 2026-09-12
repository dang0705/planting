import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { repoRoot } from './state.mjs'

const DEFAULT_MAX_ATTEMPTS = 2
const DEFAULT_RETRY_DELAY_MS = 350
const SCREENSHOT_WORKER_PATH = path.join(
  repoRoot,
  '.codex/skills/dispatch-task/scripts/dispatch-gate/lib/automator-screenshot-worker.mjs'
)

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function now() {
  return new Date().toISOString()
}

function stepError(step, timeoutMs) {
  const error = new Error(`preflight ${step} timed out after ${timeoutMs}ms`)
  error.code =
    step === 'screenshot' ? 'preflight_screenshot_timeout' : 'preflight_transport_timeout'
  error.preflight_step = step
  error.timeout_ms = timeoutMs
  return error
}

function recordStep(report, step, value) {
  report.checks.rpc_steps ??= {}
  report.checks.rpc_steps[step] = value
}

function screenshotWorkerError(message) {
  const error = new Error(message)
  error.code = 'preflight_screenshot_failed'
  error.preflight_step = 'screenshot'
  return error
}

function ensureScreenshotParent(screenshotPath) {
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
}

function captureIsolatedPreflightScreenshotAttempt({
  report,
  wsEndpoint,
  screenshotPath,
  timeoutMs,
  projectPath = report?.devtools_runtime?.observed_project_path,
  expectedRoute = report?.pagePath || '',
  workerPath = SCREENSHOT_WORKER_PATH,
  spawnProcess = spawn
}) {
  const startedAt = Date.now()
  recordStep(report, 'screenshot', { status: 'running', timeout_ms: timeoutMs, started_at: now() })
  return new Promise((resolve, reject) => {
    let settled = false
    let killTimer = null
    let stdout = ''
    let stderr = ''
    let child

    const finish = (callback, value, evidence) => {
      if (settled) {
        return
      }
      settled = true
      if (killTimer) {
        clearTimeout(killTimer)
      }
      recordStep(report, 'screenshot', {
        ...evidence,
        timeout_ms: timeoutMs,
        duration_ms: Date.now() - startedAt,
        completed_at: now()
      })
      callback(value)
    }

    try {
      ensureScreenshotParent(screenshotPath)
    } catch (error) {
      const normalized = screenshotWorkerError(
        `preflight screenshot evidence directory unavailable: ${error.message}`
      )
      finish(reject, normalized, {
        status: 'failed',
        code: normalized.code,
        message: normalized.message
      })
      return
    }

    try {
      child = spawnProcess(
        process.execPath,
        [workerPath, wsEndpoint, screenshotPath, String(timeoutMs), projectPath, expectedRoute],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch (error) {
      const normalized = screenshotWorkerError(
        `preflight screenshot worker failed to start: ${error.message}`
      )
      finish(reject, normalized, {
        status: 'failed',
        code: normalized.code,
        message: normalized.message
      })
      return
    }

    killTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // The child may already have exited; its close handler owns the final result.
      }
      const error = stepError('screenshot', timeoutMs)
      finish(reject, error, { status: 'timed_out', code: error.code, message: error.message })
    }, timeoutMs)

    child.stdout?.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', chunk => {
      stderr += chunk.toString()
    })
    child.on('error', error => {
      const normalized = screenshotWorkerError(
        `preflight screenshot worker error: ${error.message}`
      )
      finish(reject, normalized, {
        status: 'failed',
        code: normalized.code,
        message: normalized.message
      })
    })
    child.on('close', (code, signal) => {
      if (settled) {
        return
      }
      let result
      try {
        result = JSON.parse(stdout.trim())
      } catch {
        result = null
      }
      if (result?.status === 'passed' && fs.existsSync(screenshotPath)) {
        finish(resolve, result, { status: 'passed', code: 'preflight_screenshot_passed' })
        return
      }
      const detail =
        result?.error || stderr.trim() || `worker exited code=${code} signal=${signal ?? 'none'}`
      const normalized = screenshotWorkerError(`preflight screenshot worker failed: ${detail}`)
      finish(reject, normalized, {
        status: 'failed',
        code: normalized.code,
        message: normalized.message
      })
    })
  })
}

export async function captureIsolatedPreflightScreenshot({
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  ...options
} = {}) {
  const attempts = []
  const boundedAttempts = Math.max(1, Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS)
  let lastError = null
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    try {
      const result = await captureIsolatedPreflightScreenshotAttempt(options)
      attempts.push({ attempt, status: 'passed' })
      options.report.checks.rpc_steps.screenshot_attempts = attempts
      return { ...result, attempts }
    } catch (error) {
      lastError = error
      attempts.push({
        attempt,
        status: 'failed',
        code: error?.code || null,
        reason: String(error?.message || error)
      })
      if (attempt < boundedAttempts) {
        await wait(retryDelayMs)
      }
    }
  }
  options.report.checks.rpc_steps.screenshot_attempts = attempts
  throw lastError || screenshotWorkerError('preflight screenshot failed')
}
