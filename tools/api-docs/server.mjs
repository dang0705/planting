/* oxlint-disable curly, no-console, no-magic-numbers, unicorn/prefer-string-starts-ends-with */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiDocument } from './contracts.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(directory, '..', '..')
const publicDirectory = path.join(directory, 'public')
const safeEnvironmentKeys = new Set([
  'CLOUDBASE_LOCAL_FUNCTIONS_PORT',
  'CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP',
  'VITE_API_BASE_URL',
  'VITE_DEV_OPENID',
  'VITE_CLOUDBASE_ENV_ID',
  'APP_ENV'
])

function parseEnv(text = '') {
  return Object.fromEntries(
    text.split(/\r?\n/u).flatMap(line => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/u)
      if (!match || !safeEnvironmentKeys.has(match[1])) return []
      return [[match[1], match[2].replace(/^['"]|['"]$/gu, '')]]
    })
  )
}

async function readSafeEnvironment() {
  try {
    return parseEnv(await readFile(path.join(projectRoot, '.env.local'), 'utf8'))
  } catch {
    return {}
  }
}

function send(response, statusCode, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(statusCode, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
  response.end(typeof body === 'string' ? body : JSON.stringify(body))
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', chunk => {
      body += chunk
      if (body.length > 1_000_000) reject(new Error('请求体过大'))
    })
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) } catch { reject(new Error('请求体不是有效 JSON')) }
    })
    request.on('error', reject)
  })
}

function isAllowedBaseUrl(value, environment) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const environmentId = String(environment.VITE_CLOUDBASE_ENV_ID || '').toLowerCase()
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host) || /^192\.168\./u.test(host) || /^10\./u.test(host) || /^172\.(1[6-9]|2\d|3[01])\./u.test(host)
    const isExpectedCloudBase = Boolean(environmentId) && host.includes(environmentId) && (host.endsWith('.app.tcloudbase.com') || host.endsWith('.api.tcloudbasegateway.com'))
    return (url.protocol === 'http:' && isLocal) || (url.protocol === 'https:' && isExpectedCloudBase)
  } catch { return false }
}

function makeTargetUrl(baseUrl, endpointPath, query) {
  const target = new URL(`${String(baseUrl).replace(/\/+$/u, '')}/${String(endpointPath).replace(/^\/+/, '')}`)
  Object.entries(query && typeof query === 'object' ? query : {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, String(value))
  })
  return target
}

function isLocalTarget(baseUrl) {
  const host = new URL(baseUrl).hostname.toLowerCase()
  return ['localhost', '127.0.0.1', '::1'].includes(host) || /^192\.168\./u.test(host) || /^10\./u.test(host) || /^172\.(1[6-9]|2\d|3[01])\./u.test(host)
}

async function proxyCall(payload, environment) {
  const endpointPath = String(payload.path || '').replace(/^\/+/, '')
  const api = apiDocument.endpoints.find(item => item.path === endpointPath && item.method === String(payload.method || '').toUpperCase())
  if (!api) throw new Error('只允许调用文档目录中的接口')
  const baseUrl = String(payload.baseUrl || '').trim()
  if (!isAllowedBaseUrl(baseUrl, environment)) throw new Error('目标地址不在本地开发或当前 CloudBase 环境白名单内')
  const target = makeTargetUrl(baseUrl, endpointPath, payload.query)
  const headers = { Accept: 'application/json', 'x-app-env': environment.APP_ENV || 'development', 'x-env': environment.APP_ENV || 'development' }
  const sessionToken = String(payload.sessionToken || '').trim()
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`
    headers['x-planting-platform-session'] = sessionToken
  } else if (isLocalTarget(baseUrl)) {
    const openid = String(environment.VITE_DEV_OPENID || '').trim()
    if (openid) { headers['x-wx-openid'] = openid; headers['x-openid'] = openid }
  }
  const method = api.method
  const request = { method, headers, signal: AbortSignal.timeout(30_000) }
  if (!['GET', 'DELETE'].includes(method)) {
    headers['Content-Type'] = 'application/json'
    request.body = JSON.stringify(payload.body && typeof payload.body === 'object' ? payload.body : {})
  }
  const response = await fetch(target, request)
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), data }
}

async function main() {
  const environment = await readSafeEnvironment()
  const localPort = Number(environment.CLOUDBASE_LOCAL_FUNCTIONS_PORT || 3010)
  const config = {
    apiBaseUrl: environment.VITE_API_BASE_URL || `http://127.0.0.1:${localPort}`,
    appEnv: environment.APP_ENV || 'development',
    cloudbaseEnvId: environment.VITE_CLOUDBASE_ENV_ID || '',
    localGatewayPort: localPort,
    hasLocalOpenid: Boolean(environment.VITE_DEV_OPENID)
  }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    try {
      if (request.method === 'GET' && url.pathname === '/api/document') return send(response, 200, apiDocument)
      if (request.method === 'GET' && url.pathname === '/api/config') return send(response, 200, config)
      if (request.method === 'POST' && url.pathname === '/api/call') return send(response, 200, await proxyCall(await parseBody(request), environment))
      if (request.method !== 'GET') return send(response, 405, { message: '不支持的请求方法' })
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
      if (file.includes('..')) return send(response, 403, { message: '禁止访问' })
      const content = await readFile(path.join(publicDirectory, file), 'utf8')
      return send(response, 200, content, file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8')
    } catch (error) { return send(response, 400, { message: String(error?.message || '请求失败') }) }
  })
  const port = Number(process.env.API_DOCS_PORT || 4177)
  server.listen(port, '127.0.0.1', () => console.log(`API 文档已启动：http://127.0.0.1:${port}`))
}

main()
