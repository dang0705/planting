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

  assert.deepEqual(_test.publicRouteError({ statusCode: 401, message: '内部错误不应透出' }), {
    statusCode: 401,
    body: { code: 401, message: '请先登录', data: null }
  })
  assert.deepEqual(_test.publicRouteError({ statusCode: 403, message: '内部错误不应透出' }), {
    statusCode: 403,
    body: { code: 403, message: '无权访问该接口', data: null }
  })
  assert.equal(_test.publicRouteError({ statusCode: 500 }), null)

  const asyncErrorResponse = await main({}, {})
  assert.deepEqual(asyncErrorResponse, {
    statusCode: 403,
    body: { code: 403, message: '无权访问该接口', data: null }
  })
} finally {
  Module._load = originalLoad
}

console.log('diagnose http-router public error contract passed data_mode=unit_fake')
