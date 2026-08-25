#!/usr/bin/env node
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const LOCAL_RUNTIME_PORTS = [
  3010,
  3011,
  9424,
  ...Array.from({ length: 8 }, (_, index) => 9000 + index),
  ...Array.from({ length: 8 }, (_, index) => 9100 + index)
]

function processIsAlive(pid) {
  const numericPid = Number(pid)
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false
  }
  try {
    process.kill(numericPid, 0)
    const state = spawnSync('ps', ['-p', String(numericPid), '-o', 'state='], {
      encoding: 'utf8'
    }).stdout
    return !/^\s*Z/u.test(String(state || ''))
  } catch {
    return false
  }
}

function processCommand(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
    encoding: 'utf8'
  })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

function activeLocalRuntimeLeaseEvidence() {
  const leaseRoot = path.resolve(process.cwd(), '.tmp', 'local-runtime-sessions')
  if (!fs.existsSync(leaseRoot)) {
    return []
  }
  const evidence = []
  for (const entry of fs.readdirSync(leaseRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }
    const filePath = path.join(leaseRoot, entry.name)
    let lease
    try {
      lease = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      continue
    }
    const ownerAlive = processIsAlive(lease.owner_pid)
    const childAlive = processIsAlive(lease.child_pid)
    if (!ownerAlive && !childAlive) {
      continue
    }
    evidence.push({
      kind: 'local_runtime_lease',
      file: filePath,
      target_path: lease.target_path || null,
      owner_pid: lease.owner_pid || null,
      owner_command: ownerAlive ? processCommand(lease.owner_pid) : null,
      child_pid: lease.child_pid || null,
      child_command: childAlive ? processCommand(lease.child_pid) : null
    })
  }
  return evidence
}

function listeningPortEvidence() {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return []
  }
  const evidence = []
  for (const port of LOCAL_RUNTIME_PORTS) {
    const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpcn'], {
      encoding: 'utf8'
    })
    if (result.status !== 0 || !String(result.stdout || '').trim()) {
      continue
    }
    evidence.push({ port, raw: String(result.stdout).trim() })
  }
  return evidence
}

function assertContractRuntimeIsIdle() {
  const leases = activeLocalRuntimeLeaseEvidence()
  const listeners = listeningPortEvidence()
  if (leases.length === 0 && listeners.length === 0) {
    return
  }
  const report = {
    status: 'blocked',
    code: 'dispatch_gate_contract_runtime_conflict',
    message:
      'dispatch-gate contract suite must run while daily and QA local runtimes are stopped; no cleanup test was started',
    active_local_runtime_leases: leases,
    reserved_port_listeners: listeners
  }
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exit(2)
}

assertContractRuntimeIsIdle()

const contractModules = [
  './dispatch-gate-contract/episode-and-hook.mjs',
  './dispatch-gate-contract/devtools-recovery.mjs',
  './dispatch-gate-contract/qa-preflight-wx-request.mjs',
  './dispatch-gate-contract/qa-preflight-deadlines.mjs',
  './dispatch-gate-contract/qa-reconciliation.mjs',
  './dispatch-gate-contract/native-lifecycle-probe.mjs',
  './dispatch-gate-contract/qa-runtime-cleanup.mjs',
  './dispatch-gate-contract/qa-native-auth-bridge.mjs',
  './dispatch-gate-contract/qa-auth-failure-classification.mjs',
  './dispatch-gate-contract/qa-runtime-plane.mjs',
  './dispatch-gate-contract/qa-devtools-version-compatibility.mjs',
  './dispatch-gate-contract/qa-auth-broker.mjs',
  './dispatch-gate-contract/qa-automator-auth-concurrency.mjs',
  './dispatch-gate-contract/qa-node-command.mjs',
  './dispatch-gate-contract/qa-automator-v3-suite.mjs',
  './dispatch-gate-contract/qa-run-lease.mjs',
  './dispatch-gate-contract/qa-automator-stress.mjs',
  './dispatch-gate-contract/qa-automator-warm-stability.mjs',
  './dispatch-gate-contract/qa-automator-soak.mjs',
  './dispatch-gate-contract/qa-automator-live-matrix.mjs',
  './dispatch-gate-contract/qa-automator-v3-final-gate.mjs',
  './dispatch-gate-contract/mp-build-exclusive.mjs',
  './dispatch-gate-contract/automator-artifact-boundary.mjs',
  './dispatch-gate-contract/renderer-screenshot-retry-contract.mjs',
  './dispatch-gate-contract/screenshot-stability-contract.mjs',
  './dispatch-gate-contract/screenshot-worker-contract.mjs',
  '../cross-contract/active-question-marker.mjs',
  '../cross-contract/environment-entry-flow.mjs',
  '../cross-contract/retake-authorization.mjs',
  '../cross-contract/vendor-minify-contract.mjs',
  './dispatch-gate-contract/qa-and-validation.mjs'
]

// These contracts intentionally exercise one global QA plane. Importing
// node:test modules is not a sequencing primitive: their tests remain
// scheduled after the import resolves, so a static import loop can mutate
// shared mock globals, lease files, and cleanup state before the previous
// module has actually finished. Run each module in a child process and wait
// for its terminal status before starting the next one.
const contractRoot = path.dirname(fileURLToPath(import.meta.url))
for (const modulePath of contractModules) {
  const result = spawnSync(process.execPath, [path.join(contractRoot, modulePath)], {
    cwd: process.cwd(),
    stdio: 'inherit'
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    process.exit()
  }
}

console.log('dispatch gate contract E2E passed')
