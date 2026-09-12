import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handlerPath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js')
const originalLoad = Module._load
let runnerCalls = 0
let runnerImplementation = null
let strictReadinessCalls = 0
const operationOrder = []

const publicResponse = {
  diagnosisSessionId: 'diag_stream_1',
  routePrimaryAction: 'question_package',
  questionRequired: true
}

Module._load = function loadDiagnosisHandlerWithStubs(request, parent, isMain) {
  if (request === '/opt/utils/http') {
    return {
      jsonResponse: (statusCode, body) => ({ statusCode, body }),
      resolveHttpUserInfo: async () => ({ openid: 'openid_1' })
    }
  }
  if (request === '../presenters/diagnosis-round-presenter') {
    return {
      buildPublicRoundResponse: response => response,
      buildCompactAnswerRoundResponse: response => response
    }
  }
  if (request === '../services/session-service') {
    return {
      listDiagnosisHistory: async () => [],
      getResultById: async () => null,
      saveDiagnosisFeedback: async () => ({})
    }
  }
  if (request === '../services/request-guard') {
    return {
      resolveRequestPrincipal: async () => {
        operationOrder.push('principal')
        return {
          userInfo: { openid: 'openid_1' },
          skipAuth: false,
          skipPersistence: true
        }
      },
      assertAuthenticatedUser: () => operationOrder.push('auth'),
      runWithQuotaGuard: async ({ task }) => {
        operationOrder.push('quota')
        return task()
      }
    }
  }
  if (request === '../app/request-normalizers') {
    return { withQuestionTextConservative: async value => value }
  }
  if (request === '../app/refactor-readiness') {
    return {
      ensureDiagnosisStartRefactorReady: async () => operationOrder.push('readiness-fast'),
      ensureRefactorReady: async () => {
        strictReadinessCalls += 1
        operationOrder.push('readiness-strict')
      }
    }
  }
  if (request === '../app/frontend-response') {
    return {
      buildFrontendDiagnosisResponse: response => response,
      buildFrontendAnswerResponse: response => response
    }
  }
  if (request === '../app/diagnosis-start-runner') {
    return {
      runStartDiagnosis: async options => {
        runnerCalls += 1
        operationOrder.push('runner')
        return runnerImplementation(options)
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

function buildSseContext() {
  const events = []
  const sse = {
    closed: false,
    send(event) {
      events.push(event)
      operationOrder.push(`sse:${event.event}`)
      return true
    },
    end(event) {
      events.push(event)
      this.closed = true
    }
  }
  return {
    events,
    context: {
      sseCalls: 0,
      sse() {
        this.sseCalls += 1
        return sse
      }
    }
  }
}

try {
  delete require.cache[handlerPath]
  const { handleDiagnosisStart } = require(handlerPath)
  const lifecycleEvents = [
    'visual_session_created',
    'visual_input_ready',
    'visual_model_started',
    'visual_model_complete',
    'visual_decision_ready',
    'visual_persisted',
    'visual_extraction_complete'
  ]
  const streamEvents = ['visual_preparing', ...lifecycleEvents]

  runnerImplementation = async ({ onVisualEvent }) => {
    if (onVisualEvent) {
      for (const event of lifecycleEvents) {
        onVisualEvent(event, { phase: event })
      }
    }
    return { response: publicResponse }
  }

  const stream = buildSseContext()
  operationOrder.length = 0
  const streamResult = await handleDiagnosisStart({ headers: {} }, stream.context, {
    streamVisualDecision: true
  })
  assert.equal(streamResult, undefined)
  assert.equal(stream.context.sseCalls, 1)
  assert.deepEqual(operationOrder.slice(0, 6), [
    'sse:visual_preparing',
    'principal',
    'auth',
    'readiness-fast',
    'quota',
    'runner'
  ])
  assert.equal(strictReadinessCalls, 0)
  assert.deepEqual(
    stream.events.map(item => item.event),
    [...streamEvents, 'done']
  )
  assert.deepEqual(stream.events[0], {
    event: 'visual_preparing',
    data: { event: 'visual_preparing' }
  })
  assert.deepEqual(stream.events.at(-1).data.data, publicResponse)
  assert.equal(stream.events.filter(item => ['done', 'error'].includes(item.event)).length, 1)

  const nonStreamCallsBefore = runnerCalls
  const nonStreamResult = await handleDiagnosisStart({ headers: {} }, {}, {})
  assert.equal(runnerCalls, nonStreamCallsBefore + 1)
  assert.deepEqual(nonStreamResult, {
    statusCode: 200,
    body: { code: 200, message: '诊断开始成功', data: publicResponse }
  })

  const callsBeforeUnsupported = runnerCalls
  const unsupported = await handleDiagnosisStart(
    { headers: {} },
    {},
    { streamVisualDecision: true }
  )
  assert.deepEqual(unsupported, {
    statusCode: 501,
    body: {
      code: 501,
      businessCode: 'SSE_UNSUPPORTED',
      message: '当前请求不支持 SSE',
      data: null
    }
  })
  assert.equal(runnerCalls, callsBeforeUnsupported)

  const nullSse = await handleDiagnosisStart(
    { headers: {} },
    { sse: () => null },
    { streamVisualDecision: true }
  )
  assert.equal(nullSse.statusCode, 501)
  assert.equal(runnerCalls, callsBeforeUnsupported)

  const throwingSse = await handleDiagnosisStart(
    { headers: {} },
    {
      sse() {
        throw new Error('unsupported')
      }
    },
    { streamVisualDecision: true }
  )
  assert.equal(throwingSse.statusCode, 501)
  assert.equal(runnerCalls, callsBeforeUnsupported)

  runnerImplementation = async () => {
    const error = new Error('模型暂时不可用')
    error.code = 'MODEL_UNAVAILABLE'
    error.statusCode = 503
    throw error
  }
  const failedStream = buildSseContext()
  const failedResult = await handleDiagnosisStart({ headers: {} }, failedStream.context, {
    streamVisualDecision: true
  })
  assert.equal(failedResult, undefined)
  assert.deepEqual(failedStream.events, [
    { event: 'visual_preparing', data: { event: 'visual_preparing' } },
    {
      event: 'error',
      data: {
        event: 'error',
        code: 503,
        businessCode: 'MODEL_UNAVAILABLE',
        message: '模型暂时不可用',
        data: null
      }
    }
  ])

  console.log('diagnosis handlers tests passed')
} finally {
  delete require.cache[handlerPath]
  Module._load = originalLoad
}
