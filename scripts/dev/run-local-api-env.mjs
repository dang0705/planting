#!/usr/bin/env node

import { spawn } from 'node:child_process'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const DEFAULT_PORT = 3010
const DEFAULT_OPENID = 'dev_terminal_mp_local'
const LOCAL_FUNCTIONS_GATEWAY_SCRIPT = fileURLToPath(new URL('./local-functions-gateway.mjs', import.meta.url))
const DEFAULT_REQUIRED_FUNCTIONS = [
  'diagnose-http',
  'plant-catalog-http',
  'plant-user-http',
  'identify-http',
  'diagnosis-history-http',
  'auth-user-http',
  'weather-http',
  'storage-http'
]
const FUNCTION_HEALTH_PATHS = {
  'diagnose-http': 'diagnose-http/health',
  'plant-catalog-http': 'plant-catalog-http/catalog/health',
  'plant-user-http': 'plant-user-http/user-plants/health',
  'identify-http': 'identify-http/identify/health',
  'diagnosis-history-http': 'diagnosis-history-http/diagnosis/history/health',
  'auth-user-http': 'auth-user-http/auth/user/health',
  'weather-http': 'weather-http/weather/health',
  'storage-http': 'storage-http/storage/health'
}
const GATEWAY_READY_TIMEOUT_MS = 60000
const HEALTH_REQUEST_TIMEOUT_MS = 3000

function getFirstLanAddress() {
  return Object.values(os.networkInterfaces())
    .flat()
    .find(item => item && item.family === 'IPv4' && !item.internal)?.address || ''
}

function parseArgs(argv = []) {
  const separatorIndex = argv.indexOf('--')
  const optionArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv
  const command = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : []
  const options = {
    mode: 'loopback',
    port: Number(process.env.CLOUDBASE_LOCAL_FUNCTIONS_PORT || DEFAULT_PORT),
    baseUrl: process.env.VITE_API_BASE_URL || '',
    openid: process.env.VITE_DEV_OPENID || DEFAULT_OPENID,
    requiredFunctions: String(
      process.env.CLOUDBASE_LOCAL_REQUIRED_FUNCTIONS || DEFAULT_REQUIRED_FUNCTIONS.join(',')
    )
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
    startFunctions: process.env.CLOUDBASE_LOCAL_AUTO_START_FUNCTIONS !== 'false',
    skipHealthCheck: false
  }

  optionArgs.forEach(arg => {
    const [key, ...rest] = String(arg || '').split('=')
    const value = rest.join('=').trim()
    if (key === '--mode' && value) {
      options.mode = value
    }
    if (key === '--port' && value) {
      options.port = Number(value)
    }
    if (key === '--base-url' && value) {
      options.baseUrl = value
    }
    if (key === '--openid' && value) {
      options.openid = value
    }
    if (key === '--required-functions') {
      options.requiredFunctions = value
        ? value.split(',').map(item => item.trim()).filter(Boolean)
        : []
    }
    if (key === '--start-functions') {
      options.startFunctions = true
    }
    if (key === '--no-start-functions') {
      options.startFunctions = false
    }
    if (key === '--skip-health-check') {
      options.skipHealthCheck = true
    }
  })

  return { options, command }
}

function resolveApiBaseUrl(options = {}) {
  if (options.baseUrl) {
    return String(options.baseUrl).replace(/\/+$/, '')
  }

  if (options.mode === 'lan') {
    const host = process.env.CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP || getFirstLanAddress()
    if (!host) {
      throw new Error('未找到可用局域网 IP，请设置 CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP')
    }
    return `http://${host}:${options.port}`
  }

  return `http://127.0.0.1:${options.port}`
}

function createLocalGatewayError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs || HEALTH_REQUEST_TIMEOUT_MS
  )

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    })
    const bodyText = await response.text()
    let body = null
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = null
    }

    return { response, body, bodyText }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createLocalGatewayError(
        'LOCAL_GATEWAY_TIMEOUT',
        `本地 CloudBase 函数 gateway 健康检查超时: ${url}\n` +
          '请检查端口是否被其他服务占用，或稍后重试。'
      )
    }
    if (error?.code) {
      throw error
    }
    throw createLocalGatewayError(
      'LOCAL_GATEWAY_NOT_RUNNING',
      `本地 CloudBase 函数 gateway 未启动: ${url}\n` +
        '将尝试自动启动本地函数 gateway。'
    )
  } finally {
    clearTimeout(timeout)
  }
}

async function assertLocalFunctionsGatewayReady(apiBaseUrl = '', requiredFunctions = []) {
  const healthUrl = `${String(apiBaseUrl || '').replace(/\/+$/, '')}/__local_functions__/health`

  const { response, body } = await fetchJsonWithTimeout(healthUrl)

  if (!response.ok || body?.data?.status !== 'ok') {
    const poweredBy = response.headers.get('x-powered-by') || response.headers.get('server') || ''
    throw createLocalGatewayError(
      'LOCAL_GATEWAY_BAD_RESPONSE',
      `本地 CloudBase 函数 gateway 未就绪: ${response.status} ${response.statusText}\n` +
        `检查地址: ${healthUrl}\n` +
        `${poweredBy ? `当前端口响应服务: ${poweredBy}\n` : ''}` +
        '请确认该端口没有被其他项目占用。'
    )
  }

  const availableFunctions = Array.isArray(body?.data?.functions)
    ? body.data.functions
      .map(item => typeof item === 'string' ? item : item?.name)
      .map(item => String(item || '').trim())
      .filter(Boolean)
    : []
  const availableSet = new Set(availableFunctions)
  const missingFunctions = requiredFunctions.filter(name => !availableSet.has(name))
  if (missingFunctions.length) {
    throw createLocalGatewayError(
      'LOCAL_GATEWAY_MISSING_FUNCTIONS',
      '本地 CloudBase 函数 gateway 未启动完整函数集。\n' +
        `检查地址: ${healthUrl}\n` +
        `缺少函数: ${missingFunctions.join(', ')}\n` +
        `当前函数: ${availableFunctions.length ? availableFunctions.join(', ') : '无'}\n` +
        '微信小程序本地模式请运行 `npm run dev:functions`，不要只运行 `npm run dev:functions:diagnose`。' +
        '如只验证少量函数，可显式传入 `--required-functions=diagnose-http`。'
    )
  }
}

async function assertLocalFunctionRoutesReady(apiBaseUrl = '', requiredFunctions = []) {
  const baseUrl = String(apiBaseUrl || '').replace(/\/+$/, '')
  const unavailable = []

  for (const functionName of requiredFunctions) {
    const healthPath = FUNCTION_HEALTH_PATHS[functionName]
    if (!healthPath) {
      continue
    }
    const url = `${baseUrl}/${healthPath}`
    try {
      const { response, body } = await fetchJsonWithTimeout(url)
      if (!response.ok || body?.code !== 200) {
        unavailable.push(`${functionName}: ${response.status}`)
      }
    } catch (error) {
      unavailable.push(`${functionName}: ${error?.message || error}`)
    }
  }

  if (unavailable.length) {
    throw createLocalGatewayError(
      'LOCAL_FUNCTION_ROUTES_NOT_READY',
      '本地 CloudBase 函数 health route 尚未全部就绪。\n' +
        unavailable.map(item => `- ${item}`).join('\n')
    )
  }
}

async function assertLocalRuntimeReady(apiBaseUrl = '', requiredFunctions = []) {
  await assertLocalFunctionsGatewayReady(apiBaseUrl, requiredFunctions)
  await assertLocalFunctionRoutesReady(apiBaseUrl, requiredFunctions)
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

  return spawn(process.execPath, gatewayArgs, {
    env,
    stdio: 'inherit'
  })
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
      await assertLocalRuntimeReady(apiBaseUrl, options.requiredFunctions)
      return
    } catch (error) {
      lastError = error
      await sleep(1000)
    }
  }

  throw createLocalGatewayError(
    'LOCAL_GATEWAY_READY_TIMEOUT',
    `等待本地 CloudBase 函数 gateway 就绪超时: ${apiBaseUrl}\n` +
      `${lastError ? String(lastError.stack || lastError.message || lastError) : ''}`
  )
}

async function ensureLocalRuntimeReady(apiBaseUrl = '', options = {}) {
  try {
    await assertLocalRuntimeReady(apiBaseUrl, options.requiredFunctions)
    return null
  } catch (error) {
    if (!options.startFunctions) {
      throw error
    }

    if (error?.code === 'LOCAL_FUNCTION_ROUTES_NOT_READY') {
      process.stdout.write('本地 CloudBase 函数 gateway 已运行，正在等待函数 health route 就绪...\n')
      await waitForLocalRuntime(apiBaseUrl, options)
      process.stdout.write('本地 CloudBase 函数 gateway 已就绪。\n')
      return null
    }

    if (!['LOCAL_GATEWAY_NOT_RUNNING', 'LOCAL_GATEWAY_TIMEOUT'].includes(error?.code)) {
      throw error
    }
  }

  process.stdout.write('本地 CloudBase 函数 gateway 未运行，正在自动启动...\n')
  const gatewayChild = spawnLocalFunctionsGateway(options)
  await waitForLocalRuntime(apiBaseUrl, options, gatewayChild)
  process.stdout.write('本地 CloudBase 函数 gateway 已就绪。\n')
  return gatewayChild
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode) {
    return
  }
  child.kill('SIGINT')
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 2000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

async function main() {
  const { options, command } = parseArgs(process.argv.slice(2))
  if (!command.length) {
    throw new Error('缺少待执行命令，示例：node scripts/dev/run-local-api-env.mjs -- uni -p mp-weixin')
  }

  const apiBaseUrl = resolveApiBaseUrl(options)
  process.stdout.write(`VITE_API_BASE_URL=${apiBaseUrl}\n`)
  let gatewayChild = null
  if (!options.skipHealthCheck) {
    gatewayChild = await ensureLocalRuntimeReady(apiBaseUrl, options)
  }

  const child = spawn(command[0], command.slice(1), {
    env: {
      ...process.env,
      VITE_APP_ENV: 'development',
      VITE_CLOUDBASE_ENV_ID: process.env.VITE_CLOUDBASE_ENV_ID || 'cloud1-2grufevs395a9d5e',
      VITE_API_BASE_URL: apiBaseUrl,
      VITE_DEV_OPENID: options.openid
    },
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  const stopStartedGateway = () => {
    if (gatewayChild) {
      gatewayChild.kill('SIGINT')
    }
  }
  process.once('SIGINT', stopStartedGateway)
  process.once('SIGTERM', stopStartedGateway)

  try {
    await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', (code, signal) => {
        if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') {
          resolve()
          return
        }
        reject(new Error(`子进程退出码 ${code ?? signal}`))
      })
    })
  } finally {
    process.off('SIGINT', stopStartedGateway)
    process.off('SIGTERM', stopStartedGateway)
    await stopChild(gatewayChild)
  }
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
