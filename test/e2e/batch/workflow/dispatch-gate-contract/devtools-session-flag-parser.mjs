import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  discoverTargetDevToolsRuntime,
  inspectDevToolsRuntime
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime-inspection.mjs'
import { readCurrentSessionProjectEvidence } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-session-log.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devtools-session-flag-parser-'))
const projectPath = path.join(root, 'dist', 'dev', 'mp-weixin')
const profilePath = path.join(
  root,
  'Library',
  'Application Support',
  '微信开发者工具',
  'session-parser-fixture'
)
const sessionId = 'current-session-20260805'
const nowMs = Date.now()

function localLogTimestamp(value) {
  return new Date(value - new Date(value).getTimezoneOffset() * 60 * 1000)
    .toISOString()
    .slice(0, 23)
    .replace('T', ' ')
}

function writeSessionLogs({
  profile = profilePath,
  session = sessionId,
  timestamp = nowMs,
  autoPort = 9420,
  autoProject = projectPath,
  fileUtilsProject = projectPath
} = {}) {
  const logsDir = path.join(profile, 'WeappLog', 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  const prefix = `[${localLogTimestamp(timestamp)}][INFO][fixture]`
  fs.writeFileSync(
    path.join(logsDir, `2026-08-05-00-00-00-000-${session}.log`),
    [
      `${prefix} init open arg: --app-session-id=${session}`,
      `${prefix} cli ws recv ${JSON.stringify({
        type: 'AUTO',
        port: String(autoPort),
        project: autoProject
      })}`,
      `${prefix} [Fileutils] new FileUtils instance dirpath = ${fileUtilsProject} {`
    ].join('\n')
  )
}

function command({ profile = profilePath, session = sessionId, suffix = '' } = {}) {
  return [
    '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools',
    '--remote-port=3799',
    `--user-data-dir=${profile}`,
    `--app-session-id=${session}`,
    suffix
  ]
    .filter(Boolean)
    .join(' ')
}

function runtimeCommandRunner({ mainCommand, listenerOutput = '901\n' }) {
  return (binary, args) => {
    if (binary === 'lsof' && args.includes('-t')) {
      const port = args.find(value => String(value).startsWith('-iTCP:'))
      if (port === '-iTCP:9420') {
        return { status: 0, stdout: listenerOutput, stderr: '' }
      }
      if (port === '-iTCP:3799') {
        return { status: 0, stdout: '900\n', stderr: '' }
      }
      return { status: 0, stdout: '', stderr: '' }
    }
    if (binary === 'lsof' && args.includes('-p')) {
      return { status: 0, stdout: '', stderr: '' }
    }
    if (binary === 'ps' && args.includes('-ax')) {
      return { status: 0, stdout: `900 1 ${mainCommand}\n`, stderr: '' }
    }
    if (binary === 'ps' && args.includes('-p')) {
      const pid = args[args.indexOf('-p') + 1]
      if (pid === '900') {
        return { status: 0, stdout: `1 ${mainCommand}\n`, stderr: '' }
      }
      if (pid === '901' || pid === '902') {
        return { status: 0, stdout: '900 renderer-process\n', stderr: '' }
      }
    }
    throw new Error(`unexpected command: ${binary} ${args.join(' ')}`)
  }
}

function assertVerified(commandText) {
  const evidence = readCurrentSessionProjectEvidence({
    mainProcess: { command: commandText },
    expectedProjectPath: projectPath,
    nowMs
  })
  assert.equal(evidence.status, 'verified')
  assert.equal(evidence.session_id, sessionId)
  assert.equal(evidence.user_data_dir, profilePath)
  assert.doesNotMatch(evidence.session_id, /\s|=/)
  return evidence
}

try {
  fs.mkdirSync(projectPath, { recursive: true })
  fs.writeFileSync(path.join(projectPath, 'project.config.json'), '{"projectname":"fixture"}')
  writeSessionLogs()

  const observedCommand = command({ suffix: `OSLogRateLimit=64 CODEX_CI=1 PWD=${root}` })
  const observedEvidence = assertVerified(observedCommand)
  assert.equal(observedEvidence.proof_mode, 'automator_session')

  // user-data-dir supports both quoted and unquoted paths with spaces. Its unquoted
  // boundary is the next option, a shell environment assignment, or end of command.
  assertVerified(
    command({
      profile: `"${profilePath}"`,
      suffix: 'OSLogRateLimit=64 CODEX_CI=1'
    })
  )
  assertVerified(command({ suffix: `OSLogRateLimit=64 CODEX_CI=1 PWD=${root}` }))
  assertVerified(
    [
      '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools',
      '--remote-port=3799',
      `--app-session-id=${sessionId}`,
      `--user-data-dir=${profilePath}`
    ].join(' ')
  )

  const runtimeRunner = runtimeCommandRunner({ mainCommand: observedCommand })
  const inspected = inspectDevToolsRuntime({
    expectedProjectPath: projectPath,
    commandRunner: runtimeRunner
  })
  assert.equal(inspected.status, 'verified')
  assert.equal(inspected.project_identity_source, 'weapp_log_current_session')
  assert.equal(inspected.session_log_evidence.session_id, sessionId)
  const discovered = discoverTargetDevToolsRuntime({
    expectedProjectPath: projectPath,
    commandRunner: runtimeRunner
  })
  assert.equal(discovered.status, 'target_ready')
  assert.equal(discovered.project_identity_verified, true)

  const missingSession = readCurrentSessionProjectEvidence({
    mainProcess: { command: command({ session: '' }) },
    expectedProjectPath: projectPath,
    nowMs
  })
  assert.equal(missingSession.rejection, 'main_process_session_metadata_missing')
  const malformedSession = readCurrentSessionProjectEvidence({
    mainProcess: { command: command({ session: 'session=assignment' }) },
    expectedProjectPath: projectPath,
    nowMs
  })
  assert.equal(malformedSession.rejection, 'main_process_session_metadata_missing')

  const noLogProfile = path.join(root, 'missing', 'Application Support', 'profile')
  const noLog = readCurrentSessionProjectEvidence({
    mainProcess: { command: command({ profile: noLogProfile }) },
    expectedProjectPath: projectPath,
    nowMs
  })
  assert.equal(noLog.rejection, 'matching_session_log_unavailable')

  const staleProfile = path.join(root, 'stale', 'Application Support', 'profile')
  writeSessionLogs({ profile: staleProfile, timestamp: nowMs - 7 * 60 * 60 * 1000 })
  const stale = readCurrentSessionProjectEvidence({
    mainProcess: { command: command({ profile: staleProfile }) },
    expectedProjectPath: projectPath,
    nowMs
  })
  assert.equal(stale.rejection, 'matching_session_binding_missing')

  const wrongPortProfile = path.join(root, 'wrong-port', 'Application Support', 'profile')
  writeSessionLogs({ profile: wrongPortProfile, autoPort: 9421 })
  const wrongPort = readCurrentSessionProjectEvidence({
    mainProcess: { command: command({ profile: wrongPortProfile }) },
    expectedProjectPath: projectPath,
    nowMs
  })
  assert.equal(wrongPort.rejection, 'matching_session_project_or_port_evidence_missing')

  const wrongProjectProfile = path.join(root, 'wrong-project', 'Application Support', 'profile')
  writeSessionLogs({
    profile: wrongProjectProfile,
    fileUtilsProject: path.join(root, 'other-project')
  })
  const wrongProject = readCurrentSessionProjectEvidence({
    mainProcess: { command: command({ profile: wrongProjectProfile }) },
    expectedProjectPath: projectPath,
    nowMs
  })
  assert.equal(wrongProject.rejection, 'matching_session_project_or_port_evidence_missing')

  const absentIdentity = inspectDevToolsRuntime({
    expectedProjectPath: projectPath,
    commandRunner: runtimeCommandRunner({ mainCommand: command({ profile: noLogProfile }) })
  })
  assert.equal(absentIdentity.code, 'project_identity_unverified')
  const ambiguousIdentity = inspectDevToolsRuntime({
    expectedProjectPath: projectPath,
    commandRunner: runtimeCommandRunner({
      mainCommand: observedCommand,
      listenerOutput: '901\n902\n'
    })
  })
  assert.equal(ambiguousIdentity.code, 'project_identity_ambiguous')

  process.stdout.write('devtools session flag parser contract passed\n')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
