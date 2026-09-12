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
import {
  labelTemperatureEvidence,
  meetsExploratorySampleTarget,
  readColdStartEvidenceAfterHandoff
} from './_shared/remote-read-temperature-evidence.mjs'
import {
  evaluateAbsolutePerformance,
  endpointLatencyStats
} from './_shared/remote-read-performance-metrics.mjs'

function readPositiveSampleCount(name, fallback) {
  const value = Number(process.env[name] || fallback)
  return Number.isInteger(value) && value > 0 && value <= 100 ? value : fallback
}

function readNonNegativeDuration(name, fallback) {
  const raw = String(process.env[name] || '').trim()
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 && value <= 15 * 60 * 1000 ? value : fallback
}

const COLD_CANDIDATE_SAMPLE_COUNT = 5
const HOT_CANDIDATE_SAMPLE_COUNT = 10
const FORMAL_COLD_SAMPLE_COUNT = 20
const FORMAL_HOT_SAMPLE_COUNT = 30
const COLD_P95_MAX_MS = 1000
const HOT_P95_MAX_MS = 300
// 默认只做探索采样；正式验收需显式传入 20/30，避免把一次较小的探索结果
// 误报为满足端上硬指标。
const coldSampleCount = readPositiveSampleCount(
  'QA_REMOTE_READ_COLD_SAMPLES',
  COLD_CANDIDATE_SAMPLE_COUNT
)
const hotSampleCount = readPositiveSampleCount(
  'QA_REMOTE_READ_HOT_SAMPLES',
  HOT_CANDIDATE_SAMPLE_COUNT
)
const SAMPLE_STAGE =
  String(process.env.QA_REMOTE_READ_STAGE || 'exploration').trim() || 'exploration'
// 只对冷候选阶段生效。设置为 360000 时，每个冷候选轮次前等待 6 分钟，
// 给 CloudBase 函数容器完成生命周期回收的机会；热样本阶段不等待。
const COLD_ROUND_INTERVAL_MS = readNonNegativeDuration('QA_REMOTE_READ_COLD_INTERVAL_MS', 0)
const REQUEST_TIMEOUT_MS = 20_000
const QA_RUNTIME_PATH_MARKER = `${path.sep}.planting${path.sep}automator-qa${path.sep}v3${path.sep}`

class EnvironmentBlockedError extends Error {}
class ProductAssertionError extends Error {}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseBody(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function summarizeResponse(body, endpoint) {
  const payload = parseBody(body)
  const data = parseBody(payload?.data)
  const user = endpoint === 'auth-user' ? data : null
  const list = endpoint === 'user-plants' && Array.isArray(data?.list) ? data.list : null
  return {
    code: Number(payload?.code || 0),
    has_data: Boolean(data),
    has_user: Boolean(user),
    has_identity_ticket: Boolean(String(user?.httpIdentityTicket || '').trim()),
    user_id_present: Boolean(String(user?._id || '').trim()),
    list_count: list ? list.length : null,
    total: list ? Number(data.total || 0) : null,
    first_item_fields: list?.[0] ? Object.keys(list[0]).sort() : [],
    response_bytes: JSON.stringify(payload || '').length
  }
}

function matchesEndpoint(request, endpoint) {
  if (!request?.url || String(request.method || '').toUpperCase() !== endpoint.method) {
    return false
  }
  try {
    const actual = new URL(request.url)
    const expected = new URL(endpoint.url)
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) {
      return false
    }
    if (endpoint.name === 'user-plants') {
      return actual.searchParams.get('page') === '1' && actual.searchParams.get('pageSize') === '50'
    }
    return true
  } catch {
    return request.url === endpoint.url
  }
}

function summarizeCapturedRequest(request, endpoint, sample) {
  return {
    endpoint: endpoint.name,
    sample,
    probe_id: request.probe_id || null,
    transport: request.transport || null,
    url: request.url || null,
    method: request.method || null,
    status_code: Number(request.response?.statusCode || 0),
    elapsed_ms: Number.isFinite(Number(request.elapsed_ms)) ? Number(request.elapsed_ms) : null,
    cloudbase_request_id:
      request.response?.header?.['x-cloudbase-request-id'] ||
      request.response?.header?.['X-CloudBase-Request-Id'] ||
      request.response?.header?.['x-request-id'] ||
      request.response?.header?.['X-Request-Id'] ||
      null,
    response: summarizeResponse(request.response?.data, endpoint.name),
    error: request.error || null
  }
}

async function waitForHomeRequests(mp, endpoints) {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS
  while (Date.now() < deadline) {
    const captured = await readCapturedRequests(mp)
    const results = endpoints.map(endpoint => {
      const request = captured.find(item => matchesEndpoint(item, endpoint))
      return request ? summarizeCapturedRequest(request, endpoint, '') : null
    })
    if (results.every(Boolean)) {
      return results
    }
    await sleep(100)
  }
  const captured = await readCapturedRequests(mp)
  throw new EnvironmentBlockedError(
    `首页真实请求未在 ${REQUEST_TIMEOUT_MS}ms 内完成：${JSON.stringify(
      captured.map(item => ({
        transport: item.transport,
        method: item.method,
        url: item.url,
        elapsed_ms: item.elapsed_ms,
        status_code: item.response?.statusCode || null,
        error: item.error || null
      }))
    )}`
  )
}

async function forceReLaunchTo(mp, pagePath) {
  const routeOperation =
    typeof mp.callWxMethod === 'function'
      ? () => mp.callWxMethod('reLaunch', { url: pagePath })
      : () => mp.reLaunch(pagePath)
  await routeOperation()
  const deadline = Date.now() + REQUEST_TIMEOUT_MS
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const probe = await getCurrentPageWithFallback(mp, {
        timeoutMs: Math.min(3_000, Math.max(1, deadline - Date.now())),
        perRpcTimeoutMs: 1_500
      })
      const actualPath = String(probe.page?.path || '').replace(/^\/+/, '')
      const expectedPath = String(pagePath || '').replace(/^\/+/, '')
      if (actualPath === expectedPath) {
        return probe.page
      }
    } catch (error) {
      lastError = error
    }
    await sleep(100)
  }
  throw new EnvironmentBlockedError(
    `页面未能进入 ${pagePath}: ${lastError?.message || 'unknown page transition error'}`
  )
}

async function runHomeRequestRound(mp, endpoints, sample) {
  // 先离开首页，再回到首页，确保由首页 onMounted 真实触发 user 和
  // user-plants；不能通过 mp.evaluate 手工调用接口替代页面链路。
  await forceReLaunchTo(mp, '/pages/profile/profile')
  await clearCapturedRequests(mp)
  await forceReLaunchTo(mp, '/pages/index/index')
  const results = await waitForHomeRequests(mp, endpoints)
  return results.map(result => ({ ...result, sample }))
}

function assertSuccessfulResponse(report, result, label) {
  const passed = result.status_code === 200 && result.response.code === 200 && !result.error
  recordAssertion(report, label, passed, passed ? null : result)
  return passed
}

function assertUserPlantsHaveRows(report, result) {
  const passed =
    result.endpoint !== 'user-plants' ||
    (Number(result.response.list_count) > 0 && Number(result.response.total) > 0)
  recordAssertion(
    report,
    'user-plants 返回当前真实用户的植物列表',
    passed,
    passed
      ? null
      : {
          endpoint: result.endpoint,
          list_count: result.response.list_count,
          total: result.response.total,
          response_bytes: result.response.response_bytes
        }
  )
  return passed
}

async function readCurrentPage(mp, report) {
  const probe = await getCurrentPageWithFallback(mp, {
    timeoutMs: 5000,
    perRpcTimeoutMs: 2000
  })
  const page = probe.page
  recordPage(report, page?.path || '')
  const data = (await page?.data?.()) || {}
  recordPageData(report, page?.path || '', {
    route: page?.path || '',
    keys: Object.keys(data).sort()
  })
  return page
}

async function runLeaf() {
  const env = resolveEnv(process.argv.slice(2))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'user.remote_read.performance',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null
  let requestCaptureInstalled = false
  try {
    if (!preflightProject(env.projectPath).ok) {
      throw new EnvironmentBlockedError('QA 小程序编译产物不可用')
    }
    const target = resolveQaBackendTarget(process.env)
    if (
      target.mode !== 'online' ||
      !env.projectPath.includes(QA_RUNTIME_PATH_MARKER) ||
      String(process.env.VITE_QA_LIVE_REAL_API || '').trim() !== '1' ||
      !String(process.env.DISPATCH_QA_EXECUTION_ID || '').trim()
    ) {
      throw new EnvironmentBlockedError('未绑定远端 QA 隔离运行时或 live real API 闸门')
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
    const page = await readCurrentPage(mp, report)
    const authUrl = `${target.baseUrl}/auth-user-http/auth/user`
    const plantsUrl = `${target.baseUrl}/plant-user-http/user-plants?page=1&pageSize=50`
    const endpoints = [
      {
        name: 'auth-user',
        url: authUrl,
        method: 'POST'
      },
      { name: 'user-plants', url: plantsUrl, method: 'GET' }
    ]
    const allRequests = []
    const failedChecks = []
    const candidateSampleCount = coldSampleCount + hotSampleCount
    for (let index = 1; index <= candidateSampleCount; index += 1) {
      const coldPhase = index <= coldSampleCount
      if (coldPhase && COLD_ROUND_INTERVAL_MS > 0) {
        await sleep(COLD_ROUND_INTERVAL_MS)
      }
      const round = await runHomeRequestRound(mp, endpoints, `${SAMPLE_STAGE}_${index}`)
      for (const request of round) {
        allRequests.push(request)
        recordRequests(report, [request])
        if (
          !assertSuccessfulResponse(
            report,
            request,
            `${request.endpoint} 候选请求 ${index} 返回成功`
          )
        ) {
          failedChecks.push(`${request.endpoint} 候选请求 ${index} 失败`)
        }
        if (!assertUserPlantsHaveRows(report, request)) {
          failedChecks.push(`${request.endpoint} 候选请求 ${index} 未返回真实用户植物列表`)
        }
      }
    }

    if (!page) {
      throw new EnvironmentBlockedError('当前 QA 页面不可读取，不能形成端上证据')
    }
    const screenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'remote-read-performance',
      env.wsEndpoint,
      { expectedRoute: page.path || '', report }
    )
    if (!screenshot) {
      throw new EnvironmentBlockedError('远端接口性能证据截图无效')
    }
    recordScreenshot(report, screenshot)

    if (failedChecks.length) {
      throw new ProductAssertionError(failedChecks.join('；'))
    }
    const plantRequests = allRequests.filter(item => item.endpoint === 'user-plants')
    const plantData = plantRequests[0]?.response || {}
    recordAssertion(
      report,
      'user-plants 返回真实用户植物列表合同',
      plantData.has_data === true &&
        Number.isInteger(plantData.list_count) &&
        plantData.list_count >= 0 &&
        Number.isFinite(plantData.total) &&
        Array.isArray(plantData.first_item_fields),
      plantData
    )
    if (!report.assertions.at(-1)?.passed) {
      throw new ProductAssertionError('user-plants 未满足真实用户植物列表合同')
    }
    const expectedUrlByEndpoint = {
      'auth-user': authUrl,
      'user-plants': plantsUrl
    }
    const canonicalTargetPassed =
      target.mode === 'online' &&
      target.environmentId === 'cloud1-2grufevs395a9d5e' &&
      target.source === 'supervisor_fixed_online_public_http' &&
      allRequests.every(item =>
        matchesEndpoint(
          item,
          endpoints.find(endpoint => endpoint.name === item.endpoint) || {
            name: item.endpoint,
            url: expectedUrlByEndpoint[item.endpoint],
            method: item.method
          }
        )
      )
    recordAssertion(
      report,
      '远端 QA 性能请求使用 canonical public HTTPS 目标',
      canonicalTargetPassed,
      {
        target_source: target.source,
        environment_id: target.environmentId,
        base_url: target.baseUrl
      }
    )
    if (!canonicalTargetPassed) {
      throw new ProductAssertionError('远端 QA 未命中 canonical public HTTPS 目标')
    }
    markBusinessAssertionsReached(report)
    report.sampling_config = {
      cold_samples_requested: coldSampleCount,
      hot_samples_requested: hotSampleCount,
      cold_round_interval_ms: COLD_ROUND_INTERVAL_MS,
      interval_applies_to: 'cold_candidate_rounds_only'
    }
    report.performance_stats = {
      endpoints: endpointLatencyStats(allRequests),
      measurement: '真实小程序 wx.request 发起到 success/fail 回调 elapsed_ms',
      evidence_class: 'automator_live_real_api'
    }
    report.cold_start_evidence = await readColdStartEvidenceAfterHandoff(allRequests)
    if (report.cold_start_evidence.status !== 'verified') {
      throw new EnvironmentBlockedError(
        report.cold_start_evidence.reason || 'CloudBase 冷启动证据未验证'
      )
    }
    report.performance_temperature_counts = labelTemperatureEvidence(
      allRequests,
      report.cold_start_evidence
    )
    report.performance_stats.endpoints = endpointLatencyStats(allRequests)
    const exploratorySamplesComplete = meetsExploratorySampleTarget(
      report.performance_temperature_counts,
      coldSampleCount,
      hotSampleCount
    )
    recordAssertion(
      report,
      `采样已按 CloudBase 日志关联为每接口 ${coldSampleCount} 次冷候选和 ${hotSampleCount} 次热请求`,
      exploratorySamplesComplete,
      report.performance_temperature_counts
    )
    if (!exploratorySamplesComplete) {
      throw new EnvironmentBlockedError('冷/热样本未达到本轮探索采样数量，不能形成端上性能结论')
    }
    const formalSampleRun =
      coldSampleCount >= FORMAL_COLD_SAMPLE_COUNT && hotSampleCount >= FORMAL_HOT_SAMPLE_COUNT
    if (formalSampleRun) {
      report.performance_assessment = evaluateAbsolutePerformance({
        report,
        coldSamples: FORMAL_COLD_SAMPLE_COUNT,
        hotSamples: FORMAL_HOT_SAMPLE_COUNT,
        coldThresholdMs: COLD_P95_MAX_MS,
        hotThresholdMs: HOT_P95_MAX_MS
      })
      report.performance_verdict = {
        stage: 'formal_absolute_threshold',
        status: report.performance_assessment.status,
        reason:
          report.performance_assessment.status === 'PASS'
            ? '两个目标接口均满足冷请求 p95 ≤ 1000ms、热请求 p95 ≤ 300ms'
            : '未同时满足冷请求 p95 ≤ 1000ms、热请求 p95 ≤ 300ms 或样本数量门槛',
        assessment: report.performance_assessment
      }
      if (report.performance_assessment.status !== 'PASS') {
        throw new ProductAssertionError('候选版本未达到正式性能门槛')
      }
      setClassification(report, 'PASS')
      return
    }
    report.performance_verdict = {
      stage:
        coldSampleCount >= FORMAL_COLD_SAMPLE_COUNT && hotSampleCount >= FORMAL_HOT_SAMPLE_COUNT
          ? `formal_${SAMPLE_STAGE}_sample`
          : 'exploratory_only',
      status: 'not_eligible_for_performance_pass',
      reason: '本轮确认冷/热样本不足；达到正式样本量后直接按端上绝对硬指标判定，不要求历史基线',
      sampling_plan: {
        stage: SAMPLE_STAGE,
        cold_samples_per_endpoint: coldSampleCount,
        hot_samples_per_endpoint: hotSampleCount
      },
      required_formal_sampling: {
        cold_samples_per_endpoint: FORMAL_COLD_SAMPLE_COUNT,
        hot_samples_per_endpoint: FORMAL_HOT_SAMPLE_COUNT,
        cold_p95_max_ms: COLD_P95_MAX_MS,
        hot_p95_max_ms: HOT_P95_MAX_MS,
        measurement: '真实小程序 wx.request 发起到 success/fail 回调 elapsed_ms'
      }
    }
    throw new EnvironmentBlockedError(
      '探索采样不构成性能验收；需要足量确认冷/热样本直接判定端上硬指标'
    )
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
    const reportPath = saveReport(report, env.artifactDir, `remote-read-performance-${Date.now()}`)
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
