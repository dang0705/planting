import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  AUTOMATOR_LIVE_REPEAT_COUNT,
  evaluateLeaf,
  parseLiveMatrixArgs,
  readLiveCatalogEntries,
  readLiveCatalogIds,
  runLiveMatrix
} from '../../../../../scripts/qa/automator-live-matrix.mjs'

const ZERO_INDEX = 0
const ONE_INDEX = 1
const IDENTITY_WIDTH = 32
const BOOTSTRAP_CALL = 'bootstrap'
const STOP_CALL = 'stop'
const AUTOMATOR_RUNTIME = 'automator-runtime.mjs'
const CLI = 'cli.mjs'

const liveIds = readLiveCatalogIds()
assert.ok(liveIds.length > 0)
assert.deepEqual(
  parseLiveMatrixArgs([
    '--allow-live',
    '--dispatch-run-id=live-matrix-contract-001',
    '--execution-prefix=live-matrix-contract'
  ]),
  {
    allowLive: true,
    catalogIds: liveIds,
    dispatchRunId: 'live-matrix-contract-001',
    executionPrefix: 'live-matrix-contract',
    outputDirectory: path.resolve(
      process.cwd(),
      '.tmp/dispatch-task/live-matrix-contract-001/qa-artifacts/automator-live-matrix'
    )
  }
)
assert.throws(() =>
  parseLiveMatrixArgs([
    '--dispatch-run-id=live-matrix-contract-001',
    '--execution-prefix=live-matrix-contract'
  ])
)
assert.throws(() =>
  parseLiveMatrixArgs([
    '--allow-live',
    '--dispatch-run-id=live-matrix-contract-001',
    '--execution-prefix=live-matrix-contract',
    `--catalog-ids=${liveIds.slice(ZERO_INDEX, -ONE_INDEX).join(',')}`
  ])
)
assert.throws(() =>
  parseLiveMatrixArgs([
    '--allow-live',
    '--dispatch-run-id=live-matrix-contract-001',
    '--execution-prefix=live-matrix-contract',
    `--catalog-ids=${[...liveIds, 'diagnosis.pest.visual_mode_retake'].join(',')}`
  ])
)

const outputDirectory = path.resolve(
  process.cwd(),
  '.tmp/dispatch-task/live-matrix-contract-runner/qa-artifacts/automator-live-matrix'
)
const calls = []
const identity = {
  runtime_key: 'a'.repeat(IDENTITY_WIDTH),
  generation: 12,
  pid: 101,
  devtools_pid: 202,
  local_runtime_pid: 303,
  project_path: '/Users/jay/.planting/automator-qa/v3/runtimes/a/mp-weixin',
  profile:
    '/Users/jay/.planting/qa-devtools-home/Library/Application Support/微信开发者工具/profile'
}
const expectedIdentity = {
  runtimeKey: identity.runtime_key,
  generation: identity.generation,
  supervisorPid: identity.pid,
  devtoolsPid: identity.devtools_pid,
  localRuntimePid: identity.local_runtime_pid,
  projectPath: identity.project_path,
  profile: identity.profile
}
const status = () => ({ status: 'running', code: 'qa_runtime_running', supervisor_state: identity })
const qaRecord = catalogId => ({
  status: 'passed',
  catalog_id: catalogId,
  data_mode: 'automator_live_real_api',
  auth_mode: 'persisted_real_wechat',
  mutation_policy: 'read_only',
  auth_consumption: {
    event_id: `contract-auth-consumption-${catalogId}`
  },
  auth_consumption_ack: {
    status: 'passed',
    code: 'qa_auth_consumption_ack_received',
    event: {
      event_id: `contract-auth-consumption-${catalogId}`
    }
  },
  runtime_evidence: {
    project_identity_verified: true
  },
  leaf_report: {
    parse_status: 'parsed',
    report_status: 'passed',
    business_assertions_reached: true,
    screenshot_attempts:
      readLiveCatalogEntries().find(entry => entry.id === catalogId).requirements?.screenshot ===
      false
        ? []
        : [{ label: 'contract', attempts: [{ attempt: 1, status: 'passed' }] }],
    assertions: readLiveCatalogEntries()
      .find(entry => entry.id === catalogId)
      .required_assertions.map(name => ({ name, passed: true })),
    raw_report_ref: '.tmp/dispatch-task/live-matrix-contract-runner/qa-runs/fake.leaf-report.json'
  },
  preflight: {
    status: 'passed',
    checks: {
      project_identity: { passed: true },
      page_data: { passed: true },
      wx_request: { passed: true, identity_required: true, identity_resolved: true },
      screenshot: { passed: true },
      renderer_screenshot_attempts: [{ attempt: 1, status: 'passed' }]
    },
    targeted_restart: { attempted: false }
  }
})
const firstCatalogEntry = readLiveCatalogEntries()[ZERO_INDEX]
const businessFailureRecord = qaRecord(firstCatalogEntry.id)
businessFailureRecord.leaf_report = {
  ...businessFailureRecord.leaf_report,
  report_status: 'blocked',
  assertions: businessFailureRecord.leaf_report.assertions.map((assertion, index) =>
    index === ZERO_INDEX ? { ...assertion, passed: false } : assertion
  )
}
const businessFailureEvaluation = evaluateLeaf(businessFailureRecord, status(), status(), {
  ...expectedIdentity,
  catalogId: firstCatalogEntry.id,
  requiredAssertions: firstCatalogEntry.required_assertions,
  requirements: firstCatalogEntry.requirements || {}
})
assert.equal(businessFailureEvaluation.infrastructure.passed, true)
assert.equal(businessFailureEvaluation.business.passed, false)
assert.equal(businessFailureEvaluation.passed, false)
assert.ok(businessFailureEvaluation.business.failures.length > 0)
const businessCommandFailureEvaluation = evaluateLeaf(
  { ...businessFailureRecord, status: 'aborted' },
  status(),
  status(),
  {
    ...expectedIdentity,
    catalogId: firstCatalogEntry.id,
    requiredAssertions: firstCatalogEntry.required_assertions,
    requirements: firstCatalogEntry.requirements || {}
  },
  { qaStatus: 1 }
)
assert.equal(businessCommandFailureEvaluation.infrastructure.passed, true)
assert.equal(businessCommandFailureEvaluation.business.passed, false)
const createFakeRunner = (callLog, { failBusinessOnce = false } = {}) => {
  let businessFailureInjected = false
  return (command, args) => {
    callLog.push([path.basename(command), ...args])
    if (command.endsWith(AUTOMATOR_RUNTIME) && args[ZERO_INDEX] === BOOTSTRAP_CALL) {
      return { status: 0, value: { status: 'ready', supervisor_state: identity } }
    }
    if (command.endsWith(AUTOMATOR_RUNTIME) && args[ZERO_INDEX] === STOP_CALL) {
      return { status: 0, value: { status: 'ready', code: 'qa_runtime_stopped' } }
    }
    if (command.endsWith(AUTOMATOR_RUNTIME)) {
      return { status: 0, value: status() }
    }
    const qaRunIndex = callLog.filter(item => item[0] === CLI && item[1] === 'qa-run').length - 1
    const catalogId = liveIds[Math.floor(qaRunIndex / AUTOMATOR_LIVE_REPEAT_COUNT)]
    const value = qaRecord(catalogId)
    if (failBusinessOnce && !businessFailureInjected) {
      businessFailureInjected = true
      value.leaf_report = {
        ...value.leaf_report,
        report_status: 'blocked',
        assertions: value.leaf_report.assertions.map((assertion, index) =>
          index === ZERO_INDEX ? { ...assertion, passed: false } : assertion
        )
      }
    }
    return { status: 0, value }
  }
}
const fakeRunner = createFakeRunner(calls)
const report = await runLiveMatrix({
  dispatchRunId: 'live-matrix-contract-runner',
  executionPrefix: 'live-matrix-contract-run',
  catalogIds: liveIds,
  outputDirectory,
  commandRunner: fakeRunner
})
assert.equal(report.status, 'passed')
assert.equal(report.catalog_precondition.status, 'ready')
assert.equal(report.catalog_precondition.code, 'qa_live_matrix_catalog_ready')
assert.equal(report.repeat_count, AUTOMATOR_LIVE_REPEAT_COUNT)
assert.equal(report.completed_runs, liveIds.length * AUTOMATOR_LIVE_REPEAT_COUNT)
assert.equal(
  calls.filter(item => item[ZERO_INDEX] === CLI && item[ONE_INDEX] === 'qa-run').length,
  liveIds.length * AUTOMATOR_LIVE_REPEAT_COUNT
)
assert.equal(
  calls.filter(item => item[ZERO_INDEX] === AUTOMATOR_RUNTIME && item[ONE_INDEX] === BOOTSTRAP_CALL)
    .length,
  1
)
assert.equal(
  calls.filter(item => item[ZERO_INDEX] === AUTOMATOR_RUNTIME && item[ONE_INDEX] === STOP_CALL)
    .length,
  1
)
for (const call of calls.filter(item => item[ZERO_INDEX] === CLI)) {
  assert.ok(call.includes('--allow-live'))
  if (call[ONE_INDEX] === 'qa-run') {
    assert.ok(call.includes('--allow-targeted-restart'))
  }
  assert.ok(!call.some(value => /project|port|ws|pid/u.test(value) && value.startsWith('--')))
}
assert.ok(fs.existsSync(path.join(report.output_directory, 'live-matrix-report.json')))
fs.rmSync(path.resolve(process.cwd(), '.tmp/dispatch-task/live-matrix-contract-runner'), {
  recursive: true,
  force: true
})

const failureOutputDirectory = path.resolve(
  process.cwd(),
  '.tmp/dispatch-task/live-matrix-contract-business-failure/qa-artifacts/automator-live-matrix'
)
const failureCalls = []
const failureReport = await runLiveMatrix({
  dispatchRunId: 'live-matrix-contract-business-failure',
  executionPrefix: 'live-matrix-contract-business-failure',
  catalogIds: liveIds,
  outputDirectory: failureOutputDirectory,
  commandRunner: createFakeRunner(failureCalls, { failBusinessOnce: true })
})
assert.equal(failureReport.status, 'blocked')
assert.equal(failureReport.catalog_precondition.status, 'ready')
assert.equal(failureReport.infrastructure_status, 'passed')
assert.equal(failureReport.business_status, 'blocked')
assert.equal(failureReport.completed_runs, liveIds.length * AUTOMATOR_LIVE_REPEAT_COUNT)
assert.equal(failureReport.business_failures.length, 1)
assert.equal(
  failureCalls.filter(item => item[ZERO_INDEX] === CLI && item[ONE_INDEX] === 'qa-run').length,
  liveIds.length * AUTOMATOR_LIVE_REPEAT_COUNT
)
fs.rmSync(path.resolve(process.cwd(), '.tmp/dispatch-task/live-matrix-contract-business-failure'), {
  recursive: true,
  force: true
})
