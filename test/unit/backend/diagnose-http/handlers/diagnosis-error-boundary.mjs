/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { repoRoot } from '../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const require = createRequire(import.meta.url)
const Module = require('module')
const sourcePath = path.join(
  repoRoot,
  'cloudfunctions/diagnose-http/handlers/diagnosis-handlers.js'
)
const slimRuntimePath = path.join(
  repoRoot,
  'cloudfunctions/diagnose-http/app/slim-diagnosis-http-runtime.js'
)
const originalLoad = Module._load

try {
  Module._load = function loadMock(request, parent, isMain) {
    if (request === '/opt/utils/http') {
      return {
        jsonResponse: (statusCode, body) => ({ statusCode, body }),
        resolveHttpUserInfo: async () => null,
        getHttpRequestData: () => ({ headers: {}, method: 'POST', path: '/', body: {}, query: {} }),
        methodNotAllowed: method => ({ statusCode: 405, body: { code: 405, method } }),
        notFound: requestPath => ({ statusCode: 404, body: { code: 404, path: requestPath } }),
        resolveRequestAppEnv: () => 'development',
        runWithRequestAppEnv: (_appEnv, task) => task()
      }
    }
    if (request === '../presenters/diagnosis-round-presenter') {
      return {
        buildCompactAnswerRoundResponse: value => value,
        buildPublicRoundResponse: value => value
      }
    }
    if (request === '../services/session-service') {
      return {
        getResultById: async () => null,
        listDiagnosisHistory: async () => ({}),
        saveDiagnosisFeedback: async () => ({})
      }
    }
    if (request === '../services/request-guard') {
      return {
        assertAuthenticatedUser: () => {},
        resolveRequestPrincipal: async () => ({}),
        runWithQuotaGuard: async ({ task }) => task()
      }
    }
    if (request === '../app/request-normalizers') {
      return { withQuestionTextConservative: async value => value }
    }
    if (request === '../db/schema-resolver') {
      return { resolveSchemaEnv: () => 'development', runWithSchemaEnv: (_env, task) => task() }
    }
    if (request === '../repositories/diagnosis-review/review-performance') {
      return {
        createReviewTimingLogger: () => ({ mark: () => {}, finish: () => {} })
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  delete require.cache[sourcePath]
  const handlers = require(sourcePath)

  assert.deepEqual(
    handlers._test.buildErrorPayload(
      { statusCode: 500, code: 'ER_BAD_FIELD_ERROR', message: 'Unknown column secret_token' },
      '诊断暂时不可用，请稍后重试'
    ),
    {
      code: 500,
      businessCode: 'INTERNAL_ERROR',
      message: '诊断暂时不可用，请稍后重试',
      data: null
    }
  )
  assert.deepEqual(
    handlers._test.buildErrorPayload(
      { statusCode: 400, code: 'INVALID_IMAGE', message: '请上传清晰的叶片照片' },
      '诊断暂时不可用，请稍后重试'
    ),
    {
      code: 400,
      businessCode: 'INVALID_IMAGE',
      message: '请上传清晰的叶片照片',
      data: null
    }
  )
  assert.deepEqual(
    handlers._test.buildErrorPayload(
      { statusCode: 503, code: 'MODEL_UNAVAILABLE', message: '模型暂时不可用' },
      '诊断暂时不可用，请稍后重试'
    ),
    {
      code: 503,
      businessCode: 'MODEL_UNAVAILABLE',
      message: '模型暂时不可用',
      data: null
    }
  )

  delete require.cache[slimRuntimePath]
  const slimRuntime = require(slimRuntimePath)
  assert.deepEqual(
    slimRuntime._test.buildPublicErrorPayload(
      { statusCode: 400, code: 'INVALID_PAYLOAD', message: '请求参数有误' },
      '诊断暂时不可用，请稍后重试'
    ),
    {
      code: 400,
      businessCode: 'INVALID_PAYLOAD',
      message: '请求参数有误',
      data: null
    }
  )
  assert.deepEqual(
    slimRuntime._test.buildPublicErrorPayload(
      { statusCode: 500, code: 'ER_BAD_FIELD_ERROR', message: '数据库列和令牌不应透出' },
      '诊断暂时不可用，请稍后重试'
    ),
    {
      code: 500,
      businessCode: 'INTERNAL_ERROR',
      message: '诊断暂时不可用，请稍后重试',
      data: null
    }
  )
} finally {
  Module._load = originalLoad
  delete require.cache[sourcePath]
  delete require.cache[slimRuntimePath]
}

console.log('diagnosis error boundary: passed')
