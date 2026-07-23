import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  classifyQaFailure,
  extractLeafReport,
  runQaPreflight
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight.mjs'
import {
  persistLeafReportEvidence,
  recoverStaleQaRuns
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-run.mjs'
import {
  runLeafWithWatchdog,
  withAutomatorPortLock
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-execution.mjs'
import { recoverVerifiedTargetDevTools } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime.mjs'
import {
  canonicalizeLegacyQuotedBaseline,
  parsePorcelainV1Z
} from '../../../../../.codex/skills/dispatch-task/scripts/lib/git-status.mjs'
import {
  cleanupDispatchState,
  parseJson,
  repoRoot,
  resultValidator,
  runCli,
  writeGovernanceHandoff,
  writeJson
} from './helpers.mjs'

const dryRunId = `dispatch-gate-qa-${Date.now()}`
const dry = runCli([
  'qa-run',
  '--catalog-id=care.watering.transpiration_v3.independent_advice',
  `--execution-id=${dryRunId}-dry`,
  `--dispatch-run-id=${dryRunId}`,
  '--dry-run'
])
assert.equal(dry.status, 0, dry.stderr || dry.stdout)
const dryRecord = parseJson(dry)
assert.equal(dryRecord.status, 'passed_dry_run')
assert.equal(dryRecord.frozen_script_sha256, dryRecord.script_sha256)
assert.ok(fs.existsSync(dryRecord.execution_record))

const productBlockedId = `${dryRunId}-product`
const productRecord = path.join('.tmp', 'dispatch-task', productBlockedId, 'qa-runs', 'prior.json')
writeJson(productRecord, {
  status: 'failed_product',
  catalog_id: 'care.watering.transpiration_v3.independent_advice',
  execution_id: 'prior-product-attempt',
  frozen_script_sha256: dryRecord.script_sha256,
  live_attempt: 1,
  started_at: new Date().toISOString()
})
const noProductRetry = runCli([
  'qa-run',
  '--catalog-id=care.watering.transpiration_v3.independent_advice',
  `--execution-id=${productBlockedId}-again`,
  `--dispatch-run-id=${productBlockedId}`,
  '--allow-live'
])
assert.notEqual(noProductRetry.status, 0)
assert.match(
  parseJson(noProductRetry).errors.join('\n'),
  /failed_product_requires_implementation_recovery/
)

const expectedProjectPath = path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
const verifiedRuntime = ({ mainPid = 43100, listenerPid = 43210 } = {}) => ({
  status: 'verified',
  project_identity_verified: true,
  observed_project_path: expectedProjectPath,
  main_devtools_pid: mainPid,
  automation_listener_pid: listenerPid,
  port_owner_pid: listenerPid,
  automator_port: 9420,
  control_port: 3799,
  control_port_source: 'main_devtools_remote_port',
  project_evidence: [expectedProjectPath]
})

let runtimeCaptureCalls = 0
let recoveryCalls = 0
let recoveryInspectionCalls = 0
const recoveredPreflight = await runQaPreflight({
  projectPath: expectedProjectPath,
  observedProjectPath: '/tmp/not-the-target-project',
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-preflight.png'),
  allowTargetedRestart: true,
  runtimeInspector: () => {
    recoveryInspectionCalls += 1
    return verifiedRuntime({ listenerPid: recoveryInspectionCalls === 1 ? 43210 : 43211 })
  },
  recoveryExecutor: ({ projectPath, wsPort, verifiedRuntime: priorRuntime }) => {
    recoveryCalls += 1
    assert.equal(projectPath, expectedProjectPath)
    assert.equal(wsPort, 9420)
    assert.equal(priorRuntime.port_owner_pid, 43210)
    assert.equal(priorRuntime.control_port, 3799)
    return {
      status: 'recovered',
      recovery: 'synthetic_repository_owned_recovery',
      before: priorRuntime,
      invocations: [
        { action: 'close', exit_code: 0 },
        { action: 'open', exit_code: 0 },
        { action: 'auto', exit_code: 0 }
      ]
    }
  },
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async ({ report }) => {
    runtimeCaptureCalls += 1
    if (runtimeCaptureCalls === 1) {
      throw new Error('screenshot RPC failed')
    }
    report.checks.page_data = { passed: true }
    report.checks.screenshot = { passed: true, path: 'synthetic-preflight.png' }
    report.checks.wx_request = { passed: true, result: { ok: true } }
  }
})
assert.equal(recoveredPreflight.status, 'passed')
assert.equal(recoveredPreflight.caller_observed_project_path, 'ignored_untrusted_input')
assert.equal(recoveryCalls, 1)
assert.equal(runtimeCaptureCalls, 2, 'recovery must rerun the complete evidence capture')
assert.equal(recoveredPreflight.targeted_restart.before.port_owner_pid, 43210)
assert.equal(recoveredPreflight.targeted_restart.after.port_owner_pid, 43211)
assert.equal(recoveredPreflight.targeted_restart.after.control_port, 3799)
assert.equal(recoveredPreflight.targeted_restart.post_recovery_probes.screenshot.passed, true)
assert.equal(recoveredPreflight.targeted_restart.post_recovery_probes.wx_request.passed, true)

let falseRecoveryInspectionCalls = 0
const incompleteRecovery = await runQaPreflight({
  projectPath: expectedProjectPath,
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-preflight.png'),
  allowTargetedRestart: true,
  runtimeInspector: () => {
    falseRecoveryInspectionCalls += 1
    return verifiedRuntime({ listenerPid: falseRecoveryInspectionCalls === 1 ? 43212 : 43213 })
  },
  recoveryExecutor: () => ({ status: 'recovered', invocations: [] }),
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async () => {
    throw new Error('screenshot RPC failed')
  }
})
assert.equal(incompleteRecovery.status, 'failed_environment')
assert.equal(incompleteRecovery.failures[0].code, 'devtools_automator_blocker')

let rejectedRecoveryCalls = 0
const wrongProjectPreflight = await runQaPreflight({
  projectPath: expectedProjectPath,
  observedProjectPath: expectedProjectPath,
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-preflight.png'),
  allowTargetedRestart: true,
  runtimeInspector: () => ({
    ...verifiedRuntime(),
    status: 'wrong_project',
    project_identity_verified: false,
    observed_project_path: '/tmp/not-the-target-project',
    project_evidence: ['/tmp/not-the-target-project']
  }),
  recoveryExecutor: () => {
    rejectedRecoveryCalls += 1
    return { status: 'recovered' }
  },
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async () => {
    throw new Error('must not capture an unverified target')
  }
})
assert.equal(wrongProjectPreflight.status, 'failed_environment')
assert.equal(wrongProjectPreflight.failures[0].code, 'project_path_mismatch')
assert.equal(rejectedRecoveryCalls, 0, 'wrong project must never be restarted')

const unknownProjectPreflight = await runQaPreflight({
  projectPath: expectedProjectPath,
  observedProjectPath: expectedProjectPath,
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-preflight.png'),
  allowTargetedRestart: true,
  runtimeInspector: () => ({
    status: 'unavailable',
    project_identity_verified: false,
    observed_project_path: 'unavailable',
    port_owner_pid: 'unavailable',
    automator_port: 9420,
    control_port: 9420,
    project_evidence: []
  }),
  recoveryExecutor: () => {
    rejectedRecoveryCalls += 1
    return { status: 'recovered' }
  },
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async () => {
    throw new Error('must not capture an unverified target')
  }
})
assert.equal(unknownProjectPreflight.status, 'failed_environment')
assert.equal(unknownProjectPreflight.failures[0].code, 'project_identity_unverified')
assert.equal(rejectedRecoveryCalls, 0, 'unknown target must never be restarted')

const wxRequestEnvironmentFailure = await runQaPreflight({
  projectPath: expectedProjectPath,
  screenshotPath: path.join(repoRoot, '.tmp', 'dispatch-task', 'synthetic-preflight.png'),
  runtimeInspector: verifiedRuntime,
  lanFlowProbe: () => true,
  portProbe: async () => true,
  runtimeCapture: async () => {
    throw new Error('wx.request preflight timed out after 10000ms')
  }
})
assert.equal(wxRequestEnvironmentFailure.status, 'failed_environment')
assert.equal(wxRequestEnvironmentFailure.failures[0].code, 'runtime_preflight_failed')

const directUnverifiedRecovery = await recoverVerifiedTargetDevTools({
  projectPath: expectedProjectPath,
  verifiedRuntime: { status: 'wrong_project', project_identity_verified: false },
  commandRunner: () => {
    throw new Error('unverified recovery must never invoke a process')
  }
})
assert.equal(directUnverifiedRecovery.status, 'failed_environment')
assert.equal(directUnverifiedRecovery.code, 'devtools_automator_blocker')
assert.equal(directUnverifiedRecovery.reason, 'target_project_runtime_not_safely_preverified')

const unsafeMarker = path.join(repoRoot, '.tmp', 'dispatch-task', `unsafe-restart-${Date.now()}`)
const unsafeRestart = runCli([
  'qa-run',
  '--catalog-id=care.watering.transpiration_v3.independent_advice',
  `--execution-id=${dryRunId}-unsafe`,
  `--dispatch-run-id=${dryRunId}`,
  '--dry-run',
  `--targeted-restart-command=touch ${unsafeMarker}`
])
assert.notEqual(unsafeRestart.status, 0)
assert.match(
  parseJson(unsafeRestart).errors.join('\n'),
  /caller-supplied targeted restart commands are forbidden/
)
assert.equal(fs.existsSync(unsafeMarker), false, 'caller shell text must never execute')

function syntheticChild(pid = 24680) {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.killSignals = []
  child.kill = signal => child.killSignals.push(signal)
  return child
}

const signalSource = new EventEmitter()
const interruptedChild = syntheticChild()
const interruptedTerminal = []
const interrupted = runLeafWithWatchdog({
  script: 'synthetic-leaf.mjs',
  timeoutMs: 1000,
  terminateGraceMs: 0,
  signalSource,
  spawnChild: () => interruptedChild,
  onTerminal: terminal => interruptedTerminal.push(terminal)
})
signalSource.emit('SIGTERM')
const interruptedResult = await interrupted
assert.equal(interruptedResult.status, 'aborted')
assert.equal(interruptedTerminal[0].terminal_reason, 'parent_sigterm')
assert.deepEqual(interruptedChild.killSignals, ['SIGTERM', 'SIGKILL'])

const errorChild = syntheticChild(24681)
const scriptFailure = await runLeafWithWatchdog({
  script: 'synthetic-leaf.mjs',
  timeoutMs: 1000,
  terminateGraceMs: 0,
  signalSource: new EventEmitter(),
  spawnChild: () => {
    queueMicrotask(() => errorChild.emit('error', new Error('synthetic execution error')))
    return errorChild
  }
})
assert.equal(scriptFailure.status, 'failed_script')
assert.match(scriptFailure.terminal_reason, /synthetic execution error/)

const liveLockPath = path.join(repoRoot, '.tmp', 'dispatch-task', `live-lock-${Date.now()}.lock`)
fs.mkdirSync(path.dirname(liveLockPath), { recursive: true })
fs.writeFileSync(liveLockPath, JSON.stringify({ pid: process.pid }))
fs.utimesSync(liveLockPath, new Date(0), new Date(0))
await assert.rejects(
  withAutomatorPortLock(async () => {}, { lockPath: liveLockPath, timeoutMs: 5, staleMs: 0 }),
  /automator 9420 lock timeout/
)
assert.equal(
  fs.existsSync(liveLockPath),
  true,
  'stale recovery must preserve a lock owned by a live PID'
)
fs.unlinkSync(liveLockPath)

const liveQaRunId = `${dryRunId}-live-owner`
const liveQaRecordPath = path.join('.tmp', 'dispatch-task', liveQaRunId, 'qa-runs', 'live.json')
writeJson(liveQaRecordPath, {
  status: 'running',
  execution_id: 'live-owner-record',
  started_at: new Date(0).toISOString(),
  runner_pid: process.pid
})
const staleRecovery = recoverStaleQaRuns(liveQaRunId, 0)
assert.deepEqual(staleRecovery.recovered, [])
assert.deepEqual(staleRecovery.skipped_live, ['live-owner-record'])
assert.equal(JSON.parse(fs.readFileSync(liveQaRecordPath, 'utf8')).status, 'running')
assert.equal(
  classifyQaFailure({ exitCode: 1, stdout: 'product_blocker assertion failed' }),
  'failed_product'
)
assert.equal(classifyQaFailure({ exitCode: 1, stderr: 'Cannot find module' }), 'failed_script')
assert.equal(classifyQaFailure({ exitCode: null }), 'aborted')

const structuredProductReport = extractLeafReport({
  stdout: JSON.stringify({
    status: 'failed',
    assertions: [{ name: 'care-result', passed: false, detail: 'expected healthy result' }]
  })
})
assert.equal(structuredProductReport.parse_status, 'parsed')
assert.equal(
  classifyQaFailure({ exitCode: 1, leafReport: structuredProductReport }),
  'failed_product'
)
const structuredEnvironmentReport = extractLeafReport({
  stdout: JSON.stringify({ status: 'failed', failures: [{ code: 'screenshot_rpc_timeout' }] })
})
assert.equal(
  classifyQaFailure({ exitCode: 1, leafReport: structuredEnvironmentReport }),
  'failed_environment'
)
const malformedStructuredReport = extractLeafReport({ stdout: '{"status":"failed",' })
assert.equal(malformedStructuredReport.parse_status, 'malformed')
assert.equal(
  classifyQaFailure({ exitCode: 1, leafReport: malformedStructuredReport }),
  'failed_script'
)
const leafReportRecord = path.join(
  repoRoot,
  '.tmp',
  'dispatch-task',
  `leaf-report-contract-${Date.now()}.json`
)
const persistedLeafReport = persistLeafReportEvidence(leafReportRecord, {
  stdout: JSON.stringify({
    status: 'failed',
    assertions: [{ name: 'care-result', passed: false }]
  }),
  stderr: ''
})
const persistedLeafPath = path.join(repoRoot, persistedLeafReport.raw_report_ref)
assert.equal(persistedLeafReport.failure_kind, 'failed_product')
assert.equal(JSON.parse(fs.readFileSync(persistedLeafPath, 'utf8')).report.status, 'failed')
fs.unlinkSync(persistedLeafPath)

const preexistingQuotedPath = '.codex/skills/dispatch-task/examples/普通代码任务-handoff.json'
const malformedQuotedPath =
  '".codex/skills/dispatch-task/examples//346/231/256/351/200/232/344/273/243/347/240/201/344/273/273/345/212/241-handoff.json"'
const quotedRawPath =
  '".codex/skills/dispatch-task/examples/\\346\\231\\256\\351\\200\\232\\344\\273\\243\\347\\240\\201\\344\\273\\273\\345\\212\\241-handoff.json"'
const parsedUtf8Status = parsePorcelainV1Z(Buffer.from(` M ${preexistingQuotedPath}\0`, 'utf8'))
assert.deepEqual(parsedUtf8Status, [
  { status: ' M', path: preexistingQuotedPath, raw_path: preexistingQuotedPath }
])
assert.deepEqual(parsePorcelainV1Z(Buffer.from('R  test/new.mjs\0test/original.mjs\0', 'utf8')), [
  {
    status: 'R ',
    path: 'test/new.mjs',
    raw_path: 'test/new.mjs',
    original_path: 'test/original.mjs'
  },
  {
    status: 'R ',
    path: 'test/original.mjs',
    raw_path: 'test/original.mjs',
    renamed_or_copied_from: true
  }
])
const quotedRepair = canonicalizeLegacyQuotedBaseline(
  {
    captured_at: '2026-07-21T08:07:11.067Z',
    status_files: [malformedQuotedPath],
    status_entries: [{ status: ' M', path: malformedQuotedPath, raw_path: quotedRawPath }],
    dirty_file_fingerprints: [
      { path: malformedQuotedPath, exists: false, is_file: false, worktree_sha256: null }
    ]
  },
  {
    currentStatusEntries: parsedUtf8Status,
    getMtimeMs: () => Date.parse('2026-07-19T20:57:46+08:00'),
    getFingerprint: file => ({
      path: file,
      exists: true,
      is_file: true,
      worktree_sha256: 'synthetic'
    })
  }
)
assert.deepEqual(quotedRepair.errors, [])
assert.deepEqual(quotedRepair.baseline.status_files, [preexistingQuotedPath])
assert.equal(quotedRepair.baseline.status_entries[0].legacy_raw_path, quotedRawPath)
assert.equal(quotedRepair.canonicalizations[0].path, preexistingQuotedPath)
const unsafeQuotedRepair = canonicalizeLegacyQuotedBaseline(
  {
    captured_at: '2026-07-21T08:07:11.067Z',
    status_files: [malformedQuotedPath],
    status_entries: [{ status: ' M', path: malformedQuotedPath, raw_path: quotedRawPath }],
    dirty_file_fingerprints: []
  },
  {
    currentStatusEntries: parsedUtf8Status,
    getMtimeMs: () => Date.parse('2026-07-22T08:07:11.068Z')
  }
)
assert.match(unsafeQuotedRepair.errors[0], /cannot safely canonicalize/)
assert.deepEqual(unsafeQuotedRepair.baseline.status_files, [malformedQuotedPath])

const governanceRun = `dispatch-gate-result-${Date.now()}`
const { file: governanceHandoff } = writeGovernanceHandoff(governanceRun)
const governanceResult = path.join('.tmp', 'dispatch-task', `${governanceRun}-result.json`)
const passedCheck = name => ({
  status: 'passed',
  commands: ['synthetic command'],
  evidence_ref: `synthetic:${name}`,
  reason: ''
})
const validationCheck = name => ({
  result: 'passed',
  commands: ['synthetic command'],
  evidence_ref: `synthetic:${name}`,
  reason: ''
})
writeJson(governanceResult, {
  agent_identity: { agent_type: 'implementer_deep', dispatch_run_id: governanceRun },
  status: 'completed',
  changed_files: ['test/e2e/batch/workflow/dispatch-gate-contract.mjs'],
  implementation_summary: 'synthetic governance evidence',
  project_constraints_verified: true,
  validation_evidence: {
    unit_tests: validationCheck('unit'),
    lint: validationCheck('lint'),
    typecheck: validationCheck('type'),
    build: validationCheck('build'),
    self_check: validationCheck('self')
  },
  migration_inventory: passedCheck('migration'),
  hook_self_test: passedCheck('hook'),
  e2e_catalog_validation: passedCheck('catalog'),
  episode_state_contract: passedCheck('episode'),
  status_card_contract: passedCheck('status'),
  automator_preflight_contract: passedCheck('preflight'),
  known_limitations: [],
  qa_handoff: { actual_commands: ['synthetic command'] },
  deviations_or_blockers: []
})
const governanceValidation = spawnSync(
  process.execPath,
  [resultValidator, 'implementer', governanceHandoff, governanceResult],
  {
    cwd: repoRoot,
    encoding: 'utf8'
  }
)
assert.equal(
  governanceValidation.status,
  0,
  governanceValidation.stderr || governanceValidation.stdout
)

const selfTest = runCli(['hook-self-test'])
assert.equal(selfTest.status, 0, selfTest.stderr || selfTest.stdout)
assert.equal(parseJson(selfTest).hook_capability.status, 'cli_fallback')

cleanupDispatchState(dryRunId)
cleanupDispatchState(productBlockedId)
cleanupDispatchState(liveQaRunId)
cleanupDispatchState(governanceRun)
