import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  screenshotStabilityBudget,
  waitForScreenshotStability
} from '../../e2e/automator/_shared/screenshot-stability.mjs'
import { captureFormalScreenshot } from '../../e2e/automator/_shared/formal-leaf-screenshot.mjs'

const immediate = async () => {}
const stablePage = {
  path: '/pages/airflow/index',
  data: async () => ({ ready: true, question: 'airflow' })
}

assert.equal(screenshotStabilityBudget(12_000), 5_000)
assert.equal(screenshotStabilityBudget(2_000), 1_000)

const stable = await waitForScreenshotStability({
  miniProgram: { currentPage: async () => stablePage },
  expectedRoute: 'pages/airflow/index',
  projectPath: '/path/that/does/not/exist',
  timeoutMs: 100,
  quietWindowMs: 0,
  pollIntervalMs: 0,
  sleepFn: immediate,
  readPageData: true
})
assert.equal(stable.status, 'passed')
assert.equal(stable.route, 'pages/airflow/index')
assert.equal(stable.stable_samples, 2)
assert.equal(stable.data_probe, 'passed')

const wedgedData = await waitForScreenshotStability({
  miniProgram: {
    currentPage: async () => ({
      path: '/pages/airflow/index',
      data: () => new Promise(() => {})
    })
  },
  expectedRoute: 'pages/airflow/index',
  projectPath: '/path/that/does/not/exist',
  timeoutMs: 800,
  quietWindowMs: 0,
  pollIntervalMs: 0,
  sleepFn: immediate,
  readPageData: true
})
assert.equal(wedgedData.status, 'passed')
assert.equal(wedgedData.data_probe, 'timed_out_or_unavailable')

await assert.rejects(
  waitForScreenshotStability({
    miniProgram: { currentPage: async () => stablePage },
    expectedRoute: 'pages/diagnose/question-package',
    projectPath: '/path/that/does/not/exist',
    timeoutMs: 100,
    quietWindowMs: 0,
    pollIntervalMs: 0,
    sleepFn: immediate
  }),
  error => error.code === 'screenshot_stability_route_mismatch'
)

const retryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'planting-screenshot-retry-'))
const retryPath = path.join(retryDirectory, 'retry.png')
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(20)])
let workerStarts = 0
const retryResult = await captureFormalScreenshot({
  wsEndpoint: 'ws://127.0.0.1:9420',
  outputPath: retryPath,
  timeoutMs: 500,
  retryDelayMs: 0,
  spawnProcess: () => {
    workerStarts += 1
    const child = new EventEmitter()
    child.pid = 90000 + workerStarts
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => true
    queueMicrotask(() => {
      if (workerStarts === 2) {
        fs.writeFileSync(retryPath, png)
      }
      child.stdout.emit(
        'data',
        Buffer.from(
          `${JSON.stringify({ status: workerStarts === 2 ? 'passed' : 'failed', path: retryPath })}\n`
        )
      )
      child.emit('exit', workerStarts === 2 ? 0 : 1, null)
    })
    return child
  }
})
assert.equal(retryResult.status, 'passed')
assert.equal(retryResult.successful_attempt, 2)
assert.equal(retryResult.attempts.length, 2)
assert.equal(workerStarts, 2)
fs.rmSync(retryDirectory, { recursive: true, force: true })
