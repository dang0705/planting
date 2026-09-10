#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { supervisorIdentity } from './automator-warm-stability.mjs'
import { runCommandWithAuthHealthGuard } from './automator-auth-renewal-guard.mjs'
import { runQaNodeCommand } from './qa-node-command.mjs'
import { qaRunLeaseArgs, resolveQaRunLease } from './qa-run-lease.mjs'
import {
  AUTOMATOR_V3_SAFE_ID,
  resolveAutomatorV3ArtifactDirectory
} from './automator-v3-run-context.mjs'
import { validateCatalog } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/catalog.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const catalogPath = path.join(repoRoot, 'test', 'e2e', 'automator', 'catalog.json')
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
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000
// Some live leaves intentionally capture a formal screenshot before and after
// each question. The default 120s leaf watchdog can terminate a valid flow
// before its business assertions are emitted. Keep the matrix-level allowance
// bounded while giving these real UI flows enough time to complete.
const LEAF_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000
const SAFE_ID = AUTOMATOR_V3_SAFE_ID
export const AUTOMATOR_LIVE_REPEAT_COUNT = 3

function parseJsonOutput(output) {
  const text = String(output || '').trim()
  try {
    return JSON.parse(text)
  } catch {
    for (let index = text.lastIndexOf('{'); index >= 0; index = text.lastIndexOf('{', index - 1)) {
      try {
        return JSON.parse(text.slice(index))
      } catch {
        // Continue searching for the terminal JSON object after command logs.
      }
    }
    return null
  }
}

function writeAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, filePath)
}

function outputDirectoryFor(dispatchRunId, requested, runInstanceId = null) {
  if (runInstanceId) {
    return resolveAutomatorV3ArtifactDirectory(
      dispatchRunId,
      runInstanceId,
      'automator-live-matrix',
      requested
    )
  }
  const fallback = path.join(
    repoRoot,
    '.tmp',
    'dispatch-task',
    dispatchRunId,
    'qa-artifacts',
    'automator-live-matrix'
  )
  const directory = path.resolve(requested || fallback)
  const allowedRoot = path.resolve(repoRoot, '.tmp', 'dispatch-task')
  if (directory !== allowedRoot && !directory.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('live matrix output-dir 必须位于 .tmp/dispatch-task 内')
  }
  return directory
}

export function readLiveCatalogIds(catalog = null) {
  return readLiveCatalogEntries(catalog).map(item => item.id)
}

export function readLiveCatalogEntries(catalog = null) {
  const value = catalog || JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  const entries = Array.isArray(value?.entries) ? value.entries : []
  const live = entries.filter(item => item?.data_mode === 'automator_live_real_api')
  if (!live.length) {
    throw new Error('catalog 没有 live real api 叶子')
  }
  if (live.some(item => item.auth_mode !== 'persisted_real_wechat')) {
    throw new Error('live catalog 叶子必须使用 persisted_real_wechat')
  }
  if (live.some(item => item.mutation_policy === 'diagnostic_only')) {
    throw new Error('live catalog 叶子不能使用 diagnostic_only mutation policy')
  }
  if (
    live.some(
      item => !Array.isArray(item.required_assertions) || item.required_assertions.length === 0
    )
  ) {
    throw new Error('live catalog 叶子必须声明 required_assertions')
  }
  return live
}

function catalogPrecondition() {
  try {
    const validation = validateCatalog()
    return {
      status: validation.status === 'passed' ? 'ready' : 'blocked',
      code:
        validation.status === 'passed'
          ? 'qa_live_matrix_catalog_ready'
          : 'qa_live_matrix_catalog_invalid',
      errors: validation.errors || []
    }
  } catch (error) {
    return {
      status: 'blocked',
      code: 'qa_live_matrix_catalog_validation_failed',
      message: error?.message || String(error),
      errors: []
    }
  }
}

export function parseLiveMatrixArgs(argv = process.argv.slice(2)) {
  const result = {
    dispatchRunId: `automator-v3-live-matrix-${Date.now()}`,
    executionPrefix: `live-${Date.now()}-${process.pid}`,
    outputDirectory: null,
    allowLive: false,
    catalogIds: readLiveCatalogIds()
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index])
    if (argument === '--allow-live') {
      result.allowLive = true
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
    if (key === 'output-dir') {
      result.outputDirectory = String(value || '')
    }
    if (key === 'run-instance-id') {
      result.runInstanceId = String(value || '')
    }
    if (key === 'run-lease-token') {
      result.runLeaseToken = String(value || '')
    }
    if (key === 'catalog-ids') {
      result.catalogIds = String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    }
  }
  if (!result.allowLive) {
    throw new Error('live matrix 必须显式提供 --allow-live')
  }
  if (!SAFE_ID.test(result.dispatchRunId) || !SAFE_ID.test(result.executionPrefix)) {
    throw new Error('dispatch-run-id 或 execution-prefix 格式无效')
  }
  const expected = readLiveCatalogIds().sort()
  const observed = [...result.catalogIds].sort()
  if (JSON.stringify(expected) !== JSON.stringify(observed)) {
    throw new Error('live matrix 必须执行 catalog 中全部 live real api 叶子，不能缩减清单')
  }
  if (Boolean(result.runInstanceId) !== Boolean(result.runLeaseToken)) {
    throw new Error('run-instance-id 和 run-lease-token 必须同时提供')
  }
  result.outputDirectory = result.runInstanceId
    ? outputDirectoryFor(result.dispatchRunId, result.outputDirectory, result.runInstanceId)
    : outputDirectoryFor(result.dispatchRunId, result.outputDirectory)
  return result
}

async function runCommand(
  command,
  args,
  { timeoutMs = COMMAND_TIMEOUT_MS, abortSignal = null } = {}
) {
  const result = await runQaNodeCommand({
    command: process.execPath,
    args: [command, ...args],
    cwd: repoRoot,
    env: { ...process.env, QA_AUTOMATOR_LIVE_MATRIX: '1' },
    timeoutMs,
    abortSignal,
    maxOutputChars: 32 * 1024 * 1024
  })
  return {
    command,
    args,
    status: result.status,
    signal: result.signal,
    timedOut: result.timedOut,
    stdout: String(result.stdout || '').slice(-20_000),
    stderr: String(result.stderr || '').slice(-20_000),
    value: parseJsonOutput(result.stdout)
  }
}

async function invokeCommand(commandRunner, command, args, options = {}) {
  try {
    const result =
      typeof options.authHealthCheck === 'function'
        ? await runCommandWithAuthHealthGuard({
            commandRunner,
            command,
            args,
            timeoutMs: options.timeoutMs,
            authHealthCheck: options.authHealthCheck
          })
        : await commandRunner(command, args, options)
    if (result && typeof result === 'object') {
      return result
    }
    return {
      command,
      args,
      status: null,
      value: { status: 'blocked', code: 'qa_live_matrix_result_invalid' }
    }
  } catch (error) {
    return {
      command,
      args,
      status: null,
      value: {
        status: 'blocked',
        code: 'qa_live_matrix_command_threw',
        message: error?.message || String(error)
      }
    }
  }
}

async function cleanup(commandRunner, report, leaseArgs) {
  const result = await invokeCommand(commandRunner, runtimeScript, ['stop', '--json', ...leaseArgs])
  const passed =
    result.status === 0 &&
    result.value?.status === 'ready' &&
    result.value?.code === 'qa_runtime_stopped'
  if (!passed) {
    report.cleanup_failure = { code: result.value?.code || 'qa_live_matrix_cleanup_failed', result }
  }
  return passed
}

function isBusinessFailureCode(code) {
  const value = String(code || '')
  return (
    value === 'qa_live_matrix_leaf_command_failed' ||
    value === 'qa_live_matrix_leaf_not_passed' ||
    value.startsWith('qa_live_matrix_business_') ||
    value.startsWith('qa_live_matrix_required_business_')
  )
}

export function evaluateLeaf(
  record,
  before,
  after,
  expected,
  { qaStatus = 0, beforeStatus = 0, afterStatus = 0 } = {}
) {
  const failures = []
  if (beforeStatus !== 0) {
    failures.push({ code: 'qa_live_matrix_before_status_command_failed', status: beforeStatus })
  }
  if (afterStatus !== 0) {
    failures.push({ code: 'qa_live_matrix_after_status_command_failed', status: afterStatus })
  }
  if (qaStatus !== 0) {
    failures.push({ code: 'qa_live_matrix_leaf_command_failed', status: qaStatus })
  }
  for (const [phase, status] of [
    ['before', before],
    ['after', after]
  ]) {
    if (status?.status !== 'running' || status?.code !== 'qa_runtime_running') {
      failures.push({
        code: 'qa_live_matrix_runtime_not_running',
        phase,
        status: status?.status || null,
        runtime_code: status?.code || null
      })
    }
  }
  const beforeIdentity = supervisorIdentity(before)
  const afterIdentity = supervisorIdentity(after)
  for (const [phase, identity] of [
    ['before', beforeIdentity],
    ['after', afterIdentity]
  ]) {
    for (const key of [
      'runtimeKey',
      'generation',
      'supervisorPid',
      'devtoolsPid',
      'localRuntimePid',
      'projectPath',
      'profile'
    ]) {
      if (identity[key] !== expected[key]) {
        failures.push({
          code: 'qa_live_matrix_runtime_identity_changed',
          phase,
          key,
          expected: expected[key],
          observed: identity[key]
        })
      }
    }
  }
  if (record?.status !== 'passed') {
    failures.push({ code: 'qa_live_matrix_leaf_not_passed', status: record?.status })
  }
  if (record?.leaf_report?.parse_status !== 'parsed') {
    failures.push({
      code: 'qa_live_matrix_business_report_not_parsed',
      parse_status: record?.leaf_report?.parse_status || null
    })
  }
  if (
    record?.leaf_report?.report_status !== 'passed' ||
    record?.leaf_report?.business_assertions_reached !== true ||
    !record?.leaf_report?.raw_report_ref
  ) {
    failures.push({
      code: 'qa_live_matrix_business_assertions_not_proven',
      leaf_report: record?.leaf_report || null
    })
  }
  if (
    !Array.isArray(record?.leaf_report?.assertions) ||
    record.leaf_report.assertions.length === 0
  ) {
    failures.push({
      code: 'qa_live_matrix_business_assertion_list_missing',
      catalog_id: record?.catalog_id || null
    })
  } else if (record.leaf_report.assertions.some(assertion => assertion?.passed !== true)) {
    failures.push({
      code: 'qa_live_matrix_business_assertion_failed',
      assertions: record.leaf_report.assertions
    })
  }
  const requiredAssertions = Array.isArray(expected.requiredAssertions)
    ? expected.requiredAssertions
    : []
  const observedAssertions = new Map(
    (record?.leaf_report?.assertions || []).map(assertion => [assertion?.name, assertion])
  )
  const missingRequiredAssertions = requiredAssertions.filter(
    name => observedAssertions.get(name)?.passed !== true
  )
  if (missingRequiredAssertions.length > 0) {
    failures.push({
      code: 'qa_live_matrix_required_business_assertions_not_proven',
      required_assertions: requiredAssertions,
      missing_or_failed: missingRequiredAssertions
    })
  }
  if (expected.requirements?.screenshot !== false) {
    const businessScreenshotAttempts = record?.leaf_report?.screenshot_attempts
    const screenshotEvidencePassed =
      Array.isArray(businessScreenshotAttempts) &&
      businessScreenshotAttempts.length > 0 &&
      businessScreenshotAttempts.every(
        item =>
          Array.isArray(item?.attempts) &&
          item.attempts.length === 1 &&
          item.attempts[0]?.attempt === 1 &&
          item.attempts[0]?.status === 'passed'
      )
    if (!screenshotEvidencePassed) {
      failures.push({
        code: 'qa_live_matrix_business_first_screenshot_attempt_not_proven',
        screenshot_attempts: businessScreenshotAttempts || null
      })
    }
  }
  if (record?.catalog_id !== expected.catalogId) {
    failures.push({
      code: 'qa_live_matrix_catalog_id_mismatch',
      expected: expected.catalogId || null,
      observed: record?.catalog_id || null
    })
  }
  if (record?.data_mode !== 'automator_live_real_api') {
    failures.push({ code: 'qa_live_matrix_data_mode_invalid', observed: record?.data_mode || null })
  }
  if (record?.auth_mode !== 'persisted_real_wechat') {
    failures.push({ code: 'qa_live_matrix_auth_mode_invalid', observed: record?.auth_mode || null })
  }
  if (!['read_only', 'self_reverting', 'test_owned_persistent'].includes(record?.mutation_policy)) {
    failures.push({
      code: 'qa_live_matrix_mutation_policy_invalid',
      observed: record?.mutation_policy || null
    })
  }
  if (record?.preflight?.status !== 'passed') {
    failures.push({ code: 'qa_live_matrix_preflight_not_passed' })
  }
  for (const [name, check] of Object.entries({
    project_identity: record?.preflight?.checks?.project_identity,
    page_data: record?.preflight?.checks?.page_data,
    wx_request: record?.preflight?.checks?.wx_request,
    screenshot: record?.preflight?.checks?.screenshot
  })) {
    if (check?.passed !== true) {
      failures.push({ code: `qa_live_matrix_${name}_not_proven`, check })
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
      code: 'qa_live_matrix_first_screenshot_attempt_not_proven',
      attempts: screenshotAttempts
    })
  }
  const wxRequest = record?.preflight?.checks?.wx_request
  if (wxRequest?.identity_required !== true || wxRequest?.identity_resolved !== true) {
    failures.push({
      code: 'qa_live_matrix_wx_request_identity_not_proven',
      check: wxRequest || null
    })
  }
  if (record?.runtime_evidence?.project_identity_verified !== true) {
    failures.push({ code: 'qa_live_matrix_project_identity_not_proven' })
  }
  if (
    record?.auth_consumption_ack?.status !== 'passed' ||
    record.auth_consumption_ack.code !== 'qa_auth_consumption_ack_received' ||
    record.auth_consumption_ack.event?.event_id !== record.auth_consumption?.event_id
  ) {
    failures.push({
      code: 'qa_live_matrix_auth_consumption_ack_not_proven',
      auth_consumption_ack: record?.auth_consumption_ack || null,
      auth_consumption: record?.auth_consumption || null
    })
  }
  if (record?.runtime_evidence?.bootstrap_preflight?.targeted_restart?.attempted === true) {
    failures.push({ code: 'qa_live_matrix_bootstrap_targeted_restart_used' })
  }
  const businessFailures = failures.filter(item => isBusinessFailureCode(item.code))
  const infrastructureFailures = failures.filter(item => !isBusinessFailureCode(item.code))
  return {
    passed: failures.length === 0,
    failures,
    infrastructure: {
      passed: infrastructureFailures.length === 0,
      failures: infrastructureFailures
    },
    business: {
      passed: businessFailures.length === 0,
      failures: businessFailures
    }
  }
}

export async function runLiveMatrixWithLease({
  dispatchRunId,
  executionPrefix,
  catalogIds = readLiveCatalogIds(),
  outputDirectory,
  commandRunner = runCommand,
  authHealthCheck = null,
  runLease
} = {}) {
  if (!SAFE_ID.test(String(dispatchRunId || '')) || !SAFE_ID.test(String(executionPrefix || ''))) {
    throw new Error('dispatch-run-id 或 execution-prefix 格式无效')
  }
  const expectedCatalogEntries = readLiveCatalogEntries()
  const expectedCatalogIds = expectedCatalogEntries.map(entry => entry.id)
  const catalogById = new Map(expectedCatalogEntries.map(entry => [entry.id, entry]))
  const observed = [...(catalogIds || expectedCatalogIds)].sort()
  if (JSON.stringify(observed) !== JSON.stringify([...expectedCatalogIds].sort())) {
    throw new Error('live matrix catalog 清单不完整或包含非 live 叶子')
  }
  const directory = outputDirectoryFor(
    dispatchRunId,
    runLease.owned ? null : outputDirectory,
    runLease.run_instance_id
  )
  const report = {
    status: 'running',
    contract:
      'one supervisor generation -> every live real api catalog leaf x3 -> no rebuild and at most one audited target-only recovery per leaf',
    dispatch_run_id: dispatchRunId,
    run_instance_id: runLease.run_instance_id,
    execution_prefix: executionPrefix,
    catalog_ids: [...catalogIds],
    repeat_count: AUTOMATOR_LIVE_REPEAT_COUNT,
    output_directory: directory,
    runs: [],
    infrastructure_status: 'not_started',
    business_status: 'not_started',
    business_failures: [],
    current_catalog_id: null,
    current_repeat_index: null,
    current_execution_id: null,
    current_step: null,
    auth_watchdog: authHealthCheck ? { status: 'running', checks: 0, renewals: [] } : null,
    last_progress_at: new Date().toISOString()
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const catalogValidation = catalogPrecondition()
  report.catalog_precondition = catalogValidation
  if (catalogValidation.status !== 'ready') {
    report.status = 'blocked'
    report.infrastructure_status = 'blocked'
    report.business_status = 'not_started'
    report.primary_failure = catalogValidation
    report.current_step = 'catalog_precondition'
    report.last_progress_at = new Date().toISOString()
    writeAtomic(path.join(directory, 'live-matrix-state.json'), report)
    writeAtomic(path.join(directory, 'live-matrix-report.json'), report)
    return report
  }
  const leaseArgs = qaRunLeaseArgs(runLease)
  const checkAuth = async () => {
    if (typeof authHealthCheck !== 'function') {
      return null
    }
    const result = await authHealthCheck()
    report.auth_watchdog.checks += 1
    if (result?.status === 'renewed') {
      report.auth_watchdog.renewals.push(result)
    }
    if (result?.status === 'blocked') {
      report.auth_watchdog.status = 'blocked'
      report.auth_watchdog.primary_failure = result
    }
    return result
  }
  const blockForAuth = async failure => {
    report.status = 'blocked'
    report.infrastructure_status = 'blocked'
    report.business_status = report.business_failures.length ? 'blocked' : 'not_started'
    report.primary_failure = failure
    await cleanup(commandRunner, report, leaseArgs)
    writeAtomic(path.join(directory, 'live-matrix-report.json'), report)
    return report
  }
  writeAtomic(path.join(directory, 'live-matrix-state.json'), report)
  const bootstrap = await invokeCommand(commandRunner, runtimeScript, [
    'bootstrap',
    '--json',
    ...leaseArgs
  ])
  if (bootstrap.status !== 0 || bootstrap.value?.status !== 'ready') {
    report.status = 'blocked'
    report.infrastructure_status = 'blocked'
    report.business_status = 'not_started'
    report.primary_failure = { code: 'qa_live_matrix_bootstrap_blocked', bootstrap }
    await cleanup(commandRunner, report, leaseArgs)
    writeAtomic(path.join(directory, 'live-matrix-report.json'), report)
    return report
  }
  const baselineReport = await invokeCommand(commandRunner, runtimeScript, [
    'status',
    '--json',
    ...leaseArgs
  ])
  const baseline = supervisorIdentity(baselineReport.value)
  if (
    !baseline.runtimeKey ||
    !baseline.generation ||
    !baseline.supervisorPid ||
    !baseline.devtoolsPid
  ) {
    report.status = 'blocked'
    report.infrastructure_status = 'blocked'
    report.business_status = 'not_started'
    report.primary_failure = {
      code: 'qa_live_matrix_baseline_identity_missing',
      status: baselineReport
    }
    await cleanup(commandRunner, report, leaseArgs)
    writeAtomic(path.join(directory, 'live-matrix-report.json'), report)
    return report
  }
  report.baseline = baseline
  const initialAuth = await checkAuth()
  if (initialAuth?.status === 'blocked') {
    return blockForAuth(initialAuth)
  }
  writeAtomic(path.join(directory, 'live-matrix-state.json'), report)
  for (let catalogIndex = 0; catalogIndex < catalogIds.length; catalogIndex += 1) {
    const catalogId = catalogIds[catalogIndex]
    for (let repeatIndex = 1; repeatIndex <= AUTOMATOR_LIVE_REPEAT_COUNT; repeatIndex += 1) {
      const index = catalogIndex * AUTOMATOR_LIVE_REPEAT_COUNT + repeatIndex - 1
      const executionId = `${executionPrefix}-${catalogIndex + 1}-r${repeatIndex}`
      report.current_catalog_id = catalogId
      report.current_repeat_index = repeatIndex
      report.current_execution_id = executionId
      report.current_step = 'before_status'
      report.last_progress_at = new Date().toISOString()
      writeAtomic(path.join(directory, 'live-matrix-state.json'), report)
      const beforeAuth = await checkAuth()
      if (beforeAuth?.status === 'blocked') {
        return blockForAuth(beforeAuth)
      }
      const before = await invokeCommand(commandRunner, runtimeScript, [
        'status',
        '--json',
        ...leaseArgs
      ])
      report.current_step = 'qa_run'
      report.last_progress_at = new Date().toISOString()
      writeAtomic(path.join(directory, 'live-matrix-state.json'), report)
      const qa = await invokeCommand(
        commandRunner,
        dispatchGate,
        [
          'qa-run',
          `--catalog-id=${catalogId}`,
          `--execution-id=${executionId}`,
          `--dispatch-run-id=${dispatchRunId}`,
          `--run-instance-id=${runLease.run_instance_id}`,
          `--run-lease-token=${runLease.token}`,
          '--allow-live',
          '--allow-targeted-restart',
          `--execution-timeout-ms=${LEAF_EXECUTION_TIMEOUT_MS}`
        ],
        {
          timeoutMs: COMMAND_TIMEOUT_MS,
          authHealthCheck: typeof authHealthCheck === 'function' ? checkAuth : null
        }
      )
      if (qa.auth_watchdog_failure) {
        const item = {
          index: index + 1,
          catalog_id: catalogId,
          repeat_index: repeatIndex,
          execution_id: executionId,
          qa,
          passed: false,
          failures: [qa.auth_watchdog_failure],
          infrastructure: { passed: false, failures: [qa.auth_watchdog_failure] },
          business: { passed: false, failures: [] }
        }
        report.runs.push(item)
        report.auth_watchdog.status = 'blocked'
        report.auth_watchdog.primary_failure = qa.auth_watchdog_failure
        writeAtomic(path.join(directory, 'live-matrix-state.json'), report)
        return blockForAuth(qa.auth_watchdog_failure)
      }
      report.current_step = 'after_status'
      report.last_progress_at = new Date().toISOString()
      writeAtomic(path.join(directory, 'live-matrix-state.json'), report)
      const after = await invokeCommand(commandRunner, runtimeScript, [
        'status',
        '--json',
        ...leaseArgs
      ])
      const afterAuth = await checkAuth()
      if (afterAuth?.status === 'blocked') {
        return blockForAuth(afterAuth)
      }
      const evaluation = evaluateLeaf(
        qa.value,
        before.value,
        after.value,
        {
          ...baseline,
          catalogId,
          requiredAssertions: catalogById.get(catalogId)?.required_assertions || [],
          requirements: catalogById.get(catalogId)?.requirements || {}
        },
        {
          qaStatus: qa.status,
          beforeStatus: before.status,
          afterStatus: after.status
        }
      )
      const item = {
        index: index + 1,
        catalog_id: catalogId,
        repeat_index: repeatIndex,
        execution_id: executionId,
        qa,
        ...evaluation
      }
      report.runs.push(item)
      report.current_step = 'leaf_complete'
      report.last_progress_at = new Date().toISOString()
      if (!evaluation.business.passed) {
        report.business_failures.push({
          index: item.index,
          catalog_id: catalogId,
          repeat_index: repeatIndex,
          execution_id: executionId,
          failures: evaluation.business.failures
        })
      }
      writeAtomic(path.join(directory, 'live-matrix-state.json'), report)
      if (!evaluation.infrastructure.passed) {
        report.status = 'blocked'
        report.infrastructure_status = 'blocked'
        report.business_status = report.business_failures.length ? 'blocked' : 'not_started'
        report.primary_failure = evaluation.infrastructure.failures[0]
        await cleanup(commandRunner, report, leaseArgs)
        writeAtomic(path.join(directory, 'live-matrix-report.json'), report)
        return report
      }
    }
  }
  const cleanupPassed = await cleanup(commandRunner, report, leaseArgs)
  report.current_catalog_id = null
  report.current_repeat_index = null
  report.current_execution_id = null
  report.current_step = 'complete'
  report.last_progress_at = new Date().toISOString()
  report.completed_runs = report.runs.length
  report.infrastructure_status = cleanupPassed ? 'passed' : 'blocked'
  report.business_status = report.business_failures.length > 0 ? 'blocked' : 'passed'
  report.status = cleanupPassed && report.business_failures.length === 0 ? 'passed' : 'blocked'
  if (report.auth_watchdog) {
    report.auth_watchdog.status = report.status === 'passed' ? 'passed' : 'blocked'
  }
  if (!cleanupPassed) {
    report.primary_failure = report.cleanup_failure
  } else if (report.business_failures.length > 0) {
    report.primary_failure = report.business_failures[0].failures[0]
  }
  writeAtomic(path.join(directory, 'live-matrix-report.json'), report)
  return report
}

export async function runLiveMatrix(options = {}) {
  const dispatchRunId = options.dispatchRunId || `automator-v3-live-matrix-${Date.now()}`
  const runLease = resolveQaRunLease({
    dispatchRunId,
    kind: 'live-matrix',
    runInstanceId: options.runInstanceId,
    runLeaseToken: options.runLeaseToken,
    runLease: options.runLease
  })
  try {
    return await runLiveMatrixWithLease({ ...options, dispatchRunId, runLease })
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
    const report = await runLiveMatrix(parseLiveMatrixArgs())
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = report.status === 'passed' ? 0 : 1
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ status: 'blocked', code: 'qa_live_matrix_configuration_invalid', message: error.message }, null, 2)}\n`
    )
    process.exitCode = 1
  }
}
