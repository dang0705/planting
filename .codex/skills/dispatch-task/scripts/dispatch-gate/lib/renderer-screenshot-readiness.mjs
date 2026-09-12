import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { isNonEmptyPngFile, RENDERER_SCREENSHOT_METHOD } from './renderer-screenshot-probe.mjs'
import { repoRoot } from './state.mjs'

const WORKER_PATH = path.join(
  repoRoot,
  '.codex/skills/dispatch-task/scripts/dispatch-gate/lib/automator-screenshot-worker.mjs'
)
const WORKER_DEADLINE_RESERVE_MS = 1000
const DEFAULT_SCREENSHOT_ATTEMPTS = 2
const DEFAULT_SCREENSHOT_RETRY_DELAY_MS = 350
const WORKER_THREAD_PATH = path.join(
  repoRoot,
  '.codex/skills/dispatch-task/scripts/dispatch-gate/lib/automator-screenshot-thread.mjs'
)
const WORKER_STARTUP_DEADLINE_MS = 1500

function now() {
  return new Date().toISOString()
}

function stringValue(value, fallback = '') {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 1000) : fallback
}

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function runtimeEvidence(runtime = {}) {
  const session = runtime?.session_log_evidence
  return {
    main_devtools_pid: positiveInteger(runtime?.main_devtools_pid),
    observed_project_path: stringValue(runtime?.observed_project_path, 'unavailable'),
    automator_port: positiveInteger(runtime?.automator_port),
    automator_listener_pids: Array.isArray(runtime?.automator_listener_pids)
      ? runtime.automator_listener_pids.map(Number).filter(Number.isInteger)
      : [],
    control_port: positiveInteger(runtime?.control_port),
    control_port_verified: runtime?.control_port_verified === true,
    project_identity_verified: runtime?.project_identity_verified === true,
    session: {
      status: stringValue(session?.status, 'unavailable'),
      session_id: stringValue(session?.session_id, 'unavailable')
    }
  }
}

function workerDeadline(timeoutMs) {
  return Math.max(1, Number(timeoutMs) - WORKER_DEADLINE_RESERVE_MS)
}

function parseWorkerLine(line) {
  try {
    const parsed = JSON.parse(line)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function eventSummary(event) {
  return {
    phase: stringValue(event?.phase, 'unavailable'),
    command: stringValue(event?.command, ''),
    started_at: stringValue(event?.started_at, ''),
    connected_at: stringValue(event?.connected_at, ''),
    command_started_at: stringValue(event?.command_started_at, '')
  }
}

function workerResult(value) {
  return value?.type === 'renderer_screenshot_worker_result' ||
    ['passed', 'failed', 'timeout'].includes(value?.status)
    ? value
    : null
}

function recordRendererDiagnostic(report, diagnostic) {
  report.checks ??= {}
  report.checks.rpc_steps ??= {}
  report.checks.renderer_screenshot = diagnostic
  report.checks.rpc_steps.screenshot = {
    status:
      diagnostic.status === 'passed'
        ? 'passed'
        : diagnostic.status === 'timed_out'
          ? 'timed_out'
          : 'failed',
    code: diagnostic.code,
    message: diagnostic.message,
    timeout_ms: diagnostic.timeout_ms,
    duration_ms: diagnostic.duration_ms,
    completed_at: diagnostic.completed_at
  }
}

export function rendererScreenshotUnreadyError(diagnostic) {
  const error = new Error(diagnostic.message)
  error.code = 'renderer_screenshot_unready'
  error.preflight_step = 'renderer_screenshot'
  error.renderer_screenshot = diagnostic
  return error
}

function failureDiagnostic({
  startedAt,
  timeoutMs,
  targetRuntime,
  events,
  result,
  stderr = '',
  parentTimedOut = false,
  captureMode = 'child_process'
}) {
  const commandStarted = events.find(event => event.phase === 'command_started')
  const workerTimeout = result?.status === 'timeout'
  const noResponse =
    (commandStarted && result?.command?.response !== 'received') ||
    (parentTimedOut && commandStarted)
  const reason = noResponse
    ? 'renderer_screenshot_no_response'
    : workerTimeout
      ? 'renderer_screenshot_worker_timeout'
      : 'renderer_screenshot_worker_failed'
  const detail = stringValue(
    result?.error,
    parentTimedOut
      ? `renderer screenshot worker did not return before ${timeoutMs}ms`
      : stringValue(stderr, 'renderer screenshot worker returned no terminal result')
  )
  return {
    status: parentTimedOut || workerTimeout ? 'timed_out' : 'failed',
    code: 'renderer_screenshot_unready',
    reason,
    message: `renderer screenshot is not ready: ${detail}`,
    timeout_ms: timeoutMs,
    duration_ms: Date.now() - startedAt,
    completed_at: now(),
    renderer_ready_signal: 'isolated_app_capture_screenshot_valid_png',
    command: {
      method: RENDERER_SCREENSHOT_METHOD,
      started_at: result?.command?.started_at ?? commandStarted?.command_started_at ?? null,
      response: result?.command?.response ?? (commandStarted ? 'not_received' : 'not_started')
    },
    target_runtime: targetRuntime,
    capture_mode: captureMode,
    worker_events: events,
    worker_result: result ?? null,
    stderr_excerpt: stringValue(stderr)
  }
}

function captureIsolatedRendererScreenshotAttempt({
  report,
  wsEndpoint,
  screenshotPath,
  timeoutMs,
  runtime,
  workerPath = WORKER_PATH,
  spawnProcess = spawn,
  recordDiagnostic = true
}) {
  const startedAt = Date.now()
  const targetRuntime = runtimeEvidence(runtime)
  const events = []
  return new Promise((resolve, reject) => {
    let settled = false
    let killTimer = null
    let startupTimer = null
    let stdoutBuffer = ''
    let stderr = ''
    let child
    let thread
    let childActive = false
    let threadActive = false
    let captureMode = 'child_process'
    const finish = (callback, value, diagnostic) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(killTimer)
      clearTimeout(startupTimer)
      if (recordDiagnostic) {
        recordRendererDiagnostic(report, diagnostic)
      }
      callback(value)
    }
    const terminate = signal => {
      try {
        if (childActive) {
          child?.kill?.(signal)
        }
      } catch {
        // The worker may already have exited after emitting its terminal result.
      }
      try {
        if (threadActive) {
          void thread?.terminate?.()
        }
      } catch {
        // The worker may already have exited after emitting its terminal result.
      }
    }
    const rejectUnready = diagnostic => {
      diagnostic.capture_mode ??= captureMode
      terminate('SIGTERM')
      // The child is disposable and the parent may immediately start a
      // recovery attempt. Do not let a failed renderer RPC leave a second
      // Automator connection alive against the supervisor-owned renderer.
      terminate('SIGKILL')
      finish(reject, rendererScreenshotUnreadyError(diagnostic), diagnostic)
    }
    const consume = value => {
      if (value?.type === 'renderer_screenshot_worker_event') {
        events.push(eventSummary(value))
        return
      }
      const result = workerResult(value)
      if (!result || settled) {
        return
      }
      if (result.status === 'passed' && isNonEmptyPngFile(screenshotPath)) {
        const diagnostic = {
          status: 'passed',
          code: 'renderer_screenshot_ready',
          message: 'renderer screenshot probe returned a valid PNG',
          timeout_ms: timeoutMs,
          duration_ms: Date.now() - startedAt,
          completed_at: now(),
          renderer_ready_signal: 'isolated_app_capture_screenshot_valid_png',
          capture_mode: captureMode,
          command: result.command,
          target_runtime: targetRuntime,
          worker_events: events,
          worker_result: result
        }
        terminate('SIGTERM')
        finish(resolve, result, diagnostic)
        return
      }
      rejectUnready(
        failureDiagnostic({ startedAt, timeoutMs, targetRuntime, events, result, stderr })
      )
    }
    const startThreadFallback = () => {
      if (settled || threadActive || events.some(event => event.phase === 'worker_started')) {
        return false
      }
      captureMode = 'worker_thread'
      terminate('SIGTERM')
      childActive = false
      try {
        thread = new Worker(WORKER_THREAD_PATH, {
          workerData: {
            wsEndpoint,
            outputPath: screenshotPath,
            timeoutMs: workerDeadline(timeoutMs),
            projectPath: targetRuntime.observed_project_path,
            expectedRoute: runtime?.expected_page_path || runtime?.page_path || ''
          }
        })
        threadActive = true
        thread.on('message', consume)
        thread.on('error', error => {
          if (settled) {
            return
          }
          rejectUnready(
            failureDiagnostic({
              startedAt,
              timeoutMs,
              targetRuntime,
              events,
              result: { status: 'failed', error: `renderer screenshot thread error: ${error.message}` },
              stderr
            })
          )
        })
        thread.on('exit', code => {
          threadActive = false
          if (!settled && code !== 0) {
            rejectUnready(
              failureDiagnostic({
                startedAt,
                timeoutMs,
                targetRuntime,
                events,
                result: {
                  status: 'failed',
                  error: `renderer screenshot thread exited code=${code} without terminal result`
                },
                stderr
              })
            )
          }
        })
        return true
      } catch (error) {
        rejectUnready(
          failureDiagnostic({
            startedAt,
            timeoutMs,
            targetRuntime,
            events,
            result: { status: 'failed', error: `renderer screenshot thread failed to start: ${error.message}` },
            stderr
          })
        )
        return false
      }
    }
    try {
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
      child = spawnProcess(
        process.execPath,
        [
          workerPath,
          wsEndpoint,
          screenshotPath,
          String(workerDeadline(timeoutMs)),
          targetRuntime.observed_project_path,
          runtime?.expected_page_path || runtime?.page_path || ''
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            QA_AUTOMATOR_RUNTIME_PROOF: JSON.stringify(targetRuntime)
          }
        }
      )
      childActive = true
    } catch (error) {
      if (spawnProcess === spawn && startThreadFallback()) {
        return
      }
      rejectUnready(
        failureDiagnostic({
          startedAt,
          timeoutMs,
          targetRuntime,
          events,
          result: {
            status: 'failed',
            error: `renderer screenshot worker failed to start: ${error.message}`
          }
        })
      )
      return
    }
    if (spawnProcess === spawn) {
      startupTimer = setTimeout(() => {
        startThreadFallback()
      }, Math.min(WORKER_STARTUP_DEADLINE_MS, Math.max(250, workerDeadline(timeoutMs))))
    }
    killTimer = setTimeout(() => {
      rejectUnready(
        failureDiagnostic({
          startedAt,
          timeoutMs,
          targetRuntime,
          events,
          stderr,
          parentTimedOut: true
        })
      )
      terminate('SIGKILL')
    }, timeoutMs)
    child.stdout?.on('data', chunk => {
      if (!childActive) {
        return
      }
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''
      lines
        .map(line => line.trim())
        .filter(Boolean)
        .forEach(line => consume(parseWorkerLine(line)))
    })
    child.stderr?.on('data', chunk => {
      if (!childActive) {
        return
      }
      stderr += chunk.toString()
    })
    child.on('error', error => {
      if (!childActive) {
        return
      }
      rejectUnready(
        failureDiagnostic({
          startedAt,
          timeoutMs,
          targetRuntime,
          events,
          result: { status: 'failed', error: `renderer screenshot worker error: ${error.message}` },
          stderr
        })
      )
    })
    child.on('close', (code, signal) => {
      childActive = false
      if (settled || threadActive) {
        return
      }
      if (stdoutBuffer.trim()) {
        consume(parseWorkerLine(stdoutBuffer.trim()))
      }
      if (!settled) {
        rejectUnready(
          failureDiagnostic({
            startedAt,
            timeoutMs,
            targetRuntime,
            events,
            result: {
              status: 'failed',
              error: `worker exited code=${code} signal=${signal ?? 'none'} without terminal result`
            },
            stderr
          })
        )
      }
    })
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function captureIsolatedRendererScreenshot({
  maxAttempts = DEFAULT_SCREENSHOT_ATTEMPTS,
  retryDelayMs = DEFAULT_SCREENSHOT_RETRY_DELAY_MS,
  ...options
} = {}) {
  const attempts = []
  const boundedAttempts = Math.max(1, Number(maxAttempts) || DEFAULT_SCREENSHOT_ATTEMPTS)
  let lastError = null
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    try {
      const result = await captureIsolatedRendererScreenshotAttempt(options)
      attempts.push({ attempt, status: 'passed' })
      options.report.checks.renderer_screenshot_attempts = attempts
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
        await sleep(retryDelayMs)
      }
    }
  }
  options.report.checks.renderer_screenshot_attempts = attempts
  throw lastError || new Error('renderer screenshot capture failed')
}
