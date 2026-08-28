import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_PORT = 3010
export const DEFAULT_FUNCTION_PORT_BASE = 9000
export const DEFAULT_OPENID = 'dev_terminal_mp_local'
export const LOCAL_FUNCTIONS_GATEWAY_SCRIPT = fileURLToPath(
  new URL('./local-functions-gateway.mjs', import.meta.url)
)
export const PROJECT_ROOT = path.resolve(path.dirname(LOCAL_FUNCTIONS_GATEWAY_SCRIPT), '..', '..')
export const MP_WEIXIN_RUNTIME_TARGET = path.join(PROJECT_ROOT, 'dist', 'dev', 'mp-weixin')
export const LOCAL_RUNTIME_LEASE_ROOT = path.join(PROJECT_ROOT, '.tmp', 'local-runtime-sessions')
export const LOCAL_GATEWAY_KIND = 'planting-local-functions-gateway'
export const DEFAULT_REQUIRED_FUNCTIONS = [
  'diagnose-http',
  'plant-catalog-http',
  'plant-user-http',
  'identify-http',
  'diagnosis-history-http',
  'auth-user-http',
  'weather-http',
  'storage-http'
]
export const FUNCTION_HEALTH_PATHS = {
  'diagnose-http': 'diagnose-http/health',
  'plant-catalog-http': 'plant-catalog-http/catalog/health',
  'plant-user-http': 'plant-user-http/user-plants/health',
  'identify-http': 'identify-http/identify/health',
  'diagnosis-history-http': 'diagnosis-history-http/diagnosis/history/health',
  'auth-user-http': 'auth-user-http/auth/user/health',
  'weather-http': 'weather-http/weather/health',
  'storage-http': 'storage-http/storage/health'
}
export const FUNCTION_NAMES = [
  'diagnose-http',
  'plant-catalog-http',
  'plant-user-http',
  'identify-http',
  'diagnosis-history-http',
  'auth-user-http',
  'weather-http',
  'storage-http'
]
export const FUNCTION_PORTS = Object.fromEntries(
  FUNCTION_NAMES.map((name, index) => [name, DEFAULT_FUNCTION_PORT_BASE + index])
)
export function getFunctionPorts(base = DEFAULT_FUNCTION_PORT_BASE) {
  const numericBase = Number(base)
  return Object.fromEntries(FUNCTION_NAMES.map((name, index) => [name, numericBase + index]))
}
export const GATEWAY_READY_TIMEOUT_MS = 60000
export const HEALTH_REQUEST_TIMEOUT_MS = 3000
export const GATEWAY_RECOVERY_TIMEOUT_MS = 5000

const LOCAL_CREDENTIAL_SECRET_ID_KEYS = [
  'CLOUDBASE_SECRET_ID',
  'TENCENT_SECRET_ID',
  'TENCENTCLOUD_SECRETID'
]
const LOCAL_CREDENTIAL_SECRET_KEY_KEYS = [
  'CLOUDBASE_SECRET_KEY',
  'TENCENT_SECRET_KEY',
  'TENCENTCLOUD_SECRETKEY'
]
const FUNCTIONS_REQUIRING_CLOUDBASE_CREDENTIALS = new Set([
  'auth-user-http',
  'diagnose-http',
  'identify-http',
  'plant-catalog-http',
  'plant-user-http',
  'storage-http',
  'weather-http'
])
export const FUNCTION_BUSINESS_PROBES = {
  'plant-user-http': {
    path: 'plant-user-http/user-plants?page=1&pageSize=1'
  },
  'weather-http': {
    path: 'weather-http/weather/current',
    method: 'POST',
    body: {
      lat: 31.22352,
      lng: 121.45591,
      city: '上海市',
      province: '上海市',
      useCache: true
    }
  }
}

function getFirstLanAddress() {
  return (
    Object.values(os.networkInterfaces())
      .flat()
      .find(item => item && item.family === 'IPv4' && !item.internal)?.address || ''
  )
}

export function parseLocalApiEnvironmentArgs(argv = [], environment = process.env) {
  const separatorIndex = argv.indexOf('--')
  const optionArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv
  const command = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : []
  const options = {
    mode: 'loopback',
    port: Number(environment.CLOUDBASE_LOCAL_FUNCTIONS_PORT || DEFAULT_PORT),
    functionPortBase: Number(
      environment.CLOUDBASE_LOCAL_FUNCTIONS_FUNCTION_PORT_BASE || DEFAULT_FUNCTION_PORT_BASE
    ),
    outputDir: environment.UNI_OUTPUT_DIR || '',
    runtimeLeaseRoot: environment.LOCAL_RUNTIME_LEASE_ROOT || '',
    baseUrl: environment.VITE_API_BASE_URL || '',
    baseUrlSource: environment.VITE_API_BASE_URL ? 'environment' : '',
    openid: environment.VITE_DEV_OPENID || DEFAULT_OPENID,
    requiredFunctions: String(
      environment.CLOUDBASE_LOCAL_REQUIRED_FUNCTIONS || DEFAULT_REQUIRED_FUNCTIONS.join(',')
    )
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
    startFunctions: environment.CLOUDBASE_LOCAL_AUTO_START_FUNCTIONS !== 'false',
    reuseOutput: false,
    skipHealthCheck: false,
    skipBusinessCheck: environment.CLOUDBASE_LOCAL_SKIP_BUSINESS_CHECK === 'true'
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
    if (key === '--function-port-base' && value) {
      options.functionPortBase = Number(value)
    }
    if (key === '--output-dir' && value) {
      options.outputDir = path.resolve(value)
    }
    if (key === '--runtime-lease-root' && value) {
      options.runtimeLeaseRoot = path.resolve(value)
    }
    if (key === '--base-url' && value) {
      options.baseUrl = value
      options.baseUrlSource = 'cli'
    }
    if (key === '--openid' && value) {
      options.openid = value
    }
    if (key === '--required-functions') {
      options.requiredFunctions = value
        ? value
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
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
    if (key === '--reuse-output') {
      options.reuseOutput = true
    }
    if (key === '--skip-business-check') {
      options.skipBusinessCheck = true
    }
  })

  return { options, command }
}

export function resolveLocalApiBaseUrl(options = {}, environment = process.env) {
  const hasExplicitBaseUrl =
    options.baseUrl && (options.mode !== 'lan' || options.baseUrlSource === 'cli')
  if (hasExplicitBaseUrl) {
    return String(options.baseUrl).replace(/\/+$/, '')
  }
  if (options.mode === 'lan') {
    const host = environment.CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP || getFirstLanAddress()
    if (!host) {
      throw new Error('未找到可用局域网 IP，请设置 CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP')
    }
    return `http://${host}:${options.port}`
  }
  return `http://127.0.0.1:${options.port}`
}

function readFirstEnvValue(env = {}, keys = []) {
  for (const key of keys) {
    const value = String(env[key] || '').trim()
    if (value) {
      return value
    }
  }
  return ''
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
  return fs
    .readFileSync(filePath, 'utf8')
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
      if (key) {
        env[key] = parseEnvValue(trimmed.slice(separator + 1))
      }
      return env
    }, {})
}

function resolveLocalCloudbaseCredentials(env = {}) {
  return {
    secretId: readFirstEnvValue(env, LOCAL_CREDENTIAL_SECRET_ID_KEYS),
    secretKey: readFirstEnvValue(env, LOCAL_CREDENTIAL_SECRET_KEY_KEYS)
  }
}

function isTruthyFlag(value) {
  return value === true || value === 'true' || value === '1' || value === 1
}

export function assertLocalCloudbaseCredentials(requiredFunctions = []) {
  if (isTruthyFlag(process.env.CLOUDBASE_LOCAL_SKIP_CREDENTIAL_CHECK)) {
    return
  }
  const functionsNeedingCredentials = requiredFunctions.filter(name =>
    FUNCTIONS_REQUIRING_CLOUDBASE_CREDENTIALS.has(name)
  )
  if (!functionsNeedingCredentials.length) {
    return
  }
  const localEnv = readEnvFile(path.join(PROJECT_ROOT, '.env.local'))
  const credentials = resolveLocalCloudbaseCredentials({ ...localEnv, ...process.env })
  if (credentials.secretId && credentials.secretKey) {
    return
  }
  const missing = [
    credentials.secretId ? '' : 'SecretId',
    credentials.secretKey ? '' : 'SecretKey'
  ].filter(Boolean)
  throw createLocalGatewayError(
    'LOCAL_CLOUDBASE_CREDENTIALS_MISSING',
    '本地 CloudBase HTTP 函数需要云端 SQL/Auth/Storage 凭据，但当前 shell 与 .env.local 未提供完整凭据。\n' +
      `需要凭据的函数: ${functionsNeedingCredentials.join(', ')}\n` +
      `缺少: ${missing.join(', ')}\n` +
      '修复方式：复制 .env.local.example 为 .env.local，并填写以下任一组未提交变量：\n' +
      '- CLOUDBASE_SECRET_ID + CLOUDBASE_SECRET_KEY\n' +
      '- TENCENT_SECRET_ID + TENCENT_SECRET_KEY\n' +
      '- TENCENTCLOUD_SECRETID + TENCENTCLOUD_SECRETKEY\n' +
      '不要把真实密钥写回 cloudbaserc.json、workflow 或任何已跟踪文件。'
  )
}

export function createLocalGatewayError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}
