import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import {
  parseLocalApiEnvironmentArgs,
  resolveLocalApiBaseUrl
} from '../../../../../scripts/dev/local-api-env-config.mjs'
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

  const parsed = parseLocalApiEnvironmentArgs([
    '--mode=lan',
    '--port=3015',
    '--no-start-functions',
    '--',
    'uni',
    '-p',
    'mp-weixin'
  ], {})
  assert.equal(parsed.options.mode, 'lan')
  assert.equal(parsed.options.port, 3015)
  assert.equal(parsed.options.startFunctions, false)
  assert.deepEqual(parsed.command, ['uni', '-p', 'mp-weixin'])
  assert.equal(parsed.options.baseUrlSource, '')
  const staleLanEnv = parseLocalApiEnvironmentArgs(
    ['--mode=lan', '--', 'uni', '-p', 'mp-weixin'],
    {
      VITE_API_BASE_URL: 'http://192.168.50.80:3010',
      CLOUDBASE_LOCAL_FUNCTIONS_HOST_IP: '10.216.143.10'
    }
  )
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
    output: { write() {} },
    ensureRuntime: async apiBaseUrl => {
      events.push(`gateway:${apiBaseUrl}`)
      return null
    },
    spawnProcess: (command, args, options) => {
      events.push(`spawn:${command}:${args.join(' ')}`)
      assert.equal(options.env.VITE_API_BASE_URL, 'http://127.0.0.1:3010')
      return successfulChild()
    },
    runtimeSessionFactory: () => {
      runtimeSessionFactoryCalls += 1
      throw new Error('h5 must not enter the mp-weixin watch lease lifecycle')
    }
  })
  assert.deepEqual(events, ['gateway:http://127.0.0.1:3010', 'spawn:uni:-p h5'])
  assert.equal(runtimeSessionFactoryCalls, 0)
} finally {
  // This contract creates no listener, lease, gateway or external process.
}
