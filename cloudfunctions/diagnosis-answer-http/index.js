'use strict'

const http = require('node:http')
const { URL } = require('node:url')
const processStartedAt = Date.now()
const { main } = require('./app')
const appLoadMs = Date.now() - processStartedAt
const performanceLogEnabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.DIAGNOSIS_PERF_LOG || '').trim().toLowerCase())
let hasServedRequest = false

if (performanceLogEnabled) {
  console.log(JSON.stringify({ event: 'diagnosis_http_process_ready', functionName: 'diagnosis-answer-http', appLoadMs }))
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function writeResponse(response, result) {
  const statusCode = Number(result?.statusCode || 200)
  const headers = normalizeResponseHeaders(result?.headers)
  const body = typeof result?.body === 'string' ? result.body : JSON.stringify(result?.body ?? result)
  scheduleAfterResponse(response, result?.afterResponse)
  response.writeHead(statusCode, headers)
  response.end(body)
}

function scheduleAfterResponse(response, task) {
  if (typeof task !== 'function') return
  let started = false
  const run = () => {
    if (started) return
    started = true
    const schedule = typeof setImmediate === 'function' ? setImmediate : queueMicrotask
    schedule(() => {
      Promise.resolve()
        .then(task)
        .catch(error => console.error('diagnosis-answer-http after-response task failed:', {
          message: String(error?.message || error)
        }))
    })
  }
  response.once('finish', run)
  response.once('close', run)
}

function normalizeResponseHeaders(rawHeaders) {
  const headers = rawHeaders && typeof rawHeaders === 'object' ? { ...rawHeaders } : {}
  const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type')
  const contentType = String(contentTypeKey ? headers[contentTypeKey] : '').trim()
  const cacheControlKey = Object.keys(headers).find(key => key.toLowerCase() === 'cache-control')
  if (!contentTypeKey) {
    headers['Content-Type'] = 'application/json; charset=utf-8'
  } else if (/^application\/json\b/i.test(contentType) && !/charset=/i.test(contentType)) {
    headers[contentTypeKey] = `${contentType}; charset=utf-8`
  }
  if (!cacheControlKey) {
    headers['Cache-Control'] = 'no-store, no-transform'
  }
  return headers
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    const rawBody = await readRequestBody(request)
    const event = {
      httpMethod: request.method,
      path: `${url.pathname}${url.search}`,
      headers: request.headers,
      query: Object.fromEntries(url.searchParams.entries()),
      body: rawBody
    }
    const firstRequest = !hasServedRequest
    hasServedRequest = true
    const handlerStartedAt = Date.now()
    const result = await main(event, {})
    if (performanceLogEnabled) {
      console.log(JSON.stringify({
        event: 'diagnosis_http_request_timing',
        functionName: 'diagnosis-answer-http',
        firstRequest,
        processAgeMs: Date.now() - processStartedAt,
        handlerMs: Date.now() - handlerStartedAt
      }))
    }
    writeResponse(response, result)
  } catch (error) {
  writeResponse(response, {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-transform'
      },
      body: JSON.stringify({ code: 500, message: '服务暂时不可用，请稍后重试', data: null })
    })
    console.error('diagnosis-answer-http native server error:', error)
  }
})

server.listen(Number(process.env.PORT || 9000), '0.0.0.0')
