import assert from 'node:assert/strict'
import Module from 'node:module'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  stripDiagnosisReviewListPayload,
  settleOptionalReviewSection
} = require('./cloudfunctions/diagnose-http/repositories/diagnosis-review/review-performance.js')

async function testStripDiagnosisReviewListPayload() {
  const payload = stripDiagnosisReviewListPayload({
    diagnosisSessionId: 'diag_1',
    displayName: '示例结果',
    summary: 'ok',
    coreSummary: {
      questionCountSummary: { questionTotal: 1, questionPending: 1 }
    },
    routeDecisionSummary: {
      candidateOutcomeStates: [{ outcomeKey: 'outcome_a' }]
    },
    batchReviewMeta: { sampleLabel: 'batch-a' }
  })

  assert.equal(payload.diagnosisSessionId, 'diag_1')
  assert.equal(payload.displayName, '示例结果')
  assert.equal(payload.batchReviewMeta.sampleLabel, 'batch-a')
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'coreSummary'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'routeDecisionSummary'), false)
}

async function testOptionalSectionDegrades() {
  const degradedSections = []
  const result = await settleOptionalReviewSection({
    scope: 'diagnosis-review detail',
    sectionName: 'visualRawRecords',
    loader: async () => {
      throw new Error('boom')
    },
    conservativeValue: [],
    degradedSections,
    timeoutMs: 50
  })

  assert.equal(Array.isArray(result.value), true)
  assert.equal(result.value.length, 0)
  assert.equal(result.degraded, true)
  assert.deepEqual(degradedSections, ['visualRawRecords'])
}

async function testAnswerHandlerUsesSingleQuestionConservative() {
  const originalLoad = Module._load
  const conservativeCalls = []

  const stubs = new Map([
    ['/opt/utils/http', {
      jsonResponse(statusCode, body) {
        return { statusCode, body }
      }
    }],
    ['../services/session-service', {
      listDiagnosisHistory: async () => [],
      getResultById: async () => null,
      saveDiagnosisFeedback: async () => ({})
    }],
    ['../services/request-guard', {
      resolveRequestPrincipal: async () => ({
        userInfo: { openid: 'openid_test' },
        skipPersistence: false,
        skipAuth: false
      }),
      assertAuthenticatedUser: () => {},
      runWithQuotaGuard: async ({ task }) => task()
    }],
    ['../app/refactor-readiness', {
      ensureRefactorReady: async () => {}
    }],
    ['../app/diagnosis-start-runner', {
      runStartDiagnosis: async () => ({ response: {} })
    }],
    ['../app/diagnosis-answer-runner', {
      runAnswerDiagnosis: async () => ({
        response: {
          questions: [{ questionKey: 'question_a' }]
        }
      })
    }],
    ['../app/request-normalizers', {
      withQuestionTextConservative: async response => {
        conservativeCalls.push(response)
        return response
      }
    }],
    ['../app/frontend-response', {
      buildFrontendDiagnosisResponse: response => response
    }],
    ['../presenters/diagnosis-round-presenter', {
      buildPublicRoundResponse: response => response,
      buildCompactAnswerRoundResponse: response => response
    }]
  ])

  Module._load = function patchedLoad(request, parent, isMain) {
    if (stubs.has(request)) {
      return stubs.get(request)
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const { handleDiagnosisAnswer } = require('./cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js')
    const response = await handleDiagnosisAnswer({}, {}, {})

    assert.equal(response.statusCode, 200)
    assert.equal(conservativeCalls.length, 1)
    assert.equal(response.body.data.questions[0].questionKey, 'question_a')
  } finally {
    Module._load = originalLoad
  }
}

await testStripDiagnosisReviewListPayload()
await testOptionalSectionDegrades()
await testAnswerHandlerUsesSingleQuestionConservative()

console.log('diagnosis-review perf tests passed')
