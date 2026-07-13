'use strict'

/**
 * wx.request 拦截与读取 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 在小程序运行时安装 wx.request monkey-patch，捕获真实请求/响应
 *   - 读取已捕获的请求列表
 *   - 恢复原始 wx.request
 *   - 递归脱敏：移除 token/openid/cookie/Authorization/session/credential 等敏感字段
 *
 * 关键约束：
 *   - mp.evaluate 回调运行在小程序环境，不能引用 Node 模块闭包。
 *     所有正则、常量、辅助函数必须全部在回调内部定义。
 *   - 安装/恢复必须幂等，避免重复安装后把 wrapper 当成 original。
 *   - 不破坏原始 wx.request 的 success/fail/complete 回调语义。
 *
 * 不替代后端 curl/Node HTTP/mock；只采集小程序运行时真实 wx.request。
 */

const CAPTURE_FLAG = '__e2eWateringV3CaptureInstalled'

/**
 * 安装 wx.request 拦截器到 globalThis.__e2eRequests。
 *
 * 幂等：重复调用不会重复安装（检查 __e2eWateringV3CaptureInstalled 标志）。
 *
 * @param {object} mp - miniProgram 实例
 */
export async function installRequestCapture(mp) {
  await mp.evaluate(() => {
    // 幂等保护：已安装则先恢复原 wx.request，再重新安装
    if (globalThis.__e2eWateringV3CaptureInstalled && globalThis.__e2eOriginalRequest) {
      wx.request = globalThis.__e2eOriginalRequest
    }

    globalThis.__e2eRequests = []
    globalThis.__e2eOriginalRequest = wx.request
    globalThis.__e2eWateringV3CaptureInstalled = true

    // 敏感 header 键正则（在回调内部定义，不引用 Node 闭包）
    const SENSITIVE_HEADER_KEYS =
      /^(authorization|x-cloudbase-credentials|cookie|token|openid|sessionid|session-id|x-csrf-token|set-cookie|access-token|refresh-token|secret|credential)/i

    // 敏感 data 键正则
    const SENSITIVE_DATA_KEYS =
      /^(authorization|token|openid|sessionid|session_key|session-key|cookie|credential|secret|access_token|refresh_token|password|_openid)$/i

    function sanitizeValue(value, depth) {
      if (depth > 6) return '[max-depth]'
      if (value === null || value === undefined) return value
      if (typeof value === 'string') {
        // 脱敏疑似 token/JWT 的长字符串（>40 字符且匹配 token 模式）
        if (value.length > 40 && /^[A-Za-z0-9_\-.]+$/.test(value)) {
          return '[redacted-token-like]'
        }
        return value
      }
      if (typeof value === 'number' || typeof value === 'boolean') return value
      if (Array.isArray(value)) {
        return value.slice(0, 50).map(v => sanitizeValue(v, depth + 1))
      }
      if (typeof value === 'object') {
        const safe = {}
        for (const key of Object.keys(value)) {
          if (SENSITIVE_DATA_KEYS.test(key)) {
            safe[key] = '[redacted]'
          } else {
            safe[key] = sanitizeValue(value[key], depth + 1)
          }
        }
        return safe
      }
      return String(value)
    }

    function sanitizeHeader(header) {
      const safe = {}
      for (const key of Object.keys(header || {})) {
        if (SENSITIVE_HEADER_KEYS.test(key)) {
          safe[key] = '[redacted]'
        } else {
          safe[key] = header[key]
        }
      }
      return safe
    }

    function sanitizeRequestData(data) {
      if (data === null || data === undefined) return null
      try {
        return sanitizeValue(JSON.parse(JSON.stringify(data)), 0)
      } catch (e) {
        return String(data)
      }
    }

    function sanitizeResponseData(data) {
      if (data === null || data === undefined) return null
      try {
        return sanitizeValue(JSON.parse(JSON.stringify(data)), 0)
      } catch (e) {
        return String(data)
      }
    }

    wx.request = function (opts) {
      const captured = {
        url: opts.url || '',
        method: opts.method || 'GET',
        data: sanitizeRequestData(opts.data),
        header: sanitizeHeader(opts.header || {}),
        time: Date.now()
      }
      const origSuccess = opts.success
      const origFail = opts.fail
      const origComplete = opts.complete

      opts.success = function (res) {
        try {
          captured.response = {
            statusCode: res.statusCode,
            data: sanitizeResponseData(res.data)
          }
          globalThis.__e2eRequests.push(captured)
        } catch (e) {}
        if (origSuccess) return origSuccess(res)
      }
      opts.fail = function (err) {
        try {
          captured.error = String(err?.errMsg || err)
          globalThis.__e2eRequests.push(captured)
        } catch (e) {}
        if (origFail) return origFail(err)
      }
      opts.complete = function (resOrErr) {
        if (origComplete) return origComplete(resOrErr)
      }
      return globalThis.__e2eOriginalRequest.call(wx, opts)
    }
  })
}

/**
 * 读取已捕获的 wx.request 列表（深拷贝，避免引用污染）。
 */
export async function readCapturedRequests(mp) {
  return mp.evaluate(() => {
    return JSON.parse(JSON.stringify(globalThis.__e2eRequests || []))
  })
}

/**
 * 清空已捕获的请求列表（场景间重置）。
 */
export async function clearCapturedRequests(mp) {
  await mp.evaluate(() => {
    globalThis.__e2eRequests = []
  })
}

/**
 * 恢复原始 wx.request（必须在 finally 中调用）。
 * 幂等：未安装时无操作。
 */
export async function restoreRequest(mp) {
  if (!mp) return
  try {
    await mp.evaluate(() => {
      if (globalThis.__e2eOriginalRequest) {
        wx.request = globalThis.__e2eOriginalRequest
        delete globalThis.__e2eOriginalRequest
        delete globalThis.__e2eRequests
        delete globalThis.__e2eWateringV3CaptureInstalled
      }
    })
  } catch (error) {
    // ignore restore errors
  }
}

/**
 * 从捕获的请求列表中查找匹配 URL 子串的请求。
 *
 * @param {Array} requests - readCapturedRequests 返回值
 * @param {string} urlFragment - URL 子串，如 /watering-advisor
 * @param {string} [method] - 可选方法过滤
 * @returns {object|null} 第一个匹配的请求，或 null
 */
export function findRequestByUrl(requests, urlFragment, method) {
  for (const req of requests) {
    if (!req.url || !req.url.includes(urlFragment)) continue
    if (method && String(req.method).toUpperCase() !== String(method).toUpperCase()) continue
    return req
  }
  return null
}

/**
 * 收集所有匹配 URL 子串的请求。
 */
export function collectRequestsByUrl(requests, urlFragment) {
  return requests.filter(req => req.url && req.url.includes(urlFragment))
}
