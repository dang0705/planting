import { spawn, spawnSync } from 'node:child_process'
import {
  createLocalGatewayError,
  LOCAL_RUNTIME_LEASE_ROOT,
  MP_WEIXIN_RUNTIME_TARGET,
  parseLocalApiEnvironmentArgs,
  resolveLocalApiBaseUrl
} from './local-api-env-config.mjs'
import { ensureLocalRuntimeReady, stopLocalGatewayChild } from './local-api-env-gateway.mjs'
import {
  createManagedLocalRuntimeSession,
  isMpWeixinWatchCommand
} from './local-runtime-session.mjs'

const RUNTIME_OWNER_HANDOFF_POLL_MS = 250
const RUNTIME_OWNER_HANDOFF_TIMEOUT_MS = 30_000

function commandEnvironment(apiBaseUrl, options, environment = process.env) {
  const next = {
    ...environment,
    VITE_APP_ENV: 'development',
    VITE_CLOUDBASE_ENV_ID: environment.VITE_CLOUDBASE_ENV_ID || 'cloud1-2grufevs395a9d5e',
    VITE_API_BASE_URL: apiBaseUrl,
    VITE_DEV_OPENID: options.openid,
    CLOUDBASE_LOCAL_FUNCTIONS_PORT: String(options.port),
    CLOUDBASE_LOCAL_FUNCTIONS_FUNCTION_PORT_BASE: String(options.functionPortBase)
  }
  if (options.outputDir) {
    next.UNI_OUTPUT_DIR = options.outputDir
  }
  delete next.CLOUDBASE_LOCAL_SESSION_TOKEN
  return next
}

function defaultProcessCommand(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

function isManagedMpWeixinWatchCommand(command) {
  return (
    command.includes('scripts/dev/run-local-api-env.mjs') &&
    /(?:^|\s)--\s+uni\s+-p\s+mp-weixin(?:\s|$)/u.test(command)
  )
}

function isManagedMpWeixinWatchChild(command) {
  return command.includes('uni') && /(?:^|\s)-p\s+mp-weixin(?:\s|$)/u.test(command)
}

function resolveMiniProgramPlatform(command = []) {
  const values = command.map(value => String(value))
  return ['mp-weixin', 'mp-toutiao', 'mp-xhs'].find(platform => values.includes(platform)) || ''
}

function isolatePlatformSessionToken(options, command) {
  const platform = resolveMiniProgramPlatform(command)
  if (!platform || platform === 'mp-weixin') {
    return options
  }
  // CLOUDBASE_LOCAL_SESSION_TOKEN is a WeChat/local bearer used by the strict
  // business probe. Never let it leak into a Douyin/Xiaohongshu launcher:
  // those platforms must obtain their own runtime session after phone auth.
  return { ...options, sessionToken: '' }
}

function verifyRuntimeOwnerForTakeover(lease, processCommand) {
  const ownerPid = Number(lease?.owner_pid)
  const childPid = Number(lease?.child_pid)
  if (
    !Number.isInteger(ownerPid) ||
    ownerPid <= 0 ||
    !Number.isInteger(childPid) ||
    childPid <= 0
  ) {
    return { status: 'blocked', code: 'local_runtime_owner_metadata_invalid' }
  }
  const ownerCommand = processCommand(ownerPid)
  const childCommand = processCommand(childPid)
  if (!isManagedMpWeixinWatchCommand(ownerCommand) || !isManagedMpWeixinWatchChild(childCommand)) {
    return {
      status: 'blocked',
      code: 'local_runtime_owner_unverified',
      owner_pid: ownerPid,
      child_pid: childPid
    }
  }
  return { status: 'verified', owner_pid: ownerPid, child_pid: childPid }
}

async function waitForRuntimeOwnerHandoff({ managedRuntime, initial, shouldStop }) {
  const deadline = Date.now() + RUNTIME_OWNER_HANDOFF_TIMEOUT_MS
  let started = initial
  while (started.status === 'reused') {
    if (shouldStop()) {
      return { status: 'cancelled', signal: 'SIGINT' }
    }
    started =
      typeof managedRuntime.claim === 'function' ? managedRuntime.claim() : managedRuntime.start()
    if (started.status !== 'reused') {
      return started
    }
    if (Date.now() >= deadline) {
      return {
        status: 'blocked',
        code: 'local_runtime_owner_handoff_timeout',
        reason: 'existing_owner_did_not_release'
      }
    }
    await new Promise(resolve => setTimeout(resolve, RUNTIME_OWNER_HANDOFF_POLL_MS))
    if (shouldStop()) {
      return { status: 'cancelled', signal: 'SIGINT' }
    }
  }
  return started
}

async function takeOverRuntimeOwner({
  managedRuntime,
  initial,
  shouldStop,
  output,
  processCommand,
  signalProcess
}) {
  const owner = verifyRuntimeOwnerForTakeover(initial?.lease, processCommand)
  if (owner.status !== 'verified') {
    return owner
  }
  try {
    signalProcess(owner.owner_pid, 'SIGINT')
  } catch (error) {
    return {
      status: 'blocked',
      code: 'local_runtime_owner_handoff_signal_failed',
      owner_pid: owner.owner_pid,
      reason: String(error?.message || error)
    }
  }
  output.write(`已请求接管现有 mp-weixin watch runtime: ${owner.owner_pid}\n`)
  return waitForRuntimeOwnerHandoff({ managedRuntime, initial, shouldStop })
}

function waitForCommandExit(child, waitForExit) {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (callback, value) => {
      if (settled) {
        return
      }
      settled = true
      callback(value)
    }
    child?.once('error', error => settle(reject, error))
    if (typeof waitForExit === 'function') {
      waitForExit().then(
        exit => settle(resolve, exit),
        error => settle(reject, error)
      )
      return
    }
    child.once('exit', (code, signal) => settle(resolve, { code, signal }))
  })
}

function assertCommandExit(exit) {
  if (exit.code === 0 || exit.signal === 'SIGINT' || exit.signal === 'SIGTERM') {
    return
  }
  throw new Error(`子进程退出码 ${exit.code ?? exit.signal}`)
}

export async function runLocalApiEnvironment({
  argv = process.argv.slice(2),
  environment = process.env,
  signalSource = process,
  output = process.stdout,
  ensureRuntime = ensureLocalRuntimeReady,
  spawnProcess = spawn,
  runtimeSessionFactory = createManagedLocalRuntimeSession,
  runtimeTargetPath = MP_WEIXIN_RUNTIME_TARGET,
  runtimeLeaseRoot = LOCAL_RUNTIME_LEASE_ROOT,
  processCommand = defaultProcessCommand,
  signalProcess = process.kill
} = {}) {
  const parsed = parseLocalApiEnvironmentArgs(argv, environment)
  const { command } = parsed
  const options = isolatePlatformSessionToken(parsed.options, command)
  if (!command.length) {
    throw new Error(
      '缺少待执行命令，示例：node scripts/dev/run-local-api-env.mjs -- uni -p mp-weixin'
    )
  }
  const apiBaseUrl = resolveLocalApiBaseUrl(options, environment)
  const childEnvironment = commandEnvironment(apiBaseUrl, options, environment)
  const managesMpWeixinWatch = isMpWeixinWatchCommand(command)
  const effectiveRuntimeTargetPath = options.outputDir || runtimeTargetPath
  output.write(`VITE_API_BASE_URL=${apiBaseUrl}\n`)
  let gatewayChild = null
  let managedRuntime = null
  let managedRuntimeStop = null
  let reuseKeepAliveTimer = null
  let stopRequested = false
  const stopOwnedResources = () => {
    if (!managedRuntimeStop) {
      managedRuntimeStop = (async () => {
        // The gateway is a dependency of the watcher. Stop a gateway owned by
        // this launcher before releasing the watch lease, so a waiting daily
        // launcher cannot acquire the lease while the old gateway is still in
        // the process of shutting down.
        await stopLocalGatewayChild(gatewayChild)
        if (managedRuntime) {
          await managedRuntime.stop()
        }
      })()
    }
    return managedRuntimeStop
  }
  const stopStartedGateway = () => {
    stopRequested = true
    stopOwnedResources().catch(error => {
      process.stderr.write(`停止本地 runtime 资源失败: ${error.message}\n`)
    })
  }

  signalSource.once('SIGINT', stopStartedGateway)
  signalSource.once('SIGTERM', stopStartedGateway)
  try {
    if (!options.skipHealthCheck) {
      gatewayChild = await ensureRuntime(apiBaseUrl, options)
    }
    let child
    let waitForExit
    if (managesMpWeixinWatch) {
      managedRuntime = runtimeSessionFactory({
        targetPath: effectiveRuntimeTargetPath,
        command,
        environment: childEnvironment,
        mode: options.mode,
        reuseOutput: options.reuseOutput,
        cleanOutput: !options.reuseOutput,
        initialApiBaseUrl: apiBaseUrl,
        leaseRoot: options.runtimeLeaseRoot || runtimeLeaseRoot,
        // Online QA still uses the `lan` runtime mode so the existing
        // supervisor/lease ownership checks remain applicable, but it must
        // never refresh the frontend URL back to a local address when the
        // machine's network changes. The explicit online target is stable
        // and is already carried in `apiBaseUrl`.
        resolveLanApiBaseUrl:
          options.mode === 'lan' && environment.QA_BACKEND_MODE !== 'online'
            ? () => resolveLocalApiBaseUrl(options, environment)
            : undefined,
        spawnProcess
      })
      let started = managedRuntime.start()
      if (started.status === 'reused' && !options.reuseOutput) {
        started = await takeOverRuntimeOwner({
          managedRuntime,
          initial: started,
          shouldStop: () => stopRequested,
          output,
          processCommand,
          signalProcess
        })
        if (started.status === 'cancelled') {
          assertCommandExit({ code: null, signal: started.signal })
          return
        }
        if (started.status === 'acquired') {
          if (!options.skipHealthCheck) {
            gatewayChild = await ensureRuntime(apiBaseUrl, options)
          }
          started = managedRuntime.start()
        }
      }
      if (
        !['started', 'reused'].includes(started.status) ||
        (started.status === 'started' && !started.child && !options.reuseOutput)
      ) {
        throw createLocalGatewayError(
          'LOCAL_RUNTIME_WATCH_LEASE_UNAVAILABLE',
          `未能取得 mp-weixin watch runtime lease: ${started.code || started.reason || started.status}`
        )
      }
      if (started.status === 'reused') {
        // A verified owner already serves the exact target output. Starting a
        // second watcher would be unsafe, but treating this as an error makes
        // a normal QA -> daily handoff look broken. The caller is not the
        // lease owner, so the managed session remains a no-op and its cleanup
        // cannot release or terminate the existing watcher.
        output.write(`复用已有 mp-weixin watch runtime: ${started.lease?.owner_pid || 'unknown'}\n`)
        child = null
        waitForExit = () => Promise.resolve({ code: 0, signal: null, reused: true })
      } else {
        child = started.child
        waitForExit = () => managedRuntime.waitForExit()
        if (options.reuseOutput && !child) {
          // A reuse-only runtime intentionally has no compiler child. Keep
          // this launcher process alive until SIGINT/SIGTERM so its lease is
          // not released immediately just because an unresolved Promise does
          // not keep Node's event loop alive.
          reuseKeepAliveTimer = setInterval(() => {}, 60_000)
        }
      }
    } else {
      child = spawnProcess(command[0], command.slice(1), {
        env: childEnvironment,
        stdio: 'inherit',
        shell: process.platform === 'win32'
      })
    }
    assertCommandExit(await waitForCommandExit(child, waitForExit))
  } finally {
    signalSource.off('SIGINT', stopStartedGateway)
    signalSource.off('SIGTERM', stopStartedGateway)
    if (reuseKeepAliveTimer) {
      clearInterval(reuseKeepAliveTimer)
      reuseKeepAliveTimer = null
    }
    await stopOwnedResources()
  }
}
