#!/usr/bin/env node

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  AUTH_ROOT,
  SOCKET_PATH,
  STATE_PATH,
  canAcceptDailyPublish,
  authOperatingMode,
  currentShared,
  dailyDevToolsState,
  ensureQaAuthBroker,
  ensureQaAuthBrokerSync,
  health,
  maybeProactiveManagedDailyRefresh,
  publish,
  publishQaAuthSync,
  processStartIdentity,
  validateAuthConsumptionRequest,
  readDailyCapability,
  readJson,
  refresh,
  refreshQaAuthSync,
  requestUnix,
  syncDailyAuth,
  writeJson
} from './qa-auth-broker-core.mjs'

const ENTRY_PATH = fileURLToPath(import.meta.url)

function error(code, fields = {}) {
  return Object.assign(new Error(code), { code, ...fields })
}

function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body)
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(error('qa_auth_broker_request_too_large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(error('qa_auth_broker_request_invalid'))
      }
    })
    req.on('error', reject)
  })
}

function processCommand(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return ''
  }
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  return String(result.stdout || '').trim()
}

function processExists(pid) {
  return Boolean(pid && processCommand(pid))
}

function socketOwnerPids() {
  if (!fs.existsSync(SOCKET_PATH)) {
    return { pids: [], available: true }
  }
  const result = spawnSync('lsof', ['-t', '--', SOCKET_PATH], { encoding: 'utf8' })
  if (result.error || result.status === null) {
    throw error('qa_auth_broker_socket_owner_check_unavailable')
  }
  return {
    pids: String(result.stdout || '')
      .split(/\r?\n/u)
      .map(value => Number(value.trim()))
      .filter(Number.isInteger),
    available: true
  }
}

function validateExistingOwner(state, socketPids) {
  const candidatePids = [...new Set([...socketPids, Number(state?.pid)])].filter(Number.isInteger)
  const live = candidatePids.filter(processExists)
  const brokerPids = live.filter(pid => {
    const command = processCommand(pid)
    return command.includes(ENTRY_PATH) && /(?:^|\s)start(?:\s|$)/u.test(command)
  })
  if (brokerPids.length === 1 && live.length === 1) {
    const expectedStart = String(state?.process_start_identity || '')
    const observedStart = processStartIdentity(brokerPids[0])
    if (!expectedStart || !observedStart || expectedStart === observedStart) {
      return { status: 'owned', pid: brokerPids[0] }
    }
  }
  if (live.length > 0) {
    throw error('qa_auth_broker_socket_owner_unverified', {
      pids: live,
      commands: live.map(pid => processCommand(pid))
    })
  }
  return { status: 'stale' }
}

function prepareSocketForStart() {
  fs.mkdirSync(AUTH_ROOT, { recursive: true, mode: 0o700 })
  if (!fs.existsSync(SOCKET_PATH)) {
    return
  }
  const state = readJson(STATE_PATH)
  const socketOwners = socketOwnerPids()
  const owner = validateExistingOwner(state, socketOwners.pids)
  if (owner.status === 'owned') {
    throw error('qa_auth_broker_already_running', { pid: owner.pid })
  }
  if (owner.status !== 'stale') {
    throw error('qa_auth_broker_socket_owner_unverified')
  }
  fs.rmSync(SOCKET_PATH, { force: true })
  if (state && !processExists(Number(state.pid))) {
    fs.rmSync(STATE_PATH, { force: true })
  }
}

function assertRoutePermission(route, role, request) {
  const dailyState = dailyDevToolsState()
  if (
    role === 'daily' &&
    !canAcceptDailyPublish({
      role,
      dailyProcess: dailyState,
      capability: request?.capability,
      capabilityState: readDailyCapability()
    })
  ) {
    throw error('qa_auth_broker_daily_publisher_unverified', { daily_processes: dailyState.pids })
  }
  if (route === '/publish' && role !== 'daily') {
    throw error('qa_auth_broker_publish_forbidden')
  }
}

async function handleRequest(req, res) {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, health())
      return
    }
    if (req.method !== 'POST' || !['/publish', '/refresh', '/sync', '/consume'].includes(req.url)) {
      json(res, 404, { status: 'blocked', code: 'qa_auth_broker_route_not_found' })
      return
    }
    const request = await readBody(req)
    if (req.url === '/sync') {
      const result = syncDailyAuth({ allowUnmanagedReadOnly: true })
      json(res, 200, result)
      return
    }
    if (req.url === '/consume') {
      json(res, 200, validateAuthConsumptionRequest(request))
      return
    }
    const role = request.role || 'qa'
    assertRoutePermission(req.url, role, request)
    const auth =
      req.url === '/refresh'
        ? await refresh(request.auth || request, role, {
            force: request.force === true,
            capability: request.capability || null,
            proactive: request.proactive === true
          })
        : publish(request.auth || request, role)
    json(res, 200, { status: 'ready', code: 'qa_auth_broker_updated', auth })
  } catch (requestError) {
    json(res, 409, {
      status: 'blocked',
      code: requestError?.code || 'qa_auth_broker_request_failed',
      message: requestError?.message || String(requestError)
    })
  }
}

export async function startServer() {
  prepareSocketForStart()
  const server = http.createServer(handleRequest)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(SOCKET_PATH, resolve)
  })
  fs.chmodSync(SOCKET_PATH, 0o600)
  writeJson(STATE_PATH, {
    schema_version: 1,
    status: 'ready',
    pid: process.pid,
    process_start_identity: processStartIdentity(process.pid),
    socket_path: SOCKET_PATH,
    started_at: new Date().toISOString()
  })
  try {
    syncDailyAuth({ allowUnmanagedReadOnly: true })
  } catch {
    // A closed or incomplete daily profile does not make the broker unhealthy.
  }
  const dailyPoll = setInterval(() => {
    try {
      syncDailyAuth({ allowUnmanagedReadOnly: true })
    } catch {
      // Keep the last verified shared state during a transient profile write.
    }
    maybeProactiveManagedDailyRefresh().catch(() => {
      // A transient refresh error is retried by the next broker poll.
    })
  }, 1000)
  const close = () => {
    clearInterval(dailyPoll)
    server.close(() => {
      fs.rmSync(SOCKET_PATH, { force: true })
      fs.rmSync(STATE_PATH, { force: true })
      process.exit(0)
    })
  }
  process.once('SIGTERM', close)
  process.once('SIGINT', close)
  return server
}

async function runCli() {
  const command = process.argv[2] || 'health'
  if (command === 'start') {
    await startServer()
    return
  }
  if (command === 'ensure') {
    let value = await ensureQaAuthBroker()
    if (process.argv.includes('--sync')) {
      const synced = await requestUnix('POST', '/sync', {})
      if (synced.statusCode !== 200) {
        throw error(synced.value?.code || 'qa_auth_broker_sync_failed')
      }
      value = { ...value, sync: synced.value }
    }
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
    return
  }
  if (command === 'publish') {
    const role =
      process.argv.find(item => item.startsWith('--role='))?.slice('--role='.length) || 'qa'
    let input = ''
    process.stdin.setEncoding('utf8')
    await new Promise((resolve, reject) => {
      process.stdin.on('data', chunk => (input += chunk))
      process.stdin.on('end', resolve)
      process.stdin.on('error', reject)
    })
    const value = JSON.parse(input || '{}')
    await ensureQaAuthBroker()
    const result = await requestUnix('POST', '/publish', { auth: value, role })
    if (result.statusCode !== 200) {
      throw error(result.value?.code || 'qa_auth_broker_publish_failed')
    }
    process.stdout.write(`${JSON.stringify(result.value, null, 2)}\n`)
    return
  }
  if (command === 'refresh') {
    const role =
      process.argv.find(item => item.startsWith('--role='))?.slice('--role='.length) || 'qa'
    const force = process.argv.includes('--force')
    let input = ''
    process.stdin.setEncoding('utf8')
    await new Promise((resolve, reject) => {
      process.stdin.on('data', chunk => (input += chunk))
      process.stdin.on('end', resolve)
      process.stdin.on('error', reject)
    })
    const value = JSON.parse(input || '{}')
    await ensureQaAuthBroker()
    const result = await requestUnix('POST', '/refresh', { auth: value, role, force })
    if (result.statusCode !== 200) {
      throw error(result.value?.code || 'qa_auth_broker_refresh_failed')
    }
    process.stdout.write(`${JSON.stringify(result.value, null, 2)}\n`)
    return
  }
  const result = await requestUnix('GET', '/health')
  process.stdout.write(`${JSON.stringify(result.value, null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === ENTRY_PATH) {
  runCli().catch(errorValue => {
    process.stdout.write(
      `${JSON.stringify({ status: 'blocked', code: errorValue?.code || 'qa_auth_broker_unavailable', message: errorValue?.message }, null, 2)}\n`
    )
    process.exitCode = 1
  })
}

export {
  authOperatingMode,
  currentShared,
  ensureQaAuthBroker,
  ensureQaAuthBrokerSync,
  publishQaAuthSync,
  refreshQaAuthSync
}
