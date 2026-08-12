import path from 'node:path'
import {
  mainDevToolsProcesses,
  normalizeRuntimePath,
  projectPathsFromCommand,
  userDataDirFromCommand
} from './devtools-process-topology.mjs'
import {
  descendantsOf,
  processTable,
  QA_RUNTIME_SESSION_ROOT,
  terminateProcessTree
} from './test-owned-qa-support.mjs'

function processTreeRoot(pid, processByPid) {
  let current = processByPid.get(Number(pid))
  const visited = new Set()
  while (current && !visited.has(current.pid)) {
    visited.add(current.pid)
    const parent = processByPid.get(Number(current.parent_pid))
    if (!parent || !/wechatwebdevtools/i.test(parent.command)) {
      break
    }
    current = parent
  }
  return current
}

function isProtectedDevToolsProcess(item, protectedRoot) {
  const profile = normalizeRuntimePath(userDataDirFromCommand(item.command))
  const root = normalizeRuntimePath(protectedRoot)
  return profile === root || profile.startsWith(`${root}${path.sep}`)
}

function isDevToolsCliOpenProcess(item, targetProjectPath) {
  if (!targetProjectPath) {
    return false
  }
  if (!/\/package\.nw\/js\/common\/cli\/index\.js\s+open(?:\s|$)/i.test(item.command)) {
    return false
  }
  const projectPath = normalizeRuntimePath(targetProjectPath)
  return projectPathsFromCommand(item.command).some(candidate => candidate === projectPath)
}

function isDevToolsSupportProcess(item) {
  return (
    /\/wechatwebdevtools Helper\b/i.test(item.command) ||
    (/\/chrome_crashpad_handler(?:\s|$)/i.test(item.command) &&
      /prod=微信开发者工具|wechatwebdevtools\.app/i.test(item.command))
  )
}

export async function terminateConflictingUserDevTools({
  protectedRoot = QA_RUNTIME_SESSION_ROOT,
  targetProjectPath = null,
  processList = processTable(),
  mainProcesses = mainDevToolsProcesses(),
  descendantsProvider = descendantsOf,
  terminateTree = terminateProcessTree
} = {}) {
  const processByPid = new Map(processList.map(item => [Number(item.pid), item]))
  const protectedMainPids = new Set(
    mainProcesses
      .filter(item => isProtectedDevToolsProcess(item, protectedRoot))
      .map(item => Number(item.pid))
  )
  const protectedProcessPids = new Set(protectedMainPids)
  for (const mainPid of protectedMainPids) {
    descendantsProvider(mainPid).forEach(item => protectedProcessPids.add(Number(item.pid)))
  }
  const targets = new Map()
  for (const main of mainProcesses) {
    if (isProtectedDevToolsProcess(main, protectedRoot) || protectedProcessPids.has(main.pid)) {
      continue
    }
    const root = processTreeRoot(main.pid, processByPid) || main
    const protectedDescendant = descendantsProvider(root.pid).some(item =>
      protectedMainPids.has(Number(item.pid))
    )
    const target = protectedDescendant ? main : root
    targets.set(Number(target.pid), {
      pid: Number(target.pid),
      command: target.command,
      reason: protectedDescendant
        ? 'user_devtools_main_only_shared_tree'
        : 'user_devtools_tree_before_test_session'
    })
  }
  for (const item of processList) {
    if (isDevToolsCliOpenProcess(item, targetProjectPath) && !targets.has(Number(item.pid))) {
      targets.set(Number(item.pid), {
        pid: Number(item.pid),
        command: item.command,
        reason: 'orphaned_user_devtools_cli'
      })
    }
  }
  for (const item of processList) {
    if (!/wechatwebdevtools\s+Daemon/i.test(item.command)) {
      continue
    }
    const hasProtectedMain = descendantsProvider(item.pid).some(descendant =>
      protectedMainPids.has(Number(descendant.pid))
    )
    if (!hasProtectedMain && !targets.has(Number(item.pid))) {
      targets.set(Number(item.pid), {
        pid: Number(item.pid),
        command: item.command,
        reason: 'orphaned_user_devtools_daemon'
      })
    }
  }
  for (const item of processList) {
    if (protectedProcessPids.has(Number(item.pid)) || !isDevToolsSupportProcess(item)) {
      continue
    }
    const root = processTreeRoot(item.pid, processByPid) || item
    if (targets.has(Number(root.pid))) {
      continue
    }
    targets.set(Number(item.pid), {
      pid: Number(item.pid),
      command: item.command,
      reason: 'orphaned_user_devtools_support_process'
    })
  }
  const terminated = []
  for (const target of targets.values()) {
    const remaining = await terminateTree(target.pid)
    terminated.push({ ...target, remaining })
  }
  return {
    status: terminated.length ? 'terminated' : 'not_needed',
    protected_root: normalizeRuntimePath(protectedRoot),
    terminated
  }
}
