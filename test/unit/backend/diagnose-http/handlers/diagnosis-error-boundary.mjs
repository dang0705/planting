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
const originalLoad = Module._load

try {
  Module._load = function loadMock(request, parent, isMain) {
    if (request === '/opt/utils/http') {
      return { jsonResponse: () => {}, resolveHttpUserInfo: async () => null }
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
} finally {
  Module._load = originalLoad
  delete require.cache[sourcePath]
}

console.log('diagnosis error boundary: passed')
