import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const readinessPath = require.resolve(
  '../../../../../cloudfunctions/diagnose-http/app/refactor-readiness.js'
)
const originalLoad = Module._load
let freshArtifacts = null
let cachedArtifacts = null
let refreshImplementation = async () => null
let refreshCalls = 0

function readyArtifacts() {
  return { readiness: { ready: true, blockingIssues: [] } }
}

function notReadyArtifacts() {
  return { readiness: { ready: false, blockingIssues: ['missing_tables:diagnosis_sessions'] } }
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function waitForBackgroundRefresh() {
  return new Promise(resolve => setImmediate(resolve))
}

function loadReadiness() {
  delete require.cache[readinessPath]
  return require(readinessPath)
}

Module._load = function loadReadinessWithStubs(request, parent, isMain) {
  if (request === '../services/bootstrap-report') {
    return {
      getCachedRefactorArtifacts: ({ allowExpired = false } = {}) =>
        allowExpired ? cachedArtifacts : freshArtifacts,
      getRefactorArtifacts: async options => {
        refreshCalls += 1
        const artifacts = await refreshImplementation(options)
        cachedArtifacts = artifacts
        freshArtifacts = artifacts
        return artifacts
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

try {
  const coldRefresh = createDeferred()
  freshArtifacts = null
  cachedArtifacts = null
  refreshCalls = 0
  refreshImplementation = async () => coldRefresh.promise
  let readiness = loadReadiness()

  assert.equal(await readiness.ensureDiagnosisStartRefactorReady(), null)
  assert.equal(await readiness.ensureDiagnosisStartRefactorReady(), null)
  await waitForBackgroundRefresh()
  assert.equal(refreshCalls, 1)

  coldRefresh.resolve(notReadyArtifacts())
  await waitForBackgroundRefresh()
  await assert.rejects(
    () => readiness.ensureDiagnosisStartRefactorReady(),
    error => error.statusCode === 503 && /schema 对齐/.test(error.message)
  )

  freshArtifacts = notReadyArtifacts()
  cachedArtifacts = freshArtifacts
  refreshCalls = 0
  refreshImplementation = async () => notReadyArtifacts()
  readiness = loadReadiness()
  await assert.rejects(
    () => readiness.ensureDiagnosisStartRefactorReady(),
    error => error.statusCode === 503 && /missing_tables:diagnosis_sessions/.test(error.message)
  )
  assert.equal(refreshCalls, 0)
  await assert.rejects(
    () => readiness.ensureRefactorReady(),
    error => error.statusCode === 503 && /missing_tables:diagnosis_sessions/.test(error.message)
  )
  assert.equal(refreshCalls, 1)

  const failedRefresh = createDeferred()
  freshArtifacts = null
  cachedArtifacts = null
  refreshCalls = 0
  refreshImplementation = async () => failedRefresh.promise
  readiness = loadReadiness()
  assert.equal(await readiness.ensureDiagnosisStartRefactorReady(), null)
  await waitForBackgroundRefresh()
  assert.equal(refreshCalls, 1)
  failedRefresh.reject(new Error('schema query unavailable'))
  await waitForBackgroundRefresh()
  await assert.rejects(
    () => readiness.ensureDiagnosisStartRefactorReady(),
    error => error.statusCode === 503 && /schema 对齐/.test(error.message)
  )

  freshArtifacts = null
  cachedArtifacts = readyArtifacts()
  refreshCalls = 0
  refreshImplementation = async () => readyArtifacts()
  readiness = loadReadiness()
  assert.equal(await readiness.ensureDiagnosisStartRefactorReady(), cachedArtifacts)
  await waitForBackgroundRefresh()
  assert.equal(refreshCalls, 1)

  console.log('refactor readiness tests passed')
} finally {
  delete require.cache[readinessPath]
  Module._load = originalLoad
}
