'use strict'

/**
 * wx.request 拦截与读取 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 在小程序运行时安装 wx.request monkey-patch，捕获真实请求/响应
 *   - 读取已捕获的请求列表
 *   - 恢复原始 wx.request
 *   - 脱敏处理：移除 token/openid/cookie/Authorization 等敏感字段
 *
 * 不替代后端 curl/Node HTTP/mock；只采集小程序运行时真实 wx.request。
 */

const SENSITIVE_HEADER_KEYS =
  /^(authorization|x-cloudbase-credentials|cookie|token|openid|sessionid|x-csrf-token)$/i

/**
 * 安装 wx.request 拦截器到 globalThis.__e2eRequests。
 *
 * @param {object} mp - miniProgram 实例
 */
export async function installRequestCapture(mp) {
  await mp.evaluate(() => {
    globalThis.__e2eRequests = []
    globalThis.__e2eOriginalRequest = wx.request
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
      opts.success = function (res) {
        captured.response = {
          statusCode: res.statusCode,
          data: res.data
        }
        try {
          globalThis.__e2eRequests.push(captured)
        } catch (e) {}
        if (origSuccess) return origSuccess(res)
      }
      opts.fail = function (err) {
        captured.error = String(err?.errMsg || err)
        try {
          globalThis.__e2eRequests.push(captured)
        } catch (e) {}
        if (origFail) return origFail(err)
      }
      return globalThis.__e2eOriginalRequest.call(wx, opts)
    }

    function sanitizeRequestData(data) {
      if (data === null || data === undefined) return null
      try {
        return JSON.parse(JSON.stringify(data))
      } catch (e) {
        return String(data)
      }
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
 */
export async function restoreRequest(mp) {
  if (!mp) return
  try {
    await mp.evaluate(() => {
      if (globalThis.__e2eOriginalRequest) {
        wx.request = globalThis.__e2eOriginalRequest
        delete globalThis.__e2eOriginalRequest
        delete globalThis.__e2eRequests
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
