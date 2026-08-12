import { runDevToolsCli, waitFor } from './test-owned-qa-support.mjs'
import { requestDevToolsControl } from './devtools-runtime-control.mjs'

const RECOVERY_CLI_TIMEOUT_MS = 15_000
const RECOVERY_SETTLE_TIMEOUT_MS = 30_000
const DEFAULT_AUTOMATOR_PREPARE_DELAY_MS = 4_000

function cliFailure(action, result) {
  if (result.timedOut) {
    const error = new Error(`test-owned DevTools ${action} CLI timed out`)
    error.code = `qa_test_owned_${action}_timeout`
    throw error
  }
  if (result.exitCode !== 0) {
    const error = new Error(
      `test-owned DevTools ${action} CLI exited with code ${result.exitCode ?? 'unknown'}`
    )
    error.code = `qa_test_owned_${action}_failed`
    throw error
  }
}

function controlFailure(action, result) {
  if (Number(result?.status_code) === 200) {
    return
  }
  const error = new Error(
    `test-owned DevTools ${action} control request failed with status ${result?.status_code ?? 'unknown'}`
  )
  error.code = `qa_test_owned_${action}_failed`
  throw error
}

export async function recoverTestOwnedDevToolsStartup({
  session,
  home,
  outputPath,
  mainForSessionFn,
  projectOpenEvidenceFn,
  idePortReadyFn = null,
  launchDevTools = null,
  runCli = runDevToolsCli,
  controlRequest = requestDevToolsControl,
  waitForFn = waitFor,
  onInvocation = null,
  cliTimeoutMs = RECOVERY_CLI_TIMEOUT_MS,
  settleTimeoutMs = RECOVERY_SETTLE_TIMEOUT_MS,
  automatorPrepareDelayMs = DEFAULT_AUTOMATOR_PREPARE_DELAY_MS
} = {}) {
  const invocations = []
  const run = async (action, args) => {
    const result = await runCli({
      home,
      args,
      outputPath,
      timeoutMs: cliTimeoutMs
    })
    const invocation = {
      action,
      pid: result.pid ?? null,
      exit_code: result.exitCode ?? null,
      timed_out: Boolean(result.timedOut)
    }
    invocations.push(invocation)
    onInvocation?.(invocation, result)
    cliFailure(action, result)
    return result
  }

  const enableAutomator = async () => {
    const result = await controlRequest({
      action: 'auto',
      projectPath: session.projectPath,
      controlPort: session.controlPort,
      wsPort: session.wsPort
    })
    const invocation = {
      action: 'auto',
      transport: 'devtools_control_endpoint',
      control_port: Number(session.controlPort),
      automator_port: Number(session.wsPort),
      status_code: result?.status_code ?? null,
      url: result?.url ?? '',
      body_excerpt: String(result?.body_excerpt ?? result?.error ?? '').slice(0, 1000)
    }
    invocations.push(invocation)
    onInvocation?.(invocation, result)
    controlFailure('auto', result)
    return result
  }

  await run('quit', ['quit', '--port', String(session.controlPort)])
  await waitForFn(
    () => !mainForSessionFn(session),
    settleTimeoutMs,
    'test-owned DevTools exit during startup recovery'
  )

  if (launchDevTools) {
    const launch = await launchDevTools()
    const invocation = {
      action: 'direct_launch',
      pid: launch?.pid ?? null,
      control_port: Number(session.controlPort),
      app_session_id: launch?.app_session_id ?? ''
    }
    invocations.push(invocation)
    onInvocation?.(invocation, launch)
    await waitForFn(
      () => mainForSessionFn(session),
      settleTimeoutMs,
      'test-owned DevTools direct relaunch during startup recovery'
    )
    if (idePortReadyFn) {
      await waitForFn(
        () => idePortReadyFn(session),
        settleTimeoutMs,
        'test-owned DevTools control-port marker during startup recovery'
      )
    }
  }

  await run('open', [
    'open',
    '--project',
    session.projectPath,
    '--port',
    String(session.controlPort)
  ])
  if (!launchDevTools) {
    await waitForFn(
      () => mainForSessionFn(session),
      settleTimeoutMs,
      'test-owned DevTools reopen during startup recovery'
    )
  }
  await waitForFn(
    () => projectOpenEvidenceFn(session),
    settleTimeoutMs,
    'test-owned project reopen during startup recovery'
  )
  if (automatorPrepareDelayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, automatorPrepareDelayMs))
  }

  await enableAutomator()
  await waitForFn(
    () => projectOpenEvidenceFn(session),
    settleTimeoutMs,
    'test-owned project auto-enable during startup recovery'
  )

  return {
    status: 'restarted',
    recovery: 'test_owned_cli_quit_open_auto_once',
    invocations
  }
}
