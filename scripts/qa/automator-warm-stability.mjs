#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { evaluateDoctorSample } from './automator-stress.mjs'
import { qaRunLeaseArgs, resolveQaRunLease } from './qa-run-lease.mjs'
import { runQaNodeCommand } from './qa-node-command.mjs'
import {
  AUTOMATOR_V3_SAFE_ID,
  resolveAutomatorV3ArtifactDirectory
} from './automator-v3-run-context.mjs'

export const AUTOMATOR_WARM_RUN_TARGET = 5
export const AUTOMATOR_WARM_PREFLIGHT_BUDGET_MS = 15_000
export const AUTOMATOR_WARM_CATALOG_IDS = Object.freeze([
  'user.review.subpackage_routing',
  'care.air_exchange.v1',
  'care.watering.transpiration_v3.independent_advice',
  'care.watering.transpiration_v3.user_plant_planner',
  'diagnosis.yellowing.no_image_quick'
])

const COMMAND_TIMEOUT_MS = 20 * 60 * 1000
const SAFE_ID = AUTOMATOR_V3_SAFE_ID
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeScript = path.join(repoRoot, 'scripts', 'qa', 'automator-runtime.mjs')
const dispatchGate = path.join(
  repoRoot,
  '.codex',
  'skills',
  'dispatch-task',
  'scripts',
  'dispatch-gate',
  'cli.mjs'
)

function parseJsonOutput(output) {
  const text = String(output || '').trim()
  try {
    return JSON.parse(text)
  } catch {
    const starts = []
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '{') {
        starts.push(index)
      }
    }
    for (let index = starts.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(text.slice(starts[index]))
      } catch {
        // Try an earlier JSON object start when command output includes logs.
      }
    }
    return null
  }
}

function outputDirectoryFor(dispatchRunId, requested, runInstanceId = null) {
  if (runInstanceId) {
    return resolveAutomatorV3ArtifactDirectory(
      dispatchRunId,
      runInstanceId,
      'automator-warm-stability',
      requested
    )
  }
  const defaultDirectory = path.join(
    repoRoot,
    '.tmp',
    'dispatch-task',
    dispatchRunId,
    'qa-artifacts',
    'automator-warm-stability'
  )
  const directory = path.resolve(requested || defaultDirectory)
  const allowedRoot = path.resolve(repoRoot, '.tmp', 'dispatch-task')
  if (directory !== allowedRoot && !directory.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('warm stability output-dir 必须位于 .tmp/dispatch-task 内')
  }
  return directory
}

function assertWarmCatalogIds(catalogIds) {
  if (
    !Array.isArray(catalogIds) ||
    catalogIds.length !== AUTOMATOR_WARM_RUN_TARGET ||
    new Set(catalogIds).size !== catalogIds.length
  ) {
    throw new Error(`warm stability 必须恰好执行 ${AUTOMATOR_WARM_RUN_TARGET} 个不重复叶子`)
  }
  const expected = [...AUTOMATOR_WARM_CATALOG_IDS].sort()
  const observed = [...catalogIds].sort()
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error('warm stability 只能执行固定的 5 个 live catalog 叶子')
  }
}

export function parseWarmStabilityArgs(argv = process.argv.slice(2)) {
  const result = {
    dispatchRunId: `automator-v3-warm-${Date.now()}`,
    executionPrefix: `warm-${Date.now()}-${process.pid}`,
    catalogIds: [...AUTOMATOR_WARM_CATALOG_IDS],
    outputDirectory: null,
    allowLive: false,
    infrastructureOnly: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index])
    if (argument === '--allow-live') {
      result.allowLive = true
      continue
    }
    if (argument === '--infra-only') {
      result.infrastructureOnly = true
      continue
    }
    if (!argument.startsWith('--')) {
      continue
    }
    const [key, inlineValue] = argument.slice(2).split('=', 2)
    const value = inlineValue ?? argv[index + 1]
    if (inlineValue === undefined) {
      index += 1
    }
    if (key === 'dispatch-run-id') {
      result.dispatchRunId = String(value || '')
    }
    if (key === 'execution-prefix') {
      result.executionPrefix = String(value || '')
    }
    if (key === 'catalog-ids') {
      result.catalogIds = String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    }
    if (key === 'output-dir') {
      result.outputDirectory = String(value || '')
    }
    if (key === 'run-instance-id') {
      result.runInstanceId = String(value || '')
    }
    if (key === 'run-lease-token') {
      result.runLeaseToken = String(value || '')
    }
  }
  if (!result.allowLive) {
    throw new Error('warm stability 必须显式提供 --allow-live')
  }
  if (!SAFE_ID.test(result.dispatchRunId) || !SAFE_ID.test(result.executionPrefix)) {
    throw new Error('dispatch-run-id 或 execution-prefix 格式无效')
  }
  if (!result.infrastructureOnly) {
    assertWarmCatalogIds(result.catalogIds)
  }
  if (Boolean(result.runInstanceId) !== Boolean(result.runLeaseToken)) {
    throw new Error('run-instance-id 和 run-lease-token 必须同时提供')
  }
  result.outputDirectory = result.runInstanceId
    ? outputDirectoryFor(result.dispatchRunId, result.outputDirectory, result.runInstanceId)
    : outputDirectoryFor(result.dispatchRunId, result.outputDirectory)
  return result
}

function evaluateWarmInfrastructureRun({ doctor, before, after, expectedIdentity }) {
  const failures = []
  for (const [label, report] of [
    ['before', before],
    ['after', after]
  ]) {
    if (report?.status !== 'running' || report?.code !== 'qa_runtime_running') {
      failures.push({
        code: `qa_warm_infrastructure_${label}_runtime_not_running`,
        status: report?.status || null,
        code_observed: report?.code || null
      })
    }
  }
  const beforeIdentity = supervisorIdentity(before)
  const afterIdentity = supervisorIdentity(after)
  for (const [label, identity] of [
    ['before', beforeIdentity],
    ['after', afterIdentity]
  ]) {
    for (const key of [
      'runtimeKey',
      'generation',
      'supervisorPid',
      'devtoolsPid',
      'localRuntimePid',
      'processStartIdentity',
      'sessionId'
    ]) {
      if (!expectedIdentity[key] || identity[key] !== expectedIdentity[key]) {
        failures.push({
          code: 'qa_warm_infrastructure_runtime_identity_changed',
          phase: label,
          key,
          expected: expectedIdentity[key] || null,
          observed: identity[key] || null
        })
      }
    }
  }
  const doctorResult = evaluateDoctorSample({
    report: doctor?.value,
    expectedIdentity,
    commandStatus: doctor?.status
  })
  failures.push(...doctorResult.failures)
  return {
    passed: failures.length === 0,
    failures,
    before: beforeIdentity,
    after: afterIdentity,
    doctor: doctorResult,
    business_outcome: {
      status: 'not_run',
      infrastructure_safe: failures.length === 0,
      business_status: 'not_run',
      classification: 'INFRASTRUCTURE_ONLY',
      reason: 'business leaf assertions are intentionally excluded'
    }
  }
}

function writeAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, filePath)
}

async function runCommand(command, args, { timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
  const nodeScript = String(command || '').endsWith('.mjs')
  const executable = nodeScript ? process.execPath : command
  const executableArgs = nodeScript ? [command, ...args] : args
  const result = await runQaNodeCommand({
    command: executable,
    args: executableArgs,
    cwd: repoRoot,
    env: { ...process.env, QA_AUTOMATOR_WARM_STABILITY: '1' },
    timeoutMs,
    maxOutputChars: 32 * 1024 * 1024
  })
  return {
    command,
    args,
    status: result.status,
    signal: result.signal,
    timedOut: result.timedOut,
    spawnError: result.spawnError || null,
    stdout: String(result.stdout || '').slice(-20_000),
    stderr: String(result.stderr || '').slice(-20_000),
    value: parseJsonOutput(result.stdout)
  }
}

async function invokeCommand(commandRunner, command, args) {
  try {
    const result = await commandRunner(command, args)
    if (result && typeof result === 'object') {
      return result
    }
    return {
      command,
      args,
      status: null,
      signal: null,
      timedOut: false,
      spawnError: null,
      stdout: '',
      stderr: '',
      value: { status: 'blocked', code: 'qa_warm_command_result_invalid' }
    }
  } catch (error) {
    return {
      command,
      args,
      status: null,
      signal: null,
      timedOut: false,
      spawnError: error?.code || error?.message || null,
      stdout: '',
      stderr: '',
      value: {
        status: 'blocked',
        code: 'qa_warm_command_threw',
        message: error?.message || String(error)
      }
    }
  }
}

export function supervisorIdentity(report) {
  const state = report?.supervisor_state || report?.supervisor || report
  return {
    runtimeKey: state?.runtime_key || null,
    generation: Number(state?.generation || 0) || null,
    supervisorPid: Number(state?.pid || 0) || null,
    devtoolsPid: Number(state?.devtools_pid || 0) || null,
    localRuntimePid: Number(state?.local_runtime_pid || 0) || null,
    processStartIdentity: state?.process_start_identity || null,
    sessionId: state?.session_id || null,
    projectPath: state?.project_path || null,
    profile: state?.profile || null,
    automatorPort: Number(state?.automator_port || 0) || null,
    controlPort: Number(state?.control_port || 0) || null
  }
}

function rawLeafReport(record) {
  const leafReport = record?.leaf_report || {}
  if (leafReport?.report && typeof leafReport.report === 'object') {
    return leafReport.report
  }
  const reference = String(leafReport?.raw_report_ref || '')
  if (!reference) {
    return {}
  }
  const resolved = path.resolve(repoRoot, reference)
  const allowedRoot = path.resolve(repoRoot, '.tmp', 'dispatch-task')
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    return {}
  }
  try {
    const evidence = JSON.parse(fs.readFileSync(resolved, 'utf8'))
    return evidence?.report && typeof evidence.report === 'object' ? evidence.report : {}
  } catch {
    return {}
  }
}

export function classifyWarmLeafOutcome(record = {}) {
  if (record?.status === 'passed') {
    return {
      status: 'passed',
      infrastructure_safe: true,
      business_status: 'passed',
      classification: null,
      reason: null
    }
  }

  const leafReport = record?.leaf_report || {}
  const report = rawLeafReport(record)
  const classification = report?.classification || null
  const failureKind = leafReport?.failure_kind || record?.status || null

  // A real preflight can prove that the runtime plane is healthy even when a
  // business leaf cannot reach its own fixture or has a product assertion
  // failure. Keep that business evidence visible, but do not let it tear down
  // the shared warm generation or masquerade as an infrastructure failure.
  if (classification === 'BLOCKED_FIXTURE') {
    return {
      status: 'business_blocked',
      infrastructure_safe: true,
      business_status: 'blocked_fixture',
      classification,
      reason: report?.blockerReason || null
    }
  }
  if (failureKind === 'failed_product' || classification === 'FAILED_PRODUCT') {
    return {
      status: 'business_failed',
      infrastructure_safe: true,
      business_status: 'failed_product',
      classification: classification || failureKind,
      reason: null
    }
  }
  if (
    record?.status === 'aborted' &&
    record?.leaf_lifecycle?.terminal_reason === 'watchdog_timeout' &&
    record?.preflight?.status === 'passed'
  ) {
    return {
      status: 'business_aborted',
      infrastructure_safe: true,
      business_status: 'watchdog_timeout_after_preflight',
      classification: 'ABORTED_AFTER_PREFLIGHT',
      reason: 'business leaf watchdog timeout after infrastructure preflight passed'
    }
  }

  return {
    status: 'infrastructure_failed',
    infrastructure_safe: false,
    business_status: null,
    classification: classification || failureKind,
    reason: null
  }
}

function phaseTimestamp(record, phase) {
  const transition = (record?.transitions || []).find(item => item.phase === phase)
  return transition?.at ? Date.parse(transition.at) : NaN
}

export function evaluateWarmQaRun({
  record,
  before,
  after,
  expectedIdentity = null,
  recordCommandStatus = 0,
  beforeCommandStatus = 0,
  afterCommandStatus = 0
} = {}) {
  const failures = []
  const businessOutcome = classifyWarmLeafOutcome(record)
  if (beforeCommandStatus !== 0) {
    failures.push({
      code: 'qa_warm_before_status_command_failed',
      status: beforeCommandStatus
    })
  }
  if (afterCommandStatus !== 0) {
    failures.push({ code: 'qa_warm_after_status_command_failed', status: afterCommandStatus })
  }
  if (recordCommandStatus !== 0 && !businessOutcome.infrastructure_safe) {
    failures.push({
      code: 'qa_warm_leaf_command_failed',
      status: recordCommandStatus,
      business_outcome: businessOutcome
    })
  }
  if (before?.status !== 'running') {
    failures.push({ code: 'qa_warm_before_status_not_running', status: before?.status || null })
  }
  if (before?.code !== 'qa_runtime_running') {
    failures.push({
      code: 'qa_warm_before_runtime_code_invalid',
      code_observed: before?.code || null
    })
  }
  if (after?.status !== 'running') {
    failures.push({ code: 'qa_warm_after_status_not_running', status: after?.status || null })
  }
  if (after?.code !== 'qa_runtime_running') {
    failures.push({
      code: 'qa_warm_after_runtime_code_invalid',
      code_observed: after?.code || null
    })
  }
  const beforeIdentity = supervisorIdentity(before)
  const afterIdentity = supervisorIdentity(after)
  const evidence = record?.runtime_evidence || {}
  const expected = expectedIdentity || {
    runtimeKey: beforeIdentity.runtimeKey,
    generation: beforeIdentity.generation,
    supervisorPid: beforeIdentity.supervisorPid,
    devtoolsPid: beforeIdentity.devtoolsPid,
    localRuntimePid: beforeIdentity.localRuntimePid,
    processStartIdentity: beforeIdentity.processStartIdentity,
    sessionId: beforeIdentity.sessionId,
    projectPath: beforeIdentity.projectPath,
    profile: beforeIdentity.profile,
    automatorPort: 9421,
    controlPort: 9422
  }
  for (const [name, identity] of [
    ['before', beforeIdentity],
    ['after', afterIdentity]
  ]) {
    for (const key of [
      'runtimeKey',
      'generation',
      'supervisorPid',
      'devtoolsPid',
      'localRuntimePid',
      'processStartIdentity',
      'sessionId'
    ]) {
      if (!expected[key] || identity[key] !== expected[key]) {
        failures.push({
          code: 'qa_warm_runtime_identity_changed',
          phase: name,
          key,
          expected: expected[key] || null,
          observed: identity[key] || null
        })
      }
    }
  }
  for (const key of Object.keys(expected)) {
    if (
      ['runtimeKey', 'generation', 'supervisorPid', 'devtoolsPid', 'localRuntimePid'].includes(key)
    ) {
      continue
    }
    if (!expected[key] || afterIdentity[key] !== expected[key]) {
      failures.push({
        code: 'qa_warm_runtime_identity_changed',
        key,
        expected: expected[key] || null,
        observed: afterIdentity[key] || null
      })
    }
  }
  if (!businessOutcome.infrastructure_safe) {
    failures.push({
      code: 'qa_warm_leaf_outcome_not_infrastructure_safe',
      status: record?.status,
      business_outcome: businessOutcome
    })
  }
  if (record?.data_mode !== 'automator_live_real_api') {
    failures.push({ code: 'qa_warm_data_mode_invalid', observed: record?.data_mode || null })
  }
  if (record?.auth_mode !== 'persisted_real_wechat') {
    failures.push({ code: 'qa_warm_auth_mode_invalid', observed: record?.auth_mode || null })
  }
  if (!['read_only', 'self_reverting', 'test_owned_persistent'].includes(record?.mutation_policy)) {
    failures.push({
      code: 'qa_warm_mutation_policy_invalid',
      observed: record?.mutation_policy || null
    })
  }
  if (!record?.preflight || record.preflight.status !== 'passed') {
    failures.push({ code: 'qa_warm_preflight_not_passed' })
  }
  for (const [name, check] of Object.entries({
    project_identity: record?.preflight?.checks?.project_identity,
    page_data: record?.preflight?.checks?.page_data,
    wx_request: record?.preflight?.checks?.wx_request,
    screenshot: record?.preflight?.checks?.screenshot
  })) {
    if (check?.passed !== true) {
      failures.push({ code: `qa_warm_${name}_not_proven`, check })
    }
  }
  const screenshotAttempts =
    record?.preflight?.checks?.renderer_screenshot_attempts ||
    record?.preflight?.checks?.rpc_steps?.screenshot_attempts ||
    record?.preflight?.checks?.screenshot?.attempts ||
    null
  if (
    !Array.isArray(screenshotAttempts) ||
    screenshotAttempts.length !== 1 ||
    screenshotAttempts[0]?.attempt !== 1 ||
    screenshotAttempts[0]?.status !== 'passed'
  ) {
    failures.push({
      code: 'qa_warm_first_screenshot_attempt_not_proven',
      attempts: screenshotAttempts
    })
  }
  const wxRequest = record?.preflight?.checks?.wx_request
  if (wxRequest?.identity_required !== true || wxRequest?.identity_resolved !== true) {
    failures.push({ code: 'qa_warm_wx_request_identity_not_proven', check: wxRequest || null })
  }
  if (evidence.project_identity_verified !== true) {
    failures.push({ code: 'qa_warm_project_identity_not_proven' })
  }
  if (
    path.resolve(String(evidence.projectPath || evidence.observed_project_path || '')) !==
    path.resolve(String(expected.projectPath))
  ) {
    failures.push({ code: 'qa_warm_project_path_mismatch' })
  }
  if (
    record?.full_lan_rebuild_requested === true ||
    record?.fixture_runtime_recovery?.required === true ||
    record?.runtime_evidence?.full_lan_rebuild_requested === true
  ) {
    failures.push({ code: 'qa_warm_rebuild_or_fixture_recovery_used' })
  }
  if (record?.preflight?.targeted_restart?.attempted === true) {
    failures.push({ code: 'qa_warm_targeted_restart_used' })
  }
  if (record?.runtime_evidence?.bootstrap_preflight?.targeted_restart?.attempted === true) {
    failures.push({ code: 'qa_warm_bootstrap_targeted_restart_used' })
  }
  if (
    before?.supervisor_state?.bootstrap_preflight?.targeted_restart?.attempted === true ||
    after?.supervisor_state?.bootstrap_preflight?.targeted_restart?.attempted === true
  ) {
    failures.push({ code: 'qa_warm_supervisor_bootstrap_targeted_restart_used' })
  }
  const launchingAt = phaseTimestamp(record, 'launching')
  const preflightAt = phaseTimestamp(record, 'preflight_passed')
  const preflightDurationMs =
    Number.isFinite(launchingAt) && Number.isFinite(preflightAt) ? preflightAt - launchingAt : null
  if (preflightDurationMs === null || preflightDurationMs > AUTOMATOR_WARM_PREFLIGHT_BUDGET_MS) {
    failures.push({
      code: 'qa_warm_preflight_budget_exceeded_or_unmeasured',
      duration_ms: preflightDurationMs,
      budget_ms: AUTOMATOR_WARM_PREFLIGHT_BUDGET_MS
    })
  }
  return {
    passed: failures.length === 0,
    failures,
    business_outcome: businessOutcome,
    preflightDurationMs,
    before: beforeIdentity,
    after: afterIdentity,
    evidence
  }
}

export async function runAutomatorInfrastructureWarmStabilityWithLease({
  dispatchRunId,
  executionPrefix,
  outputDirectory,
  commandRunner = runCommand,
  runLease
} = {}) {
  if (!SAFE_ID.test(String(dispatchRunId || '')) || !SAFE_ID.test(String(executionPrefix || ''))) {
    throw new Error('dispatch-run-id 或 execution-prefix 格式无效')
  }
  const directory = outputDirectoryFor(
    dispatchRunId,
    runLease.owned ? null : outputDirectory,
    runLease.run_instance_id
  )
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const report = {
    status: 'running',
    contract:
      'one supervisor generation -> five doctor runs -> no business leaf -> preflight + first PNG + real wx.request',
    execution_mode: 'infrastructure_only_diagnostic',
    dispatch_run_id: dispatchRunId,
    run_instance_id: runLease.run_instance_id,
    execution_prefix: executionPrefix,
    output_directory: directory,
    runs: [],
    business_assertions_reached: false,
    business_outcomes: []
  }
  const leaseArgs = qaRunLeaseArgs(runLease)
  writeAtomic(path.join(directory, 'warm-state.json'), report)

  const cleanupRuntime = async () => {
    const cleanup = await invokeCommand(commandRunner, runtimeScript, [
      'stop',
      '--json',
      ...leaseArgs
    ])
    const passed =
      cleanup.status === 0 &&
      cleanup.value?.status === 'ready' &&
      cleanup.value?.code === 'qa_runtime_stopped'
    if (!passed) {
      report.cleanup_failure = {
        code: cleanup.value?.code || 'qa_warm_cleanup_failed',
        cleanup
      }
    }
    return passed
  }

  const finishBlocked = async primaryFailure => {
    report.status = 'blocked'
    report.primary_failure = primaryFailure
    await cleanupRuntime()
    writeAtomic(path.join(directory, 'warm-report.json'), report)
    return report
  }

  const bootstrap = await invokeCommand(commandRunner, runtimeScript, [
    'bootstrap',
    '--json',
    ...leaseArgs
  ])
  if (bootstrap.status !== 0 || bootstrap.value?.status !== 'ready') {
    return finishBlocked({ code: 'qa_warm_bootstrap_blocked', bootstrap })
  }
  const initialStatus = await invokeCommand(commandRunner, runtimeScript, [
    'status',
    '--json',
    ...leaseArgs
  ])
  const baseline = supervisorIdentity(initialStatus.value)
  if (
    !baseline.runtimeKey ||
    !baseline.generation ||
    !baseline.supervisorPid ||
    !baseline.devtoolsPid
  ) {
    return finishBlocked({ code: 'qa_warm_baseline_identity_missing', status: initialStatus })
  }
  report.baseline = baseline
  writeAtomic(path.join(directory, 'warm-state.json'), report)

  for (let index = 1; index <= AUTOMATOR_WARM_RUN_TARGET; index += 1) {
    const before = await invokeCommand(commandRunner, runtimeScript, [
      'status',
      '--json',
      ...leaseArgs
    ])
    const doctor = await invokeCommand(commandRunner, runtimeScript, [
      'doctor',
      '--json',
      ...leaseArgs,
      `--artifact-dir=${path.join(directory, `infra-run-${index}`, 'doctor')}`
    ])
    const after = await invokeCommand(commandRunner, runtimeScript, [
      'status',
      '--json',
      ...leaseArgs
    ])
    const result = evaluateWarmInfrastructureRun({
      doctor,
      before: before.value,
      after: after.value,
      expectedIdentity: baseline
    })
    const item = {
      index,
      execution_id: `${executionPrefix}-infra-${index}`,
      status: result.passed ? 'passed' : 'blocked',
      business_status: 'not_run',
      business_assertions_reached: false,
      doctor,
      ...result
    }
    report.runs.push(item)
    writeAtomic(path.join(directory, 'warm-state.json'), report)
    if (!result.passed) {
      return finishBlocked(result.failures[0] || { code: 'qa_warm_infrastructure_run_failed' })
    }
  }

  const cleanupPassed = await cleanupRuntime()
  report.status = cleanupPassed ? 'passed' : 'blocked'
  report.completed_runs = report.runs.length
  if (!cleanupPassed && !report.primary_failure) {
    report.primary_failure = report.cleanup_failure
  }
  writeAtomic(path.join(directory, 'warm-report.json'), report)
  return report
}

export async function runAutomatorWarmStabilityWithLease({
  dispatchRunId,
  executionPrefix,
  catalogIds = AUTOMATOR_WARM_CATALOG_IDS,
  infrastructureOnly = false,
  outputDirectory,
  commandRunner = runCommand,
  runLease
} = {}) {
  if (!SAFE_ID.test(String(dispatchRunId || '')) || !SAFE_ID.test(String(executionPrefix || ''))) {
    throw new Error('dispatch-run-id 或 execution-prefix 格式无效')
  }
  if (infrastructureOnly) {
    return runAutomatorInfrastructureWarmStabilityWithLease({
      dispatchRunId,
      executionPrefix,
      outputDirectory,
      commandRunner,
      runLease
    })
  }
  assertWarmCatalogIds(catalogIds)
  const directory = outputDirectoryFor(
    dispatchRunId,
    runLease.owned ? null : outputDirectory,
    runLease.run_instance_id
  )
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const report = {
    status: 'running',
    contract:
      'one supervisor generation -> five formal qa-runs -> no rebuild/restart -> warm preflight <= 15s',
    dispatch_run_id: dispatchRunId,
    run_instance_id: runLease.run_instance_id,
    execution_prefix: executionPrefix,
    catalog_ids: [...catalogIds],
    output_directory: directory,
    runs: []
  }
  const leaseArgs = qaRunLeaseArgs(runLease)
  writeAtomic(path.join(directory, 'warm-state.json'), report)

  const cleanupRuntime = async () => {
    const cleanup = await invokeCommand(commandRunner, runtimeScript, [
      'stop',
      '--json',
      ...leaseArgs
    ])
    const passed =
      cleanup.status === 0 &&
      cleanup.value?.status === 'ready' &&
      cleanup.value?.code === 'qa_runtime_stopped'
    if (!passed) {
      report.cleanup_failure = {
        code: cleanup.value?.code || 'qa_warm_cleanup_failed',
        cleanup
      }
    }
    return passed
  }

  const finishBlocked = async primaryFailure => {
    report.status = 'blocked'
    report.primary_failure = primaryFailure
    await cleanupRuntime()
    writeAtomic(path.join(directory, 'warm-report.json'), report)
    return report
  }

  const bootstrap = await invokeCommand(commandRunner, runtimeScript, [
    'bootstrap',
    '--json',
    ...leaseArgs
  ])
  const bootstrapValue = bootstrap.value
  if (bootstrap.status !== 0 || bootstrapValue?.status !== 'ready') {
    return finishBlocked({ code: 'qa_warm_bootstrap_blocked', bootstrap })
  }
  const initialStatus = await invokeCommand(commandRunner, runtimeScript, [
    'status',
    '--json',
    ...leaseArgs
  ])
  const baseline = supervisorIdentity(initialStatus.value)
  if (
    !baseline.runtimeKey ||
    !baseline.generation ||
    !baseline.supervisorPid ||
    !baseline.devtoolsPid
  ) {
    return finishBlocked({ code: 'qa_warm_baseline_identity_missing', status: initialStatus })
  }
  report.baseline = baseline
  writeAtomic(path.join(directory, 'warm-state.json'), report)

  for (let index = 0; index < catalogIds.length; index += 1) {
    const catalogId = catalogIds[index]
    const executionId = `${executionPrefix}-${index + 1}`
    const before = await invokeCommand(commandRunner, runtimeScript, [
      'status',
      '--json',
      ...leaseArgs
    ])
    const qa = await invokeCommand(commandRunner, dispatchGate, [
      'qa-run',
      `--catalog-id=${catalogId}`,
      `--execution-id=${executionId}`,
      `--dispatch-run-id=${dispatchRunId}`,
      `--run-instance-id=${runLease.run_instance_id}`,
      `--run-lease-token=${runLease.token}`,
      '--allow-live'
    ])
    const after = await invokeCommand(commandRunner, runtimeScript, [
      'status',
      '--json',
      ...leaseArgs
    ])
    const result = evaluateWarmQaRun({
      record: qa.value,
      before: before.value,
      after: after.value,
      expectedIdentity: baseline,
      recordCommandStatus: qa.status,
      beforeCommandStatus: before.status,
      afterCommandStatus: after.status
    })
    const item = {
      index: index + 1,
      catalog_id: catalogId,
      execution_id: executionId,
      qa_status: qa.status,
      qa,
      status: result.passed ? 'passed' : 'blocked',
      business_status: result.business_outcome.business_status,
      business_classification: result.business_outcome.classification,
      ...result
    }
    report.runs.push(item)
    writeAtomic(path.join(directory, 'warm-state.json'), report)
    if (!result.passed) {
      return finishBlocked(result.failures[0] || { code: 'qa_warm_run_failed' })
    }
  }
  const cleanupPassed = await cleanupRuntime()
  report.status = cleanupPassed ? 'passed' : 'blocked'
  report.completed_runs = report.runs.length
  report.business_outcomes = report.runs.map(item => ({
    catalog_id: item.catalog_id,
    status: item.business_status,
    classification: item.business_classification,
    reason: item.business_outcome?.reason || null
  }))
  if (!cleanupPassed && !report.primary_failure) {
    report.primary_failure = report.cleanup_failure
  }
  writeAtomic(path.join(directory, 'warm-report.json'), report)
  return report
}

export async function runAutomatorWarmStability(options = {}) {
  const dispatchRunId = options.dispatchRunId || `automator-v3-warm-${Date.now()}`
  const runLease = resolveQaRunLease({
    dispatchRunId,
    kind: 'warm-stability',
    runInstanceId: options.runInstanceId,
    runLeaseToken: options.runLeaseToken,
    runLease: options.runLease
  })
  try {
    return await runAutomatorWarmStabilityWithLease({ ...options, dispatchRunId, runLease })
  } finally {
    if (runLease.owned) {
      runLease.release()
    }
  }
}

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  try {
    const report = await runAutomatorWarmStability(parseWarmStabilityArgs())
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = report.status === 'passed' ? 0 : 1
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ status: 'blocked', code: 'qa_warm_configuration_invalid', message: error.message }, null, 2)}\n`
    )
    process.exitCode = 1
  }
}
