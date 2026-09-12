#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isValidPngEvidence } from './qa-png-evidence.mjs'
import { runQaNodeCommand } from './qa-node-command.mjs'
import { qaRunLeaseArgs, resolveQaRunLease } from './qa-run-lease.mjs'
import {
  AUTOMATOR_V3_SAFE_ID,
  resolveAutomatorV3ArtifactDirectory
} from './automator-v3-run-context.mjs'

export const AUTOMATOR_STRESS_TARGET_ATTEMPTS = 3
export const AUTOMATOR_STRESS_HEALTH_SAMPLES = 3
const COMMAND_TIMEOUT_MS = 7 * 60 * 1000
const SAFE_ID = AUTOMATOR_V3_SAFE_ID

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeCommand = path.join(repoRoot, 'scripts', 'qa', 'automator-runtime.mjs')

function positiveIntegerOrInvalid(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

export function parseStressArgs(argv = process.argv.slice(2)) {
  const result = {
    attempts: AUTOMATOR_STRESS_TARGET_ATTEMPTS,
    healthSamples: AUTOMATOR_STRESS_HEALTH_SAMPLES,
    dispatchRunId: `automator-v3-stress-${Date.now()}`,
    outputDirectory: null
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index])
    if (!argument.startsWith('--')) {
      continue
    }
    const [key, inlineValue] = argument.slice(2).split('=', 2)
    const value = inlineValue ?? argv[index + 1]
    if (inlineValue === undefined) {
      index += 1
    }
    if (key === 'attempts') {
      result.attempts = positiveIntegerOrInvalid(value, result.attempts)
    }
    if (key === 'health-samples') {
      result.healthSamples = positiveIntegerOrInvalid(value, result.healthSamples)
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
  if (
    result.attempts !== AUTOMATOR_STRESS_TARGET_ATTEMPTS ||
    result.healthSamples !== AUTOMATOR_STRESS_HEALTH_SAMPLES
  ) {
    throw new Error(
      `stress 参数越界：attempts 必须恰好为 ${AUTOMATOR_STRESS_TARGET_ATTEMPTS}，health-samples 必须为 ${AUTOMATOR_STRESS_HEALTH_SAMPLES}`
    )
  }
  if (!SAFE_ID.test(result.dispatchRunId)) {
    throw new Error('dispatch-run-id 格式无效')
  }
  if (Boolean(result.runInstanceId) !== Boolean(result.runLeaseToken)) {
    throw new Error('run-instance-id 和 run-lease-token 必须同时提供')
  }
  result.outputDirectory = result.runInstanceId
    ? resolveStressOutputDirectory(
        result.outputDirectory,
        result.dispatchRunId,
        result.runInstanceId
      )
    : resolveStressOutputDirectory(result.outputDirectory, result.dispatchRunId)
  return result
}

export function resolveStressOutputDirectory(outputDirectory, dispatchRunId, runInstanceId) {
  if (runInstanceId) {
    return resolveAutomatorV3ArtifactDirectory(
      dispatchRunId,
      runInstanceId,
      'automator-stress',
      outputDirectory
    )
  }
  const defaultDirectory = path.join(
    repoRoot,
    '.tmp',
    'dispatch-task',
    dispatchRunId,
    'qa-artifacts',
    'automator-stress'
  )
  const resolved = path.resolve(outputDirectory || defaultDirectory)
  const allowedRoot = path.resolve(repoRoot, '.tmp', 'dispatch-task')
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error('stress output-dir 必须位于 .tmp/dispatch-task 内')
  }
  return resolved
}

function parseJsonOutput(output) {
  const text = String(output || '').trim()
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

export function isValidPng(filePath) {
  return isValidPngEvidence(filePath)
}

export function runtimeIdentity(value) {
  const state = value?.supervisor_state || value?.supervisor || value
  return {
    runtimeKey: state?.runtime_key || value?.runtime_key || null,
    generation: Number(state?.generation || value?.generation || 0) || null,
    supervisorPid: Number(state?.pid || value?.supervisor_pid || 0) || null,
    devtoolsPid: Number(state?.devtools_pid || value?.devtools_pid || 0) || null,
    processStartIdentity: state?.process_start_identity || value?.process_start_identity || null,
    sessionId: state?.session_id || value?.session_id || null,
    localRuntimePid: Number(state?.local_runtime_pid || value?.local_runtime_pid || 0) || null
  }
}

function screenshotPathFromDoctor(report) {
  return (
    report?.evidence?.screenshot ||
    report?.checks?.preflight?.evidence?.screenshot ||
    report?.checks?.preflight?.checks?.screenshot?.path ||
    null
  )
}

function screenshotAttemptsFromPreflight(preflight) {
  return (
    preflight?.checks?.renderer_screenshot_attempts ||
    preflight?.checks?.rpc_steps?.screenshot_attempts ||
    preflight?.checks?.screenshot?.attempts ||
    null
  )
}

export function evaluateDoctorSample({ report, expectedIdentity = null, commandStatus = 0 } = {}) {
  const failures = []
  if (commandStatus !== 0) {
    failures.push({ code: 'qa_stress_doctor_command_failed', command_status: commandStatus })
  }
  if (!report || report.status !== 'ready' || report.code !== 'qa_runtime_doctor_ready') {
    failures.push({ code: report?.code || 'qa_runtime_doctor_not_ready', report })
  }
  const identity = runtimeIdentity(report)
  if (
    !identity.runtimeKey ||
    !identity.generation ||
    !identity.supervisorPid ||
    !identity.devtoolsPid ||
    !identity.processStartIdentity ||
    !identity.sessionId ||
    !identity.localRuntimePid
  ) {
    failures.push({ code: 'qa_stress_runtime_identity_missing', identity })
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
          code: 'qa_stress_runtime_identity_changed',
          key,
          expected: expectedIdentity[key],
          observed: identity[key]
        })
      }
    }
  }
  const preflight = report?.checks?.preflight
  if (!preflight || preflight.status !== 'passed') {
    failures.push({ code: preflight?.code || 'qa_stress_preflight_not_passed', preflight })
  }
  if (preflight?.checks?.project_identity?.passed !== true) {
    failures.push({
      code: 'qa_stress_project_identity_not_proven',
      check: preflight?.checks?.project_identity || null
    })
  }
  for (const [name, check] of Object.entries({
    profile: report?.checks?.profile,
    channel: report?.checks?.channel,
    ownership: report?.checks?.ownership,
    manifest: report?.checks?.manifest,
    lan: report?.checks?.lan,
    page_data: preflight?.checks?.page_data
  })) {
    if (check?.passed !== true) {
      failures.push({ code: `qa_stress_${name}_not_proven`, check })
    }
  }
  const wxRequestPassed =
    preflight?.checks?.wx_request?.passed === true ||
    preflight?.checks?.runtime_wx_request?.passed === true ||
    preflight?.checks?.wx_request_probe?.passed === true
  const wxRequestCheck =
    preflight?.checks?.wx_request ||
    preflight?.checks?.runtime_wx_request ||
    preflight?.checks?.wx_request_probe ||
    null
  if (
    !wxRequestPassed ||
    wxRequestCheck?.identity_required !== true ||
    wxRequestCheck?.identity_resolved !== true
  ) {
    failures.push({
      code: 'qa_stress_real_wx_request_not_proven',
      checks: preflight?.checks || null
    })
  }
  const screenshotPath = screenshotPathFromDoctor(report)
  const screenshotPassed = preflight?.checks?.screenshot?.passed === true
  if (!screenshotPassed || !screenshotPath || !isValidPng(screenshotPath)) {
    failures.push({ code: 'qa_stress_first_png_invalid', screenshotPath })
  }
  const screenshotAttempts = screenshotAttemptsFromPreflight(preflight)
  if (
    !Array.isArray(screenshotAttempts) ||
    screenshotAttempts.length !== 1 ||
    screenshotAttempts[0]?.attempt !== 1 ||
    screenshotAttempts[0]?.status !== 'passed'
  ) {
    failures.push({
      code: 'qa_stress_first_screenshot_attempt_not_proven',
      attempts: screenshotAttempts
    })
  }
  const recovery = [
    preflight?.targeted_restart,
    report?.targeted_restart,
    report?.supervisor_state?.bootstrap_preflight?.targeted_restart
  ].find(item => item?.attempted === true)
  if (recovery?.attempted === true) {
    failures.push({ code: 'qa_stress_recovery_used', recovery })
  }
  return { passed: failures.length === 0, failures, identity, screenshotPath, report }
}

async function runRuntimeCommand(
  command,
  runtimeArgs = [],
  { timeoutMs = COMMAND_TIMEOUT_MS } = {}
) {
  const result = await runQaNodeCommand({
    command: process.execPath,
    args: [runtimeCommand, command, '--json', ...runtimeArgs],
    cwd: repoRoot,
    env: { ...process.env, QA_AUTOMATOR_STRESS: '1' },
    timeoutMs,
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

async function invokeCommand(commandRunner, command, args = []) {
  try {
    const result = await commandRunner(command, args)
    if (result && typeof result === 'object') {
      return result
    }
    return {
      command,
      status: null,
      signal: null,
      timedOut: false,
      stdout: '',
      stderr: '',
      value: {
        status: 'blocked',
        code: 'qa_stress_command_result_invalid'
      }
    }
  } catch (error) {
    return {
      command,
      status: null,
      signal: null,
      timedOut: false,
      stdout: '',
      stderr: '',
      value: {
        status: 'blocked',
        code: 'qa_stress_command_threw',
        message: error?.message || String(error)
      }
    }
  }
}

function writeAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, filePath)
}

function iterationReport({ index, startedAt, endedAt, bootstrap, samples, stop }) {
  const failures = []
  if (bootstrap.status !== 0 || bootstrap.value?.status !== 'ready') {
    failures.push({ code: bootstrap.value?.code || 'qa_stress_bootstrap_failed', bootstrap })
  }
  for (const sample of samples) {
    if (!sample.passed) {
      failures.push(...sample.failures)
    }
  }
  if (stop?.raw?.status !== 0 || stop?.status !== 'ready' || stop?.code !== 'qa_runtime_stopped') {
    failures.push({ code: stop?.code || 'qa_stress_cleanup_failed', stop })
  }
  return {
    index,
    status: failures.length ? 'failed' : 'passed',
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(endedAt).toISOString(),
    duration_ms: endedAt - startedAt,
    bootstrap,
    doctor_samples: samples,
    stop,
    failures
  }
}

export async function runAutomatorStressWithLease({
  attempts = AUTOMATOR_STRESS_TARGET_ATTEMPTS,
  healthSamples = AUTOMATOR_STRESS_HEALTH_SAMPLES,
  dispatchRunId = `automator-v3-stress-${Date.now()}`,
  outputDirectory,
  commandRunner = runRuntimeCommand,
  now = () => Date.now(),
  runLease
} = {}) {
  if (attempts !== AUTOMATOR_STRESS_TARGET_ATTEMPTS) {
    throw new Error('attempts must equal 3')
  }
  if (healthSamples !== AUTOMATOR_STRESS_HEALTH_SAMPLES) {
    throw new Error('healthSamples must equal 3')
  }
  const directory = resolveStressOutputDirectory(
    runLease.owned ? null : outputDirectory,
    dispatchRunId,
    runLease.run_instance_id
  )
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const statePath = path.join(directory, 'stress-state.json')
  const reports = []
  const result = {
    status: 'running',
    dispatch_run_id: dispatchRunId,
    run_instance_id: runLease.run_instance_id,
    target_attempts: attempts,
    health_samples_per_generation: healthSamples,
    cold_start_contract: 'bootstrap -> doctor x3 -> first PNG + real wx.request -> stop',
    output_directory: directory,
    iterations: reports,
    started_at: new Date(now()).toISOString()
  }
  writeAtomic(statePath, result)
  const leaseArgs = qaRunLeaseArgs(runLease)
  const initialStop = await invokeCommand(commandRunner, 'stop', leaseArgs)
  if (
    initialStop.status !== 0 ||
    initialStop.value?.status !== 'ready' ||
    initialStop.value?.code !== 'qa_runtime_stopped'
  ) {
    result.status = 'blocked'
    result.primary_failure = {
      code: initialStop.value?.code || 'qa_stress_initial_cleanup_failed',
      initial_stop: initialStop
    }
    result.ended_at = new Date(now()).toISOString()
    writeAtomic(path.join(directory, 'stress-report.json'), result)
    return result
  }
  result.initial_stop = initialStop
  writeAtomic(statePath, result)
  for (let index = 1; index <= attempts; index += 1) {
    const iterationStarted = now()
    const bootstrap = await invokeCommand(commandRunner, 'bootstrap', leaseArgs)
    const samples = []
    const bootstrapIdentity = runtimeIdentity(bootstrap.value)
    let expectedIdentity =
      bootstrapIdentity.runtimeKey &&
      bootstrapIdentity.generation &&
      bootstrapIdentity.supervisorPid &&
      bootstrapIdentity.devtoolsPid
        ? bootstrapIdentity
        : null
    if (bootstrap.status === 0 && bootstrap.value?.status === 'ready') {
      const previous = reports.at(-1)?.bootstrap_identity || null
      if (previous) {
        if (bootstrapIdentity.generation !== previous.generation) {
          samples.push({
            sample: 0,
            passed: false,
            failures: [
              {
                code: 'qa_stress_generation_changed_unexpectedly',
                expected: previous.generation,
                observed: bootstrapIdentity.generation
              }
            ],
            identity: bootstrapIdentity
          })
        }
        for (const key of [
          'processStartIdentity',
          'sessionId',
          'supervisorPid',
          'devtoolsPid',
          'localRuntimePid'
        ]) {
          if (!bootstrapIdentity[key] || bootstrapIdentity[key] === previous[key]) {
            samples.push({
              sample: 0,
              passed: false,
              failures: [
                {
                  code: 'qa_stress_cold_start_process_identity_reused',
                  key,
                  expected_different_from: previous[key] || null,
                  observed: bootstrapIdentity[key] || null
                }
              ],
              identity: bootstrapIdentity
            })
          }
        }
      }
      for (let sampleIndex = 1; sampleIndex <= healthSamples; sampleIndex += 1) {
        const doctor = await invokeCommand(commandRunner, 'doctor', [
          ...leaseArgs,
          `--artifact-dir=${path.join(directory, `iteration-${index}`, `doctor-${sampleIndex}`)}`
        ])
        const sample = evaluateDoctorSample({
          report: doctor.value,
          expectedIdentity,
          commandStatus: doctor.status
        })
        if (!expectedIdentity && sample.identity.runtimeKey) {
          expectedIdentity = sample.identity
        }
        samples.push({ sample: sampleIndex, ...sample, command: doctor })
        if (!sample.passed) {
          break
        }
      }
    }
    const stopResult = await invokeCommand(commandRunner, 'stop', leaseArgs)
    const stop = {
      status: stopResult.value?.status || 'blocked',
      code: stopResult.value?.code || 'qa_stress_cleanup_failed',
      raw: stopResult
    }
    const report = iterationReport({
      index,
      startedAt: iterationStarted,
      endedAt: now(),
      bootstrap,
      samples,
      stop
    })
    report.bootstrap_identity = bootstrapIdentity
    reports.push(report)
    result.iterations = reports
    result.completed_attempts = reports.filter(item => item.status === 'passed').length
    result.failed_attempts = reports.filter(item => item.status !== 'passed').length
    result.last_iteration = report
    writeAtomic(statePath, result)
    if (report.status !== 'passed') {
      result.status = 'failed'
      result.failed_iteration = index
      result.primary_failure = report.failures[0] || { code: 'qa_stress_iteration_failed' }
      result.ended_at = new Date(now()).toISOString()
      writeAtomic(path.join(directory, 'stress-report.json'), result)
      return result
    }
  }
  result.status =
    reports.length >= attempts && reports.every(item => item.status === 'passed')
      ? 'passed'
      : 'failed'
  result.completed_attempts = reports.filter(item => item.status === 'passed').length
  result.failed_attempts = reports.filter(item => item.status !== 'passed').length
  result.ended_at = new Date(now()).toISOString()
  writeAtomic(path.join(directory, 'stress-report.json'), result)
  return result
}

export async function runAutomatorStress(options = {}) {
  const dispatchRunId = options.dispatchRunId || `automator-v3-stress-${Date.now()}`
  const runLease = resolveQaRunLease({
    dispatchRunId,
    kind: 'stress',
    runInstanceId: options.runInstanceId,
    runLeaseToken: options.runLeaseToken,
    runLease: options.runLease
  })
  try {
    return await runAutomatorStressWithLease({ ...options, dispatchRunId, runLease })
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
    const report = await runAutomatorStress(parseStressArgs())
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = report.status === 'passed' ? 0 : 1
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ status: 'blocked', code: 'qa_stress_configuration_invalid', message: error.message }, null, 2)}\n`
    )
    process.exitCode = 1
  }
}
