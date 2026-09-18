#!/usr/bin/env node
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  QA_RUNTIME_FUNCTION_PORT_BASE,
  QA_RUNTIME_CONTROL_PORT,
  QA_RUNTIME_LAN_PORT,
  QA_RUNTIME_PROFILE_HOME,
  QA_RUNTIME_ROOT,
  QA_RUNTIME_DEVTOOLS_RUNTIME_KIND,
  QA_RUNTIME_WS_PORT,
  deriveQaRuntime,
  ensureQaOwnerMarker,
  ensureQaRuntimeRoot,
  qaRuntimeFixedPorts,
  readQaRuntimeManifest,
  runtimeManifestIsReady,
  reapStaleQaFixedPortLocks,
  processStartIdentity
} from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-runtime-plane.mjs'
import {
  QA_RUNTIME_PROFILE_PRODUCT_HASH,
  QA_RUNTIME_AUTH_PROFILE_ROOT,
  localRuntimeEvidence,
  localRuntimeOwned,
  mainForSession,
  ownedRuntimeEvidence,
  processAlive,
  processTable
} from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs'
import { userDataDirFromCommand } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-process-topology.mjs'
import { runQaPreflight } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight.mjs'
import {
  ensureQaAuthAvailable,
  readQaAuthManifest,
  syncQaAuthFromDailyReadOnly
} from './qa-auth-coordinator.mjs'
import {
  buildQaHealthRequestUrl,
  qaBackendTargetMatches,
  resolveQaBackendTarget
} from './qa-backend-target.mjs'
import { assertQaRunLease } from './qa-run-lease.mjs'
import { automatorV3RunArtifactRoot } from './automator-v3-run-context.mjs'

const command = process.argv[2] || 'status'
const args = process.argv.slice(3)
const json = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
const errorResult = (code, message, details = {}) => ({ status: 'blocked', code, message, details })
const supervisorScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'automator-supervisor.mjs'
)
const supervisorStatePath = path.join(QA_RUNTIME_ROOT, 'supervisor', 'state.json')
const bootstrapLockPath = path.join(QA_RUNTIME_ROOT, 'supervisor', 'bootstrap.lock')
const defaultSourceProjectPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist/dev/mp-weixin'
)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SUPERVISOR_STOP_GRACE_MS = 45_000
// A cold formal session may need the full LAN watcher/function startup
// window (currently 180s) before DevTools can compile and expose Automator.
// Keep a margin for the supervisor's own profile and renderer readiness work;
// the previous 120s budget could terminate a healthy cold start mid-flight.
const SUPERVISOR_READY_TIMEOUT_MS = 240_000

function argumentValue(name) {
  const prefix = `--${name}=`
  const inline = args.find(value => value.startsWith(prefix))
  if (inline) {
    return inline.slice(prefix.length)
  }
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] || '' : ''
}

function acquireBootstrapLock() {
  ensureQaRuntimeRoot()
  const owner = {
    schema_version: 1,
    pid: process.pid,
    process_start_identity: processStartIdentity(process.pid),
    acquired_at: new Date().toISOString()
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let descriptor
    try {
      descriptor = fs.openSync(bootstrapLockPath, 'wx', 0o600)
      fs.writeFileSync(descriptor, `${JSON.stringify(owner)}\n`)
      fs.closeSync(descriptor)
      return {
        status: 'acquired',
        release() {
          try {
            const current = JSON.parse(fs.readFileSync(bootstrapLockPath, 'utf8'))
            if (
              Number(current?.pid) === owner.pid &&
              current?.process_start_identity === owner.process_start_identity
            ) {
              fs.rmSync(bootstrapLockPath, { force: true })
            }
          } catch {
            // The lock may already have been recovered after this process ended.
          }
        }
      }
    } catch (error) {
      if (descriptor !== undefined) {
        fs.closeSync(descriptor)
      }
      if (error?.code !== 'EEXIST') {
        return {
          status: 'blocked',
          code: 'qa_bootstrap_lock_failed',
          message: error?.message || String(error)
        }
      }
      let current = null
      try {
        current = JSON.parse(fs.readFileSync(bootstrapLockPath, 'utf8'))
      } catch {
        // A writer may be between create and write; retry once before reclaiming.
      }
      if (current && processAlive(current.pid, current.process_start_identity)) {
        return {
          status: 'blocked',
          code: 'qa_bootstrap_in_progress',
          owner_pid: Number(current.pid),
          acquired_at: current.acquired_at || null
        }
      }
      try {
        fs.rmSync(bootstrapLockPath, { force: true })
      } catch (cleanupError) {
        return {
          status: 'blocked',
          code: 'qa_bootstrap_stale_lock_unrecoverable',
          message: cleanupError?.message || String(cleanupError)
        }
      }
    }
  }
  return {
    status: 'blocked',
    code: 'qa_bootstrap_lock_race_retry_required'
  }
}

function runLeaseOptions() {
  return {
    dispatchRunId: argumentValue('dispatch-run-id'),
    runInstanceId: argumentValue('run-instance-id'),
    runLeaseToken: argumentValue('run-lease-token')
  }
}

function requireRunLease() {
  const { dispatchRunId, runInstanceId, runLeaseToken } = runLeaseOptions()
  if (!dispatchRunId && !runLeaseToken) {
    return null
  }
  if (!dispatchRunId || !runInstanceId || !runLeaseToken) {
    const error = new Error(
      '正式 QA 必须同时提供 dispatch-run-id、run-instance-id 和 run-lease-token'
    )
    error.code = 'qa_run_lease_arguments_incomplete'
    throw error
  }
  return assertQaRunLease({ dispatchRunId, runInstanceId, token: runLeaseToken })
}

function artifactDirectory() {
  const requested = argumentValue('artifact-dir')
  const { dispatchRunId, runInstanceId } = runLeaseOptions()
  const formal = Boolean(
    process.env.QA_AUTOMATOR_STRESS ||
    process.env.QA_AUTOMATOR_SOAK ||
    process.env.QA_AUTOMATOR_LIVE_MATRIX ||
    process.env.QA_AUTOMATOR_WARM_STABILITY
  )
  if (formal && !requested) {
    const error = new Error('正式 QA doctor 必须显式绑定独占 artifact-dir')
    error.code = 'qa_formal_artifact_directory_required'
    throw error
  }
  if (formal && !runInstanceId) {
    const error = new Error('正式 QA doctor 必须绑定 run-instance-id')
    error.code = 'qa_formal_run_instance_required'
    throw error
  }
  if (!requested) {
    return null
  }
  if (!dispatchRunId) {
    const error = new Error('artifact-dir 必须同时绑定 dispatch-run-id')
    error.code = 'qa_artifact_dispatch_id_required'
    throw error
  }
  const root = formal
    ? automatorV3RunArtifactRoot(dispatchRunId, runInstanceId)
    : path.resolve(repoRoot, '.tmp', 'dispatch-task', dispatchRunId)
  const resolved = path.resolve(requested)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    const error = new Error('artifact-dir 必须位于当前 dispatch 的 .tmp/dispatch-task 目录')
    error.code = 'qa_artifact_directory_outside_dispatch'
    throw error
  }
  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 })
  return resolved
}

function profilePath() {
  return path.join(QA_RUNTIME_AUTH_PROFILE_ROOT, QA_RUNTIME_PROFILE_PRODUCT_HASH)
}

function readCanonicalAuthManifest() {
  const state = readQaAuthManifest()
  const expectedProfile = path.resolve(profilePath())
  if (state.ready && state.value?.profile_realpath !== expectedProfile) {
    return { ready: false, code: 'qa_auth_profile_mismatch', value: state.value }
  }
  return state
}

function authMaterialCanStartRuntime(state) {
  return Boolean(
    state?.material_ready === true &&
    state?.value?.profile_realpath &&
    path.resolve(String(state.value.profile_realpath)) === path.resolve(profilePath()) &&
    state.code !== 'qa_auth_profile_mismatch'
  )
}

function profileProcesses() {
  const profile = path.resolve(profilePath())
  const expected = new Set([profile])
  if (QA_RUNTIME_DEVTOOLS_RUNTIME_KIND === 'official_electron') {
    expected.add(path.dirname(profile))
  }
  return processTable().filter(item => {
    const observed = userDataDirFromCommand(item.command)
    return Boolean(observed && expected.has(path.resolve(observed)))
  })
}

function readSupervisorState() {
  try {
    return JSON.parse(fs.readFileSync(supervisorStatePath, 'utf8'))
  } catch {
    return null
  }
}

function supervisorCommand(pid) {
  return processTable().find(item => Number(item.pid) === Number(pid))?.command || ''
}

function supervisorLease() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(QA_RUNTIME_ROOT, 'supervisor', 'lease.json'), 'utf8')
    )
  } catch {
    return null
  }
}

function fixedPortListeners(port) {
  const result = spawnSync('lsof', ['-tiTCP:' + Number(port), '-sTCP:LISTEN'], {
    encoding: 'utf8'
  })
  return result.status === 0
    ? result.stdout
        .split(/\s+/u)
        .filter(Boolean)
        .map(Number)
        .filter(pid => pid > 0)
    : []
}

function supervisorOwnership(state) {
  if (!state || !processAlive(state.pid)) {
    return { status: 'absent', reason: 'supervisor_not_alive_or_blocked' }
  }
  const commandText = supervisorCommand(state.pid)
  const lease = supervisorLease()
  const processIdentity = processStartIdentity(state.pid)
  const commandMatches =
    commandText.includes('scripts/qa/automator-supervisor.mjs') &&
    /(?:^|\s)start(?:\s|$)/u.test(commandText)
  const startupState = state.status === 'starting' && !state.project_path && !state.profile
  const leaseMatches =
    Number(lease?.pid) === Number(state.pid) &&
    (startupState || lease?.runtime_key === state.runtime_key) &&
    typeof lease?.process_start_identity === 'string' &&
    lease.process_start_identity === processIdentity
  const sourcePathMatches =
    typeof state.source_project_path === 'string' &&
    path.resolve(state.source_project_path) === path.resolve(defaultSourceProjectPath)
  const profileMatches = startupState
    ? true
    : typeof state.profile === 'string' &&
      path.resolve(state.profile).startsWith(path.resolve(QA_RUNTIME_PROFILE_HOME) + path.sep)
  const runtimeMatches = startupState
    ? true
    : typeof state.project_path === 'string' &&
      path.resolve(state.project_path).startsWith(path.resolve(QA_RUNTIME_ROOT) + path.sep)
  if (
    !commandMatches ||
    !leaseMatches ||
    !sourcePathMatches ||
    !profileMatches ||
    !runtimeMatches
  ) {
    return {
      status: 'unknown',
      reason: 'supervisor_command_lease_source_profile_or_runtime_mismatch',
      pid: state.pid,
      command: commandText,
      lease
    }
  }
  if (typeof state.process_start_identity === 'string') {
    return state.process_start_identity === processIdentity
      ? { status: 'verified', process_start_identity: processIdentity }
      : {
          status: 'unknown',
          reason: 'supervisor_process_start_identity_mismatch',
          pid: state.pid
        }
  }
  // v3.0 states predate the persisted state identity. The lease was already
  // written with the identity, so this is safe to adopt exactly once and then
  // persist the stronger state before sending a signal.
  return {
    status: 'legacy_adoptable',
    process_start_identity: processIdentity,
    reason: 'state_missing_process_start_identity'
  }
}

function supervisorDetails() {
  const state = readSupervisorState()
  const ownership = supervisorOwnership(state)
  return {
    state,
    owned: ownership.status === 'verified',
    adoptable: ownership.status === 'legacy_adoptable',
    canStop: ownership.status === 'verified' || ownership.status === 'legacy_adoptable',
    ownership,
    command: state ? supervisorCommand(state.pid) : ''
  }
}

function hasDispatchValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function supervisorStateIsUnscoped(state) {
  return (
    state &&
    !hasDispatchValue(state.dispatch_run_id) &&
    !hasDispatchValue(state.run_instance_id) &&
    !hasDispatchValue(state.run_lease_token)
  )
}

function unscopedSupervisorCandidate(state) {
  if (!state || state.status !== 'ready' || !supervisorStateIsUnscoped(state)) {
    return { passed: false, code: 'qa_supervisor_not_unscoped_ready' }
  }
  const ownership = supervisorOwnership(state)
  if (ownership.status !== 'verified' && ownership.status !== 'legacy_adoptable') {
    return {
      passed: false,
      code: 'qa_supervisor_owner_unverified',
      ownership
    }
  }
  if (path.resolve(state.profile || '') !== path.resolve(profilePath())) {
    return {
      passed: false,
      code: 'qa_supervisor_profile_mismatch',
      expected_profile: path.resolve(profilePath()),
      observed_profile: path.resolve(state.profile || '')
    }
  }
  if (
    path.resolve(state.source_project_path || '') !== path.resolve(defaultSourceProjectPath) ||
    !path.resolve(state.project_path || '').startsWith(path.resolve(QA_RUNTIME_ROOT) + path.sep)
  ) {
    return {
      passed: false,
      code: 'qa_supervisor_runtime_path_mismatch',
      expected_source_project_path: path.resolve(defaultSourceProjectPath),
      observed_source_project_path: state.source_project_path || null,
      observed_project_path: state.project_path || null
    }
  }
  return {
    passed: true,
    ownership,
    process_start_identity: ownership.process_start_identity || state.process_start_identity || null
  }
}

function readSupervisorClaim() {
  const claimPath = `${supervisorStatePath}.claim`
  try {
    return JSON.parse(fs.readFileSync(claimPath, 'utf8'))
  } catch {
    return null
  }
}

function clearSupervisorClaim() {
  fs.rmSync(`${supervisorStatePath}.claim`, { force: true })
}

function claimUnscopedSupervisor(runLease) {
  if (!runLease) {
    return { status: 'not_attempted', code: 'qa_supervisor_dispatch_claim_not_requested' }
  }
  const claimPath = `${supervisorStatePath}.claim`
  const initial = readSupervisorState()
  const candidate = unscopedSupervisorCandidate(initial)
  if (!candidate.passed) {
    return {
      status: 'not_adopted',
      code: candidate.code,
      ownership: candidate.ownership || supervisorOwnership(initial)
    }
  }
  let descriptor
  try {
    fs.mkdirSync(path.dirname(claimPath), { recursive: true, mode: 0o700 })
    descriptor = fs.openSync(claimPath, 'wx', 0o600)
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify({
        schema_version: 1,
        pid: process.pid,
        process_start_identity: processStartIdentity(process.pid),
        target_pid: initial.pid,
        target_run_token: initial.run_token || null,
        dispatch_run_id: runLease.dispatch_run_id,
        run_instance_id: runLease.run_instance_id,
        claimed_at: new Date().toISOString()
      })}\n`
    )
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      return {
        status: 'blocked',
        code: 'qa_supervisor_claim_write_failed',
        message: error.message
      }
    }
    const existingClaim = readSupervisorClaim()
    const claimAlive = processAlive(
      existingClaim?.pid,
      existingClaim?.process_start_identity || null
    )
    if (claimAlive) {
      return {
        status: 'blocked',
        code: 'qa_supervisor_claim_in_progress',
        target_pid: existingClaim?.target_pid || null,
        claim_pid: existingClaim?.pid || null
      }
    }
    clearSupervisorClaim()
    return {
      status: 'blocked',
      code: 'qa_supervisor_claim_race_retry_required',
      target_pid: initial.pid
    }
  } finally {
    if (descriptor !== undefined) {
      fs.closeSync(descriptor)
    }
  }

  try {
    const latest = readSupervisorState()
    const latestCandidate = unscopedSupervisorCandidate(latest)
    if (
      !latestCandidate.passed ||
      Number(latest?.pid) !== Number(initial.pid) ||
      latest?.run_token !== initial.run_token
    ) {
      return {
        status: 'not_adopted',
        code: 'qa_supervisor_claim_target_changed',
        target_pid: initial.pid,
        observed_pid: latest?.pid || null,
        observed_run_token: latest?.run_token || null,
        ownership: latestCandidate.ownership || supervisorOwnership(latest)
      }
    }
    const adopted = {
      ...latest,
      process_start_identity:
        latest.process_start_identity || latestCandidate.process_start_identity,
      dispatch_run_id: runLease.dispatch_run_id,
      run_instance_id: runLease.run_instance_id,
      run_lease_token: runLease.token,
      ownership_migrated_at: new Date().toISOString(),
      ownership_migration_reason: 'unscoped_supervisor_claimed_for_dispatch',
      dispatch_claimed_at: new Date().toISOString()
    }
    const temporary = `${supervisorStatePath}.${process.pid}.${Date.now()}.claim.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(adopted, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temporary, supervisorStatePath)
    const verified = readSupervisorState()
    if (
      verified?.dispatch_run_id !== runLease.dispatch_run_id ||
      verified?.run_instance_id !== runLease.run_instance_id ||
      verified?.run_lease_token !== runLease.token ||
      Number(verified?.pid) !== Number(initial.pid)
    ) {
      return {
        status: 'blocked',
        code: 'qa_supervisor_claim_verification_failed',
        target_pid: initial.pid,
        observed: {
          dispatch_run_id: verified?.dispatch_run_id || null,
          run_instance_id: verified?.run_instance_id || null,
          pid: verified?.pid || null
        }
      }
    }
    return {
      status: 'adopted',
      code: 'qa_supervisor_unscoped_adopted',
      pid: verified.pid,
      process_start_identity: verified.process_start_identity,
      dispatch_run_id: verified.dispatch_run_id,
      run_instance_id: verified.run_instance_id
    }
  } finally {
    clearSupervisorClaim()
  }
}

function residualQaEvidence() {
  const profilePids = profileProcesses().map(item => Number(item.pid))
  const listeners = qaRuntimeFixedPorts().flatMap(item =>
    fixedPortListeners(item.port).map(pid => ({ kind: item.kind, port: item.port, pid }))
  )
  return { profile_pids: profilePids, fixed_port_listeners: listeners }
}

async function waitForQaResidueToClear(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let residue = residualQaEvidence()
  while (Date.now() < deadline) {
    residue = residualQaEvidence()
    if (residue.profile_pids.length === 0 && residue.fixed_port_listeners.length === 0) {
      return { status: 'cleared', residue }
    }
    await wait(250)
  }
  return { status: 'blocked', residue: residualQaEvidence() }
}

function manifests() {
  const root = path.join(QA_RUNTIME_ROOT, 'runtimes')
  if (!fs.existsSync(root)) {
    return []
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(item => item.isDirectory())
    .map(item => {
      const runtimePath = path.join(root, item.name, 'mp-weixin')
      return readQaRuntimeManifest(runtimePath)
    })
    .filter(Boolean)
}

function status() {
  let runLease = null
  try {
    runLease = requireRunLease()
  } catch (error) {
    return errorResult(error.code || 'qa_run_lease_invalid', error.message)
  }
  const auth = readCanonicalAuthManifest()
  const leasePath = path.join(QA_RUNTIME_ROOT, 'supervisor', 'lease.json')
  let lease = null
  try {
    lease = JSON.parse(fs.readFileSync(leasePath, 'utf8'))
  } catch {
    // No active supervisor lease is a normal idle state.
  }
  const supervisor = supervisorDetails()
  const supervisorAlive = Boolean(
    lease &&
    processAlive(lease.pid) &&
    supervisor.owned &&
    Number(lease.pid) === Number(supervisor.state?.pid)
  )
  const residual = residualQaEvidence()
  const hasResidual = residual.profile_pids.length > 0 || residual.fixed_port_listeners.length > 0
  // The profile and fixed-port evidence is expected while the current
  // supervisor generation is running. It is only stale residue when there is
  // no verified owner for that generation. Treating every live QA process as
  // residue made a healthy runtime report cleanup_failure on every status and
  // doctor call.
  const staleOwnerDetected = !supervisorAlive && (supervisor.adoptable || hasResidual)
  const authFailure = auth.ready
    ? null
    : {
        code: auth.code || 'qa_auth_required',
        reason: auth.reason || null,
        profile_readiness: auth
      }
  const cleanupFailure = staleOwnerDetected
    ? {
        code: 'qa_stale_qa_owner_detected',
        residual_qa_evidence: residual,
        supervisor_ownership: supervisor.ownership
      }
    : null
  const runtimeState = supervisorAlive
    ? 'running'
    : staleOwnerDetected
      ? 'stale_owner_detected'
      : auth.runtime_ready
        ? 'idle'
        : auth.ready
          ? 'auth_validation_required'
          : 'auth_required'
  return {
    status: runtimeState,
    code: authFailure
      ? authFailure.code
      : runtimeState === 'running'
        ? 'qa_runtime_running'
        : runtimeState === 'stale_owner_detected'
          ? 'qa_stale_qa_owner_detected'
          : runtimeState === 'idle'
            ? 'qa_runtime_idle'
            : auth.code,
    root: QA_RUNTIME_ROOT,
    profile_home: QA_RUNTIME_PROFILE_HOME,
    profile_path: profilePath(),
    profile_ready: auth.ready,
    auth_material_ready: auth.material_ready === true,
    auth_server_validated: auth.server_validated === true,
    runtime_ready: auth.runtime_ready === true,
    profile_readiness: auth,
    profile_processes: profileProcesses().map(item => item.pid),
    fixed_ports: qaRuntimeFixedPorts(),
    supervisor_lease: lease,
    run_lease: runLease
      ? {
          dispatch_run_id: runLease.dispatch_run_id,
          owner_pid: runLease.owner_pid,
          acquired_at: runLease.acquired_at
        }
      : null,
    supervisor_alive: supervisorAlive,
    supervisor_state: supervisor.state,
    supervisor_owner_verified: supervisor.owned,
    supervisor_adoptable: supervisor.adoptable,
    supervisor_ownership: supervisor.ownership,
    primary_failure: authFailure,
    cleanup_failure: cleanupFailure,
    residual_qa_evidence: residual,
    manifests: manifests()
  }
}

// The reliability gate needs a high-frequency control-plane probe, but it
// must not pretend that a control-plane check is a substitute for the full
// doctor preflight. Real cold-start iterations still run doctor (including
// page data, screenshot and wx.request). This probe intentionally reads only
// the current supervisor/manifest/lease files and checks persisted owner PIDs;
// it does not scan the process table, run lsof, recompute source fingerprints,
// or open the DevTools control channel. Those expensive identity checks belong
// to bootstrap and doctor and are sampled again by the cold-start tier.
function lightweightPidAlive(pid) {
  const numericPid = Number(pid)
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false
  }
  try {
    process.kill(numericPid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function fastProbe({ leaseValidated = false } = {}) {
  let runLease = null
  if (leaseValidated) {
    runLease = true
  } else {
    try {
      runLease = requireRunLease()
    } catch (error) {
      return errorResult(error.code || 'qa_run_lease_invalid', error.message)
    }
  }
  let backendTarget
  try {
    backendTarget = resolveQaBackendTarget(process.env, {
      port: QA_RUNTIME_LAN_PORT,
      functionPortBase: QA_RUNTIME_FUNCTION_PORT_BASE
    })
  } catch (error) {
    return errorResult(
      error.code || 'qa_backend_target_invalid',
      'QA fast probe 在复用任何 supervisor 状态前未通过 backend target 闸门',
      {
        stage: 'backend_target_preflight',
        message: error.message,
        details: error.details || null
      }
    )
  }
  const activeRunLease = runLeaseOptions()
  const state = readSupervisorState()
  const lease = supervisorLease()
  const auth = readCanonicalAuthManifest()
  const expectedProfile = path.resolve(profilePath())
  const observedProfile = state?.profile ? path.resolve(state.profile) : null
  const observedProject = state?.project_path ? path.resolve(state.project_path) : null
  const expectedRuntimeRoot = path.resolve(QA_RUNTIME_ROOT) + path.sep
  const supervisorAlive = lightweightPidAlive(state?.pid)
  const leaseMatches = Boolean(
    state &&
    (!activeRunLease.dispatchRunId ||
      (state.dispatch_run_id === activeRunLease.dispatchRunId &&
        state.run_instance_id === activeRunLease.runInstanceId &&
        state.run_lease_token === activeRunLease.runLeaseToken))
  )
  const supervisorLeaseMatches = Boolean(
    state &&
    lease &&
    Number(lease.pid) === Number(state.pid) &&
    lease.process_start_identity === state.process_start_identity &&
    lease.runtime_key === state.runtime_key
  )
  const manifest = observedProject ? readQaRuntimeManifest(observedProject) : null
  const manifestPassed = Boolean(
    manifest &&
    state &&
    manifest.runtime_key === state.runtime_key &&
    path.resolve(manifest.project_path || '') === observedProject &&
    Number(manifest.generation) === Number(state.generation) &&
    manifest.build_status === 'ready'
  )
  const lanLease = observedProject ? localRuntimeEvidence(observedProject) : null
  const lanOwnerPid = lanLease?.value?.owner_pid
  const lanChildPid = lanLease?.value?.child_pid
  const checks = {
    backend_target: {
      passed: qaBackendTargetMatches(state?.backend_target, backendTarget),
      expected: {
        mode: backendTarget.mode,
        environment_id: backendTarget.environmentId,
        base_url: backendTarget.baseUrl
      },
      observed: state?.backend_target || null
    },
    supervisor: {
      passed:
        state?.status === 'ready' &&
        supervisorAlive &&
        supervisorLeaseMatches &&
        state.dispatch_run_id === activeRunLease.dispatchRunId &&
        state.run_instance_id === activeRunLease.runInstanceId,
      pid: Number(state?.pid || 0) || null
    },
    lease: {
      passed: Boolean(
        runLease && leaseMatches && state?.run_lease_token === activeRunLease.runLeaseToken
      )
    },
    profile: {
      passed: observedProfile === expectedProfile && auth.runtime_ready === true,
      expected: expectedProfile,
      observed: observedProfile
    },
    ports: {
      passed:
        Number(state?.automator_port) === QA_RUNTIME_WS_PORT &&
        Number(state?.control_port) === QA_RUNTIME_CONTROL_PORT,
      automator_port: Number(state?.automator_port) || null,
      control_port: Number(state?.control_port) || null
    },
    ownership: {
      passed:
        supervisorAlive &&
        lightweightPidAlive(state?.devtools_pid) &&
        observedProfile === expectedProfile &&
        typeof observedProject === 'string' &&
        observedProject.startsWith(expectedRuntimeRoot),
      supervisor_pid: Number(state?.pid || 0) || null,
      devtools_pid: Number(state?.devtools_pid || 0) || null
    },
    manifest: {
      passed: manifestPassed,
      runtime_key: manifest?.runtime_key || null,
      generation: manifest?.generation || null,
      source_fingerprint: manifest?.source_fingerprint || null
    },
    lan: {
      passed: Boolean(
        lanLease?.value &&
        path.resolve(String(lanLease.value.target_path || '')) === observedProject &&
        Number(lanOwnerPid) === Number(state?.local_runtime_pid) &&
        lightweightPidAlive(lanOwnerPid) &&
        (!lanChildPid || lightweightPidAlive(lanChildPid))
      ),
      owner_pid: Number(lanOwnerPid || 0) || null,
      child_pid: Number(lanChildPid || 0) || null
    }
  }
  const passed = Object.values(checks).every(check => check?.passed === true)
  return {
    status: passed ? 'ready' : 'blocked',
    code: passed ? 'qa_runtime_fast_probe_ready' : 'qa_runtime_fast_probe_failed',
    probe_type: 'control_plane_generation_liveness',
    identity: {
      runtime_key: state?.runtime_key || null,
      generation: Number(state?.generation || 0) || null,
      supervisor_pid: Number(state?.pid || 0) || null,
      devtools_pid: Number(state?.devtools_pid || 0) || null,
      process_start_identity: state?.process_start_identity || null,
      session_id: state?.session_id || null,
      local_runtime_pid: Number(state?.local_runtime_pid || 0) || null
    },
    checks
  }
}

function fastProbeBatch(targetCycles) {
  const target = Number(targetCycles)
  if (!Number.isInteger(target) || target <= 0 || target > 1000) {
    return errorResult(
      'qa_runtime_fast_probe_repeat_invalid',
      'probe repeat 必须是 1 到 1000 的整数'
    )
  }
  try {
    if (!requireRunLease()) {
      return errorResult(
        'qa_run_lease_required',
        '批量 fast probe 必须绑定 dispatch-run-id、run-instance-id 和 run-lease-token'
      )
    }
  } catch (error) {
    return errorResult(error.code || 'qa_run_lease_invalid', error.message)
  }
  const samples = []
  for (let index = 1; index <= target; index += 1) {
    const sample = fastProbe({ leaseValidated: true })
    samples.push({
      index,
      status: sample.status,
      code: sample.code,
      identity: sample.identity,
      checks: sample.checks
    })
    if (sample.status !== 'ready') {
      return {
        status: 'blocked',
        code: sample.code,
        probe_type: 'control_plane_generation_liveness_batch',
        target_cycles: target,
        completed_cycles: index,
        samples
      }
    }
  }
  return {
    status: 'ready',
    code: 'qa_runtime_fast_probe_batch_ready',
    probe_type: 'control_plane_generation_liveness_batch',
    target_cycles: target,
    completed_cycles: target,
    samples
  }
}

function doctorArtifactPath(directory = null) {
  const executionId = `doctor-${new Date().toISOString().replace(/[^0-9]/gu, '')}-${process.pid}`
  return path.join(
    directory || path.join(QA_RUNTIME_ROOT, 'supervisor', 'doctor'),
    executionId,
    'preflight.png'
  )
}

function formalRuntimeOwnership(state) {
  const expectedProfile = path.resolve(profilePath())
  const expectedUserDataDir =
    QA_RUNTIME_DEVTOOLS_RUNTIME_KIND === 'official_electron'
      ? path.dirname(expectedProfile)
      : expectedProfile
  const expectedProject = path.resolve(state?.project_path || '')
  const main = mainForSession({ profile: expectedProfile, controlPort: QA_RUNTIME_CONTROL_PORT })
  const passed = Boolean(
    main &&
    Number(main.pid) === Number(state?.devtools_pid) &&
    path.resolve(userDataDirFromCommand(main.command)) === expectedUserDataDir
  )
  return {
    passed,
    expected_profile: expectedProfile,
    expected_project: expectedProject,
    expected_devtools_pid: Number(state?.devtools_pid) || null,
    observed_devtools_pid: main?.pid || null,
    observed_profile: main ? path.resolve(userDataDirFromCommand(main.command)) : null,
    expected_user_data_dir: expectedUserDataDir,
    runtime_kind: QA_RUNTIME_DEVTOOLS_RUNTIME_KIND
  }
}

async function doctor() {
  let evidenceDirectory
  try {
    evidenceDirectory = artifactDirectory()
  } catch (error) {
    return errorResult(error.code || 'qa_artifact_directory_invalid', error.message)
  }
  const current = status()
  const activeRunLease = runLeaseOptions()
  if (
    activeRunLease.dispatchRunId &&
    current.supervisor_state &&
    (current.supervisor_state.dispatch_run_id !== activeRunLease.dispatchRunId ||
      current.supervisor_state.run_instance_id !== activeRunLease.runInstanceId ||
      current.supervisor_state.run_lease_token !== activeRunLease.runLeaseToken)
  ) {
    return {
      ...current,
      status: 'blocked',
      code: 'qa_supervisor_dispatch_run_mismatch',
      checks: { supervisor: { passed: false, code: 'qa_supervisor_dispatch_run_mismatch' } }
    }
  }
  if (current.status !== 'running' || current.supervisor_state?.status !== 'ready') {
    return {
      ...current,
      status: 'blocked',
      code: current.code === 'qa_runtime_running' ? 'qa_runtime_not_ready' : current.code,
      checks: { supervisor: { passed: false, code: current.code } }
    }
  }
  const state = current.supervisor_state
  const manifest = current.manifests.find(item => item.runtime_key === state.runtime_key) || null
  const runtime = manifest
    ? deriveQaRuntime({ sourceProjectPath: state.source_project_path })
    : null
  let backendTarget
  try {
    backendTarget = resolveQaBackendTarget(process.env, {
      port: QA_RUNTIME_LAN_PORT,
      functionPortBase: QA_RUNTIME_FUNCTION_PORT_BASE
    })
  } catch (error) {
    return {
      ...current,
      status: 'blocked',
      code: error.code || 'qa_backend_target_invalid',
      checks: {
        backend_target: {
          passed: false,
          code: error.code || 'qa_backend_target_invalid',
          message: error.message
        }
      },
      supervisor_state: state,
      manifest
    }
  }
  const checks = {
    backend_target: {
      passed: qaBackendTargetMatches(state.backend_target, backendTarget),
      expected: {
        mode: backendTarget.mode,
        environment_id: backendTarget.environmentId,
        base_url: backendTarget.baseUrl
      },
      observed: state.backend_target || null
    },
    supervisor: {
      passed: current.supervisor_alive && current.supervisor_owner_verified,
      pid: state.pid,
      runtime_key: state.runtime_key
    },
    channel: {
      passed:
        Number(state.automator_port) === QA_RUNTIME_WS_PORT &&
        Number(state.control_port) === QA_RUNTIME_CONTROL_PORT,
      automator_port: Number(state.automator_port),
      control_port: Number(state.control_port),
      expected: { automator_port: QA_RUNTIME_WS_PORT, control_port: QA_RUNTIME_CONTROL_PORT }
    },
    profile: {
      passed:
        path.resolve(state.profile || '') === path.resolve(profilePath()) && current.profile_ready,
      expected: path.resolve(profilePath()),
      observed: path.resolve(state.profile || '')
    },
    ownership: formalRuntimeOwnership(state),
    manifest: {
      passed: Boolean(runtime && manifest && runtimeManifestIsReady(runtime, manifest)),
      runtime_key: manifest?.runtime_key || null,
      generation: manifest?.generation || null,
      source_fingerprint: manifest?.source_fingerprint || null,
      backend_source_fingerprint: manifest?.backend_source_fingerprint || null,
      qa_harness_fingerprint: manifest?.qa_harness_fingerprint || null,
      devtools_owner_pid: manifest?.devtools_owner_pid || null,
      devtools_package_hash: manifest?.devtools_package_hash || null
    },
    lan: { passed: false },
    preflight: null
  }
  if (runtime) {
    const lease = localRuntimeEvidence(state.project_path)
    checks.lan = {
      passed: localRuntimeOwned(lease, state.local_runtime_pid, state.project_path),
      owner_pid: lease.value?.owner_pid || null,
      child_pid: lease.value?.child_pid || null,
      target_path: lease.value?.target_path || null,
      port: QA_RUNTIME_LAN_PORT,
      function_port_base: QA_RUNTIME_FUNCTION_PORT_BASE
    }
  }
  const staticPassed = Object.entries(checks)
    .filter(([name]) => name !== 'preflight')
    .every(([, value]) => value?.passed === true)
  if (!staticPassed) {
    return {
      ...current,
      status: 'blocked',
      code: 'qa_runtime_static_identity_unverified',
      checks,
      supervisor_state: state,
      manifest
    }
  }
  const screenshotPath = doctorArtifactPath(evidenceDirectory)
  const coldPerformanceLane = String(process.env.QA_PERFORMANCE_COLD_LANE || '').trim() === '1'
  const wxRequestUrl = coldPerformanceLane
    ? buildQaHealthRequestUrl(backendTarget.baseUrl)
    : backendTarget.wxRequestUrl
  const preflight = await runQaPreflight({
    projectPath: state.project_path,
    wsPort: QA_RUNTIME_WS_PORT,
    wxRequestUrl,
    requireAuthenticatedWxRequest: true,
    screenshotPath,
    initialRoute: '/pages/index/index',
    allowTargetedRestart: true,
    runtimeChannel: 'formal_qa_v3',
    requireIsolatedProject: true,
    runtimeInspector: () => {
      const inspected = ownedRuntimeEvidence({
        profile: state.profile,
        projectPath: state.project_path,
        wsPort: QA_RUNTIME_WS_PORT,
        controlPort: QA_RUNTIME_CONTROL_PORT
      })
      if (
        inspected.status === 'verified' &&
        path.resolve(inspected.user_data_dir || '') !==
          (QA_RUNTIME_DEVTOOLS_RUNTIME_KIND === 'official_electron'
            ? path.dirname(path.resolve(profilePath()))
            : path.resolve(profilePath()))
      ) {
        return { ...inspected, status: 'unavailable', code: 'qa_profile_identity_unverified' }
      }
      return inspected
    },
    lanFlowProbe: () => checks.lan.passed
  })
  checks.preflight = preflight
  const passed = preflight.status === 'passed'
  return {
    ...current,
    status: passed ? 'ready' : 'blocked',
    code: passed ? 'qa_runtime_doctor_ready' : preflight.code || 'qa_runtime_preflight_failed',
    checks,
    evidence: {
      screenshot: screenshotPath,
      wx_request_url: wxRequestUrl,
      runtime_channel: 'formal_qa_v3'
    }
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function runQaDevToolsEnrollment() {
  const enrollmentScript = path.join(repoRoot, 'scripts', 'qa', 'launch-wechat-devtools.mjs')
  const result = spawnSync(
    process.execPath,
    [enrollmentScript, '--role=qa', '--enroll', '--enroll-timeout-ms=300000'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  if (result.status === 0) {
    return {
      status: 'ready',
      code: 'qa_devtools_enrollment_completed',
      output_tail: String(result.stdout || '').slice(-2000)
    }
  }
  let detail = null
  try {
    detail = JSON.parse(String(result.stderr || '').trim())
  } catch {
    // The helper may fail before it can emit its JSON terminal record.
  }
  const error = new Error(
    detail?.message ||
      String(result.stderr || result.stdout || '').trim() ||
      'QA DevTools enrollment failed'
  )
  error.code = detail?.code || 'qa_devtools_enrollment_failed'
  error.details = {
    helper_status: result.status,
    helper_signal: result.signal || null,
    stderr_tail: String(result.stderr || '').slice(-4000),
    stdout_tail: String(result.stdout || '').slice(-4000)
  }
  throw error
}

async function bootstrapUnlocked({ enrollment = command === 'enroll' } = {}) {
  let validatedRunLease
  try {
    validatedRunLease = requireRunLease()
  } catch (error) {
    return errorResult(error.code || 'qa_run_lease_invalid', error.message)
  }
  let backendTarget
  try {
    backendTarget = resolveQaBackendTarget(process.env, {
      port: QA_RUNTIME_LAN_PORT,
      functionPortBase: QA_RUNTIME_FUNCTION_PORT_BASE
    })
  } catch (error) {
    return errorResult(
      error.code || 'qa_backend_target_invalid',
      'QA bootstrap 在启动任何 DevTools/Automator 进程前未通过 backend target 闸门',
      {
        stage: 'backend_target_preflight',
        message: error.message,
        details: error.details || null
      }
    )
  }
  ensureQaRuntimeRoot()
  const owner = ensureQaOwnerMarker()
  let auth = readCanonicalAuthManifest()
  let authBlockCode = null
  let enrollmentResult = null
  if (!auth.ready && enrollment) {
    try {
      enrollmentResult = runQaDevToolsEnrollment()
      auth = readCanonicalAuthManifest()
    } catch (error) {
      authBlockCode = error?.code || 'qa_devtools_enrollment_failed'
    }
  }
  if (!auth.ready && !enrollmentResult) {
    try {
      ensureQaAuthAvailable({
        qaProfile: profilePath()
      })
      auth = readCanonicalAuthManifest()
    } catch (error) {
      authBlockCode = error?.code || null
      // Keep the broker's terminal reason. The daily profile is read-only and
      // never opened or modified by this command.
    }
  }
  const materialCanStartRuntime = authMaterialCanStartRuntime(auth)
  if (!auth.ready && !materialCanStartRuntime) {
    return {
      status: 'blocked',
      code: authBlockCode || auth.code,
      owner,
      profile_ready: false,
      fixed_ports: qaRuntimeFixedPorts(),
      auth: {
        manifest_code: auth.code,
        broker_code: authBlockCode
      },
      backend_target: {
        mode: backendTarget.mode,
        environment_id: backendTarget.environmentId,
        source: backendTarget.source
      },
      enrollment: enrollmentResult
    }
  }
  const sourceOverride = args.find(arg => arg.startsWith('--source-project-path='))
  if (sourceOverride) {
    return errorResult(
      'qa_runtime_source_override_forbidden',
      '正式 QA 不接受调用方传入 source project path'
    )
  }
  const sourceProjectPath = path.resolve(defaultSourceProjectPath)
  let current = status()
  const activeRunLease = runLeaseOptions()
  let supervisorAdoption = null
  if (
    activeRunLease.dispatchRunId &&
    current.supervisor_state &&
    processAlive(current.supervisor_state.pid) &&
    (current.supervisor_state.dispatch_run_id !== activeRunLease.dispatchRunId ||
      current.supervisor_state.run_instance_id !== activeRunLease.runInstanceId ||
      current.supervisor_state.run_lease_token !== activeRunLease.runLeaseToken)
  ) {
    supervisorAdoption = claimUnscopedSupervisor(validatedRunLease)
    if (supervisorAdoption.status !== 'adopted') {
      return errorResult(
        supervisorAdoption.code === 'qa_supervisor_not_unscoped_ready'
          ? 'qa_supervisor_dispatch_run_mismatch'
          : supervisorAdoption.code,
        '已有 supervisor 不属于当前 dispatch run，且未通过无归属 QA supervisor 领取校验',
        {
          expected_dispatch_run_id: activeRunLease.dispatchRunId,
          observed_dispatch_run_id: current.supervisor_state.dispatch_run_id || null,
          supervisor_pid: current.supervisor_state.pid || null,
          adoption: supervisorAdoption
        }
      )
    }
    current = status()
  }
  if (current.status === 'stale_owner_detected') {
    const recovered = await stop()
    if (recovered.status === 'blocked') {
      return {
        ...recovered,
        owner,
        fixed_ports: qaRuntimeFixedPorts(),
        stale_owner: current
      }
    }
    current = status()
  }
  if (current.status === 'running' && current.supervisor_state?.status === 'ready') {
    const runtime = deriveQaRuntime({ sourceProjectPath })
    const manifest = readQaRuntimeManifest(runtime.runtimePath)
    const refreshRequested = args.includes('--refresh')
    const supervisorTarget = current.supervisor_state.backend_target || null
    const supervisorTargetMatches = qaBackendTargetMatches(supervisorTarget, backendTarget)
    if (!refreshRequested && runtimeManifestIsReady(runtime, manifest) && supervisorTargetMatches) {
      return {
        status: 'ready',
        code: 'qa_bootstrap_already_ready',
        owner,
        supervisor: current.supervisor_state,
        supervisor_adoption: supervisorAdoption,
        fixed_ports: qaRuntimeFixedPorts(),
        backend_target: {
          mode: backendTarget.mode,
          environment_id: backendTarget.environmentId,
          source: backendTarget.source
        }
      }
    }
    const stopped = await stop()
    if (stopped.status === 'blocked') {
      return {
        ...stopped,
        owner,
        fixed_ports: qaRuntimeFixedPorts()
      }
    }
  }
  // Native DevTools reads the QA profile when the process opens. A broker
  // generation update alone cannot change an already persisted profile. At
  // this point no QA-owned runtime is active (or it was just stopped for a
  // refresh), so bridge the newest daily ticket into QA before launching the
  // native process. If the daily profile is closed/unavailable, retain a
  // still-fresh QA material snapshot; identity conflicts remain terminal.
  let authBridge = null
  const currentQaMaterialIsUsable = authMaterialCanStartRuntime(auth)
  if (currentQaMaterialIsUsable) {
    // Official Electron stores the logged-in userInfo aggregate encrypted, so
    // a daily-profile bridge cannot safely re-read it after the QA ticket has
    // been captured through the official Automator API. Keep the verified QA
    // material and never ask the daily profile to become a second source.
    authBridge = {
      status: 'preserved',
      code: 'qa_auth_profile_sync_preserved_current_qa_material',
      reason: 'current_qa_material_is_usable'
    }
  } else {
    try {
      authBridge = syncQaAuthFromDailyReadOnly({ qaProfile: profilePath() })
      auth = readCanonicalAuthManifest()
    } catch (error) {
      const preservableDailyState = new Set([
        'qa_daily_auth_profile_missing',
        'qa_daily_auth_record_not_found',
        'qa_daily_auth_record_expired',
        'qa_daily_auth_ticket_refresh_required'
      ])
      if (!materialCanStartRuntime || !preservableDailyState.has(error?.code)) {
        return {
          status: 'blocked',
          code: error?.code || 'qa_auth_profile_sync_failed',
          message: error?.message || String(error),
          owner,
          fixed_ports: qaRuntimeFixedPorts(),
          auth: {
            manifest_code: auth.code,
            broker_code: authBlockCode,
            bridge_error: error?.code || null
          }
        }
      }
      authBridge = {
        status: 'preserved',
        code: 'qa_auth_profile_sync_preserved_persisted_material',
        reason: error.code
      }
    }
  }
  auth = readCanonicalAuthManifest()
  if (!authMaterialCanStartRuntime(auth)) {
    return {
      status: 'blocked',
      code: auth.code || 'qa_auth_material_unavailable_after_profile_sync',
      owner,
      fixed_ports: qaRuntimeFixedPorts(),
      auth_bridge: authBridge,
      auth: { manifest_code: auth.code, broker_code: authBlockCode }
    }
  }
  // A failed server validation invalidates the previous proof, but it does
  // not invalidate the persistent QA profile or the broker material. Start
  // the isolated runtime so the real home + wx.request flow can revalidate
  // it. Only missing material or a profile mismatch is a pre-start block.
  const runToken = crypto.randomUUID()
  const { dispatchRunId, runInstanceId, runLeaseToken } = runLeaseOptions()
  const childArgs = [supervisorScript, 'start', `--run-token=${runToken}`]
  if (dispatchRunId) {
    childArgs.push(`--dispatch-run-id=${dispatchRunId}`)
  }
  if (runInstanceId) {
    childArgs.push(`--run-instance-id=${runInstanceId}`)
  }
  if (enrollment) {
    childArgs.push('--enroll')
  }
  const child = spawn(process.execPath, childArgs, {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
    detached: true,
    env: {
      ...process.env,
      QA_SUPERVISOR_RUN_TOKEN: runToken,
      QA_SUPERVISOR_ENROLLMENT: enrollment ? '1' : '0',
      QA_SUPERVISOR_DISPATCH_RUN_ID: dispatchRunId || '',
      QA_SUPERVISOR_RUN_INSTANCE_ID: runInstanceId || '',
      QA_SUPERVISOR_RUN_LEASE_TOKEN: runLeaseToken || ''
    },
    stdio: 'ignore'
  })
  child.unref?.()
  const deadline = Date.now() + SUPERVISOR_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const supervisor = readSupervisorState()
    const sameRun = supervisor?.run_token === runToken
    if (sameRun && supervisor.status === 'ready') {
      return {
        status: 'ready',
        code: args.includes('--refresh') ? 'qa_bootstrap_refreshed' : 'qa_bootstrap_ready',
        owner,
        supervisor,
        supervisor_adoption: supervisorAdoption,
        fixed_ports: qaRuntimeFixedPorts(),
        auth_bridge: authBridge,
        backend_target: {
          mode: backendTarget.mode,
          environment_id: backendTarget.environmentId,
          source: backendTarget.source
        }
      }
    }
    if (sameRun && supervisor.status === 'blocked') {
      return {
        status: 'blocked',
        code: supervisor.code || 'qa_supervisor_start_failed',
        message: supervisor.message || 'QA supervisor failed to become ready',
        owner,
        supervisor,
        fixed_ports: qaRuntimeFixedPorts()
      }
    }
    if (!processAlive(child.pid)) {
      return errorResult('qa_supervisor_exited_before_ready', 'QA supervisor exited before ready', {
        owner,
        supervisor: readSupervisorState()
      })
    }
    await wait(250)
  }
  const timeoutCleanup = await stop({ expectedRunToken: runToken })
  return errorResult(
    'qa_bootstrap_timeout',
    `QA supervisor did not become ready within ${SUPERVISOR_READY_TIMEOUT_MS}ms`,
    {
      owner,
      run_token: runToken,
      supervisor: readSupervisorState(),
      timeout_cleanup: timeoutCleanup,
      residual_qa_evidence: residualQaEvidence()
    }
  )
}

async function bootstrap(options = {}) {
  const lock = acquireBootstrapLock()
  if (lock.status !== 'acquired') {
    return errorResult(
      lock.code || 'qa_bootstrap_lock_failed',
      lock.message || 'QA bootstrap 已有另一个实例正在执行',
      lock
    )
  }
  try {
    return await bootstrapUnlocked(options)
  } finally {
    lock.release()
  }
}

async function stop({ expectedRunToken = '' } = {}) {
  let runLease = null
  try {
    runLease = requireRunLease()
  } catch (error) {
    return errorResult(error.code || 'qa_run_lease_invalid', error.message)
  }
  const supervisor = supervisorDetails()
  let supervisorStop = { status: 'not_needed', code: 'qa_supervisor_not_running' }
  if (supervisor.state && processAlive(supervisor.state.pid)) {
    if (expectedRunToken && supervisor.state.run_token !== expectedRunToken) {
      return errorResult(
        'qa_supervisor_run_mismatch',
        '当前 supervisor 不属于本次 bootstrap，未停止任何进程',
        {
          expected_run_token: expectedRunToken,
          observed_run_token: supervisor.state.run_token || null,
          pid: supervisor.state.pid,
          ownership: supervisor.ownership
        }
      )
    }
    if (
      runLease &&
      (supervisor.state.dispatch_run_id !== runLease.dispatch_run_id ||
        supervisor.state.run_instance_id !== runLease.run_instance_id ||
        supervisor.state.run_lease_token !== runLease.token)
    ) {
      const adoption = claimUnscopedSupervisor(runLease)
      if (adoption.status !== 'adopted') {
        return errorResult(
          adoption.code === 'qa_supervisor_not_unscoped_ready'
            ? 'qa_supervisor_dispatch_run_mismatch'
            : adoption.code,
          '当前 supervisor 不属于本次 dispatch run，且未通过无归属 QA supervisor 领取校验，未停止任何进程',
          {
            expected_dispatch_run_id: runLease.dispatch_run_id,
            observed_dispatch_run_id: supervisor.state.dispatch_run_id || null,
            pid: supervisor.state.pid,
            adoption
          }
        )
      }
      supervisor.state = readSupervisorState()
      supervisor.ownership = supervisorOwnership(supervisor.state)
      supervisor.owned = supervisor.ownership.status === 'verified'
      supervisor.adoptable = supervisor.ownership.status === 'legacy_adoptable'
      supervisor.canStop = supervisor.owned || supervisor.adoptable
      supervisorStop = {
        status: 'adopted',
        code: adoption.code,
        pid: supervisor.state.pid,
        process_start_identity: supervisor.state.process_start_identity
      }
    }
    if (!supervisor.canStop) {
      return errorResult(
        'qa_supervisor_owner_unverified',
        '发现 supervisor PID，但无法证明它属于当前 QA supervisor；未停止任何进程',
        {
          pid: supervisor.state.pid,
          command: supervisor.command,
          ownership: supervisor.ownership,
          residual_qa_evidence: residualQaEvidence()
        }
      )
    }
    if (supervisor.ownership.status === 'legacy_adoptable') {
      const adopted = {
        ...supervisor.state,
        process_start_identity: supervisor.ownership.process_start_identity,
        ownership_migrated_at: new Date().toISOString(),
        ownership_migration_reason: supervisor.ownership.reason
      }
      const temporary = `${supervisorStatePath}.${process.pid}.${Date.now()}.adopt.tmp`
      fs.writeFileSync(temporary, `${JSON.stringify(adopted, null, 2)}\n`, { mode: 0o600 })
      fs.renameSync(temporary, supervisorStatePath)
      supervisor.state = adopted
      supervisorStop = {
        status: 'adopted',
        code: 'qa_supervisor_legacy_owner_adopted',
        pid: adopted.pid,
        process_start_identity: adopted.process_start_identity
      }
    }
    try {
      const cleanupAlreadyStarted =
        supervisor.state.status === 'stopping' ||
        supervisor.state.code === 'qa_runtime_cleanup_in_progress'
      if (cleanupAlreadyStarted) {
        supervisorStop = {
          ...supervisorStop,
          status: 'waiting',
          code: 'qa_supervisor_cleanup_already_in_progress',
          pid: supervisor.state.pid
        }
      } else {
        process.kill(Number(supervisor.state.pid), 'SIGTERM')
        supervisorStop = {
          ...supervisorStop,
          status: 'requested',
          code: 'qa_supervisor_stop_requested',
          pid: supervisor.state.pid
        }
      }
      const deadline = Date.now() + SUPERVISOR_STOP_GRACE_MS
      while (processAlive(supervisor.state.pid) && Date.now() < deadline) {
        await wait(250)
      }
      if (processAlive(supervisor.state.pid)) {
        return errorResult('qa_supervisor_stop_timeout', 'QA supervisor 未在限定时间内退出', {
          pid: supervisor.state.pid,
          cleanup_already_started: cleanupAlreadyStarted,
          timeout_ms: SUPERVISOR_STOP_GRACE_MS
        })
      }
      supervisorStop = {
        ...supervisorStop,
        status: 'stopped',
        code: 'qa_supervisor_stopped',
        pid: supervisor.state.pid
      }
    } catch (error) {
      return errorResult('qa_supervisor_stop_failed', error.message, { pid: supervisor.state.pid })
    }
  }
  const residue = await waitForQaResidueToClear()
  if (residue.status !== 'cleared') {
    return errorResult(
      'qa_supervisor_cleanup_residue',
      'QA supervisor 已退出，但仍有 QA 固定端口或 QA profile 进程残留；未宣称清理完成',
      {
        supervisor: supervisorStop,
        residual_qa_evidence: residue.residue
      }
    )
  }
  const terminalState = readSupervisorState()
  const terminalStateMatchesRun =
    terminalState && (!expectedRunToken || terminalState.run_token === expectedRunToken)
  if (
    terminalStateMatchesRun &&
    ['blocked', 'stopping'].includes(terminalState.status) &&
    !processAlive(Number(terminalState.pid))
  ) {
    const normalizedState = {
      ...terminalState,
      status: 'stopped',
      code: 'qa_runtime_idle_after_block',
      message: terminalState.message || null,
      last_failure: terminalState.failure || null,
      runtime_cleanup: {
        ...(terminalState.runtime_cleanup || {}),
        status: 'terminated',
        code: 'qa_runtime_stopped',
        residual_qa_evidence: residue.residue
      },
      updated_at: new Date().toISOString()
    }
    const temporary = `${supervisorStatePath}.${process.pid}.${Date.now()}.idle.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(normalizedState, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temporary, supervisorStatePath)
  }
  if (supervisorStop.status === 'stopped') {
    const currentState = readSupervisorState()
    if (currentState && Number(currentState.pid) === Number(supervisor.state?.pid)) {
      const stoppedState = {
        ...currentState,
        status: 'stopped',
        code: 'qa_supervisor_stopped',
        message: null,
        runtime_cleanup: {
          status: 'terminated',
          code: 'qa_runtime_stopped',
          residual_qa_evidence: residue.residue
        },
        updated_at: new Date().toISOString()
      }
      const temporary = `${supervisorStatePath}.${process.pid}.${Date.now()}.stopped.tmp`
      fs.writeFileSync(temporary, `${JSON.stringify(stoppedState, null, 2)}\n`, { mode: 0o600 })
      fs.renameSync(temporary, supervisorStatePath)
    }
  }
  reapStaleQaFixedPortLocks()
  return {
    status: 'ready',
    code: 'qa_runtime_stopped',
    supervisor: supervisorStop,
    cleaned: [],
    residual_qa_evidence: residue.residue,
    cleanup_scope: 'current_supervisor_generation_only'
  }
}

function repair(scope) {
  if (scope !== 'compile-cache') {
    return errorResult('qa_repair_scope_invalid', 'repair 只接受 --scope=compile-cache')
  }
  const processes = profileProcesses()
  if (processes.length) {
    return errorResult('qa_profile_in_use', 'QA profile 当前仍被进程使用，未清理任何文件', {
      pids: processes.map(item => item.pid)
    })
  }
  const removed = []
  for (const relative of ['WeappCache/WeappCompileCache', 'WeappCache/requireCache']) {
    const target = path.join(profilePath(), relative)
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true })
      removed.push(relative)
    }
  }
  return { status: 'ready', code: 'qa_compile_cache_repaired', removed }
}

function resetLogin() {
  const confirm = args.find(arg => arg.startsWith('--confirm='))?.slice('--confirm='.length) || ''
  if (confirm !== '重置测试登录态') {
    return errorResult(
      'qa_reset_login_confirmation_required',
      '必须提供完全一致的确认词：重置测试登录态'
    )
  }
  const processes = profileProcesses()
  if (processes.length) {
    return errorResult('qa_profile_in_use', 'QA profile 当前仍被进程使用，未删除登录态', {
      pids: processes.map(item => item.pid)
    })
  }
  const removed = []
  for (const relative of ['WeappLocalData', 'WeappSimulator/WeappStorage']) {
    const target = path.join(profilePath(), relative)
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true })
      removed.push(relative)
    }
  }
  const authState = readCanonicalAuthManifest()
  if (authState.value) {
    const authManifest = path.join(QA_RUNTIME_ROOT, 'auth', 'current.json')
    if (fs.existsSync(authManifest)) {
      fs.rmSync(authManifest, { force: true })
      removed.push(path.relative(QA_RUNTIME_ROOT, authManifest))
    }
  }
  const appAuthProof = path.join(QA_RUNTIME_ROOT, 'supervisor', 'app-auth-proof.json')
  if (fs.existsSync(appAuthProof)) {
    fs.rmSync(appAuthProof, { force: true })
    removed.push(path.relative(QA_RUNTIME_ROOT, appAuthProof))
  }
  return { status: 'ready', code: 'qa_test_login_reset', removed, profile_path: profilePath() }
}

async function main() {
  try {
    if (command === 'bootstrap' || command === 'enroll') {
      return json(await bootstrap())
    }
    if (command === 'auth-adopt') {
      ensureQaRuntimeRoot()
      return json(
        ensureQaAuthAvailable({
          qaProfile: profilePath()
        })
      )
    }
    if (command === 'status') {
      return json(status())
    }
    if (command === 'probe') {
      const repeat = argumentValue('repeat')
      return json(repeat ? fastProbeBatch(repeat) : fastProbe())
    }
    if (command === 'doctor') {
      return json(await doctor())
    }
    if (command === 'stop') {
      return json(await stop())
    }
    if (command === 'repair') {
      return json(
        repair(args.find(arg => arg.startsWith('--scope='))?.slice('--scope='.length) || '')
      )
    }
    if (command === 'reset-login') {
      return json(resetLogin())
    }
    return json(errorResult('qa_command_unknown', `未知命令：${command}`))
  } catch (error) {
    json(errorResult(error.code || 'qa_runtime_command_failed', error.message))
    process.exitCode = 1
  }
}

await main()
