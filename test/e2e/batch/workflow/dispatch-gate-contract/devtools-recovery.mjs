import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  inspectDevToolsRuntime,
  readCurrentSessionProjectEvidence,
  recoverVerifiedTargetDevTools
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime.mjs'
import { repoRoot } from './helpers.mjs'

const projectPath = repoRoot

function topologyRunner(command, args, _options = {}) {
  const port = args.find(value => String(value).startsWith('-iTCP:'))
  if (command === 'lsof' && args.includes('-t')) {
    if (port === '-iTCP:9420') {
      return { status: 0, stdout: '901\n', stderr: '' }
    }
    if (port === '-iTCP:3799') {
      return { status: 0, stdout: '900\n', stderr: '' }
    }
  }
  if (command === 'ps' && args.includes('901')) {
    return { status: 0, stdout: '900 renderer-process\n', stderr: '' }
  }
  if (command === 'ps' && args.includes('900')) {
    return {
      status: 0,
      stdout:
        '1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools package.nw --cli --remote-port 3799\n',
      stderr: ''
    }
  }
  if (command === 'lsof' && args.includes('-p')) {
    const pid = args[args.indexOf('-p') + 1]
    return {
      status: 0,
      stdout: pid === '901' ? `n${projectPath}/project.config.json\n` : '',
      stderr: ''
    }
  }
  throw new Error(`unexpected topology command: ${command} ${args.join(' ')}`)
}

const inspected = inspectDevToolsRuntime({
  expectedProjectPath: projectPath,
  commandRunner: topologyRunner
})
assert.equal(inspected.status, 'verified')
assert.equal(inspected.main_devtools_pid, 900)
assert.equal(inspected.automation_listener_pid, 901)
assert.equal(inspected.port_owner_pid, 901)
assert.equal(inspected.control_port, 3799)
assert.notEqual(inspected.control_port, inspected.automator_port)
assert.equal(inspected.control_port_listener_pids[3799][0], 900)

function localLogTimestamp(value) {
  return new Date(value - new Date(value).getTimezoneOffset() * 60 * 1000)
    .toISOString()
    .slice(0, 23)
    .replace('T', ' ')
}

function writeSessionLogs({
  userDataDir,
  sessionId,
  timestamp,
  port = 9420,
  project = projectPath
}) {
  const logsDir = path.join(userDataDir, 'WeappLog', 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  const stamp = localLogTimestamp(timestamp)
  const prefix = `[${stamp}][INFO][unknown]`
  fs.writeFileSync(
    path.join(logsDir, `2026-07-21-15-37-43-454-${sessionId}.log`),
    [
      `${prefix} init open arg: --app-session-id=${sessionId}`,
      `${prefix} cli ws recv ${JSON.stringify({ type: 'AUTO', port: String(port), project })}`
    ].join('\n')
  )
  fs.writeFileSync(
    path.join(logsDir, `2026-07-21-15-37-47-779-${sessionId}.log`),
    [
      `${prefix} init open arg: --app-session-id=${sessionId}`,
      `${prefix} [Fileutils] new FileUtils instance dirpath = ${project} {`
    ].join('\n')
  )
}

const sessionLogRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-session-proof-'))
try {
  const sessionId = 'current-session'
  const sessionNow = Date.now()
  writeSessionLogs({ userDataDir: sessionLogRoot, sessionId, timestamp: sessionNow })
  const mainProcess = {
    pid: 900,
    command: `/Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools --remote-port 3799 --user-data-dir=${sessionLogRoot} --package-dir=package.nw --app-session-id=${sessionId}`
  }
  const sessionEvidence = readCurrentSessionProjectEvidence({
    mainProcess,
    expectedProjectPath: projectPath,
    nowMs: sessionNow
  })
  assert.equal(sessionEvidence.status, 'verified')
  assert.equal(
    sessionEvidence.evidence_records.find(record => record.type === 'AUTO').automator_port,
    9420
  )
  assert.equal(
    sessionEvidence.evidence_records.find(record => record.type === 'FileUtils').project_path,
    projectPath
  )

  const sessionTopology = inspectDevToolsRuntime({
    expectedProjectPath: projectPath,
    commandRunner: (command, args) => {
      const port = args.find(value => String(value).startsWith('-iTCP:'))
      if (command === 'lsof' && args.includes('-t')) {
        return { status: 0, stdout: port === '-iTCP:9420' ? '901\n' : '900\n', stderr: '' }
      }
      if (command === 'ps' && args.includes('901')) {
        return { status: 0, stdout: '900 renderer-process\n', stderr: '' }
      }
      if (command === 'ps' && args.includes('900')) {
        return { status: 0, stdout: `1 ${mainProcess.command}\n`, stderr: '' }
      }
      if (command === 'lsof' && args.includes('-p')) {
        return { status: 0, stdout: '', stderr: '' }
      }
      throw new Error(`unexpected session topology command: ${command} ${args.join(' ')}`)
    }
  })
  assert.equal(sessionTopology.status, 'verified')
  assert.equal(sessionTopology.project_identity_source, 'weapp_log_current_session')
  assert.equal(sessionTopology.project_evidence_records[0].source, 'weapp_log_current_session')

  const staleRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-session-stale-'))
  try {
    const staleId = 'stale-session'
    writeSessionLogs({
      userDataDir: staleRoot,
      sessionId: staleId,
      timestamp: sessionNow - 7 * 60 * 60 * 1000
    })
    const staleEvidence = readCurrentSessionProjectEvidence({
      mainProcess: {
        ...mainProcess,
        command: mainProcess.command.replace(sessionLogRoot, staleRoot).replace(sessionId, staleId)
      },
      expectedProjectPath: projectPath,
      nowMs: sessionNow
    })
    assert.equal(staleEvidence.status, 'unavailable')
    assert.equal(staleEvidence.rejection, 'matching_session_binding_missing')
  } finally {
    fs.rmSync(staleRoot, { recursive: true, force: true })
  }

  const wrongPortRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-session-port-'))
  try {
    const wrongPortId = 'wrong-port-session'
    writeSessionLogs({
      userDataDir: wrongPortRoot,
      sessionId: wrongPortId,
      timestamp: sessionNow,
      port: 9421
    })
    const wrongPortEvidence = readCurrentSessionProjectEvidence({
      mainProcess: {
        ...mainProcess,
        command: mainProcess.command
          .replace(sessionLogRoot, wrongPortRoot)
          .replace(sessionId, wrongPortId)
      },
      expectedProjectPath: projectPath,
      nowMs: sessionNow
    })
    assert.equal(wrongPortEvidence.status, 'unavailable')
    assert.equal(wrongPortEvidence.rejection, 'matching_session_project_or_port_evidence_missing')
  } finally {
    fs.rmSync(wrongPortRoot, { recursive: true, force: true })
  }

  const wrongProjectRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-session-project-'))
  try {
    const wrongProjectId = 'wrong-project-session'
    writeSessionLogs({
      userDataDir: wrongProjectRoot,
      sessionId: wrongProjectId,
      timestamp: sessionNow,
      project: path.join(repoRoot, 'not-the-target-project')
    })
    const wrongProjectEvidence = readCurrentSessionProjectEvidence({
      mainProcess: {
        ...mainProcess,
        command: mainProcess.command
          .replace(sessionLogRoot, wrongProjectRoot)
          .replace(sessionId, wrongProjectId)
      },
      expectedProjectPath: projectPath,
      nowMs: sessionNow
    })
    assert.equal(wrongProjectEvidence.status, 'unavailable')
    assert.equal(
      wrongProjectEvidence.rejection,
      'matching_session_project_or_port_evidence_missing'
    )
  } finally {
    fs.rmSync(wrongProjectRoot, { recursive: true, force: true })
  }

  const wrongSessionRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-session-wrong-'))
  try {
    writeSessionLogs({
      userDataDir: wrongSessionRoot,
      sessionId: 'old-session',
      timestamp: sessionNow
    })
    const wrongSessionEvidence = readCurrentSessionProjectEvidence({
      mainProcess: {
        ...mainProcess,
        command: mainProcess.command.replace(sessionLogRoot, wrongSessionRoot)
      },
      expectedProjectPath: projectPath,
      nowMs: sessionNow
    })
    assert.equal(wrongSessionEvidence.status, 'unavailable')
    assert.equal(wrongSessionEvidence.rejection, 'matching_session_binding_missing')
    assert.deepEqual(wrongSessionEvidence.files_considered, [])
  } finally {
    fs.rmSync(wrongSessionRoot, { recursive: true, force: true })
  }
} finally {
  fs.rmSync(sessionLogRoot, { recursive: true, force: true })
}

const recoveryCalls = []
const recovered = await recoverVerifiedTargetDevTools({
  projectPath,
  verifiedRuntime: inspected,
  runtimeInspector: () => ({
    ...inspected,
    automation_listener_pid: 902,
    port_owner_pid: 902
  }),
  observationAttempts: 1,
  observationDelayMs: 0,
  commandRunner: (command, args, options) => {
    recoveryCalls.push({ command, args, options })
    return { status: 0, stdout: `${args[0]} ok`, stderr: '' }
  }
})
assert.equal(recovered.status, 'recovered')
assert.equal(recovered.before.main_devtools_pid, 900)
assert.equal(recovered.before.automation_listener_pid, 901)
assert.equal(recovered.after.main_devtools_pid, 900)
assert.equal(recovered.after.automation_listener_pid, 902)
assert.equal(recovered.after.control_port, 3799)
assert.deepEqual(
  recovered.invocations.map(item => item.action),
  ['close', 'open', 'auto']
)
for (const call of recoveryCalls) {
  assert.equal(call.command, '/Applications/wechatwebdevtools.app/Contents/MacOS/cli')
  assert.equal(call.options.shell, false)
  assert.equal(call.args.includes('--project'), true)
  assert.equal(call.args[call.args.indexOf('--project') + 1], projectPath)
  assert.equal(call.args[call.args.indexOf('--port') + 1], '3799')
  assert.equal(call.args.includes('--auto-port'), false)
}

const falseRestart = await recoverVerifiedTargetDevTools({
  projectPath,
  verifiedRuntime: inspected,
  runtimeInspector: () => inspected,
  observationAttempts: 1,
  observationDelayMs: 0,
  commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
})
assert.equal(falseRestart.status, 'failed_environment')
assert.equal(falseRestart.code, 'devtools_automator_blocker')
assert.equal(falseRestart.reason, 'target_runtime_not_restarted')

const falseControlPort = await recoverVerifiedTargetDevTools({
  projectPath,
  verifiedRuntime: { ...inspected, control_port: 9420 },
  commandRunner: () => {
    throw new Error('false 9420 control port must not execute recovery')
  }
})
assert.equal(falseControlPort.status, 'failed_environment')
assert.equal(falseControlPort.code, 'devtools_automator_blocker')
assert.equal(falseControlPort.reason, 'target_project_runtime_not_safely_preverified')

const failedCycleCalls = []
const failedCycle = await recoverVerifiedTargetDevTools({
  projectPath,
  verifiedRuntime: inspected,
  commandRunner: (_command, args) => {
    failedCycleCalls.push(args[0])
    return { status: 1, stdout: '', stderr: 'close failed' }
  }
})
assert.equal(failedCycle.status, 'failed_environment')
assert.equal(failedCycle.code, 'devtools_automator_blocker')
assert.deepEqual(failedCycleCalls, ['close'])
