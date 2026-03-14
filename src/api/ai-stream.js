import { useUserStore } from '@/store/user'
import { getCloudbaseAccessToken } from '@/utils/cloudbase-auth'
import { BASE_URL } from '@/api/env'

/**
 * AI 服务
 * - 识别：云函数 identify（混元 Vision，非流式）
 * - 诊断（quick）：HTTP 云函数 diagnose-http（SSE 包装，混元 Vision）
 * - 诊断（deep）：HTTP 云函数 diagnose-http（SSE 流式，Agent）
 */
function decodeChunkText(chunk, decoder) {
  if (!chunk) return ''

  if (typeof chunk === 'string') {
    return chunk
  }

  if (!(chunk instanceof ArrayBuffer) && !ArrayBuffer.isView(chunk)) {
    return ''
  }

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
  } catch (error) {
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
  } catch (error) {
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

/**
 * 识别植物 - 调用云函数 identify-baidu（百度植物识别）
 */
export async function identifyPlant({ messages, openid, onFinish, onError }) {
  console.log('识别请求，调用百度植物识别云函数')

  try {
    // 从 messages 中提取图片 URL
    let imageUrl = ''
    if (messages && messages[0]?.Contents) {
      const imageContent = messages[0].Contents.find(c => c.Type === 'image_url')
      imageUrl = imageContent?.ImageUrl?.Url || ''
    }

    if (!imageUrl) {
      throw new Error('缺少图片URL')
    }

    const res = await wx.cloud.callFunction({
      name: 'identify-baidu',
      data: {
        imageUrl
      }
    })

    console.log('百度识别云函数返回:', res.result)

    if (res.result.code !== 200) {
      const error = new Error(res.result.message || 'AI 请求失败')
      onError?.(error)
      throw error
    }

    // 解析百度 API 返回的结果
    const baiduResult = res.result.data

    // 转换为统一格式
    const result = parseBaiduResult(baiduResult)
    const fullText = formatBaiduText(baiduResult)

    onFinish?.(result, fullText)
    return { result, fullText }
  } catch (err) {
    console.error('识别请求失败:', err)
    onError?.(err)
    throw err
  }
}

/**
 * 解析百度识别结果
 */
function parseBaiduResult(baiduData) {
  // baiduData 格式：{ result: { ingredient: {...}, plant: {...} }, type: 'plant'|'ingredient', log_id: ... }
  const type = baiduData?.type || 'plant'
  const resultData = baiduData?.result?.[type]?.result || []

  if (resultData.length === 0) {
    return { name: '未知植物', confidence: 0 }
  }

  // 取第一个结果
  const topResult = resultData[0]

  // 检查是否是"非xxx"
  if (topResult.name === '非果蔬食材' || topResult.name === '非植物') {
    return { name: '未知植物', confidence: 0 }
  }

  return {
    name: topResult.name || '未知植物',
    confidence: topResult.score || 0,
    type: type
  }
}

/**
 * 格式化百度识别结果为文本
 */
function formatBaiduText(baiduData) {
  const type = baiduData?.type || 'plant'
  const resultData = baiduData?.result?.[type]?.result || []

  if (resultData.length === 0) {
    return '未能识别出植物，请重试'
  }

  const topResult = resultData[0]

  // 检查是否是"非xxx"
  if (topResult.name === '非果蔬食材' || topResult.name === '非植物') {
    return '未能识别出植物，请重试'
  }

  const typeName = type === 'ingredient' ? '果蔬' : '植物'

  let text = `识别结果：${topResult.name || '未知'}`

  if (topResult.score) {
    text += `\n置信度：${(topResult.score * 100).toFixed(1)}%`
  }

  text += `\n类型：${typeName}`

  return text
}

/**
 * 诊断植物（默认模式）- 统一走 HTTP 云函数 SSE
 */
export async function diagnosePlant({
  image,
  description,
  plantName,
  plantId,
  openid,
  onText,
  onFinish,
  onError
}) {
  return streamDiagnosePlant({
    mode: 'quick',
    image,
    description,
    plantName,
    plantId,
    openid,
    onText,
    onFinish,
    onError
  })
}

/**
 * 诊断植物（流式模式）- 直接调用 diagnose-http HTTP 函数
 * 使用 HTTP SSE 方式获取实时流式响应
 */
export async function streamDiagnosePlant({
  mode = 'deep',
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
    const userStore = useUserStore()
    const resolvedOpenid = openid || userStore.openid || ''
    // 先显示加载状态
    onText?.('思考中...', '思考中...')

    // 检查必要参数
    if (!plantId) {
      throw new Error('缺少植物ID，无法进行诊断')
    }

    // 构建请求参数（手动拼接，mini program 不支持 URLSearchParams）
    const fullUrl = `${BASE_URL}/diagnose-http/stream/diagnose?webfn=true`

    console.log('请求 URL:', fullUrl)

    let token = ''
    if (!skipAuth) {
      token = await getCloudbaseAccessToken()
      console.log('通过 @cloudbase/js-sdk 获取 access token:', token ? '成功' : '失败')

      try {
        userStore.token = token
      } catch (error) {
        console.warn('同步 token 到 Pinia 失败:', error)
      }
    }

    let finalResult = null
    let finalError = null
    let streamFullText = ''
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null

    const res = await new Promise((resolve, reject) => {
      let buffer = ''
      const requestTask = wx.request({
        url: fullUrl,
        method: 'POST',
        header: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(resolvedOpenid
            ? {
                'x-openid': resolvedOpenid,
                'x-wx-openid': resolvedOpenid
              }
            : {}),
          Accept: 'text/event-stream',
          'Content-Type': 'application/json'
        },
        data: {
          mode,
          plantId,
          skipAuth,
          ...(resolvedOpenid ? { openid: resolvedOpenid } : {}),
          ...(image ? { image } : {}),
          ...(description ? { description } : {}),
          ...(plantName ? { plantName } : {})
        },
        enableChunked: true, // 启用分块传输（SSE 支持）
        success: resolve,
        fail: reject
      })

      // 监听分块数据（SSE 流式响应）
      if (requestTask.onChunkReceived) {
        requestTask.onChunkReceived(res => {
          buffer += decodeChunkText(res.data, decoder)

          const { completeEvents, rest } = parseSSEBuffer(buffer)
          buffer = rest

          for (const eventText of completeEvents) {
            const parsedEvent = parseSSEEvent(eventText)
            if (!parsedEvent.data) continue

            try {
              const parsed = JSON.parse(parsedEvent.data)
              const eventName = parsedEvent.event || parsed.event || parsed.type || ''
              const eventId = parsedEvent.id || parsed.id || ''

              if (eventName === 'prompt' || parsed.type === 'prompt') {
                console.log('收到 prompt SSE 事件:', { eventId, parsed })
                continue
              }

              if ((eventName === 'reply' || parsed.type === 'reply') && parsed.content) {
                streamFullText = parsed.fullText || `${streamFullText}${parsed.content}`
                onText?.(parsed.content, streamFullText)
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

    console.log('diagnose-http HTTP 函数返回:', res)
    console.log('Response statusCode:', res.statusCode)
    console.log('Response data:', res.data)
    console.log('Response header:', res.header)

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

    let result
    if (finalResult) {
      result = finalResult
    } else if (res.statusCode === 200 && res.data) {
      result = parseJsonPayload(res.data, decoder)
      if (!result) {
        throw new Error('诊断响应格式错误')
      }
    } else if (res.statusCode === 403 || res.statusCode === 401) {
      const errorResult = parseJsonPayload(res.data, decoder)
      if (errorResult?.message) {
        throw new Error(errorResult.message)
      }
      throw new Error(`认证失败 (${res.statusCode})`)
    } else {
      console.error('未收到有效响应:', res)
      throw new Error(`请求失败 (HTTP ${res.statusCode})`)
    }

    if (result.code !== 200) {
      throw new Error(result.message || '诊断请求失败')
    }

    const responseData = result.data
    const fullText =
      result.fullText ||
      streamFullText ||
      responseData.diagnosis?.summary ||
      responseData.diagnosis?.symptoms ||
      '诊断完成'

    onFinish?.(responseData.diagnosis, fullText)

    return {
      recordId: responseData.recordId,
      plantId: responseData.plantId,
      diagnosis: responseData.diagnosis,
      fullText,
      timestamp: responseData.timestamp,
      status: 'completed'
    }
  } catch (error) {
    console.error('流式诊断失败:', error)

    // 直接返回错误
    onError?.(error)
    throw error
  }
}

/**
 * 构建诊断用 messages（混元 Vision 格式）
 */
function buildDiagnoseMessages(image, description, plantName) {
  const contents = []

  if (image) {
    contents.push({ Type: 'image_url', ImageUrl: { Url: image } })
  }

  let textParts = '请诊断这张植物图片的健康状况。'
  if (plantName) textParts += `\n植物名称：${plantName}`
  if (description) textParts += `\n症状描述：${description}`
  contents.push({ Type: 'text', Text: textParts })

  return [{ Role: 'user', Contents: contents }]
}

/**
 * 解析诊断结果
 */
function parseDiagnoseResult(text) {
  const cleanText = text || ''

  let healthScore = 65
  let healthStatus = 'warning'

  if (/严重|病害|枯死|根腐|立即|紧急|需要立即处理/.test(cleanText)) {
    healthScore = 35
    healthStatus = 'sick'
  } else if (/健康|正常|良好|没问题|状态不错/.test(cleanText)) {
    healthScore = 85
    healthStatus = 'healthy'
  } else if (/注意|观察|轻微|需要注意/.test(cleanText)) {
    healthScore = 65
    healthStatus = 'warning'
  }

  let mainIssue = '需要进一步观察'
  if (/浇水过多|积水/.test(cleanText)) mainIssue = '浇水过多'
  else if (/缺水|干燥/.test(cleanText)) mainIssue = '缺水'
  else if (/光照不足/.test(cleanText)) mainIssue = '光照不足'
  else if (/光照过强|晒伤/.test(cleanText)) mainIssue = '光照过强'
  else if (/缺肥|营养/.test(cleanText)) mainIssue = '营养不足'
  else if (/病虫害|虫/.test(cleanText)) mainIssue = '病虫害'
  else if (/空调|干燥/.test(cleanText)) mainIssue = '环境过于干燥'

  return { healthScore, healthStatus, mainIssue, summary: cleanText.substring(0, 200) }
}
