import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import {
  acquireLocalRuntimeLease,
  createManagedLocalRuntimeSession,
  getFirstLanAddress,
  isMpWeixinWatchCommand,
  localRuntimeLeasePath,
  releaseLocalRuntimeLease
} from '../../../../../scripts/dev/local-runtime-session.mjs'
import { repoRoot } from './helpers.mjs'

const leaseRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'local-runtime-session-'))
const targetPath = path.join(repoRoot, 'dist', 'dev', 'mp-weixin')

try {
  assert.equal(isMpWeixinWatchCommand(['uni', '-p', 'mp-weixin']), true)
  assert.equal(isMpWeixinWatchCommand(['uni', 'build', '-p', 'mp-weixin']), false)
  assert.equal(
    getFirstLanAddress(() => ({
      lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
      en0: [{ family: 'IPv4', internal: false, address: '192.168.1.24' }]
    })),
    '192.168.1.24'
  )

  const acquired = acquireLocalRuntimeLease({
    targetPath,
    leaseRoot,
    ownerPid: 41001,
    ownerId: 'first-owner',
    isProcessAlive: () => true
  })
  assert.equal(acquired.status, 'acquired')
  const reused = acquireLocalRuntimeLease({
    targetPath,
    leaseRoot,
    ownerPid: 41002,
    ownerId: 'second-owner',
    isProcessAlive: pid => pid === 41001
  })
  assert.equal(reused.status, 'reused')
  assert.equal(reused.lease.owner_pid, 41001)
  assert.equal(
    releaseLocalRuntimeLease({ filePath: acquired.file_path, lease: acquired.lease }).status,
    'released'
  )

  const stale = acquireLocalRuntimeLease({
    targetPath,
    leaseRoot,
    ownerPid: 41003,
    ownerId: 'stale-owner',
    isProcessAlive: () => false
  })
  assert.equal(stale.status, 'acquired')
  const replacement = acquireLocalRuntimeLease({
    targetPath,
    leaseRoot,
    ownerPid: 41004,
    ownerId: 'replacement-owner',
    isProcessAlive: () => false
  })
  assert.equal(replacement.status, 'acquired')
  assert.equal(replacement.lease.owner_id, 'replacement-owner')
  assert.equal(
    releaseLocalRuntimeLease({ filePath: replacement.file_path, lease: replacement.lease }).status,
    'released'
  )

  const invalidTarget = path.join(repoRoot, 'dist', 'dev', 'mp-weixin-invalid')
  const invalidLeasePath = localRuntimeLeasePath(invalidTarget, leaseRoot)
  fs.writeFileSync(invalidLeasePath, '{not-json}\n')
  const blocked = acquireLocalRuntimeLease({
    targetPath: invalidTarget,
    leaseRoot,
    ownerPid: 41005,
    ownerId: 'blocked-owner',
    isProcessAlive: () => false
  })
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.code, 'local_runtime_lease_identity_unverified')
  assert.equal(fs.readFileSync(invalidLeasePath, 'utf8'), '{not-json}\n')

  const spawned = []
  function syntheticChild(pid) {
    const child = new EventEmitter()
    child.pid = pid
    child.exitCode = null
    child.signalCode = null
    child.killSignals = []
    child.kill = signal => {
      child.killSignals.push(signal)
      child.exitCode = 0
      child.signalCode = signal
      child.emit('exit', child.exitCode, signal)
      return true
    }
    return child
  }
  const runtime = createManagedLocalRuntimeSession({
    targetPath,
    leaseRoot,
    command: ['uni', '-p', 'mp-weixin'],
    environment: { VITE_APP_ENV: 'development' },
    mode: 'lan',
    initialApiBaseUrl: 'http://192.168.1.24:3010',
    resolveLanApiBaseUrl: () => 'http://192.168.1.25:3010',
    ownerPid: 41006,
    ownerId: 'managed-owner',
    refreshIntervalMs: 60_000,
    spawnProcess: (_command, _args, options) => {
      const child = syntheticChild(42000 + spawned.length)
      spawned.push({ child, options })
      return child
    },
    isProcessAlive: () => false
  })
  assert.equal(runtime.claim().status, 'acquired')
  assert.equal(runtime.start().status, 'started')
  assert.equal(spawned[0].options.env.VITE_API_BASE_URL, 'http://192.168.1.24:3010')
  const refreshed = await runtime.refresh()
  assert.equal(refreshed.status, 'restarted')
  assert.deepEqual(spawned[0].child.killSignals, ['SIGINT'])
  assert.equal(spawned[1].options.env.VITE_API_BASE_URL, 'http://192.168.1.25:3010')
  assert.equal(runtime.state.api_base_url, 'http://192.168.1.25:3010')
  assert.equal((await runtime.stop()).status, 'released')
} finally {
  fs.rmSync(leaseRoot, { recursive: true, force: true })
}
