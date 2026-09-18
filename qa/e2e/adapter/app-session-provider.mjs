import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { connectWechatAutomator } from '../../../packages/miniprogram-e2e/src/platforms/wechat/index.mjs'
import { launchTestOwnedDevTools } from '../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-devtools-launch.mjs'
import {
  acquirePersistentProfileLock,
  processAlive,
  registerQaProjectInProfile,
  restoreQaProjectInProfile,
  runDevToolsCli,
  terminateProcessTree,
  waitFor
} from '../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs'
import {
  acquireFixedQaPortLock,
  reapStaleQaFixedPortLocks,
  QA_RUNTIME_SERVICE_PORT
} from '../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-runtime-plane.mjs'
import { listenerPids } from '../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-process-topology.mjs'
import { requestDevToolsControl } from '../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime-control.mjs'
import { createRuntimeHttpClient } from './runtime-http-client.mjs'
import { verifyPlantingLiveRuntime } from './planting-live-verifier.mjs'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..')
const SESSION_ROOT = path.join(repoRoot, '.tmp', 'dispatch-task', 'mp-e2e-sessions')
const CONTROL_PORT = 9422
const AUTOMATOR_PORT = 9421
const AUTOMATOR_TIMEOUT_MS = 45_000
const CLI_TIMEOUT_MS = 180_000

function sessionPath(id) {
  return path.join(SESSION_ROOT, `${id}`)
}

async function invokeCli({ home, args, outputPath }) {
  return runDevToolsCli({ home, args, outputPath, timeoutMs: CLI_TIMEOUT_MS })
}

async function waitForPage(miniProgram) {
  return waitFor(
    async () => {
      const page = await Promise.race([
        miniProgram.currentPage().catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 2_000))
      ])
      return page?.path ? page : false
    },
    AUTOMATOR_TIMEOUT_MS,
    'WeChat compiled artifact page'
  )
}

function releaseLocks(locks) {
  for (const lock of locks.reverse()) {
    lock?.release?.()
  }
}

/**
 * Planting-specific host adapter. The only project behavior here is the real
 * LAN request verifier; DevTools is opened directly against the artifact path
 * supplied by the reusable runner. No watcher bootstrap or default dist path
 * is consulted.
 */
export const plantingApplicationSessionProvider = {
  async start({ artifact, evidenceDir, profileLease }) {
    if (profileLease?.kind !== 'wechat-isolated-persistent-qa-profile') {
      return {
        status: 'blocked',
        code: 'planting_qa_profile_lease_missing',
        reason: 'Planting sessions require the isolated QA DevTools profile lease',
        evidence: []
      }
    }
    if (!profileLease.profile || !profileLease.home) {
      return {
        status: 'blocked',
        code: 'planting_qa_profile_lease_incomplete',
        reason: 'The QA profile provider did not return an owned profile path',
        evidence: []
      }
    }
    const id = `planting-${Date.now()}-${randomUUID()}`
    const root = sessionPath(id)
    const logPath = path.join(root, 'devtools.log')
    const locks = []
  let launch = null
  let connected = null
  let projectRegistration = null
    let stopped = false
    await mkdir(root, { recursive: true })
    try {
      reapStaleQaFixedPortLocks()
      locks.push(acquirePersistentProfileLock())
      for (const [kind, port] of [
        ['automator', AUTOMATOR_PORT],
        ['control', CONTROL_PORT],
        ['service', QA_RUNTIME_SERVICE_PORT]
      ]) {
        locks.push(acquireFixedQaPortLock({ kind, port, runtimeKey: id }))
      }
      // The official DevTools compiler resolves the cached runtime state by
      // project path.  A copied compiled asset is intentionally not enrolled
      // in the user's daily project list, so the Planting adapter registers
      // this one run in the isolated QA profile and restores it on shutdown.
      const sourceProjectPath = path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
      const projectConfig = JSON.parse(await readFile(artifact.projectConfigPath, 'utf8'))
      projectRegistration = registerQaProjectInProfile({
        profilePath: profileLease.profile,
        projectPath: artifact.root,
        sourceProjectPath,
        projectConfig
      })
      launch = await launchTestOwnedDevTools({
        profile: profileLease.profile,
        userDataDir: path.dirname(profileLease.profile),
        controlPort: CONTROL_PORT,
        projectPath: artifact.root,
        appSessionId: id
      })
      // `/open` is still served by the control endpoint.  Use it directly so
      // the evidence records the HTTP response from the installed runtime;
      // the stock CLI's v2 wrapper masks endpoint errors behind exit code 0.
      const open = await requestDevToolsControl({
        action: 'open',
        projectPath: artifact.root,
        controlPort: CONTROL_PORT,
        wsPort: AUTOMATOR_PORT
      })
      if (open.status_code !== 200) {
        const error = new Error(`official DevTools failed to open compiled artifact: ${open.status_code ?? 'unreachable'}`)
        error.code = 'planting_devtools_open_failed'
        error.details = { open, artifact: artifact.root }
        throw error
      }
      const auto = await requestDevToolsControl({
        action: 'auto',
        projectPath: artifact.root,
        controlPort: CONTROL_PORT,
        wsPort: AUTOMATOR_PORT,
        protocol: launch.runtime_kind === 'official_electron' ? 'v2' : 'legacy'
      })
      if (auto.status_code !== 200) {
        const error = new Error(`official DevTools failed to expose Automator: ${auto.status_code ?? 'unreachable'}`)
        error.code = 'planting_devtools_automator_failed'
        error.details = { auto, artifact: artifact.root }
        throw error
      }
      connected = await waitFor(
        async () => {
          try {
            return await Promise.race([
              connectWechatAutomator({ wsEndpoint: `ws://127.0.0.1:${AUTOMATOR_PORT}` }),
              new Promise(resolve => setTimeout(() => resolve(false), 5_000))
            ])
          } catch {
            return false
          }
        },
        AUTOMATOR_TIMEOUT_MS,
        'WeChat Automator endpoint'
      )
      const page = await waitForPage(connected.miniProgram)
      await waitForPage(connected.miniProgram)
      const verification = await verifyPlantingLiveRuntime(connected.miniProgram, {
        projectPath: artifact.root,
        profile: profileLease.profile,
        mainPid: launch.pid,
        controlPort: CONTROL_PORT,
        automatorPort: AUTOMATOR_PORT
      })
      return {
        status: 'ready',
        miniProgram: connected.miniProgram,
        wsEndpoint: `ws://127.0.0.1:${AUTOMATOR_PORT}`,
        runtimeProjectPath: artifact.root,
        runtimeSessionId: id,
        projectRoot: repoRoot,
        runtimeProof: {
          project_identity_verified: verification.ownership.verified === true,
          observed_project_path: verification.ownership.project_path,
          main_devtools_pid: launch.pid,
          automation_listener_pid: verification.ownership.automator_listener_pids[0] || null,
          port_owner_pid: verification.ownership.automator_listener_pids[0] || null,
          automator_port: AUTOMATOR_PORT,
          control_port: CONTROL_PORT,
          control_port_verified: verification.ownership.verified === true
        },
        runtimeHttpClient: createRuntimeHttpClient(connected.miniProgram),
        async health() {
          if (!processAlive(launch?.pid) || listenerPids(AUTOMATOR_PORT).length === 0) {
            return { healthy: false, reason: 'DevTools or Automator listener is no longer alive' }
          }
          try {
            const current = await Promise.race([
              connected.miniProgram.currentPage(),
              new Promise(resolve => setTimeout(() => resolve(null), 2_000))
            ])
            return current?.path
              ? { healthy: true, page: current.path }
              : { healthy: false, reason: 'currentPage did not return a route' }
          } catch (error) {
            return { healthy: false, reason: String(error?.message || error) }
          }
        },
        evidence: [
          { type: 'devtools_launch', value: { ...launch, pid: launch.pid, artifact: artifact.root } },
          { type: 'devtools_open', value: open },
          { type: 'devtools_auto', value: auto },
          { type: 'compiled_artifact_page', value: { path: page.path || null } },
          { type: 'live_runtime_verification', value: verification },
          { type: 'artifact', value: artifact.root },
          { type: 'session_evidence_dir', value: evidenceDir }
        ],
        async stop() {
          if (stopped) {
            return { status: 'already_stopped', session_id: id }
          }
          stopped = true
          await connected?.stop?.().catch(() => {})
          await invokeCli({ home: profileLease.home, args: ['quit', '--port', String(CONTROL_PORT)], outputPath: logPath }).catch(() => {})
          const residue = launch?.pid ? await terminateProcessTree(launch.pid) : []
          const remainingListeners = [
            ...listenerPids(CONTROL_PORT),
            ...listenerPids(AUTOMATOR_PORT),
            ...listenerPids(QA_RUNTIME_SERVICE_PORT)
          ]
          const profileRestore = restoreQaProjectInProfile(projectRegistration)
          releaseLocks(locks)
          await rm(root, { recursive: true, force: true })
          const clean = residue.length === 0 && remainingListeners.length === 0 && !processAlive(launch?.pid)
          if (!clean) {
            const error = new Error('Planting native DevTools session left process or port residue')
            error.code = 'planting_devtools_cleanup_failed'
            error.details = { residue, remainingListeners, pid: launch?.pid || null }
            throw error
          }
          return { status: 'terminated', session_id: id, artifact: artifact.root, profileRestore }
        }
      }
    } catch (error) {
      await connected?.stop?.().catch(() => {})
      if (launch?.pid) {
        await terminateProcessTree(launch.pid)
      }
      const profileRestore = restoreQaProjectInProfile(projectRegistration)
      releaseLocks(locks)
      await copyFile(logPath, path.join(evidenceDir, 'native-devtools.log')).catch(() => {})
      await rm(root, { recursive: true, force: true })
      return {
        status: 'blocked',
        code: error?.code || 'planting_native_devtools_start_failed',
        reason: error?.message || 'Planting native DevTools session failed',
        evidence: [
          { type: 'native_session_failure', value: error?.details || null },
          { type: 'profile_restore', value: profileRestore }
        ]
      }
    }
  }
}
