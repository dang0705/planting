import assert from 'node:assert/strict'
import { recoverVerifiedTargetDevTools } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime.mjs'
import { repoRoot } from './helpers.mjs'

const projectPath = repoRoot
const oldControlPort = 3799
const newControlPort = 28434
const wsPort = 9420

function fullRuntime({ mainPid = 100, listenerPid = 101, controlPort = oldControlPort } = {}) {
  return {
    status: 'verified',
    automator_port: wsPort,
    automator_listener_pids: [listenerPid],
    main_devtools_pid: mainPid,
    automation_listener_pid: listenerPid,
    port_owner_pid: listenerPid,
    control_port: controlPort,
    control_port_verified: true,
    observed_project_path: projectPath,
    project_identity_verified: true,
    project_identity_source: 'weapp_log_current_session',
    session_log_evidence: { status: 'bootstrap_verified', session_id: `session-${mainPid}` }
  }
}

function missingAutomatorListenerRuntime() {
  return {
    ...fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort }),
    automator_listener_pids: [],
    automation_listener_pid: null,
    port_owner_pid: null
  }
}

function postOpenRuntime({
  mainPid = 200,
  controlPort = newControlPort,
  sessionId = 'session-200'
} = {}) {
  return {
    status: 'target_ready',
    main_devtools_pid: mainPid,
    control_port: controlPort,
    control_port_verified: true,
    observed_project_path: projectPath,
    project_identity_verified: true,
    project_identity_source: 'weapp_log_current_session',
    session_log_evidence: { status: 'bootstrap_verified', session_id: sessionId }
  }
}

function unavailableRuntime() {
  return { status: 'unavailable', automator_port: wsPort, automator_listener_pids: [] }
}

function recoveryCommandRunner() {
  let listenerProbeCount = 0
  return (command, args) => {
    if (command === 'lsof' && args.includes('-t')) {
      const port = args.find(value => String(value).startsWith('-iTCP:'))
      if (port === `-iTCP:${wsPort}`) {
        listenerProbeCount += 1
        return { status: 0, stdout: listenerProbeCount === 1 ? '101\n' : '', stderr: '' }
      }
      return { status: 0, stdout: '', stderr: '' }
    }
    if (command === 'ps' && args.includes('-p')) {
      return { status: 0, stdout: '', stderr: '' }
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`)
  }
}

function recoveryOptions({
  runtimeSnapshots,
  postOpenSnapshots,
  autoResponses,
  controlActions,
  cliCalls,
  autoCalls
}) {
  return {
    projectPath,
    wsPort,
    verifiedRuntime: fullRuntime(),
    commandRunner: recoveryCommandRunner(),
    controlRequest: async ({ action }) => {
      controlActions.push(action)
      return { status_code: 200, action }
    },
    runtimeInspector: async () => runtimeSnapshots.shift() ?? unavailableRuntime(),
    observationAttempts: 1,
    observationDelayMs: 0,
    cliRunner: (_executable, args) => {
      cliCalls.push(args)
      return { status: 0, stdout: 'ok', stderr: '' }
    },
    cliExitAttempts: 1,
    cliExitDelayMs: 0,
    postOpenRuntimeInspector: async () => postOpenSnapshots.shift() ?? unavailableRuntime(),
    postOpenAttempts: 1,
    postOpenDelayMs: 0,
    postOpenAuto: async request => {
      autoCalls.push(request)
      return { action: 'auto', ...request, status_code: autoResponses.shift() ?? 200 }
    },
    cliRuntimeAttempts: 2,
    cliRuntimeDelayMs: 0
  }
}

// The normal same-process route remains enough and never reaches CLI or post-open auto.
{
  const controlActions = []
  const cliCalls = []
  const autoCalls = []
  const result = await recoverVerifiedTargetDevTools({
    ...recoveryOptions({
      controlActions,
      cliCalls,
      autoCalls,
      runtimeSnapshots: [
        fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort }),
        fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort })
      ],
      postOpenSnapshots: [],
      autoResponses: []
    }),
    observationAttempts: 2
  })
  assert.equal(result.status, 'recovered')
  assert.equal(result.recovery, 'repository_owned_target_project_close_open_auto')
  assert.deepEqual(controlActions, ['close', 'open', 'auto'])
  assert.deepEqual(cliCalls, [])
  assert.deepEqual(autoCalls, [])
}

// Two listener-free proofs after the first auto reverify the same new session and retry once.
{
  const controlActions = []
  const cliCalls = []
  const autoCalls = []
  const result = await recoverVerifiedTargetDevTools(
    recoveryOptions({
      controlActions,
      cliCalls,
      autoCalls,
      runtimeSnapshots: [
        unavailableRuntime(),
        missingAutomatorListenerRuntime(),
        missingAutomatorListenerRuntime(),
        fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort }),
        fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort })
      ],
      postOpenSnapshots: [postOpenRuntime(), postOpenRuntime()],
      autoResponses: [200, 200]
    })
  )
  assert.equal(result.status, 'recovered')
  assert.equal(result.recovery, 'official_cli_quit_open_then_verified_target_scoped_auto_retry')
  assert.deepEqual(cliCalls, [
    ['quit', '--port', String(oldControlPort)],
    ['open', '--project', projectPath, '--port', String(oldControlPort)]
  ])
  assert.deepEqual(autoCalls, [
    { projectPath, controlPort: newControlPort, wsPort },
    { projectPath, controlPort: newControlPort, wsPort }
  ])
  assert.equal(result.post_open_auto_invocations.length, 1)
  assert.equal(result.post_open_auto_retry_invocations.length, 1)
  assert.equal(result.post_open_retry_observation_attempts[0].main_devtools_pid, 200)
  assert.equal(result.post_open_retry_observation_attempts[0].control_port, newControlPort)
  assert.equal(result.retry_observation_attempts.length, 2)
  assert.ok(result.retry_observation_attempts.every(item => item.target_runtime_verified))
  assert.ok(result.retry_observation_attempts.every(item => item.new_runtime_identity_verified))
}

// A changed post-open main process cannot consume the one retry, even without a listener.
{
  const controlActions = []
  const cliCalls = []
  const autoCalls = []
  const result = await recoverVerifiedTargetDevTools(
    recoveryOptions({
      controlActions,
      cliCalls,
      autoCalls,
      runtimeSnapshots: [
        unavailableRuntime(),
        missingAutomatorListenerRuntime(),
        missingAutomatorListenerRuntime()
      ],
      postOpenSnapshots: [postOpenRuntime(), postOpenRuntime({ mainPid: 201 })],
      autoResponses: [200]
    })
  )
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_post_open_retry_same_session_not_verified')
  assert.equal(autoCalls.length, 1)
  assert.equal(result.post_open_auto_retry_invocations.length, 0)
  assert.equal(result.post_open_retry_observation_attempts[0].main_devtools_pid, 201)
}

// A retry that still has no listener is terminal, not a fabricated recovery or another retry.
{
  const controlActions = []
  const cliCalls = []
  const autoCalls = []
  const result = await recoverVerifiedTargetDevTools(
    recoveryOptions({
      controlActions,
      cliCalls,
      autoCalls,
      runtimeSnapshots: [
        unavailableRuntime(),
        missingAutomatorListenerRuntime(),
        missingAutomatorListenerRuntime(),
        missingAutomatorListenerRuntime(),
        missingAutomatorListenerRuntime()
      ],
      postOpenSnapshots: [postOpenRuntime(), postOpenRuntime()],
      autoResponses: [200, 200]
    })
  )
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_runtime_not_reverified_after_cli_fallback_after_auto_retry')
  assert.equal(autoCalls.length, 2)
  assert.equal(result.post_open_auto_retry_invocations.length, 1)
  assert.equal(result.retry_observation_attempts.length, 2)
  assert.ok(
    result.retry_observation_attempts.every(item => item.automator_listener_pids.length === 0)
  )
}

// Two full proofs after the first auto are sufficient and must not retry.
{
  const controlActions = []
  const cliCalls = []
  const autoCalls = []
  const result = await recoverVerifiedTargetDevTools(
    recoveryOptions({
      controlActions,
      cliCalls,
      autoCalls,
      runtimeSnapshots: [
        unavailableRuntime(),
        fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort }),
        fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort })
      ],
      postOpenSnapshots: [postOpenRuntime()],
      autoResponses: [200]
    })
  )
  assert.equal(result.status, 'recovered')
  assert.equal(result.recovery, 'official_cli_quit_open_then_verified_target_scoped_auto')
  assert.equal(autoCalls.length, 1)
  assert.deepEqual(result.post_open_auto_retry_invocations, [])
  assert.deepEqual(result.post_open_retry_observation_attempts, [])
}
