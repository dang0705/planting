import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  borrowedLocalRuntimeState,
  cliRequiresTestProfileLogin,
  cleanupTestOwnedQaSession,
  reapStaleQaSessions,
  testOwnedQaRuntimeRoot
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-session.mjs'
import {
  QA_RUNTIME_AUTH_PROFILE_ROOT,
  buildQaProjectRuntimeState,
  processAlive,
  terminateProcessTree,
  waitFor
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs'
import { recoverTestOwnedDevToolsStartup } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-startup-recovery.mjs'
import { buildTestOwnedDevToolsLaunch } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-devtools-launch.mjs'

const registryRoot = path.join(testOwnedQaRuntimeRoot, 'registry')
const lockRoot = path.join(testOwnedQaRuntimeRoot, 'locks')
fs.mkdirSync(registryRoot, { recursive: true })
fs.mkdirSync(lockRoot, { recursive: true })

const recoveringBorrowedRuntime = borrowedLocalRuntimeState({
  targetPath: '/workspace/dist/dev/mp-weixin',
  leaseValue: {
    owner_pid: 101,
    child_pid: 202,
    target_path: '/workspace/dist/dev/mp-weixin'
  },
  supervisorAlive: true,
  ownerAlive: true,
  childAlive: false,
  buildPresent: true
})
assert.equal(recoveringBorrowedRuntime.recoverable, true)
assert.equal(recoveringBorrowedRuntime.healthy, false)
const healthyBorrowedRuntime = borrowedLocalRuntimeState({
  targetPath: '/workspace/dist/dev/mp-weixin',
  leaseValue: {
    owner_pid: 101,
    child_pid: 202,
    target_path: '/workspace/dist/dev/mp-weixin'
  },
  supervisorAlive: true,
  ownerAlive: true,
  childAlive: true,
  buildPresent: true
})
assert.equal(healthyBorrowedRuntime.healthy, true)
assert.equal(cliRequiresTestProfileLogin('错误 需要重新登录 (code 10)'), true)
assert.equal(cliRequiresTestProfileLogin('IDE server has started'), false)

const qaRuntimeState = buildQaProjectRuntimeState({
  sourceState: {
    projectid: '/source/project',
    projectpath: '/source/project',
    libVersion: '3.15.2',
    setting: {
      useMultiFrameRuntime: true,
      useApiHook: true,
      useApiHostProcess: true,
      compileHotReLoad: true
    },
    attr: {
      setting: { useMultiFrameRuntime: true, useApiHook: true }
    }
  },
  projectPath: '/qa/snapshot/project',
  projectConfig: {
    appid: 'wx-test',
    compileType: 'miniprogram',
    libVersion: '3.15.2',
    setting: {
      useMultiFrameRuntime: false,
      useApiHook: false,
      useApiHostProcess: false,
      compileHotReLoad: false
    }
  }
})
assert.equal(qaRuntimeState.projectpath, path.resolve('/qa/snapshot/project'))
assert.equal(qaRuntimeState.compileType, 'weapp')
assert.equal(qaRuntimeState.setting.useMultiFrameRuntime, false)
assert.equal(qaRuntimeState.setting.useApiHook, false)
assert.equal(qaRuntimeState.setting.useApiHostProcess, false)
assert.equal(qaRuntimeState.attr.setting.useMultiFrameRuntime, false)

const directLaunch = buildTestOwnedDevToolsLaunch({
  profile: '/qa/profile',
  controlPort: 9421,
  appSessionId: 'contract-session'
})
assert.equal(directLaunch.control_port, 9421)
assert.ok(directLaunch.args.includes('--cli'))
assert.ok(directLaunch.args.includes('--ide-http-port'))
assert.ok(directLaunch.args.includes('9421'))
assert.ok(directLaunch.args.includes('--user-data-dir=/qa/profile'))

const startupRecoveryActions = []
const startupRecoveryControlActions = []
const startupRecoveryInvocations = []
let testOwnedMainAlive = true
const startupRecovery = await recoverTestOwnedDevToolsStartup({
  session: { controlPort: 3799, wsPort: 9421, projectPath: '/qa/project' },
  home: '/qa/home',
  outputPath: '/qa/devtools.log',
  mainForSessionFn: () => (testOwnedMainAlive ? { pid: 101 } : null),
  projectOpenEvidenceFn: () => testOwnedMainAlive,
  runCli: async ({ args }) => {
    const action = args[0]
    startupRecoveryActions.push(action)
    if (action === 'quit') {
      testOwnedMainAlive = false
    }
    if (action === 'open') {
      testOwnedMainAlive = true
    }
    return { pid: 101, exitCode: 0, timedOut: false }
  },
  controlRequest: async ({ action, controlPort, wsPort }) => {
    startupRecoveryControlActions.push({ action, controlPort, wsPort })
    return {
      status_code: 200,
      url: `http://127.0.0.1:${controlPort}/auto?port=${wsPort}`
    }
  },
  waitForFn: async predicate => {
    assert.equal(Boolean(predicate()), true)
  },
  onInvocation: invocation => startupRecoveryInvocations.push(invocation.action),
  automatorPrepareDelayMs: 0
})
assert.equal(startupRecovery.status, 'restarted')
assert.deepEqual(startupRecoveryActions, ['quit', 'open'])
assert.deepEqual(startupRecoveryControlActions, [
  { action: 'auto', controlPort: 3799, wsPort: 9421 }
])
assert.deepEqual(startupRecoveryInvocations, ['quit', 'open', 'auto'])

const id = `contract-cleanup-${process.pid}-${Date.now()}`
const staleSessionRoot = path.join(testOwnedQaRuntimeRoot, id)
const staleRecordPath = path.join(registryRoot, `${id}.json`)
fs.mkdirSync(staleSessionRoot, { recursive: true })
fs.writeFileSync(
  staleRecordPath,
  `${JSON.stringify(
    {
      version: 1,
      runner_pid: 999999999,
      session_id: id,
      session_root: staleSessionRoot,
      profile: '',
      project_path: process.cwd(),
      runtime_target_path: path.join(testOwnedQaRuntimeRoot, 'contract-target'),
      local_runtime_pid: null,
      local_runtime_child_pid: null,
      auto_cli_pid: null,
      devtools_cli_pid: null,
      main_devtools_pid: null,
      automator_port: null,
      control_port: null
    },
    null,
    2
  )}\n`
)
const staleLockPath = path.join(lockRoot, `contract-${process.pid}.lock`)
fs.writeFileSync(staleLockPath, '{"pid":999999999}\n')

const recovered = await reapStaleQaSessions()
assert.ok(recovered.recovered.some(item => item.session_id === id))
assert.ok(recovered.reclaimedLocks.includes(`contract-${process.pid}.lock`))
assert.equal(fs.existsSync(staleRecordPath), false)
assert.equal(fs.existsSync(staleSessionRoot), false)

const cleanId = `${id}-normal`
const cleanRoot = fs.mkdtempSync(path.join(testOwnedQaRuntimeRoot, `${cleanId}-`))
const cleanRecordPath = path.join(registryRoot, `${cleanId}.json`)
fs.writeFileSync(cleanRecordPath, '{}\n')
const cleanSession = {
  sessionId: cleanId,
  sessionRoot: cleanRoot,
  projectPath: process.cwd(),
  runtimeTargetPath: path.join(testOwnedQaRuntimeRoot, 'contract-target-normal'),
  profile: null,
  wsPort: null,
  controlPort: null,
  localRuntimePid: null,
  localRuntimeChildPid: null,
  auto_cli_pid: null,
  devtoolsCliPid: null,
  main_devtools_pid: null,
  cleanup_done: false,
  cleanup_in_progress: false,
  cleanup_attempts: 0,
  recordPath: cleanRecordPath,
  portLocks: []
}
const cleanup = await cleanupTestOwnedQaSession({ session: cleanSession })
assert.equal(cleanup.status, 'terminated')
assert.equal(fs.existsSync(cleanRecordPath), false)
assert.equal(fs.existsSync(cleanRoot), false)
assert.equal((await cleanupTestOwnedQaSession({ session: cleanSession })).status, 'terminated')

const persistentProfile = path.join(QA_RUNTIME_AUTH_PROFILE_ROOT, `contract-${cleanId}`)
fs.mkdirSync(persistentProfile, { recursive: true })
fs.writeFileSync(path.join(persistentProfile, 'login-state-sentinel'), 'must-survive-cleanup\n')
const persistentSessionRoot = fs.mkdtempSync(
  path.join(testOwnedQaRuntimeRoot, `${cleanId}-persistent-`)
)
const persistentSession = {
  ...cleanSession,
  sessionId: `${cleanId}-persistent`,
  sessionRoot: persistentSessionRoot,
  profile: persistentProfile,
  cleanup_done: false,
  cleanup_in_progress: false,
  runtime_cleanup: null,
  recordPath: path.join(registryRoot, `${cleanId}-persistent.json`)
}
const persistentCleanup = await cleanupTestOwnedQaSession({ session: persistentSession })
assert.equal(persistentCleanup.status, 'terminated')
assert.equal(fs.existsSync(persistentProfile), true)
assert.equal(fs.existsSync(path.join(persistentProfile, 'login-state-sentinel')), true)
assert.equal(fs.existsSync(persistentSessionRoot), false)
fs.rmSync(persistentProfile, { recursive: true, force: true })

const processTree = spawn(
  process.execPath,
  [
    '-e',
    "const {spawn}=require('node:child_process'); spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); setInterval(()=>{},1000)"
  ],
  { stdio: 'ignore' }
)
await waitFor(() => processAlive(processTree.pid), 2000, 'cleanup contract process tree')
assert.deepEqual(await terminateProcessTree(processTree.pid, 3000), [])
assert.equal(processAlive(processTree.pid), false)

console.log('QA runtime cleanup contract passed')
