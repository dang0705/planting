#!/usr/bin/env node

import { spawn } from 'node:child_process'
import os from 'node:os'

const DEFAULT_PORT = 3010
const DEFAULT_OPENID = 'dev_terminal_mp_local'

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

async function assertLocalFunctionsGatewayReady(apiBaseUrl = '') {
  const healthUrl = `${String(apiBaseUrl || '').replace(/\/+$/, '')}/__local_functions__/health`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const response = await fetch(healthUrl, { signal: controller.signal })
    const bodyText = await response.text()
    let body = null
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = null
    }

    if (!response.ok || body?.data?.status !== 'ok') {
      const poweredBy = response.headers.get('x-powered-by') || response.headers.get('server') || ''
      throw new Error(
        `本地 CloudBase 函数 gateway 未就绪: ${response.status} ${response.statusText}\n` +
        `检查地址: ${healthUrl}\n` +
        `${poweredBy ? `当前端口响应服务: ${poweredBy}\n` : ''}` +
        '请先运行 `npm run dev:functions`，或让 `CLOUDBASE_LOCAL_FUNCTIONS_PORT` 与函数 gateway 端口保持一致。'
      )
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        `本地 CloudBase 函数 gateway 健康检查超时: ${healthUrl}\n` +
        '请先运行 `npm run dev:functions`，或检查端口是否被其他服务占用。'
      )
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const { options, command } = parseArgs(process.argv.slice(2))
  if (!command.length) {
    throw new Error('缺少待执行命令，示例：node scripts/dev/run-local-api-env.mjs -- uni -p mp-weixin')
  }

  const apiBaseUrl = resolveApiBaseUrl(options)
  process.stdout.write(`VITE_API_BASE_URL=${apiBaseUrl}\n`)
  if (!options.skipHealthCheck) {
    await assertLocalFunctionsGatewayReady(apiBaseUrl)
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

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`子进程退出码 ${code}`))
    })
  })
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
