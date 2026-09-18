'use strict'
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { consumeAcpStream } = require('./acp-stream')
const { createSessionService } = require('./session-service')
const {
  createAskResumeToken,
  getAskResumeTokenHash,
  getAgentSessionId,
  getPendingAskTokenHash,
  isAskUserQuestionTool,
  isPendingAskSession,
  markPendingAskSession,
  normalizeAskUserAnswers,
  readAskResumeToken,
  sanitizeAskUserQuestions
} = require('./ask-user')
const COOKIE = 'qhz_agent_session'
const ENDPOINT =
  'https://cloud1-2grufevs395a9d5e.api.tcloudbasegateway.com/v1/aibot/bots/agt-planting-5g93nboeb57c3b92/acp'
const USER_ID_HEADER = 'X-Qinghuazhi-User-Id'
const SAFE_USER_ID = /^[A-Za-z0-9._:-]{1,128}$/u
function localDebugLog(enabled, event, fields = {}) {
  if (!enabled) {
    return
  }
  console.log(`[agent-http] ${event}`, JSON.stringify(fields))
}
function textPreview(value, maxLength = 240) {
  return String(value || '')
    .replace(/\s+/gu, ' ')
    .slice(0, maxLength)
}
function fail(statusCode, message, details = {}) {
  return Object.assign(new Error(message), { statusCode }, details)
}
async function readBody(req) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > 16000) {
      throw fail(413, '消息过长，请缩短后再发送。')
    }
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(raw || '{}')
  } catch {
    throw fail(400, '请重新输入消息。')
  }
}
function createHandler({
  store,
  resolveIdentity,
  hashParent,
  apiKey,
  agentEndpoint = ENDPOINT,
  origin,
  development = false,
  fetchAgent = fetch,
  executeTool,
  agentQuota,
  publicRoot = path.join(__dirname, 'public')
}) {
  const sessions = createSessionService(store)
  function hasAllowedOrigin(req) {
    if (origin && req.headers.origin === origin) {
      return true
    }
    if (!development) {
      return false
    }
    const forwardedHost = String(req.headers['x-forwarded-host'] || '')
      .split(',')[0]
      .trim()
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim()
    return (
      Boolean(forwardedHost) &&
      ['http', 'https'].includes(forwardedProto) &&
      req.headers.origin === `${forwardedProto}://${forwardedHost}`
    )
  }
  function json(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(value))
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const pathname = new URL(req.url, 'http://localhost').pathname.replace(
      /^\/agent-http(?=\/)/,
      ''
    )
    localDebugLog(development, 'request received', {
      method: req.method,
      pathname
    })
    try {
      if (req.method === 'GET' && pathname === '/health') {
        return json(res, 200, { code: 200, data: { status: 'ok' } })
      }
      if (req.method === 'GET' && pathname.startsWith('/agent/')) {
        const relative = decodeURIComponent(pathname.slice('/agent/'.length)) || 'index.html'
        const target = path.resolve(publicRoot, relative)
        if (
          !target.startsWith(path.resolve(publicRoot) + path.sep) ||
          !fs.existsSync(target) ||
          !fs.statSync(target).isFile()
        ) {
          throw fail(404, '页面暂时不可用。')
        }
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png'
        }
        res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream')
        fs.createReadStream(target).pipe(res)
        return
      }
      if (req.method !== 'POST') {
        throw fail(405, '暂不支持此操作。')
      }
      if (pathname === '/ticket') {
        const identity = await resolveIdentity(req.headers)
        if (!identity?.userId) {
          throw fail(401, '请先登录后再使用小青。')
        }
        const ticket = await sessions.issue({
          userId: identity.userId,
          parentHash: hashParent(req.headers)
        })
        return json(res, 200, { code: 0, data: { ticket } })
      }
      if (!hasAllowedOrigin(req)) {
        throw fail(403, '请从小程序重新进入小青。')
      }
      const data = await readBody(req)
      if (pathname === '/session') {
        localDebugLog(development, 'session exchange request', { method: req.method })
        const token = await sessions.exchange(data.ticket)
        res.setHeader(
          'Set-Cookie',
          `${COOKIE}=${token}; HttpOnly; ${development ? '' : 'Secure; '}SameSite=Strict; Path=/; Max-Age=3600`
        )
        return json(res, 200, { ok: true })
      }
      if (pathname !== '/message') {
        throw fail(404, '暂不支持此操作。')
      }
      const token = String(req.headers.cookie || '')
        .split(';')
        .map(x => x.trim())
        .find(x => x.startsWith(`${COOKIE}=`))
        ?.slice(COOKIE.length + 1)
      const row = await sessions.authorize(token)
      const identity =
        typeof store.resolveIdentity === 'function'
          ? await store.resolveIdentity(row)
          : { userId: row.userId }
      if (!identity?.userId) {
        throw fail(401, '登录已失效，请返回小程序重新进入小青。')
      }
      const isObjectBody = data && typeof data === 'object' && !Array.isArray(data)
      const isAskResume =
        isObjectBody && (Object.hasOwn(data, 'resumeToken') || Object.hasOwn(data, 'answers'))
      const text = typeof data.text === 'string' ? data.text.trim() : ''
      localDebugLog(development, 'message request', {
        textLength: text.length,
        textPreview: textPreview(text),
        resumingAsk: isAskResume
      })
      let resumePrompt = null
      if (isAskResume) {
        if (
          !isPendingAskSession(row.agentSessionId) ||
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          Object.keys(data).some(key => !['resumeToken', 'answers'].includes(key))
        ) {
          throw fail(400, '当前提问已失效，请重新发送问题。')
        }
        const pending = readAskResumeToken(data.resumeToken, token)
        const currentSessionId = getAgentSessionId(row.agentSessionId)
        const pendingTokenHash = getPendingAskTokenHash(row.agentSessionId)
        if (
          !pending ||
          pending.sessionId !== currentSessionId ||
          (pendingTokenHash && pendingTokenHash !== getAskResumeTokenHash(data.resumeToken))
        ) {
          throw fail(400, '当前提问已失效，请重新发送问题。')
        }
        resumePrompt = {
          type: 'tool_result',
          tool_use_id: pending.toolUseId,
          content: JSON.stringify(normalizeAskUserAnswers(pending.questions, data)),
          is_error: false
        }
      } else {
        if (isPendingAskSession(row.agentSessionId)) {
          throw fail(409, '请先完成当前选择。')
        }
        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          !text ||
          text.length > 2000 ||
          Object.keys(data).some(key => key !== 'text')
        ) {
          throw fail(400, '请输入两千字以内的问题。')
        }
      }
      if (!apiKey && !development) {
        throw fail(503, '小青暂时无法连接，请稍后再试。')
      }
      const lock = await store.lock(row)
      if (!lock) {
        throw fail(409, '小青正在回复，请稍等。')
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 60000)
      const onClose = () => controller.abort()
      res.on('close', onClose)
      let agentSessionId = ''
      let quota = null
      const retryPendingAsk = isAskResume && isPendingAskSession(row.agentSessionId)
      try {
        if (agentQuota?.reserve) {
          quota = await agentQuota.reserve(identity)
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no'
        })
        let prompt = resumePrompt ? [resumePrompt] : [{ type: 'text', text }]
        let currentSessionId = getAgentSessionId(row.agentSessionId)
        let completed = false
        for (let round = 0; round < 4; round += 1) {
          const upstreamHeaders = {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json'
          }
          if (apiKey) {
            upstreamHeaders.Authorization = `Bearer ${apiKey}`
          }
          const authenticatedUserId = String(row.userId || '').trim()
          if (SAFE_USER_ID.test(authenticatedUserId)) {
            upstreamHeaders[USER_ID_HEADER] = authenticatedUserId
          }
          localDebugLog(development, 'upstream request', {
            round: round + 1,
            endpoint: agentEndpoint,
            hasAuthorization: Boolean(apiKey),
            resumedSession: Boolean(currentSessionId),
            promptTypes: prompt.map(block => block.type)
          })
          const upstream = await fetchAgent(agentEndpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: upstreamHeaders,
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'session/prompt',
              params: {
                ...(currentSessionId ? { sessionId: currentSessionId } : {}),
                prompt
              }
            })
          })
          localDebugLog(development, 'upstream response', {
            round: round + 1,
            statusCode: upstream.status,
            ok: upstream.ok,
            contentType: upstream.headers.get('content-type') || ''
          })
          if (!upstream.ok || !upstream.body) {
            throw fail(502, '小青暂时无法连接，请稍后再试。')
          }
          let answerLength = 0
          let answerPreview = ''
          const result = await consumeAcpStream(
            upstream.body,
            event => {
              const chunkText = typeof event?.text === 'string' ? event.text : ''
              answerLength += chunkText.length
              answerPreview = textPreview(`${answerPreview}${chunkText}`, 500)
              res.write(`data: ${JSON.stringify(event)}\n\n`)
            },
            { streamText: true }
          )
          localDebugLog(development, 'upstream stream complete', {
            round: round + 1,
            stopReason: result.stopReason,
            answerLength,
            answerPreview
          })
          currentSessionId = result.sessionId
          if (result.stopReason === 'end_turn') {
            completed = true
            break
          }
          if (result.stopReason !== 'tool_use' || !result.pendingToolUse) {
            break
          }
          if (isAskUserQuestionTool(result.pendingToolUse)) {
            const questions = sanitizeAskUserQuestions(result.pendingToolUse.input)
            if (!questions) {
              throw fail(502, '提问暂时不可用，请稍后重试。')
            }
            const resumeToken = createAskResumeToken({
              sessionToken: token,
              sessionId: currentSessionId,
              toolUseId: result.pendingToolUse.toolUseId,
              questions
            })
            const pendingSessionId = markPendingAskSession(currentSessionId, resumeToken)
            await store.finish(row, lock, pendingSessionId)
            agentSessionId = pendingSessionId
            if (quota) {
              res.write(`data: ${JSON.stringify({ type: 'quota', data: quota })}\n\n`)
            }
            res.write(`data: ${JSON.stringify({ type: 'ask_user', questions, resumeToken })}\n\n`)
            res.end('data: {"done":true}\n\n')
            localDebugLog(development, 'response paused for user choice', {
              pathname,
              statusCode: 200,
              questionCount: questions.length
            })
            return
          }
          let toolResult
          let toolError = false
          try {
            if (typeof executeTool !== 'function') {
              throw fail(503, '小青的查询能力暂不可用。')
            }
            toolResult = await executeTool(result.pendingToolUse, {
              userId: row.userId,
              identity,
              signal: controller.signal
            })
          } catch (error) {
            toolError = true
            toolResult = {
              ok: false,
              message:
                Number(error?.statusCode || 500) < 500
                  ? String(error.message || '查询条件不完整。')
                  : '查询暂时不可用，请稍后重试。'
            }
          }
          const content = JSON.stringify(toolResult)
          if (Buffer.byteLength(content) > 32768) {
            throw fail(502, '查询结果过长，请换一个更具体的问题。')
          }
          prompt = [
            {
              type: 'tool_result',
              tool_use_id: result.pendingToolUse.toolUseId,
              content,
              is_error: toolError
            }
          ]
        }
        if (!completed) {
          throw fail(502, '回复未完成，请稍后重试。')
        }
        agentSessionId = currentSessionId
        await store.finish(row, lock, agentSessionId)
        if (quota) {
          res.write(`data: ${JSON.stringify({ type: 'quota', data: quota })}\n\n`)
        }
        res.end('data: {"done":true}\n\n')
        localDebugLog(development, 'response finished', {
          pathname,
          statusCode: 200,
          stopReason: 'end_turn',
          sessionUpdated: Boolean(agentSessionId)
        })
      } finally {
        clearTimeout(timer)
        res.off('close', onClose)
        controller.abort()
        // A failed or cancelled turn must not silently resume uncertain model history.
        if (!agentSessionId) {
          await store.finish(row, lock, retryPendingAsk ? row.agentSessionId : '')
        }
      }
    } catch (error) {
      console.error(
        '[agent-http] request failed',
        JSON.stringify({
          pathname,
          statusCode: Number(error?.statusCode || 503),
          message: String(error?.message || 'unknown').slice(0, 240)
        })
      )
      if (res.destroyed || res.writableEnded) {
        return
      }
      const message =
        error.statusCode && error.statusCode < 500 ? error.message : '回复暂时中断，请稍后重试。'
      if (res.headersSent) {
        res.end(`data: ${JSON.stringify({ error: '回复暂时中断，请稍后重试。' })}\n\n`)
      } else {
        json(res, error.statusCode || 503, {
          code: error.code || error.statusCode || 503,
          message,
          ...(error.data ? { data: error.data } : {})
        })
      }
    }
  }
}
module.exports = {
  createHandler,
  start: options =>
    http.createServer(createHandler(options)).listen(Number(process.env.PORT || 9012), '0.0.0.0')
}
