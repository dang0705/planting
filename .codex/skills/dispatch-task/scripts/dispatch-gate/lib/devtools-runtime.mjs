import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { readCurrentSessionProjectEvidence } from './devtools-session-log.mjs'

export { readCurrentSessionProjectEvidence } from './devtools-session-log.mjs'

export { controlPortFromIdeFile }

export const DEVTOOLS_CONTROL_HOST = '127.0.0.1'

const MAX_ANCESTOR_HOPS = 16
// Bootstrap and close/open/auto recovery share one bounded 20-second observation window.
// Control endpoint HTTP 200 only acknowledges the request; success still requires the
// target runtime's own post-request identity and Automator evidence.
const RECOVERY_OBSERVATION_ATTEMPTS = 40
const RECOVERY_OBSERVATION_DELAY_MS = 500
// dispatch-20260726-devtools-screenshot-recovery-zcode rework 6:
// close-settle 轮询：close 成功后等待 pre-recovery 9420 listener PID 消失，
// 避免 close/open/auto 背靠背导致的 delayed-close race。
// rework 7: 默认 20 秒有界轮询窗口（40 attempts × 500ms），覆盖实测 DevTools teardown 延迟
// （9420 在 ~5 秒后才消失），同时保持有界安全上限。注入参数可用于确定性测试。
const CLOSE_SETTLE_ATTEMPTS = 40
const CLOSE_SETTLE_DELAY_MS = 500

export function normalizeRuntimePath(value) {
  return path.resolve(String(value ?? '')).replaceAll('\\', '/')
}

function commandText(commandRunner, command, args, options = {}) {
  try {
    const result = commandRunner(command, args, { encoding: 'utf8', ...options })
    return {
      status: result?.status ?? null,
      stdout: String(result?.stdout ?? ''),
      stderr: String(result?.stderr ?? result?.error?.message ?? '')
    }
  } catch (error) {
    return { status: null, stdout: '', stderr: error.message }
  }
}

function listenerPids(port, commandRunner) {
  const output = commandText(commandRunner, 'lsof', [
    '-nP',
    `-iTCP:${port}`,
    '-sTCP:LISTEN',
    '-t'
  ]).stdout
  return [...new Set(output.split(/\s+/).filter(value => /^\d+$/.test(value)))].map(Number)
}

function processInfo(pid, commandRunner) {
  const raw = commandText(commandRunner, 'ps', [
    '-p',
    String(pid),
    '-o',
    'ppid=,command='
  ]).stdout.trim()
  const match = raw.match(/^(\d+)\s+(.+)$/)
  return match
    ? { pid: Number(pid), parent_pid: Number(match[1]), command: match[2] }
    : { pid: Number(pid), parent_pid: null, command: '' }
}

function ancestorsFrom(pid, commandRunner) {
  const ancestors = []
  const visited = new Set()
  let currentPid = Number(pid)
  while (
    Number.isInteger(currentPid) &&
    currentPid > 1 &&
    !visited.has(currentPid) &&
    ancestors.length < MAX_ANCESTOR_HOPS
  ) {
    visited.add(currentPid)
    const current = processInfo(currentPid, commandRunner)
    ancestors.push(current)
    currentPid = current.parent_pid
  }
  return ancestors
}

function isMainDevToolsProcess(command = '') {
  return /\/Contents\/MacOS\/wechatdevtools(?:\s|$)/.test(command)
}

function directControlPortEvidence(command = '') {
  const ideHttpMatch = command.match(/--ide-http-port(?:=|\s+)(\d+)/)
  if (ideHttpMatch) {
    return { port: Number(ideHttpMatch[1]), source: 'main_devtools_ide_http_port' }
  }
  const legacyRemoteMatch = command.match(/--remote-port(?:=|\s+)(\d+)/)
  return legacyRemoteMatch
    ? { port: Number(legacyRemoteMatch[1]), source: 'main_devtools_remote_port' }
    : { port: null, source: 'unavailable' }
}

function controlPortFrom(command = '') {
  return directControlPortEvidence(command).port
}

function controlPortListenerEvidence(controlPort, mainPid, commandRunner) {
  const verifiedMainPid = Number(mainPid)
  const controlListenerPids =
    positiveInteger(controlPort) && positiveInteger(verifiedMainPid)
      ? listenerPids(controlPort, commandRunner)
      : []
  const listenerChains = controlListenerPids.map(listenerPid => {
    const topology =
      Number(listenerPid) === verifiedMainPid
        ? [{ pid: verifiedMainPid, parent_pid: null, command: '' }]
        : ancestorsFrom(listenerPid, commandRunner)
    const descendantOfMain = topology.some(process => process.pid === verifiedMainPid)
    return {
      listener_pid: Number(listenerPid),
      parent_chain_pids: topology.map(process => process.pid),
      descendant_of_main: descendantOfMain
    }
  })
  const verifiedListenerPids = listenerChains
    .filter(listener => listener.descendant_of_main)
    .map(listener => listener.listener_pid)
  return {
    control_port: positiveInteger(controlPort) ? Number(controlPort) : null,
    main_devtools_pid: positiveInteger(verifiedMainPid) ? verifiedMainPid : null,
    listener_pids: controlListenerPids,
    verified_listener_pids: verifiedListenerPids,
    listener_parent_chains: listenerChains,
    verified: verifiedListenerPids.length > 0
  }
}

function mainDevToolsProcesses(commandRunner) {
  const output = commandText(commandRunner, 'ps', ['-ax', '-o', 'pid=,ppid=,command=']).stdout
  return output
    .split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map(match => ({ pid: Number(match[1]), parent_pid: Number(match[2]), command: match[3] }))
    .filter(process => isMainDevToolsProcess(process.command))
}

// dispatch-20260726-devtools-screenshot-recovery-zcode: 当主进程 --remote-port 缺失时，
// 从同一 DevTools user-data-dir 的 .ide 文件读取运行中的 IDE HTTP 服务端口。
// DevTools CLI 源码证实 .ide 文件保存当前运行中的 IDE HTTP 服务端口。
// rework 4: 正确解析 --user-data-dir 的三种形式：带双引号、带单引号、未加引号但路径含空格。
// 未加引号时，值从 --user-data-dir=（或空格形式）开始，直到下一个 -/-- option 参数边界，
// 而不是第一个空格。避免 /Users/jay/Library/Application Support/... 被截断。
function userDataDirFromCommand(command = '') {
  const match = command.match(
    /--user-data-dir(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(.*?)(?=\s+-{1,2}[\w-]|\s*$))/
  )
  return match ? (match[1] ?? match[2] ?? match[3]?.trim() ?? '') : ''
}

// dispatch-20260726-devtools-screenshot-recovery-zcode rework 3: .ide 端口文件实际位于
// <user-data-dir>/Default/.ide（当前 DevTools 事实位置）。优先读取 Default/.ide；
// Default 不存在/不可读时才回退到根 <user-data-dir>/.ide（版本兼容）。
// Default/.ide 存在但非法时不得静默转 root 提升（应失败），避免错误端口被绕过。
function controlPortFromIdeFile(mainProcess = null, commandRunner = spawnSync, wsPort = 9420) {
  if (!mainProcess?.command) {
    return { port: null, source: 'unavailable', reason: 'main_process_missing', ide_file_path: '' }
  }
  const userDataDir = userDataDirFromCommand(mainProcess.command)
  if (!userDataDir) {
    return { port: null, source: 'unavailable', reason: 'user_data_dir_missing', ide_file_path: '' }
  }
  // 候选路径：优先 Default/.ide，回退 root .ide
  const defaultIdePath = path.join(userDataDir, 'Default', '.ide')
  const rootIdePath = path.join(userDataDir, '.ide')
  let ideFilePath = ''
  let rawPort
  let defaultExists = false
  // 先尝试 Default/.ide
  try {
    const content = fs.readFileSync(defaultIdePath, 'utf8').trim()
    rawPort = content
    ideFilePath = defaultIdePath
    defaultExists = true
  } catch {
    // Default/.ide 不存在或不可读：检查是否是"文件不存在"还是"读取错误"
    // 仅在文件不存在时回退到 root .ide；读取错误（如权限）不回退
    try {
      fs.accessSync(defaultIdePath, fs.constants.F_OK)
      // 文件存在但读取失败：不回退，返回错误
      return {
        port: null,
        source: 'unavailable',
        reason: 'ide_file_missing_or_unreadable',
        ide_file_path: defaultIdePath
      }
    } catch {
      // Default/.ide 文件不存在：回退到 root .ide
    }
  }
  // Default/.ide 不存在时回退到 root .ide
  if (!defaultExists) {
    try {
      const content = fs.readFileSync(rootIdePath, 'utf8').trim()
      rawPort = content
      ideFilePath = rootIdePath
    } catch {
      return {
        port: null,
        source: 'unavailable',
        reason: 'ide_file_missing_or_unreadable',
        ide_file_path: ''
      }
    }
  }
  const parsedPort = Number(rawPort)
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    return {
      port: null,
      source: 'unavailable',
      reason: 'ide_file_port_not_positive_integer',
      ide_file_path: ideFilePath
    }
  }
  // 9420 始终只作为 automator 端口，永不作为 IDE HTTP 控制端口
  if (parsedPort === Number(wsPort)) {
    return {
      port: null,
      source: 'unavailable',
      reason: 'ide_file_port_equals_automator_port',
      ide_file_path: ideFilePath
    }
  }
  // 验证端口在本机监听
  const listeners = listenerPids(parsedPort, commandRunner)
  if (!listeners.length) {
    return {
      port: null,
      source: 'unavailable',
      reason: 'ide_file_port_not_listening',
      ide_file_path: ideFilePath
    }
  }
  return {
    port: parsedPort,
    source: 'user_data_ide_port_file',
    reason: '',
    ide_file_path: ideFilePath
  }
}

function projectPathsFromCommand(command = '') {
  const matches = command.matchAll(/--project(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/g)
  return [...matches]
    .map(match => match[1] ?? match[2] ?? match[3])
    .filter(Boolean)
    .map(normalizeRuntimePath)
}

function projectPathsFromOpenFiles(text = '') {
  return text
    .split('\n')
    .filter(line => line.startsWith('n') && line.endsWith('/project.config.json'))
    .map(line => normalizeRuntimePath(path.dirname(line.slice(1))))
}

function projectEvidenceForTopology(topology, commandRunner) {
  const records = []
  for (const process of topology) {
    const openFiles = commandText(commandRunner, 'lsof', [
      '-n',
      '-p',
      String(process.pid),
      '-Fn'
    ]).stdout
    const paths = [
      ...new Set([
        ...projectPathsFromCommand(process.command),
        ...projectPathsFromOpenFiles(openFiles)
      ])
    ]
    for (const projectPath of paths) {
      records.push({ pid: process.pid, project_path: projectPath })
    }
  }
  return records
}

function inspectAutomationOwner(pid, commandRunner, wsPort = 9420) {
  const topology = ancestorsFrom(pid, commandRunner)
  const main = topology.find(process => isMainDevToolsProcess(process.command))
  const directControlPort = directControlPortEvidence(main?.command)
  const controlPort = directControlPort.port
  // 安装版优先以 --ide-http-port 暴露 CLI HTTP listener；旧版 --remote-port 保持兼容。
  // 两者都缺失时，
  // 从同一 user-data-dir 的 .ide 文件解析控制端口。
  // 才从同一 user-data-dir 的 .ide 文件解析控制端口，验证正整数、本机监听、与 wsPort 不同。
  let resolvedControlPort = controlPort
  let controlPortSource = directControlPort.source
  let idePortEvidence = null
  if (!controlPort && main) {
    const idePortResult = controlPortFromIdeFile(main, commandRunner, wsPort)
    idePortEvidence = idePortResult
    if (idePortResult.port) {
      resolvedControlPort = idePortResult.port
      controlPortSource = idePortResult.source
    }
  }
  const projectEvidence = projectEvidenceForTopology(topology, commandRunner)
  return {
    automation_listener_pid: Number(pid),
    main_devtools_pid: main?.pid ?? null,
    main_devtools_parent_pid: main?.parent_pid ?? null,
    main_process: main ?? null,
    control_port: resolvedControlPort,
    control_port_source: controlPortSource,
    ide_port_evidence: idePortEvidence,
    topology,
    project_evidence_records: projectEvidence,
    project_paths: [...new Set(projectEvidence.map(item => item.project_path))]
  }
}

function runtimeSnapshot(runtime = {}) {
  return {
    main_devtools_pid: runtime.main_devtools_pid ?? 'unavailable',
    automation_listener_pid:
      runtime.automation_listener_pid ?? runtime.port_owner_pid ?? 'unavailable',
    control_port: runtime.control_port ?? 'unavailable',
    control_port_source: runtime.control_port_source ?? 'unavailable',
    control_port_verified: runtime.control_port_verified === true,
    project_path: runtime.observed_project_path ?? 'unavailable',
    project_identity_verified: runtime.project_identity_verified === true,
    project_identity_source: runtime.project_identity_source ?? 'unavailable',
    project_evidence: runtime.project_evidence ?? [],
    project_evidence_records: runtime.project_evidence_records ?? [],
    // dispatch-20260726-devtools-screenshot-recovery-zcode rework 5: 保留 session_log_evidence
    // 供 restartProven 检查 PID 不变但恢复后出现新 AUTO 记录的场景。
    session_log_evidence: runtime.session_log_evidence ?? null
  }
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function controlRequestUrl({ action, projectPath, controlPort, wsPort }) {
  const url = new URL(`http://${DEVTOOLS_CONTROL_HOST}:${Number(controlPort)}/${action}`)
  // URLSearchParams owns the one required query-string encoding pass. Pre-encoding this
  // absolute path would turn "%2F" into "%252F" and make DevTools ignore the target.
  url.searchParams.set('cli', '1')
  url.searchParams.set('projectpath', projectPath)
  if (action === 'auto') {
    url.searchParams.set('port', String(wsPort))
    url.searchParams.set('account', '')
  }
  return url
}

export async function requestDevToolsControl({ action, projectPath, controlPort, wsPort = 9420 }) {
  if (!['close', 'open', 'auto'].includes(action) || !positiveInteger(controlPort)) {
    return { status_code: null, error: 'invalid_devtools_control_request' }
  }
  const url = controlRequestUrl({ action, projectPath, controlPort, wsPort })
  return new Promise(resolve => {
    const request = http.get(url, { timeout: 30000 }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => {
        body += chunk
      })
      response.on('end', () => {
        resolve({ status_code: response.statusCode ?? null, url: url.toString(), body_excerpt: body.slice(0, 1000) })
      })
    })
    request.once('timeout', () => request.destroy(new Error('devtools_control_timeout')))
    request.once('error', error => {
      resolve({ status_code: null, url: url.toString(), error: error.message })
    })
  })
}

async function controlInvocation(controlRequest, action, expectedProjectPath, controlPort, wsPort) {
  let result
  try {
    result = await controlRequest({
      action,
      projectPath: expectedProjectPath,
      controlPort,
      wsPort
    })
  } catch (error) {
    result = { status_code: null, error: error.message }
  }
  return {
    action,
    control_host: DEVTOOLS_CONTROL_HOST,
    control_port: Number(controlPort),
    project_path: expectedProjectPath,
    automator_port: action === 'auto' ? Number(wsPort) : null,
    status_code: result?.status_code ?? null,
    url: result?.url ?? '',
    body_excerpt: String(result?.body_excerpt ?? result?.error ?? '').slice(0, 1000)
  }
}

function validVerifiedRuntime(runtime, expectedProjectPath, wsPort) {
  return (
    runtime?.status === 'verified' &&
    runtime?.project_identity_verified === true &&
    normalizeRuntimePath(runtime?.observed_project_path) === expectedProjectPath &&
    positiveInteger(runtime?.main_devtools_pid) &&
    positiveInteger(runtime?.automation_listener_pid ?? runtime?.port_owner_pid) &&
    positiveInteger(runtime?.control_port) &&
    Number(runtime.control_port) !== Number(wsPort) &&
    runtime?.control_port_verified === true
  )
}

// dispatch-20260726-devtools-screenshot-recovery-zcode rework 5: 恢复成功证据允许二选一：
// 1. 主进程或 9420 listener PID 改变；或
// 2. PID 不变但恢复后的同一 --app-session-id WeappLog 出现比恢复前更新的 AUTO 记录，
//    且该记录精确绑定目标 projectPath 和 port 9420。
// 第二条必须是"新 AUTO"，旧 AUTO 绝不能重放为恢复成功。
function autoEvidenceTimestamps(snapshot = {}, expectedProjectPath = '', wsPort = 9420) {
  const records = snapshot?.session_log_evidence?.evidence_records ?? []
  return records
    .filter(
      record =>
        record?.type === 'AUTO' &&
        Number(record?.automator_port) === Number(wsPort) &&
        normalizeRuntimePath(record?.project_path) === expectedProjectPath
    )
    .map(record => Date.parse(record?.timestamp ?? ''))
    .filter(ts => Number.isFinite(ts))
}

function restartProven(before, after, expectedProjectPath = '', wsPort = 9420) {
  // 条件 1：PID 变化
  if (
    Number(before.main_devtools_pid) !== Number(after.main_devtools_pid) ||
    Number(before.automation_listener_pid) !== Number(after.automation_listener_pid)
  ) {
    return true
  }
  // 条件 2：PID 不变但 after 有比 before 更新的 AUTO 记录
  // 仅当 expectedProjectPath 有效时检查（恢复场景始终传入）
  if (!expectedProjectPath) {
    return false
  }
  const beforeAutoTimestamps = autoEvidenceTimestamps(before, expectedProjectPath, wsPort)
  const afterAutoTimestamps = autoEvidenceTimestamps(after, expectedProjectPath, wsPort)
  if (afterAutoTimestamps.length === 0) {
    return false
  }
  const beforeLatest = beforeAutoTimestamps.length > 0 ? Math.max(...beforeAutoTimestamps) : -Infinity
  const afterLatest = Math.max(...afterAutoTimestamps)
  // after 必须有严格晚于 before 最新 AUTO 的新记录
  return afterLatest > beforeLatest
}

export function inspectDevToolsRuntime({
  expectedProjectPath,
  wsPort = 9420,
  commandRunner = spawnSync,
  sessionLogReader = readCurrentSessionProjectEvidence
} = {}) {
  const expected = normalizeRuntimePath(expectedProjectPath)
  const automatorListenerPids = listenerPids(wsPort, commandRunner)
  const owners = automatorListenerPids.map(pid => {
    const owner = inspectAutomationOwner(pid, commandRunner, wsPort)
    const sessionLogEvidence = owner.main_process
      ? sessionLogReader({ mainProcess: owner.main_process, expectedProjectPath: expected, wsPort })
      : { status: 'unavailable', rejection: 'main_devtools_process_missing', evidence_records: [] }
    return { ...owner, session_log_evidence: sessionLogEvidence }
  })
  const controlPorts = [...new Set(owners.map(owner => owner.control_port).filter(positiveInteger))]
  const controlPortListeners = Object.fromEntries(
    controlPorts.map(port => [port, listenerPids(port, commandRunner)])
  )
  const observedPaths = [...new Set(owners.flatMap(owner => owner.project_paths))]
  const expectedOwners = owners.filter(
    owner =>
      owner.project_paths.every(projectPath => projectPath === expected) &&
      (owner.project_paths.includes(expected) || owner.session_log_evidence.status === 'verified')
  )
  const verifiedOwner = expectedOwners.find(
    owner =>
      owner.main_devtools_pid &&
      (owner.project_paths.length === 1 || owner.session_log_evidence.status === 'verified')
  )
  const projectConfigExists = fs.existsSync(path.join(expected, 'project.config.json'))
  const base = {
    automator_port: wsPort,
    automator_listener_pids: automatorListenerPids,
    expected_project_path: expected,
    project_config_exists: projectConfigExists,
    control_port_candidates: controlPorts,
    control_port_listener_pids: controlPortListeners,
    owners
  }
  if (verifiedOwner && projectConfigExists) {
    const controlPortEvidence = controlPortListenerEvidence(
      verifiedOwner.control_port,
      verifiedOwner.main_devtools_pid,
      commandRunner
    )
    return {
      status: 'verified',
      ...base,
      main_devtools_pid: verifiedOwner.main_devtools_pid,
      main_devtools_parent_pid: verifiedOwner.main_devtools_parent_pid,
      automation_listener_pid: verifiedOwner.automation_listener_pid,
      port_owner_pid: verifiedOwner.automation_listener_pid,
      control_port: verifiedOwner.control_port,
      control_port_source: verifiedOwner.control_port_source,
      control_port_verified: controlPortEvidence.verified,
      control_port_listener_evidence: controlPortEvidence,
      observed_project_path: expected,
      project_identity_verified: true,
      project_evidence: [expected],
      project_identity_source: verifiedOwner.project_paths.includes(expected)
        ? 'process_open_file'
        : 'weapp_log_current_session',
      project_evidence_records: [
        ...verifiedOwner.project_evidence_records,
        ...verifiedOwner.session_log_evidence.evidence_records
      ],
      session_log_evidence: verifiedOwner.session_log_evidence
    }
  }
  if (observedPaths.length) {
    return {
      status: 'wrong_project',
      ...base,
      main_devtools_pid: owners[0]?.main_devtools_pid ?? 'unavailable',
      automation_listener_pid: owners[0]?.automation_listener_pid ?? 'unavailable',
      port_owner_pid: owners[0]?.automation_listener_pid ?? 'unavailable',
      control_port: owners[0]?.control_port ?? 'unavailable',
      control_port_source: owners[0]?.control_port_source ?? 'unavailable',
      control_port_verified: false,
      observed_project_path: observedPaths[0],
      project_identity_verified: false,
      project_evidence: observedPaths,
      project_evidence_records: owners.flatMap(owner => owner.project_evidence_records),
      session_log_evidence: owners.map(owner => owner.session_log_evidence)
    }
  }
  return {
    status: 'unavailable',
    ...base,
    main_devtools_pid: owners[0]?.main_devtools_pid ?? 'unavailable',
    automation_listener_pid: owners[0]?.automation_listener_pid ?? 'unavailable',
    port_owner_pid: owners[0]?.automation_listener_pid ?? 'unavailable',
    control_port: owners[0]?.control_port ?? 'unavailable',
    control_port_source: owners[0]?.control_port_source ?? 'unavailable',
    control_port_verified: false,
    observed_project_path: 'unavailable',
    project_identity_verified: false,
    project_evidence: [],
    project_evidence_records: [],
    session_log_evidence: owners.map(owner => owner.session_log_evidence)
  }
}

// The formal QA runner is deliberately narrower than the regular target discovery
// path: it may only act on the DevTools process it launched with its own profile.
// Keep the regular inspector available for daily 9420 usage, then bind its result to
// the recorded QA owner before any control request is permitted.
export function inspectOwnedDevToolsRuntime({
  expectedProjectPath,
  wsPort = 9421,
  owner,
  commandRunner = spawnSync,
  sessionLogReader = readCurrentSessionProjectEvidence
} = {}) {
  const runtime = inspectDevToolsRuntime({
    expectedProjectPath,
    wsPort,
    commandRunner,
    sessionLogReader
  })
  const expectedPid = Number(owner?.main_devtools_pid)
  const expectedUserDataDir = normalizeRuntimePath(owner?.user_data_dir)
  const expectedControlPort = Number(owner?.control_port)
  const matchingOwner = runtime.owners?.find(
    candidate => Number(candidate.main_devtools_pid) === expectedPid
  )
  const observedUserDataDir = userDataDirFromCommand(matchingOwner?.main_process?.command)
  const ownershipVerified =
    runtime.status === 'verified' &&
    positiveInteger(expectedPid) &&
    Number(runtime.main_devtools_pid) === expectedPid &&
    expectedUserDataDir &&
    normalizeRuntimePath(observedUserDataDir) === expectedUserDataDir &&
    positiveInteger(expectedControlPort) &&
    Number(runtime.control_port) === expectedControlPort &&
    Number(runtime.automator_port) === Number(wsPort) &&
    runtime.control_port_verified === true
  if (!ownershipVerified) {
    return {
      ...runtime,
      status: 'unavailable',
      code: 'qa_runtime_owner_unverified',
      qa_owner_verified: false,
      expected_owner: {
        main_devtools_pid: positiveInteger(expectedPid) ? expectedPid : 'unavailable',
        user_data_dir: expectedUserDataDir || 'unavailable',
        control_port: positiveInteger(expectedControlPort) ? expectedControlPort : 'unavailable',
        automator_port: Number(wsPort)
      },
      observed_owner: {
        main_devtools_pid: runtime.main_devtools_pid ?? 'unavailable',
        user_data_dir: observedUserDataDir || 'unavailable',
        control_port: runtime.control_port ?? 'unavailable',
        automator_port: runtime.automator_port ?? Number(wsPort)
      }
    }
  }
  return { ...runtime, qa_owner_verified: true }
}

export function verifyDevToolsOwnerProcess({ owner, commandRunner = spawnSync } = {}) {
  const mainPid = Number(owner?.main_devtools_pid)
  const expectedUserDataDir = normalizeRuntimePath(owner?.user_data_dir)
  const expectedControlPort = Number(owner?.control_port)
  if (!positiveInteger(mainPid) || !expectedUserDataDir || !positiveInteger(expectedControlPort)) {
    return { verified: false, code: 'qa_runtime_owner_record_invalid' }
  }
  const process = processInfo(mainPid, commandRunner)
  const observedUserDataDir = userDataDirFromCommand(process.command)
  const observedControlPort = controlPortFrom(process.command)
  const controlPortEvidence = controlPortListenerEvidence(expectedControlPort, mainPid, commandRunner)
  const verified =
    isMainDevToolsProcess(process.command) &&
    normalizeRuntimePath(observedUserDataDir) === expectedUserDataDir &&
    Number(observedControlPort) === expectedControlPort &&
    controlPortEvidence.verified === true
  return {
    verified,
    code: verified ? '' : 'qa_runtime_owner_unverified',
    main_process: process,
    observed_user_data_dir: observedUserDataDir || 'unavailable',
    observed_control_port: observedControlPort ?? 'unavailable',
    control_port_listener_evidence: controlPortEvidence
  }
}

function bootstrapCandidate(mainProcess, expectedProjectPath, wsPort, commandRunner, sessionLogReader) {
  const directControlPort = directControlPortEvidence(mainProcess.command)
  const idePortEvidence = directControlPort.port
    ? null
    : controlPortFromIdeFile(mainProcess, commandRunner, wsPort)
  const controlPort = directControlPort.port ?? idePortEvidence?.port ?? null
  const projectEvidenceRecords = projectEvidenceForTopology([mainProcess], commandRunner)
  const projectPaths = [...new Set(projectEvidenceRecords.map(record => record.project_path))]
  const sessionLogEvidence = sessionLogReader({
    mainProcess,
    expectedProjectPath,
    wsPort,
    requireAutomatorPort: false
  })
  const directTarget = projectPaths.length === 1 && projectPaths[0] === expectedProjectPath
  const sessionTarget = sessionLogEvidence.status === 'bootstrap_verified'
  const controlPortEvidence = controlPortListenerEvidence(
    controlPort,
    mainProcess.pid,
    commandRunner
  )
  return {
    main_devtools_pid: mainProcess.pid,
    main_process: mainProcess,
    control_port: controlPort,
    control_port_source: directControlPort.port
      ? directControlPort.source
      : (idePortEvidence?.source ?? 'unavailable'),
    control_port_verified: controlPortEvidence.verified,
    control_port_listener_evidence: controlPortEvidence,
    project_paths: projectPaths,
    project_evidence_records: projectEvidenceRecords,
    session_log_evidence: sessionLogEvidence,
    target_verified: directTarget || (projectPaths.length === 0 && sessionTarget)
  }
}

export function discoverTargetDevToolsRuntime({
  expectedProjectPath,
  wsPort = 9420,
  commandRunner = spawnSync,
  sessionLogReader = readCurrentSessionProjectEvidence
} = {}) {
  const expected = normalizeRuntimePath(expectedProjectPath)
  const projectConfigExists = fs.existsSync(path.join(expected, 'project.config.json'))
  const candidates = mainDevToolsProcesses(commandRunner).map(mainProcess =>
    bootstrapCandidate(mainProcess, expected, wsPort, commandRunner, sessionLogReader)
  )
  const targets = candidates.filter(candidate => candidate.target_verified)
  const base = {
    expected_project_path: expected,
    project_config_exists: projectConfigExists,
    automator_port: wsPort,
    candidates
  }
  if (!projectConfigExists) {
    return { status: 'unavailable', code: 'project_config_missing', ...base }
  }
  if (targets.length !== 1) {
    return {
      status: targets.length > 1 ? 'ambiguous' : 'unavailable',
      code: targets.length > 1 ? 'project_identity_ambiguous' : 'project_identity_unverified',
      ...base
    }
  }
  const target = targets[0]
  if (
    !positiveInteger(target.control_port) ||
    Number(target.control_port) === Number(wsPort) ||
    target.control_port_verified !== true
  ) {
    return {
      status: 'unavailable',
      code: 'ide_control_port_unverified',
      ...base,
      target
    }
  }
  return {
    status: 'target_ready',
    ...base,
    main_devtools_pid: target.main_devtools_pid,
    control_port: target.control_port,
    control_port_source: target.control_port_source,
    control_port_verified: true,
    control_port_listener_evidence: target.control_port_listener_evidence,
    observed_project_path: expected,
    project_identity_verified: true,
    project_identity_source:
      target.project_paths.length === 1 ? 'process_open_file' : 'weapp_log_current_session',
    project_evidence_records: [
      ...target.project_evidence_records,
      ...(target.session_log_evidence.evidence_records ?? [])
    ],
    session_log_evidence: target.session_log_evidence
  }
}

export async function enableAutomatorForVerifiedTargetDevTools({
  projectPath,
  wsPort = 9420,
  runtimeInspector = inspectDevToolsRuntime,
  targetDiscoverer = discoverTargetDevToolsRuntime,
  commandRunner = spawnSync,
  sessionLogReader = readCurrentSessionProjectEvidence,
  controlRequest = requestDevToolsControl,
  observationAttempts = RECOVERY_OBSERVATION_ATTEMPTS,
  observationDelayMs = RECOVERY_OBSERVATION_DELAY_MS
} = {}) {
  const expected = normalizeRuntimePath(projectPath)
  const before = targetDiscoverer({
    expectedProjectPath: expected,
    wsPort,
    commandRunner,
    sessionLogReader
  })
  if (before.status !== 'target_ready') {
    return {
      status: 'failed_environment',
      code: before.code ?? 'project_identity_unverified',
      reason: 'target_devtools_runtime_not_safely_discovered',
      before,
      invocations: []
    }
  }
  const autoResult = await controlInvocation(controlRequest, 'auto', expected, before.control_port, wsPort)
  if (autoResult.status_code !== 200) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_automator_enable_request_failed',
      before,
      invocations: [autoResult]
    }
  }
  let after
  const observationAttemptsEvidence = []
  for (let attempt = 1; attempt <= observationAttempts; attempt += 1) {
    after = runtimeInspector({ expectedProjectPath: expected, wsPort })
    observationAttemptsEvidence.push(runtimeSnapshot(after))
    if (validVerifiedRuntime(after, expected, wsPort)) {
      return {
        status: 'enabled',
        bootstrap: 'verified_target_ide_auto_endpoint',
        before,
        after: runtimeSnapshot(after),
        invocations: [autoResult],
        observation_attempts: observationAttemptsEvidence
      }
    }
    if (attempt < observationAttempts && observationDelayMs > 0) {
      await wait(observationDelayMs)
    }
  }
  return {
    status: 'failed_environment',
    code: 'devtools_automator_blocker',
    reason: 'automator_port_not_verified_after_target_enable',
    before,
    after: runtimeSnapshot(after),
    invocations: [autoResult],
    observation_attempts: observationAttemptsEvidence
  }
}

export async function recoverVerifiedTargetDevTools({
  projectPath,
  wsPort = 9420,
  verifiedRuntime,
  runtimeInspector = inspectDevToolsRuntime,
  commandRunner = spawnSync,
  controlRequest = requestDevToolsControl,
  observationAttempts = RECOVERY_OBSERVATION_ATTEMPTS,
  observationDelayMs = RECOVERY_OBSERVATION_DELAY_MS,
  closeSettleAttempts = CLOSE_SETTLE_ATTEMPTS,
  closeSettleDelayMs = CLOSE_SETTLE_DELAY_MS
} = {}) {
  const expected = normalizeRuntimePath(projectPath)
  const before = runtimeSnapshot(verifiedRuntime)
  if (!validVerifiedRuntime(verifiedRuntime, expected, wsPort)) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_project_runtime_not_safely_preverified',
      before,
      invocations: []
    }
  }
  if (!fs.existsSync(path.join(expected, 'project.config.json'))) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_project_or_devtools_cli_missing',
      before,
      invocations: []
    }
  }
  const controlPort = Number(verifiedRuntime.control_port)
  const invocations = []
  // The installed DevTools control server exposes target-scoped localhost endpoints.
  // This intentionally avoids the CLI's ambiguous command-line port interpretation.
  const closeResult = await controlInvocation(controlRequest, 'close', expected, controlPort, wsPort)
  invocations.push(closeResult)
  if (closeResult.status_code !== 200) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_project_recovery_command_failed',
      before,
      invocations
    }
  }

  // rework 6: close-settle 轮询。close 返回 exit 0 不代表 9420 listener 已消失。
  // 等待 pre-recovery 9420 listener PID(s) 不再监听，避免 delayed-close race 导致
  // open/auto 背靠背失败。如果 close 在有界窗口内未 settle，返回明确 blocker，不运行 open/auto。
  // rework 7: 默认 20 秒有界窗口（40×500ms），覆盖实测 DevTools teardown 延迟。
  const preCloseListenerPids = listenerPids(wsPort, commandRunner)
  const closeSettleEvidence = {
    pre_close_listener_pids: preCloseListenerPids,
    attempts_used: 0,
    settled: preCloseListenerPids.length === 0,
    budget_attempts: closeSettleAttempts,
    budget_delay_ms: closeSettleDelayMs
  }
  if (preCloseListenerPids.length > 0) {
    let settled = false
    for (let settleAttempt = 1; settleAttempt <= closeSettleAttempts; settleAttempt += 1) {
      const currentListeners = listenerPids(wsPort, commandRunner)
      const oldListenersRemaining = currentListeners.filter(pid =>
        preCloseListenerPids.includes(Number(pid))
      )
      closeSettleEvidence.attempts_used = settleAttempt
      if (oldListenersRemaining.length === 0) {
        settled = true
        closeSettleEvidence.settled = true
        break
      }
      if (settleAttempt < closeSettleAttempts && closeSettleDelayMs > 0) {
        await wait(closeSettleDelayMs)
      }
    }
    if (!settled) {
      return {
        status: 'failed_environment',
        code: 'devtools_automator_blocker',
        reason: 'target_close_did_not_settle_within_window',
        before,
        invocations,
        close_settle_evidence: closeSettleEvidence
      }
    }
  }

  const openResult = await controlInvocation(controlRequest, 'open', expected, controlPort, wsPort)
  invocations.push(openResult)
  if (openResult.status_code !== 200) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_project_recovery_command_failed',
      before,
      invocations
    }
  }

  const autoResult = await controlInvocation(controlRequest, 'auto', expected, controlPort, wsPort)
  invocations.push(autoResult)
  if (autoResult.status_code !== 200) {
    return {
      status: 'failed_environment',
      code: 'devtools_automator_blocker',
      reason: 'target_project_recovery_command_failed',
      before,
      invocations
    }
  }

  // rework 6: post-auto 观察要求两次连续稳定 verified + restartProven。
  // 单次快照可能因 delayed teardown 产生 false recovered；
  // 要求第二次观察仍 verified + restartProven，确保 9420 持续可用。
  let after
  const attempts = []
  let firstStableSnapshot = null
  for (let attempt = 1; attempt <= observationAttempts; attempt += 1) {
    after = await runtimeInspector({ expectedProjectPath: expected, wsPort })
    const afterSnapshot = runtimeSnapshot(after)
    attempts.push(afterSnapshot)
    const isVerifiedAndProven =
      validVerifiedRuntime(after, expected, wsPort) &&
      restartProven(before, afterSnapshot, expected, wsPort)
    if (isVerifiedAndProven && !firstStableSnapshot) {
      // 第一次稳定：记录但不立即返回，需要第二次确认
      firstStableSnapshot = afterSnapshot
    } else if (isVerifiedAndProven && firstStableSnapshot) {
      // 第二次连续稳定：确认 9420 持续可用，返回 recovered
      return {
        status: 'recovered',
        recovery: 'repository_owned_target_project_close_open_auto',
        before,
        after: afterSnapshot,
        invocations,
        observation_attempts: attempts,
        close_settle_evidence: closeSettleEvidence
      }
    } else {
      // 不稳定：重置 firstStable，需要重新积累两次连续稳定
      firstStableSnapshot = null
    }
    if (attempt < observationAttempts && observationDelayMs > 0) {
      await wait(observationDelayMs)
    }
  }
  return {
    status: 'failed_environment',
    code: 'devtools_automator_blocker',
    reason: validVerifiedRuntime(after, expected, wsPort)
      ? 'target_runtime_not_stably_restarted'
      : 'target_runtime_not_reverified_after_recovery',
    before,
    after: runtimeSnapshot(after),
    invocations,
    observation_attempts: attempts,
    close_settle_evidence: closeSettleEvidence
  }
}
