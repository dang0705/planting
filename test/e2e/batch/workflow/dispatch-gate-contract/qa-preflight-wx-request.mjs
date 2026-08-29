import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { captureRuntimeEvidence } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight-runtime.mjs'
import { probeWxRequest } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight.mjs'
import {
  forbiddenFormalRuntimeArgs,
  resolveQaWxRequestUrl
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-run.mjs'
import { resolveQaBackendTarget } from '../../../../../scripts/qa/qa-backend-target.mjs'

assert.deepEqual(forbiddenFormalRuntimeArgs(['--wx-request-url=http://example.test']), [
  '--wx-request-url'
])
assert.deepEqual(forbiddenFormalRuntimeArgs(['--catalog-id=x', '--allow-live']), [])

assert.deepEqual(resolveQaWxRequestUrl('http://example.test/health', {}), {
  url: 'http://example.test/health',
  source: 'cli'
})
assert.deepEqual(
  resolveQaWxRequestUrl('', { CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP: '192.168.50.80' }),
  {
    url: 'http://192.168.50.80:3011/plant-user-http/user-plants?page=1&pageSize=1',
    source: 'derived_local_lan_health'
  }
)
assert.deepEqual(
  resolveQaWxRequestUrl(
    'http://attacker.invalid/plant-user-http/user-plants?page=1',
    {
      QA_WX_REQUEST_URL: 'http://attacker.invalid/health',
      CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP: '192.168.50.80'
    },
    { formal: true }
  ),
  {
    url: 'http://192.168.50.80:3011/plant-user-http/user-plants?page=1&pageSize=1',
    source: 'supervisor_fixed_lan'
  }
)
assert.deepEqual(
  resolveQaWxRequestUrl(
    '',
    {
      QA_BACKEND_MODE: 'online',
      QA_ONLINE_API_BASE_URL:
        'https://cloud1-2grufevs395a9d5e.api.tcloudbasegateway.com/v1/functions'
    },
    { formal: true }
  ),
  {
    url: 'https://cloud1-2grufevs395a9d5e.api.tcloudbasegateway.com/v1/functions/plant-user-http/user-plants?page=1&pageSize=1&webfn=true',
    source: 'supervisor_fixed_online'
  }
)
assert.throws(
  () =>
    resolveQaBackendTarget({
      QA_BACKEND_MODE: 'online',
      QA_ONLINE_API_BASE_URL: 'http://127.0.0.1:3011'
    }),
  error => error?.code === 'qa_online_base_url_invalid'
)

const healthUrl = 'http://127.0.0.1:12345/__local_functions__/health'
const successfulSlot = '__dispatchQaWxRequest_test_success'
let successfulCallbacks
const originalWx = globalThis.wx
const originalGetApp = globalThis.getApp
const forbiddenSerializedSyntax = [
  /=>/,
  /\.\.\./,
  /\?\./,
  /\?\?/,
  /function\s*\(\s*\{/,
  /\bconst\b/,
  /\blet\b/
]

function compatibilityMiniProgram(serializedSources) {
  return {
    evaluate: async function (callback) {
      const source = callback.toString()
      serializedSources.push(source)
      for (const pattern of forbiddenSerializedSyntax) {
        assert.doesNotMatch(source, pattern, `serialized evaluate callback must avoid ${pattern}`)
      }
      const args = Array.prototype.slice.call(arguments, 1)
      const serialized = new Function(`return (${source})`)()
      return serialized.apply(null, args)
    }
  }
}

globalThis.wx = {
  cloud: {
    __plantingGetCloudbaseAccessToken: async () => 'platform-access-token',
    callFunction: options => {
      options.success({
        result: {
          openid: 'runtime-openid',
          httpIdentityTicket: 'ignored-legacy-ticket'
        }
      })
    }
  },
  request: callbacks => {
    successfulCallbacks = callbacks
  }
}
globalThis.getApp = () => ({
  globalData: {
    __plantingGetCloudbaseAccessToken: async () => 'platform-access-token'
  }
})
try {
  const serializedSources = []
  const success = await probeWxRequest({
    miniProgram: compatibilityMiniProgram(serializedSources),
    url: healthUrl,
    slot: successfulSlot,
    timeoutMs: 1000,
    pollIntervalMs: 10,
    sleep: async () => {
      successfulCallbacks.success({ statusCode: 204 })
      successfulCallbacks.complete()
    }
  })
  assert.equal(success.passed, true)
  assert.equal(success.statusCode, 204)
  assert.equal(success.cleanup.passed, true)
  assert.equal(globalThis[successfulSlot], undefined, 'success path must clean the slot')
  assert.equal(serializedSources.length >= 4, true, 'start, poll, and cleanup must serialize')

  const authenticatedSlot = '__dispatchQaWxRequest_test_authenticated'
  let authenticatedRequest
  globalThis.wx.request = options => {
    authenticatedRequest = options
    successfulCallbacks = options
  }
  const authenticated = await probeWxRequest({
    miniProgram: compatibilityMiniProgram([]),
    url: 'http://127.0.0.1:3011/plant-user-http/user-plants?page=1&pageSize=1',
    requireAuthenticatedIdentity: true,
    slot: authenticatedSlot,
    timeoutMs: 1000,
    pollIntervalMs: 10,
    sleep: async () => {
      authenticatedRequest.success({ statusCode: 200, data: { code: 200 } })
      authenticatedRequest.complete()
    }
  })
  assert.equal(authenticated.passed, true)
  assert.equal(authenticated.identity_required, true)
  assert.equal(authenticated.identity_resolved, true)
  assert.equal(authenticated.access_token_resolved, true)
  assert.equal(authenticated.identity_ticket_resolved, true)
  assert.deepEqual(authenticatedRequest.header, {
    Authorization: 'Bearer platform-access-token',
    'x-planting-http-identity-ticket': 'ignored-legacy-ticket'
  })

  const rejectedSlot = '__dispatchQaWxRequest_test_rejected_status'
  const rejected = await probeWxRequest({
    miniProgram: compatibilityMiniProgram([]),
    url: healthUrl,
    slot: rejectedSlot,
    timeoutMs: 1000,
    pollIntervalMs: 10,
    sleep: async () => {
      successfulCallbacks.success({ statusCode: 503 })
      successfulCallbacks.complete()
    }
  })
  assert.equal(rejected.passed, false)
  assert.equal(rejected.statusCode, 503)
  assert.equal(rejected.cleanup.passed, true)
  assert.equal(globalThis[rejectedSlot], undefined, 'rejected-status path must clean the slot')

  const timeoutSlot = '__dispatchQaWxRequest_test_timeout'
  let timeoutClock = 0
  let timeoutEvaluateCalls = 0
  const timeout = await probeWxRequest({
    miniProgram: {
      evaluate: async function (callback) {
        timeoutEvaluateCalls += 1
        if (timeoutEvaluateCalls > 1 && timeoutEvaluateCalls < 6) {
          return null
        }
        return callback.apply(null, Array.prototype.slice.call(arguments, 1))
      }
    },
    url: healthUrl,
    slot: timeoutSlot,
    timeoutMs: 40,
    pollIntervalMs: 10,
    nowMs: () => timeoutClock,
    sleep: async delay => {
      timeoutClock += delay
    }
  })
  assert.equal(timeout.passed, false)
  assert.equal(timeout.timed_out, true)
  assert.equal(timeout.cleanup.passed, true)
  assert.equal(globalThis[timeoutSlot], undefined, 'timeout/null path must clean the slot')
} finally {
  if (originalWx === undefined) {
    delete globalThis.wx
  } else {
    globalThis.wx = originalWx
  }
  if (originalGetApp === undefined) {
    delete globalThis.getApp
  } else {
    globalThis.getApp = originalGetApp
  }
}

const routeEvidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-preflight-route-'))
try {
  const routeEvents = []
  let currentPage = {
    path: 'subpackages/care/watering-advisor/watering-advisor',
    data: async () => ({ stale: true })
  }
  const miniProgram = {
    reLaunch: async route => {
      routeEvents.push(route)
      currentPage = {
        path: 'pages/index/index',
        data: async () => ({ ready: true })
      }
    },
    currentPage: async () => currentPage,
    disconnect: async () => {
      routeEvents.push('disconnect')
    }
  }
  const report = { checks: { ws: {}, rpc_steps: {} }, evidence_paths: [] }
  const captured = await captureRuntimeEvidence({
    report,
    wsEndpoint: 'ws://127.0.0.1:9421',
    screenshotPath: path.join(routeEvidenceRoot, 'preflight.png'),
    wxRequestUrl: 'http://127.0.0.1:3011/health',
    initialRoute: '/pages/index/index',
    connect: async () => miniProgram,
    probeRequest: async () => ({
      passed: true,
      statusCode: 200,
      cleanup: { attempted: true, passed: true }
    }),
    screenshotCapture: async ({ screenshotPath }) => {
      fs.writeFileSync(screenshotPath, Buffer.from('synthetic-png-evidence'))
    }
  })
  assert.equal(captured.page_data.passed, true)
  assert.equal(report.pagePath, 'pages/index/index')
  assert.deepEqual(routeEvents, ['/pages/index/index', 'disconnect'])
  assert.equal(report.checks.rpc_steps.initial_route_reset.status, 'passed')
} finally {
  fs.rmSync(routeEvidenceRoot, { recursive: true, force: true })
}

const alreadyReadyEvidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-preflight-route-ready-'))
try {
  let relaunchCalls = 0
  const miniProgram = {
    reLaunch: async () => {
      relaunchCalls += 1
    },
    currentPage: async () => ({
      path: 'pages/index/index',
      data: async () => ({ ready: true })
    }),
    disconnect: async () => {}
  }
  const report = { checks: { ws: {}, rpc_steps: {} }, evidence_paths: [] }
  await captureRuntimeEvidence({
    report,
    wsEndpoint: 'ws://127.0.0.1:9421',
    screenshotPath: path.join(alreadyReadyEvidenceRoot, 'preflight.png'),
    wxRequestUrl: 'http://127.0.0.1:3011/health',
    initialRoute: '/pages/index/index',
    connect: async () => miniProgram,
    probeRequest: async () => ({
      passed: true,
      statusCode: 200,
      cleanup: { attempted: true, passed: true }
    }),
    screenshotCapture: async ({ screenshotPath }) => {
      fs.writeFileSync(screenshotPath, Buffer.from('synthetic-png-evidence'))
    }
  })
  assert.equal(relaunchCalls, 0, 'ready initial page must not trigger a redundant reLaunch')
  assert.equal(
    report.checks.rpc_steps.initial_route_reset.code,
    'preflight_initial_route_already_ready'
  )
} finally {
  fs.rmSync(alreadyReadyEvidenceRoot, { recursive: true, force: true })
}

console.log('QA preflight wx.request and initial-route contract passed')
