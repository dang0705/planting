#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  authOperatingMode,
  canAcceptDailyPublish,
  currentShared,
  dailyDevToolsState,
  health,
  isAcceptedAuthConsumptionSource,
  isManagedDevToolsCommand,
  isFreshAuthConsumptionEvidence,
  MANAGED_PACKAGE_DIR,
  processStartIdentity,
  readAuthConsumptionEvidence,
  readDailyAuth,
  readDailyCapability,
  SYSTEM_PACKAGE_DIR,
  SYSTEM_NW_BINARY,
  OFFICIAL_ELECTRON_ACTIVE
} from './qa-auth-broker-core.mjs'
import {
  SYSTEM_APP_ASAR,
  SYSTEM_ELECTRON
} from './patch-wechat-devtools-launcher.mjs'
import {
  findQaProfileAuthRecord,
  qaAuthProfiles,
  readQaAuthManifest
} from './qa-auth-coordinator.mjs'
import { resolveQaRunLease } from './qa-run-lease.mjs'
import {
  resolveAutomatorV3ArtifactDirectory,
  AUTOMATOR_V3_SAFE_ID
} from './automator-v3-run-context.mjs'
import { createAuthRuntimeProbe } from './automator-auth-runtime-probe.mjs'
import { CONTROL_PORTS, SERVICE_PORTS, profileFromCommand } from './qa-devtools-topology.mjs'
import { QA_RUNTIME_WS_PORT } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-runtime-plane.mjs'
import { processTable } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DEFAULT_SAMPLES = 3
const DEFAULT_INTERVAL_MS = 1000
const MIN_INTERVAL_MS = 250
export const AUTH_CONTINUITY_DURATION_MS = 30 * 60 * 1000
export const AUTH_CONTINUITY_MIN_SAMPLES = 300
export const AUTH_CONTINUITY_INTERVAL_MS = 6000
export const AUTH_CONTINUITY_RUNTIME_PROBE_INTERVAL_SAMPLES = 10
export const AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES = Math.ceil(
  AUTH_CONTINUITY_MIN_SAMPLES / AUTH_CONTINUITY_RUNTIME_PROBE_INTERVAL_SAMPLES
)
export const AUTH_CONTINUITY_RUNTIME_PROBE_TIMEOUT_MS = 60_000
// Runtime probes exercise a real mini-program request and can take longer
// than one six-second control-plane sample interval. Keep the sample clock
// independent from that work, while retaining a small bounded drain window
// for the last queued probe and any late samples.
export const AUTH_CONTINUITY_COMPLETION_GRACE_MS = 2 * 60 * 1000
export const AUTH_GENERATION_TRANSITION_WAIT_MS = 30_000
export const AUTH_GENERATION_TRANSITION_POLL_INTERVAL_MS = 1_000
const AUTH_EXPIRY_SERIALIZATION_TOLERANCE_MS = 1000
const SAFE_ID = AUTOMATOR_V3_SAFE_ID
const AUTH_GENERATION_TRANSITION_PENDING_CODES = new Set([
  'qa_auth_continuity_generation_consumption_unverified',
  'qa_auth_concurrency_qa_auth_not_runtime_ready',
  'qa_auth_concurrency_effective_ticket_source_unproven',
  'qa_auth_concurrency_profile_ticket_mismatch',
  'qa_auth_concurrency_auth_generation_mismatch'
])

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

async function withRuntimeProbeTimeout(task, timeoutMs = AUTH_CONTINUITY_RUNTIME_PROBE_TIMEOUT_MS) {
  const boundedTimeoutMs = Math.max(1, Math.floor(timeoutMs))
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `qa_auth_continuity_runtime_probe_timeout after ${boundedTimeoutMs}ms`
      )
      error.code = 'qa_auth_continuity_runtime_probe_timeout'
      error.timeoutMs = boundedTimeoutMs
      reject(error)
    }, boundedTimeoutMs)
  })
  try {
    return await Promise.race([Promise.resolve().then(task), timeout])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function authMaterialEvidence(value) {
  if (!value) {
    return {
      identity_hash: null,
      signature_hash: null,
      ticket_hash: null,
      ticket_expired_at: null,
      signature_expired_at: null
    }
  }
  return {
    identity_hash: value.openid ? sha256(value.openid) : null,
    signature_hash: value.signature ? sha256(value.signature) : null,
    ticket_hash: value.newticket ? sha256(value.newticket) : null,
    ticket_expired_at: Number(value.ticketExpiredTime) || null,
    signature_expired_at: Number(value.signatureExpiredTime) || null
  }
}

function authConsumptionMatchesQaProcess(value) {
  const event = value?.auth_consumption || value?.qa?.auth_consumption || null
  const sharedGeneration = Number(value?.shared?.auth_generation || 0) || null
  const eventGeneration = Number(event?.auth_generation || 0) || null
  if (!event || !sharedGeneration || !eventGeneration) {
    return false
  }
  if (event.identity_hash !== value?.qa?.identity_hash || eventGeneration > sharedGeneration) {
    return false
  }
  return isFreshAuthConsumptionEvidence(event, {
    role: 'qa',
    pid: value?.qa?.main_pid,
    process_start_identity: value?.qa?.process_start_identity,
    profile: value?.qa?.profile,
    auth_generation: eventGeneration,
    identity_hash: event.identity_hash,
    ticket_hash: event.ticket_hash,
    // The exact process/start/profile binding remains mandatory. Do not
    // reject a stable process solely because the single-writer broker rotated
    // the shared ticket after this process consumed its prior material.
    max_age_ms: null
  })
}

function parseArgs(argv = process.argv.slice(2)) {
  const result = {
    allowLive: false,
    continuity: false,
    samples: DEFAULT_SAMPLES,
    intervalMs: DEFAULT_INTERVAL_MS,
    dispatchRunId: `automator-v3-auth-concurrency-${Date.now()}`,
    outputDirectory: null,
    runInstanceId: null,
    runLeaseToken: null
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index])
    if (argument === '--allow-live') {
      result.allowLive = true
      continue
    }
    if (argument === '--continuity') {
      result.continuity = true
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
    if (key === 'samples') {
      result.samples = Number(value)
    }
    if (key === 'interval-ms') {
      result.intervalMs = Number(value)
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
    throw new Error('auth concurrency 必须显式提供 --allow-live')
  }
  if (!Number.isInteger(result.samples) || result.samples !== DEFAULT_SAMPLES) {
    throw new Error(`auth concurrency samples 必须恰好为 ${DEFAULT_SAMPLES}`)
  }
  if (!Number.isInteger(result.intervalMs) || result.intervalMs < MIN_INTERVAL_MS) {
    throw new Error(`auth concurrency interval-ms 不能小于 ${MIN_INTERVAL_MS}`)
  }
  if (!SAFE_ID.test(result.dispatchRunId)) {
    throw new Error('dispatch-run-id 格式无效')
  }
  if (Boolean(result.runInstanceId) !== Boolean(result.runLeaseToken)) {
    throw new Error('run-instance-id 和 run-lease-token 必须同时提供')
  }
  // A standalone run does not know its run instance until the lease is
  // acquired. Defer the default directory derivation so the matrix can bind
  // artifacts to that lease instead of rejecting its own unscoped path.
  if (result.runInstanceId) {
    result.outputDirectory = resolveOutputDirectory(
      result.outputDirectory,
      result.dispatchRunId,
      result.runInstanceId
    )
  }
  return result
}

function resolveOutputDirectory(requested, dispatchRunId, runInstanceId) {
  if (!runInstanceId) {
    const directory = path.resolve(
      requested ||
        path.join(
          repoRoot,
          '.tmp',
          'dispatch-task',
          dispatchRunId,
          'qa-artifacts',
          'automator-auth-concurrency'
        )
    )
    const allowedRoot = path.resolve(repoRoot, '.tmp', 'dispatch-task')
    if (directory !== allowedRoot && !directory.startsWith(`${allowedRoot}${path.sep}`)) {
      throw new Error('auth concurrency output-dir 必须位于 .tmp/dispatch-task 内')
    }
    return directory
  }
  return resolveAutomatorV3ArtifactDirectory(
    dispatchRunId,
    runInstanceId,
    'automator-auth-concurrency',
    requested
  )
}

function writeAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, filePath)
}

function startupObservation(value) {
  if (!value) {
    return null
  }
  return {
    source: 'automator_v3_suite_initial_bootstrap',
    command: value.command || 'bootstrap',
    status: value.status,
    signal: value.signal || null,
    timed_out: value.timed_out === true,
    value: value.value
      ? {
          status: value.value.status || null,
          code: value.value.code || null,
          run_instance_id: value.value.run_instance_id || null,
          supervisor_state: value.value.supervisor || null
        }
      : null
  }
}

function readProfileAuth(profile) {
  const record = findQaProfileAuthRecord(profile)
  if (!record) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(record.filePath, 'utf8'))
  } catch {
    return null
  }
}

function effectiveQaAuthMaterial({ qaAuth, shared, authManifest, qaMain } = {}) {
  const sharedIdentity = shared?.identityHash || null
  const manifestIdentity = authManifest.value?.identity_hash || null
  if (
    qaMain &&
    sharedIdentity &&
    sharedIdentity === manifestIdentity &&
    shared?.openid &&
    shared?.signature &&
    shared?.newticket
  ) {
    return {
      value: shared,
      source: 'broker_effective_shared'
    }
  }
  return {
    value: qaAuth,
    source: 'qa_profile_local'
  }
}

function profileProcesses(profile) {
  const expected = path.resolve(profile)
  const expectedPaths = new Set([expected])
  if (OFFICIAL_ELECTRON_ACTIVE) {
    expectedPaths.add(path.dirname(expected))
  }
  return processTable().filter(
    item => expectedPaths.has(path.resolve(profileFromCommand(item.command) || ''))
  )
}

function hasPortArg(command, flag, port) {
  const text = String(command || '')
  return new RegExp(
    `${flag}\\s+${Number(port)}(?:\\s|$)|${flag}=${Number(port)}(?:\\s|$)`,
    'u'
  ).test(text)
}

function qaBundleArgsVerified(command, profile) {
  const text = String(command || '')
  if (OFFICIAL_ELECTRON_ACTIVE) {
    return Boolean(
      text.includes(SYSTEM_ELECTRON) &&
      text.includes(SYSTEM_APP_ASAR) &&
      text.includes('--cli') &&
      text.includes(`--user-data-dir=${path.dirname(path.resolve(profile))}`)
    )
  }
  return Boolean(
    text.includes(SYSTEM_NW_BINARY) &&
    text.includes(`--package-dir=${SYSTEM_PACKAGE_DIR}`) &&
    text.includes(`--user-data-dir=${path.resolve(profile)}`)
  )
}

function mainDevtoolsProcess(items) {
  return (
    items.find(item => {
      const command = String(item.command)
      return (
        ((OFFICIAL_ELECTRON_ACTIVE &&
          command.includes(SYSTEM_ELECTRON) &&
          command.includes(SYSTEM_APP_ASAR) &&
          command.includes('--cli')) ||
          command.includes('wechatdevtools')) &&
        (command.includes('--ide-http-port') || command.includes('--remote-port'))
      )
    }) || null
  )
}

function listenerPids(port) {
  const result = spawnSync('lsof', [`-tiTCP:${Number(port)}`, '-sTCP:LISTEN'], {
    encoding: 'utf8'
  })
  return result.status === 0
    ? String(result.stdout || '')
        .split(/\s+/u)
        .filter(Boolean)
        .map(Number)
        .filter(Number.isInteger)
    : []
}

function listenerOwnedByProfile(pid, expectedProfile, processByPid) {
  const process = processByPid.get(Number(pid))
  const command = String(process?.command || '')
  const observedProfile = profileFromCommand(command)
  const expected = path.resolve(expectedProfile || '')
  const profileMatches =
    path.resolve(observedProfile || '') === expected ||
    (OFFICIAL_ELECTRON_ACTIVE && path.resolve(observedProfile || '') === path.dirname(expected))
  const officialRuntimeProcess =
    OFFICIAL_ELECTRON_ACTIVE &&
    command.includes(SYSTEM_ELECTRON) &&
    command.includes(SYSTEM_APP_ASAR) &&
    command.includes('--cli')
  const managedRuntimeProcess =
    officialRuntimeProcess ||
    isManagedDevToolsCommand(command, { role: 'daily' }) ||
    isManagedDevToolsCommand(command, { role: 'qa' }) ||
    command.includes(`--nwapp-path=${MANAGED_PACKAGE_DIR}`) ||
    command.includes(`--nwapp-path=${SYSTEM_PACKAGE_DIR}`)
  return Boolean(
    process &&
    observedProfile &&
    profileMatches &&
    managedRuntimeProcess
  )
}

function snapshot() {
  const profiles = qaAuthProfiles()
  const daily = dailyDevToolsState()
  const qaProcesses = profileProcesses(profiles.qa)
  const qaMain = mainDevtoolsProcess(qaProcesses)
  const dailyMain = mainDevtoolsProcess(daily.processes)
  const shared = currentShared()
  const dailyAuth = readDailyAuth()
  const qaAuth = readProfileAuth(profiles.qa)
  const authManifest = readQaAuthManifest()
  const brokerHealth = health()
  const capability = readDailyCapability()
  const dailyRealpath = fs.existsSync(profiles.daily) ? fs.realpathSync(profiles.daily) : null
  const qaRealpath = fs.existsSync(profiles.qa) ? fs.realpathSync(profiles.qa) : null
  const qaExpectedPids = new Set(qaProcesses.map(item => Number(item.pid)))
  const processByPid = new Map(processTable().map(item => [Number(item.pid), item]))
  const dailyListeners = {
    control: listenerPids(CONTROL_PORTS.daily),
    service: listenerPids(SERVICE_PORTS.daily)
  }
  const qaListeners = {
    control: listenerPids(CONTROL_PORTS.qa),
    service: listenerPids(SERVICE_PORTS.qa),
    automator: listenerPids(QA_RUNTIME_WS_PORT)
  }
  const qaIdentity = qaAuth?.openid
    ? sha256(qaAuth.openid)
    : authManifest.value?.identity_hash || null
  const effectiveQaAuth = effectiveQaAuthMaterial({
    qaAuth,
    shared,
    authManifest,
    qaMain
  })
  const authConsumption = readAuthConsumptionEvidence()
  const qaConsumption = authConsumption?.latest_by_role?.qa || authConsumption?.latest || null
  const sharedIdentity = shared?.identityHash || null
  const sharedAuthUsable = Boolean(
    shared?.openid &&
    shared?.signature &&
    shared?.newticket &&
    Number(shared.ticketExpiredTime) > Date.now() + 5000 &&
    Number(shared.signatureExpiredTime) > Date.now() + 5000
  )
  // A managed daily DevTools runtime may have already consumed a broker
  // refresh while its legacy local-storage record is still expired. The
  // shared record is then the only current auth material, but it is not a
  // substitute for runtime proof: the suite performs a real daily wx.request
  // immediately before the matrix. Keep the source explicit in the evidence.
  const effectiveDailyAuth =
    dailyAuth || (daily.active && daily.managed && sharedAuthUsable ? shared : null)
  const dailyCapabilityVerified = canAcceptDailyPublish({
    role: 'daily',
    dailyProcess: daily,
    capability: capability?.capability,
    capabilityState: capability
  })
  const listenerOwnership = {
    daily: Object.values(dailyListeners).every(
      pids =>
        pids.length > 0 &&
        pids.every(pid => listenerOwnedByProfile(pid, dailyRealpath, processByPid))
    ),
    qa:
      qaListeners.control.length > 0 &&
      qaListeners.control.every(pid => qaExpectedPids.has(pid)) &&
      qaListeners.automator.length > 0 &&
      qaListeners.automator.every(pid => qaExpectedPids.has(pid))
  }
  return {
    captured_at: new Date().toISOString(),
    auth_mode: authOperatingMode(daily),
    daily: {
      active: daily.active,
      managed: daily.managed,
      pids: daily.pids,
      profile: dailyRealpath,
      identity_hash: effectiveDailyAuth?.openid ? sha256(effectiveDailyAuth.openid) : null,
      identity_source: dailyAuth
        ? 'daily_profile'
        : effectiveDailyAuth
          ? 'broker_shared_runtime'
          : null,
      auth_material: authMaterialEvidence(effectiveDailyAuth),
      auth_material_source: dailyAuth
        ? 'daily_profile'
        : effectiveDailyAuth
          ? 'broker_shared_runtime'
          : null,
      capability_verified: dailyCapabilityVerified,
      main_pid: Number(dailyMain?.pid || 0) || null,
      process_start_identity: dailyMain ? processStartIdentity(Number(dailyMain.pid)) : null,
      main_command: dailyMain?.command || null
    },
    qa: {
      active: Boolean(qaMain),
      pids: qaProcesses.map(item => Number(item.pid)).filter(Number.isInteger),
      profile: qaRealpath,
      identity_hash: qaIdentity,
      auth_material: authMaterialEvidence(effectiveQaAuth.value),
      auth_material_source: effectiveQaAuth.source,
      main_pid: Number(qaMain?.pid || 0) || null,
      process_start_identity: qaMain ? processStartIdentity(Number(qaMain.pid)) : null,
      bundle_verified: qaBundleArgsVerified(qaMain?.command, profiles.qa),
      main_command: qaMain?.command || null,
      auth_manifest: {
        runtime_ready: authManifest.runtime_ready === true,
        auth_generation: Number(authManifest.value?.auth_generation || 0) || null,
        identity_hash: authManifest.value?.identity_hash || null
      },
      auth_consumption: qaConsumption
    },
    shared: {
      identity_hash: sharedIdentity,
      auth_material: authMaterialEvidence(shared),
      auth_generation: Number(shared?.authGeneration || 0) || null,
      source_role: shared?.sourceRole || null,
      writer_role: shared?.writerRole || null,
      updated_at_ms: Number(shared?.updatedAt || 0) || null,
      ticket_expired_at: Number(shared?.ticketExpiredTime || 0) || null,
      signature_expired_at: Number(shared?.signatureExpiredTime || 0) || null
    },
    ports: {
      daily: {
        control: CONTROL_PORTS.daily,
        service: SERVICE_PORTS.daily,
        listeners: dailyListeners
      },
      qa: { control: CONTROL_PORTS.qa, service: SERVICE_PORTS.qa, listeners: qaListeners },
      ownership: listenerOwnership
    },
    broker: {
      code: brokerHealth.code,
      auth_mode: brokerHealth.auth_mode,
      daily_capability_verified: brokerHealth.daily_capability?.verified === true,
      auth_generation: Number(brokerHealth.auth_generation || 0) || null
    },
    auth_consumption: qaConsumption,
    raw: {
      daily_auth_present: Boolean(dailyAuth),
      daily_shared_auth_fallback: Boolean(!dailyAuth && effectiveDailyAuth),
      qa_auth_present: Boolean(qaAuth),
      qa_main_command_present: Boolean(qaMain),
      qa_profile_realpath: qaRealpath,
      daily_profile_realpath: dailyRealpath
    }
  }
}

export function evaluateAuthConcurrency(value) {
  const failures = []
  const { daily, qa, shared, ports, broker } = value
  if (value.auth_mode !== 'managed_daily_single_writer') {
    failures.push({ code: 'qa_auth_concurrency_requires_managed_daily', observed: value.auth_mode })
  }
  if (!daily.active || !daily.managed || !daily.capability_verified) {
    failures.push({ code: 'qa_auth_concurrency_daily_owner_unverified', daily })
  }
  if (
    !Number.isInteger(daily.main_pid) ||
    !Number.isInteger(qa.main_pid) ||
    !daily.pids.includes(daily.main_pid) ||
    !qa.pids.includes(qa.main_pid) ||
    daily.main_pid === qa.main_pid
  ) {
    failures.push({
      code: 'qa_auth_concurrency_main_owner_pid_unverified',
      daily_pid: daily.main_pid || null,
      qa_pid: qa.main_pid || null,
      daily_pids: daily.pids,
      qa_pids: qa.pids
    })
  }
  if (
    !daily.process_start_identity ||
    !qa.process_start_identity ||
    daily.process_start_identity === qa.process_start_identity
  ) {
    failures.push({
      code: 'qa_auth_concurrency_process_start_identity_unverified',
      daily_process_start_identity: daily.process_start_identity || null,
      qa_process_start_identity: qa.process_start_identity || null
    })
  }
  if (
    !hasPortArg(daily.main_command, '--ide-http-port', ports.daily.control) ||
    !hasPortArg(daily.main_command, '--remote-port', ports.daily.service)
  ) {
    failures.push({
      code: 'qa_auth_concurrency_daily_port_args_unverified',
      command: daily.main_command
    })
  }
  if (
    !hasPortArg(qa.main_command, '--ide-http-port', ports.qa.control) ||
    !hasPortArg(qa.main_command, '--remote-port', ports.qa.service)
  ) {
    failures.push({ code: 'qa_auth_concurrency_qa_port_args_unverified', command: qa.main_command })
  }
  if (!qa.active || !qa.profile) {
    failures.push({ code: 'qa_auth_concurrency_qa_process_missing', qa })
  }
  if (qa.bundle_verified !== true) {
    failures.push({
      code: 'qa_auth_concurrency_qa_bundle_unverified',
      command: qa.main_command || null
    })
  }
  if (!daily.profile || !qa.profile || daily.profile === qa.profile) {
    failures.push({ code: 'qa_auth_concurrency_profiles_not_separate', daily, qa })
  }
  const identities = [daily.identity_hash, qa.identity_hash, shared.identity_hash]
  const identityObservationComplete = identities.every(value =>
    /^[a-f0-9]{64}$/u.test(String(value || ''))
  )
  if (!identityObservationComplete) {
    failures.push({
      code: 'qa_auth_concurrency_identity_observation_incomplete',
      identities,
      daily_auth_material_source: value?.daily?.auth_material_source || null,
      shared_ticket_expired_at: shared.ticket_expired_at || null
    })
  } else if (new Set(identities).size !== 1) {
    failures.push({ code: 'qa_auth_concurrency_identity_mismatch', identities })
  }
  const material = [daily.auth_material, qa.auth_material, shared.auth_material]
  for (const field of ['identity_hash', 'signature_hash', 'ticket_hash']) {
    const values = material.map(item => item?.[field] ?? null)
    if (!values[0] || values.some(value => value !== values[0])) {
      failures.push({
        code: 'qa_auth_concurrency_profile_ticket_mismatch',
        field,
        values
      })
    }
  }
  for (const field of ['ticket_expired_at', 'signature_expired_at']) {
    const values = material.map(item => Number(item?.[field] || 0))
    const finite = values.every(value => Number.isFinite(value) && value > 0)
    const drift = finite ? Math.max(...values) - Math.min(...values) : Infinity
    if (!finite || drift > AUTH_EXPIRY_SERIALIZATION_TOLERANCE_MS) {
      failures.push({
        code: 'qa_auth_concurrency_profile_ticket_mismatch',
        field,
        values,
        max_drift_ms: Number.isFinite(drift) ? drift : null,
        allowed_drift_ms: AUTH_EXPIRY_SERIALIZATION_TOLERANCE_MS
      })
    }
  }
  if (!qa.auth_manifest.runtime_ready) {
    failures.push({ code: 'qa_auth_concurrency_qa_auth_not_runtime_ready', qa: qa.auth_manifest })
  }
  if (qa.auth_material_source !== 'broker_effective_shared') {
    failures.push({
      code: 'qa_auth_concurrency_effective_ticket_source_unproven',
      source: qa.auth_material_source || null
    })
  }
  if (
    !['daily', 'broker_observed_daily', 'qa', 'qa-auth-broker'].includes(shared.source_role) ||
    shared.writer_role !== 'qa-auth-broker' ||
    !Number.isFinite(Number(shared.updated_at_ms)) ||
    Number(shared.updated_at_ms) <= 0
  ) {
    failures.push({
      code: 'qa_auth_concurrency_single_writer_source_unverified',
      source_role: shared.source_role || null,
      writer_role: shared.writer_role || null,
      updated_at_ms: shared.updated_at_ms || null
    })
  }
  if (!authConsumptionMatchesQaProcess(value)) {
    failures.push({
      code: 'qa_auth_concurrency_consumption_receipt_missing_or_mismatch',
      observed: value.auth_consumption || null
    })
  }
  if (
    !shared.auth_generation ||
    qa.auth_manifest.auth_generation !== shared.auth_generation ||
    broker.auth_generation !== shared.auth_generation
  ) {
    failures.push({
      code: 'qa_auth_concurrency_auth_generation_mismatch',
      shared_generation: shared.auth_generation,
      qa_generation: qa.auth_manifest.auth_generation,
      broker_generation: broker.auth_generation
    })
  }
  if (!broker.daily_capability_verified) {
    failures.push({ code: 'qa_auth_concurrency_broker_daily_capability_unverified', broker })
  }
  if (!ports.ownership.daily || !ports.ownership.qa) {
    failures.push({ code: 'qa_auth_concurrency_port_owner_unverified', ports })
  }
  if (
    new Set([ports.daily.control, ports.daily.service, ports.qa.control, ports.qa.service]).size !==
    4
  ) {
    failures.push({ code: 'qa_auth_concurrency_ports_not_separate', ports })
  }
  if (
    !shared.auth_generation ||
    shared.ticket_expired_at <= Date.now() + 5000 ||
    shared.signature_expired_at <= Date.now() + 5000
  ) {
    failures.push({ code: 'qa_auth_concurrency_shared_ticket_not_fresh', shared })
  }
  return { passed: failures.length === 0, failures }
}

function authContinuityIdentity(value) {
  return {
    auth_mode: value?.auth_mode || null,
    daily_profile: value?.daily?.profile || null,
    qa_profile: value?.qa?.profile || null,
    daily_main_pid: value?.daily?.main_pid || null,
    qa_main_pid: value?.qa?.main_pid || null,
    daily_process_start_identity: value?.daily?.process_start_identity || null,
    qa_process_start_identity: value?.qa?.process_start_identity || null,
    daily_identity_hash: value?.daily?.identity_hash || null,
    qa_identity_hash: value?.qa?.identity_hash || null,
    shared_identity_hash: value?.shared?.identity_hash || null,
    daily_control_port: value?.ports?.daily?.control || null,
    daily_service_port: value?.ports?.daily?.service || null,
    qa_control_port: value?.ports?.qa?.control || null,
    qa_service_port: value?.ports?.qa?.service || null,
    qa_auth_material_source: value?.qa?.auth_material_source || null,
    auth_writer_role: value?.shared?.writer_role || null
  }
}

function compactAuthContinuityObservation(value, evaluation, identity) {
  return {
    captured_at: value?.captured_at || null,
    passed: evaluation.passed,
    failures: evaluation.failures,
    identity,
    auth_generation: value?.shared?.auth_generation || null,
    source_role: value?.shared?.source_role || null,
    writer_role: value?.shared?.writer_role || null,
    updated_at_ms: value?.shared?.updated_at_ms || null,
    ticket_hash: value?.shared?.auth_material?.ticket_hash || null,
    signature_hash: value?.shared?.auth_material?.signature_hash || null,
    ticket_expired_at: value?.shared?.ticket_expired_at || null,
    signature_expired_at: value?.shared?.signature_expired_at || null,
    auth_consumption: value?.auth_consumption || value?.qa?.auth_consumption || null
  }
}

export function evaluateAuthContinuity(value, baselineIdentity = null, previousGeneration = null) {
  const evaluation = evaluateAuthConcurrency(value)
  const generation = Number(value?.shared?.auth_generation || 0) || null
  const generationRotated =
    previousGeneration !== null && generation !== null && generation > previousGeneration
  // The initial three samples prove that the QA process consumed the shared
  // material. A long-lived process does not emit a new consumption receipt on
  // every observation, so only the receipt-age requirement is excluded after
  // the first sample; process/profile/material consistency remains hard.
  const failures = evaluation.failures.filter(
    failure =>
      failure.code !== 'qa_auth_concurrency_consumption_receipt_missing_or_mismatch' &&
      (!generationRotated ||
        ![
          'qa_auth_concurrency_profile_ticket_mismatch',
          'qa_auth_concurrency_qa_auth_not_runtime_ready',
          'qa_auth_concurrency_effective_ticket_source_unproven',
          'qa_auth_concurrency_auth_generation_mismatch'
        ].includes(failure.code))
  )
  const identity = authContinuityIdentity(value)
  if (baselineIdentity && JSON.stringify(identity) !== JSON.stringify(baselineIdentity)) {
    failures.push({
      code: 'qa_auth_continuity_runtime_identity_changed',
      expected: baselineIdentity,
      observed: identity
    })
  }
  if (!generation) {
    failures.push({ code: 'qa_auth_continuity_generation_missing' })
  }
  if (previousGeneration !== null && generation < previousGeneration) {
    failures.push({
      code: 'qa_auth_continuity_generation_regressed',
      previous_generation: previousGeneration,
      observed_generation: generation
    })
  }
  if (previousGeneration !== null && generation > previousGeneration) {
    const consumption = value?.auth_consumption || value?.qa?.auth_consumption || null
    const consumedAt = Number(consumption?.consumed_at_ms)
    const updatedAt = Number(value?.shared?.updated_at_ms)
    const consumedNewGeneration =
      consumption?.role === 'qa' &&
      isAcceptedAuthConsumptionSource(consumption?.source, consumption?.role) &&
      Number(consumption?.pid) === Number(value?.qa?.main_pid) &&
      consumption?.process_start_identity === value?.qa?.process_start_identity &&
      path.resolve(String(consumption?.profile_realpath || '')) ===
        path.resolve(String(value?.qa?.profile || '')) &&
      Number(consumption?.auth_generation) === generation &&
      consumption?.identity_hash === value?.shared?.auth_material?.identity_hash &&
      consumption?.ticket_hash === value?.shared?.auth_material?.ticket_hash &&
      Number.isFinite(updatedAt) &&
      updatedAt > 0 &&
      Number.isFinite(consumedAt) &&
      consumedAt >= updatedAt
    // A receipt for the previous generation proves only that the process was
    // healthy before rotation. Once the broker publishes a newer generation,
    // the QA runtime must acknowledge that exact generation before continuity
    // can proceed; otherwise the transition race would be silently accepted.
    if (!consumedNewGeneration) {
      failures.push({
        code: 'qa_auth_continuity_generation_consumption_unverified',
        previous_generation: previousGeneration,
        observed_generation: generation,
        updated_at_ms: updatedAt || null,
        auth_consumption: consumption
      })
    }
  }
  return { passed: failures.length === 0, failures, identity, generation }
}

function isGenerationTransitionPending(evaluation) {
  return Boolean(
    evaluation?.failures?.length &&
    evaluation.failures.every(failure => AUTH_GENERATION_TRANSITION_PENDING_CODES.has(failure.code))
  )
}

export async function runAuthConcurrencyMatrix({
  samples = DEFAULT_SAMPLES,
  intervalMs = DEFAULT_INTERVAL_MS,
  dispatchRunId,
  runInstanceId,
  artifactRunInstanceId,
  outputDirectory,
  capture = snapshot,
  sleep = delay,
  suiteBootstrap = null,
  continuity = false,
  continuityProbe = null,
  runtimeProbeTimeoutMs = AUTH_CONTINUITY_RUNTIME_PROBE_TIMEOUT_MS,
  completionGraceMs = AUTH_CONTINUITY_COMPLETION_GRACE_MS,
  now = () => Date.now()
} = {}) {
  if (samples !== DEFAULT_SAMPLES) {
    throw new Error(`samples must equal ${DEFAULT_SAMPLES}`)
  }
  if (!Number.isInteger(intervalMs) || intervalMs < MIN_INTERVAL_MS) {
    throw new Error(`intervalMs must be >= ${MIN_INTERVAL_MS}`)
  }
  const directory = resolveOutputDirectory(
    outputDirectory,
    dispatchRunId,
    artifactRunInstanceId || null
  )
  const report = {
    status: 'running',
    contract:
      'managed daily + QA same-account concurrent runtime, distinct profiles and single auth writer',
    dispatch_run_id: dispatchRunId,
    run_instance_id: runInstanceId || null,
    output_directory: directory,
    startup_observation: startupObservation(suiteBootstrap),
    samples: [],
    continuity: continuity
      ? {
          status: 'running',
          contract:
            'managed daily + QA control-plane continuity, fixed identities, broker single writer',
          required_duration_ms: AUTH_CONTINUITY_DURATION_MS,
          required_samples: AUTH_CONTINUITY_MIN_SAMPLES,
          interval_ms: AUTH_CONTINUITY_INTERVAL_MS,
          runtime_probe_interval_samples: AUTH_CONTINUITY_RUNTIME_PROBE_INTERVAL_SAMPLES,
          required_runtime_probes: AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES,
          runtime_probe_count: 0,
          samples: []
        }
      : { status: 'not_requested' }
  }
  const stateFile = path.join(directory, 'auth-concurrency-state.json')
  const reportFile = path.join(directory, 'auth-concurrency-report.json')
  const writeTerminal = () => {
    writeAtomic(stateFile, report)
    writeAtomic(reportFile, report)
    return report
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeAtomic(stateFile, report)
  for (let index = 0; index < samples; index += 1) {
    const observed = capture()
    const evaluation = evaluateAuthConcurrency(observed)
    report.samples.push({ index: index + 1, observed, ...evaluation })
    writeAtomic(stateFile, report)
    if (!evaluation.passed) {
      report.status = 'blocked'
      report.primary_failure = evaluation.failures[0]
      report.ended_at = new Date().toISOString()
      return writeTerminal()
    }
    if (index < samples - 1) {
      await sleep(intervalMs)
    }
  }
  if (continuity) {
    const continuityReport = report.continuity
    const continuityStartedAt = now()
    const continuityDeadline = continuityStartedAt + AUTH_CONTINUITY_DURATION_MS
    const continuityCompletionDeadline = continuityDeadline + completionGraceMs
    let baselineIdentity = null
    let firstSample = true
    let previousGeneration = null
    let nextSampleDueAt = continuityStartedAt + AUTH_CONTINUITY_INTERVAL_MS
    let probeChain = Promise.resolve()
    let probeDrainAborted = false
    const pendingProbes = []

    const markContinuityBlocked = failure => {
      probeDrainAborted = true
      continuityReport.status = 'blocked'
      continuityReport.primary_failure = failure
      report.status = 'blocked'
      report.primary_failure = failure
      report.ended_at = new Date().toISOString()
      continuityReport.ended_at = report.ended_at
      continuityReport.duration_ms = now() - continuityStartedAt
      continuityReport.baseline_identity = baselineIdentity
      return writeTerminal()
    }

    const enqueueRuntimeProbe = ({
      sampleIndex,
      previousGeneration: probePreviousGeneration,
      expectedGeneration,
      expectedIdentityHash,
      reason
    }) => {
      continuityReport.runtime_probe_count += 1
      const slot = {
        sampleIndex,
        settled: false,
        result: null,
        promise: null
      }
      const task = probeChain.then(async () => {
        if (probeDrainAborted) {
          return {
            status: 'blocked',
            code: 'qa_auth_continuity_runtime_probe_cancelled'
          }
        }
        if (typeof continuityProbe !== 'function') {
          return {
            status: 'blocked',
            code: 'qa_auth_continuity_runtime_probe_unconfigured'
          }
        }
        try {
          return await withRuntimeProbeTimeout(
            () =>
              continuityProbe({
                index: sampleIndex,
                previousGeneration: probePreviousGeneration,
                expectedGeneration,
                expectedIdentityHash,
                reason
              }),
            runtimeProbeTimeoutMs
          )
        } catch (error) {
          return {
            status: 'blocked',
            code: error?.code || 'qa_auth_continuity_runtime_probe_failed',
            message: error?.message || String(error)
          }
        }
      })
      slot.promise = task.then(result => {
        slot.result = result
        slot.settled = true
        return result
      })
      // Keep later probes ordered without making the sample clock wait for
      // the current request. The probe itself remains individually bounded.
      probeChain = slot.promise.then(() => undefined)
      pendingProbes.push(slot)
      return slot
    }

    const applyRuntimeProbe = slot => {
      const sample = continuityReport.samples[slot.sampleIndex - 1]
      if (!sample) {
        return {
          passed: false,
          failure: {
            code: 'qa_auth_continuity_runtime_probe_sample_missing',
            sample_index: slot.sampleIndex
          }
        }
      }
      const runtimeProbe = slot.result
      sample.runtime_probe = runtimeProbe
      const failures = []
      if (runtimeProbe?.status !== 'passed') {
        failures.push({
          code: runtimeProbe?.code || 'qa_auth_continuity_runtime_probe_failed',
          runtime_probe: runtimeProbe
        })
      }
      if (
        runtimeProbe?.status === 'passed' &&
        Number(runtimeProbe.generation) < Number(sample.auth_generation)
      ) {
        failures.push({
          code: 'qa_auth_continuity_runtime_probe_generation_regressed',
          runtime_probe_generation: runtimeProbe.generation || null,
          observed_generation: sample.auth_generation || null
        })
      }
      if (
        runtimeProbe?.status === 'passed' &&
        runtimeProbe.identity_hash !== sample.identity?.shared_identity_hash
      ) {
        failures.push({
          code: 'qa_auth_continuity_runtime_probe_identity_mismatch',
          runtime_probe_identity: runtimeProbe.identity_hash || null,
          observed_identity: sample.identity?.shared_identity_hash || null
        })
      }
      if (failures.length > 0) {
        sample.failures = [...(sample.failures || []), ...failures]
        sample.passed = false
        return { passed: false, failure: failures[0] }
      }
      return { passed: true, failure: null }
    }

    const flushRuntimeProbes = async ({ waitForAll = false } = {}) => {
      for (const slot of pendingProbes) {
        if (waitForAll && !slot.settled) {
          const remainingGraceMs = continuityCompletionDeadline - now()
          if (remainingGraceMs <= 0) {
            probeDrainAborted = true
            return {
              code: 'qa_auth_continuity_runtime_probe_drain_timeout',
              pending_probe_count: pendingProbes.length,
              completion_grace_ms: completionGraceMs
            }
          }
          let timer = null
          const settled = await Promise.race([
            slot.promise.then(() => true),
            new Promise(resolve => {
              timer = setTimeout(() => resolve(false), remainingGraceMs)
            })
          ])
          if (timer) {
            clearTimeout(timer)
          }
          if (!settled && !slot.settled) {
            probeDrainAborted = true
            return {
              code: 'qa_auth_continuity_runtime_probe_drain_timeout',
              pending_probe_count: pendingProbes.length,
              completion_grace_ms: completionGraceMs
            }
          }
        }
        if (!slot.settled) {
          continue
        }
        const applied = applyRuntimeProbe(slot)
        pendingProbes.splice(pendingProbes.indexOf(slot), 1)
        if (!applied.passed) {
          return applied.failure
        }
      }
      return null
    }

    continuityReport.sampling_schedule = 'fixed_cadence_non_blocking_runtime_probes'
    continuityReport.completion_grace_ms = completionGraceMs
    while (
      continuityReport.samples.length < AUTH_CONTINUITY_MIN_SAMPLES ||
      now() < continuityDeadline
    ) {
      if (now() > continuityCompletionDeadline) {
        break
      }
      const remainingToSample = nextSampleDueAt - now()
      if (remainingToSample > 0) {
        await sleep(remainingToSample)
      }
      const pendingFailure = await flushRuntimeProbes()
      if (pendingFailure) {
        return markContinuityBlocked(pendingFailure)
      }
      const nextSampleIndex = continuityReport.samples.length + 1
      let observed = capture()
      let evaluation = firstSample
        ? evaluateAuthConcurrency(observed)
        : evaluateAuthContinuity(observed, baselineIdentity, previousGeneration)
      let identity = authContinuityIdentity(observed)
      baselineIdentity ||= identity
      let observedGeneration = Number(observed?.shared?.auth_generation || 0) || null
      let generationChanged = previousGeneration !== null && observedGeneration > previousGeneration
      let generationTransitionWait = null
      if (
        !firstSample &&
        generationChanged &&
        !evaluation.passed &&
        isGenerationTransitionPending(evaluation)
      ) {
        const waitStartedAt = now()
        const waitDeadline = waitStartedAt + AUTH_GENERATION_TRANSITION_WAIT_MS
        let retries = 0
        while (now() < waitDeadline) {
          const remaining = waitDeadline - now()
          await sleep(Math.min(AUTH_GENERATION_TRANSITION_POLL_INTERVAL_MS, remaining))
          const candidate = capture()
          const candidateGeneration = Number(candidate?.shared?.auth_generation || 0) || null
          const candidateEvaluation = evaluateAuthContinuity(
            candidate,
            baselineIdentity,
            previousGeneration
          )
          retries += 1
          observed = candidate
          identity = authContinuityIdentity(candidate)
          observedGeneration = candidateGeneration
          generationChanged =
            previousGeneration !== null && candidateGeneration > previousGeneration
          evaluation = candidateEvaluation
          if (evaluation.passed || !isGenerationTransitionPending(evaluation)) {
            break
          }
        }
        generationTransitionWait = {
          status: evaluation.passed ? 'passed' : 'blocked',
          waited_ms: Math.max(0, now() - waitStartedAt),
          retries,
          timeout_ms: AUTH_GENERATION_TRANSITION_WAIT_MS,
          generation: observedGeneration,
          failure: evaluation.passed ? null : evaluation.failures[0]
        }
        if (
          !evaluation.passed &&
          now() >= waitDeadline &&
          isGenerationTransitionPending(evaluation)
        ) {
          evaluation = {
            ...evaluation,
            failures: [
              {
                code: 'qa_auth_continuity_generation_consumption_timeout',
                generation: observedGeneration,
                wait_ms: Math.max(0, now() - waitStartedAt),
                last_failure: evaluation.failures[0]
              }
            ]
          }
        }
      }
      const periodicRuntimeProbe =
        nextSampleIndex % AUTH_CONTINUITY_RUNTIME_PROBE_INTERVAL_SAMPLES === 0
      const sample = {
        ...compactAuthContinuityObservation(observed, evaluation, identity),
        runtime_probe: null,
        generation_transition_wait: generationTransitionWait
      }
      continuityReport.samples.push(sample)
      if (periodicRuntimeProbe || generationChanged) {
        sample.runtime_probe = { status: 'pending' }
        enqueueRuntimeProbe({
          sampleIndex: nextSampleIndex,
          previousGeneration,
          expectedGeneration: observedGeneration,
          expectedIdentityHash: observed?.shared?.identity_hash || null,
          reason: generationChanged ? 'shared_auth_generation_rotated' : 'periodic_runtime_probe'
        })
      }
      writeAtomic(stateFile, report)
      firstSample = false
      previousGeneration = observedGeneration
      if (!evaluation.passed) {
        return markContinuityBlocked(evaluation.failures[0])
      }
      nextSampleDueAt += AUTH_CONTINUITY_INTERVAL_MS
    }

    const pendingFailure = await flushRuntimeProbes({ waitForAll: true })
    if (pendingFailure) {
      return markContinuityBlocked(pendingFailure)
    }
    continuityReport.status = 'passed'
    continuityReport.started_at = new Date(continuityStartedAt).toISOString()
    continuityReport.ended_at = new Date().toISOString()
    const continuityDurationMs = now() - continuityStartedAt
    continuityReport.duration_ms = continuityDurationMs
    continuityReport.baseline_identity = baselineIdentity
    if (
      continuityDurationMs < AUTH_CONTINUITY_DURATION_MS ||
      continuityDurationMs > AUTH_CONTINUITY_DURATION_MS + completionGraceMs ||
      continuityReport.samples.length < AUTH_CONTINUITY_MIN_SAMPLES
    ) {
      continuityReport.status = 'blocked'
      continuityReport.primary_failure = {
        code: 'qa_auth_continuity_deadline_exceeded',
        duration_ms: continuityDurationMs,
        required_duration_ms: AUTH_CONTINUITY_DURATION_MS,
        allowed_completion_grace_ms: completionGraceMs,
        samples: continuityReport.samples.length,
        required_samples: AUTH_CONTINUITY_MIN_SAMPLES
      }
      report.status = 'blocked'
      report.primary_failure = continuityReport.primary_failure
      report.ended_at = new Date().toISOString()
      return writeTerminal()
    }
    if (continuityReport.runtime_probe_count < AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES) {
      continuityReport.status = 'blocked'
      continuityReport.primary_failure = {
        code: 'qa_auth_continuity_runtime_probe_count_invalid',
        observed: continuityReport.runtime_probe_count,
        required: AUTH_CONTINUITY_REQUIRED_RUNTIME_PROBES
      }
      report.status = 'blocked'
      report.primary_failure = continuityReport.primary_failure
      report.ended_at = continuityReport.ended_at
      return writeTerminal()
    }
  }
  report.status = 'passed'
  report.ended_at = new Date().toISOString()
  return writeTerminal()
}

export async function runAuthConcurrencyMatrixWithLease(options = {}) {
  const dispatchRunId = options.dispatchRunId || `automator-v3-auth-concurrency-${Date.now()}`
  const runLease = resolveQaRunLease({
    dispatchRunId,
    kind: 'auth-concurrency',
    runInstanceId: options.runInstanceId,
    runLeaseToken: options.runLeaseToken,
    runLease: options.runLease
  })
  try {
    return await runAuthConcurrencyMatrix({
      ...options,
      dispatchRunId,
      runInstanceId: runLease.run_instance_id,
      artifactRunInstanceId: runLease.run_instance_id
    })
  } finally {
    if (runLease.owned) {
      runLease.release()
    }
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  try {
    const args = parseArgs()
    const runtimeProbe = args.continuity
      ? await createAuthRuntimeProbe({
          dispatchRunId: args.dispatchRunId,
          runInstanceId: args.runInstanceId,
          runLeaseToken: args.runLeaseToken
        })
      : null
    let report
    try {
      report = await runAuthConcurrencyMatrixWithLease({
        ...args,
        continuityProbe: runtimeProbe?.probe || null
      })
    } finally {
      await runtimeProbe?.close?.()
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exitCode = report.status === 'passed' ? 0 : 1
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ status: 'blocked', code: 'qa_auth_concurrency_configuration_invalid', message: error.message }, null, 2)}\n`
    )
    process.exitCode = 1
  }
}
