import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

import { requestDevToolsControl } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime-control.mjs'
import { writeJson } from './qa-auth-broker-core.mjs'

const DEFAULT_PROJECT = path.join(process.cwd(), 'dist', 'dev', 'mp-weixin')
const DAILY_PROJECT_SUFFIX = '【日常】'
const MANAGED_CONTROL_MARKERS = Object.freeze([
  'Default/.ide',
  'Default/.ide-status',
  'Default/.cli'
])
const DAILY_PROJECT_OPEN_SETTLE_MS = 1_200
const DAILY_AUTOMATOR_READY_TIMEOUT_MS = 15_000
const DAILY_AUTOMATOR_RETRY_DELAY_MS = 1_000

function baseProjectName(value) {
  return String(value || '青花植')
    .replace(/(?:【日常】|【QA】)$/u, '')
    .trim()
}

export function reconcileManagedDailyControlMarkers({
  profile,
  expectedProfile,
  recoveryRoot,
  profileProcesses = () => [],
  listenerPids = () => []
} = {}) {
  const resolvedProfile = path.resolve(profile || '')
  if (!resolvedProfile || resolvedProfile !== path.resolve(expectedProfile || '')) {
    const error = new Error('managed_daily_control_marker_profile_invalid')
    error.code = 'qa_managed_daily_control_marker_profile_invalid'
    throw error
  }
  const activeProcesses = profileProcesses(resolvedProfile)
  if (activeProcesses.length) {
    const error = new Error('managed_daily_control_marker_owner_active')
    error.code = 'qa_managed_daily_control_marker_owner_active'
    error.pids = activeProcesses.map(item => Number(item.pid)).filter(Number.isInteger)
    throw error
  }
  const ports = [9423, 3798, 3799]
  const activeListeners = ports.flatMap(port =>
    listenerPids(port).map(pid => ({ port, pid: Number(pid) }))
  )
  if (activeListeners.length) {
    const error = new Error('managed_daily_control_marker_listener_active')
    error.code = 'qa_managed_daily_control_marker_listener_active'
    error.listeners = activeListeners
    throw error
  }

  const observed = []
  for (const relative of MANAGED_CONTROL_MARKERS) {
    const target = path.join(resolvedProfile, relative)
    if (!fs.existsSync(target)) {
      continue
    }
    const content = fs.readFileSync(target, 'utf8').trim()
    const recognized =
      (relative === 'Default/.ide' && content === '9423') ||
      (relative === 'Default/.ide-status' && content === 'On') ||
      (relative === 'Default/.cli' && ['3798', '3799'].includes(content))
    // New official DevTools releases may write dynamic control ports. Once
    // the owner process and listeners are both absent, every marker at these
    // fixed paths is stale; preserve it in recovery instead of rejecting a
    // valid profile solely because its port is no longer one of ours.
    observed.push({ relative, content, recognized })
  }
  if (!observed.length) {
    return { status: 'clean', recovered: [] }
  }

  const recoveryPath = path.join(
    path.resolve(recoveryRoot || path.join(resolvedProfile, '.qa-recovery')),
    `daily-control-markers-${Date.now()}-${process.pid}`
  )
  fs.mkdirSync(recoveryPath, { recursive: true, mode: 0o700 })
  for (const item of observed) {
    const source = path.join(resolvedProfile, item.relative)
    const destination = path.join(recoveryPath, item.relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
    fs.renameSync(source, destination)
  }
  writeJson(path.join(recoveryPath, 'recovery.json'), {
    schema_version: 1,
    profile: resolvedProfile,
    reason: 'stale_control_markers_without_owner_or_listener',
    recovered: observed,
    recovered_at: new Date().toISOString()
  })
  return { status: 'recovered', recovery_path: recoveryPath, recovered: observed }
}

export function resolveManagedDailyProject(args = {}) {
  const requested =
    args.project || args['project-path'] || process.env.MP_PROJECT_PATH || DEFAULT_PROJECT
  const projectPath = path.resolve(requested)
  if (
    !fs.existsSync(path.join(projectPath, 'app.json')) ||
    !fs.existsSync(path.join(projectPath, 'project.config.json'))
  ) {
    const error = new Error(`managed_daily_project_invalid: ${projectPath}`)
    error.code = 'qa_managed_daily_project_invalid'
    error.project_path = projectPath
    throw error
  }
  return projectPath
}

/**
 * Uni writes the generated project.config.json from src/manifest.json and
 * does not consume project.private.config.json for this display field. Patch
 * only generated DevTools metadata immediately before opening the managed
 * daily project; source manifest, app metadata and runtime code stay intact.
 */
export function ensureManagedDailyProjectDisplayName(projectPath) {
  const resolvedProjectPath = path.resolve(projectPath)
  const configPath = path.join(resolvedProjectPath, 'project.config.json')
  let config
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (error) {
    const blocked = new Error(`managed_daily_project_config_invalid: ${configPath}`)
    blocked.code = 'qa_managed_daily_project_config_invalid'
    blocked.project_path = resolvedProjectPath
    blocked.cause = error.message
    throw blocked
  }
  const projectname = `${baseProjectName(config.projectname)}${DAILY_PROJECT_SUFFIX}`
  if (config.projectname !== projectname) {
    writeJson(configPath, { ...config, projectname })
    return { changed: true, projectname, config_path: configPath }
  }
  return { changed: false, projectname, config_path: configPath }
}

async function waitForTcpListener(port, timeoutMs = DAILY_AUTOMATOR_READY_TIMEOUT_MS) {
  const deadline = Date.now() + Number(timeoutMs)
  while (Date.now() < deadline) {
    const connected = await new Promise(resolve => {
      const socket = net.createConnection({ host: '127.0.0.1', port: Number(port) })
      let settled = false
      const finish = value => {
        if (settled) {
          return
        }
        settled = true
        socket.destroy()
        resolve(value)
      }
      socket.once('connect', () => finish(true))
      socket.once('error', () => finish(false))
      socket.setTimeout(500, () => finish(false))
    })
    if (connected) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return false
}

export async function openManagedDailyProject({
  projectPath,
  controlPort,
  servicePort,
  runtimeKind = 'legacy_native',
  controlRequest = requestDevToolsControl
}) {
  const controlProtocol = runtimeKind === 'official_electron' ? 'v2' : 'legacy'
  const openResult = await controlRequest({
    action: 'open',
    projectPath,
    controlPort
  })
  if (
    !Number(openResult?.status_code) ||
    Number(openResult.status_code) < 200 ||
    Number(openResult.status_code) >= 300
  ) {
    const error = new Error('managed_daily_project_open_failed')
    error.code = 'qa_managed_daily_project_open_failed'
    error.project_path = projectPath
    error.control_port = Number(controlPort)
    error.control_result = openResult
    throw error
  }
  // DevTools answers /open before the project renderer has attached. Calling
  // /auto in the same turn can return 200 while never creating the service
  // listener. Keep this wait bounded, then verify the actual listener instead
  // of treating the control HTTP response as readiness.
  await new Promise(resolve => setTimeout(resolve, DAILY_PROJECT_OPEN_SETTLE_MS))
  const autoResult = await controlRequest({
    action: 'auto',
    projectPath,
    controlPort,
    wsPort: servicePort,
    protocol: controlProtocol
  })
  const autoAccepted =
    Number(autoResult?.status_code) >= 200 && Number(autoResult.status_code) < 300
  let serviceReady = autoAccepted ? await waitForTcpListener(servicePort) : false
  let autoRetryResult = null
  if (!serviceReady) {
    await new Promise(resolve => setTimeout(resolve, DAILY_AUTOMATOR_RETRY_DELAY_MS))
    autoRetryResult = await controlRequest({
      action: 'auto',
      projectPath,
      controlPort,
      wsPort: servicePort,
      protocol: controlProtocol
    })
    const retryAccepted =
      Number(autoRetryResult?.status_code) >= 200 && Number(autoRetryResult.status_code) < 300
    serviceReady = retryAccepted ? await waitForTcpListener(servicePort) : false
  }
  if (!serviceReady) {
    const error = new Error('managed_daily_automator_enable_failed')
    error.code = 'qa_managed_daily_automator_enable_failed'
    error.project_path = projectPath
    error.control_port = Number(controlPort)
    error.service_port = Number(servicePort)
    error.control_result = autoResult
    error.retry_control_result = autoRetryResult
    error.service_listener_ready = false
    throw error
  }
  return {
    open: openResult,
    auto: autoResult,
    auto_retry: autoRetryResult,
    service_listener_ready: true
  }
}

export function writeManagedDailyCapability({
  capabilityPath,
  pid,
  profile,
  capability,
  process_start_identity,
  project_path,
  bundle_root
}) {
  writeJson(capabilityPath, {
    schema_version: 1,
    capability,
    pid,
    process_start_identity,
    profile: path.resolve(profile),
    project_path: project_path ? path.resolve(project_path) : null,
    bundle_root: path.resolve(bundle_root),
    issued_at: new Date().toISOString()
  })
  return capability
}
