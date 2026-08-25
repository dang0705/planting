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

function commandFlagValue(command = '', flag, { singleToken = false } = {}) {
  const match = command.match(
    new RegExp(`(?:^|\\s)${escapeRegExp(flag)}(?:=|\\s+)([\\s\\S]*)`, 'i')
  )
  const remainder = match?.[1] ?? ''
  if (singleToken) {
    // DevTools session ids are a single non-whitespace token. In particular, they
    // must never absorb trailing OSLogRateLimit=, CODEX_CI=, or PWD= assignments.
    const token = remainder.match(/^(\S+)/)?.[1] ?? ''
    return token.includes('=') ? '' : token
  }
  const quoted = remainder.match(/^\s*(?:"([^"]*)"|'([^']*)')/)
  if (quoted) {
    return quoted[1] ?? quoted[2] ?? ''
  }
  // user-data-dir can be an unquoted path containing spaces. Shell-style
  // environment assignments and subsequent options are not part of that path.
  const unquoted = remainder.match(
    /^\s*(.*?)(?=\s+(?:-{1,2}[a-z][\w-]*(?:=|\s|$)|[a-z_][a-z0-9_]*=)|\s*$)/i
  )
  return unquoted?.[1]?.trim() ?? ''
}

function timestampFromLogLine(line) {
  const match = line.match(
    /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})([+-]\d{2}:\d{2})?\]/
  )
  if (!match) {
    return null
  }
  const timestamp = Date.parse(`${match[1].replace(' ', 'T')}${match[2] ?? ''}`)
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
  const sessionId = commandFlagValue(mainProcess?.command, '--app-session-id', {
    singleToken: true
  })
  const processStartMs = Date.parse(String(mainProcess?.process_start_identity || ''))
  if (!userDataDir || !sessionId) {
    return {
      status: 'unavailable',
      source: 'weapp_log_current_session',
      rejection: 'main_process_session_metadata_missing',
      evidence_records: []
    }
  }
  const directLogsDir = path.resolve(userDataDir, 'WeappLog', 'logs')
  let logsDir = directLogsDir
  const filePattern = new RegExp(`^.+-${escapeRegExp(sessionId)}\\.log$`)
  let fileNames
  try {
    let allLogFiles = []
    try {
      allLogFiles = fsModule.readdirSync(logsDir).filter(file => file.endsWith('.log'))
    } catch {
      // The official Electron command points at its parent user-data root;
      // the hashed profile is discovered by the fallback below.
    }
    if (allLogFiles.length === 0) {
      // Official Electron receives the Chromium user-data root and appends
      // the product-hash profile directory itself. Locate that single QA
      // profile when the root does not contain WeappLog directly.
      const childDirs = fsModule
        .readdirSync(userDataDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.resolve(userDataDir, entry.name, 'WeappLog', 'logs'))
      const candidates = []
      for (const candidate of childDirs) {
        try {
          const candidateFiles = fsModule
            .readdirSync(candidate)
            .filter(file => file.endsWith('.log'))
          if (candidateFiles.length > 0) {
            const newestMtime = Math.max(
              ...candidateFiles.map(file => {
                try {
                  return fsModule.statSync(path.resolve(candidate, file)).mtimeMs
                } catch {
                  return 0
                }
              })
            )
            candidates.push({ candidate, candidateFiles, newestMtime })
          }
        } catch {
          // Ignore unrelated Chromium profile directories.
        }
      }
      candidates.sort((left, right) => right.newestMtime - left.newestMtime)
      if (candidates[0]) {
        logsDir = candidates[0].candidate
        allLogFiles = candidates[0].candidateFiles
      }
    }
    const sessionLogFiles = allLogFiles.filter(file => filePattern.test(file))
    // The official Electron runtime uses timestamp-only log names. Its main
    // process argv is the authoritative session binding; limit fallback logs
    // to records emitted after that process started.
    fileNames = sessionLogFiles.length > 0 ? sessionLogFiles : allLogFiles
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
  const lifecycle = {
    compile_started_at: null,
    appservice_init_at: null,
    appservice_loadstop_at: null,
    failures: []
  }
  // Official Electron 2.02.2608172 keeps the injected session id on the
  // verified main-process argv but does not echo the argv in WeappLog. Native
  // bundles may still emit the historical argv line, so accept either source
  // while retaining the exact current-process/session binding.
  let sessionLineSeen = Boolean(sessionId)
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
      const currentProcessRecord =
        recentSessionRecord(timestamp, nowMs) &&
        (!Number.isFinite(processStartMs) || timestamp >= processStartMs - SESSION_LOG_CLOCK_SKEW_MS)
      if (currentProcessRecord) {
        if (
          line.includes('openProjectSimulatorDebuggerAndCompile start') ||
          line.includes('[SimulatorService] simulator app compile') ||
          line.includes('[appservice] restart appservice compile') ||
          line.includes('[backend initEnv] isMiniAppProject=false, isEvalProject=false, starting compiler')
        ) {
          lifecycle.compile_started_at = lifecycle.compile_started_at || timestamp
        }
        if (line.includes('appservice init webview')) {
          lifecycle.appservice_init_at = lifecycle.appservice_init_at || timestamp
        }
        if (line.includes('appservice webview loadstop')) {
          lifecycle.appservice_loadstop_at = lifecycle.appservice_loadstop_at || timestamp
        }
        if (
          line.includes('devtools is not loaded properly') ||
          line.includes('appservice webview exit with reason') ||
          line.includes('restart appservice crashed')
        ) {
          lifecycle.failures.push({
            file: relativeFile,
            timestamp: new Date(timestamp).toISOString(),
            line: line.slice(0, 1000)
          })
        }
      }
      if (line.includes(`--app-session-id=${sessionId}`) && currentProcessRecord) {
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
            currentProcessRecord
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
        currentProcessRecord
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
      runtime_lifecycle: lifecycle,
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
    runtime_lifecycle: lifecycle,
    files_considered: fileNames,
    rejections
  }
}
