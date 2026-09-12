/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const entryPath = '../../../../../cloudfunctions/diagnose-http/app/slim-package-answer-http-entry.js'
const originalLoad = Module._load
const identityCalls = []
const answerCalls = []

delete require.cache[require.resolve(entryPath)]
Module._load = function loadWithPersistentSessionIdentity(request, parent, isMain) {
  if (request === './slim-http-identity' && parent?.filename?.endsWith('slim-package-answer-http-entry.js')) {
    return {
      resolveSlimHttpIdentity: async ({ headers, payload }) => {
        identityCalls.push({ headers, payload })
        return headers['x-planting-platform-session'] === 'test-platform-session'
          ? { openid: 'test_openid', source: 'persistent-platform-session' }
          : null
      }
    }
  }
  if (
    request === './diagnosis-yellow-leaf-answer-fast-handler' &&
    parent?.filename?.endsWith('slim-package-answer-http-entry.js')
  ) {
    return {
      handleYellowLeafAnswer: async ({ payload, identity }) => {
        answerCalls.push({ payload, identity })
        return {
          statusCode: 200,
          body: JSON.stringify({ code: 200, message: '问诊提交成功', data: { accepted: true } })
        }
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  main,
  _test: { isPackageAnswerRequest }
} = require(entryPath)

const fixedYellowLeafPayload = {
  requestMode: 'answer_submit',
  answers: [{ questionKey: 'q_yellow_leaf__air_environment', optionKey: 'air_environment_unknown' }],
  questionPackageContinuationToken: 'continuation',
  questionPackage: { mode: 'yellow_leaf', answerSubmitMode: 'package' }
}

assert.equal(isPackageAnswerRequest(fixedYellowLeafPayload), true)
assert.equal(
  isPackageAnswerRequest({ ...fixedYellowLeafPayload, questionPackage: { mode: 'wilting_droop', answerSubmitMode: 'package' } }),
  false,
  '非黄叶固定题包必须由主问诊接口处理'
)
assert.equal(isPackageAnswerRequest({ ...fixedYellowLeafPayload, requestMode: 'answer_revision' }), false)

const response = await main(
  { body: fixedYellowLeafPayload },
  {
    httpContext: {
      path: '/diagnosis/answer',
      httpMethod: 'POST',
      headers: { 'x-planting-platform-session': 'test-platform-session' }
    }
  }
)

assert.equal(response.statusCode, 200, '题包 answer 必须使用持久平台会话')
assert.equal(JSON.parse(response.body).data.accepted, true)
assert.equal(identityCalls.length, 1)
assert.equal(identityCalls[0].headers.authorization, undefined)
assert.equal(identityCalls[0].headers['x-planting-platform-session'], 'test-platform-session')
assert.equal(answerCalls[0].identity.source, 'persistent-platform-session')

const functionsFrameworkResponse = await main(
  fixedYellowLeafPayload,
  {
    httpContext: {
      path: '/diagnosis/answer',
      httpMethod: 'POST',
      headers: { 'x-planting-platform-session': 'test-platform-session' }
    }
  }
)

assert.equal(
  functionsFrameworkResponse.statusCode,
  200,
  'functions-framework 直接传入 JSON event 时，题包 answer 不能被误判为主问诊请求'
)
assert.equal(identityCalls.length, 2)
assert.equal(answerCalls.length, 2)

console.log('dedicated yellow leaf answer routing: passed')
