import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalModuleLoad = Module._load
const payload = {
  symptomClassKey: 'yellowing_mode',
  symptomKey: 'uniform_yellowing',
  userPlantId: '1001',
  clientContext: {
    source: 'question_start_perf'
  }
}

let plantContextCallCount = 0
let priorRepositoryLoadCount = 0
let diagnosisEngineLoadCount = 0
let staticCachePreloaderLoadCount = 0
let persistenceServiceLoadCount = 0
let persistRoundRuntimeCallCount = 0
let persistenceStubMs = 0

Module._load = function loadWithQuestionStartPerfStubs(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return { models: {} }
  }
  if (request === '/opt/utils/plant-knowledge') {
    return {
      getPlantCatalogById: async () => null,
      getUserPlantInstanceById: async () => null
    }
  }
  if (
    request === './static-cache-preloader' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js'
    )
  ) {
    staticCachePreloaderLoadCount += 1
    throw new Error('static question/start should not load static-cache-preloader')
  }
  if (
    request === './repositories/prior-repository' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js'
    )
  ) {
    priorRepositoryLoadCount += 1
    return {
      resolvePlantContext: async () => {
        plantContextCallCount += 1
        throw new Error('static question/start should not resolve plant context')
      }
    }
  }
  if (
    request === './domain/diagnosis-engine' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js'
    )
  ) {
    diagnosisEngineLoadCount += 1
    throw new Error('static question/start should not load diagnosis-engine')
  }
  if (
    request === './services/round-runtime-persistence-service' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js'
    )
  ) {
    persistenceServiceLoadCount += 1
    return {
      persistRoundRuntime: async input => {
        const startedAt = performance.now()
        persistRoundRuntimeCallCount += 1
        assert.equal(input?.response?.metrics?.questionStartPath, 'static_question_package')
        assert.equal(input?.response?.questionPackage?.mode, 'yellow_leaf')
        assert.equal(input?.response?.questions?.length, 4)
        assert.equal(Object.hasOwn(input?.response || {}, 'packageQuestions'), false)
        assert.equal(
          Object.hasOwn(input?.response?.questionPackage || {}, 'packageQuestions'),
          false
        )
        assert.deepEqual(
          Object.keys(input?.response || {}).filter(key => key.toLowerCase().includes('follow')),
          []
        )
        assert.equal(input?.questionPackageSnapshotOnly, true)
        await Promise.resolve()
        persistenceStubMs += performance.now() - startedAt
      }
    }
  }
  return originalModuleLoad.call(this, request, parent, isMain)
}

const loadStart = performance.now()
const {
  runQuestionStartDiagnosis
} = require('../../cloudfunctions/diagnose-http/app/diagnosis-question-start-runner.js')
const {
  buildFrontendDiagnosisResponse
} = require('../../cloudfunctions/diagnose-http/app/frontend-response.js')
const coldLoadMs = performance.now() - loadStart

function assertStaticQuestionStartResult(result) {
  const response = result.response || {}
  assert.equal(response.metrics?.questionStartPath, 'static_question_package')
  assert.equal(response.questionPackage?.mode, 'yellow_leaf')
  assert.equal(response.questions?.length, 4)
  assert.equal(Object.hasOwn(response, 'packageQuestions'), false)
  assert.equal(Object.hasOwn(response.questionPackage || {}, 'packageQuestions'), false)
  assert.deepEqual(
    Object.keys(response).filter(key => key.toLowerCase().includes('follow')),
    []
  )
  assert.deepEqual(
    response.questions.map(item => item.questionKey),
    [
      'q_observed_probe__leaf_yellowing__watering_frequency_context',
      'q_observed_probe__leaf_yellowing__light_change_context',
      'q_observed_probe__leaf_yellowing__fertilization_growth_context',
      'q_observed_probe__leaf_yellowing__airflow_humidity_context'
    ]
  )
  assert.equal(
    response.questions.every(item => item.text && item.options?.length),
    true
  )
  return response
}

function assertMinimalFrontendResponse(response) {
  const frontendResponse = buildFrontendDiagnosisResponse(response)
  assert.equal(frontendResponse.questions.length, 4)
  assert.equal(frontendResponse.questionPackage.mode, 'yellow_leaf')
  assert.deepEqual(
    Object.keys(frontendResponse).filter(key => key.toLowerCase().includes('follow')),
    []
  )
  assert.equal(Object.hasOwn(frontendResponse, 'observedEvidenceSet'), false)
  return frontendResponse
}

async function measureRun(index, options = {}) {
  const persistenceBefore = persistenceStubMs
  const startedAt = performance.now()
  const input = {
    payload,
    openid: 'openid_question_start_perf'
  }
  if (Object.hasOwn(options, 'skipPersistence')) {
    input.skipPersistence = options.skipPersistence
  }
  const result = await runQuestionStartDiagnosis(input)
  const elapsedMs = performance.now() - startedAt
  const persistenceDeltaMs = persistenceStubMs - persistenceBefore
  const response = assertStaticQuestionStartResult(result)
  const frontendResponse = assertMinimalFrontendResponse(response)
  return {
    index,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    staticBuildMs: Number(Math.max(0, elapsedMs - persistenceDeltaMs).toFixed(2)),
    persistenceStubMs: Number(persistenceDeltaMs.toFixed(2)),
    questionCount: response.questions.length,
    responseBytes: Buffer.byteLength(JSON.stringify(response), 'utf8'),
    frontendResponseBytes: Buffer.byteLength(JSON.stringify(frontendResponse), 'utf8')
  }
}

const persistCallsBeforeDefaultRun = persistRoundRuntimeCallCount
const defaultRun = await measureRun('default_persistence_stub')
assert.equal(persistRoundRuntimeCallCount, persistCallsBeforeDefaultRun + 1)
assert.equal(persistenceServiceLoadCount, 1)

const runs = []
for (let index = 0; index < 8; index += 1) {
  runs.push(await measureRun(index, { skipPersistence: true }))
}

assert.equal(plantContextCallCount, 0)
assert.equal(priorRepositoryLoadCount, 0)
assert.equal(diagnosisEngineLoadCount, 0)
assert.equal(staticCachePreloaderLoadCount, 0)

const warmRuns = runs.slice(1)
const maxWarmMs = Math.max(...warmRuns.map(item => item.elapsedMs))
const avgWarmMs = warmRuns.reduce((sum, item) => sum + item.elapsedMs, 0) / warmRuns.length
assert.equal(maxWarmMs <= 500, true)

console.log(
  JSON.stringify(
    {
      status: 'pass',
      coldLoadMs: Number(coldLoadMs.toFixed(2)),
      defaultPath: defaultRun,
      firstRunMs: runs[0].elapsedMs,
      maxWarmMs: Number(maxWarmMs.toFixed(2)),
      avgWarmMs: Number(avgWarmMs.toFixed(2)),
      plantContextCallCount,
      priorRepositoryLoadCount,
      diagnosisEngineLoadCount,
      staticCachePreloaderLoadCount,
      persistenceServiceLoadCount,
      persistRoundRuntimeCallCount,
      questionCount: runs[0].questionCount,
      responseBytes: runs[0].responseBytes,
      frontendResponseBytes: runs[0].frontendResponseBytes
    },
    null,
    2
  )
)

Module._load = originalModuleLoad
