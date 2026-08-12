import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
// DevTools renderer 在页面路由切换、动画落地和截图 RPC 之间可能需要
// 数秒；统一使用有界 15s 窗口，避免卡死的 renderer 让一次 QA 等待数分钟。
const DEFAULT_SCREENSHOT_TIMEOUT_MS = 15_000
const DEFAULT_TERMINATE_GRACE_MS = 1_000
const DEFAULT_KILL_GRACE_MS = 1_000
const DEFAULT_SCREENSHOT_ATTEMPTS = 2
const DEFAULT_SCREENSHOT_RETRY_DELAY_MS = 350
const DEFAULT_SCREENSHOT_COOLDOWN_MS = 750
const DEFAULT_PROJECT_PATH = path.resolve(process.cwd(), 'dist/dev/mp-weixin')
const DEFAULT_SCREENSHOT_WORKER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../diagnosis/_shared/screenshot-worker.mjs'
)

function validPng(filePath, fsModule = fs) {
  try {
    const bytes = fsModule.readFileSync(filePath)
    return bytes.length > 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)
  } catch {
    return false
  }
}

function excerpt(value) {
  return String(value || '').slice(-1000)
}

function parseWorkerResult(stdout) {
  const lines = String(stdout || '')
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index])
      if (value && typeof value === 'object') {
        return value
      }
    } catch {
      // A worker may have written diagnostics before its terminal JSON result.
    }
  }
  return null
}

function parseWorkerEvents(stdout) {
  return String(stdout || '')
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        const value = JSON.parse(line)
        return value?.type === 'screenshot_worker_event' ? [value] : []
      } catch {
        return []
      }
    })
}

function childEvidence({ child, stdout, stderr, signals, exited, exitCode, exitSignal }) {
  return {
    child_pid: child?.pid ?? 'unavailable',
    signals,
    exit_observed: exited,
    worker_exit_code: exitCode,
    worker_exit_signal: exitSignal,
    stdout_excerpt: excerpt(stdout),
    stderr_excerpt: excerpt(stderr)
  }
}

function captureFormalScreenshotAttempt({
  wsEndpoint,
  outputPath,
  workerPath = DEFAULT_SCREENSHOT_WORKER_PATH,
  timeoutMs = DEFAULT_SCREENSHOT_TIMEOUT_MS,
  projectPath = process.env.MP_PROJECT_PATH || DEFAULT_PROJECT_PATH,
  expectedRoute = '',
  terminateGraceMs = DEFAULT_TERMINATE_GRACE_MS,
  killGraceMs = DEFAULT_KILL_GRACE_MS,
  spawnProcess = spawn,
  fsModule = fs,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  return new Promise(resolve => {
    fsModule.mkdirSync(path.dirname(outputPath), { recursive: true })
    // Never allow a previous run's PNG to satisfy the current worker. The
    // output path is test-owned evidence, so remove only this exact artifact
    // before each bounded attempt.
    try {
      fsModule.unlinkSync(outputPath)
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        resolve({
          status: 'failed_environment',
          code: 'screenshot_artifact_reset_failed',
          reason: String(error?.message || error),
          output_path: outputPath
        })
        return
      }
    }
    let child
    let stdout = ''
    let stderr = ''
    let phase = 'running'
    let exited = false
    let exitCode = null
    let exitSignal = null
    let timeoutTimer = null
    let terminateTimer
    let killTimer
    const signals = []
    const clearTimers = () => {
      clearTimer(timeoutTimer)
      clearTimer(terminateTimer)
      clearTimer(killTimer)
    }
    const finish = result => {
      if (phase === 'settled') {
        return
      }
      phase = 'settled'
      clearTimers()
      resolve(result)
    }
    const send = signal => {
      try {
        child?.kill?.(signal)
        signals.push(signal)
        return true
      } catch (error) {
        signals.push(`${signal}_failed:${String(error?.message || error)}`)
        return false
      }
    }
    const cleanupFailed = originalCode =>
      finish({
        status: 'cleanup_failed',
        code: 'screenshot_worker_cleanup_failed',
        original_code: originalCode,
        reason: 'owned screenshot worker remained live after SIGTERM and SIGKILL grace windows',
        ws_endpoint: wsEndpoint,
        output_path: outputPath,
        cleanup: childEvidence({ child, stdout, stderr, signals, exited, exitCode, exitSignal })
      })
    const beginTermination = originalCode => {
      if (phase !== 'running') {
        return
      }
      phase = 'terminating'
      send('SIGTERM')
      if (exited || phase === 'settled') {
        return
      }
      terminateTimer = setTimer(() => {
        if (exited) {
          return
        }
        send('SIGKILL')
        killTimer = setTimer(() => cleanupFailed(originalCode), killGraceMs)
      }, terminateGraceMs)
    }
    try {
      child = spawnProcess(
        process.execPath,
        [workerPath, wsEndpoint, outputPath, String(timeoutMs), projectPath, expectedRoute],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )
    } catch (error) {
      finish({
        status: 'failed_environment',
        code: 'screenshot_worker_spawn_failed',
        reason: String(error?.message || error),
        ws_endpoint: wsEndpoint,
        output_path: outputPath
      })
      return
    }
    timeoutTimer = setTimer(() => beginTermination('screenshot_worker_timeout'), timeoutMs)
    child.stdout?.on('data', chunk => {
      stdout += chunk
    })
    child.stderr?.on('data', chunk => {
      stderr += chunk
    })
    child.once('error', error => {
      if (phase === 'running') {
        finish({
          status: 'failed_environment',
          code: 'screenshot_worker_spawn_failed',
          reason: String(error?.message || error),
          ws_endpoint: wsEndpoint,
          output_path: outputPath
        })
      }
    })
    child.once('exit', (code, signal) => {
      exited = true
      exitCode = code ?? null
      exitSignal = signal ?? null
      if (phase === 'terminating') {
        finish({
          status: 'failed_environment',
          code: 'screenshot_worker_timeout',
          ws_endpoint: wsEndpoint,
          output_path: outputPath,
          cleanup: childEvidence({ child, stdout, stderr, signals, exited, exitCode, exitSignal })
        })
        return
      }
      if (code === 0 && validPng(outputPath, fsModule)) {
        const workerResult = parseWorkerResult(stdout)
        finish({
          status: 'passed',
          validPng: true,
          worker_exit_code: code,
          output_path: outputPath,
          worker_result: workerResult,
          worker_events: parseWorkerEvents(stdout),
          cleanup: childEvidence({ child, stdout, stderr, signals, exited, exitCode, exitSignal })
        })
        return
      }
      const workerResult = parseWorkerResult(stdout)
      const workerStatus = String(workerResult?.status || '').trim()
      finish({
        status: 'failed_environment',
        code: workerStatus === 'timeout' ? 'screenshot_worker_timeout' : 'screenshot_worker_failed',
        reason:
          String(workerResult?.error || '').trim() ||
          `screenshot worker exited code=${code ?? 'unknown'} signal=${signal ?? 'none'}`,
        ws_endpoint: wsEndpoint,
        output_path: outputPath,
        worker_result: workerResult,
        worker_events: parseWorkerEvents(stdout),
        cleanup: childEvidence({ child, stdout, stderr, signals, exited, exitCode, exitSignal })
      })
    })
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function captureFormalScreenshot({
  maxAttempts = DEFAULT_SCREENSHOT_ATTEMPTS,
  retryDelayMs = DEFAULT_SCREENSHOT_RETRY_DELAY_MS,
  postCaptureDelayMs = DEFAULT_SCREENSHOT_COOLDOWN_MS,
  ...options
} = {}) {
  const attempts = []
  const boundedAttempts = Math.max(1, Number(maxAttempts) || DEFAULT_SCREENSHOT_ATTEMPTS)
  let lastResult = null
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    lastResult = await captureFormalScreenshotAttempt(options)
    const attemptEvidence = {
      attempt,
      status: lastResult.status,
      code: lastResult.code || null,
      reason: lastResult.reason || lastResult.worker_result?.error || null,
      phase: lastResult.worker_result?.phase || null,
      worker_pid: lastResult.cleanup?.child_pid || null
    }
    attempts.push(attemptEvidence)
    if (lastResult.status === 'passed' && lastResult.validPng === true) {
      if (postCaptureDelayMs > 0) {
        await sleep(postCaptureDelayMs)
      }
      return { ...lastResult, attempts, successful_attempt: attempt }
    }
    if (attempt < boundedAttempts) {
      await sleep(retryDelayMs)
    }
  }
  return { ...(lastResult || { status: 'failed_environment' }), attempts }
}
