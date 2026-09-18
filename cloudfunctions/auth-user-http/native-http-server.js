'use strict'

const http = require('node:http')
const { URL } = require('node:url')

let fullMain
const readMain = require('./read-http').main
const MAX_BODY_BYTES = 10 * 1024 * 1024

function loadFullMain() {
  if (!fullMain) {
    fullMain = require('./app').main
  }
  return fullMain
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('请求体过大'), { statusCode: 413 }))
        req.destroy()
        return
      }
      chunks.push(buffer)
    })
    req.once('end', () => {
      const rawBody = Buffer.concat(chunks)
      if (!rawBody.length) {
        resolve({ body: {}, rawBody })
        return
      }
      try {
        resolve({ body: JSON.parse(rawBody.toString('utf8')), rawBody })
      } catch {
        reject(Object.assign(new Error('请求体不是有效 JSON'), { statusCode: 400 }))
      }
    })
    req.once('error', reject)
  })
}

function buildEvent(req, url, body) {
  return {
    headers: req.headers,
    httpMethod: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    body
  }
}

function buildContext(req, url) {
  return {
    httpContext: {
      method: req.method,
      path: url.pathname,
      url: req.url || url.pathname,
      headers: req.headers,
      query: Object.fromEntries(url.searchParams.entries())
    }
  }
}

function requestAction(req, url, body) {
  return req.method === 'GET'
    ? String(url.searchParams.get('action') || '')
    : String(body?.action || '')
}

function resolveMain(req, url, body) {
  const path = String(url.pathname || '').replace(/\/+$/u, '') || '/'
  const isOwnUserRead =
    (path === '/auth/user' || path.endsWith('/auth/user')) &&
    ['GET', 'POST'].includes(req.method) &&
    requestAction(req, url, body) === 'getUserByOpenid'
  return isOwnUserRead ? readMain : loadFullMain()
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = Number(statusCode) || 500
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  try {
    const requestBody = await readRequestBody(req)
    const handler = resolveMain(req, url, requestBody.body)
    const result = await handler(buildEvent(req, url, requestBody.body), buildContext(req, url))
    const statusCode = Number(result?.statusCode || 200)
    const headers = result?.headers && typeof result.headers === 'object' ? result.headers : {}
    Object.entries(headers).forEach(([key, value]) => {
      if (value !== undefined && key.toLowerCase() !== 'content-length') {
        res.setHeader(key, value)
      }
    })
    const responseBody =
      result?.body === undefined || result?.body === null ? '' : String(result.body)
    res.statusCode = statusCode
    res.setHeader('Content-Length', Buffer.byteLength(responseBody))
    res.end(responseBody)
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500)
    sendJson(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
      code: statusCode >= 400 && statusCode < 600 ? statusCode : 500,
      message: statusCode === 413 ? '请求体过大' : '请求处理失败',
      data: null
    })
  }
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(() => {
    if (!res.headersSent) {
      sendJson(res, 500, { code: 500, message: '请求处理失败', data: null })
    } else {
      res.destroy()
    }
  })
})

server.keepAliveTimeout = 5_000
server.headersTimeout = 10_000
server.listen(Number(process.env.PORT || 9000), '0.0.0.0')
