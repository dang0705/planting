import { execFile, spawn } from 'node:child_process'
import {
  createLocalGatewayError,
  GATEWAY_READY_TIMEOUT_MS,
  GATEWAY_RECOVERY_TIMEOUT_MS,
  LOCAL_FUNCTIONS_GATEWAY_SCRIPT,
  PROJECT_ROOT
} from './local-api-env-config.mjs'
import {
  assertLocalRuntimeReady,
  fetchGatewayHealth,
  gatewayStateLooksStale,
  hasRuntimeLivenessMetadata,
  isRepoLocalGateway,
  routeFailureLooksStale,
  sleep
} from './local-api-env-gateway-health.mjs'

const LSOF_NO_MATCH_CODE = 1
const LSOF_RECORD_PREFIX_LENGTH = 1
const GATEWAY_RECOVERY_POLL_MS = 250
const GATEWAY_READY_POLL_MS = 1000
const NO_PROCESS_ID = 0
const GATEWAY_STOP_TIMEOUT_MS = 2000

function execFileAsync(file, args = []) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

async function resolveGatewayListenerPid(port) {
  try {
    const { stdout } = await execFileAsync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'])
    return (
      String(stdout || '')
        .split(/\r?\n/)
        .map(item => item.trim())
        .find(Boolean) || ''
    )
  } catch (error) {
    if (error?.code === LSOF_NO_MATCH_CODE || error?.code === 'ENOENT') {
      return ''
    }
    throw error
  }
}

async function resolveRepoLocalGatewayListenerPid(port) {
  const listenerPid = await resolveGatewayListenerPid(port)
  if (!listenerPid) {
    return ''
  }

  try {
    const { stdout } = await execFileAsync('lsof', [
      '-Fn',
      '-a',
      '-p',
      listenerPid,
      '-d',
      'cwd'
    ])
    const cwd = String(stdout || '')
      .split(/\r?\n/)
      .map(item => item.trim())
      .find(item => item.startsWith('n'))
      ?.slice(LSOF_RECORD_PREFIX_LENGTH)
    return cwd === PROJECT_ROOT ? listenerPid : ''
  } catch (error) {
    if (error?.code === LSOF_NO_MATCH_CODE || error?.code === 'ENOENT') {
      return ''
    }
    throw error
  }
}

async function waitForGatewayListenerExit(port, expectedPid = '') {
  const startedAt = Date.now()
  while (Date.now() - startedAt < GATEWAY_RECOVERY_TIMEOUT_MS) {
    const listeningPid = await resolveGatewayListenerPid(port)
    if (!listeningPid || (expectedPid && listeningPid !== String(expectedPid))) {
      return
    }
    await sleep(GATEWAY_RECOVERY_POLL_MS)
  }
  throw createLocalGatewayError(
    'LOCAL_GATEWAY_STALE_RECOVERY_FAILED',
    `检测到 stale gateway，但在 ${GATEWAY_RECOVERY_TIMEOUT_MS}ms 内未能释放端口 ${port}。`
  )
}

function spawnLocalFunctionsGateway(options = {}) {
  const gatewayArgs = [
    LOCAL_FUNCTIONS_GATEWAY_SCRIPT,
    `--port=${options.port}`,
    `--host=${process.env.CLOUDBASE_LOCAL_FUNCTIONS_HOST || '0.0.0.0'}`
  ]
  const env = {
    ...process.env,
    LOCAL_FUNCTIONS: options.requiredFunctions.length
      ? options.requiredFunctions.join(',')
      : process.env.LOCAL_FUNCTIONS || ''
  }
  return spawn(process.execPath, gatewayArgs, { env, stdio: 'inherit' })
}

async function restartRepoLocalGateway(apiBaseUrl = '', options = {}, gatewayPid) {
  process.stdout.write(
    `检测到 stale 本地 CloudBase gateway，正在重启 ${options.port} 端口监听进程 pid=${gatewayPid}...\n`
  )
  try {
    process.kill(gatewayPid, 'SIGINT')
  } catch (error) {
    throw createLocalGatewayError(
      'LOCAL_GATEWAY_STALE_RECOVERY_PERMISSION_DENIED',
      `已确认 ${options.port} 端口由本项目 stale gateway pid=${gatewayPid} 占用，` +
        `但当前终端没有权限停止它: ${error?.message || error}\n` +
        '请在启动该 gateway 的原终端按 Ctrl-C 后重新运行本命令。'
    )
  }
  await waitForGatewayListenerExit(options.port, gatewayPid)
  const gatewayChild = spawnLocalFunctionsGateway(options)
  await waitForLocalRuntime(apiBaseUrl, options, gatewayChild)
  process.stdout.write('本地 CloudBase 函数 gateway 已自动恢复。\n')
  return gatewayChild
}

async function waitForLocalRuntime(apiBaseUrl = '', options = {}, gatewayChild = null) {
  const startedAt = Date.now()
  let lastError = null
  let gatewayExit = null
  gatewayChild?.once('exit', code => {
    gatewayExit = code
  })
  while (Date.now() - startedAt < GATEWAY_READY_TIMEOUT_MS) {
    if (gatewayExit !== null) {
      throw createLocalGatewayError(
        'LOCAL_GATEWAY_EXITED',
        `本地 CloudBase 函数 gateway 启动后退出，退出码: ${gatewayExit}`
      )
    }
    try {
      await assertLocalRuntimeReady(apiBaseUrl, options)
      return
    } catch (error) {
      lastError = error
      await sleep(GATEWAY_READY_POLL_MS)
    }
  }
  throw createLocalGatewayError(
    'LOCAL_GATEWAY_READY_TIMEOUT',
    `等待本地 CloudBase 函数 gateway 就绪超时: ${apiBaseUrl}\n` +
      `${lastError ? String(lastError.stack || lastError.message || lastError) : ''}`
  )
}

async function recoverStaleGateway(apiBaseUrl = '', options = {}, error = null) {
  let snapshot
  try {
    snapshot = await fetchGatewayHealth(apiBaseUrl)
  } catch {
    return null
  }
  if (!isRepoLocalGateway(snapshot.state, options.requiredFunctions)) {
    return null
  }
  const staleByHealth = gatewayStateLooksStale(snapshot.state, options.requiredFunctions)
  const staleByRoutes =
    routeFailureLooksStale(error?.details) && !hasRuntimeLivenessMetadata(snapshot.state)
  if (!staleByHealth && !staleByRoutes) {
    return null
  }
  const gatewayPid =
    snapshot.state.pid ||
    Number((await resolveRepoLocalGatewayListenerPid(options.port)) || NO_PROCESS_ID)
  if (!gatewayPid) {
    throw createLocalGatewayError(
      'LOCAL_GATEWAY_STALE_RECOVERY_FAILED',
      `检测到 stale gateway，但无法定位端口 ${options.port} 的监听进程。`
    )
  }
  return restartRepoLocalGateway(apiBaseUrl, options, gatewayPid)
}

async function recoverUnresponsiveStaleGateway(apiBaseUrl = '', options = {}) {
  const listenerPid = await resolveGatewayListenerPid(options.port)
  if (!listenerPid) {
    return null
  }

  const repoListenerPid = await resolveRepoLocalGatewayListenerPid(options.port)
  if (!repoListenerPid) {
    throw createLocalGatewayError(
      'LOCAL_GATEWAY_PORT_OCCUPIED_UNVERIFIED',
      `本地 CloudBase gateway 健康检查不可达，但端口 ${options.port} 已被 pid=${listenerPid} 占用，` +
        '且无法证明它属于当前项目；为避免误杀其他服务，已停止自动重启。'
    )
  }

  return restartRepoLocalGateway(apiBaseUrl, options, repoListenerPid)
}

export async function ensureLocalRuntimeReady(apiBaseUrl = '', options = {}) {
  let gatewayError = null
  try {
    await assertLocalRuntimeReady(apiBaseUrl, options)
    return null
  } catch (error) {
    gatewayError = error
    if (!options.startFunctions) {
      throw error
    }
    if (error?.code === 'LOCAL_FUNCTION_ROUTES_NOT_READY') {
      const recoveredGateway = await recoverStaleGateway(apiBaseUrl, options, error)
      if (recoveredGateway) {
        return recoveredGateway
      }
      process.stdout.write(
        '本地 CloudBase 函数 gateway 已运行，正在等待函数 health route 就绪...\n'
      )
      await waitForLocalRuntime(apiBaseUrl, options)
      process.stdout.write('本地 CloudBase 函数 gateway 已就绪。\n')
      return null
    }
    if (error?.code === 'LOCAL_GATEWAY_BAD_RESPONSE') {
      const recoveredGateway = await recoverStaleGateway(apiBaseUrl, options, error)
      if (recoveredGateway) {
        return recoveredGateway
      }
      throw error
    }
    if (!['LOCAL_GATEWAY_NOT_RUNNING', 'LOCAL_GATEWAY_TIMEOUT'].includes(error?.code)) {
      throw error
    }
  }
  if (['LOCAL_GATEWAY_NOT_RUNNING', 'LOCAL_GATEWAY_TIMEOUT'].includes(gatewayError?.code)) {
    const recoveredGateway = await recoverUnresponsiveStaleGateway(apiBaseUrl, options)
    if (recoveredGateway) {
      return recoveredGateway
    }
  }
  process.stdout.write('本地 CloudBase 函数 gateway 未运行，正在自动启动...\n')
  const gatewayChild = spawnLocalFunctionsGateway(options)
  await waitForLocalRuntime(apiBaseUrl, options, gatewayChild)
  process.stdout.write('本地 CloudBase 函数 gateway 已就绪。\n')
  return gatewayChild
}

export async function stopLocalGatewayChild(child) {
  if (!child || child.exitCode !== null || child.signalCode) {
    return
  }
  child.kill('SIGINT')
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, GATEWAY_STOP_TIMEOUT_MS)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}
