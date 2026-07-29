import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { repoRoot } from './state.mjs'

/* eslint-disable no-var -- these callback bodies are serialized for ES5-only App.callFunction parsing. */

export const PREFLIGHT_RPC_TIMEOUT_MS = 8000
export const PREFLIGHT_SCREENSHOT_TIMEOUT_MS = 20000
export const PREFLIGHT_DISCONNECT_TIMEOUT_MS = 3000
export const PREFLIGHT_CAPTURE_TIMEOUT_MS = 30000
const WX_REQUEST_TIMEOUT_MS = 10000
const WX_REQUEST_POLL_INTERVAL_MS = 200
const SCREENSHOT_WORKER_PATH = path.join(
  repoRoot,
  '.codex/skills/dispatch-task/scripts/dispatch-gate/lib/automator-screenshot-worker.mjs'
)
let wxRequestProbeSequence = 0

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

function rejectedStepError(step, error) {
  error.code ??= `preflight_${step}_failed`
  error.preflight_step ??= step
  return error
}

function recordStep(report, step, value) {
  report.checks.rpc_steps ??= {}
  report.checks.rpc_steps[step] = value
}

export function withPreflightDeadline({ report, step, timeoutMs, action }) {
  const startedAt = Date.now()
  recordStep(report, step, { status: 'running', timeout_ms: timeoutMs, started_at: now() })
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value, evidence) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      recordStep(report, step, {
        ...evidence,
        timeout_ms: timeoutMs,
        duration_ms: Date.now() - startedAt,
        completed_at: now()
      })
      callback(value)
    }
    const timer = setTimeout(() => {
      const error = stepError(step, timeoutMs)
      finish(reject, error, { status: 'timed_out', code: error.code, message: error.message })
    }, timeoutMs)
    Promise.resolve()
      .then(action)
      .then(
        value => finish(resolve, value, { status: 'passed', code: `preflight_${step}_passed` }),
        error => {
          const normalized = rejectedStepError(step, error)
          finish(reject, normalized, {
            status: 'failed',
            code: normalized.code,
            message: normalized.message
          })
        }
      )
  })
}

function screenshotWorkerError(message) {
  const error = new Error(message)
  error.code = 'preflight_screenshot_failed'
  error.preflight_step = 'screenshot'
  return error
}

export function captureIsolatedPreflightScreenshot({
  report,
  wsEndpoint,
  screenshotPath,
  timeoutMs,
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
      child = spawnProcess(process.execPath, [workerPath, wsEndpoint, screenshotPath, String(timeoutMs)], {
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      const normalized = screenshotWorkerError(`preflight screenshot worker failed to start: ${error.message}`)
      finish(reject, normalized, { status: 'failed', code: normalized.code, message: normalized.message })
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
      const normalized = screenshotWorkerError(`preflight screenshot worker error: ${error.message}`)
      finish(reject, normalized, { status: 'failed', code: normalized.code, message: normalized.message })
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
      const detail = result?.error || stderr.trim() || `worker exited code=${code} signal=${signal ?? 'none'}`
      const normalized = screenshotWorkerError(`preflight screenshot worker failed: ${detail}`)
      finish(reject, normalized, { status: 'failed', code: normalized.code, message: normalized.message })
    })
  })
}

function nextWxRequestSlot() {
  wxRequestProbeSequence += 1
  return `__dispatchQaWxRequest_${Date.now()}_${wxRequestProbeSequence}`
}

function acceptableHealthStatus(statusCode) {
  return Number.isInteger(statusCode) && statusCode >= 200 && statusCode < 400
}

function defaultEvaluateStep(miniProgram) {
  return (step, callback, args) => miniProgram.evaluate.apply(miniProgram, [callback, ...args])
}

export function requestFailureMessage(result, timeoutMs) {
  if (result?.cleanup?.passed !== true) {
    return `wx.request preflight cleanup failed: ${result?.cleanup?.error ?? 'unknown error'}`
  }
  if (result?.timed_out === true) {
    return `wx.request preflight timed out after ${timeoutMs}ms`
  }
  if (result?.error) {
    return `wx.request preflight failed: ${result.error}`
  }
  if (result?.statusCode !== undefined) {
    return `wx.request preflight returned unacceptable status ${result.statusCode}`
  }
  return 'wx.request preflight failed: no runtime result'
}

export async function probeWxRequest({
  miniProgram,
  url,
  slot = nextWxRequestSlot(),
  timeoutMs = WX_REQUEST_TIMEOUT_MS,
  pollIntervalMs = WX_REQUEST_POLL_INTERVAL_MS,
  nowMs = Date.now,
  sleep = wait,
  evaluateStep = defaultEvaluateStep(miniProgram)
} = {}) {
  const deadline = nowMs() + timeoutMs
  let result
  let cleanup = { attempted: false, passed: false }
  try {
    await evaluateStep(
      'wx_request_start',
      function (requestSlot, requestUrl) {
        globalThis[requestSlot] = { state: 'pending' }
        try {
          wx.request({
            url: requestUrl,
            method: 'GET',
            success: function (response) {
              var statusCode =
                response && response.statusCode !== undefined ? response.statusCode : null
              globalThis[requestSlot] = {
                state: 'completed',
                ok: true,
                statusCode: statusCode
              }
            },
            fail: function (error) {
              var errorMessage = error && error.errMsg ? error.errMsg : String(error)
              globalThis[requestSlot] = {
                state: 'completed',
                ok: false,
                error: errorMessage
              }
            },
            complete: function () {
              var current = globalThis[requestSlot]
              if (current && current.state === 'pending') {
                globalThis[requestSlot] = {
                  state: 'completed',
                  ok: false,
                  error: 'wx.request completed without success or fail result'
                }
              }
            }
          })
        } catch (error) {
          var message = error && error.message ? error.message : String(error)
          globalThis[requestSlot] = {
            state: 'completed',
            ok: false,
            error: message
          }
        }
        return { started: true }
      },
      [slot, url]
    )
    while (nowMs() <= deadline) {
      const observation = await evaluateStep(
        'wx_request_poll',
        function (requestSlot) {
          var value = globalThis[requestSlot]
          if (!value || typeof value !== 'object') {
            return null
          }
          return {
            state: value.state,
            ok: value.ok,
            statusCode: value.statusCode,
            error: value.error
          }
        },
        [slot]
      )
      if (observation?.state === 'completed') {
        const statusCode =
          observation.statusCode === null || observation.statusCode === undefined
            ? null
            : Number(observation.statusCode)
        result = {
          ...observation,
          statusCode: Number.isFinite(statusCode) ? statusCode : null,
          passed: observation.ok === true && acceptableHealthStatus(statusCode)
        }
        return result
      }
      if (nowMs() >= deadline) {
        result = { ok: false, timed_out: true, passed: false }
        return result
      }
      await sleep(Math.min(pollIntervalMs, deadline - nowMs()))
    }
    result = { ok: false, timed_out: true, passed: false }
    return result
  } finally {
    cleanup = { attempted: true, passed: false }
    try {
      await evaluateStep(
        'wx_request_cleanup',
        function (requestSlot) {
          delete globalThis[requestSlot]
          return true
        },
        [slot]
      )
      cleanup.passed = true
    } catch (error) {
      cleanup.error = error?.message ?? String(error)
    }
    if (result) {
      result.cleanup = cleanup
    }
  }
}

async function connectMiniProgram(wsEndpoint) {
  const imported = await import('miniprogram-automator')
  const automator = imported.default ?? imported
  return automator.connect({ wsEndpoint })
}

export async function captureRuntimeEvidence({
  report,
  wsEndpoint,
  screenshotPath,
  wxRequestUrl,
  connect = connectMiniProgram,
  rpcTimeoutMs = PREFLIGHT_RPC_TIMEOUT_MS,
  screenshotTimeoutMs = PREFLIGHT_SCREENSHOT_TIMEOUT_MS,
  disconnectTimeoutMs = PREFLIGHT_DISCONNECT_TIMEOUT_MS,
  screenshotCapture = captureIsolatedPreflightScreenshot,
  probeRequest = probeWxRequest
}) {
  let miniProgram
  let primaryError
  let captureResult
  try {
    miniProgram = await withPreflightDeadline({
      report,
      step: 'connect',
      timeoutMs: rpcTimeoutMs,
      action: () => connect(wsEndpoint)
    })
    report.checks.ws.passed = true
    report.checks.automator = { passed: true, ws_endpoint: wsEndpoint }
    const page = await withPreflightDeadline({
      report,
      step: 'current_page',
      timeoutMs: rpcTimeoutMs,
      action: () => miniProgram.currentPage()
    })
    report.pagePath = page?.path ?? 'unavailable'
    const pageData = await withPreflightDeadline({
      report,
      step: 'page_data',
      timeoutMs: rpcTimeoutMs,
      action: () => page?.data()
    })
    report.checks.page_data = {
      passed: Boolean(page && pageData && typeof pageData === 'object'),
      top_level_keys: Object.keys(pageData ?? {}).slice(0, 30)
    }
    if (!report.checks.page_data.passed) {
      throw new Error('page data unavailable')
    }
    if (!wxRequestUrl) {
      throw new Error('wx_request_url is required for live preflight')
    }
    const request = await probeRequest({
      miniProgram,
      url: wxRequestUrl,
      evaluateStep: (step, callback, args) =>
        withPreflightDeadline({
          report,
          step,
          timeoutMs: rpcTimeoutMs,
          action: () => miniProgram.evaluate.apply(miniProgram, [callback, ...args])
        })
    })
    report.checks.wx_request = {
      passed: request.passed === true && request.cleanup?.passed === true,
      status_code: request.statusCode ?? null,
      error: request.error ?? null,
      timed_out: request.timed_out === true,
      cleanup: request.cleanup,
      result: request
    }
    if (!report.checks.wx_request.passed) {
      throw new Error(requestFailureMessage(request, WX_REQUEST_TIMEOUT_MS))
    }
    await withPreflightDeadline({
      report,
      step: 'disconnect',
      timeoutMs: disconnectTimeoutMs,
      action: () => miniProgram.disconnect()
    })
    miniProgram = null
    await screenshotCapture({ report, wsEndpoint, screenshotPath, timeoutMs: screenshotTimeoutMs })
    if (!fs.existsSync(screenshotPath)) {
      throw new Error('screenshot worker returned without creating evidence file')
    }
    report.checks.screenshot = { passed: true, path: screenshotPath, capture_mode: 'isolated_worker' }
    report.evidence_paths.push(path.relative(repoRoot, screenshotPath))
    captureResult = {
      page_data: report.checks.page_data,
      screenshot: report.checks.screenshot,
      wx_request: report.checks.wx_request
    }
  } catch (error) {
    primaryError = error
  }
  if (miniProgram?.disconnect) {
    try {
      await withPreflightDeadline({
        report,
        step: 'disconnect',
        timeoutMs: disconnectTimeoutMs,
        action: () => miniProgram.disconnect()
      })
    } catch (error) {
      primaryError ??= error
    }
  }
  if (primaryError) {
    throw primaryError
  }
  return captureResult
}

export function isRecoverableRuntimeFailure(error) {
  return (
    /preflight_(?:screenshot|transport)_timeout/i.test(error?.code ?? '') ||
    /screenshot|transport/i.test(error?.message ?? '')
  )
}
