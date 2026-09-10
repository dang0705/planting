#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { evaluateDoctorSample, runtimeIdentity } from './automator-stress.mjs'
import { runCommandWithAuthHealthGuard } from './automator-auth-renewal-guard.mjs'
import { runQaNodeCommand } from './qa-node-command.mjs'
import { qaRunLeaseArgs, resolveQaRunLease } from './qa-run-lease.mjs'
import {
  AUTOMATOR_V3_SAFE_ID,
  resolveAutomatorV3ArtifactDirectory
} from './automator-v3-run-context.mjs'

// Reliability is proved in two complementary layers.  Real cold starts keep
// the expensive, user-visible path honest; a high-frequency control-plane
// probe exercises lease/profile/port/manifest liveness without relaunching
// DevTools 1000 times.  The latter is deliberately reported as a probe count,
// never as 1000 cold starts.
export const AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS = 20
export const AUTOMATOR_FAST_PROBE_TARGET_CYCLES = 1000
export const AUTOMATOR_SOAK_HEALTH_SAMPLES = 3
export const AUTOMATOR_SOAK_ITERATION_BUDGET_MS = 5 * 60 * 1000
export const AUTOMATOR_FAST_PROBE_TOTAL_BUDGET_MS = 10 * 60 * 1000
export const AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS = 45 * 60 * 1000

const COMMAND_TIMEOUT_MS = AUTOMATOR_SOAK_ITERATION_BUDGET_MS
const SAFE_ID = AUTOMATOR_V3_SAFE_ID
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeCommand = path.join(repoRoot, 'scripts', 'qa', 'automator-runtime.mjs')

function parseJsonOutput(output) {
  const text = String(output || '').trim()
  try {
    return JSON.parse(text)
  } catch {
    for (let index = text.lastIndexOf('{'); index >= 0; index = text.lastIndexOf('{', index - 1)) {
      try {
        return JSON.parse(text.slice(index))
      } catch {
        // Continue until the terminal JSON object is found.
      }
    }
    return null
  }
}

async function invoke(commandRunner, command, args = [], options = {}) {
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
      status: null,
      value: { status: 'blocked', code: 'qa_soak_command_result_invalid' }
    }
  } catch (error) {
    return {
      command,
      status: null,
      value: {
        status: 'blocked',
        code: 'qa_soak_command_threw',
        message: error?.message || String(error)
      }
    }
  }
}

async function runCommand(
  command,
  args = [],
  { timeoutMs = COMMAND_TIMEOUT_MS, abortSignal = null } = {}
) {
  const result = await runQaNodeCommand({
    command: process.execPath,
    args: [runtimeCommand, command, '--json', ...args],
    cwd: repoRoot,
    env: { ...process.env, QA_AUTOMATOR_SOAK: '1' },
    timeoutMs,
    abortSignal,
    maxOutputChars: 8 * 1024 * 1024
  })
  return {
    command,
    status: result.status,
    signal: result.signal,
    timedOut: result.timedOut,
    stdout: String(result.stdout || '').slice(-12_000),
    stderr: String(result.stderr || '').slice(-12_000),
    value: parseJsonOutput(result.stdout)
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
      'automator-soak',
      requested
    )
  }
  const fallback = path.join(
    repoRoot,
    '.tmp',
    'dispatch-task',
    dispatchRunId,
    'qa-artifacts',
    'automator-soak'
  )
  const directory = path.resolve(requested || fallback)
  const allowedRoot = path.resolve(repoRoot, '.tmp', 'dispatch-task')
  if (directory !== allowedRoot && !directory.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('soak output-dir 必须位于 .tmp/dispatch-task 内')
  }
  return directory
}

export function parseSoakArgs(argv = process.argv.slice(2)) {
  const result = {
    allowLive: false,
    coldStarts: AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS,
    fastProbes: AUTOMATOR_FAST_PROBE_TARGET_CYCLES,
    healthSamples: AUTOMATOR_SOAK_HEALTH_SAMPLES,
    dispatchRunId: `automator-v3-soak-${Date.now()}`,
    outputDirectory: null
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
    if (key === 'cold-starts' || key === 'attempts') {
      result.coldStarts = Number(value)
    }
    if (key === 'fast-probes') {
      result.fastProbes = Number(value)
    }
    if (key === 'health-samples') {
      result.healthSamples = Number(value)
    }
    if (key === 'dispatch-run-id') {
      result.dispatchRunId = String(value || '')
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
    throw new Error('automator soak 必须显式提供 --allow-live')
  }
  if (result.coldStarts !== AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS) {
    throw new Error(
      `automator reliability cold-starts 必须恰好为 ${AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS}`
    )
  }
  if (result.fastProbes !== AUTOMATOR_FAST_PROBE_TARGET_CYCLES) {
    throw new Error(
      `automator reliability fast-probes 必须恰好为 ${AUTOMATOR_FAST_PROBE_TARGET_CYCLES}`
    )
  }
  if (result.healthSamples !== AUTOMATOR_SOAK_HEALTH_SAMPLES) {
    throw new Error(`automator soak health-samples 必须恰好为 ${AUTOMATOR_SOAK_HEALTH_SAMPLES}`)
  }
  if (!SAFE_ID.test(result.dispatchRunId)) {
    throw new Error('dispatch-run-id 格式无效')
  }
  if (Boolean(result.runInstanceId) !== Boolean(result.runLeaseToken)) {
    throw new Error('run-instance-id 和 run-lease-token 必须同时提供')
  }
  if (result.runInstanceId) {
    result.outputDirectory = outputDirectoryFor(
      result.dispatchRunId,
      result.outputDirectory,
      result.runInstanceId
    )
  } else if (result.outputDirectory) {
    throw new Error('--output-dir 必须与 --run-instance-id 和 --run-lease-token 一起提供')
  }
  return result
}

function iterationReport(
  index,
  startedAt,
  endedAt,
  bootstrap,
  bootstrapIdentityFailure,
  samples,
  stop
) {
  const failures = []
  if (bootstrap.status !== 0 || bootstrap.value?.status !== 'ready') {
    failures.push({ code: bootstrap.value?.code || 'qa_soak_bootstrap_failed', bootstrap })
  }
  if (bootstrapIdentityFailure) {
    failures.push(bootstrapIdentityFailure)
  }
  for (const sample of samples) {
    if (!sample.passed) {
      failures.push(...sample.failures)
    }
  }
  if (
    stop?.status !== 0 ||
    stop?.value?.status !== 'ready' ||
    stop?.value?.code !== 'qa_runtime_stopped'
  ) {
    failures.push({ code: stop?.value?.code || 'qa_soak_cleanup_failed', stop })
  }
  if (endedAt - startedAt > AUTOMATOR_SOAK_ITERATION_BUDGET_MS) {
    failures.push({
      code: 'qa_soak_iteration_budget_exceeded',
      duration_ms: endedAt - startedAt,
      budget_ms: AUTOMATOR_SOAK_ITERATION_BUDGET_MS
    })
  }
  return {
    index,
    status: failures.length === 0 ? 'passed' : 'failed',
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(endedAt).toISOString(),
    duration_ms: endedAt - startedAt,
    bootstrap,
    doctor_samples: samples,
    stop,
    failures
  }
}

export function evaluateFastProbe({ report, expectedIdentity = null, commandStatus = 0 } = {}) {
  const failures = []
  if (commandStatus !== 0) {
    failures.push({
      code: 'qa_reliability_fast_probe_command_failed',
      command_status: commandStatus
    })
  }
  if (!report || report.status !== 'ready' || report.code !== 'qa_runtime_fast_probe_ready') {
    failures.push({ code: report?.code || 'qa_runtime_fast_probe_not_ready', report })
  }
  const identity = runtimeIdentity(report?.identity || report)
  if (
    !identity.runtimeKey ||
    !identity.generation ||
    !identity.supervisorPid ||
    !identity.devtoolsPid ||
    !identity.processStartIdentity ||
    !identity.sessionId ||
    !identity.localRuntimePid
  ) {
    failures.push({ code: 'qa_reliability_fast_probe_identity_missing', identity })
  }
  if (expectedIdentity) {
    for (const key of [
      'runtimeKey',
      'generation',
      'supervisorPid',
      'devtoolsPid',
      'processStartIdentity',
      'sessionId',
      'localRuntimePid'
    ]) {
      if (identity[key] !== expectedIdentity[key]) {
        failures.push({
          code: 'qa_reliability_fast_probe_identity_changed',
          key,
          expected: expectedIdentity[key],
          observed: identity[key]
        })
      }
    }
  }
  const checks = report?.checks || {}
  if (!Object.values(checks).every(check => check?.passed === true)) {
    failures.push({ code: 'qa_reliability_fast_probe_checks_failed', checks })
  }
  return {
    passed: failures.length === 0,
    failures,
    identity
  }
}

export async function runAutomatorSoakWithLease({
  attempts = AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS,
  fastProbes = AUTOMATOR_FAST_PROBE_TARGET_CYCLES,
  healthSamples = AUTOMATOR_SOAK_HEALTH_SAMPLES,
  dispatchRunId = `automator-v3-soak-${Date.now()}`,
  outputDirectory,
  commandRunner = runCommand,
  authHealthCheck = null,
  now = () => Date.now(),
  runLease
} = {}) {
  if (attempts !== AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS) {
    throw new Error(`attempts must equal ${AUTOMATOR_REAL_COLD_START_TARGET_ATTEMPTS}`)
  }
  if (fastProbes !== AUTOMATOR_FAST_PROBE_TARGET_CYCLES) {
    throw new Error(`fastProbes must equal ${AUTOMATOR_FAST_PROBE_TARGET_CYCLES}`)
  }
  if (healthSamples !== AUTOMATOR_SOAK_HEALTH_SAMPLES) {
    throw new Error(`healthSamples must equal ${AUTOMATOR_SOAK_HEALTH_SAMPLES}`)
  }
  const directory = outputDirectoryFor(dispatchRunId, outputDirectory, runLease.run_instance_id)
  const statePath = path.join(directory, 'soak-state.json')
  const reliabilityStartedAt = now()
  const result = {
    status: 'running',
    contract:
      '20 real cold starts -> doctor x3 -> first PNG + real wx.request -> stop; 1000 fast control-plane probes on one generation',
    reliability_contract: 'tiered_real_cold_start_plus_fast_control_plane_probe',
    target_cold_start_attempts: attempts,
    target_fast_probe_cycles: fastProbes,
    health_samples_per_generation: healthSamples,
    iteration_budget_ms: AUTOMATOR_SOAK_ITERATION_BUDGET_MS,
    fast_probe_budget_ms: AUTOMATOR_FAST_PROBE_TOTAL_BUDGET_MS,
    total_budget_ms: AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS,
    dispatch_run_id: dispatchRunId,
    run_instance_id: runLease.run_instance_id,
    output_directory: directory,
    iterations: [],
    fast_probe: {
      status: 'not_started',
      target_cycles: fastProbes,
      completed_cycles: 0,
      failures: []
    },
    auth_watchdog: authHealthCheck ? { status: 'running', checks: 0, renewals: [] } : null,
    started_at: new Date(reliabilityStartedAt).toISOString(),
    current_iteration: null,
    current_step: null,
    last_progress_at: new Date(now()).toISOString()
  }
  const leaseArgs = qaRunLeaseArgs(runLease)
  let stableGeneration = null
  const seenProcessIdentities = new Set()
  const totalDeadline = now() + AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeAtomic(statePath, result)

  const cleanup = ({ timeoutMs } = {}) =>
    invoke(commandRunner, 'stop', leaseArgs, {
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : COMMAND_TIMEOUT_MS
    })
  const checkAuth = async () => {
    if (typeof authHealthCheck !== 'function') {
      return null
    }
    const value = await authHealthCheck()
    result.auth_watchdog.checks += 1
    if (value?.status === 'renewed') {
      result.auth_watchdog.renewals.push(value)
    }
    if (value?.status === 'blocked') {
      result.auth_watchdog.status = 'blocked'
      result.auth_watchdog.primary_failure = value
    }
    return value
  }
  const initialStop = await cleanup()
  if (
    initialStop.status !== 0 ||
    initialStop.value?.status !== 'ready' ||
    initialStop.value?.code !== 'qa_runtime_stopped'
  ) {
    result.status = 'blocked'
    result.primary_failure = {
      code: initialStop.value?.code || 'qa_soak_initial_cleanup_failed',
      initial_stop: initialStop
    }
    result.ended_at = new Date(now()).toISOString()
    writeAtomic(path.join(directory, 'soak-report.json'), result)
    return result
  }
  result.initial_stop = initialStop
  writeAtomic(statePath, result)

  for (let index = 1; index <= attempts; index += 1) {
    if (now() >= totalDeadline) {
      result.status = 'blocked'
      result.primary_failure = {
        code: 'qa_reliability_total_budget_exceeded',
        total_budget_ms: AUTOMATOR_RELIABILITY_TOTAL_BUDGET_MS,
        completed_cold_starts: result.iterations.length
      }
      result.ended_at = new Date(now()).toISOString()
      writeAtomic(path.join(directory, 'soak-report.json'), result)
      return result
    }
    const startedAt = now()
    const iterationDeadline = startedAt + AUTOMATOR_SOAK_ITERATION_BUDGET_MS
    result.current_iteration = index
    result.current_iteration_started_at = new Date(startedAt).toISOString()
    result.current_iteration_deadline_at = new Date(iterationDeadline).toISOString()
    result.current_step = 'bootstrap'
    result.last_progress_at = new Date(startedAt).toISOString()
    writeAtomic(statePath, result)
    const remainingBudget = () => Math.max(0, Math.min(iterationDeadline, totalDeadline) - now())
    const budgetedInvoke = async (command, args = []) => {
      result.current_step = command
      result.last_progress_at = new Date(now()).toISOString()
      writeAtomic(statePath, result)
      const timeoutMs = remainingBudget()
      if (timeoutMs <= 0) {
        return {
          command,
          status: null,
          timedOut: true,
          value: {
            status: 'blocked',
            code: 'qa_soak_iteration_budget_exhausted'
          }
        }
      }
      const response = await invoke(commandRunner, command, args, {
        timeoutMs,
        authHealthCheck: typeof authHealthCheck === 'function' ? checkAuth : null
      })
      result.last_progress_at = new Date(now()).toISOString()
      writeAtomic(statePath, result)
      return response
    }
    const bootstrap = await budgetedInvoke('bootstrap', leaseArgs)
    if (bootstrap.auth_watchdog_failure) {
      const stop = await cleanup({ timeoutMs: Math.max(1000, remainingBudget()) })
      result.status = 'blocked'
      result.primary_failure = bootstrap.auth_watchdog_failure
      result.cleanup_failure = stop.status === 0 ? null : stop
      result.ended_at = new Date(now()).toISOString()
      writeAtomic(path.join(directory, 'soak-report.json'), result)
      return result
    }
    const samples = []
    const bootstrapIdentity = runtimeIdentity(bootstrap.value)
    let expectedIdentity =
      bootstrapIdentity.runtimeKey &&
      bootstrapIdentity.generation &&
      bootstrapIdentity.supervisorPid &&
      bootstrapIdentity.devtoolsPid
        ? bootstrapIdentity
        : null
    let bootstrapIdentityFailure = null
    if (bootstrap.status === 0 && bootstrap.value?.status === 'ready') {
      if (stableGeneration === null) {
        stableGeneration = bootstrapIdentity.generation
      } else if (bootstrapIdentity.generation !== stableGeneration) {
        bootstrapIdentityFailure = {
          code: 'qa_soak_generation_changed_unexpectedly',
          expected: stableGeneration,
          observed: bootstrapIdentity.generation,
          identity: bootstrapIdentity
        }
      }
      const processIdentity = [
        bootstrapIdentity.processStartIdentity,
        bootstrapIdentity.sessionId,
        bootstrapIdentity.supervisorPid,
        bootstrapIdentity.devtoolsPid
      ]
        .filter(Boolean)
        .join('|')
      if (processIdentity && seenProcessIdentities.has(processIdentity)) {
        bootstrapIdentityFailure = {
          code: 'qa_soak_cold_start_process_identity_reused',
          process_identity: processIdentity,
          identity: bootstrapIdentity
        }
      }
      if (processIdentity) {
        seenProcessIdentities.add(processIdentity)
      }
    }
    if (bootstrap.status === 0 && bootstrap.value?.status === 'ready') {
      for (let sampleIndex = 1; sampleIndex <= healthSamples; sampleIndex += 1) {
        const doctor = await budgetedInvoke('doctor', [
          ...leaseArgs,
          `--artifact-dir=${path.join(directory, `iteration-${index}`, `doctor-${sampleIndex}`)}`
        ])
        const sample = evaluateDoctorSample({
          report: doctor.value,
          expectedIdentity,
          commandStatus: doctor.status
        })
        expectedIdentity ||= sample.identity
        samples.push({ sample: sampleIndex, ...sample, command: doctor })
        if (doctor.auth_watchdog_failure) {
          const stop = await cleanup({ timeoutMs: Math.max(1000, remainingBudget()) })
          result.status = 'blocked'
          result.primary_failure = doctor.auth_watchdog_failure
          result.cleanup_failure = stop.status === 0 ? null : stop
          result.ended_at = new Date(now()).toISOString()
          writeAtomic(path.join(directory, 'soak-report.json'), result)
          return result
        }
        if (!sample.passed) {
          break
        }
      }
    }
    const stop = await cleanup({ timeoutMs: Math.max(1000, remainingBudget()) })
    const report = iterationReport(
      index,
      startedAt,
      now(),
      bootstrap,
      bootstrapIdentityFailure,
      samples,
      stop
    )
    result.iterations.push(report)
    result.completed_attempts = result.iterations.filter(item => item.status === 'passed').length
    result.failed_attempts = result.iterations.filter(item => item.status !== 'passed').length
    result.last_iteration = report
    result.current_step = 'iteration_complete'
    result.last_progress_at = new Date(now()).toISOString()
    writeAtomic(statePath, result)
    if (report.status !== 'passed') {
      result.status = 'blocked'
      result.failed_iteration = index
      result.primary_failure = report.failures[0] || { code: 'qa_soak_iteration_failed' }
      result.ended_at = new Date(now()).toISOString()
      writeAtomic(path.join(directory, 'soak-report.json'), result)
      return result
    }
  }

  result.current_iteration = null
  result.current_step = 'fast_probe_bootstrap'
  result.fast_probe = {
    status: 'running',
    target_cycles: fastProbes,
    completed_cycles: 0,
    started_at: new Date(now()).toISOString(),
    samples: [],
    failures: []
  }
  writeAtomic(statePath, result)
  const fastProbeStartedAt = now()
  const fastProbeDeadline = Math.min(
    totalDeadline,
    fastProbeStartedAt + AUTOMATOR_FAST_PROBE_TOTAL_BUDGET_MS
  )
  const fastProbeRemaining = () => Math.max(0, fastProbeDeadline - now())
  const fastBootstrap = await invoke(commandRunner, 'bootstrap', leaseArgs, {
    timeoutMs: fastProbeRemaining(),
    authHealthCheck: typeof authHealthCheck === 'function' ? checkAuth : null
  })
  if (fastBootstrap.auth_watchdog_failure) {
    const stop = await cleanup({ timeoutMs: Math.max(1000, fastProbeRemaining()) })
    result.status = 'blocked'
    result.primary_failure = fastBootstrap.auth_watchdog_failure
    result.cleanup_failure = stop.status === 0 ? null : stop
    result.ended_at = new Date(now()).toISOString()
    writeAtomic(path.join(directory, 'soak-report.json'), result)
    return result
  }
  const fastExpectedIdentity = runtimeIdentity(fastBootstrap.value)
  const fastBootstrapValid =
    fastBootstrap.status === 0 &&
    fastBootstrap.value?.status === 'ready' &&
    fastExpectedIdentity.runtimeKey &&
    fastExpectedIdentity.generation &&
    fastExpectedIdentity.supervisorPid &&
    fastExpectedIdentity.devtoolsPid
  if (!fastBootstrapValid) {
    const stop = await cleanup({ timeoutMs: Math.max(1000, fastProbeRemaining()) })
    result.fast_probe.status = 'blocked'
    result.fast_probe.primary_failure = {
      code: fastBootstrap.value?.code || 'qa_reliability_fast_probe_bootstrap_failed',
      bootstrap: fastBootstrap,
      stop
    }
    result.fast_probe.ended_at = new Date(now()).toISOString()
    result.status = 'blocked'
    result.primary_failure = result.fast_probe.primary_failure
    result.ended_at = result.fast_probe.ended_at
    writeAtomic(path.join(directory, 'soak-report.json'), result)
    return result
  }
  result.fast_probe.bootstrap = fastBootstrap
  if (fastProbeRemaining() <= 0) {
    result.fast_probe.status = 'blocked'
    result.fast_probe.primary_failure = {
      code: 'qa_reliability_fast_probe_budget_exceeded',
      budget_ms: AUTOMATOR_FAST_PROBE_TOTAL_BUDGET_MS,
      completed_cycles: 0
    }
  } else {
    // One child process performs the whole bounded probe batch. Spawning a
    // fresh Node process for every probe made the former "fast" tier spend
    // roughly 22 seconds per cycle on status/process-table scans.
    const probe = await invoke(commandRunner, 'probe', [...leaseArgs, `--repeat=${fastProbes}`], {
      timeoutMs: fastProbeRemaining(),
      authHealthCheck: typeof authHealthCheck === 'function' ? checkAuth : null
    })
    if (probe.auth_watchdog_failure) {
      result.fast_probe.status = 'blocked'
      result.fast_probe.primary_failure = probe.auth_watchdog_failure
    }
    const batchSamples = Array.isArray(probe.value?.samples) ? probe.value.samples : []
    let batchFailure = null
    for (const sample of batchSamples) {
      const evaluation = evaluateFastProbe({
        report: sample,
        expectedIdentity: fastExpectedIdentity,
        commandStatus: probe.status
      })
      result.fast_probe.completed_cycles =
        Number(sample.index) || result.fast_probe.completed_cycles + 1
      result.fast_probe.samples.push({
        index: Number(sample.index) || result.fast_probe.completed_cycles,
        passed: evaluation.passed,
        identity: evaluation.identity,
        failures: evaluation.failures
      })
      if (!evaluation.passed) {
        batchFailure = evaluation.failures[0]
        break
      }
    }
    if (!batchFailure && (probe.status !== 0 || probe.value?.status !== 'ready')) {
      batchFailure = {
        code: probe.value?.code || 'qa_reliability_fast_probe_batch_failed',
        command_status: probe.status,
        completed_cycles: result.fast_probe.completed_cycles,
        target_cycles: fastProbes
      }
    }
    if (!batchFailure && result.fast_probe.completed_cycles !== fastProbes) {
      batchFailure = {
        code: 'qa_reliability_fast_probe_batch_incomplete',
        completed_cycles: result.fast_probe.completed_cycles,
        target_cycles: fastProbes
      }
    }
    result.current_step = 'fast_probe'
    result.last_progress_at = new Date(now()).toISOString()
    if (batchFailure) {
      result.fast_probe.status = 'blocked'
      result.fast_probe.primary_failure = batchFailure
    }
    writeAtomic(statePath, result)
  }
  const fastStop = await cleanup({ timeoutMs: Math.max(1000, fastProbeRemaining()) })
  result.fast_probe.stop = fastStop
  result.fast_probe.ended_at = new Date(now()).toISOString()
  result.fast_probe.duration_ms = Date.parse(result.fast_probe.ended_at) - fastProbeStartedAt
  if (result.fast_probe.status !== 'blocked') {
    if (result.fast_probe.completed_cycles !== fastProbes) {
      result.fast_probe.status = 'blocked'
      result.fast_probe.primary_failure = {
        code: 'qa_reliability_fast_probe_count_invalid',
        completed_cycles: result.fast_probe.completed_cycles,
        target_cycles: fastProbes
      }
    } else if (
      fastStop.status !== 0 ||
      fastStop.value?.status !== 'ready' ||
      fastStop.value?.code !== 'qa_runtime_stopped'
    ) {
      result.fast_probe.status = 'blocked'
      result.fast_probe.primary_failure = {
        code: fastStop.value?.code || 'qa_reliability_fast_probe_cleanup_failed',
        stop: fastStop
      }
    } else {
      result.fast_probe.status = 'passed'
    }
  }
  if (result.fast_probe.status !== 'passed') {
    result.status = 'blocked'
    result.primary_failure = result.fast_probe.primary_failure || {
      code: 'qa_reliability_fast_probe_failed'
    }
    result.ended_at = new Date(now()).toISOString()
    writeAtomic(path.join(directory, 'soak-report.json'), result)
    return result
  }
  if (result.auth_watchdog) {
    result.auth_watchdog.status = 'passed'
  }
  result.status = 'passed'
  result.completed_attempts = attempts
  result.failed_attempts = 0
  result.current_step = 'complete'
  result.last_progress_at = new Date(now()).toISOString()
  result.ended_at = new Date(now()).toISOString()
  result.total_duration_ms = Date.parse(result.ended_at) - reliabilityStartedAt
  writeAtomic(path.join(directory, 'soak-report.json'), result)
  return result
}

export async function runAutomatorSoak(options = {}) {
  const dispatchRunId = options.dispatchRunId || `automator-v3-soak-${Date.now()}`
  const runLease = resolveQaRunLease({
    dispatchRunId,
    kind: 'soak',
    runInstanceId: options.runInstanceId,
    runLeaseToken: options.runLeaseToken,
    runLease: options.runLease
  })
  try {
    return await runAutomatorSoakWithLease({
      ...options,
      attempts: options.coldStarts ?? options.attempts,
      fastProbes: options.fastProbes,
      dispatchRunId,
      runLease
    })
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
    const report = await runAutomatorSoak(parseSoakArgs())
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = report.status === 'passed' ? 0 : 1
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ status: 'blocked', code: 'qa_soak_configuration_invalid', message: error.message }, null, 2)}\n`
    )
    process.exitCode = 1
  }
}
