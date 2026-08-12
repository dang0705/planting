import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { captureIsolatedRendererScreenshot } from '../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/renderer-screenshot-readiness.mjs'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'planting-renderer-retry-'))
const screenshotPath = path.join(directory, 'renderer.png')
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(20)])
const workers = []

function createWorker(index) {
  const child = new EventEmitter()
  child.pid = 91000 + index
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.signals = []
  child.kill = signal => {
    child.signals.push(signal)
    return true
  }
  queueMicrotask(() => {
    if (index === 2) {
      fs.writeFileSync(screenshotPath, png)
    }
    child.stdout.write(
      `${JSON.stringify({
        type: 'renderer_screenshot_worker_result',
        status: index === 2 ? 'passed' : 'failed',
        command: { response: index === 2 ? 'received' : 'not_received' },
        error: index === 1 ? 'synthetic renderer no response' : undefined
      })}\n`
    )
    child.stdout.end()
    child.emit('close', index === 2 ? 0 : 1, null)
  })
  return child
}

const report = { checks: {} }
const result = await captureIsolatedRendererScreenshot({
  report,
  wsEndpoint: 'ws://127.0.0.1:9420',
  screenshotPath,
  timeoutMs: 200,
  maxAttempts: 2,
  retryDelayMs: 0,
  runtime: { observed_project_path: '/path/that/does/not/exist' },
  spawnProcess: () => {
    const worker = createWorker(workers.length + 1)
    workers.push(worker)
    return worker
  }
})

assert.equal(result.status, 'passed')
assert.equal(result.attempts.length, 2)
assert.equal(report.checks.renderer_screenshot_attempts.length, 2)
assert.deepEqual(workers[0].signals, ['SIGTERM', 'SIGKILL'])
assert.equal(workers.length, 2)
fs.rmSync(directory, { recursive: true, force: true })
