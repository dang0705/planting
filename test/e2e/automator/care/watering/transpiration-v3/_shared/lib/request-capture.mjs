'use strict'

/**
 * wx.request 拦截与读取 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 在小程序运行时安装 wx.request/uni.request monkey-patch，捕获真实请求/响应
 *   - 读取已捕获的请求列表
 *   - 恢复原始请求函数
 *   - 递归脱敏：移除 token/openid/cookie/Authorization/session/credential 等敏感字段
 *
 * 关键约束：
 *   - mp.evaluate 回调运行在小程序环境，不能引用 Node 模块闭包。
 *     所有正则、常量、辅助函数必须全部在回调内部定义。
 *   - 安装/恢复必须幂等，避免重复安装后把 wrapper 当成 original。
 *   - 不破坏原始请求函数的 success/fail/complete 回调语义。
 *
 * 不替代后端 curl/Node HTTP/mock；只采集小程序运行时真实网络请求。
 */

/**
 * 安装运行时请求拦截器到 globalThis.__e2eRequests。
 *
 * 幂等：重复调用不会重复安装（检查 __e2eWateringV3CaptureInstalled 标志）。
 *
 * @param {object} mp - miniProgram 实例
 * @param {object} [options]
 * @param {boolean} [options.addProbeId=false] - 给真实出站请求增加可关联的 QA 探针头
 * @param {string} [options.probePrefix='qa'] - 探针标识前缀
 */
export async function installRequestCapture(
  mp,
  { addProbeId = false, probePrefix = 'qa' } = {}
) {
  await mp.evaluate(captureOptions => {
    captureOptions = captureOptions || {}
    const shouldAddProbeId = captureOptions.addProbeId === true
    const probePrefix = String(captureOptions.probePrefix || 'qa')
    // Do not reference the undeclared `uni` identifier directly.  Some
    // compiled assets expose only `globalThis.uni` (and some expose no Uni
    // namespace at all); an identifier lookup can surface as an AppService
    // "Uncaught uni is not defined" even when guarded by a runtime probe.
    const uniRef = globalThis.uni
    // 幂等保护：已安装则先恢复所有已包裹的请求函数，再重新安装
    const previousState = globalThis.__e2eRequestCaptureState
    if (previousState && previousState.installed) {
      if (previousState.wxRequest && typeof wx !== 'undefined') {
        wx.request = previousState.wxRequest
      }
      if (
        previousState.wxCallHTTPFunction &&
        typeof wx !== 'undefined' &&
        wx.cloud
      ) {
        wx.cloud.callHTTPFunction = previousState.wxCallHTTPFunction
      }
      if (previousState.uniRequest && uniRef) {
        uniRef.request = previousState.uniRequest
      }
    }

    globalThis.__e2eRequests = []
    const state = {
      installed: true,
      wxRequest: typeof wx !== 'undefined' ? wx.request : null,
      wxCallHTTPFunction:
        typeof wx !== 'undefined' &&
        wx.cloud &&
        typeof wx.cloud.callHTTPFunction === 'function'
          ? wx.cloud.callHTTPFunction
          : null,
      uniRequest: uniRef && typeof uniRef.request === 'function' ? uniRef.request : null
    }
    globalThis.__e2eRequestCaptureState = state
    globalThis.__e2eWateringV3CaptureInstalled = true

    // 敏感 header 键正则（在回调内部定义，不引用 Node 闭包）
    const SENSITIVE_HEADER_KEYS =
      /^(authorization|x-cloudbase-credentials|cookie|token|openid|sessionid|session-id|x-csrf-token|set-cookie|access-token|refresh-token|secret|credential|x-planting-platform-session|x-planting-http-identity-ticket|identity-ticket)/i

    // 敏感 data 键正则
    const SENSITIVE_DATA_KEYS =
      /^(authorization|token|openid|sessionid|session_key|session-key|cookie|credential|secret|access_token|refresh_token|password|_openid)$/i

    function sanitizeValue(value, depth) {
      if (depth > 6) {
        return '[max-depth]'
      }
      if (value === null || value === undefined) {
        return value
      }
      if (typeof value === 'string') {
        // 脱敏疑似 token/JWT 的长字符串（>40 字符且匹配 token 模式）
        if (value.length > 40 && /^[A-Za-z0-9_\-.]+$/.test(value)) {
          return '[redacted-token-like]'
        }
        return value
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return value
      }
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
      if (data === null || data === undefined) {
        return null
      }
      try {
        return sanitizeValue(JSON.parse(JSON.stringify(data)), 0)
      } catch {
        return String(data)
      }
    }

    function sanitizeResponseData(data) {
      if (data === null || data === undefined) {
        return null
      }
      try {
        return sanitizeValue(JSON.parse(JSON.stringify(data)), 0)
      } catch {
        return String(data)
      }
    }

    function wrapRequest(owner, original, transport) {
      if (typeof original !== 'function') {
        return null
      }
      return function (opts = {}) {
        const inheritedCapture = opts && opts.__e2eRequestCaptureContext
        if (inheritedCapture) {
          return original.call(owner, opts)
        }
        const captured = {
          transport,
          url: opts.url || '',
          method: opts.method || 'GET',
          data: sanitizeRequestData(opts.data),
          header: sanitizeHeader(opts.header || {}),
          time: Date.now(),
          elapsed_ms: null,
          probe_id: null
        }
        const origSuccess = opts.success
        const origFail = opts.fail
        const origComplete = opts.complete
        let recorded = false
        const record = () => {
          if (recorded) {
            return
          }
          recorded = true
          captured.elapsed_ms = Math.max(0, Date.now() - Number(captured.time || Date.now()))
          try {
            globalThis.__e2eRequests.push(captured)
          } catch {
            // Runtime teardown can race request completion; the request itself remains valid.
          }
        }
        const nextOpts = { ...opts }
        if (shouldAddProbeId) {
          const probeId = `${probePrefix}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 10)}`
          captured.probe_id = probeId
          nextOpts.header = {
            ...(opts.header || {}),
            'x-qa-performance-probe-id': probeId
          }
        }
        Object.defineProperty(nextOpts, '__e2eRequestCaptureContext', {
          value: captured,
          enumerable: false,
          configurable: true
        })

        nextOpts.success = function (res) {
          try {
            captured.response = {
              statusCode: res.statusCode,
              data: sanitizeResponseData(res.data),
              // CloudBase 网关在响应头返回唯一请求 ID；保留脱敏后的
              // 非敏感头，供真实 wx.request 与 CLS Init Report 精确关联。
              header: sanitizeHeader(res.header || res.headers || {})
            }
          } catch {
            // Keep the request record even when response serialization fails.
          }
          record()
          if (origSuccess) {
            return origSuccess(res)
          }
        }
        nextOpts.fail = function (err) {
          try {
            captured.error = String(err?.errMsg || err)
          } catch {
            // Keep the request record even when the failure object is not serializable.
          }
          record()
          if (origFail) {
            return origFail(err)
          }
        }
        nextOpts.complete = function (resOrErr) {
          if (origComplete) {
            return origComplete(resOrErr)
          }
        }
        return original.call(owner, nextOpts)
      }
    }

    function wrapCallHTTPFunction(owner, original) {
      if (typeof original !== 'function') {
        return null
      }
      return function (opts = {}) {
        const inheritedCapture = opts && opts.__e2eRequestCaptureContext
        if (inheritedCapture) {
          return original.call(owner, opts)
        }
        const functionName = String(opts.name || '').replace(/^\/+|\/+$/gu, '')
        const functionPath = String(opts.path || '').replace(/^\/+/, '')
        const captured = {
          transport: 'wx.cloud.callHTTPFunction',
          url: [functionName, functionPath].filter(Boolean).join('/'),
          method: opts.method || 'GET',
          data: sanitizeRequestData(opts.data),
          header: sanitizeHeader(opts.header || {}),
          time: Date.now(),
          elapsed_ms: null,
          probe_id: null
        }
        const origSuccess = opts.success
        const origFail = opts.fail
        let recorded = false
        const record = () => {
          if (recorded) {
            return
          }
          recorded = true
          captured.elapsed_ms = Math.max(0, Date.now() - Number(captured.time || Date.now()))
          try {
            globalThis.__e2eRequests.push(captured)
          } catch {
            // Runtime teardown can race request completion; the request itself remains valid.
          }
        }
        const nextOpts = { ...opts }
        Object.defineProperty(nextOpts, '__e2eRequestCaptureContext', {
          value: captured,
          enumerable: false,
          configurable: true
        })
        nextOpts.success = function (res) {
          try {
            captured.response = {
              statusCode: res?.statusCode ?? res?.status ?? null,
              data: sanitizeResponseData(res?.data),
              header: sanitizeHeader(res?.header || res?.headers || {})
            }
          } catch {
            // Keep the request record even when response serialization fails.
          }
          record()
          if (origSuccess) {
            return origSuccess(res)
          }
        }
        nextOpts.fail = function (err) {
          try {
            captured.error = String(err?.errMsg || err?.message || err)
          } catch {
            // Keep the request record even when the failure object is not serializable.
          }
          record()
          if (origFail) {
            return origFail(err)
          }
        }
        return original.call(owner, nextOpts)
      }
    }

    // UniApp 小程序产物通常调用 uni.request；保留 wx.request 作为原生页面/旧产物回退。
    // 即使两者指向同一个原函数，也要分别替换两个属性，否则只替换 wx.request
    // 无法覆盖 uni.request 这个别名属性。
    if (state.uniRequest && uniRef) {
      uniRef.request = wrapRequest(uniRef, state.uniRequest, 'uni.request')
    }
    if (state.wxCallHTTPFunction && typeof wx !== 'undefined' && wx.cloud) {
      wx.cloud.callHTTPFunction = wrapCallHTTPFunction(
        wx.cloud,
        state.wxCallHTTPFunction
      )
    }
    if (state.wxRequest && typeof wx !== 'undefined') {
      wx.request = wrapRequest(wx, state.wxRequest, 'wx.request')
    }
  }, { addProbeId, probePrefix })
}

/**
 * 读取已捕获的运行时请求列表（深拷贝，避免引用污染）。
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
 * 恢复原始请求函数（必须在 finally 中调用）。
 * 幂等：未安装时无操作。
 */
export async function restoreRequest(mp) {
  if (!mp) {
    return
  }
  try {
    await mp.evaluate(() => {
      const uniRef = globalThis.uni
      const state = globalThis.__e2eRequestCaptureState
      if (state) {
        if (state.wxRequest && typeof wx !== 'undefined') {
          wx.request = state.wxRequest
        }
        if (state.wxCallHTTPFunction && typeof wx !== 'undefined' && wx.cloud) {
          wx.cloud.callHTTPFunction = state.wxCallHTTPFunction
        }
        if (state.uniRequest && uniRef) {
          uniRef.request = state.uniRequest
        }
        delete globalThis.__e2eRequestCaptureState
        delete globalThis.__e2eRequests
        delete globalThis.__e2eWateringV3CaptureInstalled
      }
    })
  } catch {
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
    if (!req.url || !req.url.includes(urlFragment)) {
      continue
    }
    if (method && String(req.method).toUpperCase() !== String(method).toUpperCase()) {
      continue
    }
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
