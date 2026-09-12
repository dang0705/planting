import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import {
  parseLocalApiEnvironmentArgs,
  resolveLocalApiBaseUrl
} from '../../../../../scripts/dev/local-api-env-config.mjs'
import {
  acquireLocalRuntimeLease,
  createManagedLocalRuntimeSession
} from '../../../../../scripts/dev/local-runtime-session.mjs'
import { ensureLocalRuntimeReady } from '../../../../../scripts/dev/local-api-env-gateway.mjs'
import { runLocalApiEnvironment as runLocalApiEnvironmentOrchestrator } from '../../../../../scripts/dev/local-api-env-launcher.mjs'
import { runLocalApiEnvironment } from '../../../../../scripts/dev/run-local-api-env.mjs'
import { repoRoot } from './helpers.mjs'

const launcherModules = [
  'scripts/dev/run-local-api-env.mjs',
  'scripts/dev/local-api-env-config.mjs',
  'scripts/dev/local-api-env-gateway-health.mjs',
  'scripts/dev/local-api-env-gateway.mjs',
  'scripts/dev/local-api-env-launcher.mjs'
]
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

function successfulChild() {
  const child = new EventEmitter()
  child.exitCode = null
  child.signalCode = null
  queueMicrotask(() => {
    child.exitCode = 0
    child.emit('exit', 0, null)
  })
  return child
}

try {
  for (const file of launcherModules) {
    const lines = fs.readFileSync(path.join(repoRoot, file), 'utf8').split(/\r?\n/).length
    assert.ok(lines <= 500, `${file} must remain at or below 500 lines`)
  }
  assert.equal(
    runLocalApiEnvironment,
    runLocalApiEnvironmentOrchestrator,
    'the CLI entrypoint must delegate to the launcher orchestration module'
  )
  assert.equal(typeof ensureLocalRuntimeReady, 'function')

  const localPlatformProfiles = {
    'mp-weixin': { port: 3010, functionPortBase: 9000 },
    'mp-toutiao': { port: 3020, functionPortBase: 9200 },
    'mp-xhs': { port: 3030, functionPortBase: 9300 }
  }
  for (const [platform, profile] of Object.entries(localPlatformProfiles)) {
    for (const mode of ['local-functions', 'local-functions:lan']) {
      const scriptName = `dev:${platform}:${mode}`
      const script = packageJson.scripts?.[scriptName] || ''
      assert.match(script, /scripts\/dev\/run-local-api-env\.mjs/)
      assert.match(script, new RegExp(`--port=${profile.port}`))
      assert.match(script, new RegExp(`--function-port-base=${profile.functionPortBase}`))
      assert.match(script, new RegExp(`--output-dir=dist/dev/${platform}`))
      assert.match(script, new RegExp(`uni -p ${platform}`))
      if (mode === 'local-functions') {
        assert.match(script, new RegExp(`--base-url=http://127\\.0\\.0\\.1:${profile.port}`))
      } else {
        assert.doesNotMatch(script, /--base-url=/)
      }
    }
  }
  assert.deepEqual(
    new Set(Object.values(localPlatformProfiles).map(profile => profile.port)).size,
    Object.keys(localPlatformProfiles).length,
    'platform gateway ports must be unique'
  )
  assert.deepEqual(
    new Set(Object.values(localPlatformProfiles).map(profile => profile.functionPortBase)).size,
    Object.keys(localPlatformProfiles).length,
    'platform worker port ranges must be unique'
  )

  const parsed = parseLocalApiEnvironmentArgs(
    [
      '--mode=lan',
      '--port=3015',
      '--function-port-base=9100',
      '--output-dir=/tmp/planting-qa-runtime',
      '--no-start-functions',
      '--',
      'uni',
      '-p',
      'mp-weixin'
    ],
    {}
  )
  assert.equal(parsed.options.mode, 'lan')
  assert.equal(parsed.options.port, 3015)
  assert.equal(parsed.options.functionPortBase, 9100)
  assert.equal(parsed.options.outputDir, path.resolve('/tmp/planting-qa-runtime'))
  assert.equal(parsed.options.startFunctions, false)
  assert.deepEqual(parsed.command, ['uni', '-p', 'mp-weixin'])
  assert.equal(parsed.options.baseUrlSource, '')

  const parsedSession = parseLocalApiEnvironmentArgs(
    ['--mode=lan', '--', 'uni', '-p', 'mp-toutiao'],
    { CLOUDBASE_LOCAL_SESSION_TOKEN: 'session-token-from-shell' }
  )
  assert.equal(parsedSession.options.sessionToken, 'session-token-from-shell')

  let douyinProbeOptions
  await runLocalApiEnvironment({
    argv: ['--base-url=http://127.0.0.1:3020', '--', 'uni', '-p', 'mp-toutiao'],
    environment: { CLOUDBASE_LOCAL_SESSION_TOKEN: 'wechat-session-must-not-leak' },
    output: { write() {} },
    ensureRuntime: async (_apiBaseUrl, options) => {
      douyinProbeOptions = options
      return null
    },
    spawnProcess: () => successfulChild()
  })
  assert.equal(
    douyinProbeOptions.sessionToken,
    '',
    'Douyin local launcher must not reuse the WeChat local bearer session'
  )

  const staleLanEnv = parseLocalApiEnvironmentArgs(['--mode=lan', '--', 'uni', '-p', 'mp-weixin'], {
    VITE_API_BASE_URL: 'http://192.168.50.80:3010',
    CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP: '10.216.143.10'
  })
  assert.equal(
    resolveLocalApiBaseUrl(staleLanEnv.options, {
      CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP: '10.216.143.10'
    }),
    'http://10.216.143.10:3010',
    'LAN mode must ignore a stale inherited VITE_API_BASE_URL'
  )
  const explicitLanEnv = parseLocalApiEnvironmentArgs(
    ['--mode=lan', '--base-url=http://192.168.50.80:3010', '--', 'uni', '-p', 'mp-weixin'],
    { VITE_API_BASE_URL: 'http://10.216.143.10:3010' }
  )
  assert.equal(
    resolveLocalApiBaseUrl(explicitLanEnv.options),
    'http://192.168.50.80:3010',
    'CLI --base-url remains an explicit LAN override'
  )
  assert.equal(
    resolveLocalApiBaseUrl({ baseUrl: 'http://127.0.0.1:3010/' }),
    'http://127.0.0.1:3010'
  )

  const events = []
  let runtimeSessionFactoryCalls = 0
  await runLocalApiEnvironment({
    argv: ['--base-url=http://127.0.0.1:3010', '--', 'uni', '-p', 'h5'],
    environment: { CLOUDBASE_LOCAL_SESSION_TOKEN: 'session-token-must-stay-in-parent' },
    output: { write() {} },
    ensureRuntime: async apiBaseUrl => {
      events.push(`gateway:${apiBaseUrl}`)
      return null
    },
    spawnProcess: (command, args, options) => {
      events.push(`spawn:${command}:${args.join(' ')}`)
      assert.equal(options.env.VITE_API_BASE_URL, 'http://127.0.0.1:3010')
      assert.equal(options.env.CLOUDBASE_LOCAL_SESSION_TOKEN, undefined)
      return successfulChild()
    },
    runtimeSessionFactory: () => {
      runtimeSessionFactoryCalls += 1
      throw new Error('h5 must not enter the mp-weixin watch lease lifecycle')
    }
  })
  assert.deepEqual(events, ['gateway:http://127.0.0.1:3010', 'spawn:uni:-p h5'])
  assert.equal(runtimeSessionFactoryCalls, 0)

  let resolveReusedExit
  const reusedExit = new Promise(resolve => {
    resolveReusedExit = resolve
  })
  const reuseSignalSource = new EventEmitter()
  let reuseStopped = false
  const reusePromise = runLocalApiEnvironment({
    argv: [
      '--mode=lan',
      '--reuse-output',
      '--base-url=http://127.0.0.1:3011',
      '--',
      'uni',
      '-p',
      'mp-weixin'
    ],
    signalSource: reuseSignalSource,
    output: { write() {} },
    ensureRuntime: async () => null,
    runtimeSessionFactory: options => {
      assert.equal(options.reuseOutput, true)
      return {
        start() {
          return { status: 'started', child: null }
        },
        waitForExit() {
          return reusedExit
        },
        async stop() {
          reuseStopped = true
          resolveReusedExit({ code: 0, signal: 'SIGINT' })
          return { status: 'released' }
        }
      }
    }
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reuseStopped, false, 'the reuse session should still be alive before SIGINT')
  reuseSignalSource.emit('SIGINT')
  await reusePromise
  assert.equal(reuseStopped, true, 'SIGINT must release the reused runtime lease')

  let verifiedReuseStopped = false
  let verifiedReuseWaited = false
  let verifiedReuseStarts = 0
  let verifiedReuseClaims = 0
  let verifiedReuseGatewayChecks = 0
  const verifiedReuseSignals = []
  await runLocalApiEnvironment({
    argv: ['--mode=lan', '--base-url=http://127.0.0.1:3011', '--', 'uni', '-p', 'mp-weixin'],
    output: { write() {} },
    ensureRuntime: async () => {
      verifiedReuseGatewayChecks += 1
      return null
    },
    runtimeSessionFactory: () => ({
      claim() {
        verifiedReuseClaims += 1
        return { status: 'acquired' }
      },
      start() {
        verifiedReuseStarts += 1
        if (verifiedReuseStarts === 1) {
          return {
            status: 'reused',
            reason: 'verified_same_target_owner_alive',
            lease: { owner_pid: 41007, child_pid: 41008 }
          }
        }
        return { status: 'started', child: successfulChild() }
      },
      waitForExit() {
        verifiedReuseWaited = true
        return Promise.resolve({ code: 0, signal: null })
      },
      async stop() {
        verifiedReuseStopped = true
        return { status: 'released' }
      }
    }),
    processCommand: pid => {
      if (pid === 41007) {
        return 'node scripts/dev/run-local-api-env.mjs --mode=lan -- uni -p mp-weixin'
      }
      if (pid === 41008) {
        return 'node node_modules/.bin/uni -p mp-weixin'
      }
      return ''
    },
    signalProcess: (pid, signal) => verifiedReuseSignals.push({ pid, signal })
  })
  assert.equal(verifiedReuseStarts, 2, 'daily startup must retry after the old owner releases')
  assert.equal(verifiedReuseClaims, 1)
  assert.equal(
    verifiedReuseGatewayChecks,
    2,
    'handoff must recheck the gateway after lease acquisition'
  )
  assert.equal(verifiedReuseWaited, true)
  assert.equal(verifiedReuseStopped, true)
  assert.deepEqual(verifiedReuseSignals, [{ pid: 41007, signal: 'SIGINT' }])

  let unverifiedOwnerSignalled = false
  await assert.rejects(
    runLocalApiEnvironment({
      argv: ['--mode=lan', '--base-url=http://127.0.0.1:3011', '--', 'uni', '-p', 'mp-weixin'],
      output: { write() {} },
      ensureRuntime: async () => null,
      runtimeSessionFactory: () => ({
        start() {
          return { status: 'reused', lease: { owner_pid: 41009, child_pid: 41010 } }
        },
        async stop() {
          return { status: 'not_owner' }
        }
      }),
      processCommand: () => 'unknown-process',
      signalProcess: () => {
        unverifiedOwnerSignalled = true
      }
    }),
    error => error?.code === 'LOCAL_RUNTIME_WATCH_LEASE_UNAVAILABLE'
  )
  assert.equal(unverifiedOwnerSignalled, false, 'unverified owners must never receive a signal')

  const realReuseRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'local-runtime-reuse-'))
  const realReuseTarget = path.join(realReuseRoot, 'dist', 'dev', 'mp-weixin')
  const qaOwnedLease = acquireLocalRuntimeLease({
    targetPath: realReuseTarget,
    leaseRoot: realReuseRoot,
    ownerPid: process.pid,
    ownerId: 'qa-session-that-has-exited-but-runtime-is-still-serving',
    isProcessAlive: () => true
  })
  assert.equal(qaOwnedLease.status, 'acquired')
  let dailyWatcherSpawned = false
  await runLocalApiEnvironment({
    argv: [
      '--skip-health-check',
      `--output-dir=${realReuseTarget}`,
      `--runtime-lease-root=${realReuseRoot}`,
      '--',
      'uni',
      '-p',
      'mp-weixin'
    ],
    output: { write() {} },
    spawnProcess: () => {
      dailyWatcherSpawned = true
      return successfulChild()
    },
    runtimeSessionFactory: options =>
      createManagedLocalRuntimeSession({
        ...options,
        ownerId: 'daily-retry-after-qa-exit',
        isProcessAlive: () => false
      })
  })
  assert.equal(dailyWatcherSpawned, true, 'stale leases must allow the new daily watcher to start')
  assert.equal(
    fs.existsSync(qaOwnedLease.file_path),
    false,
    'the handed-off daily watcher must release its lease during cleanup'
  )
  fs.rmSync(realReuseRoot, { recursive: true, force: true })
} finally {
  // This contract creates no listener, lease, gateway or external process.
}
