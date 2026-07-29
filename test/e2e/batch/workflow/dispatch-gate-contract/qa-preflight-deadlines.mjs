import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import {
  captureIsolatedPreflightScreenshot,
  captureRuntimeEvidence
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight-runtime.mjs'
import { runQaPreflight } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight.mjs'
import { repoRoot } from './helpers.mjs'

const expectedProjectPath = path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
const evidencePath = path.join(repoRoot, '.tmp', 'dispatch-task', `qa-deadline-${Date.now()}.png`)

function never() {
  return new Promise(() => {})
}

function report() {
  return { checks: { ws: { passed: false } }, evidence_paths: [] }
}

function verifiedRuntime() {
  return {
    status: 'verified',
    project_identity_verified: true,
    observed_project_path: expectedProjectPath,
    main_devtools_pid: 43100,
    automation_listener_pid: 43210,
    port_owner_pid: 43210,
    automator_port: 9420,
    control_port: 3799,
    project_evidence: [expectedProjectPath]
  }
}

const hungConnectReport = report()
await assert.rejects(
  captureRuntimeEvidence({
    report: hungConnectReport,
    wsEndpoint: 'ws://127.0.0.1:9420',
    screenshotPath: evidencePath,
    wxRequestUrl: 'http://127.0.0.1/health',
    rpcTimeoutMs: 10,
    connect: never
  }),
  error => error.code === 'preflight_transport_timeout' && error.preflight_step === 'connect'
)
assert.equal(hungConnectReport.checks.rpc_steps.connect.status, 'timed_out')

const pngFixture = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const successfulWorkerReport = report()
const successfulWorker = new EventEmitter()
successfulWorker.stdout = new PassThrough()
successfulWorker.stderr = new PassThrough()
successfulWorker.kill = () => false
let defaultWorkerPath = ''
fs.writeFileSync(evidencePath, pngFixture)
const successfulCapture = captureIsolatedPreflightScreenshot({
  report: successfulWorkerReport,
  wsEndpoint: 'ws://127.0.0.1:9420',
  screenshotPath: evidencePath,
  timeoutMs: 20,
  spawnProcess: (_command, args) => {
    defaultWorkerPath = args[0]
    return successfulWorker
  }
})
successfulWorker.stdout.end(JSON.stringify({ status: 'passed', path: evidencePath, bytes: pngFixture.length }))
successfulWorker.emit('close', 0, null)
await successfulCapture
assert.equal(successfulWorkerReport.checks.rpc_steps.screenshot.status, 'passed')
assert.equal(defaultWorkerPath.includes('test/e2e/automator'), false)
assert.equal(defaultWorkerPath.endsWith('automator-screenshot-worker.mjs'), true)

const hungWorkerReport = report()
const hungWorker = new EventEmitter()
hungWorker.stdout = new PassThrough()
hungWorker.stderr = new PassThrough()
let workerKilled = false
hungWorker.kill = signal => {
  workerKilled = signal === 'SIGKILL'
  return true
}
await assert.rejects(
  captureIsolatedPreflightScreenshot({
    report: hungWorkerReport,
    wsEndpoint: 'ws://127.0.0.1:9420',
    screenshotPath: evidencePath,
    screenshotTimeoutMs: 10,
    timeoutMs: 10,
    spawnProcess: () => hungWorker
  }),
  error => error.code === 'preflight_screenshot_timeout' && error.preflight_step === 'screenshot'
)
assert.equal(hungWorkerReport.checks.rpc_steps.screenshot.status, 'timed_out')
assert.equal(workerKilled, true, 'timed-out screenshot must SIGKILL only the disposable worker')

let screenshotDisconnects = 0
let mainScreenshotCalls = 0
const isolatedRuntimeReport = report()
await captureRuntimeEvidence({
  report: isolatedRuntimeReport,
  wsEndpoint: 'ws://127.0.0.1:9420',
  screenshotPath: evidencePath,
  wxRequestUrl: 'http://127.0.0.1/health',
  rpcTimeoutMs: 10,
  disconnectTimeoutMs: 10,
  connect: async () => ({
    currentPage: async () => ({ path: '/pages/home/index', data: async () => ({ ready: true }) }),
    screenshot: async () => {
      mainScreenshotCalls += 1
    },
    disconnect: async () => {
      screenshotDisconnects += 1
    }
  }),
  probeRequest: async () => ({ passed: true, cleanup: { passed: true }, statusCode: 200 }),
  screenshotCapture: async ({ screenshotPath: target }) => {
    fs.writeFileSync(target, pngFixture)
    return { status: 'passed', path: target, bytes: pngFixture.length }
  }
})
assert.equal(mainScreenshotCalls, 0, 'preflight must never invoke screenshot on its main Automator connection')
assert.equal(screenshotDisconnects, 1, 'main connection must disconnect before isolated screenshot capture')
assert.equal(isolatedRuntimeReport.checks.screenshot.capture_mode, 'isolated_worker')

let evaluateDisconnects = 0
const hungEvaluateReport = report()
try {
  await assert.rejects(
    captureRuntimeEvidence({
      report: hungEvaluateReport,
      wsEndpoint: 'ws://127.0.0.1:9420',
      screenshotPath: evidencePath,
      wxRequestUrl: 'http://127.0.0.1/health',
      rpcTimeoutMs: 10,
      disconnectTimeoutMs: 10,
      connect: async () => ({
        currentPage: async () => ({
          path: '/pages/home/index',
          data: async () => ({ ready: true })
        }),
        screenshot: async ({ path: target }) => fs.writeFileSync(target, 'synthetic'),
        evaluate: never,
        disconnect: async () => {
          evaluateDisconnects += 1
        }
      })
    }),
    error =>
      error.code === 'preflight_transport_timeout' && error.preflight_step === 'wx_request_start'
  )
  assert.equal(hungEvaluateReport.checks.rpc_steps.wx_request_start.status, 'timed_out')
  assert.equal(evaluateDisconnects, 1, 'timed-out evaluate must not leak an automator session')
} finally {
  fs.rmSync(evidencePath, { force: true })
}

const boundedOverall = await runQaPreflight({
  projectPath: expectedProjectPath,
  screenshotPath: evidencePath,
  preflightTimeoutMs: 10,
  runtimeInspector: verifiedRuntime,
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: never
})
assert.equal(boundedOverall.status, 'failed_environment')
assert.equal(boundedOverall.failures[0].code, 'preflight_transport_timeout')
assert.equal(boundedOverall.checks.rpc_steps.overall_capture.status, 'timed_out')

let isolatedCaptureEndpoint = ''
const isolatedPortReport = await runQaPreflight({
  projectPath: expectedProjectPath,
  wsPort: 9421,
  screenshotPath: evidencePath,
  runtime: { ...verifiedRuntime(), automator_port: 9421 },
  runtimeInspector: () => ({ ...verifiedRuntime(), automator_port: 9421 }),
  lanFlowProbe: () => true,
  portProbe: async port => port === 9421,
  runtimeCapture: async options => {
    isolatedCaptureEndpoint = options.wsEndpoint
  }
})
assert.equal(isolatedPortReport.status, 'passed')
assert.equal(isolatedPortReport.checks.ws.port, 9421)
assert.equal(isolatedCaptureEndpoint, 'ws://127.0.0.1:9421')
