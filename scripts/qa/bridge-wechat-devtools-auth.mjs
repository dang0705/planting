#!/usr/bin/env node

import crypto from 'node:crypto'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { SYSTEM_PRODUCT_HASH } from './patch-wechat-devtools-launcher.mjs'

// DevTools 2.02.2609012 derives its data directory from the installed app
// path.  Keep the retired hash only as a fallback for older installations;
// the current official bundle must never be read through the stale profile.
const DEFAULT_PRODUCT_HASH = SYSTEM_PRODUCT_HASH || '50a7d9210159a32f006158795f893857'
const QA_PRODUCT_HASH = SYSTEM_PRODUCT_HASH || '7a30d6576abfa238418b33c3c50ac14e'
const AUTH_KEYS = [
  'loginStatus',
  'syncTime',
  'signature',
  'newticket',
  'openid',
  'nickName',
  'headUrl',
  'ticketExpiredTime',
  'signatureExpiredTime',
  'sex',
  'province',
  'city',
  'country',
  'isTourist'
]
const REQUIRED_AUTH_KEYS = [
  'signature',
  'newticket',
  'openid',
  'ticketExpiredTime',
  'signatureExpiredTime'
]
const MAX_EXPIRED_TICKET_AGE_MS = 6 * 60 * 60 * 1000
const REFRESH_TICKET_URL = 'https://mp.weixin.qq.com/debug/cgi-bin/webdebugger/refreshticket'
const OFFICIAL_STORAGE_SECRET_FILE = 'ls_encrypt_secret.json'
const DEFAULT_ROOT = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  'Library',
  'Application Support',
  '微信开发者工具'
)
const QA_HOME = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'qa-devtools-home'
)
const DAILY_PROFILE = path.join(DEFAULT_ROOT, DEFAULT_PRODUCT_HASH)
const QA_PROFILE = path.join(
  QA_HOME,
  'Library',
  'Application Support',
  '微信开发者工具',
  QA_PRODUCT_HASH
)
const DEFAULT_SHARED_AUTH_ROOT = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.planting',
  'automator-qa',
  'v3',
  'auth'
)

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function stableReadJson(filePath, attempts = 8) {
  let previous = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const first = fs.readFileSync(filePath)
      const firstHash = sha256(first)
      const second = fs.readFileSync(filePath)
      const secondHash = sha256(second)
      if (firstHash !== secondHash) {
        continue
      }
      if (previous && previous.hash === firstHash) {
        return { value: JSON.parse(first.toString('utf8')), bytes: first.length, hash: firstHash }
      }
      previous = { hash: firstHash }
    } catch {
      return null
    }
  }
  return null
}

function md5Hex(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex')
}

function stableReadText(filePath, attempts = 8) {
  let previous = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const first = fs.readFileSync(filePath, 'utf8')
      const firstHash = sha256(first)
      const second = fs.readFileSync(filePath, 'utf8')
      const secondHash = sha256(second)
      if (firstHash !== secondHash) {
        continue
      }
      if (previous && previous.hash === firstHash) {
        return { text: first, bytes: Buffer.byteLength(first), hash: firstHash }
      }
      previous = { hash: firstHash }
    } catch {
      return null
    }
  }
  return null
}

function hashKeyMapForProfile(profile) {
  const filePath = path.join(
    profileRealpath(profile) || path.resolve(profile),
    'WeappLocalData',
    'hash_key_map_2.json'
  )
  const snapshot = stableReadJson(filePath)
  return snapshot?.value && isPlainObject(snapshot.value) ? snapshot.value : {}
}

function storageFileForKey(localData, key, hashKeyMap = {}) {
  const mappedHash = Object.entries(hashKeyMap).find(([, mappedKey]) => mappedKey === key)?.[0]
  const hash = mappedHash || md5Hex(key)
  for (const prefix of ['ls', 'localstorage']) {
    const filePath = path.join(localData, `${prefix}_${hash}.json`)
    if (fs.existsSync(filePath)) {
      return { filePath, name: path.basename(filePath), prefix, hash, key }
    }
  }
  return null
}

function decryptOfficialStorageValue(rawValue, key, iv) {
  const keyHash = crypto.createHash('md5').update(String(key)).digest('hex')
  const ivHash = crypto.createHash('md5').update(String(iv)).digest('hex')
  const decipher = crypto.createDecipheriv(
    'aes-192-cbc',
    Buffer.from(keyHash.slice(0, 24), 'utf8'),
    Buffer.from(ivHash.slice(0, 16), 'utf8')
  )
  return Buffer.concat([
    decipher.update(String(rawValue).trim(), 'hex'),
    decipher.final()
  ]).toString('utf8')
}

function readOfficialPersistentKeyMaterial(localData) {
  const secretPath = path.join(localData, OFFICIAL_STORAGE_SECRET_FILE)
  const snapshot = stableReadJson(secretPath)
  if (!snapshot?.value || snapshot.value.v !== 2 || snapshot.value.method !== 'plain') {
    return null
  }
  let material
  try {
    material = JSON.parse(snapshot.value.data)
  } catch {
    return null
  }
  if (
    typeof material?.k !== 'string' ||
    !material.k ||
    typeof material?.i !== 'string' ||
    !material.i
  ) {
    return null
  }
  return material
}

function readOfficialAggregateUserInfo(profile, descriptor, { allowTourist = false } = {}) {
  if (!descriptor || descriptor.prefix !== 'ls') {
    return null
  }
  const localData = localDataPathForProfile(profile)
  const snapshot = stableReadText(descriptor.filePath)
  if (!snapshot) {
    return null
  }

  // The official bundle has two generations of the same storage format:
  // current profiles persist a plain key envelope, while older profiles
  // derive the key from the machine hostname and home directory. Try both in
  // order. This keeps the bridge compatible with migrated profiles without
  // pretending that a safeStorage-only envelope is readable outside the
  // native runtime.
  const materials = []
  const persistent = readOfficialPersistentKeyMaterial(localData)
  if (persistent) {
    materials.push(persistent)
  }
  materials.push({ k: os.hostname(), i: os.homedir() })

  for (const material of materials) {
    try {
      const value = JSON.parse(decryptOfficialStorageValue(snapshot.text, material.k, material.i))
      if (hasBridgeableAuthRecord(value, { allowTourist })) {
        return value
      }
    } catch {
      // Try the next key generation. A safeStorage-wrapped secret is expected
      // to fail here and will fall through to split/legacy auth readers.
    }
  }
  return null
}

function officialUserInfoRecord(profile) {
  const localData = localDataPathForProfile(profile)
  const descriptor = storageFileForKey(localData, 'userInfo', hashKeyMapForProfile(profile))
  const aggregate = readOfficialAggregateUserInfo(profile, descriptor)
  const split = splitUserInfoRecord(profile)
  const snapshot = descriptor ? stableReadText(descriptor.filePath) : null
  const value = aggregate || split?.value
  if (!descriptor || descriptor.prefix !== 'ls' || !value || !snapshot) {
    return null
  }
  return {
    name: descriptor.name,
    filePath: descriptor.filePath,
    value,
    bytes: snapshot.bytes,
    hash: snapshot.hash,
    storageFormat: 'official_encrypted',
    storageKey: 'userInfo'
  }
}

function readPlainStorageKey(profile, key) {
  const localData = path.join(profileRealpath(profile) || path.resolve(profile), 'WeappLocalData')
  const descriptor = storageFileForKey(localData, key, hashKeyMapForProfile(profile))
  if (!descriptor) {
    return null
  }
  const snapshot = stableReadText(descriptor.filePath)
  if (!snapshot) {
    return null
  }
  try {
    const parsed = JSON.parse(snapshot.text)
    return typeof parsed === 'string' ? parsed.trim() : parsed
  } catch {
    // Nightly DevTools stores some plain local-storage values as raw text
    // instead of JSON (for example SUCCESS and the auth ticket fields). The
    // files commonly end with a newline; keep the value semantics while
    // removing only storage-format whitespace so loginStatus is not misread.
    return snapshot.text.trim()
  }
}

function splitUserInfoRecord(profile) {
  const fieldMap = {
    openid: 'userInfo_openid',
    signature: 'userInfo_signature',
    newticket: 'userInfo_newticket',
    ticketExpiredTime: 'userInfo_ticketExpiredTime',
    signatureExpiredTime: 'userInfo_signatureExpiredTime',
    loginStatus: 'userInfo_loginStatus',
    nickName: 'userInfo_nickName',
    headUrl: 'userInfo_headUrl',
    sex: 'userInfo_sex',
    province: 'userInfo_province',
    city: 'userInfo_city',
    country: 'userInfo_country',
    isTourist: 'userInfo_isTourist'
  }
  const value = {}
  for (const [field, key] of Object.entries(fieldMap)) {
    const item = readPlainStorageKey(profile, key)
    if (item !== null && item !== '') {
      value[field] = item
    }
  }
  if (!value.loginStatus && value.openid && value.signature && value.newticket) {
    value.loginStatus = 'SUCCESS'
  }
  if (!hasAuthRecordShape(value)) {
    return null
  }
  const localData = path.join(profileRealpath(profile) || path.resolve(profile), 'WeappLocalData')
  return {
    name: 'userInfo_*',
    filePath: localData,
    value,
    bytes: Object.values(value).reduce((total, item) => total + Buffer.byteLength(String(item)), 0),
    hash: sha256(JSON.stringify(value)),
    storageFormat: 'split_plain',
    storageKey: 'userInfo'
  }
}

function hasAuthRecordShape(value) {
  if (!isPlainObject(value) || value.loginStatus !== 'SUCCESS') {
    return false
  }
  if (
    ['openid', 'signature', 'newticket'].some(key => typeof value[key] !== 'string' || !value[key])
  ) {
    return false
  }
  return ['ticketExpiredTime', 'signatureExpiredTime'].every(key =>
    Number.isFinite(Number(value[key]))
  )
}

function profileRealpath(profile) {
  const resolved = path.resolve(profile)
  if (!fs.existsSync(resolved)) {
    return null
  }
  return fs.realpathSync(resolved)
}

function assertSeparateProfiles(sourceProfile, targetProfile) {
  const sourceRealpath = profileRealpath(sourceProfile)
  const targetRealpath = profileRealpath(targetProfile)
  if (!sourceRealpath || !targetRealpath || sourceRealpath === targetRealpath) {
    const error = new Error('qa_auth_profiles_not_separate')
    error.code = 'qa_auth_profiles_not_separate'
    throw error
  }
  return { sourceRealpath, targetRealpath }
}

function hasBridgeableAuthRecord(value, { allowTourist = false } = {}) {
  if (!isPlainObject(value)) {
    return false
  }
  if (value.loginStatus !== 'SUCCESS') {
    return false
  }
  if (!allowTourist && value.isTourist === true) {
    return false
  }
  if (
    REQUIRED_AUTH_KEYS.some(
      key =>
        typeof value[key] !== 'string' &&
        key !== 'ticketExpiredTime' &&
        key !== 'signatureExpiredTime'
    )
  ) {
    return false
  }
  const now = Date.now()
  if (
    !Number.isFinite(Number(value.ticketExpiredTime)) ||
    Number(value.ticketExpiredTime) <= now - MAX_EXPIRED_TICKET_AGE_MS
  ) {
    return false
  }
  if (
    !Number.isFinite(Number(value.signatureExpiredTime)) ||
    Number(value.signatureExpiredTime) <= now + 5000
  ) {
    return false
  }
  return true
}

function findDailyAuthRecord(profile) {
  const localData = localDataPathForProfile(profile)
  const descriptor = storageFileForKey(localData, 'userInfo', hashKeyMapForProfile(profile))
  const storedOfficial = readOfficialAggregateUserInfo(profile, descriptor, {
    allowTourist: true
  })
  if (storedOfficial?.isTourist === true) {
    const error = new Error('qa_daily_auth_tourist_login_required')
    error.code = 'qa_daily_auth_tourist_login_required'
    throw error
  }
  const candidates = findAuthRecords(profile)
  if (candidates.length !== 1) {
    const official = officialUserInfoRecord(profile)
    if (candidates.length === 0 && official?.value?.isTourist === true) {
      const error = new Error('qa_daily_auth_tourist_login_required')
      error.code = 'qa_daily_auth_tourist_login_required'
      throw error
    }
    const error = new Error(
      candidates.length === 0 ? 'qa_daily_auth_record_not_found' : 'qa_daily_auth_record_ambiguous'
    )
    error.code =
      candidates.length === 0 ? 'qa_daily_auth_record_not_found' : 'qa_daily_auth_record_ambiguous'
    error.candidates = candidates.map(item => ({
      name: item.name,
      bytes: item.bytes,
      hash: item.hash
    }))
    throw error
  }
  return candidates[0]
}

function findAuthRecords(profile) {
  const localData = path.join(profile, 'WeappLocalData')
  if (!fs.existsSync(localData)) {
    return []
  }
  const candidates = []
  const official = officialUserInfoRecord(profile)
  if (official) {
    candidates.push(official)
  } else {
    const split = splitUserInfoRecord(profile)
    if (split) {
      candidates.push(split)
    }
  }
  for (const name of official
    ? []
    : fs.readdirSync(localData).filter(item => /^localstorage_[a-f0-9]+\.json$/u.test(item))) {
    const filePath = path.join(localData, name)
    const snapshot = stableReadJson(filePath)
    if (!snapshot || !hasBridgeableAuthRecord(snapshot.value)) {
      continue
    }
    candidates.push({
      name,
      filePath,
      ...snapshot,
      value: snapshot.value,
      storageFormat: 'legacy_json',
      storageKey: 'userInfo'
    })
  }
  return candidates
}

export function findUsableAuthRecord(profile) {
  const localData = path.join(profileRealpath(profile) || path.resolve(profile), 'WeappLocalData')
  if (!fs.existsSync(localData)) {
    return null
  }
  const candidates = []
  const official = officialUserInfoRecord(profile)
  if (official) {
    candidates.push(official)
  } else {
    const split = splitUserInfoRecord(profile)
    if (split) {
      candidates.push(split)
    }
  }
  for (const name of official
    ? []
    : fs.readdirSync(localData).filter(item => /^localstorage_[a-f0-9]+\.json$/u.test(item))) {
    const filePath = path.join(localData, name)
    const snapshot = stableReadJson(filePath)
    if (!snapshot || !hasBridgeableAuthRecord(snapshot.value)) {
      continue
    }
    candidates.push({
      name,
      filePath,
      ...snapshot,
      value: snapshot.value,
      storageFormat: 'legacy_json',
      storageKey: 'userInfo'
    })
  }
  const usableCandidates = candidates.filter(item => hasBridgeableAuthRecord(item.value))
  return usableCandidates.length === 1 ? usableCandidates[0] : null
}

function authOnlyRecord(value) {
  return Object.fromEntries(
    AUTH_KEYS.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])
  )
}

function refreshTicketFromOfficialEndpoint(value) {
  const result = spawnSync(
    '/usr/bin/curl',
    [
      '--silent',
      '--show-error',
      '--fail-with-body',
      '--max-time',
      '15',
      '--dump-header',
      '-',
      '--output',
      '-',
      '--write-out',
      '\n__QA_HTTP_STATUS__%{http_code}',
      '-X',
      'POST',
      '-H',
      'content-type: application/json',
      '--data-binary',
      '@-',
      REFRESH_TICKET_URL
    ],
    {
      input: JSON.stringify({ openid: value.openid, signature: value.signature }),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    }
  )
  const output = String(result.stdout || '')
  const statusMatch = output.match(/\n__QA_HTTP_STATUS__(\d{3})\s*$/)
  const status = statusMatch ? Number(statusMatch[1]) : 0
  const responseOutput = statusMatch ? output.slice(0, statusMatch.index) : output
  const separator = responseOutput.lastIndexOf('\r\n\r\n')
  const headerText = separator >= 0 ? responseOutput.slice(0, separator) : ''
  const body = separator >= 0 ? responseOutput.slice(separator + 4) : responseOutput
  const responseHeaders = new Map()
  for (const line of headerText.split(/\r?\n/).slice(1)) {
    const splitIndex = line.indexOf(':')
    if (splitIndex < 0) {
      continue
    }
    responseHeaders.set(
      line.slice(0, splitIndex).trim().toLowerCase(),
      line.slice(splitIndex + 1).trim()
    )
  }
  let parsed
  try {
    parsed = JSON.parse(body.trim())
  } catch {
    parsed = null
  }
  const errcode = Number(parsed?.baseresponse?.errcode ?? -1)
  const newticket = responseHeaders.get('debugger-newticket')
  const lifetimeSeconds = Number(parsed?.ticket_expired_time)
  if (
    result.error ||
    result.status !== 0 ||
    status < 200 ||
    status >= 300 ||
    errcode !== 0 ||
    !newticket ||
    !Number.isFinite(lifetimeSeconds) ||
    lifetimeSeconds <= 0
  ) {
    const error = new Error('qa_auth_ticket_refresh_failed')
    error.code = 'qa_auth_ticket_refresh_failed'
    error.httpStatus = status
    error.errcode = errcode
    throw error
  }
  return {
    ...value,
    newticket,
    ticketExpiredTime: Date.now() + lifetimeSeconds * 1000,
    syncTime: Date.now(),
    loginStatus: 'SUCCESS'
  }
}

function ensureFreshTicket(value, { forceRefresh = false, allowOfficialRefresh = false } = {}) {
  if (!forceRefresh && Number(value.ticketExpiredTime) > Date.now() + 5000) {
    return { value, refreshed: false, refresh_reason: 'ticket_not_near_expiry' }
  }
  if (!allowOfficialRefresh) {
    const error = new Error('qa_daily_auth_ticket_refresh_required')
    error.code = 'qa_daily_auth_ticket_refresh_required'
    error.ticket_expired_at = Number(value.ticketExpiredTime)
    error.refresh_owner = 'daily_devtools'
    throw error
  }
  return {
    value: refreshTicketFromOfficialEndpoint(value),
    refreshed: true,
    refresh_reason: forceRefresh ? 'force_latest_ticket' : 'ticket_near_expiry'
  }
}

function writeJsonAtomically(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, filePath)
    fs.chmodSync(filePath, 0o600)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

function writeTextAtomically(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  try {
    fs.writeFileSync(temporary, String(value), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, filePath)
    fs.chmodSync(filePath, 0o600)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

function localDataPathForProfile(profile) {
  return path.join(profileRealpath(profile) || path.resolve(profile), 'WeappLocalData')
}

function copyOfficialStorageSecret(sourceProfile, targetProfile) {
  const sourcePath = path.join(localDataPathForProfile(sourceProfile), OFFICIAL_STORAGE_SECRET_FILE)
  const snapshot = stableReadText(sourcePath)
  if (!snapshot) {
    const error = new Error('qa_official_storage_secret_not_found')
    error.code = 'qa_official_storage_secret_not_found'
    throw error
  }
  const targetPath = path.join(localDataPathForProfile(targetProfile), OFFICIAL_STORAGE_SECRET_FILE)
  writeTextAtomically(targetPath, snapshot.text)
  return targetPath
}

function copyOfficialEncryptedAuth(source, targetProfile) {
  if (source.storageFormat !== 'official_encrypted' || !source.filePath) {
    const error = new Error('qa_official_encrypted_auth_source_required')
    error.code = 'qa_official_encrypted_auth_source_required'
    throw error
  }
  const snapshot = stableReadText(source.filePath)
  if (!snapshot) {
    const error = new Error('qa_official_encrypted_auth_source_unavailable')
    error.code = 'qa_official_encrypted_auth_source_unavailable'
    throw error
  }
  const targetPath = path.join(
    localDataPathForProfile(targetProfile),
    path.basename(source.filePath)
  )
  writeTextAtomically(targetPath, snapshot.text)
  return targetPath
}

function writeTargetAuthRecord(targetProfile, source, value, sourceProfile = null) {
  const targetLocalData = path.join(targetProfile, 'WeappLocalData')
  const targetHash = md5Hex(source.storageKey || 'userInfo')
  // The current official Electron runtime reads the encrypted aggregate
  // `userInfo` record. A source profile may expose the same account as plain
  // `userInfo_*` fields, but copying that shape alone leaves a fresh QA
  // profile looking logged out to the official project opener.
  const official =
    source.storageFormat === 'official_encrypted' ||
    path.resolve(targetProfile).includes(`${path.sep}.planting${path.sep}qa-devtools-home`)
  const targetPath = path.join(
    targetLocalData,
    `${official ? 'ls' : 'localstorage'}_${targetHash}.json`
  )
  if (official) {
    if (!sourceProfile) {
      const error = new Error('qa_official_storage_source_profile_required')
      error.code = 'qa_official_storage_source_profile_required'
      throw error
    }
    copyOfficialStorageSecret(sourceProfile, targetProfile)
    // Keep the official aggregate opaque. Re-encrypting it here would require
    // persisting or transporting the decrypted storage material. The daily
    // DevTools profile already owns the current encrypted userInfo record;
    // copy that ciphertext and its safeStorage envelope as-is.
    const copiedPath = copyOfficialEncryptedAuth(source, targetProfile)
    if (path.resolve(copiedPath) !== path.resolve(targetPath)) {
      throw new Error('qa_official_encrypted_auth_target_mismatch')
    }
  } else {
    writeJsonAtomically(targetPath, authOnlyRecord(value))
  }
  return {
    path: targetPath,
    format: official ? 'official_encrypted' : 'legacy_json',
    key: source.storageKey || 'userInfo'
  }
}

function ensureTargetHashKeyMap(sourceProfile, targetProfile, authFileName = '') {
  const sourcePath = path.join(
    profileRealpath(sourceProfile) || path.resolve(sourceProfile),
    'WeappLocalData',
    'hash_key_map_2.json'
  )
  const targetRoot = path.join(
    profileRealpath(targetProfile) || path.resolve(targetProfile),
    'WeappLocalData'
  )
  const targetPath = path.join(targetRoot, 'hash_key_map_2.json')
  let existing = {}
  try {
    const parsed = readJson(targetPath)
    if (isPlainObject(parsed)) {
      existing = parsed
    }
  } catch {
    existing = {}
  }
  if (!fs.existsSync(sourcePath)) {
    return {
      status: Object.keys(existing).length ? 'preserved' : 'source_unavailable',
      target_path: targetPath
    }
  }
  const snapshot = stableReadJson(sourcePath)
  if (!snapshot || !isPlainObject(snapshot.value) || !Object.keys(snapshot.value).length) {
    const error = new Error('qa_hash_key_map_unstable')
    error.code = 'qa_hash_key_map_unstable'
    throw error
  }
  const sourceHash = authFileName.match(/^localstorage_([a-f0-9]+)\.json$/)?.[1] || ''
  const sourceKey = sourceHash ? snapshot.value[sourceHash] : null
  const merged =
    sourceKey && existing[sourceHash] !== sourceKey
      ? { ...existing, [sourceHash]: sourceKey }
      : existing
  if (!Object.keys(merged).length || (sourceKey && existing[sourceHash] !== sourceKey)) {
    writeJsonAtomically(targetPath, Object.keys(merged).length ? merged : snapshot.value)
  }
  return {
    status: Object.keys(existing).length
      ? 'source_auth_mapping_merged'
      : 'copied_from_source_profile',
    source_profile: profileRealpath(sourceProfile) || path.resolve(sourceProfile),
    target_path: targetPath,
    source_bytes: snapshot.bytes,
    source_sha256: snapshot.hash
  }
}

export function syncQaAuthFromDailyProfile({
  sourceProfile = DAILY_PROFILE,
  targetProfile = QA_PROFILE,
  sharedAuthRoot = DEFAULT_SHARED_AUTH_ROOT,
  requireFresh = true,
  forceRefresh = false,
  allowOfficialRefresh = false,
  authValue = null
} = {}) {
  const { sourceRealpath, targetRealpath } = assertSeparateProfiles(sourceProfile, targetProfile)
  const source = findDailyAuthRecord(sourceRealpath)
  const effectiveAuthValue = authValue || source.value
  if (requireFresh && !hasBridgeableAuthRecord(effectiveAuthValue)) {
    const error = new Error('qa_daily_auth_record_expired')
    error.code = 'qa_daily_auth_record_expired'
    throw error
  }

  // The normal QA bridge is deliberately one-way. It may copy the ticket
  // already persisted by the daily DevTools, but it must never refresh the
  // shared WeChat account itself. Official refresh is owned exclusively by
  // the broker-managed daily launcher; this legacy bridge cannot opt into it.
  if (allowOfficialRefresh === true) {
    const error = new Error('qa_legacy_auth_bridge_official_refresh_forbidden')
    error.code = 'qa_legacy_auth_bridge_official_refresh_forbidden'
    throw error
  }
  const refreshed = authValue
    ? {
        value: authValue,
        refreshed: false,
        refresh_reason: 'broker_shared_authoritative_material'
      }
    : ensureFreshTicket(source.value, { forceRefresh, allowOfficialRefresh })
  const bridgedValue = refreshed.value
  if (!hasBridgeableAuthRecord(bridgedValue)) {
    const error = new Error('qa_auth_bridge_material_invalid')
    error.code = 'qa_auth_bridge_material_invalid'
    throw error
  }
  if (sha256(source.value.openid) !== sha256(bridgedValue.openid)) {
    const error = new Error('qa_auth_identity_mismatch')
    error.code = 'qa_auth_identity_mismatch'
    throw error
  }
  const hashKeyMap = ensureTargetHashKeyMap(sourceRealpath, targetRealpath, source.name)
  const targetStorage = writeTargetAuthRecord(targetRealpath, source, bridgedValue, sourceRealpath)
  writeJsonAtomically(path.join(sharedAuthRoot, 'default.json'), {
    schemaVersion: 1,
    ...authOnlyRecord(bridgedValue),
    updatedAt: Date.now(),
    writerPid: process.pid,
    ticketState:
      Number(bridgedValue.ticketExpiredTime) > Date.now() + 5000
        ? 'fresh'
        : 'expired_refresh_required'
  })
  return {
    status: 'ready',
    code: 'qa_auth_bridged',
    source_profile: sourceRealpath,
    target_profile: targetRealpath,
    auth_file: source.name,
    target_auth_file: path.basename(targetStorage.path),
    target_auth_format: targetStorage.format,
    source_bytes: source.bytes,
    source_sha256: source.hash,
    bridged_keys: Object.keys(authOnlyRecord(bridgedValue)),
    shared_auth_root: sharedAuthRoot,
    ticket_state:
      Number(bridgedValue.ticketExpiredTime) > Date.now() + 5000
        ? 'fresh'
        : 'expired_refresh_required',
    ticket_expired_at: Number(bridgedValue.ticketExpiredTime),
    ticket_refreshed: refreshed.refreshed,
    ticket_refresh_reason: refreshed.refresh_reason,
    hash_key_map: hashKeyMap
  }
}

export function syncQaAuthFromAvailableProfile() {
  const disabled = new Error(
    'automatic cross-profile auth copying is disabled; establish QA auth through the single-writer coordinator'
  )
  disabled.code = 'qa_legacy_auth_bridge_disabled'
  throw disabled
}

export function prepareQaAuth() {
  return syncQaAuthFromAvailableProfile()
}

export { AUTH_KEYS, DAILY_PROFILE, QA_PROFILE, findDailyAuthRecord, findAuthRecords }

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log(JSON.stringify(prepareQaAuth(), null, 2))
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: 'blocked',
          code: error.code || 'qa_auth_bridge_failed',
          message: error.message,
          candidates: error.candidates || []
        },
        null,
        2
      )
    )
    process.exitCode = 1
  }
}
