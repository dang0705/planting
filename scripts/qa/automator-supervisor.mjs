#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  cleanupTestOwnedQaSession,
  createTestOwnedQaSession
} from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-session.mjs'
import { ensureQaAuthAvailable } from './qa-auth-coordinator.mjs'
import { ensureQaAppLoggedIn, hasQaAppAuthEnrollment } from './qa-supervisor-client.mjs'
import { runQaPreflight } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight.mjs'
import {
  QA_RUNTIME_ROOT,
  QA_RUNTIME_SUPERVISOR_ROOT,
  deriveQaRuntime,
  resolveQaDevToolsProfile,
  readQaRuntimeManifest,
  writeQaRuntimeManifest,
  processStartIdentity
} from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-runtime-plane.mjs'
import { mainForSession } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs'
import {
  buildQaHealthRequestUrl,
  qaBackendTargetEvidence,
  resolveQaBackendTarget
} from './qa-backend-target.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const statePath = path.join(QA_RUNTIME_SUPERVISOR_ROOT, 'state.json')
const sourceProjectPath = path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
const command = process.argv[2] || 'start'
const SAFE_DISPATCH_RUN_ID = /^[A-Za-z0-9._-]{8,160}$/u

function supervisorArtifactPath(dispatchRunId, runInstanceId = null) {
  if (!dispatchRunId) {
    return path.join(QA_RUNTIME_ROOT, 'supervisor', 'bootstrap.png')
  }
  if (!SAFE_DISPATCH_RUN_ID.test(String(dispatchRunId))) {
    throw Object.assign(new Error('dispatch-run-id 格式无效'), {
      code: 'qa_supervisor_dispatch_run_id_invalid'
    })
  }
  if (runInstanceId && !SAFE_DISPATCH_RUN_ID.test(String(runInstanceId))) {
    throw Object.assign(new Error('run-instance-id 格式无效'), {
      code: 'qa_supervisor_run_instance_id_invalid'
    })
  }
  return path.join(
    repoRoot,
    '.tmp',
    'dispatch-task',
    dispatchRunId,
    'qa-artifacts',
    ...(runInstanceId ? [runInstanceId] : []),
    'automator-supervisor',
    'bootstrap.png'
  )
}

function backendTargetEvidence(target) {
  return qaBackendTargetEvidence(target)
}

function supervisorWxRequestUrl(target) {
  return (target || resolveQaBackendTarget(process.env)).wxRequestUrl
}

function supervisorBusinessAuthUrl(target) {
  return (target || resolveQaBackendTarget(process.env)).businessAuthUrl
}

function isColdPerformanceLane() {
  return String(process.env.QA_PERFORMANCE_COLD_LANE || '').trim() === '1'
}

function supervisorPreflightUrl(target) {
  const resolved = target || resolveQaBackendTarget(process.env)
  return isColdPerformanceLane()
    ? buildQaHealthRequestUrl(resolved.baseUrl)
    : resolved.wxRequestUrl
}

function writeState(value) {
  fs.mkdirSync(QA_RUNTIME_SUPERVISOR_ROOT, { recursive: true, mode: 0o700 })
  const temporary = `${statePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, statePath)
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'))
  } catch {
    return null
  }
}

function updateState(patch) {
  writeState({
    ...(readState() || {}),
    ...patch,
    updated_at: new Date().toISOString()
  })
}

function parseOption(name, fallback) {
  const prefix = `--${name}=`
  const value = process.argv.slice(3).find(item => item.startsWith(prefix))
  return value ? value.slice(prefix.length) : fallback
}

function hasFlag(name) {
  return process.argv.slice(3).includes(`--${name}`)
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function start() {
  if (process.argv.slice(3).some(arg => arg.startsWith('--source-project-path='))) {
    writeState({
      schema_version: 3,
      status: 'blocked',
      code: 'qa_supervisor_source_override_forbidden',
      message: '正式 supervisor 的 source project 只能由当前仓库固定推导',
      updated_at: new Date().toISOString()
    })
    process.exitCode = 1
    return
  }
  let backendTarget
  try {
    backendTarget = resolveQaBackendTarget(process.env)
  } catch (error) {
    writeState({
      schema_version: 3,
      status: 'blocked',
      code: error.code || 'qa_backend_target_invalid',
      message: 'QA supervisor 在启动 DevTools 前未通过 backend target 闸门',
      backend_target: null,
      failure: {
        code: error.code || 'qa_backend_target_invalid',
        message: error.message,
        details: error.details || null
      },
      updated_at: new Date().toISOString()
    })
    process.exitCode = 1
    return
  }
  try {
    const qaProfile = resolveQaDevToolsProfile().profile
    ensureQaAuthAvailable({ qaProfile })
  } catch (error) {
    writeState({
      schema_version: 3,
      status: 'blocked',
      code: error.code || 'qa_auth_preflight_failed',
      message: 'QA supervisor 在启动 DevTools 前未通过 profile 认证闸门',
      backend_target: backendTargetEvidence(backendTarget),
      failure: {
        code: error.code || 'qa_auth_preflight_failed',
        message: error.message,
        details: error.details || null
      },
      updated_at: new Date().toISOString()
    })
    process.exitCode = 1
    return
  }
  const source = path.resolve(sourceProjectPath)
  const runToken = parseOption(
    'run-token',
    process.env.QA_SUPERVISOR_RUN_TOKEN || `legacy-${process.pid}-${Date.now()}`
  )
  const dispatchRunId = parseOption(
    'dispatch-run-id',
    process.env.QA_SUPERVISOR_DISPATCH_RUN_ID || null
  )
  const runInstanceId = parseOption(
    'run-instance-id',
    process.env.QA_SUPERVISOR_RUN_INSTANCE_ID || null
  )
  const runLeaseToken = process.env.QA_SUPERVISOR_RUN_LEASE_TOKEN || null
  const enrollment = hasFlag('enroll') || process.env.QA_SUPERVISOR_ENROLLMENT === '1'
  const sessionDispatchRunId = dispatchRunId || 'automator-v3-supervisor'
  const screenshotPath = supervisorArtifactPath(dispatchRunId, runInstanceId)
  updateState({
    schema_version: 3,
    status: 'starting',
    code: 'qa_supervisor_starting',
    pid: process.pid,
    run_token: runToken,
    dispatch_run_id: dispatchRunId,
    run_instance_id: runInstanceId,
    run_lease_token: runLeaseToken,
    enrollment_mode: enrollment,
    process_start_identity: processStartIdentity(process.pid),
    source_project_path: source,
    started_at: new Date().toISOString(),
    message: null,
    failure: null,
    // Attempt-scoped failure/evidence must never survive into a new
    // generation. Keeping an old launcher failure here makes a later healthy
    // native bootstrap look broken and can send recovery back to the retired
    // runtime path.
    last_failure: null,
    runtime_evidence: null,
    startup_recovery: null,
    open_cli_attempts: [],
    initial_devtools_launch: null,
    direct_devtools_launches: [],
    runtime_cleanup: null,
    auth_sync: { status: 'starting' },
    app_auth: null,
    session_id: null,
    runtime_key: null,
    project_path: null,
    profile: null,
    automator_port: null,
    control_port: null,
    local_runtime_pid: null,
    devtools_pid: null,
    generation: null,
    identity_hash: null,
    auth_generation: null,
    bootstrap_preflight: null,
    backend_target: backendTargetEvidence(backendTarget),
    bootstrap_gates: {
      backend_target: 'passed',
      qa_profile_auth: 'passed',
      devtools_project: 'pending',
      automator: 'pending',
      app_auth: 'pending',
      runtime_preflight: 'pending'
    }
  })
  let session
  try {
    session = await createTestOwnedQaSession({
      dispatchRunId: sessionDispatchRunId,
      runInstanceId,
      sourceProjectPath: source,
      projectPath: source,
      screenshotPath,
      wxRequestUrl: supervisorWxRequestUrl(backendTarget),
      forceFullLanRebuild: true,
      fullLanRebuildReason:
        'formal QA generation must compile the current source before runtime evidence',
      allowManualEnrollment: enrollment
    })
  } catch (error) {
    updateState({
      status: 'blocked',
      code: error.code || 'qa_supervisor_start_failed',
      message: error.message,
      failure: {
        code: error.code || 'qa_supervisor_start_failed',
        message: error.message,
        details: error.details || null
      },
      runtime_cleanup: null,
      auth_sync: { status: 'blocked', code: error.code || 'qa_supervisor_start_failed' }
    })
    process.exitCode = 1
    return
  }
  if (session.status !== 'ready') {
    updateState({
      status: 'blocked',
      code: session.code || 'qa_supervisor_start_failed',
      message: session.reason || 'QA runtime did not become ready',
      failure: {
        code: session.code || 'qa_supervisor_start_failed',
        message: session.reason || 'QA runtime did not become ready',
        details: {
          runtime_evidence: session.runtime_evidence || null,
          startup_recovery: session.startup_recovery || null,
          open_cli_attempts: session.open_cli_attempts || [],
          initial_devtools_launch: session.initial_devtools_launch || null,
          direct_devtools_launches: session.direct_devtools_launches || []
        }
      },
      session_id: session.sessionId || null,
      runtime_cleanup: session.runtime_cleanup || null,
      auth_sync: { status: 'blocked', code: session.code || 'qa_supervisor_start_failed' }
    })
    process.exitCode = 1
    return
  }
  updateState({
    bootstrap_gates: {
      backend_target: 'passed',
      qa_profile_auth: 'passed',
      devtools_project: 'passed',
      automator: 'passed',
      app_auth: 'pending',
      runtime_preflight: 'pending'
    }
  })
  const cleanupToTerminal = async currentSession => {
    let cleanup = await cleanupTestOwnedQaSession({ session: currentSession })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (cleanup.status !== 'blocked' || cleanup.code !== 'qa_runtime_cleanup_in_progress') {
        break
      }
      await wait(500)
      cleanup = await cleanupTestOwnedQaSession({ session: currentSession })
    }
    return cleanup
  }
  if (session.wxRequestUrl !== backendTarget.wxRequestUrl) {
    const cleanup = await cleanupToTerminal(session)
    updateState({
      status: 'blocked',
      code: 'qa_supervisor_backend_target_mismatch',
      message: 'QA session 使用的 wx.request 目标与本次 canonical target 不一致',
      backend_target: backendTargetEvidence(backendTarget),
      failure: {
        code: 'qa_supervisor_backend_target_mismatch',
        message: 'QA session 使用了非 canonical wx.request 目标',
        details: {
          expected: backendTarget.wxRequestUrl,
          observed: session.wxRequestUrl || null
        }
      },
      runtime_cleanup: cleanup,
      auth_sync: { status: 'blocked', code: 'qa_supervisor_backend_target_mismatch' }
    })
    process.exitCode = 1
    return
  }
  let appAuth
  try {
    const appAuthTimeoutMs = enrollment
      ? 5 * 60 * 1000
      : isColdPerformanceLane()
        ? 120_000
        : 30_000
    appAuth = await ensureQaAppLoggedIn({
      session: {
        ...session,
        preflight_options: {
          ...session.preflight_options,
          businessAuthUrl: supervisorBusinessAuthUrl(backendTarget)
        }
      },
      requireRealHomeEntry: !hasQaAppAuthEnrollment({
        identityHash: session.identity_hash,
        profile: session.profile
      }),
      skipBusinessProbe: isColdPerformanceLane(),
      allowManualEnrollment: enrollment,
      timeoutMs: appAuthTimeoutMs
    })
  } catch (error) {
    const cleanup = await cleanupToTerminal(session)
    updateState({
      status: 'blocked',
      code: error.code || 'qa_app_login_required',
      message: error.message,
      failure: {
        code: error.code || 'qa_app_login_required',
        message: error.message,
        details: error.details || null
      },
      runtime_cleanup: cleanup,
      auth_sync: { status: 'blocked', code: error.code || 'qa_app_login_required' }
    })
    process.exitCode = 1
    return
  }
  updateState({
    bootstrap_gates: {
      backend_target: 'passed',
      qa_profile_auth: 'passed',
      devtools_project: 'passed',
      automator: 'passed',
      app_auth: 'passed',
      runtime_preflight: 'pending'
    }
  })
  const bootstrapPreflight = await runQaPreflight({
    ...session.preflight_options,
    projectPath: session.projectPath,
    observedProjectPath: session.projectPath,
    wsPort: session.wsPort,
    wxRequestUrl: supervisorPreflightUrl(backendTarget),
    requireAuthenticatedWxRequest: !isColdPerformanceLane(),
    screenshotPath: session.preflight_options.screenshotPath,
    allowTargetedRestart: true,
    runtimeChannel: 'formal_qa_v3',
    lanFlowProbe: () => {
      if (backendTarget.mode === 'online') {
        return true
      }
      const processList = spawnSync('ps', ['-ax', '-o', 'command='], { encoding: 'utf8' })
      const commandText = `${processList.stdout || ''}\n${processList.stderr || ''}`
      return /dev:mp-weixin:local-functions:lan/u.test(commandText)
    }
  })
  if (bootstrapPreflight.status !== 'passed') {
    const cleanup = await cleanupToTerminal(session)
    updateState({
      status: 'blocked',
      code: bootstrapPreflight.code || 'qa_runtime_preflight_failed',
      message: 'QA supervisor bootstrap preflight 未通过',
      failure: {
        code: bootstrapPreflight.code || 'qa_runtime_preflight_failed',
        message: 'QA supervisor bootstrap preflight 未通过',
        preflight: bootstrapPreflight
      },
      runtime_cleanup: cleanup,
      auth_sync: {
        status: 'blocked',
        code: bootstrapPreflight.code || 'qa_runtime_preflight_failed'
      }
    })
    process.exitCode = 1
    return
  }
  updateState({
    bootstrap_gates: {
      backend_target: 'passed',
      qa_profile_auth: 'passed',
      devtools_project: 'passed',
      automator: 'passed',
      app_auth: 'passed',
      runtime_preflight: 'passed'
    }
  })
  const manifest = readQaRuntimeManifest(session.runtimeTargetPath)
  updateState({
    status: 'ready',
    code: 'qa_supervisor_ready',
    message: null,
    failure: null,
    runtime_cleanup: null,
    auth_sync: { status: 'ready', code: 'qa_auth_shared_state_ready' },
    session_id: session.sessionId,
    runtime_key: session.runtime_key,
    project_path: session.projectPath,
    profile: session.profile,
    automator_port: session.wsPort,
    control_port: session.controlPort,
    local_runtime_pid: session.localRuntimePid,
    devtools_pid: session.main_devtools_pid,
    generation: manifest?.generation || null,
    identity_hash: session.identity_hash || null,
    auth_generation: session.auth_generation || null,
    app_auth: appAuth,
    bootstrap_preflight: bootstrapPreflight,
    backend_target: backendTargetEvidence(backendTarget)
  })
  let stopping = false
  let keepAlive = null
  let authSyncTimer = null
  const markStopping = signal => {
    stopping = true
    clearInterval(authSyncTimer)
    clearInterval(keepAlive)
    updateState({ status: 'stopping', code: `qa_supervisor_${signal.toLowerCase()}` })
  }
  let shutdownPromise = null
  const shutdown = signal => {
    if (shutdownPromise) {
      return shutdownPromise
    }
    shutdownPromise = (async () => {
      markStopping(signal)
      const cleanup = await cleanupToTerminal(session)
      updateState({
        status: cleanup.status === 'terminated' ? 'stopped' : 'blocked',
        code: cleanup.status === 'terminated' ? 'qa_supervisor_stopped' : cleanup.code,
        message:
          cleanup.status === 'terminated' ? null : cleanup.reason || 'QA runtime cleanup failed',
        failure:
          cleanup.status === 'terminated'
            ? null
            : {
                code: cleanup.code || 'qa_supervisor_cleanup_failed',
                message: cleanup.reason || ''
              },
        runtime_cleanup: cleanup
      })
      process.exitCode = cleanup.status === 'terminated' ? 0 : 1
      return cleanup
    })()
    return shutdownPromise
  }
  process.once('SIGTERM', async () => {
    await shutdown('SIGTERM')
  })
  process.once('SIGINT', async () => {
    await shutdown('SIGINT')
  })
  let authSyncInFlight = false
  let authSyncFailedClosed = false
  const authSync = async () => {
    if (authSyncInFlight || authSyncFailedClosed) {
      return
    }
    authSyncInFlight = true
    try {
      const result = ensureQaAuthAvailable({
        qaProfile: session.profile
      })
      session.auth_generation = Number(result.manifest?.auth_generation || session.auth_generation)
      const runtime = deriveQaRuntime({ sourceProjectPath: session.sourceProjectPath })
      const currentManifest = readQaRuntimeManifest(session.projectPath)
      if (
        currentManifest?.build_status === 'ready' &&
        Number(currentManifest.auth_generation) !== session.auth_generation
      ) {
        writeQaRuntimeManifest(runtime, {
          generation: currentManifest.generation,
          api_base_url: currentManifest.api_base_url,
          build_output_path: currentManifest.build_output_path,
          build_status: currentManifest.build_status,
          built_at: currentManifest.built_at,
          identity_hash: session.identity_hash,
          auth_generation: session.auth_generation,
          qa_owner_pid: currentManifest.qa_owner_pid,
          lan_owner_pid: currentManifest.lan_owner_pid,
          devtools_owner_pid: currentManifest.devtools_owner_pid,
          devtools_package_hash: currentManifest.devtools_package_hash
        })
      }
      updateState({
        auth_generation: session.auth_generation,
        auth_sync: {
          status: 'ready',
          code: result.code,
          unchanged: result.unchanged === true,
          checked_at: new Date().toISOString()
        }
      })
    } catch (error) {
      authSyncFailedClosed = true
      updateState({
        status: 'blocked',
        code: error.code || 'qa_auth_sync_failed',
        message: error.message,
        failure: { code: error.code || 'qa_auth_sync_failed', message: error.message },
        auth_sync: { status: 'blocked', code: error.code || 'qa_auth_sync_failed' }
      })
      clearInterval(authSyncTimer)
      const cleanup = await cleanupTestOwnedQaSession({ session })
      updateState({ status: 'blocked', runtime_cleanup: cleanup })
      process.exitCode = 1
      process.exit(1)
    } finally {
      authSyncInFlight = false
    }
  }
  authSyncTimer = setInterval(authSync, 15_000)
  keepAlive = setInterval(() => {
    if (stopping) {
      return
    }
    const current = readState()
    if (!current || current.pid !== process.pid) {
      clearInterval(keepAlive)
      return
    }
    const currentMain = mainForSession(session)
    if (currentMain && Number(currentMain.pid) !== Number(session.main_devtools_pid)) {
      session.main_devtools_pid = currentMain.pid
      const runtime = deriveQaRuntime({ sourceProjectPath: session.sourceProjectPath })
      const currentManifest = readQaRuntimeManifest(session.projectPath)
      if (currentManifest) {
        writeQaRuntimeManifest(runtime, {
          generation: currentManifest.generation,
          api_base_url: currentManifest.api_base_url,
          build_output_path: currentManifest.build_output_path,
          build_status: currentManifest.build_status,
          built_at: currentManifest.built_at,
          identity_hash: session.identity_hash,
          auth_generation: session.auth_generation,
          qa_owner_pid: currentManifest.qa_owner_pid,
          lan_owner_pid: currentManifest.lan_owner_pid,
          devtools_owner_pid: currentMain.pid,
          devtools_package_hash: session.devtools_package_hash
        })
      }
    }
    updateState({
      status: 'ready',
      session_id: session.sessionId,
      devtools_pid: session.main_devtools_pid,
      local_runtime_pid: session.localRuntimePid,
      auth_generation: session.auth_generation
    })
  }, 5000)
  await new Promise(() => {})
}

if (command !== 'start') {
  writeState({
    schema_version: 3,
    status: 'blocked',
    code: 'qa_supervisor_command_unknown',
    message: `unknown supervisor command: ${command}`,
    updated_at: new Date().toISOString()
  })
  process.exitCode = 1
} else {
  await start()
}
