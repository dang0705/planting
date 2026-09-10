import path from 'node:path'
import { validateArtifact, snapshotArtifact } from './artifact.mjs'
import { cleanupFixtures, prepareFixtures } from './fixture.mjs'
import { loadLeaf, readSuite } from './suite.mjs'
import { errorEvidence, writeReport } from '../reporting/report.mjs'

/**
 * @typedef {object} LeafContext
 * @property {object} artifact
 * @property {object} adapter
 * @property {object} session
 * @property {object|null} runtimeHttpClient
 * @property {string} evidenceDir
 * @property {'live_real'|'fixture_diagnostic'} dataMode
 */

/**
 * @param {{artifactPath:string, suitePath:string, adapter:object, evidenceDir:string, leafId?:string, dataMode?:'live_real'|'fixture_diagnostic'|'all', options?:object}} input
 */
export async function runSuite(input) {
  const requestedDataMode = input.dataMode || 'live_real'
  const startedAt = new Date().toISOString()
  const report = {
    reportVersion: 1,
    startedAt,
    completedAt: null,
    outcome: 'aborted',
    infrastructureStatus: 'not_run',
    fixtureStatus: 'not_required',
    businessStatus: 'not_run',
    failureKind: 'none',
    artifact: null,
    suite: null,
    leaves: [],
    evidence: [],
    failures: []
  }
  let session = null
  let artifactProvisioning = null
  let profileLease = null
  let infrastructureAttempted = false
  try {
    artifactProvisioning = input.adapter.artifactProvider?.prepare
      ? await input.adapter.artifactProvider.prepare({
          artifactPath: input.artifactPath,
          evidenceDir: input.evidenceDir,
          options: input.options || {}
        })
      : { artifactPath: input.artifactPath }
    const effectiveArtifactPath = artifactProvisioning?.artifactPath || input.artifactPath
    const artifact = await validateArtifact(effectiveArtifactPath)
    const snapshot = await snapshotArtifact(effectiveArtifactPath)
    const suite = await readSuite(input.suitePath)
    const candidates = input.leafId
      ? suite.manifest.leaves.filter(entry => entry.id === input.leafId)
      : suite.manifest.leaves
    if (!candidates.length) {throw contractError(`leaf not found: ${input.leafId}`)}
    const loaded = []
    for (const entry of candidates) {
      const leaf = await loadLeaf(suite, entry)
      if (requestedDataMode !== 'all' && leaf.metadata.dataMode !== requestedDataMode) {continue}
      loaded.push({ entry, leaf })
    }
    if (!loaded.length) {
      throw contractError(`no suite leaves match data mode: ${requestedDataMode}`)
    }
    report.artifact = {
      root: artifact.root,
      snapshot: {
        fileCount: snapshot.fileCount,
        sha256: snapshot.sha256,
        contract: snapshot.contract
      }
    }
    report.suite = {
      id: suite.manifest.id,
      path: suite.file,
      requestedDataMode,
      selectedLeaves: loaded.map(item => item.entry.id)
    }
    if (artifact.contract.adapter.id !== input.adapter.id || artifact.contract.adapter.apiVersion !== input.adapter.apiVersion) {
      throw contractError('artifact sidecar adapter identity does not match explicit adapter')
    }
    if (input.adapter.devToolsProfileProvider?.acquire) {
      infrastructureAttempted = true
      profileLease = await input.adapter.devToolsProfileProvider.acquire({
        artifact,
        evidenceDir: input.evidenceDir,
        options: input.options || {}
      })
      if (profileLease?.status !== 'ready') {
        const error = new Error(profileLease?.reason || 'DevTools profile provider did not become ready')
        error.code = profileLease?.code || 'mp_e2e_profile_not_ready'
        error.details = profileLease
        throw error
      }
      report.evidence.push(...(profileLease.evidence || []))
    }
    const startApplicationSession = async () => {
      infrastructureAttempted = true
      const next = await input.adapter.applicationSessionProvider.start({
        artifact,
        artifactSnapshot: snapshot,
        evidenceDir: input.evidenceDir,
        dataMode: requestedDataMode,
        portPolicy: input.adapter.portPolicy || null,
        profileLease,
        options: input.options || {}
      })
      if (next?.status !== 'ready') {
        const error = new Error(next?.reason || 'application session did not become ready')
        error.code = next?.code || 'mp_e2e_application_session_not_ready'
        error.details = next
        throw error
      }
      return next
    }
    session = await startApplicationSession()
    report.infrastructureStatus = 'passed'
    report.evidence.push(...(session.evidence || []))
    for (const [leafIndex, { entry, leaf }] of loaded.entries()) {
      // A diagnostic fixture or a product exception can crash the AppService
      // without throwing from the Node leaf process. Keep the suite moving by
      // proving the current session before each subsequent leaf and rebuilding
      // only the test-owned session when it has actually disappeared.
      if (leafIndex > 0 && typeof session?.health === 'function') {
        const health = await session.health()
        if (!health?.healthy) {
          const previousSessionId = session.runtimeSessionId || null
          try {
            const stop = await session.stop?.()
            report.evidence.push({ type: 'session_recovery_stop', value: { previousSessionId, health, stop } })
            session = await startApplicationSession()
            report.evidence.push({
              type: 'session_recovery_start',
              value: { previousSessionId, nextSessionId: session.runtimeSessionId || null, health }
            })
          } catch (error) {
            report.infrastructureStatus = 'failed'
            report.failureKind = 'infrastructure'
            const evidence = errorEvidence(error)
            report.failures.push({
              leaf: entry.id,
              error: {
                ...evidence,
                code: 'mp_e2e_session_recovery_failed',
                message: `${evidence.message}; previous session health: ${health?.reason || 'unknown'}`
              }
            })
            report.leaves.push({
              id: entry.id,
              dataMode: leaf.metadata.dataMode,
              status: 'not_run',
              fixtures: { prepare: { status: 'not_run' }, cleanup: { status: 'not_run' } }
            })
            continue
          }
        }
      }
      const leafDataMode = leaf.metadata.dataMode
      const leafEvidenceDir = path.join(input.evidenceDir, 'leaves', entry.id)
      const context = {
        artifact,
        adapter: input.adapter,
        session,
        runtimeHttpClient: session.runtimeHttpClient || null,
        evidenceDir: leafEvidenceDir,
        dataMode: leafDataMode
      }
      const fixtureRun = await prepareFixtures({
        fixtures: input.adapter.fixtures,
        names: entry.fixtures || [],
        context,
        dataMode: leafDataMode
      })
      if (fixtureRun.status !== 'ready') {
        report.fixtureStatus = 'blocked'
        report.failureKind = 'fixture'
        report.failures.push(fixtureRun.failure)
        report.leaves.push({ id: entry.id, dataMode: leafDataMode, status: 'not_run', fixtures: fixtureRun })
        const cleanup = await cleanupFixtures({ prepared: fixtureRun.prepared, context, dataMode: leafDataMode })
        if (cleanup.status !== 'ready') {
          report.fixtureStatus = 'cleanup_failed'
          report.failures.push(cleanup.failure)
        }
        continue
      }
      report.fixtureStatus = entry.fixtures?.length ? 'ready' : report.fixtureStatus
      let leafResult
      let businessFailure = null
      try {
        leafResult = await leaf.run(context)
        if (leafResult?.status !== 'passed') {
          const error = new Error(`leaf did not pass: ${entry.id}`)
          error.code = leafResult?.code || 'mp_e2e_leaf_failed'
          error.details = leafResult
          throw error
        }
      } catch (error) {
        businessFailure = errorEvidence(error)
      }
      const cleanup = await cleanupFixtures({ prepared: fixtureRun.prepared, context, dataMode: leafDataMode })
      if (cleanup.status !== 'ready') {
        report.fixtureStatus = 'cleanup_failed'
        report.failureKind = 'fixture'
        report.failures.push(cleanup.failure)
      }
      report.leaves.push({
        id: entry.id,
        dataMode: leafDataMode,
        status: businessFailure ? 'failed' : 'passed',
        result: leafResult || null,
        fixtures: { prepare: fixtureRun, cleanup }
      })
      if (businessFailure) {
        report.businessStatus = 'failed'
        const leafFailureKind = classifyLeafFailure(businessFailure)
        if (leafFailureKind === 'fixture') {
          report.fixtureStatus = report.fixtureStatus === 'cleanup_failed' ? report.fixtureStatus : 'blocked'
        }
        if (report.failureKind === 'none' || leafFailureKind === 'fixture') {report.failureKind = leafFailureKind}
        report.failures.push({ leaf: entry.id, error: businessFailure })
      }
    }
    if (
      report.infrastructureStatus === 'passed' &&
      report.businessStatus !== 'failed' &&
      report.leaves.length > 0 &&
      report.leaves.every(leaf => leaf.status === 'passed')
    ) {
      report.businessStatus = 'passed'
    }
    report.outcome = report.infrastructureStatus === 'passed' && report.businessStatus === 'passed' && !report.failures.length ? 'passed' : 'failed'
  } catch (error) {
    report.outcome = 'failed'
    report.failureKind = error?.code === 'mp_e2e_contract_invalid'
      ? 'contract'
      : String(error?.code || '').startsWith('mp_e2e_script_')
        ? 'script'
        : 'infrastructure'
    if (report.failureKind === 'infrastructure' && infrastructureAttempted) {
      report.infrastructureStatus = 'failed'
    }
    report.failures.push(errorEvidence(error))
  } finally {
    if (session?.stop) {
      try {
        const stop = await session.stop()
        report.evidence.push({ type: 'session_stop', value: stop })
      } catch (error) {
        report.outcome = 'failed'
        report.infrastructureStatus = 'failed'
        report.failureKind = 'infrastructure'
        report.failures.push(errorEvidence(error))
      }
    }
    if (profileLease?.release) {
      try {
        const released = await profileLease.release()
        report.evidence.push({ type: 'profile_release', value: released })
      } catch (error) {
        report.outcome = 'failed'
        report.infrastructureStatus = 'failed'
        report.failureKind = 'infrastructure'
        report.failures.push(errorEvidence(error))
      }
    }
    if (artifactProvisioning?.cleanup) {
      try {
        const cleanup = await artifactProvisioning.cleanup()
        report.evidence.push({ type: 'artifact_cleanup', value: cleanup })
      } catch (error) {
        report.outcome = 'failed'
        report.infrastructureStatus = 'failed'
        report.failureKind = 'infrastructure'
        report.failures.push(errorEvidence(error))
      }
    }
    report.completedAt = new Date().toISOString()
  }
  report.reportPath = await writeReport(input.evidenceDir, report)
  return report
}

function classifyLeafFailure(failure) {
  const code = String(failure?.code || '')
  if (code === 'mp_e2e_contract_invalid') {return 'contract'}
  if (code.startsWith('mp_e2e_fixture_') || code.startsWith('fixture_')) {return 'fixture'}
  if (code.startsWith('mp_e2e_script_') || code.startsWith('script_')) {return 'script'}
  return 'product'
}

function contractError(message) {
  const error = new Error(message)
  error.code = 'mp_e2e_contract_invalid'
  return error
}
