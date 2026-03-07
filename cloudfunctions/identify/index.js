'use strict'

const https = require('https')
const { getUserInfo } = require('/opt/utils/cloudbase')
const { createLLMRequestOptions } = require('/opt/utils/llm-request')
const { getPrompt } = require('./identify-prompt')
const {
  llm: { host, model, service }
} = require('/opt/configs')

const SECRET_ID = process.env.CLOUDBASE_SECRET_ID
const SECRET_KEY = process.env.CLOUDBASE_SECRET_KEY

exports.main = async (event, context) => {
  try {
    const { image, messages } = event
    const userInfo = getUserInfo(context)
    const visitorId = userInfo.OPENID || 'anonymous'

    if (!messages || !Array.isArray(messages)) {
      return { code: 400, message: '识别请求需要提供 messages', data: null }
    }

    console.log('植物识别请求:', { hasImage: !!image, visitorId })

    appendPromptToMessages(messages, getPrompt())

    const aiResponse = await callHunyuanVision(messages)
    const result = parseIdentifyResult(aiResponse)

    return {
      code: 200,
      message: '成功',
      data: { fullText: aiResponse, result, action: 'identify' }
    }
  } catch (error) {
    console.error('植物识别请求失败:', error)
    return {
      code: 500,
      message: `请求失败: ${error.message}`,
      data: null
    }
  }
}

async function callHunyuanVision(messages) {
  const payload = {
    Model: model,
    Messages: messages,
    Stream: false
  }
  const body = JSON.stringify(payload)
  const options = createLLMRequestOptions({
    body,
    host,
    service,
    secretId: SECRET_ID,
    secretKey: SECRET_KEY
  })

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.Response?.Error) {
            reject(new Error(result.Response.Error.Message))
          } else {
            const content = result.Response?.Choices?.[0]?.Message?.Content || ''
            resolve(content)
          }
        } catch (error) {
          reject(new Error('解析响应失败'))
        }
      })
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function appendPromptToMessages(messages, promptText) {
  if (messages[0] && Array.isArray(messages[0].Contents)) {
    messages[0].Contents.push({ Type: 'text', Text: promptText })
  }
}

function parseIdentifyResult(text) {
  const cleanText = (text || '').trim().replace(/[。，！？\s]+$/, '')

  return {
    name: cleanText || '未知植物'
  }
}
