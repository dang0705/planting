import { spawn } from 'node:child_process'
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

function commandEnvironment(apiBaseUrl, options, environment = process.env) {
  return {
    ...environment,
    VITE_APP_ENV: 'development',
    VITE_CLOUDBASE_ENV_ID: environment.VITE_CLOUDBASE_ENV_ID || 'cloud1-2grufevs395a9d5e',
    VITE_API_BASE_URL: apiBaseUrl,
    VITE_DEV_OPENID: options.openid
  }
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
    child.once('error', error => settle(reject, error))
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
  runtimeLeaseRoot = LOCAL_RUNTIME_LEASE_ROOT
} = {}) {
  const { options, command } = parseLocalApiEnvironmentArgs(argv, environment)
  if (!command.length) {
    throw new Error(
      '缺少待执行命令，示例：node scripts/dev/run-local-api-env.mjs -- uni -p mp-weixin'
    )
  }
  const apiBaseUrl = resolveLocalApiBaseUrl(options, environment)
  const childEnvironment = commandEnvironment(apiBaseUrl, options, environment)
  const managesMpWeixinWatch = isMpWeixinWatchCommand(command)
  output.write(`VITE_API_BASE_URL=${apiBaseUrl}\n`)
  let gatewayChild = null
  let managedRuntime = null
  let managedRuntimeStop = null
  const stopOwnedResources = () => {
    if (!managedRuntimeStop) {
      managedRuntimeStop = (async () => {
        if (managedRuntime) {
          await managedRuntime.stop()
        }
        await stopLocalGatewayChild(gatewayChild)
      })()
    }
    return managedRuntimeStop
  }
  const stopStartedGateway = () => {
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
        targetPath: runtimeTargetPath,
        leaseRoot: runtimeLeaseRoot,
        command,
        environment: childEnvironment,
        mode: options.mode,
        initialApiBaseUrl: apiBaseUrl,
        resolveLanApiBaseUrl:
          options.mode === 'lan' ? () => resolveLocalApiBaseUrl(options, environment) : undefined,
        spawnProcess
      })
      const started = managedRuntime.start()
      if (started.status !== 'started' || !started.child) {
        throw createLocalGatewayError(
          'LOCAL_RUNTIME_WATCH_LEASE_UNAVAILABLE',
          `未能取得 mp-weixin watch runtime lease: ${started.code || started.reason || started.status}`
        )
      }
      child = started.child
      waitForExit = () => managedRuntime.waitForExit()
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
    await stopOwnedResources()
  }
}
