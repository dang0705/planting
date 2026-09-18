/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  getHttpRequestData,
  internalServerError,
  parseEventBody
} = require('../../../../../cloudfunctions/layer/utils/http.js')

assert.deepEqual(parseEventBody('null'), {})
assert.deepEqual(parseEventBody({ body: '[]' }), {})
assert.deepEqual(parseEventBody({ body: '"text"' }), {})

const request = getHttpRequestData(
  {
    body: '{"from":"event"}',
    query: {
      page: '3',
      cursor: 'event=cursor',
      _method: 'PATCH'
    }
  },
  {
    httpContext: {
      headers: {},
      method: 'POST',
      path: '/user-plants?keyword=%E8%8A%B1&cursor=path%3Dcursor&broken=%E0%A4%A',
      query: { page: '2' }
    }
  }
)

assert.equal(request.method, 'PATCH')
assert.deepEqual(request.body, { from: 'event' })
assert.equal(request.query.page, '3')
assert.equal(request.query.cursor, 'event=cursor')
assert.equal(request.query.keyword, '花')
assert.equal(request.query.broken, '%E0%A4%A')
assert.doesNotThrow(() => getHttpRequestData({ body: '{}' }))

const frameworkPostRequest = getHttpRequestData(
  { body: '{}' },
  {
    httpContext: {
      headers: {},
      // functions-framework 的 HTTP 上下文使用 httpMethod，而不是 method。
      httpMethod: 'POST',
      path: '/diagnosis/start'
    }
  }
)
assert.equal(
  frameworkPostRequest.method,
  'POST',
  'functions-framework 的空 JSON POST 不得因缺少 httpContext.method 被误判为 GET'
)

const mergedHeadersRequest = getHttpRequestData(
  {
    headers: { 'x-planting-http-identity-ticket': 'event-ticket' },
    body: '{}'
  },
  {
    httpContext: {
      headers: { 'x-cloudbase-context': 'framework-header' },
      method: 'POST',
      path: '/diagnosis/question/start'
    }
  }
)
assert.equal(
  mergedHeadersRequest.headers['x-planting-http-identity-ticket'],
  'event-ticket',
  'event application headers must survive when CloudBase context also provides headers'
)
assert.equal(mergedHeadersRequest.headers['x-cloudbase-context'], 'framework-header')

const response = internalServerError('安全提示')
assert.equal(response.statusCode, 500)
assert.deepEqual(JSON.parse(response.body), {
  code: 500,
  message: '安全提示',
  data: null
})
assert.equal(response.headers['Content-Type'], 'application/json; charset=utf-8')

console.log('http request-data resilience: passed')
