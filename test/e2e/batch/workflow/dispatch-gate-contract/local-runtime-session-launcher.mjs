import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { runLocalApiEnvironment } from '../../../../../scripts/dev/run-local-api-env.mjs'
import { localRuntimeLeasePath } from '../../../../../scripts/dev/local-runtime-session.mjs'
import { repoRoot } from './helpers.mjs'

const tempRoot = fs.mkdtempSync(path.join(repoRoot, '.tmp', 'local-runtime-launcher-'))
const leaseRoot = path.join(tempRoot, 'leases')
const targetPath = path.join(tempRoot, 'dist', 'dev', 'mp-weixin')

function createChild(pid, { exitImmediately = false } = {}) {
  const child = new EventEmitter()
  child.pid = pid
  child.exitCode = null
  child.signalCode = null
  child.killSignals = []
  child.kill = signal => {
    child.killSignals.push(signal)
    if (child.exitCode === null && !child.signalCode) {
      child.exitCode = 0
      child.signalCode = signal
      child.emit('exit', child.exitCode, signal)
    }
    return true
  }
  if (exitImmediately) {
    queueMicrotask(() => {
      child.exitCode = 0
      child.emit('exit', 0, null)
    })
  }
  return child
}

function silentOutput() {
  return { write() {} }
}

try {
  const signals = new EventEmitter()
  const spawned = []
  let spawnedResolve
  const spawnedPromise = new Promise(resolve => {
    spawnedResolve = resolve
  })
  const launcher = runLocalApiEnvironment({
    argv: [
      '--mode=lan',
      '--base-url=http://192.168.1.24:3010',
      '--skip-health-check',
      '--',
      'uni',
      '-p',
      'mp-weixin'
    ],
    signalSource: signals,
    output: silentOutput(),
    ensureRuntime: async () => {
      throw new Error('skip-health-check must not start the gateway')
    },
    spawnProcess: (command, args, options) => {
      const child = createChild(51001)
      spawned.push({ command, args, options, child })
      spawnedResolve()
      return child
    },
    runtimeTargetPath: targetPath,
    runtimeLeaseRoot: leaseRoot
  })
  await spawnedPromise
  const leaseFile = localRuntimeLeasePath(targetPath, leaseRoot)
  const lease = JSON.parse(fs.readFileSync(leaseFile, 'utf8'))
  assert.equal(spawned.length, 1)
  assert.deepEqual(spawned[0].args, ['-p', 'mp-weixin'])
  assert.equal(spawned[0].options.env.VITE_API_BASE_URL, 'http://192.168.1.24:3010')
  assert.equal(lease.target_path, path.resolve(targetPath))
  assert.equal(lease.child_pid, 51001)
  assert.equal(lease.api_base_url, 'http://192.168.1.24:3010')

  const foreignLease = path.join(leaseRoot, 'foreign-owner.json')
  fs.writeFileSync(foreignLease, '{"owner":"other-launcher"}\n')
  signals.emit('SIGTERM')
  await launcher
  assert.deepEqual(spawned[0].child.killSignals, ['SIGINT'])
  assert.equal(fs.existsSync(leaseFile), false, 'the launcher must release only its own lease')
  assert.equal(fs.existsSync(foreignLease), true, 'foreign lease records must remain untouched')

  for (const command of [
    ['uni', 'build', '-p', 'mp-weixin'],
    ['uni', '-p', 'h5']
  ]) {
    let runtimeSessionFactoryCalls = 0
    await runLocalApiEnvironment({
      argv: ['--base-url=http://127.0.0.1:3010', '--skip-health-check', '--', ...command],
      output: silentOutput(),
      ensureRuntime: async () => null,
      spawnProcess: () =>
        createChild(52000 + runtimeSessionFactoryCalls, { exitImmediately: true }),
      runtimeSessionFactory: () => {
        runtimeSessionFactoryCalls += 1
        throw new Error('non-watch commands must not create a runtime lease')
      },
      runtimeTargetPath: targetPath,
      runtimeLeaseRoot: leaseRoot
    })
    assert.equal(runtimeSessionFactoryCalls, 0, `${command.join(' ')} must not create a lease`)
    assert.equal(fs.existsSync(leaseFile), false)
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
