'use strict'

const https = require('https')
const { parseSSEBuffer, parseSSEEvent, sanitizeReplyDelta } = require('./sse')
const { debugLog } = require('./common')

const AGENT_CONFIG = {
  appKey:
    'ZyBCwcYqaAUewBlEkPzYnBqupzWNYTqemUJLNCUjTzjVGEvBRZnWQWedXAyTyczmBFJxytOAdTwbelEglvaKUxmuXwNFJDAYvtYVHGvdxCnmMIazrwwAjdqrjDXEogQh',
  endpoint: 'wss.lke.cloud.tencent.com',
  path: '/v1/qbot/chat/sse'
}

const HTTP_AGENT = new https.Agent({ keepAlive: true, maxSockets: 64 })

function callAgentDiagnose(content, visitorId, { onText } = {}) {
  return new Promise((resolve, reject) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const payload = JSON.stringify({
      session_id: sessionId,
      bot_app_key: AGENT_CONFIG.appKey,
      visitor_biz_id: visitorId,
      content,
      request_id: `req_${Date.now()}`,
      streaming_throttle: 2
    })

    debugLog('智能体请求参数:', { sessionId, visitorId, contentLength: content.length })

    const req = https.request(
      {
        hostname: AGENT_CONFIG.endpoint,
        path: AGENT_CONFIG.path,
        method: 'POST',
        agent: HTTP_AGENT,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      res => {
        let fullResponse = ''
        let buffer = ''
        let finished = false
        const promptText = content

        const handleEventText = eventText => {
          if (!eventText.trim()) return

          const parsedEvent = parseSSEEvent(eventText)
          if (!parsedEvent.data) return

          try {
            const data = JSON.parse(parsedEvent.data)
            const eventType = parsedEvent.event || data.type || ''

            if (eventType === 'reply' && data.payload?.content) {
              const cleanDelta = sanitizeReplyDelta(data.payload.content, promptText, fullResponse)
              if (!cleanDelta) return

              fullResponse += cleanDelta
              onText?.(cleanDelta, fullResponse)
              return
            }

            if (eventType === 'done' || eventType === 'finish') {
              finished = true
              return
            }

            if (eventType === 'error') {
              reject(new Error(data.error?.message || data.message || '智能体返回错误'))
            }
          } catch (error) {
            debugLog('解析智能体 SSE 事件失败:', error.message)
          }
        }

        res.on('data', chunk => {
          buffer += chunk.toString()
          const { completeEvents, rest } = parseSSEBuffer(buffer)
          buffer = rest

          for (const eventText of completeEvents) {
            handleEventText(eventText)
          }
        })

        res.on('end', () => {
          if (buffer.trim()) {
            handleEventText(buffer)
          }

          if (fullResponse || finished) {
            resolve(fullResponse)
            return
          }

          reject(new Error('智能体返回空响应'))
        })

        res.on('error', reject)
      }
    )

    req.on('error', reject)
    req.setTimeout(45000, () => {
      req.destroy()
      reject(new Error('智能体请求超时'))
    })
    req.write(payload)
    req.end()
  })
}

module.exports = {
  callAgentDiagnose
}

