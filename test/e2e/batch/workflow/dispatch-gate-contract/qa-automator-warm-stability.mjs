import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  AUTOMATOR_WARM_CATALOG_IDS,
  AUTOMATOR_WARM_PREFLIGHT_BUDGET_MS,
  AUTOMATOR_WARM_RUN_TARGET,
  classifyWarmLeafOutcome,
  evaluateWarmQaRun,
  parseWarmStabilityArgs,
  runAutomatorWarmStability
} from '../../../../../scripts/qa/automator-warm-stability.mjs'

assert.equal(AUTOMATOR_WARM_RUN_TARGET, 5)
assert.equal(AUTOMATOR_WARM_PREFLIGHT_BUDGET_MS, 15_000)
assert.equal(AUTOMATOR_WARM_CATALOG_IDS.length, 5)
assert.deepEqual(
  parseWarmStabilityArgs([
    '--allow-live',
    '--dispatch-run-id=warm-contract-001',
    '--execution-prefix=warm-contract'
  ]),
  {
    allowLive: true,
    catalogIds: [...AUTOMATOR_WARM_CATALOG_IDS],
    dispatchRunId: 'warm-contract-001',
    executionPrefix: 'warm-contract',
    outputDirectory: path.resolve(
      process.cwd(),
      '.tmp/dispatch-task/warm-contract-001/qa-artifacts/automator-warm-stability'
    ),
    infrastructureOnly: false
  }
)
assert.throws(() => parseWarmStabilityArgs(['--dispatch-run-id=warm-contract-001']))
assert.throws(() =>
  parseWarmStabilityArgs([
    '--allow-live',
    '--dispatch-run-id=warm-contract-001',
    '--execution-prefix=warm-contract',
    '--catalog-ids=a,b,c,d'
  ])
)
assert.deepEqual(
  parseWarmStabilityArgs([
    '--allow-live',
    '--infra-only',
    '--dispatch-run-id=warm-infra-contract-001',
    '--execution-prefix=warm-infra-contract'
  ]).infrastructureOnly,
  true
)
assert.throws(() =>
  parseWarmStabilityArgs([
    '--allow-live',
    '--dispatch-run-id=warm-contract-001',
    '--execution-prefix=warm-contract',
    '--catalog-ids=diagnosis.yellowing.no_image_quick,diagnosis.pest.visual_mode_retake,care.air_exchange.v1,care.watering.transpiration_v3.independent_advice,care.watering.transpiration_v3.user_plant_planner'
  ])
)
assert.throws(() =>
  parseWarmStabilityArgs([
    '--allow-live',
    '--dispatch-run-id=warm-contract-001',
    '--execution-prefix=warm-contract',
    '--output-dir=/tmp/out'
  ])
)

const expectedIdentity = {
  runtimeKey: 'a'.repeat(32),
  generation: 7,
  supervisorPid: 101,
  devtoolsPid: 202,
  localRuntimePid: 303,
  processStartIdentity: 'warm-start-1',
  sessionId: 'warm-session-1',
  projectPath: '/Users/jay/.planting/automator-qa/v3/runtimes/a/mp-weixin',
  profile:
    '/Users/jay/.planting/qa-devtools-home/Library/Application Support/微信开发者工具/profile',
  automatorPort: 9421,
  controlPort: 9422
}

function statusReport(overrides = {}) {
  return {
    status: 'running',
    code: 'qa_runtime_running',
    supervisor_state: {
      runtime_key: expectedIdentity.runtimeKey,
      generation: expectedIdentity.generation,
      pid: expectedIdentity.supervisorPid,
      devtools_pid: expectedIdentity.devtoolsPid,
      local_runtime_pid: expectedIdentity.localRuntimePid,
      process_start_identity: expectedIdentity.processStartIdentity,
      session_id: expectedIdentity.sessionId,
      project_path: expectedIdentity.projectPath,
      profile: expectedIdentity.profile,
      automator_port: expectedIdentity.automatorPort,
      control_port: expectedIdentity.controlPort
    },
    ...overrides
  }
}

function passedRecord(overrides = {}) {
  return {
    status: 'passed',
    catalog_id: AUTOMATOR_WARM_CATALOG_IDS[0],
    data_mode: 'automator_live_real_api',
    auth_mode: 'persisted_real_wechat',
    mutation_policy: 'read_only',
    transitions: [
      { phase: 'launching', at: '2026-08-13T00:00:00.000Z' },
      { phase: 'preflight_passed', at: '2026-08-13T00:00:05.000Z' }
    ],
    preflight: {
      status: 'passed',
      checks: {
        project_identity: { passed: true },
        page_data: { passed: true },
        wx_request: { passed: true, identity_required: true, identity_resolved: true },
        screenshot: { passed: true },
        renderer_screenshot_attempts: [{ attempt: 1, status: 'passed' }]
      }
    },
    runtime_evidence: {
      project_identity_verified: true,
      projectPath: expectedIdentity.projectPath,
      observed_project_path: expectedIdentity.projectPath
    },
    ...overrides
  }
}

const baseline = statusReport()
const passed = evaluateWarmQaRun({
  record: passedRecord(),
  before: baseline,
  after: baseline,
  expectedIdentity
})
assert.equal(passed.passed, true)
assert.equal(passed.preflightDurationMs, 5_000)

const blockedFixtureRecord = passedRecord({
  status: 'failed_environment',
  leaf_report: {
    failure_kind: 'failed_environment',
    report: {
      status: 'failed',
      classification: 'BLOCKED_FIXTURE',
      blockerReason: 'fixture-only blocker'
    }
  }
})
const blockedFixture = evaluateWarmQaRun({
  record: blockedFixtureRecord,
  before: baseline,
  after: baseline,
  expectedIdentity,
  recordCommandStatus: 2
})
assert.equal(classifyWarmLeafOutcome(blockedFixtureRecord).status, 'business_blocked')
assert.equal(blockedFixture.passed, true)
assert.equal(blockedFixture.business_outcome.status, 'business_blocked')
assert.equal(blockedFixture.business_outcome.business_status, 'blocked_fixture')

const transportFailure = evaluateWarmQaRun({
  record: passedRecord({
    status: 'failed_environment',
    leaf_report: {
      failure_kind: 'failed_environment',
      report: { status: 'failed', classification: 'FAILED_ENVIRONMENT' }
    }
  }),
  before: baseline,
  after: baseline,
  expectedIdentity,
  recordCommandStatus: 1
})
assert.equal(transportFailure.passed, false)
assert.equal(transportFailure.business_outcome.status, 'infrastructure_failed')

const watchdogAfterPreflight = evaluateWarmQaRun({
  record: passedRecord({
    status: 'aborted',
    leaf_lifecycle: { status: 'aborted', terminal_reason: 'watchdog_timeout' }
  }),
  before: baseline,
  after: baseline,
  expectedIdentity,
  recordCommandStatus: 1
})
assert.equal(watchdogAfterPreflight.passed, true)
assert.equal(watchdogAfterPreflight.business_outcome.status, 'business_aborted')
assert.equal(
  watchdogAfterPreflight.business_outcome.business_status,
  'watchdog_timeout_after_preflight'
)

const changedGeneration = evaluateWarmQaRun({
  record: passedRecord(),
  before: baseline,
  after: statusReport({ supervisor_state: { ...baseline.supervisor_state, generation: 8 } }),
  expectedIdentity
})
assert.equal(changedGeneration.passed, false)
assert.ok(changedGeneration.failures.some(item => item.code === 'qa_warm_runtime_identity_changed'))

const slow = evaluateWarmQaRun({
  record: passedRecord({
    transitions: [
      { phase: 'launching', at: '2026-08-13T00:00:00.000Z' },
      { phase: 'preflight_passed', at: '2026-08-13T00:00:16.000Z' }
    ]
  }),
  before: baseline,
  after: baseline,
  expectedIdentity
})
assert.equal(slow.passed, false)
assert.ok(
  slow.failures.some(item => item.code === 'qa_warm_preflight_budget_exceeded_or_unmeasured')
)

const outputDirectory = path.resolve(
  process.cwd(),
  '.tmp/dispatch-task/warm-contract-runner/qa-artifacts/automator-warm-stability'
)
const calls = []
const fakeRunner = (command, args) => {
  calls.push([path.basename(command), ...args])
  if (command.endsWith('automator-runtime.mjs') && args[0] === 'bootstrap') {
    return { status: 0, value: { status: 'ready', supervisor: baseline.supervisor_state } }
  }
  if (command.endsWith('automator-runtime.mjs') && args[0] === 'stop') {
    return { status: 0, value: { status: 'ready', code: 'qa_runtime_stopped' } }
  }
  if (command.endsWith('automator-runtime.mjs')) {
    return { status: 0, value: baseline }
  }
  const qaRunIndex = calls.filter(item => item[0] === 'cli.mjs' && item[1] === 'qa-run').length
  return {
    status: 0,
    value: passedRecord({ catalog_id: AUTOMATOR_WARM_CATALOG_IDS[qaRunIndex] })
  }
}
const run = await runAutomatorWarmStability({
  dispatchRunId: 'warm-contract-runner',
  executionPrefix: 'warm-contract-run',
  catalogIds: [...AUTOMATOR_WARM_CATALOG_IDS],
  outputDirectory,
  commandRunner: fakeRunner
})
assert.equal(run.status, 'passed')
assert.equal(run.completed_runs, 5)
assert.equal(
  calls.filter(item => item[0] === 'automator-runtime.mjs' && item[1] === 'bootstrap').length,
  1
)
assert.equal(
  calls.filter(item => item[0] === 'automator-runtime.mjs' && item[1] === 'status').length,
  11
)
assert.equal(calls.filter(item => item[0] === 'cli.mjs' && item[1] === 'qa-run').length, 5)
assert.equal(
  calls.filter(item => item[0] === 'automator-runtime.mjs' && item[1] === 'stop').length,
  1
)
for (const call of calls.filter(item => item[0] === 'cli.mjs')) {
  assert.ok(call.includes('--allow-live'))
  assert.ok(!call.some(value => /project|port|ws|pid/u.test(value) && value.startsWith('--')))
}
assert.ok(fs.existsSync(path.join(run.output_directory, 'warm-report.json')))

const fixtureOutputDirectory = path.resolve(
  process.cwd(),
  '.tmp/dispatch-task/warm-contract-fixture/qa-artifacts/automator-warm-stability'
)
const fixtureCalls = []
const fixtureRunner = (command, args) => {
  fixtureCalls.push([path.basename(command), ...args])
  if (command.endsWith('automator-runtime.mjs') && args[0] === 'bootstrap') {
    return { status: 0, value: { status: 'ready', supervisor: baseline.supervisor_state } }
  }
  if (command.endsWith('automator-runtime.mjs') && args[0] === 'stop') {
    return { status: 0, value: { status: 'ready', code: 'qa_runtime_stopped' } }
  }
  if (command.endsWith('automator-runtime.mjs')) {
    return { status: 0, value: baseline }
  }
  const qaRunIndex = fixtureCalls.filter(
    item => item[0] === 'cli.mjs' && item[1] === 'qa-run'
  ).length
  if (qaRunIndex === 4) {
    return { status: 2, value: blockedFixtureRecord }
  }
  return {
    status: 0,
    value: passedRecord({ catalog_id: AUTOMATOR_WARM_CATALOG_IDS[qaRunIndex - 1] })
  }
}
const fixtureRun = await runAutomatorWarmStability({
  dispatchRunId: 'warm-contract-fixture',
  executionPrefix: 'warm-contract-fixture-run',
  catalogIds: [...AUTOMATOR_WARM_CATALOG_IDS],
  outputDirectory: fixtureOutputDirectory,
  commandRunner: fixtureRunner
})
assert.equal(fixtureRun.status, 'passed')
assert.equal(fixtureRun.completed_runs, 5)
assert.equal(fixtureRun.runs[3].business_status, 'blocked_fixture')
assert.equal(fixtureCalls.filter(item => item[0] === 'cli.mjs' && item[1] === 'qa-run').length, 5)
assert.deepEqual(fixtureRun.business_outcomes[3], {
  catalog_id: AUTOMATOR_WARM_CATALOG_IDS[3],
  status: 'blocked_fixture',
  classification: 'BLOCKED_FIXTURE',
  reason: 'fixture-only blocker'
})
fs.rmSync(path.resolve(process.cwd(), '.tmp/dispatch-task/warm-contract-runner'), {
  recursive: true,
  force: true
})
fs.rmSync(path.resolve(process.cwd(), '.tmp/dispatch-task/warm-contract-fixture'), {
  recursive: true,
  force: true
})

const infrastructureOutputDirectory = path.resolve(
  process.cwd(),
  '.tmp/dispatch-task/warm-contract-infrastructure/qa-artifacts/automator-warm-stability'
)
const infrastructureScreenshot = path.join(infrastructureOutputDirectory, 'doctor.png')
fs.mkdirSync(infrastructureOutputDirectory, { recursive: true })
fs.writeFileSync(
  infrastructureScreenshot,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )
)
const infrastructureCalls = []
const infrastructureDoctor = {
  status: 'ready',
  code: 'qa_runtime_doctor_ready',
  supervisor_state: baseline.supervisor_state,
  checks: {
    profile: { passed: true },
    channel: { passed: true },
    ownership: { passed: true },
    manifest: { passed: true },
    lan: { passed: true },
    preflight: {
      status: 'passed',
      checks: {
        project_identity: { passed: true },
        page_data: { passed: true },
        wx_request: { passed: true, identity_required: true, identity_resolved: true },
        screenshot: { passed: true, path: infrastructureScreenshot },
        renderer_screenshot_attempts: [{ attempt: 1, status: 'passed' }]
      }
    }
  }
}
const infrastructureRunner = (command, args) => {
  infrastructureCalls.push([path.basename(command), ...args])
  if (command.endsWith('automator-runtime.mjs') && args[0] === 'bootstrap') {
    return { status: 0, value: { status: 'ready', supervisor: baseline.supervisor_state } }
  }
  if (command.endsWith('automator-runtime.mjs') && args[0] === 'stop') {
    return { status: 0, value: { status: 'ready', code: 'qa_runtime_stopped' } }
  }
  if (command.endsWith('automator-runtime.mjs') && args[0] === 'doctor') {
    return { status: 0, value: infrastructureDoctor }
  }
  return { status: 0, value: baseline }
}
const infrastructureRun = await runAutomatorWarmStability({
  dispatchRunId: 'warm-contract-infrastructure',
  executionPrefix: 'warm-contract-infrastructure-run',
  infrastructureOnly: true,
  outputDirectory: infrastructureOutputDirectory,
  commandRunner: infrastructureRunner
})
assert.equal(infrastructureRun.status, 'passed')
assert.equal(infrastructureRun.completed_runs, 5)
assert.equal(infrastructureRun.business_assertions_reached, false)
assert.equal(
  infrastructureCalls.filter(item => item[0] === 'cli.mjs' && item[1] === 'qa-run').length,
  0
)
assert.equal(
  infrastructureCalls.filter(item => item[0] === 'automator-runtime.mjs' && item[1] === 'doctor')
    .length,
  5
)
fs.rmSync(path.resolve(process.cwd(), '.tmp/dispatch-task/warm-contract-infrastructure'), {
  recursive: true,
  force: true
})

console.log('Automator warm stability contract passed')
