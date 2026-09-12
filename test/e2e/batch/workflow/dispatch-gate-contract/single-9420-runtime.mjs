import assert from 'node:assert/strict'
import { allocatePortLock } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs'
import { terminateConflictingUserDevTools } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-process-cleanup.mjs'
import {
  cleanupFormalQaSession,
  createFormalQaSession,
  qaCleanupPassed
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/formal-isolated-qa-session.mjs'

const forbidden = new Set([9420])
const automatorLock = await allocatePortLock('contract-automator', { forbidden })
forbidden.add(automatorLock.port)
const controlLock = await allocatePortLock('contract-control', { forbidden })

try {
  assert.notEqual(automatorLock.port, 9420)
  assert.notEqual(controlLock.port, 9420)
  assert.notEqual(automatorLock.port, controlLock.port)
  assert.equal(qaCleanupPassed({ status: 'terminated' }), true)
  assert.equal(qaCleanupPassed({ status: 'cleanup_failed' }), false)
  assert.equal(qaCleanupPassed({ status: 'not_needed' }), true)
  assert.equal(typeof createFormalQaSession, 'function')
  assert.equal(typeof cleanupFormalQaSession, 'function')
} finally {
  automatorLock.release()
  controlLock.release()
}

const terminated = []
const userDaemon = {
  pid: 100,
  parent_pid: 1,
  command: 'wechatwebdevtools Daemon'
}
const userMain = {
  pid: 101,
  parent_pid: 100,
  command:
    'wechatdevtools --user-data-dir=/Users/jay/Library/Application Support/微信开发者工具/user'
}
const testDaemon = {
  pid: 200,
  parent_pid: 1,
  command: 'wechatwebdevtools Daemon'
}
const testMain = {
  pid: 201,
  parent_pid: 200,
  command:
    'wechatdevtools --user-data-dir=/tmp/qa-runtime-sessions/session/home/Library/Application Support/微信开发者工具/profile'
}
const orphanedCli = {
  pid: 300,
  parent_pid: 1,
  command:
    '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/js/common/cli/index.js open --project /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin --port 57724'
}
const orphanedSupport = {
  pid: 400,
  parent_pid: 1,
  command:
    '/Applications/wechatwebdevtools.app/Contents/Frameworks/nwjs Framework.framework/Versions/91.0.4472.114/Helpers/chrome_crashpad_handler --annotation=prod=微信开发者工具'
}
const protectedSupport = {
  pid: 202,
  parent_pid: 201,
  command:
    '/Applications/wechatwebdevtools.app/Contents/Frameworks/nwjs Framework.framework/Versions/91.0.4472.114/Helpers/wechatwebdevtools Helper (Renderer).app/Contents/MacOS/node'
}
const topology = [
  userDaemon,
  userMain,
  testDaemon,
  testMain,
  orphanedCli,
  orphanedSupport,
  protectedSupport
]
const cleanup = await terminateConflictingUserDevTools({
  protectedRoot: '/tmp/qa-runtime-sessions',
  targetProjectPath: '/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin',
  processList: topology,
  mainProcesses: [userMain, testMain],
  descendantsProvider: pid => topology.filter(item => item.parent_pid === pid),
  terminateTree: async pid => {
    terminated.push(pid)
    return []
  }
})
assert.deepEqual(terminated, [100, 300, 400])
assert.equal(cleanup.status, 'terminated')
assert.equal(cleanup.terminated[0].reason, 'user_devtools_tree_before_test_session')

console.log('test-owned dynamic QA runtime contract passed')
