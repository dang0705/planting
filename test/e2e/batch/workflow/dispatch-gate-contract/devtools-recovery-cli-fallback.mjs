import assert from 'node:assert/strict'
import { recoverVerifiedTargetDevTools } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime.mjs'
import { repoRoot } from './helpers.mjs'

const projectPath = repoRoot
const controlPort = 3799
const postOpenControlPort = 28434
const wsPort = 9420

function verifiedRuntime({ mainPid = 100, listenerPid = 101, project = projectPath } = {}) {
  return {
    status: 'verified',
    automator_port: wsPort,
    automator_listener_pids: [listenerPid],
    main_devtools_pid: mainPid,
    automation_listener_pid: listenerPid,
    port_owner_pid: listenerPid,
    control_port: controlPort,
    control_port_verified: true,
    observed_project_path: project,
    project_identity_verified: true,
    project_identity_source: 'weapp_log_current_session',
    session_log_evidence: { status: 'bootstrap_verified' }
  }
}

function unavailableRuntime() {
  return { status: 'unavailable', automator_port: wsPort, automator_listener_pids: [] }
}

function postOpenRuntime({ sessionId = 'session-200' } = {}) {
  return {
    status: 'target_ready',
    main_devtools_pid: 200,
    control_port: postOpenControlPort,
    control_port_verified: true,
    observed_project_path: projectPath,
    project_identity_verified: true,
    project_identity_source: 'weapp_log_current_session',
    session_log_evidence: { status: 'bootstrap_verified', session_id: sessionId }
  }
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

function successfulControlRequest(actions) {
  return async ({ action }) => {
    actions.push(action)
    return { status_code: 200, url: `http://control.test/${action}` }
  }
}

function successfulCli(calls) {
  return (_executable, args) => {
    calls.push(args)
    return { status: 0, stdout: 'ok', stderr: '' }
  }
}

function recoveryOptions({
  runtimeInspector,
  controlActions,
  cliCalls,
  cliRunner,
  postOpenInspector,
  postOpenAuto
} = {}) {
  return {
    projectPath,
    wsPort,
    verifiedRuntime: verifiedRuntime(),
    commandRunner: recoveryCommandRunner(),
    controlRequest: successfulControlRequest(controlActions),
    runtimeInspector,
    observationAttempts: 2,
    observationDelayMs: 0,
    cliRunner: cliRunner ?? successfulCli(cliCalls),
    cliExitAttempts: 1,
    cliExitDelayMs: 0,
    postOpenRuntimeInspector: postOpenInspector,
    postOpenAttempts: 1,
    postOpenDelayMs: 0,
    postOpenAuto,
    cliRuntimeAttempts: 2,
    cliRuntimeDelayMs: 0
  }
}

// A normal target-scoped close/open/auto recovery remains the first and sufficient path.
{
  const controlActions = []
  const cliCalls = []
  const postOpenAutoCalls = []
  const runtimeSnapshots = [
    verifiedRuntime({ mainPid: 200, listenerPid: 201 }),
    verifiedRuntime({ mainPid: 200, listenerPid: 201 })
  ]
  const result = await recoverVerifiedTargetDevTools(
    recoveryOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => runtimeSnapshots.shift(),
      postOpenInspector: async () => {
        throw new Error('post-open inspection must not run after normal recovery')
      },
      postOpenAuto: async request => postOpenAutoCalls.push(request)
    })
  )
  assert.equal(result.status, 'recovered')
  assert.equal(result.recovery, 'repository_owned_target_project_close_open_auto')
  assert.deepEqual(controlActions, ['close', 'open', 'auto'])
  assert.deepEqual(cliCalls, [], 'successful control recovery must never invoke the CLI fallback')
  assert.deepEqual(postOpenAutoCalls, [])
}

// Only an exhausted, already preverified recovery may quit then reopen the verified target.
{
  const controlActions = []
  const cliCalls = []
  const postOpenAutoCalls = []
  const runtimeSnapshots = [
    unavailableRuntime(),
    verifiedRuntime({ mainPid: 200, listenerPid: 201 }),
    verifiedRuntime({ mainPid: 200, listenerPid: 201 })
  ]
  const result = await recoverVerifiedTargetDevTools({
    ...recoveryOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => runtimeSnapshots.shift(),
      postOpenInspector: async () => postOpenRuntime(),
      postOpenAuto: async request => {
        postOpenAutoCalls.push(request)
        return { action: 'auto', ...request, status_code: 200 }
      }
    }),
    observationAttempts: 1
  })
  assert.equal(result.status, 'recovered')
  assert.equal(result.recovery, 'official_cli_quit_open_then_verified_target_scoped_auto')
  assert.deepEqual(controlActions, ['close', 'open', 'auto'])
  assert.deepEqual(cliCalls, [
    ['quit', '--port', String(controlPort)],
    ['open', '--project', projectPath, '--port', String(controlPort)]
  ])
  assert.equal(result.old_runtime_exit_evidence.settled, true)
  assert.equal(result.old_runtime_exit_evidence.observations[0].old_main_alive, false)
  assert.deepEqual(result.old_runtime_exit_evidence.observations[0].old_listener_pids_remaining, [])
  assert.deepEqual(postOpenAutoCalls, [{ projectPath, controlPort: postOpenControlPort, wsPort }])
  assert.equal(result.post_open_auto_invocations.length, 1)
  assert.equal(result.observation_attempts.length, 2)
  assert.ok(result.observation_attempts.every(item => item.target_runtime_verified))
  assert.ok(result.observation_attempts.every(item => item.new_runtime_identity_verified))
}

// A CLI reopen without fresh current-session proof cannot send post-open auto.
{
  const controlActions = []
  const cliCalls = []
  const postOpenAutoCalls = []
  const result = await recoverVerifiedTargetDevTools({
    ...recoveryOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => unavailableRuntime(),
      postOpenInspector: async () => postOpenRuntime({ sessionId: '' }),
      postOpenAuto: async request => postOpenAutoCalls.push(request)
    }),
    observationAttempts: 1
  })
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_post_open_new_session_not_verified')
  assert.deepEqual(postOpenAutoCalls, [])
  assert.deepEqual(result.post_open_auto_invocations, [])
  assert.equal(cliCalls.length, 2)
}

// Unverified input never reaches a control request or the destructive CLI path.
{
  const controlActions = []
  const cliCalls = []
  const result = await recoverVerifiedTargetDevTools({
    ...recoveryOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => unavailableRuntime()
    }),
    verifiedRuntime: unavailableRuntime()
  })
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_project_runtime_not_safely_preverified')
  assert.deepEqual(controlActions, [])
  assert.deepEqual(cliCalls, [])
}

// A CLI error remains an environmental failure rather than a false recovery.
{
  const controlActions = []
  const cliCalls = []
  const result = await recoverVerifiedTargetDevTools({
    ...recoveryOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => unavailableRuntime(),
      cliRunner: (_executable, args) => {
        cliCalls.push(args)
        return { status: 10, stdout: '', stderr: 'Port is not provided' }
      }
    }),
    observationAttempts: 1
  })
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_cli_quit_failed')
  assert.deepEqual(cliCalls, [['quit', '--port', String(controlPort)]])
  assert.deepEqual(controlActions, ['close', 'open', 'auto'])
}

// A timed-out CLI command is also terminal; the fallback must not continue to open.
{
  const controlActions = []
  const cliCalls = []
  const result = await recoverVerifiedTargetDevTools({
    ...recoveryOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => unavailableRuntime(),
      cliRunner: (_executable, args) => {
        cliCalls.push(args)
        return { status: null, error: { code: 'ETIMEDOUT', message: 'timed out' } }
      }
    }),
    observationAttempts: 1
  })
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_cli_quit_failed')
  assert.equal(result.cli_invocations[0].timed_out, true)
  assert.deepEqual(cliCalls, [['quit', '--port', String(controlPort)]])
  assert.deepEqual(controlActions, ['close', 'open', 'auto'])
}

// A reopened process still needs two new, target-proved runtime snapshots before recovery.
{
  const controlActions = []
  const cliCalls = []
  const postOpenAutoCalls = []
  const oldIdentity = verifiedRuntime()
  const runtimeSnapshots = [unavailableRuntime(), oldIdentity, oldIdentity]
  const result = await recoverVerifiedTargetDevTools({
    ...recoveryOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => runtimeSnapshots.shift(),
      postOpenInspector: async () => postOpenRuntime(),
      postOpenAuto: async request => {
        postOpenAutoCalls.push(request)
        return { action: 'auto', ...request, status_code: 200 }
      }
    }),
    observationAttempts: 1
  })
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_runtime_not_stably_restarted_after_cli_fallback')
  assert.deepEqual(cliCalls, [
    ['quit', '--port', String(controlPort)],
    ['open', '--project', projectPath, '--port', String(controlPort)]
  ])
  assert.ok(result.observation_attempts.every(item => item.target_runtime_verified))
  assert.ok(result.observation_attempts.every(item => !item.new_runtime_identity_verified))
  assert.equal(postOpenAutoCalls.length, 1)
  assert.deepEqual(controlActions, ['close', 'open', 'auto'])
}

// A listener with an unproved target project cannot satisfy the post-CLI identity gate.
{
  const controlActions = []
  const cliCalls = []
  const postOpenAutoCalls = []
  const wrongTarget = verifiedRuntime({
    mainPid: 200,
    listenerPid: 201,
    project: `${projectPath}/not-the-verified-target`
  })
  const runtimeSnapshots = [unavailableRuntime(), wrongTarget, wrongTarget]
  const result = await recoverVerifiedTargetDevTools({
    ...recoveryOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => runtimeSnapshots.shift(),
      postOpenInspector: async () => postOpenRuntime(),
      postOpenAuto: async request => {
        postOpenAutoCalls.push(request)
        return { action: 'auto', ...request, status_code: 200 }
      }
    }),
    observationAttempts: 1
  })
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_runtime_not_reverified_after_cli_fallback')
  assert.ok(result.observation_attempts.every(item => !item.target_runtime_verified))
  assert.ok(
    result.observation_attempts.every(
      item => item.observed_project_path === wrongTarget.observed_project_path
    )
  )
  assert.equal(postOpenAutoCalls.length, 1)
  assert.deepEqual(controlActions, ['close', 'open', 'auto'])
}
