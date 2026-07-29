import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import {
  enableAutomatorForVerifiedTargetDevTools,
  inspectDevToolsRuntime,
  readCurrentSessionProjectEvidence,
  requestDevToolsControl,
  recoverVerifiedTargetDevTools as recoverDevTools,
  verifyDevToolsOwnerProcess
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime.mjs'
import { repoRoot } from './helpers.mjs'

const projectPath = repoRoot

function positiveIntegerValue(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0
}

async function successfulControlRequest({ action, projectPath, controlPort, wsPort }) {
  const query = new URLSearchParams({ cli: '1', projectpath: projectPath })
  if (action === 'auto') {
    query.set('port', String(wsPort))
    query.set('account', '')
  }
  return {
    status_code: 200,
    url: `http://127.0.0.1:${controlPort}/${action}?${query}`
  }
}

async function captureControlRequestUrls(assertions) {
  const urls = []
  const server = http.createServer((request, response) => {
    urls.push(request.url || '')
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('ok')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object', 'control test server must expose a port')
  try {
    await assertions({ controlPort: address.port, urls })
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()))
    })
  }
}

// Deterministic HTTP-contract check only: the temporary local server is not DevTools.
// It verifies the URL emitted by the actual control request implementation for paths
// whose spaces and Chinese characters would reveal a second encoding pass.
{
  const specialProjectPath = `${projectPath}/青花植 空格/mini program`
  await captureControlRequestUrls(async ({ controlPort, urls }) => {
    const open = await requestDevToolsControl({
      action: 'open',
      projectPath: specialProjectPath,
      controlPort
    })
    const auto = await requestDevToolsControl({
      action: 'auto',
      projectPath: specialProjectPath,
      controlPort,
      wsPort: 9420
    })
    const expectedOpen = new URLSearchParams({ cli: '1', projectpath: specialProjectPath })
    const expectedAuto = new URLSearchParams({
      cli: '1',
      projectpath: specialProjectPath,
      port: '9420',
      account: ''
    })

    assert.equal(open.status_code, 200)
    assert.equal(auto.status_code, 200)
    assert.deepEqual(urls, [`/open?${expectedOpen}`, `/auto?${expectedAuto}`])
    for (const requestUrl of urls) {
      assert.match(requestUrl, /projectpath=%2F/, 'absolute project path must be encoded once')
      assert.doesNotMatch(
        requestUrl,
        /projectpath=[^&]*%25/i,
        'project path must not contain a second percent-encoding pass'
      )
    }
    assert.match(urls[1], /(?:\?|&)port=9420(?:&|$)/, 'auto must retain the Automator port')
    assert.match(urls[1], /(?:\?|&)account=(?:&|$)/, 'auto must retain the empty account parameter')
  })
}

function recoverVerifiedTargetDevTools(options = {}) {
  return recoverDevTools({
    ...options,
    controlRequest: options.controlRequest ?? successfulControlRequest
  })
}

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

const ideHttpPrecedenceRuntime = inspectDevToolsRuntime({
  expectedProjectPath: projectPath,
  commandRunner: (command, args) => {
    const port = args.find(value => String(value).startsWith('-iTCP:'))
    if (command === 'lsof' && args.includes('-t')) {
      if (port === '-iTCP:9420') {
        return { status: 0, stdout: '911\n', stderr: '' }
      }
      if (port === '-iTCP:9422') {
        return { status: 0, stdout: '910\n', stderr: '' }
      }
      return { status: 0, stdout: '', stderr: '' }
    }
    if (command === 'ps' && args.includes('911')) {
      return { status: 0, stdout: '910 renderer-process\n', stderr: '' }
    }
    if (command === 'ps' && args.includes('910')) {
      return {
        status: 0,
        stdout:
          '1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools package.nw --ide-http-port 9422 --remote-port 3799\n',
        stderr: ''
      }
    }
    if (command === 'lsof' && args.includes('-p')) {
      const pid = args[args.indexOf('-p') + 1]
      return { status: 0, stdout: pid === '911' ? `n${projectPath}/project.config.json\n` : '' }
    }
    throw new Error(`unexpected ide-http precedence command: ${command} ${args.join(' ')}`)
  }
})
assert.equal(ideHttpPrecedenceRuntime.status, 'verified')
assert.equal(ideHttpPrecedenceRuntime.control_port, 9422)
assert.equal(ideHttpPrecedenceRuntime.control_port_source, 'main_devtools_ide_http_port')
assert.notEqual(ideHttpPrecedenceRuntime.control_port, 3799)

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

  // -------------------------------------------------------------------------
  // dispatch-20260726-devtools-screenshot-recovery-zcode consolidated review:
  // ProjectConfig 不得独立证明 target identity；FileUtils 记录必须有 recent timestamp。
  // -------------------------------------------------------------------------

  // Case: old FileUtils with matching projectname but stale timestamp => unavailable
  // ProjectConfig 绝不能独立使 status=verified
  const staleFileUtilsRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-stale-fu-'))
  try {
    const staleFuId = 'stale-fu-session'
    const staleFuTime = sessionNow - 7 * 60 * 60 * 1000
    const logsDir = path.join(staleFileUtilsRoot, 'WeappLog', 'logs')
    fs.mkdirSync(logsDir, { recursive: true })
    const staleStamp = localLogTimestamp(staleFuTime)
    const stalePrefix = `[${staleStamp}][INFO][unknown]`
    // 仅有 stale FileUtils + matching projectname，无 session binding，无 AUTO
    fs.writeFileSync(
      path.join(logsDir, `2026-07-21-10-00-00-000-${staleFuId}.log`),
      `${stalePrefix} [Fileutils] new FileUtils instance dirpath = ${projectPath} {`
    )
    const staleFuEvidence = readCurrentSessionProjectEvidence({
      mainProcess: {
        ...mainProcess,
        command: mainProcess.command.replace(sessionLogRoot, staleFileUtilsRoot).replace(sessionId, staleFuId)
      },
      expectedProjectPath: projectPath,
      nowMs: sessionNow
    })
    assert.equal(
      staleFuEvidence.status,
      'unavailable',
      'stale FileUtils + matching projectname: must be unavailable (no ProjectConfig standalone proof)'
    )
    assert.equal(
      staleFuEvidence.evidence_records.filter(r => r.type === 'FileUtils').length,
      0,
      'stale FileUtils: no FileUtils record should be emitted (timestamp not recent)'
    )
    assert.equal(
      staleFuEvidence.evidence_records.filter(r => r.type === 'ProjectConfig').length,
      0,
      'stale FileUtils: no ProjectConfig record should be emitted'
    )
  } finally {
    fs.rmSync(staleFileUtilsRoot, { recursive: true, force: true })
  }

  // Case: recent FileUtils + matching projectname but no session binding / no AUTO => unavailable
  const noAutoRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-no-auto-'))
  try {
    const noAutoId = 'no-auto-session'
    const logsDir = path.join(noAutoRoot, 'WeappLog', 'logs')
    fs.mkdirSync(logsDir, { recursive: true })
    const recentStamp = localLogTimestamp(sessionNow)
    const recentPrefix = `[${recentStamp}][INFO][unknown]`
    // recent FileUtils + session binding line，但无 AUTO 记录
    fs.writeFileSync(
      path.join(logsDir, `2026-07-21-15-37-43-454-${noAutoId}.log`),
      [
        `${recentPrefix} init open arg: --app-session-id=${noAutoId}`,
        `${recentPrefix} [Fileutils] new FileUtils instance dirpath = ${projectPath} {`
      ].join('\n')
    )
    const noAutoEvidence = readCurrentSessionProjectEvidence({
      mainProcess: {
        ...mainProcess,
        command: mainProcess.command.replace(sessionLogRoot, noAutoRoot).replace(sessionId, noAutoId)
      },
      expectedProjectPath: projectPath,
      nowMs: sessionNow
    })
    assert.equal(
      noAutoEvidence.status,
      'unavailable',
      'recent FileUtils + matching projectname but no AUTO: must be unavailable'
    )
    assert.equal(
      noAutoEvidence.rejection,
      'matching_session_project_or_port_evidence_missing',
      'recent FileUtils no AUTO: rejection should be matching_session_project_or_port_evidence_missing'
    )
  } finally {
    fs.rmSync(noAutoRoot, { recursive: true, force: true })
  }

  // Case: current same-session binding + exact AUTO 9420 + exact FileUtils => verified
  // projectname may be present as supplementary evidence (already covered by sessionEvidence above)
  assert.equal(
    sessionEvidence.status,
    'verified',
    'full verified: session binding + AUTO 9420 + FileUtils should be verified'
  )
  assert.ok(
    sessionEvidence.evidence_records.some(r => r.type === 'AUTO'),
    'full verified: should have AUTO record'
  )
  assert.ok(
    sessionEvidence.evidence_records.some(r => r.type === 'FileUtils'),
    'full verified: should have FileUtils record'
  )
  // projectname is supplementary metadata, may be present but not required for verified
  const projectConfigRecords = sessionEvidence.evidence_records.filter(r => r.type === 'ProjectConfig')
  if (projectConfigRecords.length > 0) {
    assert.ok(
      projectConfigRecords.every(r => r.project_name !== undefined),
      'full verified: ProjectConfig records should carry project_name as supplementary metadata'
    )
  }
} finally {
  fs.rmSync(sessionLogRoot, { recursive: true, force: true })
}

const recoveryControlCalls = []
const recovered = await recoverVerifiedTargetDevTools({
  projectPath,
  verifiedRuntime: inspected,
  runtimeInspector: () => ({
    ...inspected,
    automation_listener_pid: 902,
    port_owner_pid: 902
  }),
  observationAttempts: 2,
  observationDelayMs: 0,
  commandRunner: (_command, args) => {
    return { status: 0, stdout: `${args[0]} ok`, stderr: '' }
  },
  controlRequest: async request => {
    recoveryControlCalls.push(request)
    return successfulControlRequest(request)
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
assert.equal(recoveryControlCalls.length, 3)
for (const call of recoveryControlCalls) {
  assert.equal(call.projectPath, projectPath)
  assert.equal(call.controlPort, 3799, 'IDE control port must remain distinct from Automator 9420')
}
assert.deepEqual(recoveryControlCalls.map(call => call.action), ['close', 'open', 'auto'])
assert.equal(recoveryControlCalls.find(call => call.action === 'auto').wsPort, 9420)

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
// rework 6: verified runtime but no restart proof (same PID, no new AUTO) =>
// target_runtime_not_stably_restarted (two-stable-observation cannot be satisfied)
assert.equal(falseRestart.reason, 'target_runtime_not_stably_restarted')

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
  commandRunner: () => ({ status: 0, stdout: '', stderr: '' }),
  controlRequest: async request => {
    failedCycleCalls.push(request.action)
    return { status_code: 500, error: 'close failed' }
  }
})
assert.equal(failedCycle.status, 'failed_environment')
assert.equal(failedCycle.code, 'devtools_automator_blocker')
assert.deepEqual(failedCycleCalls, ['close'])

// ---------------------------------------------------------------------------
// dispatch-20260726-devtools-screenshot-recovery-zcode: .ide 文件端口解析测试
// 当主进程 --remote-port 缺失时，从同一 user-data-dir 的 .ide 文件解析控制端口。
// 优先读取 <user-data-dir>/Default/.ide（当前 DevTools 事实位置）；
// Default 缺失时回退到 <user-data-dir>/.ide（版本兼容）。
// 覆盖：Default/.ide 有效、缺失、非法、等于 9420、未监听；root .ide 回退；Default 非法不静默转 root。
// ---------------------------------------------------------------------------

// 构造一个 user-data-dir，主进程无 --remote-port，Default/.ide 文件含有效端口 27021
const ideRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-ide-port-'))
try {
  const idePort = 27021
  // 当前 DevTools 事实位置：Default/.ide
  fs.mkdirSync(path.join(ideRoot, 'Default'), { recursive: true })
  fs.writeFileSync(path.join(ideRoot, 'Default', '.ide'), String(idePort))

  // Case: .ide 文件有效（端口 27021，本机监听，不等于 9420）
  const ideValidRunner = (command, args) => {
    const port = args.find(value => String(value).startsWith('-iTCP:'))
    if (command === 'lsof' && args.includes('-t')) {
      if (port === '-iTCP:9420') {
        return { status: 0, stdout: '901\n', stderr: '' }
      }
      if (port === `-iTCP:${idePort}`) {
        return { status: 0, stdout: '900\n', stderr: '' }
      }
      return { status: 0, stdout: '', stderr: '' }
    }
    if (command === 'ps' && args.includes('901')) {
      return { status: 0, stdout: '900 renderer-process\n', stderr: '' }
    }
    if (command === 'ps' && args.includes('900')) {
      return {
        status: 0,
        stdout: `1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools --user-data-dir=${ideRoot} --package-dir=package.nw\n`,
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
    throw new Error(`unexpected ide-valid command: ${command} ${args.join(' ')}`)
  }

  const ideValidRuntime = inspectDevToolsRuntime({
    expectedProjectPath: projectPath,
    commandRunner: ideValidRunner
  })
  assert.equal(
    ideValidRuntime.status,
    'verified',
    '.ide valid: runtime should be verified when .ide port resolves'
  )
  assert.equal(
    ideValidRuntime.control_port,
    idePort,
    '.ide valid: control_port should be 27021 from .ide file'
  )
  assert.equal(
    ideValidRuntime.control_port_source,
    'user_data_ide_port_file',
    '.ide valid: control_port_source should be user_data_ide_port_file'
  )
  assert.notEqual(
    ideValidRuntime.control_port,
    ideValidRuntime.automator_port,
    '.ide valid: control_port must not equal automator port (9420)'
  )

  // Case: .ide 文件缺失（user-data-dir 存在但无 .ide 文件）
  const ideMissingRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-ide-missing-'))
  try {
    const ideMissingRunner = (command, args) => {
      if (command === 'lsof' && args.includes('-t')) {
        const port = args.find(value => String(value).startsWith('-iTCP:'))
        return { status: 0, stdout: port === '-iTCP:9420' ? '901\n' : '', stderr: '' }
      }
      if (command === 'ps' && args.includes('901')) {
        return { status: 0, stdout: '900 renderer-process\n', stderr: '' }
      }
      if (command === 'ps' && args.includes('900')) {
        return {
          status: 0,
          stdout: `1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools --user-data-dir=${ideMissingRoot}\n`,
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
      throw new Error(`unexpected ide-missing command: ${command} ${args.join(' ')}`)
    }

    const ideMissingRuntime = inspectDevToolsRuntime({
      expectedProjectPath: projectPath,
      commandRunner: ideMissingRunner
    })
    assert.equal(
      ideMissingRuntime.control_port_source,
      'unavailable',
      '.ide missing: control_port_source should be unavailable when .ide file missing'
    )
    // control_port 为 null/unavailable 时 validVerifiedRuntime 会拒绝恢复，
    // 因为 positiveInteger(control_port) 检查失败。
    assert.ok(
      !positiveIntegerValue(ideMissingRuntime.control_port),
      '.ide missing: control_port must not be a positive integer (recovery must be blocked)'
    )
  } finally {
    fs.rmSync(ideMissingRoot, { recursive: true, force: true })
  }

  // Case: Default/.ide 文件非法（非正整数内容），不静默转 root 提升
  const ideIllegalRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-ide-illegal-'))
  try {
    fs.mkdirSync(path.join(ideIllegalRoot, 'Default'), { recursive: true })
    fs.writeFileSync(path.join(ideIllegalRoot, 'Default', '.ide'), 'not-a-port')
    // root .ide 含有效端口，但 Default/.ide 存在且非法时不得静默转 root 提升
    fs.writeFileSync(path.join(ideIllegalRoot, '.ide'), '27023')
    const ideIllegalRunner = (command, args) => {
      if (command === 'lsof' && args.includes('-t')) {
        const port = args.find(value => String(value).startsWith('-iTCP:'))
        return { status: 0, stdout: port === '-iTCP:9420' ? '901\n' : '', stderr: '' }
      }
      if (command === 'ps' && args.includes('901')) {
        return { status: 0, stdout: '900 renderer-process\n', stderr: '' }
      }
      if (command === 'ps' && args.includes('900')) {
        return {
          status: 0,
          stdout: `1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools --user-data-dir=${ideIllegalRoot}\n`,
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
      throw new Error(`unexpected ide-illegal command: ${command} ${args.join(' ')}`)
    }

    const ideIllegalRuntime = inspectDevToolsRuntime({
      expectedProjectPath: projectPath,
      commandRunner: ideIllegalRunner
    })
    assert.equal(
      ideIllegalRuntime.control_port_source,
      'unavailable',
      '.ide illegal: control_port_source should be unavailable when .ide content is not a positive integer'
    )
  } finally {
    fs.rmSync(ideIllegalRoot, { recursive: true, force: true })
  }

  // Case: Default/.ide 文件端口等于 9420（automator 端口，不可作为 IDE 控制端口）
  const ideEqualsWsPortRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-ide-equal-'))
  try {
    fs.mkdirSync(path.join(ideEqualsWsPortRoot, 'Default'), { recursive: true })
    fs.writeFileSync(path.join(ideEqualsWsPortRoot, 'Default', '.ide'), '9420')
    const ideEqualsRunner = (command, args) => {
      if (command === 'lsof' && args.includes('-t')) {
        return { status: 0, stdout: '901\n', stderr: '' }
      }
      if (command === 'ps' && args.includes('901')) {
        return { status: 0, stdout: '900 renderer-process\n', stderr: '' }
      }
      if (command === 'ps' && args.includes('900')) {
        return {
          status: 0,
          stdout: `1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools --user-data-dir=${ideEqualsWsPortRoot}\n`,
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
      throw new Error(`unexpected ide-equal command: ${command} ${args.join(' ')}`)
    }

    const ideEqualsRuntime = inspectDevToolsRuntime({
      expectedProjectPath: projectPath,
      commandRunner: ideEqualsRunner
    })
    assert.equal(
      ideEqualsRuntime.control_port_source,
      'unavailable',
      '.ide equals 9420: control_port_source should be unavailable (9420 is automator port, never IDE control port)'
    )
    assert.notEqual(
      ideEqualsRuntime.control_port,
      9420,
      '.ide equals 9420: control_port must never be 9420'
    )
  } finally {
    fs.rmSync(ideEqualsWsPortRoot, { recursive: true, force: true })
  }

  // Case: Default/.ide 文件端口未监听（有效正整数但无进程监听）
  const ideNotListeningRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-ide-nolisten-'))
  try {
    fs.mkdirSync(path.join(ideNotListeningRoot, 'Default'), { recursive: true })
    fs.writeFileSync(path.join(ideNotListeningRoot, 'Default', '.ide'), '27022')
    const ideNotListeningRunner = (command, args) => {
      if (command === 'lsof' && args.includes('-t')) {
        const port = args.find(value => String(value).startsWith('-iTCP:'))
        // 9420 有监听，27022 无监听
        return { status: 0, stdout: port === '-iTCP:9420' ? '901\n' : '', stderr: '' }
      }
      if (command === 'ps' && args.includes('901')) {
        return { status: 0, stdout: '900 renderer-process\n', stderr: '' }
      }
      if (command === 'ps' && args.includes('900')) {
        return {
          status: 0,
          stdout: `1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools --user-data-dir=${ideNotListeningRoot}\n`,
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
      throw new Error(`unexpected ide-nolisten command: ${command} ${args.join(' ')}`)
    }

    const ideNotListeningRuntime = inspectDevToolsRuntime({
      expectedProjectPath: projectPath,
      commandRunner: ideNotListeningRunner
    })
    assert.equal(
      ideNotListeningRuntime.control_port_source,
      'unavailable',
      '.ide not listening: control_port_source should be unavailable when .ide port has no listener'
    )
  } finally {
    fs.rmSync(ideNotListeningRoot, { recursive: true, force: true })
  }

  // Case: Default/.ide 缺失而 root .ide 成功（版本兼容回退）
  const ideRootFallbackRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-ide-rootfb-'))
  try {
    const rootFallbackPort = 27024
    // 不创建 Default/.ide，只在 root 创建 .ide
    fs.writeFileSync(path.join(ideRootFallbackRoot, '.ide'), String(rootFallbackPort))
    const ideRootFallbackRunner = (command, args) => {
      const port = args.find(value => String(value).startsWith('-iTCP:'))
      if (command === 'lsof' && args.includes('-t')) {
        if (port === '-iTCP:9420') {
          return { status: 0, stdout: '901\n', stderr: '' }
        }
        if (port === `-iTCP:${rootFallbackPort}`) {
          return { status: 0, stdout: '900\n', stderr: '' }
        }
        return { status: 0, stdout: '', stderr: '' }
      }
      if (command === 'ps' && args.includes('901')) {
        return { status: 0, stdout: '900 renderer-process\n', stderr: '' }
      }
      if (command === 'ps' && args.includes('900')) {
        return {
          status: 0,
          stdout: `1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools --user-data-dir=${ideRootFallbackRoot}\n`,
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
      throw new Error(`unexpected ide-rootfb command: ${command} ${args.join(' ')}`)
    }
    const ideRootFallbackRuntime = inspectDevToolsRuntime({
      expectedProjectPath: projectPath,
      commandRunner: ideRootFallbackRunner
    })
    assert.equal(
      ideRootFallbackRuntime.control_port,
      rootFallbackPort,
      'root fallback: control_port should be 27024 from root .ide when Default/.ide missing'
    )
    assert.equal(
      ideRootFallbackRuntime.control_port_source,
      'user_data_ide_port_file',
      'root fallback: control_port_source should be user_data_ide_port_file'
    )
  } finally {
    fs.rmSync(ideRootFallbackRoot, { recursive: true, force: true })
  }

  // Case: Default/.ide 存在但非法，root .ide 含有效端口 => 不得静默转 root 提升（应失败）
  // 此场景在 ideIllegalRoot 已覆盖（Default/.ide='not-a-port', root .ide='27023'），
  // 这里额外验证 control_port 确实未被 root .ide 的 27023 覆盖。
  // 已在 ideIllegalRuntime 断言 control_port_source='unavailable' 覆盖此契约。

  // Case: .ide 文件有效时恢复动作使用该端口作为 localhost control endpoint。
  const ideRecoveryCalls = []
  const ideRecovered = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: ideValidRuntime,
    runtimeInspector: () => ({
      ...ideValidRuntime,
      automation_listener_pid: 902,
      port_owner_pid: 902
    }),
    observationAttempts: 2,
    observationDelayMs: 0,
    commandRunner: (command, args) => {
      return { status: 0, stdout: `${args[0]} ok`, stderr: '' }
    },
    controlRequest: async request => {
      ideRecoveryCalls.push(request)
      return successfulControlRequest(request)
    }
  })
  assert.equal(ideRecovered.status, 'recovered', '.ide recovery should succeed')
  for (const call of ideRecoveryCalls) {
    assert.equal(
      call.controlPort,
      idePort,
      '.ide recovery: request must use the .ide control port (27021)'
    )
  }
  const ideAutoCall = ideRecoveryCalls.find(call => call.action === 'auto')
  assert.equal(
    ideAutoCall.wsPort,
    9420,
    '.ide recovery: auto endpoint must receive Automator port 9420'
  )
} finally {
  fs.rmSync(ideRoot, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
// dispatch-20260726-devtools-screenshot-recovery-zcode rework 4:
// 未加引号且含空格的 --user-data-dir 路径正确解析。
// DevTools 主进程参数如 --user-data-dir=/Users/jay/Library/Application Support/微信开发者工具 --package-dir=...
// 旧正则 \S+ 只解析到第一个空格，导致 .ide 路径错误。
// 修复后值应从 --user-data-dir= 开始到下一个 --<option> 边界。
// ---------------------------------------------------------------------------
const ideSpaceRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'dispatch-ide-space-'))
try {
  // 创建一个含空格的子目录路径，模拟真实 DevTools user-data-dir
  const spacePath = path.join(ideSpaceRoot, 'Application Support')
  fs.mkdirSync(path.join(spacePath, 'Default'), { recursive: true })
  const spaceIdePort = 27025
  fs.writeFileSync(path.join(spacePath, 'Default', '.ide'), String(spaceIdePort))

  const ideSpaceRunner = (command, args) => {
    const port = args.find(value => String(value).startsWith('-iTCP:'))
    if (command === 'lsof' && args.includes('-t')) {
      if (port === '-iTCP:9420') {
        return { status: 0, stdout: '901\n', stderr: '' }
      }
      if (port === `-iTCP:${spaceIdePort}`) {
        return { status: 0, stdout: '900\n', stderr: '' }
      }
      return { status: 0, stdout: '', stderr: '' }
    }
    if (command === 'ps' && args.includes('901')) {
      return { status: 0, stdout: '900 renderer-process\n', stderr: '' }
    }
    if (command === 'ps' && args.includes('900')) {
      // 未加引号且含空格的 --user-data-dir，后面跟 --package-dir
      return {
        status: 0,
        stdout: `1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools --user-data-dir=${spacePath} --package-dir=package.nw\n`,
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
    throw new Error(`unexpected ide-space command: ${command} ${args.join(' ')}`)
  }

  const ideSpaceRuntime = inspectDevToolsRuntime({
    expectedProjectPath: projectPath,
    commandRunner: ideSpaceRunner
  })
  assert.equal(
    ideSpaceRuntime.status,
    'verified',
    'unquoted space path: runtime should be verified when Default/.ide resolves through spaced path'
  )
  assert.equal(
    ideSpaceRuntime.control_port,
    spaceIdePort,
    'unquoted space path: control_port should be 27025 from Default/.ide'
  )
  assert.equal(
    ideSpaceRuntime.control_port_source,
    'user_data_ide_port_file',
    'unquoted space path: control_port_source should be user_data_ide_port_file'
  )
  // 确保解析结果不包含 --package-dir（旧 \S+ 正则会截断到第一个空格）
  const idePortEvidence = ideSpaceRuntime.owners?.[0]?.ide_port_evidence
  if (idePortEvidence && idePortEvidence.ide_file_path) {
    assert.ok(
      !idePortEvidence.ide_file_path.includes('--package-dir'),
      'unquoted space path: ide_file_path must not contain --package-dir (path must not be truncated at space)'
    )
    assert.ok(
      idePortEvidence.ide_file_path.includes('Application Support'),
      'unquoted space path: ide_file_path must contain the full spaced path'
    )
  }
} finally {
  fs.rmSync(ideSpaceRoot, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
// dedicated QA launcher: a spaced unquoted profile must stop at a single-dash
// plugin option, otherwise owner verification would consume -load-extension.
// ---------------------------------------------------------------------------
{
  const isolatedProfile = '/Users/jay/Library/Application Support/青花植/isolated-automator-devtools'
  const isolatedPlugin = `${isolatedProfile}/WeappPlugin`
  const isolatedOwnerRunner = (command, args) => {
    if (command === 'ps' && args.includes('94220')) {
      return {
        status: 0,
        stdout: `1 /Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools --user-data-dir=${isolatedProfile} -load-extension=${isolatedPlugin} --custom-devtools-frontend=file://${isolatedPlugin}/inspector --ide-http-port 9422 --project=${projectPath}\n`,
        stderr: ''
      }
    }
    if (command === 'lsof' && args.includes('-t')) {
      return { status: 0, stdout: '94220\n', stderr: '' }
    }
    throw new Error(`unexpected dedicated profile command: ${command} ${args.join(' ')}`)
  }
  const isolatedOwnerVerification = verifyDevToolsOwnerProcess({
    owner: {
      main_devtools_pid: 94220,
      user_data_dir: isolatedProfile,
      control_port: 9422
    },
    commandRunner: isolatedOwnerRunner
  })
  assert.equal(isolatedOwnerVerification.verified, true)
  assert.equal(isolatedOwnerVerification.observed_user_data_dir, isolatedProfile)
  assert.ok(!isolatedOwnerVerification.observed_user_data_dir.includes('-load-extension'))
}

// ---------------------------------------------------------------------------
// dispatch-20260726-devtools-screenshot-recovery-zcode rework 5:
// 恢复成功证据允许二选一：PID 变化 OR after 有比 before 更新的 AUTO 记录。
// 覆盖：same PID + new valid AUTO => recovered；same PID + only stale AUTO => failed；
// same PID + new AUTO 但错误项目/端口 => failed。
// ---------------------------------------------------------------------------

// 辅助：构造带 session_log_evidence 的 verified runtime
function verifiedRuntimeWithAutoEvidence({
  mainPid = 900,
  listenerPid = 901,
  controlPort = 3799,
  autoRecords = []
}) {
  return {
    status: 'verified',
    project_identity_verified: true,
    observed_project_path: projectPath,
    main_devtools_pid: mainPid,
    automation_listener_pid: listenerPid,
    port_owner_pid: listenerPid,
    automator_port: 9420,
    control_port: controlPort,
    control_port_source: 'main_devtools_remote_port',
    control_port_verified: true,
    project_evidence: [projectPath],
    session_log_evidence: {
      status: autoRecords.length ? 'verified' : 'unavailable',
      source: 'weapp_log_current_session',
      evidence_records: autoRecords
    }
  }
}

function autoRecord({ timestamp, port = 9420, projectPath: pp = projectPath }) {
  return {
    source: 'weapp_log_current_session',
    file: 'WeappLog/logs/session.log',
    type: 'AUTO',
    timestamp,
    project_path: pp,
    automator_port: port
  }
}

// Case: same PID + new valid AUTO => recovered
// before 无 AUTO 记录，after 有新 AUTO（时间晚于 before），PID 不变
{
  const beforeAutoRuntime = verifiedRuntimeWithAutoEvidence({
    autoRecords: []
  })
  const afterAutoRuntime = verifiedRuntimeWithAutoEvidence({
    autoRecords: [
      autoRecord({ timestamp: '2026-07-27T06:00:00.000Z' })
    ]
  })
  const samePidAutoRecovered = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: beforeAutoRuntime,
    runtimeInspector: () => afterAutoRuntime,
    observationAttempts: 2,
    observationDelayMs: 0,
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
  })
  assert.equal(
    samePidAutoRecovered.status,
    'recovered',
    'same PID + new valid AUTO should recover'
  )
}

// Case: same PID + before has stale AUTO, after has newer AUTO => recovered
{
  const beforeWithStaleAuto = verifiedRuntimeWithAutoEvidence({
    autoRecords: [
      autoRecord({ timestamp: '2026-07-27T05:00:00.000Z' })
    ]
  })
  const afterWithNewerAuto = verifiedRuntimeWithAutoEvidence({
    autoRecords: [
      autoRecord({ timestamp: '2026-07-27T06:30:00.000Z' })
    ]
  })
  const samePidNewerAutoRecovered = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: beforeWithStaleAuto,
    runtimeInspector: () => afterWithNewerAuto,
    observationAttempts: 2,
    observationDelayMs: 0,
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
  })
  assert.equal(
    samePidNewerAutoRecovered.status,
    'recovered',
    'same PID + newer AUTO than before should recover'
  )
}

// Case: same PID + only stale AUTO (same timestamp as before) => failed
{
  const staleTimestamp = '2026-07-27T05:00:00.000Z'
  const beforeWithAuto = verifiedRuntimeWithAutoEvidence({
    autoRecords: [autoRecord({ timestamp: staleTimestamp })]
  })
  const afterWithSameStaleAuto = verifiedRuntimeWithAutoEvidence({
    autoRecords: [autoRecord({ timestamp: staleTimestamp })]
  })
  const samePidStaleAutoFailed = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: beforeWithAuto,
    runtimeInspector: () => afterWithSameStaleAuto,
    observationAttempts: 1,
    observationDelayMs: 0,
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
  })
  assert.equal(
    samePidStaleAutoFailed.status,
    'failed_environment',
    'same PID + only stale AUTO (same timestamp) should fail'
  )
  assert.equal(
    samePidStaleAutoFailed.reason,
    'target_runtime_not_stably_restarted',
    'same PID + stale AUTO should fail with target_runtime_not_stably_restarted'
  )
}

// Case: same PID + new AUTO but wrong project => failed
{
  const beforeNoAuto = verifiedRuntimeWithAutoEvidence({ autoRecords: [] })
  const afterWrongProjectAuto = verifiedRuntimeWithAutoEvidence({
    autoRecords: [
      autoRecord({
        timestamp: '2026-07-27T06:00:00.000Z',
        projectPath: '/tmp/not-the-target-project'
      })
    ]
  })
  // afterWrongProjectAuto 的 project_path 仍是 projectPath（verifiedRuntimeWithAutoEvidence 默认），
  // 但 AUTO 记录的 project_path 是错误的，不应算作有效新 AUTO
  const samePidWrongProjectFailed = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: beforeNoAuto,
    runtimeInspector: () => afterWrongProjectAuto,
    observationAttempts: 1,
    observationDelayMs: 0,
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
  })
  assert.equal(
    samePidWrongProjectFailed.status,
    'failed_environment',
    'same PID + new AUTO but wrong project should fail'
  )
  assert.equal(
    samePidWrongProjectFailed.reason,
    'target_runtime_not_stably_restarted',
    'same PID + wrong-project AUTO should fail with target_runtime_not_stably_restarted'
  )
}

// Case: same PID + new AUTO but wrong port (9421) => failed
{
  const beforeNoAuto = verifiedRuntimeWithAutoEvidence({ autoRecords: [] })
  const afterWrongPortAuto = verifiedRuntimeWithAutoEvidence({
    autoRecords: [
      autoRecord({
        timestamp: '2026-07-27T06:00:00.000Z',
        port: 9421
      })
    ]
  })
  const samePidWrongPortFailed = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: beforeNoAuto,
    runtimeInspector: () => afterWrongPortAuto,
    observationAttempts: 1,
    observationDelayMs: 0,
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
  })
  assert.equal(
    samePidWrongPortFailed.status,
    'failed_environment',
    'same PID + new AUTO but wrong port should fail'
  )
  assert.equal(
    samePidWrongPortFailed.reason,
    'target_runtime_not_stably_restarted',
    'same PID + wrong-port AUTO should fail with target_runtime_not_stably_restarted'
  )
}

// ---------------------------------------------------------------------------
// dispatch-20260726-devtools-screenshot-recovery-zcode rework 6:
// close-settle polling + two-stable-observation
// ---------------------------------------------------------------------------

// Case: open/auto NOT invoked until pre-close 9420 listener disappears
// commandRunner returns lsof with a PID on first probe, then empty (settled)
{
  const settleCalls = []
  const settleControlCalls = []
  let lsofProbeCount = 0
  const settleRecovered = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: inspected,
    runtimeInspector: () => ({
      ...inspected,
      automation_listener_pid: 902,
      port_owner_pid: 902
    }),
    observationAttempts: 2,
    observationDelayMs: 0,
    closeSettleAttempts: 5,
    closeSettleDelayMs: 0,
    commandRunner: (command, args) => {
      settleCalls.push({ command, args: [...args] })
      if (command === 'lsof' && args.includes('-t') && args.some(a => String(a).startsWith('-iTCP:9420'))) {
        lsofProbeCount += 1
        // First probe: old listener still present; subsequent: gone
        return { status: 0, stdout: lsofProbeCount === 1 ? '901\n' : '', stderr: '' }
      }
      return { status: 0, stdout: `${args[0]} ok`, stderr: '' }
    },
    controlRequest: async request => {
      settleControlCalls.push(request.action)
      return successfulControlRequest(request)
    }
  })
  // close must come before open/auto, and open must not appear until lsof shows listener gone
  assert.equal(settleRecovered.status, 'recovered', 'settle recovery should succeed after listener gone')
  assert.deepEqual(settleControlCalls, ['close', 'open', 'auto'], 'control requests must be close->open->auto in order')
  assert.ok(lsofProbeCount >= 2, 'close-settle must poll lsof at least twice (present then gone)')
}

// Case: close-settle timeout => failed_environment with distinct reason, open/auto NOT invoked
{
  const timeoutCalls = []
  const timeoutControlCalls = []
  const settleTimeout = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: inspected,
    runtimeInspector: () => inspected,
    observationAttempts: 2,
    observationDelayMs: 0,
    closeSettleAttempts: 3,
    closeSettleDelayMs: 0,
    commandRunner: (command, args) => {
      timeoutCalls.push({ command, args: [...args] })
      // lsof always returns the old listener PID (never settles)
      if (command === 'lsof' && args.includes('-t') && args.some(a => String(a).startsWith('-iTCP:9420'))) {
        return { status: 0, stdout: '901\n', stderr: '' }
      }
      return { status: 0, stdout: `${args[0]} ok`, stderr: '' }
    },
    controlRequest: async request => {
      timeoutControlCalls.push(request.action)
      return successfulControlRequest(request)
    }
  })
  assert.equal(settleTimeout.status, 'failed_environment', 'close-settle timeout should fail')
  assert.equal(settleTimeout.code, 'devtools_automator_blocker')
  assert.equal(settleTimeout.reason, 'target_close_did_not_settle_within_window', 'distinct reason for close-settle timeout')
  assert.deepEqual(timeoutControlCalls, ['close'], 'open/auto must NOT be invoked when close did not settle')
}

// Case: one-shot post-auto verified+new-AUTO followed by unavailable => NOT recovered
{
  const unstableInspector = (() => {
    let callCount = 0
    return () => {
      callCount += 1
      // First observation: verified with new AUTO (PID change)
      // Second observation: unavailable (9420 gone - delayed teardown)
      if (callCount === 1) {
        return {
          ...inspected,
          automation_listener_pid: 902,
          port_owner_pid: 902,
          session_log_evidence: {
            status: 'verified',
            evidence_records: [
              autoRecord({ timestamp: '2026-07-27T08:00:00.000Z' })
            ]
          }
        }
      }
      return {
        status: 'unavailable',
        project_identity_verified: false,
        observed_project_path: 'unavailable',
        port_owner_pid: 'unavailable',
        automator_port: 9420,
        control_port: 'unavailable',
        project_evidence: [],
        session_log_evidence: null
      }
    }
  })()
  const unstableResult = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: inspected,
    runtimeInspector: unstableInspector,
    observationAttempts: 3,
    observationDelayMs: 0,
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
  })
  assert.equal(unstableResult.status, 'failed_environment', 'one-shot stable then unavailable must NOT recover')
  assert.equal(unstableResult.reason, 'target_runtime_not_reverified_after_recovery', 'unstable post-auto should fail with not_reverified')
}

// Case: two stable verified post-auto observations with valid same-PID fresh AUTO => recovered
{
  const stableAfterAuto = {
    ...inspected,
    session_log_evidence: {
      status: 'verified',
      evidence_records: [
        autoRecord({ timestamp: '2026-07-27T08:00:00.000Z' })
      ]
    }
  }
  const twoStableRecovered = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: inspected,
    runtimeInspector: () => stableAfterAuto,
    observationAttempts: 3,
    observationDelayMs: 0,
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
  })
  assert.equal(twoStableRecovered.status, 'recovered', 'two stable verified+new-AUTO observations should recover')
  assert.ok(
    twoStableRecovered.observation_attempts.length >= 2,
    'recovered must have at least 2 observation attempts (two-stable requirement)'
  )
  // rework 7: recovered result carries close_settle_evidence
  assert.ok(
    twoStableRecovered.close_settle_evidence,
    'recovered result should carry close_settle_evidence'
  )
}

// ---------------------------------------------------------------------------
// dispatch-20260726-devtools-screenshot-recovery-zcode rework 7:
// Default close-settle budget must represent a 20-second bounded window.
// ---------------------------------------------------------------------------

// Case: default budget contract — close-settle timeout uses default 20s window
// Inject a commandRunner where lsof always returns the old PID (never settles),
// but use short injected closeSettleAttempts to keep test fast. Assert the
// close_settle_evidence reports the injected budget, and separately verify
// the default constants represent 20s.
{
  const defaultBudgetRecovered = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: inspected,
    runtimeInspector: () => inspected,
    observationAttempts: 2,
    observationDelayMs: 0,
    closeSettleAttempts: 3,
    closeSettleDelayMs: 0,
    commandRunner: (command, args) => {
      if (command === 'lsof' && args.includes('-t') && args.some(a => String(a).startsWith('-iTCP:9420'))) {
        return { status: 0, stdout: '901\n', stderr: '' }
      }
      return { status: 0, stdout: `${args[0]} ok`, stderr: '' }
    }
  })
  assert.equal(defaultBudgetRecovered.status, 'failed_environment')
  assert.equal(defaultBudgetRecovered.reason, 'target_close_did_not_settle_within_window')
  // close_settle_evidence should report injected budget
  assert.ok(defaultBudgetRecovered.close_settle_evidence, 'timeout result should carry close_settle_evidence')
  assert.equal(defaultBudgetRecovered.close_settle_evidence.budget_attempts, 3)
  assert.equal(defaultBudgetRecovered.close_settle_evidence.budget_delay_ms, 0)
  assert.equal(defaultBudgetRecovered.close_settle_evidence.attempts_used, 3)
  assert.equal(defaultBudgetRecovered.close_settle_evidence.settled, false)
}

// Case: default budget represents 20-second bounded window (40 × 500ms = 20000ms)
// Verify by using defaults (no injection) with a commandRunner that settles on 2nd probe.
// The close_settle_evidence should show budget_attempts=40, budget_delay_ms=500.
{
  const defaultWindowRecovered = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: inspected,
    runtimeInspector: () => ({
      ...inspected,
      automation_listener_pid: 902,
      port_owner_pid: 902
    }),
    observationAttempts: 2,
    observationDelayMs: 0,
    // Do NOT inject closeSettleAttempts/closeSettleDelayMs — use defaults
    commandRunner: (() => {
      let lsofCount = 0
      return (command, args) => {
        if (command === 'lsof' && args.includes('-t') && args.some(a => String(a).startsWith('-iTCP:9420'))) {
          lsofCount += 1
          // First probe (pre-close): listener present; after close: gone
          return { status: 0, stdout: lsofCount <= 1 ? '901\n' : '', stderr: '' }
        }
        return { status: 0, stdout: `${args[0]} ok`, stderr: '' }
      }
    })()
  })
  assert.equal(defaultWindowRecovered.status, 'recovered', 'default window recovery should succeed')
  assert.ok(defaultWindowRecovered.close_settle_evidence, 'recovered should carry close_settle_evidence')
  // Default budget: 40 attempts × 500ms = 20000ms (20-second bounded window)
  assert.equal(
    defaultWindowRecovered.close_settle_evidence.budget_attempts,
    40,
    'default close-settle budget_attempts should be 40'
  )
  assert.equal(
    defaultWindowRecovered.close_settle_evidence.budget_delay_ms,
    500,
    'default close-settle budget_delay_ms should be 500'
  )
  assert.equal(
    defaultWindowRecovered.close_settle_evidence.budget_attempts * defaultWindowRecovered.close_settle_evidence.budget_delay_ms,
    20000,
    'default close-settle window should be 20000ms (20 seconds)'
  )
  assert.equal(defaultWindowRecovered.close_settle_evidence.settled, true)
}

// ---------------------------------------------------------------------------
// dispatch-20260727 automator runtime hardening r4:
// Bootstrap and close/open/auto recovery must share a 40 × 500ms observation
// budget. Both simulations inject a zero observation delay, so these tests never
// sleep while still proving that a stable target appearing after the old five
// observation window is accepted only with the existing evidence requirements.
// ---------------------------------------------------------------------------

// Case: both default paths exhaust exactly 40 observations when 9420 never
// returns. The injected zero delay keeps this deterministic and sleep-free.
{
  const unavailableRuntime = () => ({ status: 'unavailable' })
  const exhaustedBootstrap = await enableAutomatorForVerifiedTargetDevTools({
    projectPath,
    targetDiscoverer: () => ({
      status: 'target_ready',
      control_port: inspected.control_port
    }),
    runtimeInspector: unavailableRuntime,
    observationDelayMs: 0,
    controlRequest: successfulControlRequest
  })
  assert.equal(exhaustedBootstrap.status, 'failed_environment')
  assert.equal(
    exhaustedBootstrap.observation_attempts.length,
    40,
    'bootstrap default observation budget must be exactly 40 attempts'
  )

  const exhaustedRecovery = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: inspected,
    runtimeInspector: unavailableRuntime,
    observationDelayMs: 0,
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
  })
  assert.equal(exhaustedRecovery.status, 'failed_environment')
  assert.equal(
    exhaustedRecovery.observation_attempts.length,
    40,
    'close/open/auto default observation budget must be exactly 40 attempts'
  )
}

// Case: bootstrap remains bounded by the default 40-observation budget and accepts
// a verified target that starts listening on 9420 at observation 36.
{
  let bootstrapInspectionCount = 0
  const lateBootstrap = await enableAutomatorForVerifiedTargetDevTools({
    projectPath,
    targetDiscoverer: () => ({
      status: 'target_ready',
      control_port: inspected.control_port
    }),
    runtimeInspector: () => {
      bootstrapInspectionCount += 1
      if (bootstrapInspectionCount < 36) {
        return { status: 'unavailable' }
      }
      return {
        ...inspected,
        automation_listener_pid: 902,
        port_owner_pid: 902
      }
    },
    observationDelayMs: 0,
    controlRequest: successfulControlRequest
  })
  assert.equal(lateBootstrap.status, 'enabled', 'late verified 9420 bootstrap should be enabled')
  assert.equal(
    lateBootstrap.observation_attempts.length,
    36,
    'bootstrap must retain observing beyond the former five-attempt window'
  )
  assert.equal(
    lateBootstrap.after.project_identity_verified,
    true,
    'bootstrap success must still retain target project identity proof'
  )
  assert.equal(
    lateBootstrap.after.automation_listener_pid,
    902,
    'bootstrap success must still retain the new 9420 listener proof'
  )
}

// Case: close/open/auto recovery accepts a target that becomes verified at observation
// 36 only after two consecutive stable snapshots and a changed listener PID prove restart.
{
  let recoveryInspectionCount = 0
  const lateStableRecovery = await recoverVerifiedTargetDevTools({
    projectPath,
    verifiedRuntime: inspected,
    runtimeInspector: () => {
      recoveryInspectionCount += 1
      if (recoveryInspectionCount < 36) {
        return { status: 'unavailable' }
      }
      return {
        ...inspected,
        automation_listener_pid: 902,
        port_owner_pid: 902
      }
    },
    observationDelayMs: 0,
    commandRunner: () => ({ status: 0, stdout: '', stderr: '' })
  })
  assert.equal(
    lateStableRecovery.status,
    'recovered',
    'late stable target must recover instead of failing after five observations'
  )
  assert.deepEqual(
    lateStableRecovery.invocations.map(item => item.action),
    ['close', 'open', 'auto'],
    'HTTP 200 control requests remain insufficient without full post-recovery proof'
  )
  assert.equal(
    lateStableRecovery.observation_attempts.length,
    37,
    'recovery must wait for observations 36 and 37 to establish two consecutive stable snapshots'
  )
  assert.deepEqual(
    lateStableRecovery.observation_attempts.slice(-2).map(snapshot => snapshot.automation_listener_pid),
    [902, 902],
    'the final two snapshots must prove a stable 9420 listener'
  )
  assert.equal(
    lateStableRecovery.after.project_identity_verified,
    true,
    'recovery success must retain target project identity proof'
  )
  assert.equal(
    lateStableRecovery.before.automation_listener_pid,
    901,
    'recovery proof starts from the original listener PID'
  )
  assert.equal(
    lateStableRecovery.after.automation_listener_pid,
    902,
    'changed listener PID is required restartProven evidence'
  )
}
