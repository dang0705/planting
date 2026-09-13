import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const routerPath = require.resolve('../../../../../cloudfunctions/diagnose-http/app/http-router.js')
const originalLoad = Module._load

Module._load = function loadRouterDependencies(request, parent, isMain) {
  if (request === '/opt/utils/http') {
    return {
      jsonResponse: (statusCode, body) => ({ statusCode, body }),
      internalServerError: message => ({ statusCode: 500, body: { code: 500, message } }),
      notFound: path => ({ statusCode: 404, body: { code: 404, path } }),
      methodNotAllowed: method => ({ statusCode: 405, body: { code: 405, method } }),
      resolveHttpUserInfo: async () => ({ openid: 'openid_1' }),
      getHttpRequestData: () => ({
        headers: {},
        method: 'GET',
        path: '/visual/out-of-pool/list',
        query: {},
        body: {}
      })
    }
  }
  if (request === '../utils/common') {
    return { debugLog: () => {} }
  }
  if (request === '../handlers/out-of-pool-handlers') {
    return {
      handleOutOfPoolCandidateList: async () => {
        throw Object.assign(new Error('内部审核权限不足'), { statusCode: 403 })
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

try {
  delete require.cache[routerPath]
  const { _test, main } = require(routerPath)

  const expectedMessages = new Map([
    [400, '请求参数无效'],
    [401, '请先登录'],
    [403, '无权访问该接口'],
    [404, '请求资源不存在'],
    [405, '不支持的请求方法']
  ])
  for (const [statusCode, message] of expectedMessages) {
    const response = _test.publicRouteError({
      statusCode,
      message: '内部 SQL、token 和请求头不应透出'
    })
    assert.deepEqual(response, {
      statusCode,
      body: { code: statusCode, message, data: null }
    })
    assert.doesNotMatch(JSON.stringify(response.body), /内部 SQL|token|请求头/u)
  }
  assert.deepEqual(
    _test.publicRouteError({
      statusCode: 503,
      code: 'SOIL_VISUAL_UNAVAILABLE',
      message: '供应商密钥和原始请求不应透出'
    }),
    {
      statusCode: 503,
      body: {
        code: 'SOIL_VISUAL_UNAVAILABLE',
        message: '盆土分析暂时不可用，请稍后重试。',
        data: null
      }
    }
  )
  assert.equal(_test.publicRouteError({ statusCode: 500 }), null)

  const originalConsoleError = console.error
  console.error = () => {}
  let asyncErrorResponse
  try {
    asyncErrorResponse = await main({}, {})
  } finally {
    console.error = originalConsoleError
  }
  assert.deepEqual(asyncErrorResponse, {
    statusCode: 403,
    body: { code: 403, message: '无权访问该接口', data: null }
  })
} finally {
  Module._load = originalLoad
}

console.log('diagnose http-router public error contract passed data_mode=unit_fake')
