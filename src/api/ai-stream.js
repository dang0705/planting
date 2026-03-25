import { useUserStore } from '@/store/user'
import { getCloudbaseAccessToken, getCloudbaseUserIdentity } from '@/utils/cloudbase-auth'
import { BASE_URL } from '@/api/env'
import { requestHttpFunction } from '@/api/http'

function guessMimeType(path = '') {
  const lower = String(path || '')
    .trim()
    .toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.heic')) return 'image/heic'
  return 'image/jpeg'
}

function isTempRuntimeImagePath(path = '') {
  const value = String(path || '')
    .trim()
    .toLowerCase()
  return (
    value.startsWith('http://tmp/') ||
    value.startsWith('https://tmp/') ||
    value.startsWith('wxfile://') ||
    value.startsWith('wdfile://') ||
    value.startsWith('file://') ||
    value.startsWith('/tmp/') ||
    value.startsWith('tmp/')
  )
}

function arrayBufferToBase64(arrayBuffer) {
  if (typeof wx !== 'undefined' && typeof wx.arrayBufferToBase64 === 'function') {
    return wx.arrayBufferToBase64(arrayBuffer)
  }

  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  if (typeof btoa === 'function') {
    return btoa(binary)
  }
  throw new Error('当前环境不支持 arrayBufferToBase64')
}

function fetchImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      success: res => {
        if (res.statusCode < 200 || res.statusCode >= 300 || !res.data) {
          reject(new Error(`图片下载失败 (${res.statusCode})`))
          return
        }

        const contentType = String(
          res.header?.['content-type'] || res.header?.['Content-Type'] || guessMimeType(url)
        )
        const base64 = arrayBufferToBase64(res.data)
        if (!base64) {
          reject(new Error('图片转 base64 失败'))
          return
        }
        resolve(`data:${contentType};base64,${base64}`)
      },
      fail: reject
    })
  })
}

function assertDiagnoseImageDataUrl(image) {
  const value = String(image || '').trim()
  if (!value.startsWith('data:image/')) {
    throw new Error(`诊断图片未成功转换为 base64，当前前缀: ${value.slice(0, 32) || '<empty>'}`)
  }
}

export function convertImageToDataUrl(filePath) {
  const path = String(filePath || '').trim()
  if (!path) {
    return Promise.reject(new Error('缺少图片路径'))
  }
  if (path.startsWith('data:image/')) {
    return Promise.resolve(path)
  }

  return new Promise((resolve, reject) => {
    try {
      const fs = wx.getFileSystemManager()
      fs.readFile({
        filePath: path,
        encoding: 'base64',
        success: res => {
          const base64 = String(res.data || '').trim()
          if (!base64) {
            reject(new Error('图片转 base64 失败'))
            return
          }
          resolve(`data:${guessMimeType(path)};base64,${base64}`)
        },
        fail: async error => {
          try {
            if (/^https?:\/\//i.test(path) || isTempRuntimeImagePath(path)) {
              const dataUrl = await fetchImageAsDataUrl(path)
              resolve(dataUrl)
              return
            }
            reject(error)
          } catch (fetchError) {
            reject(fetchError)
          }
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}

function decodeChunkText(chunk, decoder) {
  if (!chunk) return ''
  if (typeof chunk === 'string') return chunk
  if (!(chunk instanceof ArrayBuffer) && !ArrayBuffer.isView(chunk)) return ''

  const source =
    chunk instanceof ArrayBuffer
      ? new Uint8Array(chunk)
      : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)

  if (decoder) {
    return decoder.decode(source, { stream: true })
  }

  const binary = Array.from(source, byte => String.fromCharCode(byte)).join('')
  try {
    return decodeURIComponent(escape(binary))
  } catch {
    return binary
  }
}

function parseJsonPayload(payload, decoder) {
  if (
    payload &&
    typeof payload === 'object' &&
    !(payload instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(payload)
  ) {
    return payload
  }

  const text = decodeChunkText(payload, decoder)
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseSSEBuffer(buffer) {
  const normalized = String(buffer || '').replace(/\r\n/g, '\n')
  const events = normalized.split('\n\n')

  return {
    completeEvents: events.slice(0, -1),
    rest: events[events.length - 1] || ''
  }
}

function parseSSEEvent(eventText) {
  const dataLines = []
  let eventName = ''
  let eventId = ''

  for (const rawLine of String(eventText || '').split('\n')) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':')) continue

    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      continue
    }

    if (line.startsWith('id:')) {
      eventId = line.slice(3).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  return {
    event: eventName,
    id: eventId,
    data: dataLines.join('\n')
  }
}

function getStoredUserOpenId() {
  try {
    const rawUser = uni.getStorageSync('user')
    const user =
      typeof rawUser === 'string'
        ? (() => {
            try {
              return JSON.parse(rawUser)
            } catch {
              return {}
            }
          })()
        : rawUser || {}
    return user.openid || user.wechat_openid || ''
  } catch {
    return ''
  }
}

async function resolveDiagnoseAuth(openid, skipAuth) {
  const userStore = useUserStore()
  let token = ''
  let resolvedOpenid = openid || userStore.openid || getStoredUserOpenId()

  if (!skipAuth) {
    token = await getCloudbaseAccessToken()

    if (!resolvedOpenid) {
      try {
        const identity = await getCloudbaseUserIdentity()
        resolvedOpenid = identity?.openid || ''
      } catch (error) {
        console.warn('获取 CloudBase 用户 openid 失败:', error)
      }
    }

    try {
      userStore.token = token
    } catch (error) {
      console.warn('同步 token 到 Pinia 失败:', error)
    }
  }

  return { token, resolvedOpenid }
}

function buildDiagnosePayload({ mode = 'quick', plantId, image, description, plantName, skipAuth = false }) {
  return {
    mode,
    plantId,
    skipAuth,
    ...(image ? { image } : {}),
    ...(description ? { description } : {}),
    ...(plantName ? { plantName } : {})
  }
}

function normalizeDiagnoseResult(result) {
  if (!result) {
    throw new Error('诊断响应为空')
  }
  if (result.code !== 200) {
    throw new Error(result.message || '诊断请求失败')
  }

  const responseData = result.data || {}
  const diagnosis = {
    ...responseData.diagnosis,
    diagnosisId:
      responseData.recordId ||
      responseData.diagnosisId ||
      responseData.diagnosis?.diagnosisId ||
      '',
    problemCausality:
      responseData.problemCausality || responseData.diagnosis?.problemCausality || []
  }
  const fullText = diagnosis.summary || diagnosis.symptoms || '诊断完成'

  return {
    recordId: responseData.recordId || '',
    plantId: responseData.plantId || '',
    diagnosis,
    fullText,
    timestamp: responseData.timestamp || Date.now(),
    status: 'completed'
  }
}

function runSuccessCallbacks(normalizedResult, { onText, onFinish } = {}) {
  onText?.(normalizedResult.fullText, normalizedResult.fullText)
  onFinish?.(normalizedResult.diagnosis, normalizedResult.fullText)
}

function runErrorCallback(error, { onError } = {}) {
  onError?.(error)
  throw error
}

function validateDiagnoseInput({ plantId, image }) {
  if (!plantId) {
    throw new Error('缺少植物ID，无法进行诊断')
  }
  if (image) {
    assertDiagnoseImageDataUrl(image)
  }
}

async function sendSyncDiagnoseRequest(payload) {
  return requestHttpFunction('diagnose-http/diagnose', {
    method: 'POST',
    body: payload
  })
}

async function syncDiagnosePlant({
  mode = 'quick',
  image,
  description,
  plantName,
  plantId,
  openid,
  skipAuth = false,
  onText,
  onFinish,
  onError
}) {
  try {
    onText?.('思考中...', '思考中...')
    validateDiagnoseInput({ plantId, image })
    await resolveDiagnoseAuth(openid, skipAuth)

    const payload = buildDiagnosePayload({
      mode,
      plantId,
      image,
      description,
      plantName,
      skipAuth
    })
    const result = await sendSyncDiagnoseRequest(payload)
    const normalizedResult = normalizeDiagnoseResult(result)

    runSuccessCallbacks(normalizedResult, { onText, onFinish })
    return normalizedResult
  } catch (error) {
    console.error('同步诊断失败:', error)
    return runErrorCallback(error, { onError })
  }
}

function createSSERequest({
  url,
  headers,
  payload,
  onText
}) {
  return new Promise((resolve, reject) => {
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null
    let buffer = ''
    let finalResult = null
    let finalError = null
    let receivedChunk = false

    const requestTask = wx.request({
      url,
      method: 'POST',
      header: headers,
      data: payload,
      enableChunked: true,
      success: response => {
        if (!receivedChunk) {
          const parsedJson = parseJsonPayload(response?.data, decoder)
          if (parsedJson) {
            finalResult = parsedJson
          } else {
            buffer += decodeChunkText(response?.data, decoder)
          }
        }
        resolve({ response, buffer, finalResult, finalError, decoder })
      },
      fail: reject
    })

    if (requestTask.onChunkReceived) {
      requestTask.onChunkReceived(chunk => {
        receivedChunk = true
        buffer += decodeChunkText(chunk.data, decoder)

        const { completeEvents, rest } = parseSSEBuffer(buffer)
        buffer = rest

        for (const eventText of completeEvents) {
          const parsedEvent = parseSSEEvent(eventText)
          if (!parsedEvent.data) continue

          try {
            const parsed = JSON.parse(parsedEvent.data)
            const eventName = parsedEvent.event || parsed.event || parsed.type || ''

            if (eventName === 'prompt' || parsed.type === 'prompt') {
              continue
            }

            if ((eventName === 'reply' || parsed.type === 'reply') && parsed.content) {
              onText?.('正在标注图片可见症状并匹配规则诊断...', '正在标注图片可见症状并匹配规则诊断...')
            }

            if (parsed.type === 'error') {
              finalError = new Error(parsed.message || '流式诊断失败')
            }

            if (parsed.type === 'done' || parsed.code !== undefined) {
              finalResult = parsed
            }
          } catch (error) {
            console.warn('解析 SSE 数据失败:', error, parsedEvent)
          }
        }
      })
    }
  })
}

function finalizeSSEResult({ response, buffer, finalResult, finalError, decoder }) {
  if (finalError && !finalResult) {
    throw finalError
  }

  if (!finalResult && buffer.trim()) {
    const parsedEvent = parseSSEEvent(buffer)
    if (parsedEvent.data) {
      try {
        const parsed = JSON.parse(parsedEvent.data)
        if ((parsedEvent.event || parsed.event || parsed.type) !== 'prompt') {
          finalResult = parsed
        }
      } catch (error) {
        console.warn('解析尾部 SSE 数据失败:', error, parsedEvent)
      }
    }
  }

  if (finalResult) {
    return finalResult
  }

  if (response?.statusCode === 200 && response?.data) {
    const result = parseJsonPayload(response.data, decoder)
    if (result) {
      return result
    }
    throw new Error('诊断响应格式错误')
  }

  if (response?.statusCode === 401 || response?.statusCode === 403) {
    const errorResult = parseJsonPayload(response?.data, decoder)
    throw new Error(errorResult?.message || `认证失败 (${response?.statusCode})`)
  }

  throw new Error(`请求失败 (HTTP ${response?.statusCode || 'unknown'})`)
}

export async function streamDiagnosePlant({
  mode = 'quick',
  image,
  description,
  plantName,
  plantId,
  openid,
  skipAuth = false,
  onText,
  onFinish,
  onError
}) {
  try {
    onText?.('思考中...', '思考中...')
    validateDiagnoseInput({ plantId, image })

    const { token, resolvedOpenid } = await resolveDiagnoseAuth(openid, skipAuth)
    const url = `${BASE_URL}/diagnose-http/stream/diagnose?webfn=true`
    const headers = {
      ...(resolvedOpenid ? { 'x-wx-openid': resolvedOpenid, 'x-openid': resolvedOpenid } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'text/event-stream',
      'Content-Type': 'application/json'
    }
    const payload = buildDiagnosePayload({
      mode,
      plantId,
      image,
      description,
      plantName,
      skipAuth
    })

    const sseResult = await createSSERequest({
      url,
      headers,
      payload,
      onText
    })
    const result = finalizeSSEResult(sseResult)
    const normalizedResult = normalizeDiagnoseResult(result)

    runSuccessCallbacks(normalizedResult, { onText, onFinish })
    return normalizedResult
  } catch (error) {
    console.error('流式诊断失败:', error)
    return runErrorCallback(error, { onError })
  }
}

export async function diagnosePlant(options) {
  return syncDiagnosePlant({
    mode: 'quick',
    ...options
  })
}

export async function rerunDiagnoseWithFollowUps({
  plantId,
  diagnosisId,
  observedSymptoms = [],
  followUpAnswers = [],
  onFinish,
  onError
}) {
  try {
    const result = await requestHttpFunction('diagnose-http/diagnose', {
      method: 'POST',
      body: {
        mode: 'follow_up',
        plantId,
        diagnosisId,
        skipAIExtraction: true,
        observedSymptoms,
        followUpAnswers
      }
    })

    const normalizedResult = normalizeDiagnoseResult(result)
    onFinish?.(normalizedResult.diagnosis, normalizedResult.fullText)
    return normalizedResult
  } catch (error) {
    console.error('问诊重算失败:', error)
    return runErrorCallback(error, { onError })
  }
}
