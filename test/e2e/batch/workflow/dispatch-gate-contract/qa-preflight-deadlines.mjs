import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { captureRuntimeEvidence } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight-runtime.mjs'
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

let screenshotDisconnects = 0
const hungScreenshotReport = report()
await assert.rejects(
  captureRuntimeEvidence({
    report: hungScreenshotReport,
    wsEndpoint: 'ws://127.0.0.1:9420',
    screenshotPath: evidencePath,
    wxRequestUrl: 'http://127.0.0.1/health',
    rpcTimeoutMs: 10,
    disconnectTimeoutMs: 10,
    connect: async () => ({
      currentPage: async () => ({ path: '/pages/home/index', data: async () => ({ ready: true }) }),
      screenshot: never,
      disconnect: async () => {
        screenshotDisconnects += 1
      }
    })
  }),
  error => error.code === 'preflight_screenshot_timeout' && error.preflight_step === 'screenshot'
)
assert.equal(hungScreenshotReport.checks.rpc_steps.screenshot.status, 'timed_out')
assert.equal(screenshotDisconnects, 1, 'timed-out screenshot must not leak an automator session')

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
