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

function postOpenRuntime({ sessionId = 'session-200' } = {}) {
  return {
    status: 'target_ready',
    main_devtools_pid: 200,
    control_port: newControlPort,
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

function baseOptions({
  runtimeInspector,
  postOpenInspector,
  postOpenAuto,
  controlActions,
  cliCalls
}) {
  return {
    projectPath,
    wsPort,
    verifiedRuntime: fullRuntime(),
    commandRunner: recoveryCommandRunner(),
    controlRequest: async ({ action }) => {
      controlActions.push(action)
      return { status_code: 200, url: `http://control.test/${action}` }
    },
    runtimeInspector,
    observationAttempts: 1,
    observationDelayMs: 0,
    cliRunner: (_executable, args) => {
      cliCalls.push(args)
      return { status: 0, stdout: 'ok', stderr: '' }
    },
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

// Target-scoped close/open/auto remains sufficient when it recovers on its own.
{
  const controlActions = []
  const cliCalls = []
  const postOpenAutoCalls = []
  const snapshots = [
    fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort }),
    fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort })
  ]
  const result = await recoverVerifiedTargetDevTools({
    ...baseOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => snapshots.shift(),
      postOpenInspector: async () => {
        throw new Error('post-open inspection must not run after normal recovery')
      },
      postOpenAuto: async request => postOpenAutoCalls.push(request)
    }),
    observationAttempts: 2
  })
  assert.equal(result.status, 'recovered')
  assert.equal(result.recovery, 'repository_owned_target_project_close_open_auto')
  assert.deepEqual(controlActions, ['close', 'open', 'auto'])
  assert.deepEqual(cliCalls, [])
  assert.deepEqual(postOpenAutoCalls, [])
}

// Exhaustion requires the exact CLI quit/open sequence, then one scoped auto on the new port.
{
  const controlActions = []
  const cliCalls = []
  const postOpenAutoCalls = []
  const snapshots = [
    unavailableRuntime(),
    fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort }),
    fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort })
  ]
  const result = await recoverVerifiedTargetDevTools(
    baseOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => snapshots.shift(),
      postOpenInspector: async () => postOpenRuntime(),
      postOpenAuto: async request => {
        postOpenAutoCalls.push(request)
        return { action: 'auto', ...request, status_code: 200 }
      }
    })
  )
  assert.equal(result.status, 'recovered')
  assert.equal(result.recovery, 'official_cli_quit_open_then_verified_target_scoped_auto')
  assert.deepEqual(cliCalls, [
    ['quit', '--port', String(oldControlPort)],
    ['open', '--project', projectPath, '--port', String(oldControlPort)]
  ])
  assert.deepEqual(postOpenAutoCalls, [{ projectPath, controlPort: newControlPort, wsPort }])
  assert.equal(result.post_open_auto_invocations.length, 1)
  assert.equal(result.observation_attempts.length, 2)
  assert.ok(result.observation_attempts.every(item => item.target_runtime_verified))
  assert.ok(result.observation_attempts.every(item => item.new_runtime_identity_verified))
}

// Missing current-session proof blocks before scoped auto, even after a successful CLI open.
{
  const controlActions = []
  const cliCalls = []
  const postOpenAutoCalls = []
  const result = await recoverVerifiedTargetDevTools(
    baseOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => unavailableRuntime(),
      postOpenInspector: async () => postOpenRuntime({ sessionId: '' }),
      postOpenAuto: async request => postOpenAutoCalls.push(request)
    })
  )
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_post_open_new_session_not_verified')
  assert.deepEqual(postOpenAutoCalls, [])
  assert.deepEqual(result.post_open_auto_invocations, [])
  assert.equal(cliCalls.length, 2)
}

// A non-200 scoped auto remains blocked and cannot manufacture a recovered state.
{
  const controlActions = []
  const cliCalls = []
  const postOpenAutoCalls = []
  const result = await recoverVerifiedTargetDevTools(
    baseOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => unavailableRuntime(),
      postOpenInspector: async () => postOpenRuntime(),
      postOpenAuto: async request => {
        postOpenAutoCalls.push(request)
        return { action: 'auto', ...request, status_code: 500 }
      }
    })
  )
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_post_open_auto_failed')
  assert.equal(postOpenAutoCalls.length, 1)
  assert.equal(result.post_open_auto_invocations.length, 1)
  assert.equal(cliCalls.length, 2)
}

// One full post-auto snapshot is insufficient; recovery needs two stable new runtimes.
{
  const controlActions = []
  const cliCalls = []
  const postOpenAutoCalls = []
  const snapshots = [
    unavailableRuntime(),
    fullRuntime({ mainPid: 200, listenerPid: 201, controlPort: newControlPort }),
    unavailableRuntime()
  ]
  const result = await recoverVerifiedTargetDevTools(
    baseOptions({
      controlActions,
      cliCalls,
      runtimeInspector: async () => snapshots.shift(),
      postOpenInspector: async () => postOpenRuntime(),
      postOpenAuto: async request => {
        postOpenAutoCalls.push(request)
        return { action: 'auto', ...request, status_code: 200 }
      }
    })
  )
  assert.equal(result.status, 'failed_environment')
  assert.equal(result.reason, 'target_runtime_not_stably_restarted_after_cli_fallback')
  assert.equal(postOpenAutoCalls.length, 1)
  assert.equal(result.observation_attempts.length, 2)
  assert.equal(result.observation_attempts[0].target_runtime_verified, true)
  assert.equal(result.observation_attempts[1].target_runtime_verified, false)
}
