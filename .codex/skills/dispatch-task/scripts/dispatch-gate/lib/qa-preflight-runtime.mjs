import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from './state.mjs'
import { captureIsolatedPreflightScreenshot } from './qa-preflight-screenshot.mjs'
import { connectAutomatorTransport } from '../../../../../../test/e2e/automator/_shared/formal-leaf-harness.mjs'
import { getCurrentPageWithFallback } from '../../../../../../test/e2e/automator/_shared/page-probe.mjs'

export { captureIsolatedPreflightScreenshot } from './qa-preflight-screenshot.mjs'

/* eslint-disable no-var -- these callback bodies are serialized for ES5-only App.callFunction parsing. */

// A freshly reopened DevTools project can accept the Automator WebSocket
// before its appservice page has finished attaching. `currentPage()` is the
// first RPC that observes that boundary and has taken just over eight seconds
// in a verified run. Keep the deadline bounded, but leave enough room for one
// cold appservice attach so a healthy runtime is not rejected as transport
// failure.
export const PREFLIGHT_RPC_TIMEOUT_MS = 15000
export const PREFLIGHT_SCREENSHOT_TIMEOUT_MS = 20000
export const PREFLIGHT_DISCONNECT_TIMEOUT_MS = 3000
// The overall capture deadline must cover the bounded renderer recovery
// sequence as well as the ordinary Automator probes. A renderer screenshot
// may consume one full attempt, a retry delay, and a second full attempt;
// keeping this at 30s caused a valid second attempt to be reported as a late
// failure. The budget remains finite and is derived from the child deadlines.
const PREFLIGHT_SCREENSHOT_ATTEMPTS = 2
const PREFLIGHT_SCREENSHOT_RETRY_DELAY_MS = 350
const PREFLIGHT_CAPTURE_MARGIN_MS = 2000
export const PREFLIGHT_CAPTURE_TIMEOUT_MS =
  PREFLIGHT_RPC_TIMEOUT_MS * 4 +
  PREFLIGHT_DISCONNECT_TIMEOUT_MS +
  PREFLIGHT_SCREENSHOT_TIMEOUT_MS * PREFLIGHT_SCREENSHOT_ATTEMPTS +
  PREFLIGHT_SCREENSHOT_RETRY_DELAY_MS +
  PREFLIGHT_CAPTURE_MARGIN_MS
const WX_REQUEST_TIMEOUT_MS = 10000
const WX_REQUEST_POLL_INTERVAL_MS = 200
let wxRequestProbeSequence = 0

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function now() {
  return new Date().toISOString()
}

function normalizeRoute(value) {
  return String(value?.path ?? value ?? '').replace(/^\/+/, '')
}

function stepError(step, timeoutMs) {
  const error = new Error(`preflight ${step} timed out after ${timeoutMs}ms`)
  error.code =
    step === 'screenshot' ? 'preflight_screenshot_timeout' : 'preflight_transport_timeout'
  error.preflight_step = step
  error.timeout_ms = timeoutMs
  return error
}

function rejectedStepError(step, error) {
  error.code ??= `preflight_${step}_failed`
  error.preflight_step ??= step
  return error
}

function recordStep(report, step, value) {
  report.checks.rpc_steps ??= {}
  report.checks.rpc_steps[step] = value
}

export function withPreflightDeadline({ report, step, timeoutMs, action }) {
  const startedAt = Date.now()
  recordStep(report, step, { status: 'running', timeout_ms: timeoutMs, started_at: now() })
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value, evidence) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      recordStep(report, step, {
        ...evidence,
        timeout_ms: timeoutMs,
        duration_ms: Date.now() - startedAt,
        completed_at: now()
      })
      callback(value)
    }
    const timer = setTimeout(() => {
      const error = stepError(step, timeoutMs)
      finish(reject, error, { status: 'timed_out', code: error.code, message: error.message })
    }, timeoutMs)
    Promise.resolve()
      .then(action)
      .then(
        value => finish(resolve, value, { status: 'passed', code: `preflight_${step}_passed` }),
        error => {
          const normalized = rejectedStepError(step, error)
          finish(reject, normalized, {
            status: 'failed',
            code: normalized.code,
            message: normalized.message
          })
        }
      )
  })
}

function nextWxRequestSlot() {
  wxRequestProbeSequence += 1
  return `__dispatchQaWxRequest_${Date.now()}_${wxRequestProbeSequence}`
}

function acceptableResponseStatus(statusCode) {
  return Number.isInteger(statusCode) && statusCode >= 200 && statusCode < 400
}

function defaultEvaluateStep(miniProgram) {
  return (step, callback, args) => miniProgram.evaluate.apply(miniProgram, [callback, ...args])
}

export function requestFailureMessage(result, timeoutMs) {
  if (result?.cleanup?.passed !== true) {
    return `wx.request preflight cleanup failed: ${result?.cleanup?.error ?? 'unknown error'}`
  }
  if (result?.timed_out === true) {
    return `wx.request preflight timed out after ${timeoutMs}ms`
  }
  if (result?.error) {
    return `wx.request preflight failed: ${result.error}`
  }
  if (result?.statusCode !== undefined) {
    return `wx.request preflight returned unacceptable status ${result.statusCode}`
  }
  return 'wx.request preflight failed: no runtime result'
}

export async function probeWxRequest({
  miniProgram,
  url,
  requireAuthenticatedIdentity = false,
  slot = nextWxRequestSlot(),
  timeoutMs = WX_REQUEST_TIMEOUT_MS,
  pollIntervalMs = WX_REQUEST_POLL_INTERVAL_MS,
  nowMs = Date.now,
  sleep = wait,
  evaluateStep = defaultEvaluateStep(miniProgram)
} = {}) {
  const deadline = nowMs() + timeoutMs
  let result
  let cleanup = { attempted: false, passed: false }
  try {
    await evaluateStep(
      'wx_request_start',
      function (requestSlot, requestUrl, requireIdentity) {
        globalThis[requestSlot] = {
          state: 'pending',
          identity_required: requireIdentity === true,
          identity_resolved: false,
          access_token_resolved: false,
          identity_ticket_resolved: false,
          native_http_function: false
        }
        var finishFailure = function (message) {
          globalThis[requestSlot] = {
            state: 'completed',
            ok: false,
            identity_required: requireIdentity === true,
            identity_resolved: false,
            access_token_resolved: false,
            identity_ticket_resolved: false,
            native_http_function: false,
            error: message
          }
        }
        var sendRequest = function (identity, accessToken) {
          var openid = identity && identity.openid ? String(identity.openid) : ''
          var bearerToken = accessToken ? String(accessToken).trim() : ''
          var identityTicket =
            identity && identity.httpIdentityTicket
              ? String(identity.httpIdentityTicket).trim()
              : ''
          var nativeTarget = null
          try {
            var nativeMatch = String(requestUrl || '').match(
              /\/v1\/functions\/([^/?#]+)(\/[^?#]*)?(?:\?([^#]*))?/i
            )
            if (nativeMatch && nativeMatch[1]) {
              var nativeQuery = String(nativeMatch[3] || '')
                .split('&')
                .filter(function (part) {
                  return part && !/^webfn=/i.test(part)
                })
                .join('&')
              nativeTarget = {
                name: decodeURIComponent(nativeMatch[1]),
                path:
                  String(nativeMatch[2] || '/') +
                  (nativeQuery ? '?' + nativeQuery : '')
              }
            }
          } catch (error) {
            nativeTarget = null
          }
          if (requireIdentity === true && !openid) {
            finishFailure('wechat-identity 未返回有效 openid')
            return
          }
          if (
            nativeTarget &&
            wx.cloud &&
            typeof wx.cloud.callHTTPFunction === 'function'
          ) {
            try {
              wx.cloud.callHTTPFunction({
                name: nativeTarget.name,
                path: nativeTarget.path,
                method: 'GET',
                header: identityTicket
                  ? {
                      // Keep the preflight request contract identical to the
                      // product's native httpRequest transport. The online
                      // functions use these environment headers to select
                      // the development schema; omitting them can make
                      // wx.cloud.callHTTPFunction fail at the gateway before
                      // a business response is produced.
                      'x-app-env': 'development',
                      'x-env': 'development',
                      Authorization: 'Bearer ' + identityTicket,
                      'x-planting-http-identity-ticket': identityTicket
                    }
                  : undefined,
                success: function (response) {
                  var responseData = response && response.data
                  var responseCode =
                    responseData && responseData.code !== undefined ? responseData.code : null
                  var statusCode =
                    response && response.statusCode !== undefined ? response.statusCode : null
                  globalThis[requestSlot] = {
                    state: 'completed',
                    ok: true,
                    statusCode: statusCode,
                    response_code: responseCode,
                    identity_required: requireIdentity === true,
                    identity_resolved: Boolean(openid),
                    access_token_resolved: false,
                    identity_ticket_resolved: Boolean(identityTicket),
                    native_http_function: true
                  }
                },
                fail: function (error) {
                  globalThis[requestSlot] = {
                    state: 'completed',
                    ok: false,
                    identity_required: requireIdentity === true,
                    identity_resolved: Boolean(openid),
                    access_token_resolved: false,
                    identity_ticket_resolved: Boolean(identityTicket),
                    native_http_function: true,
                    error: error && error.errMsg ? error.errMsg : String(error)
                  }
                }
              })
            } catch (error) {
              finishFailure(error && error.message ? error.message : String(error))
            }
            return
          }
          if (requireIdentity === true && !bearerToken) {
            finishFailure('微信登录态不可用，请重新打开小程序')
            return
          }
          if (requireIdentity === true && !identityTicket) {
            finishFailure('微信身份校验信息缺失，请重新打开小程序')
            return
          }
          try {
            var requestOptions = {
              url: requestUrl,
              method: 'GET',
              success: function (response) {
                var statusCode =
                  response && response.statusCode !== undefined ? response.statusCode : null
                var responseData = response && response.data
                var responseCode =
                  responseData && responseData.code !== undefined ? responseData.code : null
                globalThis[requestSlot] = {
                  state: 'completed',
                  ok: true,
                  statusCode: statusCode,
                  response_code: responseCode,
                  identity_required: requireIdentity === true,
                  identity_resolved: Boolean(openid),
                  access_token_resolved: Boolean(bearerToken),
                  identity_ticket_resolved: Boolean(identityTicket),
                  native_http_function: false
                }
              },
              fail: function (error) {
                var errorMessage = error && error.errMsg ? error.errMsg : String(error)
                globalThis[requestSlot] = {
                  state: 'completed',
                  ok: false,
                  identity_required: requireIdentity === true,
                  identity_resolved: Boolean(openid),
                  access_token_resolved: Boolean(bearerToken),
                  identity_ticket_resolved: Boolean(identityTicket),
                  native_http_function: false,
                  error: errorMessage
                }
              },
              complete: function () {
                var current = globalThis[requestSlot]
                if (current && current.state === 'pending') {
                  globalThis[requestSlot] = {
                    state: 'completed',
                    ok: false,
                    identity_required: requireIdentity === true,
                    identity_resolved: Boolean(openid),
                    access_token_resolved: Boolean(bearerToken),
                    identity_ticket_resolved: Boolean(identityTicket),
                    native_http_function: false,
                    error: 'wx.request completed without success or fail result'
                  }
                }
              }
            }
            if (bearerToken) {
              requestOptions.header = requestOptions.header || {}
              requestOptions.header.Authorization = 'Bearer ' + bearerToken
            }
            if (identityTicket) {
              requestOptions.header = requestOptions.header || {}
              requestOptions.header['x-planting-http-identity-ticket'] = identityTicket
            }
            wx.request(requestOptions)
          } catch (error) {
            var message = error && error.message ? error.message : String(error)
            finishFailure(message)
          }
        }
        var resolveTokenAndSend = function (identity) {
          var getAccessToken =
            wx.cloud && wx.cloud.__plantingGetCloudbaseAccessToken
              ? wx.cloud.__plantingGetCloudbaseAccessToken
              : null
          if (typeof getAccessToken !== 'function' && typeof getApp === 'function') {
            var app = getApp()
            var globalData = app && app.globalData
            getAccessToken = globalData && globalData.__plantingGetCloudbaseAccessToken
          }
          if (typeof getAccessToken !== 'function') {
            finishFailure('微信登录态不可用，请重新打开小程序')
            return
          }
          try {
            Promise.resolve(getAccessToken()).then(
              function (accessToken) {
                sendRequest(identity, accessToken)
              },
              function (error) {
                finishFailure(error && error.message ? error.message : String(error))
              }
            )
          } catch (error) {
            finishFailure(error && error.message ? error.message : String(error))
          }
        }
        if (requireIdentity !== true) {
          sendRequest('', '')
          return { started: true, identity_required: false }
        }
        if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
          finishFailure('wx.cloud.callFunction 不可用，无法建立真实身份')
          return { started: false, identity_required: true }
        }
        try {
          wx.cloud.callFunction({
            name: 'wechat-identity',
            data: {},
            success: function (result) {
              var identity = result && result.result ? result.result : {}
              resolveTokenAndSend(identity)
            },
            fail: function (error) {
              finishFailure(error && error.errMsg ? error.errMsg : String(error))
            }
          })
        } catch (error) {
          finishFailure(error && error.message ? error.message : String(error))
        }
        return { started: true }
      },
      [slot, url, requireAuthenticatedIdentity]
    )
    while (nowMs() <= deadline) {
      const observation = await evaluateStep(
        'wx_request_poll',
        function (requestSlot) {
          var value = globalThis[requestSlot]
          if (!value || typeof value !== 'object') {
            return null
          }
          return {
            state: value.state,
            ok: value.ok,
            statusCode: value.statusCode,
            response_code: value.response_code,
            identity_required: value.identity_required,
            identity_resolved: value.identity_resolved,
            access_token_resolved: value.access_token_resolved,
            identity_ticket_resolved: value.identity_ticket_resolved,
            native_http_function: value.native_http_function,
            error: value.error
          }
        },
        [slot]
      )
      if (observation?.state === 'completed') {
        const statusCode =
          observation.statusCode === null || observation.statusCode === undefined
            ? null
            : Number(observation.statusCode)
        result = {
          ...observation,
          statusCode: Number.isFinite(statusCode) ? statusCode : null,
          passed:
            observation.ok === true &&
            acceptableResponseStatus(statusCode) &&
            (requireAuthenticatedIdentity !== true ||
              (observation.identity_resolved === true &&
                Number(observation.response_code) === 200 &&
                (observation.native_http_function === true ||
                  (observation.access_token_resolved === true &&
                    observation.identity_ticket_resolved === true))))
        }
        return result
      }
      if (nowMs() >= deadline) {
        result = { ok: false, timed_out: true, passed: false }
        return result
      }
      await sleep(Math.min(pollIntervalMs, deadline - nowMs()))
    }
    result = { ok: false, timed_out: true, passed: false }
    return result
  } finally {
    cleanup = { attempted: true, passed: false }
    try {
      await evaluateStep(
        'wx_request_cleanup',
        function (requestSlot) {
          delete globalThis[requestSlot]
          return true
        },
        [slot]
      )
      cleanup.passed = true
    } catch (error) {
      cleanup.error = error?.message ?? String(error)
    }
    if (result) {
      result.cleanup = cleanup
    }
  }
}

async function connectMiniProgram(wsEndpoint, runtimeProof) {
  const imported = await import('miniprogram-automator')
  const automator = imported.default ?? imported
  return connectAutomatorTransport(automator, wsEndpoint, { runtimeProof })
}

export async function captureRuntimeEvidence({
  report,
  wsEndpoint,
  screenshotPath,
  wxRequestUrl,
  requireAuthenticatedIdentity = false,
  runtimeProof = null,
  initialRoute = '',
  connect = connectMiniProgram,
  rpcTimeoutMs = PREFLIGHT_RPC_TIMEOUT_MS,
  screenshotTimeoutMs = PREFLIGHT_SCREENSHOT_TIMEOUT_MS,
  disconnectTimeoutMs = PREFLIGHT_DISCONNECT_TIMEOUT_MS,
  screenshotCapture = captureIsolatedPreflightScreenshot,
  probeRequest = probeWxRequest
}) {
  let miniProgram
  let primaryError
  let captureResult
  try {
    miniProgram = await withPreflightDeadline({
      report,
      step: 'connect',
      timeoutMs: rpcTimeoutMs,
      action: () => connect(wsEndpoint, runtimeProof)
    })
    report.checks.ws.passed = true
    report.checks.automator = { passed: true, ws_endpoint: wsEndpoint }
    let pageProbe
    if (initialRoute) {
      if (typeof miniProgram.reLaunch !== 'function') {
        const error = new Error(`Automator runtime does not expose reLaunch for ${initialRoute}`)
        error.code = 'qa_initial_route_reset_unavailable'
        throw error
      }
      const expectedRoute = normalizeRoute(initialRoute)
      try {
        const currentRouteProbe = await withPreflightDeadline({
          report,
          step: 'initial_route_probe',
          timeoutMs: Math.min(3000, rpcTimeoutMs),
          action: () =>
            getCurrentPageWithFallback(miniProgram, {
              timeoutMs: Math.min(2500, rpcTimeoutMs),
              perRpcTimeoutMs: Math.min(1250, rpcTimeoutMs)
            })
        })
        if (normalizeRoute(currentRouteProbe.page) === expectedRoute) {
          pageProbe = currentRouteProbe
          recordStep(report, 'initial_route_reset', {
            status: 'passed',
            code: 'preflight_initial_route_already_ready',
            route: expectedRoute,
            action: 'skipped_relaunch'
          })
        }
      } catch {
        // A not-yet-attached appservice page is handled by the normal reLaunch
        // path below; the route probe is only an optimization for an already
        // ready initial page.
      }
      if (!pageProbe) {
        await withPreflightDeadline({
          report,
          step: 'initial_route_reset',
          timeoutMs: rpcTimeoutMs,
          action: () => miniProgram.reLaunch(initialRoute)
        })
        // A reLaunch acknowledgement can arrive before the new appservice page
        // has attached. currentPage() below remains the authoritative readiness
        // probe, so do not accept the route reset by acknowledgement alone.
      }
    }
    pageProbe ||= await withPreflightDeadline({
      report,
      step: 'current_page',
      timeoutMs: rpcTimeoutMs,
      action: () =>
        getCurrentPageWithFallback(miniProgram, {
          timeoutMs: Math.min(6000, rpcTimeoutMs),
          perRpcTimeoutMs: Math.min(3000, rpcTimeoutMs)
        })
    })
    if (!report.checks.rpc_steps.current_page) {
      recordStep(report, 'current_page', {
        status: 'passed',
        code: 'preflight_current_page_reused',
        source: pageProbe.source
      })
    }
    const page = pageProbe.page
    report.checks.rpc_steps.current_page.source = pageProbe.source
    report.pagePath = page?.path ?? 'unavailable'
    const pageData = await withPreflightDeadline({
      report,
      step: 'page_data',
      timeoutMs: rpcTimeoutMs,
      action: () => page?.data()
    })
    report.checks.page_data = {
      passed: Boolean(page && pageData && typeof pageData === 'object'),
      top_level_keys: Object.keys(pageData ?? {}).slice(0, 30)
    }
    if (!report.checks.page_data.passed) {
      throw new Error('page data unavailable')
    }
    if (!wxRequestUrl) {
      throw new Error('wx_request_url is required for live preflight')
    }
    const request = await probeRequest({
      miniProgram,
      url: wxRequestUrl,
      requireAuthenticatedIdentity,
      evaluateStep: (step, callback, args) =>
        withPreflightDeadline({
          report,
          step,
          timeoutMs: rpcTimeoutMs,
          action: () => miniProgram.evaluate.apply(miniProgram, [callback, ...args])
        })
    })
    report.checks.wx_request = {
      passed: request.passed === true && request.cleanup?.passed === true,
      status_code: request.statusCode ?? null,
      response_code: request.response_code ?? null,
      identity_required: request.identity_required === true,
      identity_resolved: request.identity_resolved === true,
      access_token_resolved: request.access_token_resolved === true,
      identity_ticket_resolved: request.identity_ticket_resolved === true,
      native_http_function: request.native_http_function === true,
      error: request.error ?? null,
      timed_out: request.timed_out === true,
      cleanup: request.cleanup,
      result: request
    }
    if (!report.checks.wx_request.passed) {
      throw new Error(requestFailureMessage(request, WX_REQUEST_TIMEOUT_MS))
    }
    await withPreflightDeadline({
      report,
      step: 'disconnect',
      timeoutMs: disconnectTimeoutMs,
      action: () => miniProgram.disconnect()
    })
    miniProgram = null
    await screenshotCapture({ report, wsEndpoint, screenshotPath, timeoutMs: screenshotTimeoutMs })
    if (!fs.existsSync(screenshotPath)) {
      throw new Error('screenshot worker returned without creating evidence file')
    }
    report.checks.screenshot = {
      passed: true,
      path: screenshotPath,
      capture_mode: 'isolated_worker'
    }
    report.evidence_paths.push(path.relative(repoRoot, screenshotPath))
    captureResult = {
      page_data: report.checks.page_data,
      screenshot: report.checks.screenshot,
      wx_request: report.checks.wx_request
    }
  } catch (error) {
    primaryError = error
  }
  if (miniProgram?.disconnect) {
    try {
      await withPreflightDeadline({
        report,
        step: 'disconnect',
        timeoutMs: disconnectTimeoutMs,
        action: () => miniProgram.disconnect()
      })
    } catch (error) {
      primaryError ??= error
    }
  }
  if (primaryError) {
    throw primaryError
  }
  return captureResult
}

export function isRecoverableRuntimeFailure(error) {
  return (
    /preflight_(?:screenshot|transport)_timeout/i.test(error?.code ?? '') ||
    /automator_page_probe_timeout|automator_current_page_unavailable/i.test(error?.code ?? '') ||
    /screenshot|transport/i.test(error?.message ?? '')
  )
}
