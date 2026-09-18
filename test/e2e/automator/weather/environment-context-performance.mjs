#!/usr/bin/env node
'use strict'

/* oxlint-disable no-console -- catalog leaf emits a machine-readable terminal report. */

import path from 'node:path'
import {
  resolveEnv,
  resolveGitBranch,
  resolveGitHead,
  resolvePrBaseHead
} from '../care/watering/transpiration-v3/_shared/lib/env.mjs'
import {
  AutomatorConnectError,
  connectAutomator,
  safeDisconnect
} from '../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  clearCapturedRequests,
  installRequestCapture,
  readCapturedRequests,
  restoreRequest
} from '../care/watering/transpiration-v3/_shared/lib/request-capture.mjs'
import {
  createReport,
  emitLeafReport,
  markBusinessAssertionsReached,
  recordAssertion,
  recordPage,
  recordPageData,
  recordRequests,
  recordScreenshot,
  saveReport,
  setClassification
} from '../care/watering/transpiration-v3/_shared/lib/reporter.mjs'
import { preflightProject } from '../care/watering/transpiration-v3/_shared/lib/project-check.mjs'
import { getCurrentPageWithFallback } from '../_shared/page-probe.mjs'
import { safeScreenshot } from '../care/watering/transpiration-v3/_shared/lib/screenshot.mjs'
import { resolveQaBackendTarget } from '../../../../scripts/qa/qa-backend-target.mjs'

const COLD_THRESHOLD_MS = 1000
const HOT_THRESHOLD_MS = 300
const HOT_SAMPLE_COUNT = 5
const REQUEST_TIMEOUT_MS = 20_000
const QA_RUNTIME_PATH_MARKER = `${path.sep}.planting${path.sep}automator-qa${path.sep}v3${path.sep}`

class EnvironmentBlockedError extends Error {}
class ProductAssertionError extends Error {}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function localDateInShanghai() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function parsePayload(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function summarizeResponse(payload) {
  const body = parsePayload(payload)
  const data = parsePayload(body?.data)
  const historicalDays = Array.isArray(data?.historicalDays)
    ? data.historicalDays
    : Array.isArray(data?.historical_days)
      ? data.historical_days
      : []
  const forecastDays = Array.isArray(data?.forecastDays)
    ? data.forecastDays
    : Array.isArray(data?.forecast_days)
      ? data.forecast_days
      : []
  return {
    code: Number(body?.code || 0),
    has_data: Boolean(data),
    historical_days: historicalDays.length,
    forecast_days: forecastDays.length,
    current_weather_present: Boolean(data?.currentWeather || data?.current_weather),
    today_weather_source: data?.todayWeatherSource || data?.today_weather_source || null,
    weather_evidence_insufficient: data?.weatherEvidenceInsufficient === true,
    response_bytes: JSON.stringify(body || '').length
  }
}

function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) {
    return null
  }
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  return sorted[index]
}

function latencyStats(samples) {
  const values = samples.map(sample => Number(sample.elapsed_ms)).filter(Number.isFinite)
  return {
    sample_count: values.length,
    min_ms: values.length ? Math.min(...values) : null,
    p50_ms: percentile(values, 0.5),
    p95_ms: percentile(values, 0.95),
    max_ms: values.length ? Math.max(...values) : null
  }
}

function matchesWeatherRequest(request) {
  return String(request?.url || '').includes('weather-http/weather/environment-context')
}

async function requestEnvironmentContext(mp, { url, payload, slot }) {
  await mp.evaluate(
    function (requestSlot, requestUrl, requestPayload) {
      globalThis[requestSlot] = { state: 'pending' }
      const finish = function (value) {
        globalThis[requestSlot] = {
          state: 'completed',
          statusCode: value?.statusCode ?? null,
          responseCode: value?.responseCode ?? null,
          data: value?.data ?? null,
          error: value?.error ? String(value.error) : null
        }
      }
      if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
        finish({ error: 'wx.cloud.callFunction unavailable' })
        return { started: false }
      }
      try {
        wx.cloud.callFunction({
          name: 'wechat-identity',
          data: {},
          success: function (identityResult) {
            const identity = identityResult?.result
            const openid = identity?.openid ? String(identity.openid) : ''
            if (!openid) {
              finish({ error: 'wechat identity unavailable' })
              return
            }
            try {
              wx.request({
                url: requestUrl,
                method: 'POST',
                data: requestPayload,
                header: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  'x-wx-openid': openid,
                  'x-openid': openid,
                  'x-app-env': 'development',
                  'x-env': 'development',
                  'Cache-Control': 'no-cache, no-transform'
                },
                success: function (response) {
                  finish({
                    statusCode: response?.statusCode,
                    responseCode: response?.data?.code,
                    data: response?.data
                  })
                },
                fail: function (error) {
                  finish({ error: error?.errMsg || String(error) })
                }
              })
            } catch (error) {
              finish({ error: error?.message || String(error) })
            }
          },
          fail: function (error) {
            finish({ error: error?.errMsg || String(error) })
          }
        })
      } catch (error) {
        finish({ error: error?.message || String(error) })
      }
      return { started: true }
    },
    slot,
    url,
    payload
  )

  const deadline = Date.now() + REQUEST_TIMEOUT_MS
  while (Date.now() < deadline) {
    const result = await mp.evaluate(function (requestSlot) {
      const value = globalThis[requestSlot]
      return value && typeof value === 'object' ? value : null
    }, slot)
    if (result?.state === 'completed') {
      return result
    }
    await sleep(100)
  }
  return { state: 'timeout', error: 'environment-context wx.request timeout' }
}

async function runLeaf() {
  const env = resolveEnv(process.argv.slice(2))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'weather.environment_context.performance',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null
  let requestCaptureInstalled = false
  const samples = []

  try {
    if (!preflightProject(env.projectPath).ok) {
      throw new EnvironmentBlockedError('QA 小程序编译产物不可用')
    }
    const target = resolveQaBackendTarget(process.env, {
      port: 3011,
      functionPortBase: 9100
    })
    if (
      target.mode !== 'lan' ||
      !env.projectPath.includes(QA_RUNTIME_PATH_MARKER) ||
      String(process.env.VITE_QA_LIVE_REAL_API || '').trim() !== '1' ||
      !String(process.env.DISPATCH_QA_EXECUTION_ID || '').trim()
    ) {
      throw new EnvironmentBlockedError('未绑定 QA 隔离 LAN 运行时或 live real API 闸门')
    }

    try {
      mp = await connectAutomator(env.wsEndpoint)
    } catch (error) {
      const reason =
        error instanceof AutomatorConnectError ? error.reason : String(error?.message || error)
      throw new EnvironmentBlockedError(`Automator 连接失败: ${reason}`)
    }

    await installRequestCapture(mp, {
      addProbeId: true,
      probePrefix: `qa-${String(process.env.DISPATCH_QA_EXECUTION_ID || process.pid)}`
    })
    requestCaptureInstalled = true

    const pageProbe = await getCurrentPageWithFallback(mp, {
      timeoutMs: 5000,
      perRpcTimeoutMs: 2000
    })
    const page = pageProbe.page
    if (!page?.path) {
      throw new EnvironmentBlockedError('当前 QA 页面不可读取')
    }
    recordPage(report, page.path)
    const pageData = (await page.data?.()) || {}
    recordPageData(report, page.path, {
      route: page.path,
      keys: Object.keys(pageData).sort()
    })

    const requestUrl = `${target.baseUrl}/weather-http/weather/environment-context`
    const requestPayload = {
      lat: 31.2304,
      lng: 121.4737,
      city: '上海',
      locationKey: 'city:shanghai',
      diagnosisDate: localDateInShanghai(),
      mode: 'environment'
    }
    const totalSamples = HOT_SAMPLE_COUNT + 1
    for (let index = 1; index <= totalSamples; index += 1) {
      await clearCapturedRequests(mp)
      const slot = `__qaEnvironmentContextRequest_${process.pid}_${Date.now()}_${index}`
      const result = await requestEnvironmentContext(mp, {
        url: requestUrl,
        payload: requestPayload,
        slot
      })
      const captured = (await readCapturedRequests(mp)).filter(matchesWeatherRequest)
      const request = captured.at(-1)
      const sample = {
        sample: index === 1 ? 'cold_candidate_1' : `hot_${index - 1}`,
        probe_id: request?.probe_id || null,
        transport: request?.transport || 'wx.request',
        url: request?.url || requestUrl,
        method: request?.method || 'POST',
        status_code: Number(request?.response?.statusCode || result.statusCode || 0),
        elapsed_ms: Number(request?.elapsed_ms),
        response: summarizeResponse(request?.response?.data || result.data),
        error: request?.error || result.error || null
      }
      samples.push(sample)
      recordRequests(report, [sample])
      await mp.evaluate(function (requestSlot) {
        delete globalThis[requestSlot]
        return true
      }, slot)

      const responsePassed =
        sample.status_code === 200 &&
        sample.response.code === 200 &&
        sample.response.has_data &&
        sample.response.historical_days === 10
      recordAssertion(
        report,
        `${sample.sample} 返回 200、业务码 200 且历史天气窗口完整`,
        responsePassed,
        sample
      )
      if (!responsePassed) {
        throw new ProductAssertionError(`${sample.sample} 返回合同不完整`)
      }
    }

    const coldCandidate = samples[0]
    const hotSamples = samples.slice(1)
    const hotStats = latencyStats(hotSamples)
    report.performance_stats = {
      endpoint: 'weather/environment-context',
      cold_candidate: {
        ...latencyStats([coldCandidate]),
        threshold_ms: COLD_THRESHOLD_MS,
        elapsed_ms: coldCandidate.elapsed_ms,
        verified_temperature: false,
        evidence_class: 'automator_live_real_api'
      },
      hot: {
        ...hotStats,
        threshold_ms: HOT_THRESHOLD_MS,
        verified_temperature: false,
        evidence_class: 'automator_live_real_api'
      }
    }
    recordAssertion(
      report,
      '真实小程序 cold candidate 小于 1 秒',
      Number.isFinite(coldCandidate.elapsed_ms) && coldCandidate.elapsed_ms < COLD_THRESHOLD_MS,
      report.performance_stats.cold_candidate
    )
    recordAssertion(
      report,
      '真实小程序 hot p95 小于 300ms',
      Number.isFinite(hotStats.p95_ms) && hotStats.p95_ms < HOT_THRESHOLD_MS,
      report.performance_stats.hot
    )
    recordAssertion(
      report,
      '性能请求使用当前 QA LAN 目标且来自真实 wx.request',
      samples.every(
        sample => sample.transport === 'wx.request' && sample.url === requestUrl && sample.probe_id
      ),
      { target: target, request_url: requestUrl }
    )

    const screenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'environment-context-performance',
      env.wsEndpoint,
      { expectedRoute: page.path, report }
    )
    if (!screenshot) {
      throw new EnvironmentBlockedError('天气接口性能证据截图无效')
    }
    recordScreenshot(report, screenshot)
    markBusinessAssertionsReached(report)

    if (!(coldCandidate.elapsed_ms < COLD_THRESHOLD_MS) || !(hotStats.p95_ms < HOT_THRESHOLD_MS)) {
      throw new ProductAssertionError('environment-context 未达到冷/热请求阈值')
    }
    // 本地 LAN 运行时只能证明真实端上 cold candidate，不能伪造 CloudBase
    // Init Report 把它提升为线上 cold start 结论。
    setClassification(report, 'PASS')
  } catch (error) {
    setClassification(
      report,
      error instanceof ProductAssertionError ? 'FAIL_PRODUCT' : 'BLOCKED_ENV',
      String(error?.message || error)
    )
  } finally {
    if (requestCaptureInstalled) {
      await restoreRequest(mp)
    }
    await safeDisconnect(mp)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `environment-context-performance-${Date.now()}`
    )
    report.report_path = reportPath
    emitLeafReport(report)
    console.error(`[e2e] report: ${reportPath}`)
    if (report.classification !== 'PASS') {
      process.exitCode = 2
    }
  }
}

runLeaf().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 2
})
