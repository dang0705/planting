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
  resolveQaProjectRuntimeStateCandidate,
  processAlive,
  terminateProcessTree,
  waitFor
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs'
import { recoverTestOwnedDevToolsStartup } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-startup-recovery.mjs'
import {
  buildTestOwnedDevToolsLaunch,
  extensionProcessEvidence,
  QA_EXTENSION_SNAPSHOT_DIR
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-devtools-launch.mjs'
import { isOfficialElectronBundle } from '../../../../../scripts/qa/patch-wechat-devtools-launcher.mjs'

const qaSupportSource = fs.readFileSync(
  new URL(
    '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs',
    import.meta.url
  ),
  'utf8'
)
assert.match(qaSupportSource, /project-state\.json/u)
assert.doesNotMatch(qaSupportSource, /readdirSync\(localData\)/u)
assert.doesNotMatch(qaSupportSource, /mappedCandidates/u)
assert.doesNotMatch(qaSupportSource, /Object\.values\(projectList\)\.find/u)
assert.match(qaSupportSource, /projectStateManifestPreviousRaw/u)

const devtoolsLaunchSource = fs.readFileSync(
  new URL(
    '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-devtools-launch.mjs',
    import.meta.url
  ),
  'utf8'
)
const qaSupportRuntimeSource = fs.readFileSync(
  new URL(
    '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs',
    import.meta.url
  ),
  'utf8'
)
const managedLauncherSource = fs.readFileSync(
  new URL('../../../../../scripts/qa/launch-wechat-devtools.mjs', import.meta.url),
  'utf8'
)
const authConcurrencySource = fs.readFileSync(
  new URL('../../../../../scripts/qa/automator-auth-concurrency.mjs', import.meta.url),
  'utf8'
)
const patchLauncherSource = fs.readFileSync(
  new URL('../../../../../scripts/qa/patch-wechat-devtools-launcher.mjs', import.meta.url),
  'utf8'
)
const retiredRuntimeIdentifier =
  /(?:^|[^A-Za-z0-9_])(?:QA_NW_BINARY|QA_LAUNCHER_PACKAGE|QA_SHARED_AUTH_PACKAGE_DIR)(?:$|[^A-Za-z0-9_])/u
assert.doesNotMatch(devtoolsLaunchSource, retiredRuntimeIdentifier)
assert.doesNotMatch(managedLauncherSource, retiredRuntimeIdentifier)
assert.doesNotMatch(authConcurrencySource, retiredRuntimeIdentifier)
assert.match(
  qaSupportRuntimeSource,
  /QA_RUNTIME_DEVTOOLS_CLI = isOfficialElectronBundle\(\) \? SYSTEM_CLI : QA_CLI/u
)
assert.match(
  patchLauncherSource,
  /ensureQaPatchedSharedAuthPackage[\s\S]*?qa_patched_runtime_retired/u
)
assert.match(
  patchLauncherSource,
  /ensureQaPatchedDevToolsLauncher[\s\S]*?qa_patched_runtime_retired/u
)

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

const stateFixtureRoot = fs.mkdtempSync('/tmp/qa-project-state-resolver-')
const sourceStatePath = path.join(stateFixtureRoot, 'source-state.json')
const targetStatePath = path.join(stateFixtureRoot, 'target-state.json')
fs.writeFileSync(
  sourceStatePath,
  JSON.stringify({ projectpath: '/source/project', appid: 'wx-test' })
)
fs.writeFileSync(
  targetStatePath,
  JSON.stringify({ projectpath: '/qa/snapshot/project', appid: 'wx-test' })
)
assert.equal(
  resolveQaProjectRuntimeStateCandidate({
    sourceStatePath,
    targetStatePath,
    sourceProjectPath: '/source/project',
    targetProjectPath: '/qa/snapshot/project',
    expectedAppId: 'wx-test'
  }).filePath,
  targetStatePath
)
fs.rmSync(targetStatePath)
assert.equal(
  resolveQaProjectRuntimeStateCandidate({
    sourceStatePath,
    targetStatePath,
    sourceProjectPath: '/source/project',
    targetProjectPath: '/qa/snapshot/project',
    expectedAppId: 'wx-test'
  }).filePath,
  sourceStatePath
)
assert.equal(
  resolveQaProjectRuntimeStateCandidate({
    sourceStatePath,
    targetStatePath,
    sourceProjectPath: '/source/project',
    targetProjectPath: '/qa/snapshot/project',
    expectedAppId: 'wx-other'
  }),
  null
)
fs.rmSync(stateFixtureRoot, { recursive: true, force: true })

const contractProfile = fs.mkdtempSync('/tmp/qa-runtime-contract-profile-')
const directLaunch = buildTestOwnedDevToolsLaunch({
  profile: contractProfile,
  controlPort: 9421,
  appSessionId: 'contract-session'
})
const contractExtension = path.resolve(QA_EXTENSION_SNAPSHOT_DIR)
assert.equal(directLaunch.control_port, 9421)
if (isOfficialElectronBundle()) {
  assert.equal(directLaunch.runtime_kind, 'official_electron')
  assert.equal(directLaunch.command_boundary, 'installed_official_electron')
  assert.equal(directLaunch.package_boundary, 'installed_app_asar')
  assert.equal(directLaunch.command, directLaunch.installed_bundle.electron)
  assert.equal(directLaunch.package_dir, null)
  assert.equal(directLaunch.runtime_package, directLaunch.installed_bundle.app_asar)
  assert.equal(directLaunch.args[0], directLaunch.installed_bundle.app_asar)
  assert.equal(directLaunch.args.includes('--cli'), true)
  assert.ok(directLaunch.args.includes('--remote-port'))
  assert.ok(directLaunch.args.includes('--ide-http-port=9421'))
  assert.ok(
    directLaunch.args.includes(
      `--user-data-dir=${path.dirname(directLaunch.profile)}`
    )
  )
  assert.equal(directLaunch.extension, null)
} else {
  assert.equal(directLaunch.command_boundary, 'installed_native_nw_executable')
  assert.equal(directLaunch.package_boundary, 'installed_native_package')
  assert.equal(directLaunch.command, directLaunch.installed_bundle.nw_binary)
  assert.equal(directLaunch.package_dir, directLaunch.installed_bundle.package_dir)
  assert.equal(directLaunch.args.includes('--cli'), true)
  assert.ok(directLaunch.args.includes('--remote-port'))
  assert.ok(directLaunch.args.includes('--ide-http-port'))
  assert.ok(directLaunch.args.includes('9421'))
  assert.ok(directLaunch.args.includes(`--user-data-dir=${contractProfile}`))
  assert.ok(directLaunch.args.includes(`-load-extension=${contractExtension}`))
  assert.equal(directLaunch.extension.path, contractExtension)
  assert.ok(fs.existsSync(path.join(contractExtension, 'manifest.json')))
  assert.ok(fs.existsSync(path.join(contractExtension, 'inspector')))
  assert.equal(directLaunch.args.some(arg => arg.startsWith('-load-extension=')), true)
  const extensionCommand = `${directLaunch.command} ${directLaunch.args.join(' ')} --extension-process --nwapp-path=${directLaunch.package_dir} --user-data-dir=${directLaunch.profile}`
  assert.equal(
    extensionProcessEvidence({
      processes: [{ pid: 901, command: extensionCommand }],
      pid: 901,
      profile: directLaunch.profile,
      packageDir: directLaunch.package_dir
    }).verified,
    true
  )
  assert.equal(
    extensionProcessEvidence({
      processes: [
        { pid: 901, command: `${directLaunch.command} --user-data-dir=${directLaunch.profile}` }
      ],
      pid: 901,
      profile: directLaunch.profile,
      packageDir: directLaunch.package_dir
    }).verified,
    false
  )
}
fs.rmSync(contractProfile, { recursive: true, force: true })

const startupRecoveryControlActions = []
const startupRecoveryInvocations = []
let testOwnedMainAlive = true
const startupRecovery = await recoverTestOwnedDevToolsStartup({
  session: { controlPort: 3799, wsPort: 9421, projectPath: '/qa/project' },
  home: '/qa/home',
  outputPath: '/qa/devtools.log',
  mainForSessionFn: () => (testOwnedMainAlive ? { pid: 101 } : null),
  projectOpenEvidenceFn: () => testOwnedMainAlive,
  controlRequest: async ({ action, controlPort, wsPort }) => {
    startupRecoveryControlActions.push({ action, controlPort, wsPort })
    if (action === 'close') {
      testOwnedMainAlive = false
    }
    if (action === 'open') {
      testOwnedMainAlive = true
    }
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
assert.deepEqual(startupRecoveryControlActions, [
  { action: 'close', controlPort: 3799, wsPort: 9421 },
  { action: 'open', controlPort: 3799, wsPort: 9421 },
  { action: 'auto', controlPort: 3799, wsPort: 9421 }
])
assert.deepEqual(startupRecoveryInvocations, ['close', 'open', 'auto'])

let status500Main = {
  pid: 101,
  command:
    '/Applications/wechatwebdevtools.app/Contents/MacOS/Electron /Applications/wechatwebdevtools.app/Contents/Resources/app.asar --user-data-dir=/qa/profile --ide-http-port=3799'
}
const status500Recovery = await recoverTestOwnedDevToolsStartup({
  session: {
    controlPort: 3799,
    wsPort: 9421,
    projectPath: '/qa/project',
    main_devtools_pid: 101,
    devtools_runtime_kind: 'official_electron',
    devtools_user_data_dir: '/qa/profile',
    initial_devtools_launch: { pid: 101 }
  },
  home: '/qa/home',
  outputPath: '/qa/devtools.log',
  mainForSessionFn: () => status500Main,
  projectOpenEvidenceFn: () => true,
  controlRequest: async ({ action, controlPort, wsPort }) => {
    if (action === 'close') {
      return {
        status_code: 500,
        url: `http://127.0.0.1:${controlPort}/close`,
        body_excerpt: 'synthetic IDE close handler failure'
      }
    }
    return {
      status_code: 200,
      url: `http://127.0.0.1:${controlPort}/${action}?port=${wsPort}`
    }
  },
  terminateProcessTreeFn: async pid => {
    assert.equal(pid, 101)
    status500Main = null
    return []
  },
  launchDevTools: async () => {
    status500Main = {
      pid: 102,
      command:
        '/Applications/wechatwebdevtools.app/Contents/MacOS/Electron /Applications/wechatwebdevtools.app/Contents/Resources/app.asar --user-data-dir=/qa/profile --ide-http-port=3799'
    }
    return { pid: 102, project_opened: true, cli_open: { status: 0, stdout: '', stderr: '' } }
  },
  waitForFn: async predicate => {
    assert.equal(Boolean(predicate()), true)
  },
  automatorPrepareDelayMs: 0
})
assert.equal(status500Recovery.status, 'restarted')
assert.equal(
  status500Recovery.invocations.some(item => item.action === 'target_only_terminate'),
  true
)

const failedRecoveryMainAlive = true
await assert.rejects(
  () =>
    recoverTestOwnedDevToolsStartup({
      session: { controlPort: 3799, wsPort: 9421, projectPath: '/qa/project' },
      home: '/qa/home',
      outputPath: '/qa/devtools.log',
      mainForSessionFn: () => (failedRecoveryMainAlive ? { pid: 101 } : null),
      projectOpenEvidenceFn: () => false,
      controlRequest: async ({ action, controlPort, wsPort }) => ({
        status_code: action === 'close' ? 400 : 200,
        url: `http://127.0.0.1:${controlPort}/${action}?port=${wsPort}`,
        body_excerpt: 'synthetic control failure body'
      }),
      waitForFn: async predicate => {
        assert.equal(Boolean(predicate()), true)
      },
      automatorPrepareDelayMs: 0
    }),
  error => {
    assert.equal(error.code, 'qa_test_owned_close_failed')
    assert.equal(error.details?.action, 'close')
    assert.equal(error.details?.body_excerpt, 'synthetic control failure body')
    assert.deepEqual(
      error.details?.recovery_invocations?.map(item => item.action),
      ['close']
    )
    return true
  }
)

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
