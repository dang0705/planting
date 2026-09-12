import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { once } from 'node:events'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import {
  QA_RUNTIME_FUNCTION_PORT_BASE,
  QA_RUNTIME_ROOT,
  QA_RUNTIME_MANIFEST_ROOT,
  QA_RUNTIME_WS_PORT,
  QA_RUNTIME_CONTROL_PORT,
  QA_RUNTIME_SERVICE_PORT,
  QA_RUNTIME_NATIVE_AUTH_DEBUG_PORT,
  QA_RUNTIME_LAN_PORT,
  QA_RUNTIME_DEVTOOLS_RUNTIME_KIND,
  acquireFixedQaPortLock,
  acquireQaSupervisorLease,
  assertQaRuntimeReady,
  deriveQaRuntime,
  ensureQaOwnerMarker,
  ensureQaRuntimeRoot,
  qaRuntimeFixedPorts,
  prepareQaRuntimeProject,
  readQaRuntimeManifest,
  createQaRuntimeStagingPath,
  promoteQaRuntimeGeneration,
  runtimeManifestIsReady,
  writeQaRuntimeManifest
} from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-runtime-plane.mjs'
import {
  ensureManagedDailyProjectDisplayName,
  reconcileManagedDailyControlMarkers
} from '../../../../../scripts/qa/managed-daily-project.mjs'
import { getFunctionPorts } from '../../../../../scripts/dev/local-api-env-config.mjs'

ensureQaRuntimeRoot()
const sourceProjectPath = path.join(process.cwd(), 'dist', 'dev', 'mp-weixin')
const runtime = deriveQaRuntime({ sourceProjectPath })
assert.equal(runtime.runtimePath.startsWith(QA_RUNTIME_ROOT), true)
assert.deepEqual(
  qaRuntimeFixedPorts()
    .slice(0, QA_RUNTIME_DEVTOOLS_RUNTIME_KIND === 'official_electron' ? 4 : 5)
    .map(item => item.port),
  [
    QA_RUNTIME_WS_PORT,
    QA_RUNTIME_CONTROL_PORT,
    QA_RUNTIME_SERVICE_PORT,
    ...(QA_RUNTIME_DEVTOOLS_RUNTIME_KIND === 'official_electron'
      ? []
      : [QA_RUNTIME_NATIVE_AUTH_DEBUG_PORT]),
    QA_RUNTIME_LAN_PORT
  ]
)
assert.deepEqual(
  qaRuntimeFixedPorts()
    .slice(QA_RUNTIME_DEVTOOLS_RUNTIME_KIND === 'official_electron' ? 4 : 5)
    .map(item => item.port),
  Object.values(getFunctionPorts(QA_RUNTIME_FUNCTION_PORT_BASE))
)

const marker = ensureQaOwnerMarker()
assert.ok(['created', 'preserved'].includes(marker.status))
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'planting-qa-plane-'))
const fakeRuntime = {
  ...runtime,
  runtimePath: path.join(temporaryRoot, 'mp-weixin')
}
fs.mkdirSync(fakeRuntime.runtimePath, { recursive: true })
const building = writeQaRuntimeManifest(fakeRuntime, { build_status: 'building' })
assert.equal(runtimeManifestIsReady(fakeRuntime, building), false)
const ready = writeQaRuntimeManifest(fakeRuntime, {
  build_status: 'ready',
  built_at: new Date().toISOString(),
  identity_hash: 'a'.repeat(64),
  auth_generation: 1,
  api_base_url: 'http://127.0.0.1:3011',
  build_output_path: fakeRuntime.runtimePath,
  qa_owner_pid: process.pid,
  lan_owner_pid: process.pid,
  devtools_owner_pid: process.pid,
  devtools_package_hash: 'b'.repeat(64)
})
assert.equal(runtimeManifestIsReady(fakeRuntime, ready), true)
assert.equal(
  runtimeManifestIsReady(fakeRuntime, {
    ...ready,
    api_base_url: 'https://cloud1-2grufevs395a9d5e.api.tcloudbasegateway.com/v1/functions'
  }),
  true
)
assert.equal(assertQaRuntimeReady(fakeRuntime).build_status, 'ready')
assert.deepEqual(readQaRuntimeManifest(fakeRuntime.runtimePath), ready)
assert.equal(fs.existsSync(path.join(fakeRuntime.runtimePath, '.qa-runtime-manifest.json')), false)
assert.equal(ready.manifest_path.startsWith(`${fakeRuntime.runtimePath}${path.sep}`), false)
assert.equal(ready.manifest_path.startsWith(QA_RUNTIME_MANIFEST_ROOT), false)

const dailyProject = path.join(temporaryRoot, 'daily-project')
fs.mkdirSync(dailyProject, { recursive: true })
fs.writeFileSync(path.join(dailyProject, 'project.config.json'), '{"projectname":"青花植"}\n')
assert.deepEqual(ensureManagedDailyProjectDisplayName(dailyProject), {
  changed: true,
  projectname: '青花植【日常】',
  config_path: path.join(dailyProject, 'project.config.json')
})
assert.equal(
  JSON.parse(fs.readFileSync(path.join(dailyProject, 'project.config.json'), 'utf8')).projectname,
  '青花植【日常】'
)
assert.equal(ensureManagedDailyProjectDisplayName(dailyProject).changed, false)

const markerProfile = path.join(temporaryRoot, 'daily-marker-profile')
const markerRecovery = path.join(temporaryRoot, 'marker-recovery')
fs.mkdirSync(path.join(markerProfile, 'Default'), { recursive: true })
fs.writeFileSync(path.join(markerProfile, 'Default', '.ide'), '9423')
fs.writeFileSync(path.join(markerProfile, 'Default', '.ide-status'), 'On')
fs.writeFileSync(path.join(markerProfile, 'Default', '.cli'), '3799')
const markerRecoveryResult = reconcileManagedDailyControlMarkers({
  profile: markerProfile,
  expectedProfile: markerProfile,
  recoveryRoot: markerRecovery,
  profileProcesses: () => [],
  listenerPids: () => []
})
assert.equal(markerRecoveryResult.status, 'recovered')
assert.equal(fs.existsSync(path.join(markerProfile, 'Default', '.ide')), false)
assert.equal(fs.existsSync(path.join(markerRecoveryResult.recovery_path, 'Default', '.cli')), true)
const dynamicMarkerProfile = path.join(temporaryRoot, 'daily-dynamic-marker-profile')
const dynamicMarkerRecovery = path.join(temporaryRoot, 'dynamic-marker-recovery')
fs.mkdirSync(path.join(dynamicMarkerProfile, 'Default'), { recursive: true })
fs.writeFileSync(path.join(dynamicMarkerProfile, 'Default', '.ide'), '55591')
fs.writeFileSync(path.join(dynamicMarkerProfile, 'Default', '.ide-status'), 'On')
fs.writeFileSync(path.join(dynamicMarkerProfile, 'Default', '.cli'), '55591')
const dynamicMarkerRecoveryResult = reconcileManagedDailyControlMarkers({
  profile: dynamicMarkerProfile,
  expectedProfile: dynamicMarkerProfile,
  recoveryRoot: dynamicMarkerRecovery,
  profileProcesses: () => [],
  listenerPids: () => []
})
assert.equal(dynamicMarkerRecoveryResult.status, 'recovered')
assert.equal(
  fs.existsSync(path.join(dynamicMarkerRecoveryResult.recovery_path, 'Default', '.ide')),
  true
)
assert.throws(
  () =>
    reconcileManagedDailyControlMarkers({
      profile: markerProfile,
      expectedProfile: markerProfile,
      recoveryRoot: markerRecovery,
      profileProcesses: () => [{ pid: 123 }],
      listenerPids: () => []
    }),
  error => error?.code === 'qa_managed_daily_control_marker_owner_active'
)

const markerRuntime = {
  ...runtime,
  runtimeKey: 'c'.repeat(32),
  runtimePath: path.join(temporaryRoot, 'marker-runtime', 'mp-weixin')
}
fs.mkdirSync(markerRuntime.runtimePath, { recursive: true })
fs.writeFileSync(
  path.join(markerRuntime.runtimePath, 'project.config.json'),
  '{"projectname":"青花植【日常】"}\n'
)
const externalMarker = prepareQaRuntimeProject(markerRuntime, {
  sessionId: 'contract-session',
  projectPath: markerRuntime.runtimePath
})
assert.equal(externalMarker.markerPath.startsWith(QA_RUNTIME_MANIFEST_ROOT), true)
assert.equal(
  fs.existsSync(path.join(markerRuntime.runtimePath, '.qa-runtime-snapshot.json')),
  false
)
assert.equal(
  fs.existsSync(path.join(markerRuntime.runtimePath, '.qa-runtime-manifest.json')),
  false
)
assert.equal(
  JSON.parse(fs.readFileSync(externalMarker.markerPath, 'utf8')).project_path,
  markerRuntime.runtimePath
)
assert.equal(
  JSON.parse(fs.readFileSync(path.join(markerRuntime.runtimePath, 'project.config.json'), 'utf8'))
    .projectname,
  '青花植【QA】'
)
fs.rmSync(externalMarker.markerPath, { force: true })

const manifestRuntime = {
  ...runtime,
  runtimeKey: 'a'.repeat(32),
  runtimePath: path.join(QA_RUNTIME_ROOT, 'runtimes', 'a'.repeat(32), 'mp-weixin')
}
const managedManifest = writeQaRuntimeManifest(manifestRuntime, {
  build_status: 'building'
})
assert.equal(managedManifest.manifest_path.startsWith(QA_RUNTIME_MANIFEST_ROOT), true)
assert.equal(
  fs.existsSync(path.join(manifestRuntime.runtimePath, '.qa-runtime-manifest.json')),
  false
)
fs.rmSync(managedManifest.manifest_path, { force: true })

const generationRuntime = {
  ...runtime,
  runtimePath: path.join(temporaryRoot, 'generation-runtime', 'mp-weixin')
}
fs.mkdirSync(generationRuntime.runtimePath, { recursive: true })
fs.writeFileSync(path.join(generationRuntime.runtimePath, 'old-generation.txt'), 'old')
const stagingPath = createQaRuntimeStagingPath(generationRuntime, 'contract-generation')
fs.mkdirSync(path.join(stagingPath, 'pages', 'index'), { recursive: true })
fs.writeFileSync(path.join(stagingPath, 'app.json'), '{}\n')
fs.writeFileSync(path.join(stagingPath, 'project.config.json'), '{}\n')
fs.writeFileSync(path.join(stagingPath, 'pages', 'index', 'index.js'), '')
fs.writeFileSync(path.join(stagingPath, 'new-generation.txt'), 'new')
const promotion = promoteQaRuntimeGeneration(generationRuntime, {
  stagingPath,
  token: 'contract-generation'
})
assert.equal(promotion.status, 'promoted')
assert.equal(
  fs.readFileSync(path.join(generationRuntime.runtimePath, 'new-generation.txt'), 'utf8'),
  'new'
)
assert.equal(fs.existsSync(path.join(generationRuntime.runtimePath, 'old-generation.txt')), false)
assert.equal(
  fs.readFileSync(path.join(promotion.retired_path, 'old-generation.txt'), 'utf8'),
  'old'
)

const runtimeKey = crypto.randomUUID()
const supervisorRoot = path.join(temporaryRoot, 'supervisor')
const firstLease = await acquireQaSupervisorLease({
  runtimeKey,
  timeoutMs: 1000,
  supervisorRoot
})
let secondAcquired = false
const secondLeasePromise = acquireQaSupervisorLease({
  runtimeKey: `${runtimeKey}-second`,
  timeoutMs: 500,
  supervisorRoot
}).then(lease => {
  secondAcquired = true
  return lease
})
await new Promise(resolve => setTimeout(resolve, 100))
assert.equal(secondAcquired, false)
firstLease.release()
const secondLease = await secondLeasePromise
assert.equal(secondAcquired, true)
secondLease.release()

const occupiedServer = net.createServer()
occupiedServer.listen(0, '127.0.0.1')
await once(occupiedServer, 'listening')
const occupiedPort = occupiedServer.address().port
assert.throws(
  () =>
    acquireFixedQaPortLock({
      kind: `contract-conflict-${process.pid}`,
      port: occupiedPort,
      runtimeKey
    }),
  error => error?.code === 'qa_port_conflict'
)
await new Promise(resolve => occupiedServer.close(resolve))
const held = acquireFixedQaPortLock({
  kind: `contract-${process.pid}`,
  port: occupiedPort,
  runtimeKey
})
assert.equal(held.status, 'acquired')
held.release()
fs.rmSync(temporaryRoot, { recursive: true, force: true })
console.log('QA runtime plane contract passed')
