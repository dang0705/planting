import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import automator from 'miniprogram-automator'
import { isDevToolsMainProcess } from './qa-devtools-topology.mjs'
import { ancestorsFrom } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-process-topology.mjs'
import { readManagedDailySessionAuth } from './qa-auth-daily-session-observer.mjs'
import { findDailyAuthRecord, findUsableAuthRecord } from './bridge-wechat-devtools-auth.mjs'
import {
  SYSTEM_APP_ASAR,
  SYSTEM_ELECTRON,
  SYSTEM_PRODUCT_HASH,
  isOfficialElectronBundle
} from './patch-wechat-devtools-launcher.mjs'

export const AUTH_ROOT = path.join(os.homedir(), '.planting', 'automator-qa', 'v3', 'auth')
export const SOCKET_PATH = path.join(AUTH_ROOT, 'broker.sock')
export const STATE_PATH = path.join(AUTH_ROOT, 'broker-state.json')
export const SHARED_PATH = path.join(AUTH_ROOT, 'shared.json')
export const COMPAT_PATH = path.join(AUTH_ROOT, 'default.json')
export const MANIFEST_PATH = path.join(AUTH_ROOT, 'current.json')
export const IDENTITY_LOCK_PATH = path.join(AUTH_ROOT, 'identity-lock.json')
export const SERVER_VALIDATION_PATH = path.join(AUTH_ROOT, 'server-validation.json')
export const DAILY_CAPABILITY_PATH = path.join(AUTH_ROOT, 'managed-daily-capability.json')
export const AUTH_CONSUMPTION_PATH = path.join(AUTH_ROOT, 'auth-consumption.json')
export const AUTH_BROKER_PROTOCOL_VERSION = 2
export const MANAGED_NW_BINARY = path.join(
  AUTH_ROOT,
  '..',
  'devtools',
  'launcher.app',
  'Contents',
  'MacOS',
  'wechatdevtools'
)
// Formal QA runs the immutable installed DevTools bundle. Electron releases
// use app.asar directly; legacy NW executable/package paths remain accepted
// only for old receipts and cleanup compatibility, never as the active path
// when the official Electron bundle is installed.
export const SYSTEM_NW_BINARY = '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools'
export const OFFICIAL_ELECTRON_ACTIVE = isOfficialElectronBundle()
export const MANAGED_BUNDLE_ROOT = path.resolve(path.dirname(MANAGED_NW_BINARY), '..', '..')
export const MANAGED_NW_BINARIES = Object.freeze([MANAGED_NW_BINARY, SYSTEM_NW_BINARY])
export const MANAGED_PACKAGE_DIR = path.join(AUTH_ROOT, '..', 'devtools', 'package.nw-v10')
export const MANAGED_BUNDLE_ROOTS = Object.freeze([
  MANAGED_BUNDLE_ROOT,
  path.resolve(path.dirname(SYSTEM_NW_BINARY), '..', '..')
])
// The daily profile deliberately runs the immutable package shipped with the
// installed DevTools. It must be recognized as owned by our launcher without
// being mistaken for the QA shared-auth package.
export const SYSTEM_PACKAGE_DIR = path.resolve(
  path.dirname(SYSTEM_NW_BINARY),
  '..',
  'Resources',
  'package.nw'
)
export const REFRESH_URL = 'https://mp.weixin.qq.com/debug/cgi-bin/webdebugger/refreshticket'
export const PROFILE_PATH = path.join(
  os.homedir(),
  '.planting',
  'qa-devtools-home',
  'Library',
  'Application Support',
  '微信开发者工具',
  SYSTEM_PRODUCT_HASH || '7a30d6576abfa238418b33c3c50ac14e'
)
export const DAILY_PROFILE_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  '微信开发者工具',
  SYSTEM_PRODUCT_HASH || '50a7d9210159a32f006158795f893857'
)
export const DAILY_CONTROL_PORT = 9423
export const DAILY_SERVICE_PORT = 3798
export const QA_CONTROL_PORT = 9422
export const QA_SERVICE_PORT = 3799
const AUTH_CONSUMPTION_MAX_AGE_MS = 120_000
const AUTH_CONSUMPTION_HISTORY_LIMIT = 32
const FORCED_REFRESH_DEDUPE_MS = 5_000
const MANAGED_DAILY_PROACTIVE_REFRESH_WINDOW_MS = 120_000
const MANAGED_DAILY_PROACTIVE_REFRESH_RETRY_MS = 15_000
const NATIVE_DAILY_REFRESH_CONNECT_TIMEOUT_MS = 8_000
const NATIVE_DAILY_REFRESH_RPC_TIMEOUT_MS = 8_000
const NATIVE_DAILY_REFRESH_OBSERVATION_TIMEOUT_MS = 15_000
const NATIVE_DAILY_REFRESH_POLL_INTERVAL_MS = 500
const AUTH_EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/u

// The native DevTools path proves consumption by reopening only the
// QA-owned profile and completing a real runtime request. The old
// shared_auth_merge source remains valid for the retired compatibility
// bridge's historical receipts, but it must not be emitted by the native
// runtime path.
export function isAcceptedAuthConsumptionSource(source, role = null) {
  return source === 'shared_auth_merge' || (source === 'native_profile_reopen' && role === 'qa')
}

const BROKER_ENTRY = fileURLToPath(new URL('./qa-auth-broker.mjs', import.meta.url))
const BROKER_ENTRY_DISPLAY = 'scripts/qa/qa-auth-broker.mjs'
let refreshInFlight = null
let lastSuccessfulRefresh = null
let lastProactiveDailyRefreshAt = 0
let nativeDailyRefreshInFlight = null
let lastNativeDailyRefresh = {
  status: 'idle',
  code: 'qa_native_daily_refresh_not_started'
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    fs.renameSync(temporary, filePath)
    fs.chmodSync(filePath, 0o600)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

function isCarryableQaServerValidation(value, identityHash) {
  return Boolean(
    value?.status === 'passed' &&
      value.identity_hash === identityHash &&
      /^[a-f0-9]{64}$/u.test(String(value.runtime_identity_hash || '')) &&
      Number(value.auth_generation) > 0 &&
      value.qa_profile &&
      path.resolve(String(value.qa_profile)) === path.resolve(PROFILE_PATH)
  )
}

function carryOrInvalidateQaServerValidation({ previous, identityHash, generation }) {
  if (isCarryableQaServerValidation(previous, identityHash)) {
    // 票据 generation 轮换不等于业务身份变化。保留的是已经由真实 QA
    // 小程序 wx.request 建立的同号身份连续性，不是目标接口的性能证据；
    // 目标接口仍必须在本轮端上请求中单独校验 HTTP/业务码和耗时。
    writeJson(SERVER_VALIDATION_PATH, {
      ...previous,
      auth_generation: generation,
      source_generation: Number(previous.auth_generation) || null,
      validation_basis: 'same_qa_identity_after_ticket_rotation',
      carried_at: new Date().toISOString(),
      writer_pid: process.pid
    })
    return 'carried'
  }
  fs.rmSync(SERVER_VALIDATION_PATH, { force: true })
  return 'invalidated'
}

function error(code, fields = {}) {
  return Object.assign(new Error(code), { code, ...fields })
}

export function authFields(value) {
  return {
    loginStatus: 'SUCCESS',
    openid: String(value.openid || ''),
    signature: String(value.signature || ''),
    newticket: String(value.newticket || ''),
    nickName: value.nickName,
    headUrl: value.headUrl,
    ticketExpiredTime: Number(value.ticketExpiredTime),
    signatureExpiredTime: Number(value.signatureExpiredTime),
    sex: value.sex,
    province: value.province,
    city: value.city,
    country: value.country,
    isTourist: value.isTourist === true,
    syncTime: Number(value.syncTime || Date.now())
  }
}

export function assertAuth(value) {
  const auth = authFields(value)
  if (!auth.openid || !auth.signature || !auth.newticket) {
    throw error('qa_auth_broker_auth_material_invalid')
  }
  if (!Number.isFinite(auth.ticketExpiredTime) || !Number.isFinite(auth.signatureExpiredTime)) {
    throw error('qa_auth_broker_auth_expiry_invalid')
  }
  return auth
}

function isTouristIdentityPlaceholder(previous, incoming) {
  return Boolean(previous?.isTourist === true && incoming?.isTourist !== true)
}

export function assertIdentity(openid, { allowTouristReplacement = false, incoming = null } = {}) {
  const identityHash = sha256(openid)
  const existing = readJson(IDENTITY_LOCK_PATH)
  if (existing?.identity_hash && existing.identity_hash !== identityHash) {
    const previous = currentShared()
    const canReplacePlaceholder =
      allowTouristReplacement &&
      isTouristIdentityPlaceholder(previous, incoming) &&
      previous.identityHash === existing.identity_hash
    if (!canReplacePlaceholder) {
      throw error('qa_auth_identity_mismatch', {
        expected_identity_hash: existing.identity_hash,
        observed_identity_hash: identityHash
      })
    }
    writeJson(IDENTITY_LOCK_PATH, {
      schema_version: 1,
      identity_hash: identityHash,
      pinned_at: new Date().toISOString(),
      pinned_by_pid: process.pid,
      replaced_tourist_placeholder: true
    })
  }
  if (!existing) {
    writeJson(IDENTITY_LOCK_PATH, {
      schema_version: 1,
      identity_hash: identityHash,
      pinned_at: new Date().toISOString(),
      pinned_by_pid: process.pid
    })
  }
  return identityHash
}

function isCompleteSharedSnapshot(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.openid === 'string' &&
    value.openid &&
    typeof value.signature === 'string' &&
    value.signature &&
    typeof value.newticket === 'string' &&
    value.newticket &&
    typeof value.identityHash === 'string' &&
    /^[a-f0-9]{64}$/u.test(value.identityHash) &&
    Number.isInteger(Number(value.authGeneration)) &&
    Number(value.authGeneration) > 0 &&
    Number.isFinite(Number(value.updatedAt)) &&
    Number(value.updatedAt) > 0 &&
    value.writerRole === 'qa-auth-broker'
  )
}

/**
 * The broker's shared snapshot is authoritative.  `default.json` is only a
 * compatibility read path for the patched DevTools bundle; falling back to
 * it here could make the broker validate a stale or half-written snapshot.
 */
export function currentShared() {
  const snapshot = readStableJson(SHARED_PATH)
  return isCompleteSharedSnapshot(snapshot) ? snapshot : null
}

function processCommand(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return ''
  }
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  return String(result.stdout || '').trim()
}

function hasProcessPort(command, flag, port) {
  const text = String(command || '')
  return new RegExp(
    `${flag}\\s+${Number(port)}(?:\\s|$)|${flag}=${Number(port)}(?:\\s|$)`,
    'u'
  ).test(text)
}

export function isManagedDevToolsCommand(command, { role = null } = {}) {
  const text = String(command || '')
  const officialElectronCommand =
    OFFICIAL_ELECTRON_ACTIVE &&
    text.includes(SYSTEM_ELECTRON) &&
    text.includes(SYSTEM_APP_ASAR) &&
    /(?:^|\s)--cli(?:\s|$)/u.test(text)
  if ((role === 'qa' || role === 'daily') && officialElectronCommand) {
    return true
  }
  if (!MANAGED_NW_BINARIES.some(binary => text.includes(binary))) {
    return false
  }
  const packageArgumentMatches = packagePath =>
    text.includes(`--package-dir=${packagePath}`) || text.includes(`--nwapp-path=${packagePath}`)
  // Formal QA now runs the immutable installed bundle. The historical
  // patched/copy package remains recognized only for compatibility with old
  // receipts and cleanup, never as a required launch path.
  const qaPackageMatches =
    packageArgumentMatches(SYSTEM_PACKAGE_DIR) ||
    packageArgumentMatches(MANAGED_PACKAGE_DIR) ||
    packageArgumentMatches(path.join(MANAGED_BUNDLE_ROOT, 'Contents', 'Resources', 'package.nw'))
  const dailyPackageMatches = packageArgumentMatches(SYSTEM_PACKAGE_DIR)
  if (role === 'qa') {
    return qaPackageMatches
  }
  if (role === 'daily') {
    return dailyPackageMatches
  }
  return qaPackageMatches || dailyPackageMatches
}

function expectedConsumerProcess({ role, pid, profile, userDataDir, command }) {
  const expectedProfile = role === 'qa' ? PROFILE_PATH : DAILY_PROFILE_PATH
  const expectedControl = role === 'qa' ? QA_CONTROL_PORT : DAILY_CONTROL_PORT
  const expectedService = role === 'qa' ? QA_SERVICE_PORT : DAILY_SERVICE_PORT
  const officialUserDataDir = path.dirname(path.resolve(expectedProfile))
  const officialCommand =
    OFFICIAL_ELECTRON_ACTIVE &&
    String(command || '').includes(SYSTEM_ELECTRON) &&
    String(command || '').includes(SYSTEM_APP_ASAR) &&
    /(?:^|\s)--cli(?:\s|$)/u.test(String(command || ''))
  const profileArgumentMatches = officialCommand
    ? String(command || '').includes(`--user-data-dir=${officialUserDataDir}`)
    : String(command || '').includes(`--user-data-dir=${path.resolve(expectedProfile)}`) ||
      (role === 'qa' &&
        userDataDir &&
        String(command || '').includes(`--user-data-dir=${path.resolve(String(userDataDir))}`))
  return Boolean(
    (role === 'qa' || role === 'daily') &&
    Number.isInteger(pid) &&
    pid > 0 &&
    path.resolve(String(profile || '')) === path.resolve(expectedProfile) &&
    isManagedDevToolsCommand(command, { role }) &&
    profileArgumentMatches &&
    hasProcessPort(command, '--ide-http-port', expectedControl) &&
    hasProcessPort(command, '--remote-port', expectedService)
  )
}

function authConsumptionMaterial(value) {
  const shared = currentShared()
  const identityHash = shared?.identityHash || (value?.openid ? sha256(value.openid) : '')
  const ticketHash = value?.newticket ? sha256(value.newticket) : ''
  return {
    identity_hash: identityHash || null,
    ticket_hash: ticketHash || null,
    auth_generation: Number(value?.authGeneration || shared?.authGeneration || 0) || null
  }
}

export function readAuthConsumptionEvidence() {
  return readJson(AUTH_CONSUMPTION_PATH)
}

export function validateAuthConsumptionRequest(request = {}) {
  const event = recordAuthConsumption(request)
  return { status: 'ready', code: 'qa_auth_consumption_ack', event }
}

export function recordAuthConsumption({
  role,
  pid,
  process_start_identity,
  profile,
  user_data_dir = null,
  control_port,
  service_port,
  source = 'shared_auth_merge',
  auth,
  event_id: requestedEventId = null
} = {}) {
  if (!['qa', 'daily'].includes(role)) {
    throw error('qa_auth_consumption_role_invalid')
  }
  if (!isAcceptedAuthConsumptionSource(source, role)) {
    throw error('qa_auth_consumption_source_invalid', { source: source || null })
  }
  const numericPid = Number(pid)
  const actualStart = processStartIdentity(numericPid)
  const command = processCommand(numericPid)
  if (
    !Number.isInteger(numericPid) ||
    !actualStart ||
    (process_start_identity && actualStart !== process_start_identity) ||
    !expectedConsumerProcess({
      role,
      pid: numericPid,
      profile,
      userDataDir: user_data_dir,
      command
    })
  ) {
    throw error('qa_auth_consumption_process_unverified', {
      role,
      pid: Number.isInteger(numericPid) ? numericPid : null,
      profile: profile || null
    })
  }
  const shared = currentShared()
  const material = authConsumptionMaterial(auth)
  if (
    !shared ||
    !material.identity_hash ||
    material.identity_hash !== shared.identityHash ||
    !material.ticket_hash ||
    material.ticket_hash !== sha256(String(shared.newticket || '')) ||
    material.auth_generation !== Number(shared.authGeneration)
  ) {
    throw error('qa_auth_consumption_material_mismatch')
  }
  const eventId = requestedEventId || `broker-${Date.now()}-${numericPid}`
  if (!AUTH_EVENT_ID_PATTERN.test(String(eventId))) {
    throw error('qa_auth_consumption_event_id_invalid')
  }
  const event = {
    schema_version: 1,
    event_id: String(eventId),
    role,
    pid: numericPid,
    process_start_identity: actualStart,
    profile_realpath: path.resolve(String(profile)),
    control_port: Number(control_port) || null,
    service_port: Number(service_port) || null,
    source,
    identity_hash: material.identity_hash,
    ticket_hash: material.ticket_hash,
    auth_generation: material.auth_generation,
    consumed_at: new Date().toISOString(),
    consumed_at_ms: Date.now()
  }
  const previous = readAuthConsumptionEvidence()
  const history = Array.isArray(previous?.history) ? previous.history : []
  const replay = history.find(item => item?.event_id === event.event_id)
  if (replay) {
    return replay
  }
  const latestByRole = {
    ...(previous?.latest_by_role || {}),
    [role]: event
  }
  writeJson(AUTH_CONSUMPTION_PATH, {
    schema_version: 1,
    latest: event,
    latest_by_role: latestByRole,
    history: [...history, event].slice(-AUTH_CONSUMPTION_HISTORY_LIMIT),
    updated_at: event.consumed_at
  })
  promoteQaServerValidationForConsumedGeneration(event)
  return event
}

function promoteQaServerValidationForConsumedGeneration(event) {
  if (event?.role !== 'qa') {
    return null
  }
  const previous = readJson(SERVER_VALIDATION_PATH)
  if (
    previous?.status !== 'passed' ||
    previous.identity_hash !== event.identity_hash ||
    !previous.runtime_identity_hash ||
    Number(previous.auth_generation || 0) >= Number(event.auth_generation || 0) ||
    Number(previous.qa_pid || 0) !== Number(event.pid) ||
    previous.qa_process_start_identity !== event.process_start_identity ||
    path.resolve(String(previous.qa_profile || '')) !==
      path.resolve(String(event.profile_realpath || ''))
  ) {
    return null
  }
  const promoted = {
    ...previous,
    auth_generation: Number(event.auth_generation),
    reason: 'shared_auth_consumption_revalidated',
    validated_at: event.consumed_at,
    writer_pid: process.pid,
    revalidated_by_event_id: event.event_id
  }
  writeJson(SERVER_VALIDATION_PATH, promoted)
  return promoted
}

export function isFreshAuthConsumptionEvidence(
  evidence,
  {
    role = 'qa',
    pid,
    process_start_identity,
    profile,
    auth_generation,
    identity_hash,
    ticket_hash,
    event_id = null,
    max_age_ms = AUTH_CONSUMPTION_MAX_AGE_MS,
    now = Date.now()
  } = {}
) {
  const expected = evidence?.latest_by_role?.[role] || evidence?.latest || evidence
  const consumedAt = Number(expected?.consumed_at_ms)
  const ageValid =
    max_age_ms === null || max_age_ms === undefined
      ? Number.isFinite(consumedAt) && now - consumedAt >= 0
      : Number.isFinite(consumedAt) && now - consumedAt >= 0 && now - consumedAt <= max_age_ms
  return Boolean(
    expected &&
    expected.role === role &&
    isAcceptedAuthConsumptionSource(expected.source, role) &&
    typeof expected.event_id === 'string' &&
    expected.event_id.length > 0 &&
    Number(expected.pid) === Number(pid) &&
    expected.process_start_identity === process_start_identity &&
    path.resolve(String(expected.profile_realpath || '')) === path.resolve(String(profile || '')) &&
    Number(expected.auth_generation) === Number(auth_generation) &&
    expected.identity_hash === identity_hash &&
    expected.ticket_hash === ticket_hash &&
    (!event_id || expected.event_id === event_id) &&
    ageValid
  )
}

export function dailyDevToolsState() {
  const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
  const needles = [
    `--user-data-dir=${DAILY_PROFILE_PATH}`,
    ...(OFFICIAL_ELECTRON_ACTIVE ? [`--user-data-dir=${path.dirname(DAILY_PROFILE_PATH)}`] : [])
  ]
  const matching = String(result.stdout || '')
    .split(/\r?\n/u)
    .filter(
      line => needles.some(needle => line.includes(needle)) && !line.includes('qa-auth-broker.mjs')
    )
  const orphaned = matching.filter(line => !isDevToolsMainProcess(line))
  const commands = matching.filter(line => isDevToolsMainProcess(line))
  const processes = commands.map(line => {
    const pid = Number(line.trim().split(/\s+/u)[0])
    return {
      pid,
      command: line,
      process_start_identity: processStartIdentity(pid)
    }
  })
  return {
    active: commands.length > 0,
    managed:
      commands.length > 0 &&
      commands.every(line => isManagedDevToolsCommand(line, { role: 'daily' })),
    pids: processes.map(item => item.pid).filter(Number.isInteger),
    commands,
    processes,
    orphaned_pids: orphaned
      .map(line => Number(line.trim().split(/\s+/u)[0]))
      .filter(Number.isInteger),
    orphaned_commands: orphaned
  }
}

export function authOperatingMode(processState = dailyDevToolsState()) {
  if (!processState.active) {
    return 'qa_only_shared_refresh'
  }
  return processState.managed ? 'managed_daily_single_writer' : 'native_daily_read_only'
}

function listenerPids(port) {
  const result = spawnSync('lsof', [`-tiTCP:${Number(port)}`, '-sTCP:LISTEN'], {
    encoding: 'utf8'
  })
  if (result.error || result.status === null) {
    return null
  }
  return String(result.stdout || '')
    .split(/\s+/u)
    .filter(Boolean)
    .map(value => Number(value))
    .filter(Number.isInteger)
}

function commandForPid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return ''
  }
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  return String(result.stdout || '').trim()
}

function nativeDailyServiceOwnership(dailyProcess) {
  const listeners = listenerPids(DAILY_SERVICE_PORT)
  if (!listeners || listeners.length === 0) {
    return {
      verified: false,
      code: 'qa_native_daily_refresh_service_listener_missing',
      listeners: listeners || []
    }
  }
  const mainPids = new Set(
    (dailyProcess?.pids || []).map(value => Number(value)).filter(Number.isInteger)
  )
  const commands = listeners.map(pid => ({
    pid,
    command: commandForPid(pid),
    ancestors: ancestorsFrom(pid)
  }))
  const owned = commands.every(item => {
    const command = item.command
    if (OFFICIAL_ELECTRON_ACTIVE) {
      const owner = item.ancestors.find(ancestor => mainPids.has(Number(ancestor.pid)))
      return (
        Boolean(owner) &&
        owner.command.includes(SYSTEM_ELECTRON) &&
        owner.command.includes(SYSTEM_APP_ASAR) &&
        owner.command.includes(`--user-data-dir=${path.dirname(DAILY_PROFILE_PATH)}`) &&
        hasProcessPort(owner.command, '--remote-port', DAILY_SERVICE_PORT)
      )
    }
    return (
      command.includes(DAILY_PROFILE_PATH) &&
      command.includes(SYSTEM_PACKAGE_DIR) &&
      command.includes('wechatwebdevtools')
    )
  })
  return {
    verified: owned,
    code: owned
      ? 'qa_native_daily_refresh_service_owner_verified'
      : 'qa_native_daily_refresh_service_owner_unverified',
    listeners,
    commands,
    main_pids: [...mainPids]
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withTimeout(task, timeoutMs, code) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const timeoutError = new Error(`${code} after ${timeoutMs}ms`)
      timeoutError.code = code
      timeoutError.timeout_ms = timeoutMs
      reject(timeoutError)
    }, timeoutMs)
  })
  try {
    return await Promise.race([Promise.resolve().then(task), timeout])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function observeNativeDailyRefresh({
  before,
  dailyProcess,
  connect = options => automator.connect(options)
}) {
  // A native daily DevTools process owns its own ticket refresh. The broker
  // may request that owner through the official Automator service and observe
  // the resulting generation, but it must never refresh or rewrite the ticket
  // behind that process itself.
  const ownership = nativeDailyServiceOwnership(dailyProcess)
  if (!ownership.verified) {
    return {
      status: 'blocked',
      code: ownership.code,
      ownership
    }
  }
  let miniProgram = null
  const endpoint = `ws://127.0.0.1:${DAILY_SERVICE_PORT}`
  try {
    miniProgram = await withTimeout(
      () => connect({ wsEndpoint: endpoint }),
      NATIVE_DAILY_REFRESH_CONNECT_TIMEOUT_MS,
      'qa_native_daily_refresh_connect_timeout'
    )
    await withTimeout(
      () => miniProgram.refreshTicket(),
      NATIVE_DAILY_REFRESH_RPC_TIMEOUT_MS,
      'qa_native_daily_refresh_rpc_timeout'
    )
  } catch (errorValue) {
    return {
      status: 'blocked',
      code: errorValue?.code || 'qa_native_daily_refresh_failed',
      message: errorValue?.message || String(errorValue),
      endpoint,
      ownership
    }
  } finally {
    // The refresh request is acknowledged by the DevTools service before its
    // profile/log state is necessarily rewritten. Keep the observation below
    // independent, and never leave a broker-owned service connection open.
    try {
      miniProgram?.disconnect?.()
    } catch {
      // The refresh result remains valid even if disconnect is already closed.
    }
  }

  const beforeGeneration = Number(before?.authGeneration || 0) || 0
  const beforeTicket = before?.newticket || null
  const deadline = Date.now() + NATIVE_DAILY_REFRESH_OBSERVATION_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      syncDailyAuth({ allowUnmanagedReadOnly: true })
    } catch {
      // Keep polling the exact daily profile/session evidence below.
    }
    const observed = currentShared()
    if (
      observed &&
      observed.identityHash === before?.identityHash &&
      Number(observed.authGeneration || 0) > beforeGeneration &&
      observed.newticket &&
      observed.newticket !== beforeTicket &&
      authIsFresh(observed)
    ) {
      return {
        status: 'ready',
        code: 'qa_managed_daily_refresh_native_owner_delegated',
        delegation: 'Let the native daily owner refresh itself',
        auth_generation: Number(observed.authGeneration),
        identity_hash: observed.identityHash,
        ticket_expired_at: Number(observed.ticketExpiredTime),
        ownership
      }
    }
    await sleep(NATIVE_DAILY_REFRESH_POLL_INTERVAL_MS)
  }
  return {
    status: 'blocked',
    code: 'qa_native_daily_refresh_observation_timeout',
    before_generation: beforeGeneration,
    observed_generation: Number(currentShared()?.authGeneration || 0) || null,
    identity_hash: currentShared()?.identityHash || before?.identityHash || null,
    ownership,
    observation_timeout_ms: NATIVE_DAILY_REFRESH_OBSERVATION_TIMEOUT_MS
  }
}

const STABLE_AUTH_READ_ATTEMPTS = 6
const STABLE_AUTH_READ_WAIT_MS = 40

function waitForStableAuthRead() {
  // `readDailyAuth` is intentionally synchronous because the auth-concurrency
  // snapshot is synchronous. A short in-process wait is preferable to treating
  // a DevTools atomic-write window as an identity mismatch. It never changes
  // profile data and remains bounded below one sampling interval.
  const signal = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(signal, 0, 0, STABLE_AUTH_READ_WAIT_MS)
}

function readStableJson(filePath, { attempts = 1 } = {}) {
  const boundedAttempts = Math.max(1, Math.min(Number(attempts) || 1, STABLE_AUTH_READ_ATTEMPTS))
  for (let attempt = 0; attempt < boundedAttempts; attempt += 1) {
    try {
      const first = fs.readFileSync(filePath)
      const second = fs.readFileSync(filePath)
      if (first.equals(second)) {
        return JSON.parse(first.toString('utf8'))
      }
    } catch {
      // The DevTools local-storage file may be between atomic replacement
      // steps. Retry the same exact file rather than selecting another record.
    }
    if (attempt < boundedAttempts - 1) {
      waitForStableAuthRead()
    }
  }
  return null
}

export function readDailyAuth() {
  const usable = findUsableAuthRecord(DAILY_PROFILE_PATH)
  if (usable?.value) {
    return usable.value
  }
  try {
    findDailyAuthRecord(DAILY_PROFILE_PATH)
  } catch (error) {
    if (error?.code === 'qa_daily_auth_tourist_login_required') {
      throw error
    }
  }
  return null
}

function authIsFresh(value) {
  return Boolean(
    value &&
    Number(value.ticketExpiredTime) > Date.now() + 5000 &&
    Number(value.signatureExpiredTime) > Date.now() + 5000
  )
}

export function processStartIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return ''
  }
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' })
  return String(result.stdout || '').trim()
}

function processAlive(pid, expectedStart = null) {
  const numericPid = Number(pid)
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false
  }
  try {
    process.kill(numericPid, 0)
  } catch {
    return false
  }
  return !expectedStart || processStartIdentity(numericPid) === expectedStart
}

export function readDailyCapability() {
  return readJson(DAILY_CAPABILITY_PATH)
}

export function canAcceptDailyPublish({
  role,
  dailyProcess,
  capability,
  capabilityState = readDailyCapability()
}) {
  if (role !== 'daily' || dailyProcess?.active !== true || dailyProcess?.managed !== true) {
    return false
  }
  const pid = Number(capabilityState?.pid)
  const process = dailyProcess.processes?.find(item => Number(item.pid) === pid)
  return Boolean(
    capability &&
    capabilityState?.schema_version === 1 &&
    capabilityState.capability === capability &&
    process &&
    capabilityState.process_start_identity &&
    capabilityState.process_start_identity === process.process_start_identity &&
    isManagedDevToolsCommand(process.command, { role: 'daily' }) &&
    (OFFICIAL_ELECTRON_ACTIVE
      ? process.command.includes(`--user-data-dir=${path.dirname(DAILY_PROFILE_PATH)}`)
      : process.command.includes(`--user-data-dir=${DAILY_PROFILE_PATH}`))
  )
}

export function shouldReplaceSharedAuth(previous, incoming) {
  if (!previous) {
    return true
  }
  if (previous.identityHash && previous.identityHash !== incoming.identityHash) {
    if (isTouristIdentityPlaceholder(previous, incoming)) {
      return true
    }
    throw error('qa_auth_identity_mismatch')
  }
  const previousTicket = Number(previous.ticketExpiredTime)
  const previousSignature = Number(previous.signatureExpiredTime)
  const incomingTicket = Number(incoming.ticketExpiredTime)
  const incomingSignature = Number(incoming.signatureExpiredTime)
  if (incomingTicket < previousTicket || incomingSignature < previousSignature) {
    return false
  }
  return (
    incomingTicket > previousTicket ||
    incomingSignature > previousSignature ||
    incoming.newticket !== previous.newticket
  )
}

export function syncDailyAuth({ allowUnmanagedReadOnly = false } = {}) {
  const processState = dailyDevToolsState()
  const unmanagedDaily = processState.active && !processState.managed
  if (unmanagedDaily && !allowUnmanagedReadOnly) {
    throw error('qa_auth_broker_daily_unmanaged_process_conflict', {
      daily_processes: processState.pids
    })
  }
  let value = readDailyAuth()
  let source = 'profile'
  let sessionEvidence = null
  if (!value && processState.managed) {
    const observed = readManagedDailySessionAuth({
      profile: DAILY_PROFILE_PATH,
      processes: processState.processes
    })
    value = observed?.value || null
    sessionEvidence = observed
    source = observed ? 'managed_daily_session_log' : source
  }
  if (unmanagedDaily && allowUnmanagedReadOnly) {
    if (!value || !authIsFresh(value)) {
      throw error('qa_auth_broker_daily_observed_ticket_unavailable', {
        daily_processes: processState.pids
      })
    }
    const retained = currentShared()
    if (
      retained?.openid &&
      retained.openid !== value.openid &&
      !isTouristIdentityPlaceholder(retained, value)
    ) {
      throw error('qa_auth_identity_mismatch')
    }
    // The active native daily profile is the read-only source of truth. Its
    // fresh local ticket may legitimately be newer than the last shared
    // generation, so replace stale shared state without contacting the
    // official refresh endpoint.
    const auth = publish(value, 'broker_observed_daily')
    return {
      status: 'ready',
      code: 'qa_auth_broker_daily_observed_read_only',
      source: 'broker_observed_daily',
      auth
    }
  }
  if (
    processState.managed &&
    !canAcceptDailyPublish({
      role: 'daily',
      dailyProcess: processState,
      capability: readDailyCapability()?.capability
    })
  ) {
    throw error('qa_auth_broker_daily_publisher_unverified', {
      daily_processes: processState.pids
    })
  }
  if (!value) {
    throw error('qa_daily_auth_record_not_found')
  }
  const auth = publish(value, 'daily')
  return {
    status: 'ready',
    code: unmanagedDaily
      ? 'qa_auth_broker_daily_observed_read_only'
      : 'qa_auth_broker_daily_synced',
    source: unmanagedDaily
      ? 'broker_observed_daily'
      : source === 'profile'
        ? 'managed_daily'
        : source,
    auth,
    evidence: sessionEvidence
      ? {
          session_id: sessionEvidence.sessionId,
          log_file: sessionEvidence.file,
          observation: 'current_managed_daily_process_session'
        }
      : null
  }
}

export function publish(value, sourceRole = null, { force = false } = {}) {
  if (!['daily', 'broker_observed_daily', 'qa-auth-broker'].includes(sourceRole)) {
    throw error('qa_auth_broker_publish_source_role_forbidden', {
      source_role: sourceRole
    })
  }
  const auth = assertAuth(value)
  const identityHash = assertIdentity(auth.openid, {
    allowTouristReplacement: auth.isTourist !== true,
    incoming: auth
  })
  const previous = currentShared()
  const incoming = { ...auth, identityHash }
  if (!force && !shouldReplaceSharedAuth(previous, incoming)) {
    return previous
  }
  const generation = Number(previous?.authGeneration || 0) + 1
  const sourceRecordSha256 = sha256(JSON.stringify(auth))
  const shared = {
    schemaVersion: 1,
    ...auth,
    authGeneration: generation,
    identityHash,
    sourceRole,
    sourceRecordSha256,
    updatedAt: Date.now(),
    writerPid: process.pid,
    writerRole: 'qa-auth-broker'
  }
  writeJson(SHARED_PATH, shared)
  writeJson(COMPAT_PATH, shared)
  writeJson(MANIFEST_PATH, {
    schema_version: 1,
    profile_realpath: fs.existsSync(PROFILE_PATH) ? fs.realpathSync(PROFILE_PATH) : PROFILE_PATH,
    identity_hash: identityHash,
    auth_generation: generation,
    ticket_expired_at: auth.ticketExpiredTime,
    signature_expired_at: auth.signatureExpiredTime,
    source_role: 'qa',
    writer_role: 'qa-auth-broker',
    source_record_sha256: sourceRecordSha256,
    shared_state_path: SHARED_PATH,
    writer_pid: process.pid,
    adopted_at: new Date().toISOString()
  })
  carryOrInvalidateQaServerValidation({
    previous: readJson(SERVER_VALIDATION_PATH),
    identityHash,
    generation
  })
  return shared
}

export async function refresh(
  value,
  role = 'qa',
  { force = false, capability = null, proactive = false } = {}
) {
  if (refreshInFlight) {
    return refreshInFlight
  }
  refreshInFlight = refreshInternal(value, role, force, capability, proactive).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function refreshInternal(value, role, force, capability, proactive) {
  const requested = assertAuth(value)
  const existing = currentShared()
  const dailyState = dailyDevToolsState()
  if (
    role === 'daily' &&
    !canAcceptDailyPublish({
      role,
      dailyProcess: dailyState,
      capability,
      capabilityState: readDailyCapability()
    })
  ) {
    throw error('qa_auth_broker_daily_publisher_unverified', {
      daily_processes: dailyState.pids
    })
  }
  if (dailyState.active && role !== 'daily') {
    // The daily profile is the only account session allowed to refresh the
    // official ticket while it is active. This applies to both native daily
    // DevTools and the broker-managed daily launcher: a QA refresh would
    // rotate the server ticket behind the daily process and recreate the
    // top-login failure. In native/read-only mode, a fresh shared generation
    // alone is not evidence that the active daily process still owns usable
    // material, so QA may only adopt a fresh observation from that profile.
    const observed = readDailyAuth()
    if (observed && authIsFresh(observed)) {
      if (sha256(observed.openid) !== sha256(requested.openid)) {
        throw error('qa_auth_identity_mismatch')
      }
      // This is a broker read-only observation of the active daily profile.
      // It must not be recorded as an official daily writer operation.
      const shared = publish(observed, 'broker_observed_daily')
      if (authIsFresh(shared)) {
        return shared
      }
    }
    throw error('qa_auth_broker_daily_observed_ticket_unavailable', {
      daily_processes: dailyState.pids
    })
  }
  const proactiveRefreshDue =
    proactive === true &&
    role === 'daily' &&
    existing?.openid === requested.openid &&
    authIsFresh(existing) &&
    Number(existing.ticketExpiredTime) <= Date.now() + 120_000
  if (existing?.openid === requested.openid && authIsFresh(existing) && !proactiveRefreshDue) {
    // `force` belongs to the DevTools caller, not to the account. Once the
    // single writer has a fresh shared ticket, another profile must consume
    // it rather than invalidate it through another official refresh.
    return existing
  }
  if (
    force &&
    lastSuccessfulRefresh &&
    lastSuccessfulRefresh.identity_hash === sha256(requested.openid) &&
    Date.now() - lastSuccessfulRefresh.refreshed_at < FORCED_REFRESH_DEDUPE_MS &&
    existing?.newticket === lastSuccessfulRefresh.newticket
  ) {
    return existing
  }
  // Two DevTools profiles can report the same expired ticket almost
  // simultaneously. Once the first caller has published a different fresh
  // ticket, the second caller must consume that ticket instead of refreshing
  // the official endpoint again and invalidating the first caller.
  if (
    force &&
    existing?.openid === requested.openid &&
    existing?.newticket &&
    existing.newticket !== requested.newticket &&
    Number(existing.ticketExpiredTime) > Date.now() + 5000 &&
    Number(existing.signatureExpiredTime) > Date.now() + 5000
  ) {
    return existing
  }
  if (
    !force &&
    existing?.openid === requested.openid &&
    Number(existing.ticketExpiredTime) > Date.now() + 5000 &&
    Number(existing.signatureExpiredTime) > Date.now() + 5000
  ) {
    return existing
  }
  const response = await fetch(REFRESH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      openid: existing?.openid || requested.openid,
      signature: existing?.signature || requested.signature
    })
  })
  const body = await response.text()
  let parsed = null
  try {
    parsed = JSON.parse(body)
  } catch {
    parsed = null
  }
  const errcode = Number(parsed?.baseresponse?.errcode ?? -1)
  const ticket = response.headers.get('debugger-newticket')
  const lifetime = Number(parsed?.ticket_expired_time)
  if (!response.ok || errcode !== 0 || !ticket || !Number.isFinite(lifetime) || lifetime <= 0) {
    throw error('qa_auth_broker_refresh_failed', { http_status: response.status, errcode })
  }
  const refreshed = publish(
    {
      ...requested,
      ...(existing?.openid === requested.openid ? existing : {}),
      openid: requested.openid,
      signature: existing?.signature || requested.signature,
      newticket: ticket,
      ticketExpiredTime: Date.now() + lifetime * 1000,
      syncTime: Date.now()
    },
    'qa-auth-broker',
    { force: true }
  )
  lastSuccessfulRefresh = {
    identity_hash: refreshed.identityHash,
    newticket: refreshed.newticket,
    refreshed_at: Date.now()
  }
  return refreshed
}

/**
 * Keep the single managed-daily writer alive during long QA runs. QA remains
 * a consumer; only a verified managed daily process may call the refresh
 * endpoint and publish the next shared generation.
 */
export async function maybeProactiveManagedDailyRefresh({ now = Date.now() } = {}) {
  const dailyProcess = dailyDevToolsState()
  const capabilityState = readDailyCapability()
  if (
    !canAcceptDailyPublish({
      role: 'daily',
      dailyProcess,
      capability: capabilityState?.capability,
      capabilityState
    })
  ) {
    return { status: 'not_needed', code: 'qa_managed_daily_refresh_owner_unavailable' }
  }
  const dailyOwner = dailyProcess.processes?.find(
    process => Number(process.pid) === Number(capabilityState?.pid)
  )
  const dailyOwnerCommand = String(dailyOwner?.command || '')
  const nativeDailyPackage = OFFICIAL_ELECTRON_ACTIVE
    ? dailyOwnerCommand.includes(SYSTEM_ELECTRON) &&
      dailyOwnerCommand.includes(SYSTEM_APP_ASAR) &&
      dailyOwnerCommand.includes(`--user-data-dir=${path.dirname(DAILY_PROFILE_PATH)}`)
    : dailyOwnerCommand.includes(`--package-dir=${SYSTEM_PACKAGE_DIR}`)
  const brokerRefreshCapableDailyPackage =
    dailyOwnerCommand.includes(`--package-dir=${MANAGED_PACKAGE_DIR}`) && !nativeDailyPackage
  const shared = currentShared()
  if (!shared?.openid || !shared?.signature || !shared?.newticket) {
    return { status: 'not_needed', code: 'qa_managed_daily_refresh_auth_unavailable' }
  }
  const due =
    Number(shared.ticketExpiredTime) <= now + MANAGED_DAILY_PROACTIVE_REFRESH_WINDOW_MS ||
    Number(shared.signatureExpiredTime) <= now + MANAGED_DAILY_PROACTIVE_REFRESH_WINDOW_MS
  if (!due) {
    return { status: 'not_needed', code: 'qa_managed_daily_refresh_not_due' }
  }
  if (
    refreshInFlight ||
    now - lastProactiveDailyRefreshAt < MANAGED_DAILY_PROACTIVE_REFRESH_RETRY_MS
  ) {
    return { status: 'not_needed', code: 'qa_managed_daily_refresh_throttled' }
  }
  lastProactiveDailyRefreshAt = now
  if (nativeDailyPackage) {
    if (nativeDailyRefreshInFlight) {
      return { status: 'not_needed', code: 'qa_native_daily_refresh_in_flight' }
    }
    nativeDailyRefreshInFlight = observeNativeDailyRefresh({
      before: shared,
      dailyProcess
    }).finally(() => {
      nativeDailyRefreshInFlight = null
    })
    const nativeResult = await nativeDailyRefreshInFlight
    lastNativeDailyRefresh = nativeResult
    return nativeResult
  }
  if (!brokerRefreshCapableDailyPackage) {
    return {
      status: 'blocked',
      code: 'qa_managed_daily_refresh_consumer_capability_unproven'
    }
  }
  try {
    const refreshed = await refresh(shared, 'daily', {
      force: true,
      capability: capabilityState.capability,
      proactive: true
    })
    return {
      status: 'ready',
      code: 'qa_managed_daily_refresh_completed',
      auth_generation: Number(refreshed?.authGeneration || 0) || null
    }
  } catch (errorValue) {
    return {
      status: 'blocked',
      code: errorValue?.code || 'qa_managed_daily_refresh_failed'
    }
  }
}

export function health() {
  const state = readJson(STATE_PATH)
  const dailyProcess = dailyDevToolsState()
  const capabilityState = readDailyCapability()
  const capabilityVerified = canAcceptDailyPublish({
    role: 'daily',
    dailyProcess,
    capability: capabilityState?.capability,
    capabilityState
  })
  return {
    status: 'ready',
    code: 'qa_auth_broker_ready',
    protocol_version: AUTH_BROKER_PROTOCOL_VERSION,
    pid: process.pid,
    state,
    socket_path: SOCKET_PATH,
    auth_generation: Number(currentShared()?.authGeneration || 0),
    identity_hash: currentShared()?.identityHash || null,
    daily_process: dailyProcess,
    auth_mode: authOperatingMode(dailyProcess),
    daily_capability: {
      present: Boolean(capabilityState),
      verified: capabilityVerified,
      pid: Number.isInteger(Number(capabilityState?.pid)) ? Number(capabilityState.pid) : null,
      process_start_identity: capabilityState?.process_start_identity || null,
      profile: capabilityState?.profile || null,
      bundle_root: capabilityState?.bundle_root || null
    },
    native_daily_refresh: lastNativeDailyRefresh
  }
}

export function requestUnix(method, route, body = null, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        socketPath: SOCKET_PATH,
        path: route,
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        timeout: timeoutMs
      },
      response => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', chunk => (text += chunk))
        response.on('end', () => {
          try {
            resolve({ statusCode: response.statusCode, value: JSON.parse(text) })
          } catch {
            reject(error('qa_auth_broker_response_invalid'))
          }
        })
      }
    )
    request.on('timeout', () => request.destroy(error('qa_auth_broker_timeout')))
    request.on('error', reject)
    if (body) {
      request.write(JSON.stringify(body))
    }
    request.end()
  })
}

export async function ensureQaAuthBroker({ timeoutMs = 5000 } = {}) {
  let existing = null
  try {
    existing = await requestUnix('GET', '/health')
    if (
      existing.statusCode === 200 &&
      existing.value?.code === 'qa_auth_broker_ready' &&
      Number(existing.value?.protocol_version) === AUTH_BROKER_PROTOCOL_VERSION
    ) {
      return existing.value
    }
  } catch {
    // A dead socket is handled by the bounded owner check in the server entry.
  }
  if (existing?.statusCode === 200 && existing.value?.code === 'qa_auth_broker_ready') {
    const state = existing.value.state
    const pid = Number(existing.value.pid || state?.pid)
    const expectedStart = existing.value.state?.process_start_identity || null
    const observedStart = processStartIdentity(pid)
    const command =
      pid > 0
        ? String(
            spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).stdout ||
              ''
          ).trim()
        : ''
    const socketOwners = String(
      spawnSync('lsof', ['-t', '--', SOCKET_PATH], { encoding: 'utf8' }).stdout || ''
    )
      .split(/\r?\n/u)
      .map(value => Number(value.trim()))
      .filter(value => Number.isInteger(value) && value > 0)
    if (
      !pid ||
      !observedStart ||
      !expectedStart ||
      observedStart !== expectedStart ||
      !(command.includes(BROKER_ENTRY) || command.includes(BROKER_ENTRY_DISPLAY)) ||
      !/(?:^|\s)start(?:\s|$)/u.test(command) ||
      !socketOwners.includes(pid) ||
      socketOwners.some(ownerPid => ownerPid !== pid)
    ) {
      throw error('qa_auth_broker_protocol_mismatch_owner_unverified')
    }
    try {
      process.kill(pid, 'SIGTERM')
    } catch (killError) {
      throw error('qa_auth_broker_protocol_mismatch_stop_failed', {
        message: killError?.message || String(killError)
      })
    }
    const stopDeadline = Date.now() + timeoutMs
    while (Date.now() < stopDeadline) {
      if (!processAlive(pid, expectedStart)) {
        break
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    if (processAlive(pid, expectedStart)) {
      throw error('qa_auth_broker_protocol_mismatch_stop_timeout', { pid })
    }
  }
  const child = spawn(process.execPath, [BROKER_ENTRY, 'start'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env }
  })
  child.unref?.()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const result = await requestUnix('GET', '/health')
      if (result.statusCode === 200 && result.value?.code === 'qa_auth_broker_ready') {
        return result.value
      }
    } catch {
      // Continue until the bounded startup deadline.
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw error('qa_auth_broker_start_timeout')
}

export function publishQaAuthSync(value, role = 'qa', timeoutMs = 5000) {
  const result = spawnSync(process.execPath, [BROKER_ENTRY, 'publish', `--role=${role}`], {
    input: JSON.stringify(value),
    encoding: 'utf8',
    timeout: timeoutMs + 3000,
    maxBuffer: 1024 * 1024
  })
  let parsed = null
  try {
    parsed = JSON.parse(String(result.stdout || ''))
  } catch {
    parsed = null
  }
  if (result.status !== 0 || parsed?.status === 'blocked') {
    throw error(parsed?.code || 'qa_auth_broker_publish_failed', { message: parsed?.message })
  }
  return parsed
}

export function refreshQaAuthSync(value, role = 'qa', force = true, timeoutMs = 5000) {
  const result = spawnSync(
    process.execPath,
    [BROKER_ENTRY, 'refresh', `--role=${role}`, ...(force ? ['--force'] : [])],
    {
      input: JSON.stringify(value),
      encoding: 'utf8',
      timeout: timeoutMs + 3000,
      maxBuffer: 1024 * 1024
    }
  )
  let parsed = null
  try {
    parsed = JSON.parse(String(result.stdout || ''))
  } catch {
    parsed = null
  }
  if (result.status !== 0 || parsed?.status === 'blocked') {
    throw error(parsed?.code || 'qa_auth_broker_refresh_failed', { message: parsed?.message })
  }
  return parsed
}

export function ensureQaAuthBrokerSync({ sync = false, timeoutMs = 5000 } = {}) {
  const result = spawnSync(
    process.execPath,
    [BROKER_ENTRY, 'ensure', ...(sync ? ['--sync'] : [])],
    {
      encoding: 'utf8',
      timeout: timeoutMs + 3000,
      maxBuffer: 1024 * 1024
    }
  )
  let value = null
  try {
    value = JSON.parse(String(result.stdout || ''))
  } catch {
    value = null
  }
  if (result.status !== 0 || value?.status === 'blocked') {
    throw error(value?.code || 'qa_auth_broker_unavailable', { message: value?.message })
  }
  return value
}
