import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { readCatalog } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/catalog.mjs'
import { runQaPreflight } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight.mjs'
import { captureRuntimeEvidence } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight-runtime.mjs'
import { createQaRunCommands } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-run.mjs'
import { runRendererScreenshotProbe } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/renderer-screenshot-probe.mjs'
import { acquireQaRunLease, qaRunLeaseArgs } from '../../../../../scripts/qa/qa-run-lease.mjs'
import {
  captureIsolatedRendererScreenshot,
  rendererScreenshotUnreadyError
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/renderer-screenshot-readiness.mjs'
import { repoRoot } from './helpers.mjs'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const root = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'renderer-readiness-contract-'))
const screenshotPath = path.join(root, 'evidence', 'renderer.png')
const projectPath = path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
const TEST_AUTOMATOR_PORT = 65431

function report() {
  return { checks: { ws: { passed: false } }, evidence_paths: [] }
}

function runtime() {
  return {
    status: 'verified',
    project_identity_verified: true,
    observed_project_path: projectPath,
    main_devtools_pid: 97269,
    automator_port: TEST_AUTOMATOR_PORT,
    automator_listener_pids: [97310],
    control_port: 28434,
    control_port_verified: true,
    session_log_evidence: { status: 'bootstrap_verified', session_id: 'renderer-session' }
  }
}

function worker() {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.signals = []
  child.kill = signal => {
    child.signals.push(signal)
    return true
  }
  return child
}

function terminal(status, extra = {}) {
  return JSON.stringify({ type: 'renderer_screenshot_worker_result', status, ...extra })
}

function readyIsolatedSession({ projectPath, screenshotPath: targetPath, wxRequestUrl }) {
  return {
    status: 'ready',
    runtime_evidence: {
      owner: { main_devtools_pid: 97269, automator_port: TEST_AUTOMATOR_PORT },
      configuration: { projectPath, wsPort: TEST_AUTOMATOR_PORT, controlPort: 3799 },
      shared_target: { passed: true },
      launched: true
    },
    preflight_options: {
      projectPath,
      wsPort: TEST_AUTOMATOR_PORT,
      wsEndpoint: `ws://127.0.0.1:${TEST_AUTOMATOR_PORT}`,
      screenshotPath: targetPath,
      wxRequestUrl
    }
  }
}

try {
  const events = []
  const coreResult = await runRendererScreenshotProbe({
    wsEndpoint: `ws://127.0.0.1:${TEST_AUTOMATOR_PORT}`,
    outputPath: screenshotPath,
    timeoutMs: 2500,
    emitEvent: event => events.push(event),
    connect: async () => ({
      screenshot: async ({ path: target }) => fs.writeFileSync(target, png),
      disconnect: () => undefined
    })
  })
  assert.equal(coreResult.status, 'passed')
  assert.equal(coreResult.renderer_ready, true)
  assert.equal(coreResult.command.method, 'App.captureScreenshot')
  assert.equal(coreResult.command.response, 'received')
  assert.ok(events.some(event => event.phase === 'command_started'))

  fs.writeFileSync(screenshotPath, 'not-a-png')
  const invalidResult = await runRendererScreenshotProbe({
    wsEndpoint: `ws://127.0.0.1:${TEST_AUTOMATOR_PORT}`,
    outputPath: screenshotPath,
    timeoutMs: 2500,
    connect: async () => ({
      screenshot: async () => undefined,
      disconnect: () => undefined
    })
  })
  assert.equal(invalidResult.status, 'failed')
  assert.equal(invalidResult.renderer_ready, false)

  const successfulWorker = worker()
  const successfulReport = report()
  fs.writeFileSync(screenshotPath, png)
  const successfulCapture = captureIsolatedRendererScreenshot({
    report: successfulReport,
    wsEndpoint: `ws://127.0.0.1:${TEST_AUTOMATOR_PORT}`,
    screenshotPath,
    timeoutMs: 25,
    runtime: runtime(),
    spawnProcess: () => successfulWorker
  })
  successfulWorker.stdout.write(
    `${JSON.stringify({
      type: 'renderer_screenshot_worker_event',
      phase: 'command_started',
      command: 'App.captureScreenshot',
      command_started_at: '2026-08-05T00:00:00.000Z'
    })}\n`
  )
  successfulWorker.stdout.end(
    `${terminal('passed', {
      renderer_ready: true,
      path: screenshotPath,
      bytes: png.length,
      command: {
        method: 'App.captureScreenshot',
        started_at: '2026-08-05T00:00:00.000Z',
        response: 'received'
      }
    })}\n`
  )
  await successfulCapture
  assert.equal(successfulReport.checks.renderer_screenshot.status, 'passed')
  assert.equal(successfulReport.checks.renderer_screenshot.target_runtime.main_devtools_pid, 97269)
  assert.equal(successfulReport.checks.renderer_screenshot.target_runtime.control_port, 28434)

  const noResponseWorker = worker()
  const noResponseReport = report()
  const noResponse = captureIsolatedRendererScreenshot({
    report: noResponseReport,
    wsEndpoint: `ws://127.0.0.1:${TEST_AUTOMATOR_PORT}`,
    screenshotPath,
    timeoutMs: 20,
    maxAttempts: 1,
    runtime: runtime(),
    spawnProcess: () => noResponseWorker
  })
  noResponseWorker.stdout.write(
    `${JSON.stringify({
      type: 'renderer_screenshot_worker_event',
      phase: 'command_started',
      command: 'App.captureScreenshot',
      command_started_at: '2026-08-05T00:00:00.000Z'
    })}\n`
  )
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(noResponse, error => error.code === 'renderer_screenshot_unready')
  assert.equal(
    noResponseReport.checks.renderer_screenshot.reason,
    'renderer_screenshot_no_response'
  )
  assert.equal(noResponseReport.checks.renderer_screenshot.command.response, 'not_received')
  assert.doesNotThrow(() => JSON.stringify(noResponseReport.checks.renderer_screenshot))
  assert.ok(noResponseWorker.signals.includes('SIGKILL'))

  let mainScreenshotCalls = 0
  const rpcReadyReport = report()
  rpcReadyReport.devtools_runtime = runtime()
  await assert.rejects(
    captureRuntimeEvidence({
      report: rpcReadyReport,
      wsEndpoint: `ws://127.0.0.1:${TEST_AUTOMATOR_PORT}`,
      screenshotPath,
      wxRequestUrl: 'http://127.0.0.1/health',
      rpcTimeoutMs: 20,
      disconnectTimeoutMs: 20,
      connect: async () => ({
        currentPage: async () => ({
          path: '/pages/index/index',
          data: async () => ({ ready: true })
        }),
        evaluate: async () => ({ state: 'completed', ok: true, statusCode: 200 }),
        screenshot: async () => {
          mainScreenshotCalls += 1
        },
        disconnect: async () => undefined
      }),
      probeRequest: async () => ({ passed: true, cleanup: { passed: true }, statusCode: 200 }),
      screenshotCapture: async () => {
        throw rendererScreenshotUnreadyError({
          status: 'timed_out',
          code: 'renderer_screenshot_unready',
          message: 'renderer screenshot is not ready: no response',
          command: { method: 'App.captureScreenshot', response: 'not_received' }
        })
      }
    }),
    error => error.code === 'renderer_screenshot_unready'
  )
  assert.equal(rpcReadyReport.checks.page_data.passed, true)
  assert.equal(rpcReadyReport.checks.wx_request.passed, true)
  assert.equal(mainScreenshotCalls, 0)

  const preflight = await runQaPreflight({
    projectPath,
    screenshotPath,
    wxRequestUrl: 'http://127.0.0.1/health',
    runtimeInspector: runtime,
    lanFlowProbe: () => true,
    portProbe: async () => true,
    runtimeCapture: async options => {
      options.report.checks.appservice_rpc = { passed: true }
      throw rendererScreenshotUnreadyError({
        status: 'timed_out',
        code: 'renderer_screenshot_unready',
        message: 'renderer screenshot is not ready: no response',
        command: { method: 'App.captureScreenshot', response: 'not_received' }
      })
    }
  })
  assert.equal(preflight.status, 'failed_environment')
  assert.equal(preflight.failures[0].code, 'renderer_screenshot_unready')
  assert.equal(preflight.targeted_restart.attempted, false)
  assert.equal(preflight.renderer_recovery.attempted, false)

  const catalogEntry = readCatalog().entries.find(entry => entry.data_mode === 'fixture_diagnostic')
  const catalogId = catalogEntry.id
  const dispatchRunId = `renderer-screenshot-unready-${Date.now()}`
  const executionId = `renderer-proof-${Date.now()}`
  const runLease = acquireQaRunLease({
    dispatchRunId,
    kind: 'automator',
    runInstanceId: `renderer-proof-instance-${Date.now()}`
  })
  const args = [
    '--allow-live',
    '--catalog-id',
    catalogId,
    '--execution-id',
    executionId,
    '--dispatch-run-id',
    dispatchRunId,
    '--execution-timeout-ms',
    '1000',
    ...qaRunLeaseArgs(runLease)
  ]
  const emitted = []
  let leafCalls = 0
  const commands = createQaRunCommands({
    args,
    argValue: name => {
      const inline = args.find(arg => arg.startsWith(`--${name}=`))
      if (inline) {
        return inline.slice(name.length + 3)
      }
      const index = args.indexOf(`--${name}`)
      return index >= 0 ? args[index + 1] : ''
    },
    hasFlag: flag => args.includes(`--${flag}`),
    emit: (value, code = 0) => {
      emitted.push({ value, code })
      return code
    },
    runtimeFactory: async input => readyIsolatedSession(input),
    runtimeCleanup: () => ({ status: 'terminated', code: 'test_owned_runtime_terminated' }),
    catalogValidator: () => ({ status: 'passed', errors: [] }),
    bundleFingerprint: () => ({
      hash: catalogEntry.script_sha256,
      files: [catalogEntry.leaf_script ?? catalogEntry.script]
    }),
    preflightRunner: async input => {
      assert.equal(input.wsPort, TEST_AUTOMATOR_PORT)
      assert.equal(input.wsEndpoint, `ws://127.0.0.1:${TEST_AUTOMATOR_PORT}`)
      return preflight
    },
    leafRunner: async () => {
      leafCalls += 1
      throw new Error('renderer screenshot failure must not start a leaf')
    }
  })
  try {
    await commands.qaRun()
  } finally {
    runLease.release()
  }
  const recordPath = path.join(
    repoRoot,
    '.tmp',
    'dispatch-task',
    dispatchRunId,
    'qa-runs',
    runLease.run_instance_id,
    `${executionId}.json`
  )
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  assert.equal(emitted.at(-1).value.status, 'failed_environment')
  assert.equal(leafCalls, 0)
  assert.equal(record.live_attempt, 0)
  assert.equal(record.live_attempt_consumed, false)
  assert.equal(record.terminal_reason, 'renderer_screenshot_unready')
  fs.rmSync(path.join(repoRoot, '.tmp', 'dispatch-task', dispatchRunId), {
    recursive: true,
    force: true
  })
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
