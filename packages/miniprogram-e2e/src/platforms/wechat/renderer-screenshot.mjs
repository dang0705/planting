import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isValidPng } from './automator-session.mjs'
import { readFile } from 'node:fs/promises'

const workerPath = fileURLToPath(new URL('./renderer-screenshot-worker.mjs', import.meta.url))

/**
 * Bounded, disposable Renderer capture. A hung capture worker is isolated
 * from the suite controller and becomes infrastructure evidence rather than a
 * permanently stuck test process.
 */
export async function captureWechatRendererScreenshot({ wsEndpoint, outputPath, timeoutMs = 20_000 }) {
  const result = await runWorker({ wsEndpoint, outputPath, timeoutMs })
  if (result.timedOut) {
    const error = new Error(`renderer screenshot worker timed out after ${timeoutMs}ms`)
    error.code = 'mp_e2e_renderer_screenshot_timeout'
    error.details = result
    throw error
  }
  if (result.code !== 0 || result.payload?.status !== 'passed') {
    const error = new Error(result.payload?.message || result.stderr || 'renderer screenshot worker failed')
    error.code = result.payload?.code || 'mp_e2e_renderer_screenshot_failed'
    error.details = result
    throw error
  }
  const png = await readFile(outputPath)
  if (!isValidPng(png)) {
    const error = new Error('renderer screenshot worker wrote an invalid PNG')
    error.code = 'mp_e2e_invalid_png'
    throw error
  }
  return { path: outputPath, bytes: png.length, worker: { code: result.code, durationMs: result.durationMs } }
}

function runWorker({ wsEndpoint, outputPath, timeoutMs }) {
  return new Promise(resolve => {
    const startedAt = Date.now()
    const child = spawn(process.execPath, [workerPath, wsEndpoint, outputPath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = result => {
      if (settled) {return}
      settled = true
      clearTimeout(timer)
      let payload = null
      try { payload = JSON.parse(stdout.trim()) } catch { /* captured stderr remains evidence */ }
      resolve({ ...result, stdout: stdout.slice(0, 256 * 1024), stderr: stderr.slice(0, 256 * 1024), payload, durationMs: Date.now() - startedAt })
    }
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', error => finish({ code: null, error, timedOut: false }))
    child.on('close', (code, signal) => finish({ code, signal, timedOut: false }))
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish({ code: null, signal: 'SIGTERM', timedOut: true })
    }, timeoutMs)
  })
}
