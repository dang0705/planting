import path from 'node:path'

import { qaCleanupPassed } from './formal-isolated-qa-session.mjs'
import { extractLeafReport, leafReportRequiresFullLanRebuild } from './qa-leaf-report.mjs'
import {
  createFormalQaRunRecord,
  finalizeFormalQaRunRecord,
  transitionFormalQaRunRecord
} from './formal-qa-run-record.mjs'
import {
  currentShared,
  isFreshAuthConsumptionEvidence,
  readAuthConsumptionEvidence
} from '../../../../../../scripts/qa/qa-auth-broker-core.mjs'

function appendTransition(appendEvent, record, outcome) {
  appendEvent(record, outcome)
  return record
}

function mergeLiveRecord(record, liveRecord) {
  return {
    ...record,
    ...liveRecord,
    status: 'running',
    started_at: record.started_at,
    transitions: record.transitions,
    run_record_version: record.run_record_version,
    run_phase: record.run_phase
  }
}

function failureFromSession(session) {
  return {
    status: 'failed_environment',
    terminal_reason: session?.code ?? 'qa_owned_runtime_initialization_failed',
    runtime_evidence: session?.runtime_evidence ?? session?.details?.runtime_evidence ?? null,
    live_attempt_consumed: false
  }
}

function qaArtifactDir(recordFile, executionId) {
  const recordDirectory = path.dirname(recordFile)
  const runInstanceId = path.basename(recordDirectory)
  if (runInstanceId === 'qa-runs') {
    return path.join(path.dirname(recordDirectory), 'qa-artifacts', executionId)
  }
  const dispatchDirectory = path.dirname(path.dirname(recordDirectory))
  return path.join(dispatchDirectory, 'qa-artifacts', runInstanceId, executionId)
}

function currentQaAuthConsumption() {
  const evidence = readAuthConsumptionEvidence()
  return evidence?.latest_by_role?.qa || null
}

function authConsumptionMatchesRuntime(runtimeEvidence) {
  const shared = currentShared()
  const evidence = readAuthConsumptionEvidence()
  const event = evidence?.latest_by_role?.qa || evidence?.latest || null
  const eventGeneration = Number(event?.auth_generation || 0) || null
  const runtimeGeneration = Number(runtimeEvidence?.auth_generation || 0) || null
  const sharedGeneration = Number(shared?.authGeneration || 0) || null
  const generationCeiling = Math.max(runtimeGeneration || 0, sharedGeneration || 0)
  const processAndIdentityMatch = Boolean(
    event &&
    event.identity_hash === runtimeEvidence?.identity_hash &&
    eventGeneration &&
    generationCeiling &&
    eventGeneration <= generationCeiling
  )
  if (!processAndIdentityMatch) {
    return false
  }
  return isFreshAuthConsumptionEvidence(readAuthConsumptionEvidence(), {
    role: 'qa',
    pid: runtimeEvidence?.main_devtools_pid,
    process_start_identity: runtimeEvidence?.process_start_identity,
    profile: runtimeEvidence?.profile || runtimeEvidence?.user_data_dir,
    // The broker may rotate shared material while a stable QA process keeps
    // running. The event itself is the consumed material proof; current
    // generation/ticket are only used as a ceiling above, never as an exact
    // equality requirement that would reject a valid older receipt.
    auth_generation: eventGeneration,
    identity_hash: event.identity_hash,
    ticket_hash: event.ticket_hash,
    // A stable QA process may serve a long live matrix. Once the exact
    // process/profile/auth-generation/ticket tuple matches, the receipt is
    // valid for that process lifetime; the 120s freshness window remains
    // enforced for the initial auth-concurrency report.
    max_age_ms: null
  })
}

async function waitForAuthConsumption(runtimeEvidence, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    if (authConsumptionMatchesRuntime(runtimeEvidence)) {
      return currentQaAuthConsumption()
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return null
}

export async function runFormalQaExecution({
  dispatchRunId,
  catalogId,
  executionId,
  gate,
  sourceProjectPath,
  expectedProjectPath,
  screenshotPath,
  wxRequestUrl,
  allowTargetedRestart,
  args,
  argValue,
  stripArgs,
  recordFile,
  recoverStaleRuns,
  createPreflightRecord,
  createLiveRecord,
  readRecords,
  previousAttemptGate,
  writeRecord,
  appendEvent,
  preflightRunner,
  leafRunner,
  runtimeFactory,
  runtimeCleanup,
  inspectBundle,
  failedBundleEvidence,
  frozenBundleEvidence,
  persistLeafReport,
  classifyRun,
  isLiveAttemptConsumed
} = {}) {
  let session = null
  let cleanup = { status: 'not_needed', code: 'qa_owned_runtime_not_started' }
  let record = createFormalQaRunRecord(createPreflightRecord())
  let candidate = null
  const persist = outcome => {
    writeRecord(recordFile, record)
    appendTransition(appendEvent, record, outcome)
  }
  const phase = (name, detail = {}) => {
    record = transitionFormalQaRunRecord(record, name, detail)
    persist(name)
  }

  const prepareRuntime = async ({ fullLanRebuild = false, reason = null } = {}) => {
    // A verified target-only DevTools recovery is infrastructure recovery, not
    // a fixture privilege. Live real-api leaves must be able to recover one
    // transient renderer failure without rebuilding the app or touching the
    // daily DevTools. The caller can only enable this through the formal
    // dispatch gate; the recovery primitive still verifies ownership,
    // project identity and the close/open/auto cycle.
    const allowRecovery = allowTargetedRestart === true
    phase('launching', {
      ...(fullLanRebuild
        ? {
            full_lan_rebuild_requested: true,
            full_lan_rebuild_command: 'npm run dev:mp-weixin:local-functions:lan',
            full_lan_rebuild_reason: reason
          }
        : {})
    })
    session = await runtimeFactory({
      dispatchRunId,
      sourceProjectPath,
      projectPath: expectedProjectPath,
      screenshotPath,
      wxRequestUrl,
      allowTargetedRestart: allowRecovery,
      forceFullLanRebuild: fullLanRebuild,
      fullLanRebuildReason: reason
    })
    if (session.status !== 'ready') {
      return { failure: failureFromSession(session) }
    }
    const authConsumption =
      gate.entry?.data_mode === 'automator_live_real_api'
        ? await waitForAuthConsumption(session.runtime_evidence)
        : currentQaAuthConsumption()
    const authConsumptionAck = {
      status: authConsumption ? 'passed' : 'blocked',
      code: authConsumption
        ? 'qa_auth_consumption_ack_received'
        : 'qa_auth_consumption_ack_missing',
      event: authConsumption
    }
    phase('runtime_verified', {
      runtime_evidence: session.runtime_evidence,
      auth_consumption: authConsumption,
      auth_consumption_ack: authConsumptionAck
    })
    if (gate.entry?.data_mode === 'automator_live_real_api' && !authConsumption) {
      return {
        failure: {
          status: 'failed_environment',
          terminal_reason: 'qa_auth_consumption_receipt_missing_or_stale',
          runtime_evidence: session.runtime_evidence,
          auth_consumption: currentQaAuthConsumption(),
          auth_consumption_ack: authConsumptionAck,
          live_attempt_consumed: false
        }
      }
    }
    let preflight
    try {
      preflight = await preflightRunner({
        ...session.preflight_options,
        allowTargetedRestart: allowRecovery
      })
    } catch (error) {
      preflight = {
        status: 'failed_environment',
        code: error.code ?? 'runtime_preflight_failed',
        message: error.message
      }
    }
    if (preflight.status !== 'passed') {
      return {
        failure: {
          status: 'failed_environment',
          terminal_reason: preflight.code ?? 'runtime_preflight_failed',
          preflight,
          runtime_evidence: session.runtime_evidence,
          live_attempt_consumed: false
        }
      }
    }
    phase('automator_connected', { preflight })
    phase('preflight_passed')
    return { preflight }
  }

  const runLeafAttempt = async ({ preflight, attempt }) => {
    record = mergeLiveRecord(record, createLiveRecord(attempt))
    record = {
      ...record,
      auth_consumption: record.auth_consumption || currentQaAuthConsumption(),
      auth_consumption_ack: record.auth_consumption_ack || {
        status: record.auth_consumption ? 'passed' : 'blocked',
        code: record.auth_consumption
          ? 'qa_auth_consumption_ack_received'
          : 'qa_auth_consumption_ack_missing',
        event: record.auth_consumption || null
      },
      auth_consumption_captured_at_ms: record.auth_consumption_captured_at_ms || Date.now()
    }
    phase('leaf_running')
    let terminalFromLifecycle = null
    let lifecycle
    try {
      const artifactDir = qaArtifactDir(recordFile, executionId)
      lifecycle = await leafRunner({
        script: gate.script,
        args: stripArgs(args),
        env: {
          ...process.env,
          DISPATCH_QA_EXECUTION_ID: executionId,
          MINIPROGRAM_AUTOMATOR_WS: session.preflight_options.wsEndpoint,
          MP_PROJECT_PATH: session.preflight_options.projectPath,
          MP_AUTOMATOR_PORT: String(session.preflight_options.wsPort),
          QA_RUNTIME_PROJECT_SNAPSHOT: '1',
          QA_RUNTIME_SESSION_ID: session.sessionId,
          QA_CATALOG_DATA_MODE: gate.entry?.data_mode || '',
          QA_CATALOG_AUTH_MODE: gate.entry?.auth_mode || '',
          QA_AUTOMATOR_LIVE_LEAF: gate.entry?.data_mode === 'automator_live_real_api' ? '1' : '0',
          QA_AUTOMATOR_RUNTIME_PROOF: JSON.stringify({
            project_identity_verified:
              session.preflight_options.runtime?.project_identity_verified === true,
            observed_project_path: session.preflight_options.projectPath,
            main_devtools_pid: session.preflight_options.runtime?.main_devtools_pid,
            automation_listener_pid:
              session.preflight_options.runtime?.automation_listener_pid ??
              session.preflight_options.runtime?.port_owner_pid,
            port_owner_pid: session.preflight_options.runtime?.port_owner_pid,
            automator_port: session.preflight_options.wsPort,
            control_port: session.preflight_options.runtime?.control_port,
            control_port_verified: session.preflight_options.runtime?.control_port_verified === true
          }),
          E2E_ARTIFACT_DIR: artifactDir
        },
        timeoutMs: argValue('execution-timeout-ms'),
        onStarted: started => {
          record = { ...record, ...started }
          persist('leaf_process_started')
        },
        onTerminal: terminal => {
          terminalFromLifecycle = terminal
        },
        onStdout: chunk => process.stdout.write(chunk),
        onStderr: chunk => process.stderr.write(chunk)
      })
    } catch (error) {
      phase('leaf_finished', { leaf_lifecycle: terminalFromLifecycle ?? null })
      return {
        leafReport: null,
        reportEvidence: null,
        candidate: {
          status: 'aborted',
          terminal_reason: error.message,
          runtime_evidence: session.runtime_evidence,
          live_attempt_consumed: false
        }
      }
    }
    phase('leaf_finished', {
      leaf_lifecycle: terminalFromLifecycle ?? lifecycle ?? null
    })
    const integrity = inspectBundle({
      script: gate.script,
      frozenScriptHash: gate.scriptHash
    })
    if (terminalFromLifecycle) {
      return {
        leafReport: null,
        reportEvidence: null,
        candidate: integrity.changed
          ? {
              status: 'failed_script',
              ...failedBundleEvidence(integrity),
              live_attempt_consumed: false
            }
          : {
              status: terminalFromLifecycle.status,
              ...terminalFromLifecycle,
              runtime_evidence: session.runtime_evidence,
              auth_consumption: record.auth_consumption,
              auth_consumption_ack: record.auth_consumption_ack,
              live_attempt_consumed: false
            }
      }
    }
    const reportEvidence = persistLeafReport(recordFile, lifecycle, attempt)
    const leafReport = extractLeafReport({ stdout: lifecycle.stdout, stderr: lifecycle.stderr })
    const status = classifyRun({ integrity, lifecycle, reportEvidence })
    return {
      leafReport,
      reportEvidence,
      candidate: {
        status,
        exit_code: lifecycle.exit_code,
        signal: lifecycle.signal ?? null,
        leaf_pid: lifecycle.leaf_pid,
        execution_timeout_ms: lifecycle.execution_timeout_ms,
        preflight,
        runtime_evidence: session.runtime_evidence,
        auth_consumption: record.auth_consumption,
        auth_consumption_ack: record.auth_consumption_ack,
        ...frozenBundleEvidence(integrity),
        leaf_report: reportEvidence,
        live_attempt_consumed: isLiveAttemptConsumed({ status, leafReport: reportEvidence }),
        stdout_excerpt: lifecycle.stdout.slice(-2000),
        stderr_excerpt: lifecycle.stderr.slice(-2000)
      }
    }
  }

  try {
    return await (async () => {
      recoverStaleRuns(dispatchRunId)
      persist('created')
      try {
        phase('owner_recorded')
        const initialRuntime = await prepareRuntime()
        if (initialRuntime.failure) {
          candidate = initialRuntime.failure
          return
        }
        const attemptGate = previousAttemptGate({
          records: readRecords(dispatchRunId),
          catalogId,
          executionId,
          scriptHash: gate.scriptHash
        })
        if (attemptGate.blocked) {
          candidate = {
            status: 'blocked',
            terminal_reason: attemptGate.reason,
            preflight: initialRuntime.preflight,
            runtime_evidence: session.runtime_evidence,
            previous_live_attempts: attemptGate.attempts,
            live_attempt_consumed: false
          }
          return
        }
        let attempt = attemptGate.attempts + 1
        let attemptResult = await runLeafAttempt({
          preflight: initialRuntime.preflight,
          attempt
        })
        candidate = attemptResult.candidate

        if (
          gate.entry?.data_mode === 'fixture_diagnostic' &&
          leafReportRequiresFullLanRebuild(attemptResult.leafReport)
        ) {
          const recoveryReason =
            attemptResult.leafReport.report.blockerReason ?? 'runtime did not expose a user plant'
          const initialCandidate = candidate
          phase('cleaning', {
            full_lan_rebuild_requested: true,
            full_lan_rebuild_command: 'npm run dev:mp-weixin:local-functions:lan',
            full_lan_rebuild_reason: recoveryReason
          })
          const initialCleanup = await runtimeCleanup({ session })
          cleanup = initialCleanup
          phase('cleaned', {
            runtime_cleanup: initialCleanup,
            full_lan_rebuild_requested: true
          })
          session = null
          record = {
            ...record,
            fixture_runtime_recovery: {
              required: true,
              command: 'npm run dev:mp-weixin:local-functions:lan',
              reason: recoveryReason,
              initial_attempt: initialCandidate,
              initial_cleanup: initialCleanup
            }
          }

          if (!qaCleanupPassed(initialCleanup)) {
            candidate = {
              status: 'failed_environment',
              terminal_reason: 'fixture_recovery_runtime_cleanup_failed',
              prior_terminal_reason: recoveryReason,
              runtime_cleanup: initialCleanup,
              live_attempt_consumed: false
            }
          } else {
            const rebuiltRuntime = await prepareRuntime({
              fullLanRebuild: true,
              reason: recoveryReason
            })
            if (rebuiltRuntime.failure) {
              candidate = rebuiltRuntime.failure
            } else {
              attempt += 1
              attemptResult = await runLeafAttempt({
                preflight: rebuiltRuntime.preflight,
                attempt
              })
              candidate = {
                ...attemptResult.candidate,
                fixture_runtime_recovery: record.fixture_runtime_recovery
              }
            }
          }
        }
      } catch (error) {
        candidate = {
          status: 'aborted',
          terminal_reason: error.message,
          runtime_evidence: session?.runtime_evidence ?? null,
          live_attempt_consumed: false
        }
      } finally {
        phase('cleaning')
        if (session) {
          cleanup = await runtimeCleanup({ session })
        }
        phase('cleaned', { runtime_cleanup: cleanup })
        const cleanupFailed = !qaCleanupPassed(cleanup)
        const finalStatus = cleanupFailed ? 'cleanup_failed' : (candidate?.status ?? 'aborted')
        record = finalizeFormalQaRunRecord(record, finalStatus, {
          ...(candidate ?? { terminal_reason: 'qa_execution_missing_terminal_reason' }),
          runtime_cleanup: cleanup,
          ...(cleanupFailed
            ? {
                terminal_reason: 'owned_runtime_cleanup_failed',
                prior_terminal_reason: candidate?.terminal_reason ?? null,
                live_attempt_consumed: false
              }
            : {})
        })
        persist(record.status)
        // oxlint-disable-next-line eslint(no-unsafe-finally) -- terminal records must be returned only after owned-session cleanup.
        return { record, exitCode: record.status === 'passed' ? 0 : 1 }
      }
    })()
  } catch (error) {
    record = transitionFormalQaRunRecord(record, 'cleaning')
    record = transitionFormalQaRunRecord(record, 'cleaned', { runtime_cleanup: cleanup })
    record = finalizeFormalQaRunRecord(record, 'failed_environment', {
      terminal_reason: error.code ?? 'qa_owned_runtime_session_failed',
      failure: { code: error.code ?? 'qa_owned_runtime_session_failed', message: error.message },
      live_attempt_consumed: false
    })
    persist(record.status)
    return { record, exitCode: 1 }
  }
}

export async function runFormalQaPreflight({
  dispatchRunId,
  sourceProjectPath,
  projectPath,
  screenshotPath,
  wxRequestUrl,
  allowTargetedRestart,
  runtimeFactory,
  runtimeCleanup,
  preflightRunner
} = {}) {
  try {
    return await (async () => {
      const session = await runtimeFactory({
        dispatchRunId,
        sourceProjectPath,
        projectPath,
        screenshotPath,
        wxRequestUrl,
        allowTargetedRestart
      })
      let report
      try {
        report =
          session.status === 'ready'
            ? await preflightRunner(session.preflight_options)
            : {
                status: 'failed_environment',
                gate: 'qa_preflight',
                code: session.code,
                failures: [session]
              }
      } catch (error) {
        report = {
          status: 'failed_environment',
          gate: 'qa_preflight',
          code: error.code ?? 'runtime_preflight_failed',
          failures: [{ code: error.code ?? 'runtime_preflight_failed', message: error.message }]
        }
      } finally {
        const cleanup = await runtimeCleanup({ session })
        report.runtime_evidence =
          session.runtime_evidence ?? session.details?.runtime_evidence ?? null
        report.runtime_cleanup = cleanup
        if (!qaCleanupPassed(cleanup)) {
          report.status = 'cleanup_failed'
          report.code = 'owned_runtime_cleanup_failed'
          report.terminal_reason = 'owned_runtime_cleanup_failed'
          report.prior_terminal_reason = report.failures?.[0]?.code ?? null
        }
      }
      return report
    })()
  } catch (error) {
    return {
      status: 'failed_environment',
      gate: 'qa_preflight',
      failures: [{ code: error.code ?? 'qa_owned_runtime_session_failed', message: error.message }]
    }
  }
}
