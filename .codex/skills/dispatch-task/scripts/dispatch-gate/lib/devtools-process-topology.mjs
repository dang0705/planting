import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const MAX_ANCESTOR_HOPS = 16

export const DEVTOOLS_CONTROL_HOST = '127.0.0.1'

export const positiveInteger = value => Number.isInteger(Number(value)) && Number(value) > 0
export const normalizeRuntimePath = value => path.resolve(String(value ?? '')).replaceAll('\\', '/')

export function commandText(commandRunner, command, args, options = {}) {
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

export function listenerPids(port, commandRunner = spawnSync) {
  const output = commandText(commandRunner, 'lsof', [
    '-nP',
    `-iTCP:${port}`,
    '-sTCP:LISTEN',
    '-t'
  ]).stdout
  return [...new Set(output.split(/\s+/).filter(value => /^\d+$/.test(value)))].map(Number)
}

export function processInfo(pid, commandRunner = spawnSync) {
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

export function ancestorsFrom(pid, commandRunner = spawnSync) {
  const items = []
  const seen = new Set()
  let current = Number(pid)
  while (
    positiveInteger(current) &&
    current > 1 &&
    !seen.has(current) &&
    items.length < MAX_ANCESTOR_HOPS
  ) {
    seen.add(current)
    const item = processInfo(current, commandRunner)
    items.push(item)
    current = item.parent_pid
  }
  return items
}

export const isMainDevToolsProcess = (command = '') =>
  /\/Contents\/MacOS\/wechatdevtools(?:\s|$)/.test(command)

export function directControlPortEvidence(command = '') {
  const ide = command.match(/--ide-http-port(?:=|\s+)(\d+)/)
  if (ide) return { port: Number(ide[1]), source: 'main_devtools_ide_http_port' }
  const remote = command.match(/--remote-port(?:=|\s+)(\d+)/)
  return remote
    ? { port: Number(remote[1]), source: 'main_devtools_remote_port' }
    : { port: null, source: 'unavailable' }
}

export function userDataDirFromCommand(command = '') {
  const match = command.match(
    /--user-data-dir(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(.*?)(?=\s+-{1,2}[\w-]|\s*$))/
  )
  return match ? (match[1] ?? match[2] ?? match[3]?.trim() ?? '') : ''
}

export function projectPathsFromCommand(command = '') {
  return [...command.matchAll(/--project(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/g)]
    .map(match => match[1] ?? match[2] ?? match[3])
    .filter(Boolean)
    .map(normalizeRuntimePath)
}

export function projectPathsFromOpenFiles(text = '') {
  return text
    .split('\n')
    .filter(line => line.startsWith('n') && line.endsWith('/project.config.json'))
    .map(line => normalizeRuntimePath(path.dirname(line.slice(1))))
}

export function controlPortListenerEvidence(controlPort, mainPid, commandRunner = spawnSync) {
  const pids =
    positiveInteger(controlPort) && positiveInteger(mainPid)
      ? listenerPids(controlPort, commandRunner)
      : []
  const chains = pids.map(listenerPid => {
    const topology =
      Number(listenerPid) === Number(mainPid)
        ? [{ pid: Number(mainPid) }]
        : ancestorsFrom(listenerPid, commandRunner)
    return {
      listener_pid: listenerPid,
      parent_chain_pids: topology.map(item => item.pid),
      descendant_of_main: topology.some(item => item.pid === Number(mainPid))
    }
  })
  const verified = chains.filter(item => item.descendant_of_main).map(item => item.listener_pid)
  return {
    control_port: positiveInteger(controlPort) ? Number(controlPort) : null,
    main_devtools_pid: positiveInteger(mainPid) ? Number(mainPid) : null,
    listener_pids: pids,
    verified_listener_pids: verified,
    listener_parent_chains: chains,
    verified: verified.length > 0
  }
}

export function mainDevToolsProcesses(commandRunner = spawnSync) {
  return commandText(commandRunner, 'ps', ['-ax', '-o', 'pid=,ppid=,command='])
    .stdout.split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map(match => ({ pid: Number(match[1]), parent_pid: Number(match[2]), command: match[3] }))
    .filter(item => isMainDevToolsProcess(item.command))
}

export function projectEvidenceForTopology(topology, commandRunner = spawnSync) {
  return topology.flatMap(item => {
    const openFiles = commandText(commandRunner, 'lsof', [
      '-n',
      '-p',
      String(item.pid),
      '-Fn'
    ]).stdout
    return [
      ...new Set([
        ...projectPathsFromCommand(item.command),
        ...projectPathsFromOpenFiles(openFiles)
      ])
    ].map(project_path => ({ pid: item.pid, project_path }))
  })
}

export function controlPortFromIdeFile(mainProcess, commandRunner = spawnSync, wsPort = 9420) {
  const userDataDir = userDataDirFromCommand(mainProcess?.command)
  if (!userDataDir)
    return { port: null, source: 'unavailable', reason: 'user_data_dir_missing', ide_file_path: '' }
  const candidates = [path.join(userDataDir, 'Default', '.ide'), path.join(userDataDir, '.ide')]
  for (const file of candidates) {
    try {
      const port = Number(fs.readFileSync(file, 'utf8').trim())
      if (!positiveInteger(port) || Number(port) === Number(wsPort))
        return {
          port: null,
          source: 'unavailable',
          reason: 'ide_file_port_invalid',
          ide_file_path: file
        }
      if (!listenerPids(port, commandRunner).length)
        return {
          port: null,
          source: 'unavailable',
          reason: 'ide_file_port_not_listening',
          ide_file_path: file
        }
      return { port, source: 'user_data_ide_port_file', reason: '', ide_file_path: file }
    } catch {}
  }
  return {
    port: null,
    source: 'unavailable',
    reason: 'ide_file_missing_or_unreadable',
    ide_file_path: ''
  }
}
