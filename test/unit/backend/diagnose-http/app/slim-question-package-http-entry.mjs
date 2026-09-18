/* data_mode=unit_fake; test_kind=unit_logic */
/* oxlint-disable no-console */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const entryPath = '../../../../../cloudfunctions/diagnose-http/app/slim-question-package-http-entry.js'
const startEntryPath = '../../../../../cloudfunctions/diagnose-http/app/slim-question-start-http-entry.js'
const originalLoad = Module._load
const identityCalls = []

delete require.cache[require.resolve(entryPath)]
delete require.cache[require.resolve(startEntryPath)]
Module._load = function loadWithPersistentSessionIdentity(request, parent, isMain) {
  if (request === './slim-http-identity' && parent?.filename?.endsWith('slim-question-start-http-entry.js')) {
    return {
      resolveSlimHttpIdentity: async ({ headers, payload }) => {
        identityCalls.push({ headers, payload })
        return headers['x-planting-platform-session'] === 'test-platform-session'
          ? { openid: 'test_openid', source: 'persistent-platform-session' }
          : null
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}
process.env.DIAGNOSIS_CONTINUATION_SECRET = 'test-continuation-secret-0123456789'
const entry = require(entryPath)

assert.equal(
  entry._test.requestPath(
    { path: '/diagnosis/answer' },
    { httpContext: { path: '/diagnosis/question/start?source=package' } }
  ),
  '/diagnosis/question/start?source=package'
)
assert.equal(
  entry._test.isQuestionStartRequest(
    {},
    { httpContext: { rawPath: '/diagnosis/question/start?source=package' } }
  ),
  true
)
assert.equal(entry._test.isQuestionStartRequest({ path: '/diagnosis/answer' }), false)

const startResponse = await entry.main(
  {
    body: {
      symptomClassKey: 'yellowing_mode',
      entrySource: 'diagnose_tab'
    }
  },
  {
    httpContext: {
      path: '/diagnosis/question/start',
      httpMethod: 'POST',
      headers: { 'x-planting-platform-session': 'test-platform-session' }
    }
  }
)
const answerResponse = await entry.main(
  { body: {} },
  { httpContext: { path: '/diagnosis/answer', httpMethod: 'POST' } }
)

assert.equal(startResponse.statusCode, 200, '题包 start 必须使用持久平台会话')
assert.equal(JSON.parse(startResponse.body).data.stage, 'question_package')
assert.equal(identityCalls.length, 1)
assert.equal(identityCalls[0].headers.authorization, undefined)
assert.equal(identityCalls[0].headers['x-planting-platform-session'], 'test-platform-session')
assert.equal(answerResponse.statusCode, 400, '题包 answer 必须继续委派到黄叶答题处理器')

console.log('slim question package HTTP entry tests passed')
