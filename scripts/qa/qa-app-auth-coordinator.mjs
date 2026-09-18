/* oxlint-disable no-magic-numbers -- DevTools storage and Java hash contracts use fixed values. */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const STORAGE_RELATIVE_PATH = path.join('WeappSimulator', 'WeappStorage')
const MIN_SESSION_FRESHNESS_MS = 5000
const STORAGE_FILE_PATTERN = /^storage_(\d+)(_.*)?\.json$/u
const QA_RUNTIME_ROOT = path.join(os.homedir(), '.planting', 'automator-qa', 'v3', 'runtimes')
const QA_PROFILE_ROOT = path.join(os.homedir(), '.planting', 'qa-devtools-home')

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function fail(code, message, details = {}) {
  const error = new Error(message || code)
  error.code = code
  error.details = details
  return error
}

function decodeStorageValue(value) {
  const raw =
    value && typeof value === 'object' && Object.hasOwn(value, 'data') ? value.data : value
  if (typeof raw !== 'string') {
    return raw && typeof raw === 'object' ? raw : null
  }
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function assertDistinctProfiles(dailyProfile, qaProfile, qaProfileRoot) {
  const daily = fs.realpathSync(path.resolve(dailyProfile))
  const qa = fs.realpathSync(path.resolve(qaProfile))
  if (
    daily === qa ||
    qa.startsWith(`${daily}${path.sep}`) ||
    daily.startsWith(`${qa}${path.sep}`)
  ) {
    throw fail('qa_app_auth_profile_not_isolated', '日常和 QA DevTools profile 不能相互包含')
  }
  const allowedRoot = fs.realpathSync(path.resolve(qaProfileRoot))
  if (qa !== allowedRoot && !qa.startsWith(`${allowedRoot}${path.sep}`)) {
    throw fail('qa_app_auth_target_profile_forbidden', '小程序会话只允许写入 QA 专用 profile')
  }
  return { daily, qa }
}

function assertProjectPaths(sourceProjectPath, targetProjectPath, qaRuntimeRoot) {
  const source = path.resolve(String(sourceProjectPath || ''))
  const target = path.resolve(String(targetProjectPath || ''))
  const runtimeRoot = path.resolve(qaRuntimeRoot)
  if (!source || !target || source === target) {
    throw fail('qa_app_auth_project_path_invalid', '日常和 QA 项目路径必须不同')
  }
  if (target !== runtimeRoot && !target.startsWith(`${runtimeRoot}${path.sep}`)) {
    throw fail('qa_app_auth_target_project_forbidden', '小程序会话只允许写入 QA runtime 项目')
  }
  return { source, target }
}

/** Java String.hashCode, used by WeChat DevTools for project storage names. */
export function javaStringHash(value) {
  let hash = 0
  const text = String(value)
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash, 31) + text.charCodeAt(index)
    hash |= 0
  }
  return hash
}

export function projectStorageId(projectPath) {
  const signed = javaStringHash(path.resolve(String(projectPath || '')))
  return String(Math.abs(signed))
}

function storageDirectory(profile) {
  return path.join(profile, STORAGE_RELATIVE_PATH)
}

function storageFiles(profile, storageId) {
  const directory = storageDirectory(profile)
  if (!fs.existsSync(directory)) {
    return []
  }
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => {
      const match = name.match(STORAGE_FILE_PATTERN)
      return Boolean(match && match[1] === storageId)
    })
    .sort()
}

function readStorageRecord(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const root = decodeStorageValue(parsed?.['0'])
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
      return null
    }
    const user = decodeStorageValue(root.user)
    const session = decodeStorageValue(root['planting-platform-session'])
    return { parsed, root, user, session }
  } catch {
    return null
  }
}

function validAppSession({ user, session, now }) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    return false
  }
  if (
    !String(user.userId || '').trim() ||
    !String(user.openid || '').trim() ||
    typeof user.token !== 'string' ||
    !user.token ||
    user.isLoggedIn !== true
  ) {
    return false
  }
  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    return false
  }
  if (
    typeof session.accessToken !== 'string' ||
    !session.accessToken ||
    user.token !== session.accessToken ||
    Number(session.expiresAt) <= now + MIN_SESSION_FRESHNESS_MS
  ) {
    return false
  }
  return true
}

function sharedFreshSession(records) {
  const [source] = records
  if (!source) {
    return null
  }
  return records.every(
    record =>
      record.user.openid === source.user.openid &&
      record.user.token === source.user.token &&
      record.session.accessToken === source.session.accessToken
  )
    ? source
    : null
}

function findFreshAppSession({ profile, storageId, expectedIdentityHash, now = Date.now() }) {
  const freshCandidates = storageFiles(profile, storageId)
    .map(name => {
      const filePath = path.join(storageDirectory(profile), name)
      const record = readStorageRecord(filePath)
      const match = name.match(STORAGE_FILE_PATTERN)
      return record && match
        ? {
            ...record,
            filePath,
            fileName: name,
            suffix: match[2] || '_'
          }
        : null
    })
    .filter(Boolean)
    .filter(record =>
      validAppSession({
        user: record.user,
        session: record.session,
        now
      })
    )

  const candidates = expectedIdentityHash
    ? freshCandidates.filter(record => sha256(record.user.openid) === expectedIdentityHash)
    : freshCandidates
  if (!candidates.length && freshCandidates.length && expectedIdentityHash) {
    throw fail(
      'qa_app_auth_identity_mismatch',
      '日常 DevTools 的小程序登录身份与当前 QA 身份不一致',
      {
        expected_identity_hash: expectedIdentityHash,
        observed_identity_hashes: freshCandidates.map(item => sha256(item.user.openid))
      }
    )
  }
  if (!candidates.length) {
    throw fail('qa_app_auth_source_unavailable', '日常 DevTools 中没有可用的小程序登录会话', {
      profile,
      storage_id: storageId
    })
  }
  if (candidates.length > 1) {
    throw fail('qa_app_auth_source_ambiguous', '日常 DevTools 中存在多个可用的小程序登录会话', {
      profile,
      storage_id: storageId,
      files: candidates.map(item => item.fileName)
    })
  }
  return candidates[0]
}

/**
 * Inspect the isolated QA project's existing app session without exposing or
 * mutating credentials. A manually enrolled QA session must be preserved when
 * the daily profile belongs to another account; copying that account would
 * make the next formal run silently test the wrong user.
 */
export function inspectFreshQaAppSession({
  profile,
  storageId,
  expectedIdentityHash,
  now = Date.now()
} = {}) {
  const freshCandidates = storageFiles(profile, storageId)
    .map(name => {
      const filePath = path.join(storageDirectory(profile), name)
      const record = readStorageRecord(filePath)
      const match = name.match(STORAGE_FILE_PATTERN)
      return record && match
        ? {
            ...record,
            fileName: name,
            suffix: match[2] || '_'
          }
        : null
    })
    .filter(Boolean)
    .filter(record =>
      validAppSession({
        user: record.user,
        session: record.session,
        now
      })
    )
    .filter(record =>
      expectedIdentityHash ? sha256(record.user.openid) === expectedIdentityHash : true
    )

  const candidate = sharedFreshSession(freshCandidates)
  if (!candidate) {
    return {
      status: freshCandidates.length > 1 ? 'ambiguous' : 'unavailable',
      storage_id: storageId,
      expected_identity_hash: expectedIdentityHash || null,
      candidate_count: freshCandidates.length,
      observed_identity_hashes: freshCandidates.map(item => sha256(item.user.openid))
    }
  }

  return {
    status: 'ready',
    storage_id: storageId,
    file_name: candidate.fileName,
    partition_count: freshCandidates.length,
    identity_hash: sha256(candidate.user.openid),
    session_expires_at: Number(candidate.session.expiresAt)
  }
}

/**
 * A DevTools upgrade can create a second simulator storage partition for the
 * same isolated QA runtime. Keep the real, already-enrolled QA app session in
 * that profile available to an empty partition without reading from or
 * changing the daily profile. This is intentionally limited to partitions
 * that have no conflicting logged-in identity.
 */
export function reconcileQaAppSessionPartitions({
  profile,
  storageId,
  qaProfileRoot = QA_PROFILE_ROOT,
  now = Date.now()
} = {}) {
  const qa = fs.realpathSync(path.resolve(profile))
  const allowedRoot = fs.realpathSync(path.resolve(qaProfileRoot))
  if (qa !== allowedRoot && !qa.startsWith(`${allowedRoot}${path.sep}`)) {
    throw fail('qa_app_auth_target_profile_forbidden', '小程序会话只允许写入 QA 专用 profile')
  }
  const records = storageFiles(qa, storageId)
    .map(name => {
      const filePath = path.join(storageDirectory(qa), name)
      const record = readStorageRecord(filePath)
      return record ? { ...record, fileName: name, filePath } : null
    })
    .filter(Boolean)
  const fresh = records.filter(record =>
    validAppSession({ user: record.user, session: record.session, now })
  )
  const source = sharedFreshSession(fresh)
  if (!source) {
    return {
      status: fresh.length > 1 ? 'ambiguous' : 'unavailable',
      storage_id: storageId,
      source_candidate_count: fresh.length,
      updated_target_count: 0,
      skipped_conflicting_target_count: 0
    }
  }

  let updatedTargetCount = 0
  let skippedConflictingTargetCount = 0
  const targetFiles = []
  for (const target of records) {
    if (validAppSession({ user: target.user, session: target.session, now })) {
      continue
    }
    const targetOpenid = String(target.user?.openid || '').trim()
    if (targetOpenid && targetOpenid !== source.user.openid) {
      skippedConflictingTargetCount += 1
      continue
    }
    const next = clone(target.parsed)
    const targetRoot = next['0'] && typeof next['0'] === 'object' ? next['0'] : {}
    targetRoot.user = clone(source.root.user)
    targetRoot['planting-platform-session'] = clone(source.root['planting-platform-session'])
    next['0'] = targetRoot
    if (JSON.stringify(next) !== JSON.stringify(target.parsed)) {
      writeJsonAtomically(target.filePath, next)
      updatedTargetCount += 1
    }
    targetFiles.push(target.fileName)
  }
  return {
    status: 'ready',
    code: 'qa_app_auth_qa_partitions_reconciled',
    storage_id: storageId,
    source_file: source.fileName,
    source_identity_hash: sha256(source.user.openid),
    target_files: targetFiles,
    updated_target_count: updatedTargetCount,
    skipped_conflicting_target_count: skippedConflictingTargetCount,
    session_expires_at: Number(source.session.expiresAt)
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

function targetStorageRecord({ source, targetFilePath }) {
  if (!fs.existsSync(targetFilePath)) {
    const envelope = {}
    for (const key of Object.keys(source.parsed)) {
      if (key !== '0') {
        envelope[key] = clone(source.parsed[key])
      }
    }
    envelope['0'] = {}
    return { parsed: envelope, existed: false }
  }
  const parsed = readStorageRecord(targetFilePath)
  if (!parsed) {
    throw fail('qa_app_auth_target_storage_invalid', 'QA 小程序存储文件无法读取', {
      target_file: targetFilePath
    })
  }
  return { parsed: parsed.parsed, existed: true }
}

function mirrorSourceToEmptyQaPartitions({ profile, storageId, source }) {
  let updatedTargetCount = 0
  let skippedConflictingTargetCount = 0
  const targetFiles = []

  for (const fileName of storageFiles(profile, storageId)) {
    const filePath = path.join(storageDirectory(profile), fileName)
    const target = readStorageRecord(filePath)
    if (
      !target ||
      validAppSession({ user: target.user, session: target.session, now: Date.now() })
    ) {
      continue
    }

    const targetOpenid = String(target.user?.openid || '').trim()
    if (targetOpenid && targetOpenid !== source.user.openid) {
      skippedConflictingTargetCount += 1
      continue
    }

    const next = clone(target.parsed)
    const targetRoot = next['0'] && typeof next['0'] === 'object' ? next['0'] : {}
    targetRoot.user = clone(source.root.user)
    targetRoot['planting-platform-session'] = clone(source.root['planting-platform-session'])
    next['0'] = targetRoot
    if (JSON.stringify(next) !== JSON.stringify(target.parsed)) {
      writeJsonAtomically(filePath, next)
      updatedTargetCount += 1
    }
    targetFiles.push(fileName)
  }

  return {
    updated_target_count: updatedTargetCount,
    skipped_conflicting_target_count: skippedConflictingTargetCount,
    target_files: targetFiles
  }
}

/**
 * Bridge only the current app session from the daily DevTools profile to the
 * isolated QA project's simulator storage. The daily profile is read-only;
 * the target is restricted to the persistent QA runtime tree.
 */
export function syncQaAppSessionFromDailyReadOnly({
  dailyProfile,
  qaProfile,
  sourceProjectPath,
  targetProjectPath,
  expectedIdentityHash = null,
  qaProfileRoot = QA_PROFILE_ROOT,
  qaRuntimeRoot = QA_RUNTIME_ROOT
} = {}) {
  const profiles = assertDistinctProfiles(dailyProfile, qaProfile, qaProfileRoot)
  const projects = assertProjectPaths(sourceProjectPath, targetProjectPath, qaRuntimeRoot)
  const sourceStorageId = projectStorageId(projects.source)
  const targetStorageId = projectStorageId(projects.target)
  const source = findFreshAppSession({
    profile: profiles.daily,
    storageId: sourceStorageId,
    expectedIdentityHash,
    now: Date.now()
  })
  const targetFileName = `storage_${targetStorageId}${source.suffix}.json`
  const targetFilePath = path.join(storageDirectory(profiles.qa), targetFileName)
  const target = targetStorageRecord({ source, targetFilePath })
  const next = clone(target.parsed)
  const targetRoot = next['0'] && typeof next['0'] === 'object' ? next['0'] : {}
  targetRoot.user = clone(source.root.user)
  targetRoot['planting-platform-session'] = clone(source.root['planting-platform-session'])
  next['0'] = targetRoot
  const changed = !target.existed || JSON.stringify(next) !== JSON.stringify(target.parsed)
  if (changed) {
    writeJsonAtomically(targetFilePath, next)
  }
  const partitionSync = mirrorSourceToEmptyQaPartitions({
    profile: profiles.qa,
    storageId: targetStorageId,
    source
  })
  return {
    status: 'ready',
    code: 'qa_app_auth_bridged_from_daily_read_only',
    source_profile: profiles.daily,
    target_profile: profiles.qa,
    source_project_path: projects.source,
    target_project_path: projects.target,
    source_storage_id: sourceStorageId,
    target_storage_id: targetStorageId,
    source_file: source.fileName,
    target_file: targetFileName,
    source_identity_hash: sha256(source.user.openid),
    source_token_present: true,
    target_session_present: true,
    session_expires_at: Number(source.session.expiresAt),
    changed,
    partition_sync: partitionSync
  }
}
