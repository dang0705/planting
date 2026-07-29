import fs from 'node:fs'
import path from 'node:path'

const MAX_SESSION_LOG_AGE_MS = 6 * 60 * 60 * 1000
const SESSION_LOG_CLOCK_SKEW_MS = 2 * 60 * 1000
const MAX_SESSION_LOG_BYTES = 8 * 1024 * 1024

function normalizeRuntimePath(value) {
  return path.resolve(String(value ?? '')).replaceAll('\\', '/')
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function commandFlagValue(command = '', flag) {
  const match = command.match(
    new RegExp(`(?:^|\\s)${escapeRegExp(flag)}=(.*?)(?=\\s+--[a-z-]+=|$)`, 'i')
  )
  return match?.[1]?.trim() ?? ''
}

function timestampFromLogLine(line) {
  const match = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})]/)
  if (!match) {
    return null
  }
  const timestamp = Date.parse(match[1].replace(' ', 'T'))
  return Number.isNaN(timestamp) ? null : timestamp
}

function recentSessionRecord(timestamp, nowMs) {
  return (
    Number.isFinite(timestamp) &&
    timestamp <= nowMs + SESSION_LOG_CLOCK_SKEW_MS &&
    nowMs - timestamp <= MAX_SESSION_LOG_AGE_MS
  )
}

function evidenceRecord({ file, type, timestamp, projectPath, projectName, port }) {
  return {
    source: 'weapp_log_current_session',
    file,
    type,
    timestamp: new Date(timestamp).toISOString(),
    project_path: projectPath,
    ...(projectName ? { project_name: projectName } : {}),
    ...(port === undefined ? {} : { automator_port: port })
  }
}

function projectNameFromConfig(projectPath, fsModule) {
  try {
    const configPath = path.join(projectPath, 'project.config.json')
    const config = JSON.parse(fsModule.readFileSync(configPath, 'utf8'))
    return String(config.projectname || config.projectName || '').trim()
  } catch {
    return ''
  }
}

export function readCurrentSessionProjectEvidence({
  mainProcess,
  expectedProjectPath,
  wsPort = 9420,
  requireAutomatorPort = true,
  nowMs = Date.now(),
  fsModule = fs
} = {}) {
  const expected = normalizeRuntimePath(expectedProjectPath)
  const expectedProjectName = projectNameFromConfig(expected, fsModule)
  const userDataDir = commandFlagValue(mainProcess?.command, '--user-data-dir')
  const sessionId = commandFlagValue(mainProcess?.command, '--app-session-id')
  if (!userDataDir || !sessionId) {
    return {
      status: 'unavailable',
      source: 'weapp_log_current_session',
      rejection: 'main_process_session_metadata_missing',
      evidence_records: []
    }
  }
  const logsDir = path.resolve(userDataDir, 'WeappLog', 'logs')
  const filePattern = new RegExp(`^.+-${escapeRegExp(sessionId)}\\.log$`)
  let fileNames
  try {
    fileNames = fsModule.readdirSync(logsDir).filter(file => filePattern.test(file))
  } catch {
    return {
      status: 'unavailable',
      source: 'weapp_log_current_session',
      session_id: sessionId,
      user_data_dir: userDataDir,
      rejection: 'matching_session_log_unavailable',
      evidence_records: []
    }
  }
  const evidenceRecords = []
  const rejections = []
  let sessionLineSeen = false
  for (const fileName of fileNames) {
    const filePath = path.resolve(logsDir, fileName)
    if (!filePath.startsWith(`${logsDir}${path.sep}`)) {
      continue
    }
    let stat
    try {
      stat = fsModule.statSync(filePath)
      if (!stat.isFile() || stat.size > MAX_SESSION_LOG_BYTES) {
        rejections.push(`session_log_file_rejected:${fileName}`)
        continue
      }
    } catch {
      rejections.push(`session_log_stat_failed:${fileName}`)
      continue
    }
    let text
    try {
      text = fsModule.readFileSync(filePath, 'utf8')
    } catch {
      rejections.push(`session_log_read_failed:${fileName}`)
      continue
    }
    const relativeFile = path.relative(userDataDir, filePath)
    for (const line of text.split('\n')) {
      const timestamp = timestampFromLogLine(line)
      if (line.includes(`--app-session-id=${sessionId}`) && recentSessionRecord(timestamp, nowMs)) {
        sessionLineSeen = true
      }
      const autoMatch = line.match(/cli ws recv\s+(\{.*\})\s*$/)
      if (autoMatch) {
        try {
          const record = JSON.parse(autoMatch[1])
          if (
            record.type === 'AUTO' &&
            Number(record.port) === Number(wsPort) &&
            normalizeRuntimePath(record.project) === expected &&
            recentSessionRecord(timestamp, nowMs)
          ) {
            evidenceRecords.push(
              evidenceRecord({
                file: relativeFile,
                type: 'AUTO',
                timestamp,
                projectPath: expected,
                port: Number(record.port)
              })
            )
          }
        } catch {
          rejections.push(`auto_record_parse_failed:${relativeFile}`)
        }
      }
      const fileUtilsMatch = line.match(/new FileUtils instance dirpath = (.+?)\s+\{/)
      if (
        fileUtilsMatch &&
        normalizeRuntimePath(fileUtilsMatch[1]) === expected &&
        recentSessionRecord(timestamp, nowMs)
      ) {
        const openedProjectPath = normalizeRuntimePath(fileUtilsMatch[1])
        const openedProjectName = projectNameFromConfig(openedProjectPath, fsModule)
        evidenceRecords.push(
          evidenceRecord({
            file: relativeFile,
            type: 'FileUtils',
            timestamp,
            projectPath: expected,
            projectName: openedProjectName
          })
        )
        // ProjectConfig is supplementary metadata only: it attaches projectname to an
        // already-proven recent FileUtils record. It must never independently prove
        // that the running DevTools is the target project, so the verified condition
        // below does not check ProjectConfig alone.
        if (expectedProjectName && openedProjectName === expectedProjectName) {
          evidenceRecords.push(
            evidenceRecord({
              file: relativeFile,
              type: 'ProjectConfig',
              timestamp,
              projectPath: expected,
              projectName: openedProjectName
            })
          )
        }
      }
    }
  }
  const types = new Set(evidenceRecords.map(record => record.type))
  // A running 9420 session requires AUTO + FileUtils. Before 9420 exists, the only
  // permitted bootstrap proof is the current main-process session binding plus an exact,
  // recent FileUtils target path; it never inherits an old AUTO record from another run.
  const identityVerified = sessionLineSeen && types.has('FileUtils')
  const automatorVerified = identityVerified && types.has('AUTO')
  if ((requireAutomatorPort && automatorVerified) || (!requireAutomatorPort && identityVerified)) {
    return {
      status: requireAutomatorPort ? 'verified' : 'bootstrap_verified',
      source: 'weapp_log_current_session',
      session_id: sessionId,
      user_data_dir: userDataDir,
      proof_mode: requireAutomatorPort ? 'automator_session' : 'project_session',
      evidence_records: evidenceRecords,
      files_considered: fileNames
    }
  }
  return {
    status: 'unavailable',
    source: 'weapp_log_current_session',
    session_id: sessionId,
    user_data_dir: userDataDir,
    rejection: sessionLineSeen
      ? requireAutomatorPort
        ? 'matching_session_project_or_port_evidence_missing'
        : 'matching_session_project_evidence_missing'
      : 'matching_session_binding_missing',
    evidence_records: evidenceRecords,
    files_considered: fileNames,
    rejections
  }
}
