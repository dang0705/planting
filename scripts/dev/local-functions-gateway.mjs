#!/usr/bin/env node

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const DEFAULT_GATEWAY_PORT = 3010
const DEFAULT_CLOUDBASE_ENV_ID = 'cloud1-2grufevs395a9d5e'
const DEFAULT_SQL_DATABASE = 'cloud1_dev'

const HTTP_FUNCTIONS = [
  { name: 'diagnose-http', port: 9000 },
  { name: 'plant-catalog-http', port: 9001 },
  { name: 'plant-user-http', port: 9002 },
  { name: 'identify-http', port: 9003 },
  { name: 'diagnosis-history-http', port: 9004 },
  { name: 'auth-user-http', port: 9005 },
  { name: 'weather-http', port: 9006 },
  { name: 'storage-http', port: 9007 }
]

function parseArgs(argv = []) {
  const args = {
    port: Number(process.env.CLOUDBASE_LOCAL_FUNCTIONS_PORT || DEFAULT_GATEWAY_PORT),
    host: process.env.CLOUDBASE_LOCAL_FUNCTIONS_HOST || '0.0.0.0',
    functions: String(process.env.LOCAL_FUNCTIONS || '').trim()
  }

  argv.forEach(arg => {
    const [key, ...rest] = String(arg || '').split('=')
    const value = rest.join('=').trim()
    if (key === '--port' && value) {
      args.port = Number(value)
    }
    if (key === '--host' && value) {
      args.host = value
    }
    if ((key === '--function' || key === '--functions') && value) {
      args.functions = value
    }
  })

  return args
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function parseEnvValue(value = '') {
  const trimmed = String(value || '').trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        return env
      }

      const separator = trimmed.indexOf('=')
      if (separator <= 0) {
        return env
      }

      const key = trimmed.slice(0, separator).trim()
      if (!key) {
        return env
      }

      env[key] = parseEnvValue(trimmed.slice(separator + 1))
      return env
    }, {})
}

function readFunctionEnv(functionName) {
  const config = readJson(path.join(projectRoot, 'cloudbaserc.json'))
  const matched = (Array.isArray(config.functions) ? config.functions : [])
    .find(item => String(item?.name || '').trim() === functionName)
  const envVariables = matched?.envVariables && typeof matched.envVariables === 'object'
    ? matched.envVariables
    : {}
  const envId =
    envVariables.CLOUDBASE_ENV_ID ||
    envVariables.TCB_ENV ||
    config.envId ||
    DEFAULT_CLOUDBASE_ENV_ID

  return {
    ...envVariables,
    CLOUDBASE_ENV_ID: envVariables.CLOUDBASE_ENV_ID || envId,
    TCB_ENV: envVariables.TCB_ENV || envId
  }
}

function buildRuntimeEnv() {
  return {
    APP_ENV: 'development',
    RUNTIME_ENV: 'development',
    SCHEMA_ENV: 'development',
    X_ENV: 'development',
    SQL_DATABASE: DEFAULT_SQL_DATABASE,
    SQL_DATABASE_DEV: DEFAULT_SQL_DATABASE,
    CLOUDBASE_SQL_DATABASE: DEFAULT_SQL_DATABASE,
    CLOUDBASE_SQL_DATABASE_DEV: DEFAULT_SQL_DATABASE,
    DEBUG_LOG: process.env.DEBUG_LOG || 'false'
  }
}

function resolveTcbFfBin(functionDir) {
  return path.join(
    functionDir,
    'node_modules',
    '@cloudbase',
    'functions-framework',
    'bin',
    'tcb-ff.js'
  )
}

function getSelectedFunctions(selection = '') {
  const selectedNames = String(selection || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  if (!selectedNames.length) {
    return HTTP_FUNCTIONS
  }

  const known = new Map(HTTP_FUNCTIONS.map(item => [item.name, item]))
  return selectedNames.map(name => {
    const matched = known.get(name)
    if (!matched) {
      throw new Error(`未知本地云函数: ${name}`)
    }
    return matched
  })
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && item.family === 'IPv4' && !item.internal)
    .map(item => item.address)
}

function ensureTcbFfInstalled(functions) {
  const missing = functions
    .map(item => ({
      ...item,
      dir: path.join(projectRoot, 'cloudfunctions', item.name),
      tcbFfBin: resolveTcbFfBin(path.join(projectRoot, 'cloudfunctions', item.name))
    }))
    .filter(item => !fs.existsSync(item.tcbFfBin))

  if (!missing.length) {
    return
  }

  const names = missing.map(item => item.name).join(', ')
  throw new Error(
    `缺少本地 tcb-ff 依赖: ${names}\n` +
    '请先运行: npm run dev:functions:install\n' +
    '如只调试单个函数，可运行: npm run dev:functions:install -- --function=diagnose-http'
  )
}

function spawnFunctionRuntime(definition, localEnv) {
  const functionDir = path.join(projectRoot, 'cloudfunctions', definition.name)
  const tcbFfBin = resolveTcbFfBin(functionDir)
  const optAlias = path.join(projectRoot, 'scripts', 'dev', 'cloudfunctions-local-opt-alias.cjs')
  const nodeOptions = [`--require=${optAlias}`, process.env.NODE_OPTIONS || '']
    .filter(Boolean)
    .join(' ')
  const env = {
    ...readFunctionEnv(definition.name),
    ...localEnv,
    ...process.env,
    ...buildRuntimeEnv(),
    PORT: String(definition.port),
    NODE_OPTIONS: nodeOptions
  }

  const child = spawn(
    process.execPath,
    [
      tcbFfBin,
      '-w',
      '--enableCors=true',
      `--port=${definition.port}`,
      '--functionsConfigFile=cloudbase-functions.json'
    ],
    {
      cwd: functionDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )

  child.stdout.on('data', chunk => {
    process.stdout.write(`[${definition.name}] ${chunk}`)
  })
  child.stderr.on('data', chunk => {
    process.stderr.write(`[${definition.name}] ${chunk}`)
  })

  return child
}

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function addCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
}

function createGatewayServer(functions) {
  const functionByName = new Map(functions.map(item => [item.name, item]))

  return http.createServer((req, res) => {
    addCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const requestUrl = new URL(req.url || '/', 'http://local.functions')
    if (requestUrl.pathname === '/__local_functions__/health') {
      writeJson(res, 200, {
        code: 200,
        data: {
          status: 'ok',
          functions: functions.map(item => ({
            name: item.name,
            port: item.port
          }))
        }
      })
      return
    }

    const [, functionName, ...restPath] = requestUrl.pathname.split('/')
    const definition = functionByName.get(functionName)
    if (!definition) {
      writeJson(res, 404, {
        code: 404,
        message: `本地云函数不存在: ${functionName || requestUrl.pathname}`,
        data: {
          availableFunctions: Array.from(functionByName.keys())
        }
      })
      return
    }

    const targetPath = `/${restPath.join('/')}${requestUrl.search}`
    const headers = { ...req.headers, host: `127.0.0.1:${definition.port}` }
    delete headers.connection

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: definition.port,
        path: targetPath,
        method: req.method,
        headers
      },
      proxyRes => {
        res.statusCode = proxyRes.statusCode || 502
        Object.entries(proxyRes.headers || {}).forEach(([key, value]) => {
          if (key.toLowerCase() === 'transfer-encoding') {
            return
          }
          if (value !== undefined) {
            res.setHeader(key, value)
          }
        })
        addCorsHeaders(res)
        proxyRes.pipe(res)
      }
    )

    proxyReq.on('error', error => {
      writeJson(res, 502, {
        code: 'LOCAL_FUNCTION_PROXY_FAILED',
        message: String(error?.message || error)
      })
    })

    req.pipe(proxyReq)
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const functions = getSelectedFunctions(args.functions)
  ensureTcbFfInstalled(functions)

  const localEnv = readEnvFile(path.join(projectRoot, '.env.local'))
  const server = createGatewayServer(functions)
  const children = []
  let shuttingDown = false

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(args.port, args.host, () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })

  functions.forEach((item, index) => {
    const child = spawnFunctionRuntime(item, localEnv)
    children.push(child)
    child.on('exit', code => {
      if (shuttingDown) {
        return
      }
      const name = functions[index]?.name || 'unknown'
      process.stderr.write(`[${name}] 本地函数进程退出，code=${code}\n`)
    })
  })

  const lanAddresses = getLanAddresses()
  process.stdout.write(`本地 CloudBase 函数 gateway 已启动: http://127.0.0.1:${args.port}\n`)
  lanAddresses.forEach(address => {
    process.stdout.write(`局域网访问: http://${address}:${args.port}\n`)
  })
  process.stdout.write(`已启动函数: ${functions.map(item => item.name).join(', ')}\n`)

  function shutdown() {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    server.close()
    children.forEach(child => child.kill('SIGTERM'))
    setTimeout(() => process.exit(0), 300).unref()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch(error => {
  if (error?.code === 'EADDRINUSE') {
    const port = error?.port || process.env.CLOUDBASE_LOCAL_FUNCTIONS_PORT || DEFAULT_GATEWAY_PORT
    process.stderr.write(
      `本地 CloudBase 函数 gateway 端口已被占用: ${port}\n` +
      `请关闭占用进程，或使用 CLOUDBASE_LOCAL_FUNCTIONS_PORT=${Number(port) + 1} npm run dev:functions\n`
    )
    process.exit(1)
  }

  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
