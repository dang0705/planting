import { waitFor } from './test-owned-qa-support.mjs'
import { terminateProcessTree } from './test-owned-qa-support.mjs'
import { requestDevToolsControl } from './devtools-runtime-control.mjs'
import { listenerPids } from './devtools-process-topology.mjs'

const RECOVERY_SETTLE_TIMEOUT_MS = 30_000
const DEFAULT_AUTOMATOR_PREPARE_DELAY_MS = 4_000

function controlInvocation(action, result, session) {
  return {
    action,
    control_port: Number(session.controlPort),
    status_code: result?.status_code ?? null,
    url: result?.url ?? '',
    body_excerpt: String(result?.body_excerpt ?? result?.error ?? '').slice(0, 1000)
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
  error.details = {
    action,
    status_code: result?.status_code ?? null,
    url: result?.url ?? '',
    body_excerpt: String(result?.body_excerpt ?? result?.error ?? '').slice(0, 1000),
    response: result?.response ?? null
  }
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
  openProjectFn = null,
  controlRequest = requestDevToolsControl,
  terminateProcessTreeFn = terminateProcessTree,
  listenerPidsFn = listenerPids,
  waitForFn = waitFor,
  onInvocation = null,
  settleTimeoutMs = RECOVERY_SETTLE_TIMEOUT_MS,
  automatorPrepareDelayMs = DEFAULT_AUTOMATOR_PREPARE_DELAY_MS,
  projectCompileReadyFn = null
} = {}) {
  const invocations = []
  const run = async action => {
    const result = await controlRequest({
      action,
      projectPath: session.projectPath,
      controlPort: session.controlPort,
      wsPort: session.wsPort
    })
    const invocation = {
      action,
      transport: result?.transport || 'devtools_control_endpoint',
      control_port: Number(session.controlPort),
      status_code: result?.status_code ?? null,
      url: result?.url ?? '',
      body_excerpt: String(result?.body_excerpt ?? result?.error ?? '').slice(0, 1000)
    }
    invocations.push(invocation)
    onInvocation?.(invocation, result)
    controlFailure(action, result)
    return result
  }

  const enableAutomator = async () => {
    return run('auto')
  }

  const recoverVerifiedTargetAfterCloseConflict = async closeResult => {
    const target = mainForSessionFn(session)
    if (!target?.pid) {
      // A failed close request can race with DevTools exiting on its own. If
      // both isolated control ports are already free, the target is closed
      // and recovery may safely continue. A lingering listener still blocks.
      const listeners = [session.controlPort, session.wsPort]
        .filter(Boolean)
        .flatMap(port => listenerPidsFn(port) || [])
      return listeners.length === 0
    }
    const expectedPid = Number(
      session.main_devtools_pid ||
        session.initial_devtools_launch?.pid ||
        session.devtoolsCliPid ||
        0
    )
    const expectedPackage = String(session.initial_devtools_launch?.package_dir || '')
    const command = String(target.command || '')
    const official = session.devtools_runtime_kind === 'official_electron'
    const hasPortArgument = (flag, value) =>
      command.includes(`${flag}=${Number(value)}`) ||
      command.includes(`${flag} ${Number(value)}`)
    const ownerVerified = official
      ? Boolean(
          expectedPid > 0 &&
          Number(target.pid) === expectedPid &&
          command.includes('/Contents/MacOS/Electron') &&
          command.includes('/Contents/Resources/app.asar') &&
          command.includes('--cli') &&
          command.includes(`--user-data-dir=${session.devtools_user_data_dir}`) &&
          hasPortArgument('--ide-http-port', session.controlPort)
        )
      : Boolean(
          expectedPid > 0 &&
          Number(target.pid) === expectedPid &&
          command.includes(`--user-data-dir=${session.profile}`) &&
          expectedPackage &&
          command.includes(expectedPackage) &&
          hasPortArgument('--ide-http-port', session.controlPort)
        )
    if (!ownerVerified) {
      return false
    }
    const terminated = await terminateProcessTreeFn(target.pid)
    invocations.push({
      action: 'target_only_terminate',
      transport: 'verified_process_tree',
      pid: Number(target.pid),
      status: terminated.length ? 'blocked' : 'terminated',
      close_status_code: closeResult?.status_code ?? null
    })
    if (terminated.length) {
      return false
    }
    await waitForFn(
      () => !mainForSessionFn(session),
      settleTimeoutMs,
      'test-owned DevTools exit after verified target-only recovery'
    )
    return true
  }

  try {
    try {
      await run('close')
    } catch (error) {
      // The IDE close endpoint can return 400/500 or drop the connection while
      // the verified test-owned process is still alive but its project window
      // has already been lost.  The status is not the safety decision: only
      // the verified process-ownership check below may authorize target-only
      // termination.  An unverified process still fails closed.
      const recovered = await recoverVerifiedTargetAfterCloseConflict(error.details)
      if (!recovered) {
        throw error
      }
    }
    await waitForFn(
      () => !mainForSessionFn(session),
      settleTimeoutMs,
      'test-owned DevTools exit during startup recovery'
    )

    let launch = null
    if (launchDevTools) {
      launch = await launchDevTools()
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

    const launchOpenedProject = Boolean(launch?.project_opened)
    if (!launchOpenedProject) {
      if (openProjectFn) {
        const opened = await openProjectFn()
        const result = opened?.result ?? opened
        const invocation = opened?.invocation ?? controlInvocation('open', result, session)
        invocations.push(invocation)
        onInvocation?.(invocation, result)
        controlFailure('open', result)
      } else {
        await run('open')
      }
    } else {
      const cliOpen = launch?.cli_open || {}
      const officialOpen = {
        status_code: Number(cliOpen.status) === 0 ? 200 : null,
        url: `official-cli://${session.projectPath}`,
        body_excerpt: String(cliOpen.stdout || cliOpen.stderr || '')
      }
      const invocation = {
        ...controlInvocation('open', officialOpen, session),
        transport: 'official_cli'
      }
      invocations.push(invocation)
      onInvocation?.(invocation, officialOpen)
    }
    if (!launchDevTools || launchOpenedProject === false) {
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
    if (projectCompileReadyFn) {
      await projectCompileReadyFn(session, settleTimeoutMs)
    } else if (automatorPrepareDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, automatorPrepareDelayMs))
    }

    await enableAutomator()
    await waitForFn(
      () => projectOpenEvidenceFn(session),
      settleTimeoutMs,
      'test-owned project auto-enable during startup recovery'
    )
  } catch (error) {
    error.details = {
      ...(error.details || {}),
      recovery_invocations: invocations
    }
    error.recovery_invocations = invocations
    throw error
  }

  return {
    status: 'restarted',
    recovery: 'test_owned_control_close_open_auto_once',
    invocations
  }
}
