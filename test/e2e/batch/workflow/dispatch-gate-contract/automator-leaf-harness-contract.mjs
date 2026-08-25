import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  connectAutomatorTransport,
  connectFormalLeaf,
  clearFormalLeafPrincipal,
  captureFormalScreenshot,
  disconnectFormalLeaf,
  formalAutomatorEndpoint,
  handoffFormalLeafScreenshot,
  installFormalLeafPrincipal,
  resolveFormalLeafPrincipal,
  withDeadline
} from '../../../automator/_shared/formal-leaf-harness.mjs'
import { executionBundleFingerprint } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/execution-bundle.mjs'
import {
  catalogExecutionBundleFingerprint,
  readCatalog
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/catalog.mjs'
import { getCurrentPageWithFallback } from '../../../automator/_shared/page-probe.mjs'

assert.equal(
  formalAutomatorEndpoint({ MINIPROGRAM_AUTOMATOR_WS: 'ws://127.0.0.1:9421' }),
  'ws://127.0.0.1:9421'
)
const fallbackPageProbe = await getCurrentPageWithFallback(
  {
    currentPage: () => new Promise(() => {}),
    pageStack: async () => [{ path: 'pages/index/index' }, { path: 'pages/detail/detail' }]
  },
  { timeoutMs: 20, perRpcTimeoutMs: 5 }
)
assert.equal(fallbackPageProbe.page.path, 'pages/detail/detail')
assert.equal(fallbackPageProbe.source, 'page_stack_fallback')
assert.throws(
  () => formalAutomatorEndpoint({ MINIPROGRAM_AUTOMATOR_WS: 'http://127.0.0.1:9421' }),
  /supervisor-provided Automator endpoint/
)
const calls = []
const mp = { disconnect: async () => calls.push('disconnect') }
const connected = await connectFormalLeaf({
  automator: {
    connect: async ({ wsEndpoint }) => {
      calls.push(wsEndpoint)
      return mp
    }
  },
  wsEndpoint: 'ws://127.0.0.1:9420'
})
assert.notEqual(connected.mp, mp, 'the harness retains a resumable session facade')
assert.deepEqual(calls, ['ws://127.0.0.1:9420'])
const compatibilityProof = {
  project_identity_verified: true,
  control_port_verified: true,
  main_devtools_pid: 901,
  automation_listener_pid: 903,
  automator_port: 9421,
  control_port: 9422,
  observed_project_path: '/tmp/qa-runtime/mp-weixin'
}
const compatibilityCalls = []
const compatibilityTransport = await connectAutomatorTransport(
  {
    connect: async () => {
      compatibilityCalls.push('official')
      throw new Error("Cannot read properties of undefined (reading 'split')")
    },
    launcher: {
      connectTool: async () => {
        compatibilityCalls.push('connectTool')
        return { disconnect: async () => {} }
      }
    }
  },
  'ws://127.0.0.1:9421',
  { runtimeProof: compatibilityProof }
)
assert.equal(compatibilityCalls.join(','), 'official,connectTool')
assert.equal(compatibilityTransport.__qa_transport_mode, 'connectTool_sdkversion_compatibility')
await assert.rejects(
  () =>
    connectAutomatorTransport(
      {
        connect: async () => {
          throw new Error("Cannot read properties of undefined (reading 'split')")
        },
        launcher: { connectTool: async () => ({}) }
      },
      'ws://127.0.0.1:9421'
    ),
  error => error?.code === 'qa_automator_compatibility_proof_missing'
)
await assert.rejects(
  () =>
    connectAutomatorTransport(
      {
        connect: async () => {
          throw new Error('connection refused')
        },
        launcher: { connectTool: async () => ({}) }
      },
      'ws://127.0.0.1:9421',
      { runtimeProof: compatibilityProof }
    ),
  /connection refused/
)
assert.equal((await disconnectFormalLeaf({ mp })).status, 'disconnected')
const reconnectCalls = []
const firstTransport = {
  disconnect: async () => reconnectCalls.push('disconnect:first')
}
const secondTransport = {
  disconnect: async () => reconnectCalls.push('disconnect:second')
}
let outerTransport = firstTransport
const opaqueOuterSession = new Proxy(
  {},
  {
    get(_target, property) {
      const value = outerTransport[property]
      return typeof value === 'function' ? value.bind(outerTransport) : value
    }
  }
)
const handedOff = await handoffFormalLeafScreenshot({
  mp: opaqueOuterSession,
  automator: {
    connect: async () => {
      reconnectCalls.push('connect:second')
      outerTransport = secondTransport
      return secondTransport
    }
  },
  wsEndpoint: 'ws://127.0.0.1:9420',
  outputPath: path.join(os.tmpdir(), 'formal-leaf-handoff-contract.png'),
  captureFormalScreenshot: async () => ({ status: 'passed', validPng: true })
})
assert.notEqual(
  handedOff.mp,
  opaqueOuterSession,
  'opaque client wrappers must receive the freshly reconnected session'
)
assert.equal(typeof handedOff.mp.disconnect, 'function')
assert.deepEqual(reconnectCalls, ['disconnect:first', 'connect:second'])
const stalePrimaryEvents = []
const stalePrimary = await handoffFormalLeafScreenshot({
  mp: {
    disconnect: async () => {
      stalePrimaryEvents.push('primary-disconnect-closed')
      throw new Error('Connection closed, check if wechat web devTools is still running')
    }
  },
  automator: {
    connect: async () => {
      stalePrimaryEvents.push('reconnect-after-closed-primary')
      return { disconnect: async () => {} }
    }
  },
  wsEndpoint: 'ws://127.0.0.1:9420',
  outputPath: path.join(os.tmpdir(), 'formal-leaf-stale-primary-contract.png'),
  captureFormalScreenshot: async () => {
    stalePrimaryEvents.push('screenshot-worker-after-closed-primary')
    return { status: 'passed', validPng: true }
  }
})
assert.deepEqual(stalePrimaryEvents, [
  'primary-disconnect-closed',
  'screenshot-worker-after-closed-primary',
  'reconnect-after-closed-primary'
])
assert.equal(stalePrimary.primary_disconnect.status, 'already_closed_or_failed')
const firstProfile = []
const secondProfile = []
const principal = resolveFormalLeafPrincipal({ E2E_TEST_OPENID: 'e2e_shared_test_user' })
await assert.rejects(
  () =>
    installFormalLeafPrincipal({
      mp: { callWxMethod: async () => {} },
      principal,
      env: { QA_CATALOG_DATA_MODE: 'automator_live_real_api' }
    }),
  error => error?.code === 'formal_live_principal_injection_forbidden'
)
const firstEvidence = await installFormalLeafPrincipal({
  mp: { callWxMethod: async (...args) => firstProfile.push(args) },
  principal,
  env: { QA_CATALOG_DATA_MODE: 'fixture_diagnostic' }
})
const secondEvidence = await installFormalLeafPrincipal({
  mp: { callWxMethod: async (...args) => secondProfile.push(args) },
  principal,
  env: { QA_CATALOG_DATA_MODE: 'fixture_diagnostic' }
})
assert.equal(firstEvidence.principal_source, 'E2E_TEST_OPENID')
assert.equal(firstEvidence.principal_fingerprint, secondEvidence.principal_fingerprint)
assert.ok(!JSON.stringify(firstEvidence).includes('e2e_shared_test_user'))
assert.equal(firstProfile[0][0], 'setStorageSync')
assert.equal(secondProfile[0][0], 'setStorageSync')
assert.notEqual(
  firstProfile,
  secondProfile,
  'each harness session keeps its own mock storage calls'
)
await clearFormalLeafPrincipal({ mp: { callWxMethod: async (...args) => firstProfile.push(args) } })
assert.equal(firstProfile.at(-1)[0], 'removeStorageSync')
assert.equal(secondProfile.length, 1, 'resetting one profile cannot modify another profile storage')
const timerResult = await withDeadline({
  name: 'contract.deadline',
  timeoutMs: 1,
  operation: () => new Promise(() => {})
}).catch(error => error.code)
assert.equal(timerResult, 'automator_operation_timeout')
let lateSignal
let settleLate
const lateSettlements = []
const lateOperation = withDeadline({
  name: 'contract.abort_signal',
  timeoutMs: 1,
  operation: ({ signal }) => {
    lateSignal = signal
    return new Promise(resolve => {
      settleLate = resolve
    })
  },
  onLateSettlement: value => lateSettlements.push(value)
}).catch(error => error.code)
assert.equal(await lateOperation, 'automator_operation_timeout')
assert.equal(lateSignal.aborted, true)
settleLate('late')
await new Promise(resolve => setTimeout(resolve, 0))
assert.deepEqual(lateSettlements, [{ status: 'fulfilled', value: 'late' }])
const worker = ({ exitOnSignal }) => {
  const child = new EventEmitter()
  child.pid = 77123
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.signals = []
  child.kill = signal => {
    child.signals.push(signal)
    if (exitOnSignal) {
      child.emit('exit', null, signal)
    }
  }
  return child
}
const captureWithTimers = ({ exitOnSignal }) => {
  const pendingTimers = []
  const child = worker({ exitOnSignal })
  const result = captureFormalScreenshot({
    wsEndpoint: 'ws://127.0.0.1:9420',
    outputPath: path.join(os.tmpdir(), `formal-leaf-${exitOnSignal ? 'exit' : 'live'}.png`),
    timeoutMs: 1,
    maxAttempts: 1,
    terminateGraceMs: 1,
    killGraceMs: 1,
    spawnProcess: () => child,
    setTimer: callback => {
      pendingTimers.push(callback)
      return pendingTimers.length
    },
    clearTimer: () => {}
  })
  return { child, result, pendingTimers }
}
const terminatingWorker = captureWithTimers({ exitOnSignal: true })
terminatingWorker.pendingTimers.shift()()
const terminatingResult = await terminatingWorker.result
assert.equal(terminatingResult.code, 'screenshot_worker_timeout')
assert.equal(terminatingResult.cleanup.exit_observed, true)
assert.deepEqual(terminatingWorker.child.signals, ['SIGTERM'])
assert.equal(
  terminatingWorker.pendingTimers.length,
  0,
  'synchronous SIGTERM exit must not leave an unowned grace timer behind'
)
const stuckWorker = captureWithTimers({ exitOnSignal: false })
stuckWorker.pendingTimers.shift()()
stuckWorker.pendingTimers.shift()()
stuckWorker.pendingTimers.shift()()
const stuckResult = await stuckWorker.result
assert.equal(stuckResult.status, 'cleanup_failed')
assert.equal(stuckResult.code, 'screenshot_worker_cleanup_failed')
assert.equal(stuckResult.original_code, 'screenshot_worker_timeout')
assert.deepEqual(stuckWorker.child.signals, ['SIGTERM', 'SIGKILL'])
const bundle = executionBundleFingerprint(
  'test/e2e/automator/diagnosis/air-environment-v2-question-packages.mjs'
)
assert.ok(
  bundle.files.includes('test/e2e/automator/diagnosis/_shared/automator-session-boundary.mjs')
)
assert.ok(bundle.files.every(file => !file.includes('node_modules')))
const harnessPath = 'test/e2e/automator/_shared/formal-leaf-harness.mjs'
const splitLeafFiles = [
  'test/e2e/automator/diagnosis/diagnose-yellowing-mcp.mjs',
  'test/e2e/automator/diagnosis/yellowing/dom.mjs',
  'test/e2e/automator/diagnosis/yellowing/option-selection.mjs',
  'test/e2e/automator/diagnosis/yellowing/runner.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake/runtime-core.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake/fixture-requests.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake/fixture-restore.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake/fixture-state.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake/scenario-reset.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake/scenario-retake.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake/scenario-shortcuts.mjs',
  'test/e2e/automator/diagnosis/pest-mode-and-retake/scenario-tabs.mjs'
]
for (const file of splitLeafFiles) {
  assert.ok(
    fs.readFileSync(file, 'utf8').split('\n').length <= 500,
    `${file} must remain within the repository source limit`
  )
}
const yellowBundle = executionBundleFingerprint(
  'test/e2e/automator/diagnosis/diagnose-yellowing-mcp.mjs'
)
assert.deepEqual(
  yellowBundle.files.filter(file => file.includes('/yellowing/')),
  [
    'test/e2e/automator/diagnosis/yellowing/dom.mjs',
    'test/e2e/automator/diagnosis/yellowing/option-selection.mjs',
    'test/e2e/automator/diagnosis/yellowing/runner.mjs'
  ],
  'yellowing leaf must retain its DOM, selection, and scenario modules in its frozen bundle'
)
const pestBundle = executionBundleFingerprint(
  'test/e2e/automator/diagnosis/pest-mode-and-retake.mjs'
)
assert.ok(
  pestBundle.files.some(file => file.endsWith('/scenario-retake.mjs')) &&
    pestBundle.files.some(file => file.endsWith('/fixture-state.mjs')),
  'pest leaf must retain its retake assertions and restore-safe fixture modules in its bundle'
)
const prohibited = [
  /ws:\/\/127\.0\.0\.1:9420/,
  /\bautomator\.connect\s*\(/,
  /(?:miniProgram|mp)\.screenshot\s*\(/,
  /runIsolatedScreenshotWorker\s*\(/,
  /(?:page\.)?data\s*\(/,
  /\$vm\b/
]
for (const entry of readCatalog().entries) {
  const activeBundle = catalogExecutionBundleFingerprint(entry.leaf_script, { entry })
  assert.ok(
    activeBundle.files.includes(harnessPath),
    `${entry.id} must execute through the shared formal leaf harness`
  )
  assert.ok(
    activeBundle.files.some(file => file.endsWith('/screenshot-worker.mjs')),
    `${entry.id} must freeze the isolated screenshot worker in its execution bundle`
  )
  for (const file of activeBundle.files) {
    if (
      file === harnessPath ||
      file.endsWith('/screenshot-worker.mjs') ||
      file.endsWith('/screenshot-stability.mjs')
    ) {
      continue
    }
    const source = fs.readFileSync(file, 'utf8')
    for (const pattern of prohibited) {
      assert.doesNotMatch(
        source,
        pattern,
        `${entry.id} retains prohibited Automator ownership in ${file}`
      )
    }
  }
}
console.log('automator leaf harness contract passed')
