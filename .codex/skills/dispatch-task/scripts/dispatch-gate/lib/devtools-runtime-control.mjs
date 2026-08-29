import http from 'node:http'
import { spawnSync } from 'node:child_process'
import {
  DEVTOOLS_CONTROL_HOST,
  normalizeRuntimePath,
  positiveInteger
} from './devtools-process-topology.mjs'
import {
  discoverTargetDevToolsRuntime,
  inspectDevToolsRuntime
} from './devtools-runtime-inspection.mjs'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const DEVTOOLS_CONTROL_REQUEST_TIMEOUT_MS = 8_000

export function validVerifiedRuntime(runtime, expectedProjectPath, wsPort) {
  return (
    runtime?.status === 'verified' &&
    runtime?.project_identity_verified === true &&
    normalizeRuntimePath(runtime?.observed_project_path) ===
      normalizeRuntimePath(expectedProjectPath) &&
    positiveInteger(runtime?.main_devtools_pid) &&
    positiveInteger(runtime?.automation_listener_pid ?? runtime?.port_owner_pid) &&
    positiveInteger(runtime?.control_port) &&
    Number(runtime.control_port) !== Number(wsPort) &&
    runtime?.control_port_verified === true
  )
}

export async function requestDevToolsControl({
  action,
  projectPath,
  controlPort,
  wsPort = 9420,
  protocol = 'legacy',
  httpGet = http.get
}) {
  if (!['close', 'open', 'auto'].includes(action) || !positiveInteger(controlPort)) {
    return { status_code: null, error: 'invalid_devtools_control_request' }
  }
  const url = new URL(`http://${DEVTOOLS_CONTROL_HOST}:${Number(controlPort)}/${action}`)
  url.searchParams.set('cli', '1')
  // DevTools 2.02.2608272 keeps /open on the legacy projectpath query but
  // moved the v2 /auto contract to `project` + `autoPort`.  The stock CLI
  // still sends the old names and exits zero even when the endpoint rejects
  // them, so the official-Electron adapter must be explicit about the
  // protocol instead of trusting the CLI exit code.
  if (action === 'auto' && protocol === 'v2') {
    url.pathname = '/v2/auto'
    url.searchParams.set('project', projectPath)
    url.searchParams.set('autoPort', String(wsPort))
  } else {
    url.searchParams.set('projectpath', projectPath)
  }
  if (action === 'auto') {
    if (protocol !== 'v2') {
      url.searchParams.set('port', String(wsPort))
    }
    url.searchParams.set('account', '')
  }
  const requestOnce = requestUrl => new Promise(resolve => {
    const request = httpGet(requestUrl, { timeout: DEVTOOLS_CONTROL_REQUEST_TIMEOUT_MS }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        body += chunk
      })
      response.on('end', () => {
        const location = response.headers?.location
        if (response.statusCode >= 300 && response.statusCode < 400 && location) {
          const redirected = new URL(location, requestUrl)
          requestOnce(redirected).then(resolve)
          return
        }
        resolve({
          status_code: response.statusCode ?? null,
          url: requestUrl.toString(),
          body_excerpt: body.slice(0, 1000)
        })
      })
    })
    request.once('timeout', () => request.destroy(new Error('devtools_control_timeout')))
    request.once('error', error =>
      resolve({ status_code: null, url: requestUrl.toString(), error: error.message })
    )
  })
  return requestOnce(url)
}

export async function invokeTargetControl({
  action,
  projectPath,
  controlPort,
  wsPort,
  controlRequest = requestDevToolsControl
}) {
  try {
    const result = await controlRequest({ action, projectPath, controlPort, wsPort })
    return {
      action,
      control_host: DEVTOOLS_CONTROL_HOST,
      control_port: Number(controlPort),
      project_path: normalizeRuntimePath(projectPath),
      automator_port: action === 'auto' ? Number(wsPort) : null,
      status_code: result?.status_code ?? null,
      url: result?.url ?? '',
      body_excerpt: String(result?.body_excerpt ?? result?.error ?? '').slice(0, 1000)
    }
  } catch (error) {
    return {
      action,
      control_host: DEVTOOLS_CONTROL_HOST,
      control_port: Number(controlPort),
      project_path: normalizeRuntimePath(projectPath),
      automator_port: action === 'auto' ? Number(wsPort) : null,
      status_code: null,
      url: '',
      body_excerpt: error.message
    }
  }
}

export async function enableAutomatorForVerifiedTargetDevTools({
  projectPath,
  wsPort = 9420,
  runtimeInspector = inspectDevToolsRuntime,
  targetDiscoverer = discoverTargetDevToolsRuntime,
  commandRunner = spawnSync,
  sessionLogReader,
  controlRequest = requestDevToolsControl,
  observationAttempts = 40,
  observationDelayMs = 500,
  waitForObservation = wait
} = {}) {
  const expected = normalizeRuntimePath(projectPath)
  const before = targetDiscoverer({
    expectedProjectPath: expected,
    wsPort,
    commandRunner,
    sessionLogReader
  })
  if (before.status !== 'target_ready') {
    return {
      status: 'failed_environment',
      code: before.code ?? 'project_identity_unverified',
      reason: 'target_devtools_runtime_not_safely_discovered',
      before,
      invocations: []
    }
  }
  const invocation = await invokeTargetControl({
    action: 'auto',
    projectPath: expected,
    controlPort: before.control_port,
    wsPort,
    controlRequest
  })
  if (invocation.status_code !== 200) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_automator_enable_request_failed',
      before,
      invocations: [invocation]
    }
  }
  const observations = []
  for (let attempt = 1; attempt <= observationAttempts; attempt += 1) {
    const after = await runtimeInspector({
      expectedProjectPath: expected,
      wsPort,
      commandRunner,
      sessionLogReader
    })
    observations.push(after)
    if (validVerifiedRuntime(after, expected, wsPort)) {
      return {
        status: 'enabled',
        bootstrap: 'verified_target_ide_auto_endpoint',
        before,
        after,
        invocations: [invocation],
        observation_attempts: observations
      }
    }
    if (attempt < observationAttempts && observationDelayMs > 0) {
      await waitForObservation(observationDelayMs)
    }
  }
  return {
    status: 'failed_environment',
    code: 'devtools_automator_blocker',
    reason: 'automator_port_not_verified_after_target_enable',
    before,
    invocations: [invocation],
    observation_attempts: observations
  }
}
