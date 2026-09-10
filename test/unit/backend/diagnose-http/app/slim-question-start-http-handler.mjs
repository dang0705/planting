/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('module')
const handlerPath = require.resolve(
  '../../../../../cloudfunctions/diagnose-http/app/slim-question-start-http-handler.js'
)
const originalLoad = Module._load

Module._load = function loadSlimQuestionStartHandler(request, parent, isMain) {
  if (request === '/opt/utils/http') {
    return { jsonResponse: () => ({}) }
  }
  if (request === '../services/request-guard') {
    return { assertAuthenticatedUser: () => {}, runWithQuotaGuard: async ({ task }) => task() }
  }
  if (request === './diagnosis-question-start-runner') {
    return {
      runQuestionStartDiagnosis: async () => ({ response: {} }),
      resolveManualSymptomMode: payload => ({
        modeKey: payload?.symptomClassKey === 'yellowing_mode' ? 'yellow_leaf' : 'other'
      })
    }
  }
  if (request === './request-normalizers') {
    return { withQuestionTextConservative: async value => value }
  }
  if (request === '../presenters/diagnosis-round-presenter') {
    return { buildPublicRoundResponse: value => value }
  }
  if (request === './frontend-response') {
    return { buildFrontendDiagnosisResponse: value => value }
  }
  return originalLoad.call(this, request, parent, isMain)
}

try {
  delete require.cache[handlerPath]
  const { _test } = require(handlerPath)
  assert.equal(_test.shouldCheckQuestionStartQuota({ symptomClassKey: 'yellowing_mode' }), false)
  assert.equal(_test.shouldCheckQuestionStartQuota({ symptomClassKey: 'other_mode' }), true)
  assert.equal(_test.shouldCheckQuestionStartQuota({}), true)
} finally {
  Module._load = originalLoad
  delete require.cache[handlerPath]
}

console.log('slim question start quota policy: passed')
