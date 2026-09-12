#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  findDailyAuthRecord,
  findUsableAuthRecord,
  syncQaAuthFromDailyProfile
} from './bridge-wechat-devtools-auth.mjs'
import { currentShared, ensureQaAuthBrokerSync, refreshQaAuthSync } from './qa-auth-broker.mjs'
import { SYSTEM_PRODUCT_HASH } from './patch-wechat-devtools-launcher.mjs'

export const QA_AUTH_SCHEMA_VERSION = 1
export const QA_AUTH_ROOT = path.join(os.homedir(), '.planting', 'automator-qa', 'v3', 'auth')
export const QA_AUTH_MANIFEST = path.join(QA_AUTH_ROOT, 'current.json')
export const QA_AUTH_SHARED_STATE = path.join(QA_AUTH_ROOT, 'shared.json')
export const QA_AUTH_WRITER_LOCK = path.join(QA_AUTH_ROOT, 'writer.lock')
export const QA_AUTH_SHARED_COMPAT = path.join(QA_AUTH_ROOT, 'default.json')
export const QA_AUTH_IDENTITY_LOCK = path.join(QA_AUTH_ROOT, 'identity-lock.json')
export const QA_AUTH_SERVER_VALIDATION = path.join(QA_AUTH_ROOT, 'server-validation.json')
const QA_PROFILE_PRODUCT_HASH = SYSTEM_PRODUCT_HASH || '7a30d6576abfa238418b33c3c50ac14e'

const REQUIRED_AUTH_KEYS = ['openid', 'signature', 'newticket']
const MIN_FRESHNESS_MS = 5000
const STALE_WRITER_LOCK_MS = 30_000

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function profileRealpath(profile) {
  const resolved = path.resolve(String(profile || ''))
  if (!fs.existsSync(resolved)) {
    return null
  }
  return fs.realpathSync(resolved)
}

function qaProfileRealpath(profile) {
  const resolved = profileRealpath(profile)
  if (!resolved) {
    return null
  }
  const qaHome = fs.realpathSync(path.join(os.homedir(), '.planting', 'qa-devtools-home'))
  if (resolved !== qaHome && !resolved.startsWith(`${qaHome}${path.sep}`)) {
    const error = new Error('qa_auth_profile_outside_qa_home')
    error.code = 'qa_auth_profile_outside_qa_home'
    throw error
  }
  return resolved
}

export function profileRealpathForAuth(profile, { requireQaHome = false } = {}) {
  const realpath = profileRealpath(profile)
  if (!realpath) {
    return null
  }
  if (requireQaHome) {
    return qaProfileRealpath(realpath)
  }
  return realpath
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readJsonOrNull(filePath) {
  try {
    return readJson(filePath)
  } catch {
    return null
  }
}

function writeJsonAtomically(filePath, value) {
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
    try {
      fs.unlinkSync(temporary)
    } catch {
      // The atomic rename already won.
    }
  }
}

function authServerValidationState() {
  return readJsonOrNull(QA_AUTH_SERVER_VALIDATION)
}

export function recordQaAuthServerValidation({
  status,
  authGeneration,
  identityHash,
  runtimeIdentityHash = null,
  qaPid = null,
  qaProcessStartIdentity = null,
  qaProfile = null,
  reason = null,
  responseCode = null
} = {}) {
  if (!['passed', 'failed'].includes(status)) {
    throw new Error('qa_auth_server_validation_status_invalid')
  }
  const value = {
    schema_version: QA_AUTH_SCHEMA_VERSION,
    status,
    auth_generation: Number(authGeneration) || 0,
    identity_hash: /^[a-f0-9]{64}$/u.test(String(identityHash || '')) ? identityHash : null,
    runtime_identity_hash: /^[a-f0-9]{64}$/u.test(String(runtimeIdentityHash || ''))
      ? runtimeIdentityHash
      : null,
    qa_pid: Number.isInteger(Number(qaPid)) && Number(qaPid) > 0 ? Number(qaPid) : null,
    qa_process_start_identity: qaProcessStartIdentity ? String(qaProcessStartIdentity) : null,
    qa_profile: qaProfile ? path.resolve(String(qaProfile)) : null,
    reason: reason ? String(reason).slice(0, 240) : null,
    response_code: Number.isFinite(Number(responseCode)) ? Number(responseCode) : null,
    validated_at: new Date().toISOString(),
    writer_pid: process.pid
  }
  writeJsonAtomically(QA_AUTH_SERVER_VALIDATION, value)
  return value
}

export function markQaAuthServerFailure({
  authGeneration,
  identityHash,
  runtimeIdentityHash = null,
  reason = 'server_authentication_rejected',
  responseCode = null
} = {}) {
  return recordQaAuthServerValidation({
    status: 'failed',
    authGeneration,
    identityHash,
    runtimeIdentityHash,
    reason,
    responseCode
  })
}

function isUsableAuthRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  if (value.loginStatus !== 'SUCCESS') {
    return false
  }
  if (REQUIRED_AUTH_KEYS.some(key => typeof value[key] !== 'string' || !value[key])) {
    return false
  }
  return (
    Number(value.signatureExpiredTime) > Date.now() + MIN_FRESHNESS_MS &&
    Number(value.ticketExpiredTime) > Date.now() + MIN_FRESHNESS_MS
  )
}

function isAuthMaterialRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  if (value.loginStatus !== 'SUCCESS') {
    return false
  }
  if (
    ['openid', 'signature', 'newticket'].some(
      key => typeof value[key] !== 'string' || !value[key]
    )
  ) {
    return false
  }
  return ['ticketExpiredTime', 'signatureExpiredTime'].every(key =>
    Number.isFinite(Number(value[key]))
  )
}

function findProfileAuthRecord(profile, { requireQaHome = true } = {}) {
  const realpath = profileRealpathForAuth(profile, { requireQaHome })
  if (!realpath) {
    return null
  }
  const source = findUsableAuthRecord(realpath)
  // `findUsableAuthRecord` deliberately keeps a short stale-ticket window so
  // an encrypted official profile can still prove the same login material
  // after the broker has refreshed the ticket. The profile ciphertext cannot
  // be re-encrypted outside DevTools, so freshness belongs to the shared
  // broker/manifest check below, not to this material-presence check.
  if (!source || !isAuthMaterialRecord(source.value)) {
    return null
  }
  return {
    ...source,
    profile_realpath: realpath,
    identity_hash: sha256(source.value.openid),
    ticket_expired_at: Number(source.value.ticketExpiredTime),
    signature_expired_at: Number(source.value.signatureExpiredTime),
    record_sha256: source.hash,
    record_bytes: source.bytes
  }
}

export function findQaProfileAuthRecord(profile) {
  return findProfileAuthRecord(profile, { requireQaHome: true })
}

function readProfileAuthValue(record) {
  if (record?.value && isUsableAuthRecord(record.value)) {
    return record.value
  }
  try {
    const value = readJson(record.filePath)
    return isUsableAuthRecord(value) ? value : null
  } catch {
    return null
  }
}

function defaultProfiles() {
  const daily = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    '微信开发者工具',
    // DevTools 2.02.2609012 derives this directory from the installed app
    // path. Keep the retired hash only for older installations.
    SYSTEM_PRODUCT_HASH || '50a7d9210159a32f006158795f893857'
  )
  const qa = path.join(
    os.homedir(),
    '.planting',
    'qa-devtools-home',
    'Library',
    'Application Support',
    '微信开发者工具',
    SYSTEM_PRODUCT_HASH || QA_PROFILE_PRODUCT_HASH
  )
  return { daily, qa }
}

export function qaAuthProfiles() {
  return defaultProfiles()
}

function isTouristIdentityPlaceholder(previous, incoming) {
  return Boolean(previous?.isTourist === true && incoming?.isTourist !== true)
}

function assertIdentityPinned(identityHash, incoming = null) {
  const existing = readJsonOrNull(QA_AUTH_IDENTITY_LOCK)
  if (existing?.identity_hash && existing.identity_hash !== identityHash) {
    const previous = readJsonOrNull(QA_AUTH_SHARED_STATE)
    const canReplacePlaceholder =
      isTouristIdentityPlaceholder(previous, incoming) &&
      previous.identityHash === existing.identity_hash
    if (!canReplacePlaceholder) {
      const error = new Error('qa_auth_identity_mismatch')
      error.code = 'qa_auth_identity_mismatch'
      error.expected_identity_hash = existing.identity_hash
      error.observed_identity_hash = identityHash
      throw error
    }
    writeJsonAtomically(QA_AUTH_IDENTITY_LOCK, {
      schema_version: QA_AUTH_SCHEMA_VERSION,
      identity_hash: identityHash,
      pinned_at: new Date().toISOString(),
      pinned_by_pid: process.pid,
      replaced_tourist_placeholder: true
    })
    return
  }
  if (existing) {
    return
  }
  const temporary = `${QA_AUTH_IDENTITY_LOCK}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(
      temporary,
      `${JSON.stringify(
        {
          schema_version: QA_AUTH_SCHEMA_VERSION,
          identity_hash: identityHash,
          pinned_at: new Date().toISOString(),
          pinned_by_pid: process.pid
        },
        null,
        2
      )}\n`,
      { encoding: 'utf8', mode: 0o600 }
    )
    try {
      fs.renameSync(temporary, QA_AUTH_IDENTITY_LOCK)
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error
      }
    }
  } finally {
    try {
      fs.unlinkSync(temporary)
    } catch {
      // The atomic rename already won or another writer created the lock.
    }
  }
  const pinned = readJsonOrNull(QA_AUTH_IDENTITY_LOCK)
  if (pinned?.identity_hash && pinned.identity_hash !== identityHash) {
    const error = new Error('qa_auth_identity_mismatch')
    error.code = 'qa_auth_identity_mismatch'
    error.expected_identity_hash = pinned.identity_hash
    error.observed_identity_hash = identityHash
    throw error
  }
}

function writeSharedAuth(value, sourceRole, sourceRecord) {
  if (sourceRole !== 'qa') {
    const error = new Error('qa_auth_legacy_source_role_forbidden')
    error.code = 'qa_auth_legacy_source_role_forbidden'
    error.source_role = sourceRole || null
    throw error
  }
  const identityHash = sha256(value.openid)
  fs.mkdirSync(QA_AUTH_ROOT, { recursive: true, mode: 0o700 })
  assertIdentityPinned(identityHash, value)
  const previous = readJsonOrNull(QA_AUTH_MANIFEST)
  const previousShared = readJsonOrNull(QA_AUTH_SHARED_STATE)
  if (
    previousShared?.identityHash === identityHash &&
    previousShared?.newticket === value.newticket &&
    previousShared?.signature === value.signature &&
    Number(previousShared?.ticketExpiredTime) === Number(value.ticketExpiredTime) &&
    Number(previousShared?.signatureExpiredTime) === Number(value.signatureExpiredTime) &&
    previousShared?.writerRole === 'qa-auth-broker'
  ) {
    return {
      status: 'ready',
      code: 'qa_auth_shared_state_unchanged',
      unchanged: true,
      manifest: previous
    }
  }
  if (
    previous?.identity_hash === identityHash &&
    previous?.source_role === sourceRole &&
    previous?.source_record_sha256 === sourceRecord.record_sha256 &&
    Number(previous?.ticket_expired_at) === Number(value.ticketExpiredTime) &&
    Number(previous?.signature_expired_at) === Number(value.signatureExpiredTime) &&
    previousShared?.identityHash === identityHash &&
    previousShared?.sourceRecordSha256 === sourceRecord.record_sha256 &&
    previousShared?.writerRole === 'qa-auth-broker'
  ) {
    return {
      status: 'ready',
      code: 'qa_auth_shared_state_unchanged',
      unchanged: true,
      manifest: previous
    }
  }
  const generation = Number(previous?.auth_generation || 0) + 1
  const previousServerValidation = authServerValidationState()
  const sharedValue = {
    schemaVersion: QA_AUTH_SCHEMA_VERSION,
    loginStatus: 'SUCCESS',
    openid: value.openid,
    signature: value.signature,
    newticket: value.newticket,
    nickName: value.nickName,
    headUrl: value.headUrl,
    ticketExpiredTime: Number(value.ticketExpiredTime),
    signatureExpiredTime: Number(value.signatureExpiredTime),
    sex: value.sex,
    province: value.province,
    city: value.city,
    country: value.country,
    isTourist: value.isTourist === true,
    authGeneration: generation,
    identityHash: identityHash,
    sourceRole,
    sourceRecordSha256: sourceRecord.record_sha256,
    updatedAt: Date.now(),
    writerRole: 'qa-auth-broker',
    writerPid: process.pid
  }
  for (const target of [QA_AUTH_SHARED_STATE, QA_AUTH_SHARED_COMPAT]) {
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(sharedValue, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temporary, target)
  }
  const manifest = {
    schema_version: QA_AUTH_SCHEMA_VERSION,
    profile_realpath: qaProfileRealpath(defaultProfiles().qa),
    identity_hash: identityHash,
    auth_generation: generation,
    ticket_expired_at: Number(value.ticketExpiredTime),
    signature_expired_at: Number(value.signatureExpiredTime),
    source_role: sharedValue.sourceRole,
    source_record_sha256: sourceRecord.record_sha256,
    shared_state_path: QA_AUTH_SHARED_STATE,
    writer_pid: process.pid,
    adopted_at: new Date().toISOString()
  }
  const temporary = `${QA_AUTH_MANIFEST}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, QA_AUTH_MANIFEST)
  const sameQaIdentity = Boolean(
    previous?.identity_hash === identityHash &&
      previous?.profile_realpath === manifest.profile_realpath &&
      previousServerValidation?.status === 'passed' &&
      previousServerValidation.identity_hash === identityHash &&
      /^[a-f0-9]{64}$/u.test(String(previousServerValidation.runtime_identity_hash || ''))
  )
  if (sameQaIdentity) {
    // 认证 generation 代表票据轮换，不代表业务账号变化。保留之前由
    // 真实小程序 wx.request 建立的“手机号业务身份 -> 当前 QA profile”
    // 映射，并把 generation 迁移到新票据；本轮目标接口仍必须用当前票据
    // 重新收到 200 和业务码，不能靠这条连续性记录宣称接口通过。
    writeJsonAtomically(QA_AUTH_SERVER_VALIDATION, {
      ...previousServerValidation,
      auth_generation: generation,
      qa_profile: manifest.profile_realpath,
      source_generation: Number(previousServerValidation.auth_generation) || null,
      validation_basis: 'same_qa_identity_after_ticket_rotation',
      carried_at: new Date().toISOString(),
      writer_pid: process.pid
    })
  } else {
    fs.rmSync(QA_AUTH_SERVER_VALIDATION, { force: true })
  }
  return { status: 'ready', code: 'qa_auth_shared_state_ready', manifest }
}

export function syncSharedAuthFromAvailableProfiles({ profiles = defaultProfiles() } = {}) {
  // This legacy selector could silently choose whichever profile happened to
  // contain the newest ticket. That makes the source of the shared account
  // state unknowable and can rotate the ticket behind a live daily session.
  // Keep the export for callers that still import it, but make the unsafe path
  // an explicit terminal failure until it is removed from all consumers.
  const error = new Error('qa_auth_legacy_profile_scan_forbidden')
  error.code = 'qa_auth_legacy_profile_scan_forbidden'
  error.profiles = Object.fromEntries(
    Object.entries(profiles || {}).map(([role, profile]) => [
      role,
      path.resolve(String(profile || ''))
    ])
  )
  throw error
}

/**
 * Normal QA startup must never select authentication material from the daily
 * DevTools profile. The multi-profile selector remains available only for an
 * explicit migration/enrollment command.
 */
function officialEncryptedAuthRecord(profile, value) {
  const realpath = qaProfileRealpath(profile)
  const filePath = path.join(
    realpath,
    'WeappLocalData',
    `ls_${crypto.createHash('md5').update('userInfo').digest('hex')}.json`
  )
  if (!fs.existsSync(filePath) || !isUsableAuthRecord(value)) {
    return null
  }
  const content = fs.readFileSync(filePath)
  return {
    name: path.basename(filePath),
    filePath,
    value,
    bytes: content.length,
    hash: sha256(content),
    storageFormat: 'official_encrypted',
    storageKey: 'userInfo',
    profile_realpath: realpath,
    identity_hash: sha256(value.openid),
    ticket_expired_at: Number(value.ticketExpiredTime),
    signature_expired_at: Number(value.signatureExpiredTime),
    record_sha256: sha256(content),
    record_bytes: content.length
  }
}

function syncQaAuthFromProfileUnsafe({ profile, fallbackAuthValue = null } = {}) {
  const realpath = qaProfileRealpath(profile)
  if (!realpath) {
    const error = new Error('qa_devtools_auth_required')
    error.code = 'qa_devtools_auth_required'
    throw error
  }
  const record =
    findProfileAuthRecord(realpath, { requireQaHome: true }) ||
    officialEncryptedAuthRecord(realpath, fallbackAuthValue)
  const value =
    (record ? readProfileAuthValue(record) : null) ||
    (record?.storageFormat === 'official_encrypted' && isUsableAuthRecord(fallbackAuthValue)
      ? fallbackAuthValue
      : null)
  if (!record || !value) {
    const error = new Error('qa_devtools_auth_required')
    error.code = 'qa_devtools_auth_required'
    throw error
  }
  return writeSharedAuth(value, 'qa', record)
}

export function syncQaAuthFromProfile({ profile, fallbackAuthValue = null } = {}) {
  const lease = acquireQaAuthWriterLease()
  try {
    return syncQaAuthFromProfileUnsafe({ profile, fallbackAuthValue })
  } finally {
    lease.release()
  }
}

/**
 * Read the daily DevTools auth record without opening or mutating the daily
 * profile, seed only the QA profile, and then let the v3 coordinator validate
 * and publish the QA-scoped manifest. This is the one-way same-WeChat-account
 * bridge; it is never used to write back into the daily profile.
 */
export function syncQaAuthFromDailyReadOnly({
  dailyProfile = defaultProfiles().daily,
  qaProfile = defaultProfiles().qa
} = {}) {
  const lease = acquireQaAuthWriterLease()
  try {
    const identityLock = readJsonOrNull(QA_AUTH_IDENTITY_LOCK)
    const dailyRecord = findDailyAuthRecord(dailyProfile)
    const dailyProfileRealpath = profileRealpath(dailyProfile)
    if (!dailyProfileRealpath) {
      const error = new Error('qa_daily_auth_profile_missing')
      error.code = 'qa_daily_auth_profile_missing'
      throw error
    }
    const dailyIdentityHash = dailyRecord ? sha256(dailyRecord.value.openid) : null
    if (
      identityLock?.identity_hash &&
      dailyIdentityHash &&
      identityLock.identity_hash !== dailyIdentityHash
    ) {
      const error = new Error('qa_auth_identity_mismatch')
      error.code = 'qa_auth_identity_mismatch'
      error.expected_identity_hash = identityLock.identity_hash
      error.observed_identity_hash = dailyIdentityHash
      throw error
    }
    const shared = currentShared()
    const sharedIdentityHash = shared?.openid ? sha256(shared.openid) : null
    if (
      shared &&
      identityLock?.identity_hash &&
      sharedIdentityHash &&
      identityLock.identity_hash !== sharedIdentityHash
    ) {
      const error = new Error('qa_auth_identity_mismatch')
      error.code = 'qa_auth_identity_mismatch'
      error.expected_identity_hash = identityLock.identity_hash
      error.observed_identity_hash = sharedIdentityHash
      throw error
    }
    const brokerSharedAuth =
      shared &&
      shared.writerRole === 'qa-auth-broker' &&
      sharedIdentityHash &&
      sharedIdentityHash === shared.identityHash &&
      Number(shared.authGeneration) > 0 &&
      Number(shared.ticketExpiredTime) > Date.now() + MIN_FRESHNESS_MS &&
      Number(shared.signatureExpiredTime) > Date.now() + MIN_FRESHNESS_MS
        ? shared
        : null
    const existingQaRecord = findQaProfileAuthRecord(qaProfile)
    const existingQaValue = existingQaRecord ? readJsonOrNull(existingQaRecord.filePath) : null
    const sharedTicketIsNewer = Boolean(
      brokerSharedAuth &&
      (!existingQaValue ||
        sha256(String(brokerSharedAuth.newticket)) !== sha256(String(existingQaValue.newticket)))
    )
    let bridge
    let bridgeSource = 'daily_profile'
    try {
      bridge = syncQaAuthFromDailyProfile({
        sourceProfile: dailyProfile,
        targetProfile: qaProfile,
        sharedAuthRoot: QA_AUTH_ROOT,
        requireFresh: true,
        forceRefresh: false,
        allowOfficialRefresh: false,
        authValue: sharedTicketIsNewer ? brokerSharedAuth : null
      })
      if (sharedTicketIsNewer) {
        bridgeSource = 'broker_shared_authoritative'
      }
    } catch (error) {
      if (error?.code !== 'qa_daily_auth_ticket_refresh_required' || !brokerSharedAuth) {
        throw error
      }
      bridge = syncQaAuthFromDailyProfile({
        sourceProfile: dailyProfile,
        targetProfile: qaProfile,
        sharedAuthRoot: QA_AUTH_ROOT,
        requireFresh: true,
        forceRefresh: false,
        allowOfficialRefresh: false,
        authValue: brokerSharedAuth
      })
      bridgeSource = 'broker_shared_authoritative'
    }
    const adopted = syncQaAuthFromProfileUnsafe({
      profile: qaProfile,
      fallbackAuthValue: brokerSharedAuth || dailyRecord.value
    })
    const published = readJsonOrNull(QA_AUTH_MANIFEST)
    if (published) {
      writeJsonAtomically(QA_AUTH_MANIFEST, {
        ...published,
        source_daily_record_sha256: dailyRecord.hash,
        source_daily_profile_realpath: dailyProfileRealpath,
        source_daily_ticket_expired_at: Number(dailyRecord.value.ticketExpiredTime),
        source_daily_signature_expired_at: Number(dailyRecord.value.signatureExpiredTime)
      })
    }
    return {
      ...adopted,
      code:
        bridgeSource === 'broker_shared_authoritative'
          ? 'qa_auth_bridged_from_broker_shared'
          : 'qa_auth_bridged_from_daily_read_only',
      bridge: {
        status: bridge.status,
        source: bridgeSource,
        source_profile: bridge.source_profile,
        target_profile: bridge.target_profile,
        auth_file: bridge.auth_file,
        source_sha256: bridge.source_sha256,
        ticket_state: bridge.ticket_state,
        ticket_refreshed: bridge.ticket_refreshed,
        hash_key_map: bridge.hash_key_map
      }
    }
  } finally {
    lease.release()
  }
}

export function ensureQaAuthAvailable({
  qaProfile = defaultProfiles().qa,
  dailyProfile = defaultProfiles().daily
} = {}) {
  const canonical = defaultProfiles()
  if (
    path.resolve(qaProfile) !== path.resolve(canonical.qa) ||
    path.resolve(dailyProfile) !== path.resolve(canonical.daily)
  ) {
    const error = new Error('qa_auth_profile_override_forbidden')
    error.code = 'qa_auth_profile_override_forbidden'
    error.expected = canonical
    error.observed = { qa: path.resolve(qaProfile), daily: path.resolve(dailyProfile) }
    throw error
  }
  let broker = null
  let brokerError = null
  try {
    broker = ensureQaAuthBrokerSync({ sync: true })
    const state = readQaAuthManifest()
    const expectedQaProfile = profileRealpathForAuth(qaProfile, { requireQaHome: true })
    if (
      state.material_ready &&
      state.value?.profile_realpath === expectedQaProfile &&
      state.code !== 'qa_auth_server_invalidated'
    ) {
      return {
        status: 'ready',
        code: 'qa_auth_broker_ready',
        manifest: state.value,
        broker
      }
    }
    const qaProfileMaterialNeedsReseed =
      state.value?.profile_realpath === expectedQaProfile && !state.material_ready
    if (
      qaProfileMaterialNeedsReseed ||
      (state.material_ready && state.value?.profile_realpath !== expectedQaProfile)
    ) {
      // A DevTools upgrade can change the product-hash profile directory.
      // Re-seed only the QA-owned new profile through the existing broker; the
      // daily profile remains read-only and no credential is copied outside
      // the normal one-way auth bridge.
      try {
        const migrated = syncQaAuthFromDailyReadOnly({
          dailyProfile,
          qaProfile
        })
        const migratedState = readQaAuthManifest()
        if (migratedState.material_ready) {
          return {
            status: 'ready',
            code: 'qa_auth_profile_migrated_for_official_bundle',
            manifest: migratedState.value,
            broker,
            migration: migrated
          }
        }
        // The source profile may still contain a ticket that expired while
        // the QA profile was being reseeded. Do not report migration success
        // in that case; continue below so the broker can refresh the same
        // identity instead of letting automator fail with a vague manifest
        // error on its next preflight.
        brokerError = Object.assign(
          new Error(migratedState.code || 'qa_auth_profile_migration_not_ready'),
          { code: migratedState.code || 'qa_auth_profile_migration_not_ready' }
        )
      } catch (error) {
        brokerError = error
      }
    }
    // When no daily DevTools process is active, QA is the only remaining
    // session and may safely rotate the server ticket through the broker. This
    // is the close-and-reopen path that preserves one-time QR enrollment.
    if (!broker?.daily_process?.active) {
      const shared = readJsonOrNull(QA_AUTH_SHARED_STATE)
      const identityHash =
        state.value?.identity_hash || readJsonOrNull(QA_AUTH_IDENTITY_LOCK)?.identity_hash
      if (
        shared?.openid &&
        shared?.signature &&
        shared?.newticket &&
        shared?.identityHash === identityHash
      ) {
        try {
          refreshQaAuthSync(shared, 'qa', true)
          const refreshed = readQaAuthManifest()
          if (refreshed.material_ready) {
            return {
              status: 'ready',
              code: 'qa_auth_broker_refreshed_when_daily_closed',
              manifest: refreshed.value,
              broker
            }
          }
        } catch (error) {
          brokerError = error
        }
      }
    }
    brokerError ||= Object.assign(new Error(state.code), { code: state.code })
  } catch (error) {
    brokerError = error
  }
  if (!broker) {
    try {
      // `/sync` is intentionally allowed to fail for a native daily process
      // with an expired local ticket. Health is still needed to distinguish
      // that safe block from the closed-daily refresh path.
      broker = ensureQaAuthBrokerSync({ sync: false })
    } catch (error) {
      brokerError ||= error
    }
  }
  // `ensure --sync` can legitimately return qa_daily_auth_record_not_found
  // after the daily DevTools has been closed. In that case the broker is
  // healthy, and its retained same-identity ticket is still allowed to use
  // the official refresh endpoint. Without this second chance, a normal
  // ticket expiry was incorrectly converted into a QR-login requirement.
  if (broker && !broker.daily_process?.active) {
    const state = readQaAuthManifest()
    if (!state.material_ready) {
      const shared = readJsonOrNull(QA_AUTH_SHARED_STATE)
      const identityHash =
        state.value?.identity_hash || readJsonOrNull(QA_AUTH_IDENTITY_LOCK)?.identity_hash
      if (
        shared?.openid &&
        shared?.signature &&
        shared?.newticket &&
        shared?.identityHash === identityHash
      ) {
        try {
          refreshQaAuthSync(shared, 'qa', true)
          const refreshed = readQaAuthManifest()
          if (refreshed.material_ready) {
            return {
              status: 'ready',
              code: 'qa_auth_broker_refreshed_when_daily_closed',
              manifest: refreshed.value,
              broker
            }
          }
        } catch (error) {
          brokerError ||= error
        }
      }
    }
  }
  if (
    brokerError?.code === 'qa_auth_broker_daily_unmanaged_process_conflict' ||
    brokerError?.code === 'qa_auth_broker_daily_observed_ticket_unavailable'
  ) {
    const error = new Error(
      brokerError.code === 'qa_auth_broker_daily_observed_ticket_unavailable'
        ? 'QA 日常 DevTools 当前没有可验证的新鲜票据，不能用旧共享状态冒充同号在线'
        : 'QA 日常 DevTools 当前不是受控启动，不能让 QA 复用可能正在变化的登录状态'
    )
    error.code = brokerError.code
    error.daily_bridge = 'broker_only'
    throw error
  }
  // When the daily DevTools is closed, the broker intentionally keeps the
  // last single-writer generation. A failed server validation invalidates the
  // proof, but not the persisted material: the isolated QA runtime must be
  // allowed to start so it can revalidate through the real app entry. Only
  // missing or structurally invalid material is a hard pre-start block.
  const state = readQaAuthManifest()
  if (state.material_ready) {
    const revalidationPending = state.code === 'qa_auth_server_invalidated'
    return {
      status: 'ready',
      code: revalidationPending
        ? 'qa_auth_broker_revalidation_pending'
        : 'qa_auth_broker_persisted_state',
      manifest: state.value,
      broker_error: brokerError?.code || null,
      server_revalidation_required: revalidationPending
    }
  }
  const error = new Error('QA auth broker 尚未取得可用的单写入认证状态')
  error.code = brokerError?.code || state.code || 'qa_devtools_auth_required'
  error.profile_error_code = state.code || null
  error.daily_bridge = 'broker_only'
  throw error
}

export function readQaAuthManifest() {
  try {
    const value = readJson(QA_AUTH_MANIFEST)
    const profile = profileRealpath(value.profile_realpath)
    const profileRecord = profile ? findProfileAuthRecord(profile, { requireQaHome: true }) : null
    const ticketExpiredAt = Number(value.ticket_expired_at)
    const signatureExpiredAt = Number(value.signature_expired_at)
    const generation = Number(value.auth_generation)
    const shared = readJson(QA_AUTH_SHARED_STATE)
    const identityLock = readJsonOrNull(QA_AUTH_IDENTITY_LOCK)
    const serverValidation = authServerValidationState()
    const valid =
      value.schema_version === QA_AUTH_SCHEMA_VERSION &&
      profile &&
      value.profile_realpath === profile &&
      typeof value.identity_hash === 'string' &&
      /^[a-f0-9]{64}$/u.test(value.identity_hash) &&
      Number.isInteger(generation) &&
      generation > 0 &&
      ticketExpiredAt > Date.now() + MIN_FRESHNESS_MS &&
      signatureExpiredAt > Date.now() + MIN_FRESHNESS_MS &&
      shared?.authGeneration === generation &&
      shared?.identityHash === value.identity_hash &&
      Number(shared?.ticketExpiredTime) === ticketExpiredAt &&
      Number(shared?.signatureExpiredTime) === signatureExpiredAt &&
      shared?.sourceRecordSha256 === value.source_record_sha256 &&
      value.source_role === 'qa' &&
      identityLock?.identity_hash === value.identity_hash &&
      profileRecord?.value?.isTourist !== true &&
      profileRecord?.identity_hash === value.identity_hash
    const invalidReasons = []
    if (value.schema_version !== QA_AUTH_SCHEMA_VERSION) {
      invalidReasons.push('schema_version_invalid')
    }
    if (!profile || value.profile_realpath !== profile) {
      invalidReasons.push('profile_invalid')
    }
    if (!(ticketExpiredAt > Date.now() + MIN_FRESHNESS_MS)) {
      invalidReasons.push('ticket_expired')
    }
    if (!(signatureExpiredAt > Date.now() + MIN_FRESHNESS_MS)) {
      invalidReasons.push('signature_expired')
    }
    if (value.source_role !== 'qa') {
      invalidReasons.push('source_role_invalid')
    }
    if (shared?.authGeneration !== generation || shared?.identityHash !== value.identity_hash) {
      invalidReasons.push('shared_state_mismatch')
    }
    if (!profileRecord || profileRecord.value?.isTourist === true) {
      invalidReasons.push('profile_auth_material_missing_or_tourist')
    } else if (profileRecord.identity_hash !== value.identity_hash) {
      invalidReasons.push('profile_auth_identity_mismatch')
    }
    const serverValidated = Boolean(
      valid &&
      serverValidation?.status === 'passed' &&
      Number(serverValidation.auth_generation) === generation &&
      serverValidation.identity_hash === value.identity_hash
    )
    const serverInvalidated = Boolean(
      valid &&
      serverValidation?.status === 'failed' &&
      Number(serverValidation.auth_generation) === generation &&
      serverValidation.identity_hash === value.identity_hash
    )
    return {
      ready: Boolean(valid && !serverInvalidated),
      material_ready: Boolean(valid),
      server_validated: serverValidated,
      runtime_ready: Boolean(serverValidated),
      code: !valid
        ? 'qa_auth_manifest_invalid'
        : serverInvalidated
          ? 'qa_auth_server_invalidated'
          : serverValidated
            ? 'qa_auth_ready'
            : 'qa_auth_server_validation_required',
      reason: !valid ? invalidReasons[0] || 'manifest_fields_invalid' : null,
      value,
      server_validation: serverValidation
    }
  } catch (error) {
    return {
      ready: false,
      code: error?.code === 'ENOENT' ? 'qa_devtools_auth_required' : 'qa_auth_manifest_unreadable',
      value: null
    }
  }
}

export function assertQaAuthReady({ profile } = {}) {
  const expected = qaProfileRealpath(profile)
  const state = readQaAuthManifest()
  if (!state.ready || state.value.profile_realpath !== expected) {
    const error = new Error(state.code)
    error.code = state.code
    error.auth = state.value
    throw error
  }
  return state.value
}

/**
 * Validate only the persisted material needed to open the isolated QA
 * DevTools profile. Server validation is deliberately excluded: when that
 * proof is stale, the caller must open the real app entry and revalidate it
 * before any authenticated runtime assertion is accepted.
 */
export function assertQaAuthMaterialReady({ profile } = {}) {
  const expected = qaProfileRealpath(profile)
  const state = readQaAuthManifest()
  if (!state.material_ready || state.value?.profile_realpath !== expected) {
    const error = new Error(state.code)
    error.code = state.code
    error.auth = state.value
    throw error
  }
  return state.value
}

export function assertQaRuntimeAuthReady({ profile } = {}) {
  const expected = qaProfileRealpath(profile)
  const state = readQaAuthManifest()
  if (!state.runtime_ready || state.value?.profile_realpath !== expected) {
    const error = new Error(state.code)
    error.code = state.code
    error.auth = state.value
    error.server_validation = state.server_validation || null
    throw error
  }
  return state.value
}

export function adoptQaProfileAuth({ profile } = {}) {
  return syncQaAuthFromProfile({ profile })
}

export function acquireQaAuthWriterLease({ timeoutMs = 5000 } = {}) {
  fs.mkdirSync(QA_AUTH_ROOT, { recursive: true, mode: 0o700 })
  const deadline = Date.now() + timeoutMs
  const record = {
    schema_version: QA_AUTH_SCHEMA_VERSION,
    pid: process.pid,
    acquired_at: new Date().toISOString()
  }
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(QA_AUTH_WRITER_LOCK, 'wx', 0o600)
      fs.writeFileSync(fd, `${JSON.stringify(record)}\n`)
      fs.closeSync(fd)
      return {
        status: 'acquired',
        lock_path: QA_AUTH_WRITER_LOCK,
        release() {
          try {
            const current = readJson(QA_AUTH_WRITER_LOCK)
            if (Number(current?.pid) === process.pid) {
              fs.unlinkSync(QA_AUTH_WRITER_LOCK)
            }
          } catch {
            // The owner may already have released the lease.
          }
        }
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error
      }
      let stale = false
      try {
        const current = readJson(QA_AUTH_WRITER_LOCK)
        const age = Date.now() - fs.statSync(QA_AUTH_WRITER_LOCK).mtimeMs
        if (age > STALE_WRITER_LOCK_MS) {
          try {
            process.kill(Number(current?.pid), 0)
          } catch (probeError) {
            stale = probeError?.code === 'ESRCH'
          }
        }
      } catch {
        try {
          stale = Date.now() - fs.statSync(QA_AUTH_WRITER_LOCK).mtimeMs > STALE_WRITER_LOCK_MS
        } catch {
          stale = false
        }
      }
      if (stale) {
        try {
          fs.unlinkSync(QA_AUTH_WRITER_LOCK)
          continue
        } catch {
          // Another writer may have released or replaced the lock.
        }
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  }
  const error = new Error('qa_auth_writer_lease_timeout')
  error.code = 'qa_auth_writer_lease_timeout'
  throw error
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const profile = path.join(
      os.homedir(),
      '.planting',
      'qa-devtools-home',
      'Library',
      'Application Support',
      '微信开发者工具',
      QA_PROFILE_PRODUCT_HASH
    )
    const result = process.argv.includes('--adopt')
      ? adoptQaProfileAuth({ profile })
      : { status: 'ready', code: 'qa_auth_status', auth: readQaAuthManifest() }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ status: 'blocked', code: error.code || 'qa_auth_coordinator_failed', message: error.message }, null, 2)}\n`
    )
    process.exitCode = 1
  }
}
