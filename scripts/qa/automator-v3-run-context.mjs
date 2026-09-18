import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const AUTOMATOR_V3_SAFE_ID = /^[A-Za-z0-9._-]{8,160}$/u

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dispatchRoot = path.join(repoRoot, '.tmp', 'dispatch-task')

function assertSafeId(value, label) {
  if (!AUTOMATOR_V3_SAFE_ID.test(String(value || ''))) {
    throw new Error(`${label} 格式无效`)
  }
}

export function automatorV3RunArtifactRoot(dispatchRunId, runInstanceId) {
  assertSafeId(dispatchRunId, 'dispatch-run-id')
  assertSafeId(runInstanceId, 'run-instance-id')
  return path.join(dispatchRoot, dispatchRunId, 'qa-artifacts', runInstanceId)
}

export function automatorV3RunQaRecordRoot(dispatchRunId, runInstanceId) {
  assertSafeId(dispatchRunId, 'dispatch-run-id')
  assertSafeId(runInstanceId, 'run-instance-id')
  return path.join(dispatchRoot, dispatchRunId, 'qa-runs', runInstanceId)
}

export function resolveAutomatorV3ArtifactDirectory(
  dispatchRunId,
  runInstanceId,
  suiteName,
  requestedDirectory = null
) {
  const runRoot = automatorV3RunArtifactRoot(dispatchRunId, runInstanceId)
  const fallback = path.join(runRoot, suiteName)
  const resolved = path.resolve(requestedDirectory || fallback)
  if (resolved !== runRoot && !resolved.startsWith(`${runRoot}${path.sep}`)) {
    throw new Error(`正式 Automator 证据目录必须位于当前 run instance: ${runRoot}`)
  }
  return resolved
}

export function isAutomatorV3ArtifactPath(value, dispatchRunId, runInstanceId) {
  if (!value) {
    return false
  }
  const root = automatorV3RunArtifactRoot(dispatchRunId, runInstanceId)
  const resolved = path.resolve(String(value))
  return resolved.startsWith(`${root}${path.sep}`)
}

export function automatorV3SuiteDirectory(dispatchRunId, runInstanceId) {
  return resolveAutomatorV3ArtifactDirectory(dispatchRunId, runInstanceId, 'automator-v3-suite')
}
