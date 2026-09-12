import fs from 'node:fs'
import path from 'node:path'

const SESSION_ARG = /--app-session-id=([^\s]+)/u
const AUTH_MARKER = 'updateUserInfo '
const AUTH_FILE_SUFFIX = '.log'

function isFreshAuth(value, now = Date.now()) {
  return Boolean(
    value?.loginStatus === 'SUCCESS' &&
    typeof value.openid === 'string' &&
    value.openid &&
    typeof value.signature === 'string' &&
    value.signature &&
    typeof value.newticket === 'string' &&
    value.newticket &&
    Number(value.ticketExpiredTime) > now + 5_000 &&
    Number(value.signatureExpiredTime) > now + 5_000
  )
}

function readAuthUpdates(filePath) {
  let text
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }
  const records = []
  for (const line of text.split(/\r?\n/u)) {
    const markerIndex = line.indexOf(AUTH_MARKER)
    if (markerIndex < 0) {
      continue
    }
    try {
      const value = JSON.parse(line.slice(markerIndex + AUTH_MARKER.length).trim())
      if (value && typeof value === 'object') {
        records.push(value)
      }
    } catch {
      // DevTools may emit a partial line while the current log is being written.
    }
  }
  return records
}

function sessionIdForProcess(processes = []) {
  if (!Array.isArray(processes) || processes.length !== 1) {
    return null
  }
  return String(processes[0]?.command || '').match(SESSION_ARG)?.[1] || null
}

/**
 * Observe the current ticket held by the managed native daily DevTools session.
 *
 * The local-storage file is the preferred source. This is a bounded read-only
 * fallback for the native package: after a real refresh, that package may keep
 * the new ticket in its active login session and emit it in the session log
 * before rewriting its local-storage bucket. The session id is taken from the
 * owner-checked process command, so an old unrelated log cannot be selected.
 */
export function readManagedDailySessionAuth({ profile, processes, now = Date.now() } = {}) {
  const sessionId = sessionIdForProcess(processes)
  if (!profile || !sessionId) {
    return null
  }
  const logsDirectory = path.join(profile, 'WeappLog', 'logs')
  let names
  try {
    names = fs
      .readdirSync(logsDirectory)
      .filter(name => name.endsWith(AUTH_FILE_SUFFIX) && name.endsWith(`-${sessionId}.log`))
      .sort()
  } catch {
    return null
  }
  let latest = null
  for (const name of names) {
    for (const value of readAuthUpdates(path.join(logsDirectory, name))) {
      if (isFreshAuth(value, now)) {
        latest = { value, file: path.join(logsDirectory, name), sessionId }
      }
    }
  }
  return latest
}

export { isFreshAuth }
