import { mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  screenshotStabilityBudget,
  waitForScreenshotStability
} from '../../../../../../test/e2e/automator/_shared/screenshot-stability.mjs'
import { isValidPngEvidence } from '../../../../../../scripts/qa/qa-png-evidence.mjs'

export const RENDERER_SCREENSHOT_METHOD = 'App.captureScreenshot'
export function isNonEmptyPngFile(filePath) {
  return isValidPngEvidence(filePath)
}

function now() {
  return new Date().toISOString()
}

function message(error) {
  return String(error?.message ?? error).slice(0, 1000)
}

function emit(emitEvent, payload) {
  emitEvent({ type: 'renderer_screenshot_worker_event', ...payload })
}

function raceWithDeadline(action, timeoutMs) {
  return new Promise(resolve => {
    let settled = false
    const finish = value => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish({ timed_out: true }), timeoutMs)
    Promise.resolve()
      .then(action)
      .then(
        value => finish({ value, timed_out: false }),
        error => finish({ error, timed_out: false })
      )
  })
}

export async function runRendererScreenshotProbe({
  connect,
  wsEndpoint,
  outputPath,
  timeoutMs,
  projectPath,
  expectedRoute = '',
  emitEvent = () => {},
  validatePng = isNonEmptyPngFile
}) {
  const startedAt = now()
  let miniProgram = null
  let expired = false
  let commandStartedAt = null
  let stability = null
  emit(emitEvent, {
    phase: 'worker_started',
    started_at: startedAt,
    ws_endpoint: wsEndpoint,
    renderer_ready_signal: 'isolated_app_capture_screenshot_valid_png'
  })
  mkdirSync(path.dirname(outputPath), { recursive: true })
  const action = async () => {
    miniProgram = await connect({ wsEndpoint })
    if (expired) {
      miniProgram?.disconnect?.()
      throw new Error('renderer screenshot probe expired before Automator connect completed')
    }
    emit(emitEvent, { phase: 'automator_connected', connected_at: now() })
    stability = await waitForScreenshotStability({
      miniProgram,
      projectPath,
      expectedRoute,
      timeoutMs: screenshotStabilityBudget(timeoutMs)
    })
    emit(emitEvent, { phase: 'stability_passed', stability })
    commandStartedAt = now()
    emit(emitEvent, {
      phase: 'command_started',
      command: RENDERER_SCREENSHOT_METHOD,
      command_started_at: commandStartedAt
    })
    await miniProgram.screenshot({ path: outputPath })
    if (!validatePng(outputPath)) {
      throw new Error('screenshot_file_missing_empty_or_not_png')
    }
    return { bytes: statSync(outputPath).size }
  }
  const outcome = await raceWithDeadline(action, timeoutMs)
  if (outcome.timed_out) {
    expired = true
    try {
      miniProgram?.disconnect?.()
    } catch {
      // The parent owns the hard worker deadline after this terminal diagnostic.
    }
    return {
      type: 'renderer_screenshot_worker_result',
      status: 'timeout',
      renderer_ready: false,
      error: commandStartedAt
        ? `renderer_screenshot_no_response_after_${timeoutMs}ms`
        : `renderer_screenshot_connect_not_ready_after_${timeoutMs}ms`,
      probe_started_at: startedAt,
      stability,
      command: {
        method: RENDERER_SCREENSHOT_METHOD,
        started_at: commandStartedAt,
        response: commandStartedAt ? 'not_received' : 'not_started'
      }
    }
  }
  try {
    if (outcome.error) {
      throw outcome.error
    }
    return {
      type: 'renderer_screenshot_worker_result',
      status: 'passed',
      renderer_ready: true,
      path: outputPath,
      bytes: outcome.value.bytes,
      probe_started_at: startedAt,
      stability,
      command: {
        method: RENDERER_SCREENSHOT_METHOD,
        started_at: commandStartedAt,
        response: 'received',
        responded_at: now()
      }
    }
  } catch (error) {
    return {
      type: 'renderer_screenshot_worker_result',
      status: 'failed',
      renderer_ready: false,
      error: message(error),
      probe_started_at: startedAt,
      command: {
        method: RENDERER_SCREENSHOT_METHOD,
        started_at: commandStartedAt,
        response: commandStartedAt ? 'failed' : 'not_started'
      }
    }
  } finally {
    try {
      miniProgram?.disconnect?.()
    } catch {
      // Disposable worker cleanup is deliberately best-effort.
    }
  }
}
