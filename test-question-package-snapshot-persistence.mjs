import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load

let legacyQuestionRowWriterCallCount = 0
let legacyQuestionProgressWriterCallCount = 0
let persistedRuntimeResponse = null

Module._load = function patchedLoad(request, parent, isMain) {
  if (
    request === './legacy-round-question-row-adapter' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js'
    )
  ) {
    return {
      shouldWriteLegacyQuestionRows: () => false,
      writeLegacyRoundQuestionRows: async () => {
        legacyQuestionRowWriterCallCount += 1
      }
    }
  }
  if (
    request === './session-service' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js'
    )
  ) {
    return {
      upsertDiagnosisSession: async input => {
        persistedRuntimeResponse = input?.response || null
      },
      replaceObservedEvidenceSet: async () => {},
      replaceObservedSymptoms: async () => {},
      upsertVisualSupervisionRecords: async () => {},
      saveFinalDiagnosisSnapshot: async () => {}
    }
  }
  if (
    request === '../repositories/question-queue-repository' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js'
    )
  ) {
    return {
      replaceQueueForRound: async () => {
        legacyQuestionProgressWriterCallCount += 1
      }
    }
  }
  if (
    request === '../repositories/stop-state-repository' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js'
    )
  ) {
    return { upsertStopState: async () => {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

try {
  const {
    persistRoundRuntime
  } = require('./cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js')
  await persistRoundRuntime({
    sessionId: 'diag_package_snapshot',
    openid: 'openid_package_snapshot',
    plantContext: {},
    response: {
      questions: [{ questionKey: 'package_q_1' }],
      questionPackage: {
        mode: 'yellow_leaf'
      }
    },
    round: 1,
    image: '',
    description: '',
    questionPackageSnapshotOnly: true
  })

  assert.equal(legacyQuestionRowWriterCallCount, 0)
  assert.equal(legacyQuestionProgressWriterCallCount, 0)
  assert.deepEqual(persistedRuntimeResponse?.questionPackageSnapshot?.packageQuestions, [
    { questionKey: 'package_q_1' }
  ])
  assert.equal(persistedRuntimeResponse?.[`question${'Queue'}`], null)
} finally {
  Module._load = originalLoad
}

console.log('question package snapshot persistence tests passed')
