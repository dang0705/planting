#!/usr/bin/env node
'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { formalAutomatorEndpoint } from '../_shared/formal-leaf-harness.mjs'
import { runYellowingQuickFlow } from './yellowing/runner.mjs'
import { normalize } from './yellowing/dom.mjs'
import { isValidPngEvidence } from '../../../../scripts/qa/qa-png-evidence.mjs'
import { resolveQaBackendTarget } from '../../../../scripts/qa/qa-backend-target.mjs'

const DEFAULT_PROJECT = path.join(process.cwd(), 'dist/dev/mp-weixin')
const DEFAULT_MAX_STEPS = 12
const DIAGNOSIS_RUNS = 3
const COLD_THRESHOLD_MS = 1000
const HOT_THRESHOLD_MS = 300
const REQUIRED_NETWORK_ENDPOINTS = Object.freeze([
  '/diagnosis-answer-http/diagnosis/question/start',
  '/diagnosis-answer-http/diagnosis/answer'
])
const QA_RUNTIME_PATH_MARKER = `${path.sep}.planting${path.sep}automator-qa${path.sep}v3${path.sep}runtimes${path.sep}`

function parseArgs(rawArgs) {
  const parsed = {}
  for (let index = 0; index < rawArgs.length; index += 1) {
    const argument = String(rawArgs[index] || '')
    if (!argument.startsWith('--')) {
      continue
    }
    const [key, inlineValue] = argument.slice(2).split('=', 2)
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue
      continue
    }
    const next = rawArgs[index + 1]
    parsed[key] = next && !next.startsWith('--') ? ((index += 1), next) : 'true'
  }
  return parsed
}

function toNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function resolveQaRemoteStartupContract(projectPath, environment = process.env) {
  const normalizedProjectPath = path.resolve(projectPath)
  let backendTarget = null
  let backendTargetError = null
  try {
    backendTarget = resolveQaBackendTarget(environment)
  } catch (error) {
    backendTargetError = {
      code: error.code || 'qa_backend_target_invalid',
      message: error.message
    }
  }
  const projectIsQaRuntime = normalizedProjectPath.includes(QA_RUNTIME_PATH_MARKER)
  const liveRealApiEnabled = String(environment.VITE_QA_LIVE_REAL_API || '').trim() === '1'
  const dispatchExecutionBound = Boolean(String(environment.DISPATCH_QA_EXECUTION_ID || '').trim())
  let runtimeProof = null
  try {
    runtimeProof = JSON.parse(String(environment.QA_AUTOMATOR_RUNTIME_PROOF || ''))
  } catch {
    runtimeProof = null
  }
  const runtimeIdentityVerified =
    runtimeProof?.project_identity_verified === true &&
    runtimeProof?.control_port_verified === true &&
    Number(runtimeProof?.automator_port) === 9421 &&
    Number(runtimeProof?.control_port) === 9422
  return {
    passed:
      backendTarget?.mode === 'online' &&
      projectIsQaRuntime &&
      liveRealApiEnabled &&
      dispatchExecutionBound &&
      runtimeIdentityVerified,
    backend_mode: backendTarget?.mode || 'invalid',
    backend_url: backendTarget?.baseUrl || 'invalid',
    backend_environment_id: backendTarget?.environmentId || null,
    backend_target_error: backendTargetError,
    project_path: normalizedProjectPath,
    project_is_qa_runtime: projectIsQaRuntime,
    live_real_api_enabled: liveRealApiEnabled,
    dispatch_execution_bound: dispatchExecutionBound,
    runtime_identity_verified: runtimeIdentityVerified
  }
}

function requestPath(request = {}) {
  const rawUrl = String(request?.url || '').trim()
  let rawPath = rawUrl
  try {
    rawPath = new URL(rawUrl, 'https://qa-request.invalid').pathname
  } catch {
    rawPath = rawUrl.split('?')[0]
  }
  rawPath = String(rawPath || '')
    .split('?')[0]
    .trim()
  if (!rawPath) {
    return ''
  }
  return `/${rawPath.replace(/^\/+/, '')}`
}

function responseBody(request = {}) {
  return request?.response?.data && typeof request.response.data === 'object'
    ? request.response.data
    : null
}

function requestSummary(request = null) {
  const body = responseBody(request) || {}
  const data = body?.data && typeof body.data === 'object' ? body.data : {}
  const finalResult =
    data?.finalResult && typeof data.finalResult === 'object' ? data.finalResult : {}
  return {
    path: requestPath(request),
    method: String(request?.method || ''),
    transport: String(request?.transport || ''),
    requestUrl: String(request?.url || ''),
    statusCode: Number(request?.response?.statusCode || 0),
    responseCode: Number(body?.code || 0),
    responseDataType: Array.isArray(request?.response?.data)
      ? 'array'
      : request?.response?.data === null
        ? 'null'
        : typeof request?.response?.data,
    elapsed_ms: Number.isFinite(Number(request?.elapsed_ms)) ? Number(request.elapsed_ms) : null,
    responseBytes: JSON.stringify(body || '').length,
    stage: String(data?.stage || ''),
    status: String(data?.status || ''),
    questionRequired: data?.questionRequired === true,
    hasActiveQuestions: data?.hasActiveQuestions === true,
    questionCount: Array.isArray(data?.questions) ? data.questions.length : 0,
    sessionIdPresent: Boolean(String(data?.diagnosisSessionId || '').trim()),
    outcomeType: String(data?.outcomeType || finalResult?.outcomeType || ''),
    resultId: String(data?.resultId || finalResult?.resultId || ''),
    visibleOutcomeCount: Array.isArray(data?.visibleOutcomes) ? data.visibleOutcomes.length : 0
  }
}

function collectEndpointRequests(requests = [], fragment) {
  return requests.filter(request => requestPath(request).includes(fragment)).map(requestSummary)
}

function summarizeLatency(requests = []) {
  const values = requests
    .map(request => Number(request?.elapsed_ms))
    .filter(value => Number.isFinite(value))
    .sort((left, right) => left - right)
  if (!values.length) {
    return { count: 0, min: null, p50: null, p95: null, max: null }
  }
  const percentile = ratio =>
    values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)]
  return {
    count: values.length,
    min: values[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: values.at(-1)
  }
}

function hasSuccessfulStart(request) {
  return Boolean(
    request &&
    request.statusCode === 200 &&
    request.responseCode === 200 &&
    request.questionCount > 0 &&
    request.sessionIdPresent
  )
}

function hasSuccessfulFinalAnswer(request) {
  return Boolean(
    request &&
    request.statusCode === 200 &&
    request.responseCode === 200 &&
    request.questionRequired === false &&
    request.hasActiveQuestions === false &&
    (request.outcomeType || request.resultId || request.visibleOutcomeCount > 0)
  )
}

function buildRound(result, round) {
  const requests = Array.isArray(result?.capturedRequests) ? result.capturedRequests : []
  const startRequests = collectEndpointRequests(
    requests,
    '/diagnosis-answer-http/diagnosis/question/start'
  )
  const answerRequests = collectEndpointRequests(
    requests,
    '/diagnosis-answer-http/diagnosis/answer'
  )
  const finalScreenshot = [...(result?.shots || [])].at(-1) || ''
  return {
    round,
    request_kind: round === 1 ? 'cold' : 'hot',
    start: startRequests,
    answer: answerRequests,
    start_latency: summarizeLatency(startRequests),
    answer_latency: summarizeLatency(answerRequests),
    completed:
      startRequests.some(hasSuccessfulStart) &&
      hasSuccessfulFinalAnswer(answerRequests.at(-1) || null),
    final_screenshot: finalScreenshot,
    screenshot_valid_png: Boolean(finalScreenshot) && isValidPngEvidence(finalScreenshot)
  }
}

function assessRoundLatency(round, thresholdMs) {
  const requests = [...round.start, ...round.answer]
  const failures = requests
    .filter(
      request =>
        !Number.isFinite(Number(request?.elapsed_ms)) || Number(request.elapsed_ms) >= thresholdMs
    )
    .map(request => ({ path: request.path, elapsed_ms: request.elapsed_ms }))
  return {
    threshold_ms: thresholdMs,
    passed: round.completed && requests.length >= 2 && failures.length === 0,
    failures
  }
}

function buildReport(
  results,
  { wsEndpoint, projectPath, profile, maxSteps, startupContract = null } = {}
) {
  const runResults = (Array.isArray(results) ? results : [results]).filter(Boolean)
  const result = runResults[0] || null
  const rounds = runResults.map((item, index) => buildRound(item, index + 1))
  const coldRound = rounds[0] || buildRound(null, 1)
  const hotRounds = rounds.slice(1)
  const coldLatency = assessRoundLatency(coldRound, COLD_THRESHOLD_MS)
  const hotLatency = hotRounds.map(round => assessRoundLatency(round, HOT_THRESHOLD_MS))
  const hotLatencyPassed =
    hotRounds.length === DIAGNOSIS_RUNS - 1 && hotLatency.every(item => item.passed)
  const logs = Array.isArray(result?.logs) ? result.logs : []
  const requests = Array.isArray(result?.capturedRequests) ? result.capturedRequests : []
  const startRequests = collectEndpointRequests(
    requests,
    '/diagnosis-answer-http/diagnosis/question/start'
  )
  const answerRequests = collectEndpointRequests(
    requests,
    '/diagnosis-answer-http/diagnosis/answer'
  )
  const launch = logs.find(item => item.type === 'state' && item.label === 'launch')
  const diagnosisEntry = logs.find(
    item => item.type === 'state' && item.label === 'diagnosis-entry-opened'
  )
  const yellowing = logs.find(item => item.type === 'state' && item.label === 'after-yellowing')
  const lastButton = logs.find(
    item => item.type === 'state' && item.label === 'air-environment-last-button-ready'
  )
  const lastButtonClicked = logs.find(
    item => item.type === 'state' && item.label === 'air-environment-last-button-clicked'
  )
  const packagePathObserved = logs.some(item =>
    String(item?.path || '').includes('subpackages/diagnosis/question-package')
  )
  const observedEndpointPaths = [
    ...new Set([...startRequests, ...answerRequests].map(request => request.path))
  ]
  const requiredEndpointsObserved = REQUIRED_NETWORK_ENDPOINTS.every(endpoint =>
    observedEndpointPaths.some(path => path.endsWith(endpoint))
  )
  const readableTransportFailures = [...startRequests, ...answerRequests]
    .filter(
      request =>
        !['uni.request', 'wx.request'].includes(request.transport) ||
        !request.requestUrl.startsWith('https://')
    )
    .map(request => ({
      path: request.path,
      transport: request.transport,
      requestUrl: request.requestUrl
    }))

  const assertions = [
    {
      name: '使用 QA 独立运行时和远端 HTTPS 后端',
      passed: startupContract?.passed === true,
      detail: startupContract || '缺少 QA 远端启动合同'
    },
    {
      name: '从真实首页启动',
      passed: String(launch?.path || '').includes('pages/index/index'),
      detail: launch?.path || '缺少首页启动记录'
    },
    {
      name: '进入诊断分包真实流程',
      passed: Boolean(diagnosisEntry) && diagnosisEntry.entrySource === 'diagnose_tab',
      detail: diagnosisEntry?.path || '缺少 diagnosis-flow 入口记录'
    },
    {
      name: '进入真实题包页面',
      passed: packagePathObserved || String(yellowing?.path || '').includes('question-package'),
      detail: yellowing?.path || '未观察到 subpackages/diagnosis/question-package'
    },
    {
      name: '点击最后一个固定底部按钮',
      passed:
        lastButtonClicked?.buttonText === '不确定，跳过这项' &&
        lastButton?.found === true &&
        lastButton?.disabled === false,
      detail: {
        last_button: lastButtonClicked || null,
        fixed_completion_button: lastButton || null
      }
    },
    {
      name: '题包真实 question/start 返回完整题包',
      passed: startRequests.some(hasSuccessfulStart),
      detail: startRequests
    },
    {
      name: '题包真实 answer 返回最终结果',
      passed: hasSuccessfulFinalAnswer(answerRequests.at(-1) || null),
      detail: answerRequests.at(-1) || '未捕获 diagnosis/answer'
    },
    {
      name: '题包性能验收端点路径完整',
      passed: requiredEndpointsObserved,
      detail: {
        required: REQUIRED_NETWORK_ENDPOINTS,
        observed: observedEndpointPaths
      }
    },
    {
      name: '题包 start/answer 使用可读 HTTPS 响应通道',
      passed:
        startRequests.length > 0 &&
        answerRequests.length > 0 &&
        readableTransportFailures.length === 0 &&
        [...startRequests, ...answerRequests].every(
          request => request.responseDataType === 'object'
        ),
      detail: {
        failures: readableTransportFailures,
        observed: [...startRequests, ...answerRequests].map(request => ({
          path: request.path,
          transport: request.transport,
          requestUrl: request.requestUrl,
          responseDataType: request.responseDataType
        }))
      }
    },
    {
      name: '最后按钮点击后触发 answer',
      passed: logs.some(item => item.type === 'answer') && answerRequests.length > 0,
      detail: { answer_request_count: answerRequests.length }
    },
    {
      name: '第 1 轮真实题包请求符合冷启动小于 1 秒',
      passed: coldLatency.passed,
      detail: { round: coldRound.round, ...coldLatency }
    },
    {
      name: '第 2 至第 3 轮真实题包请求均符合热请求小于 300ms',
      passed: hotLatencyPassed,
      detail: hotLatency.map((item, index) => ({ round: index + 2, ...item }))
    },
    {
      name: '每轮最终截图为有效 PNG',
      passed: rounds.length === DIAGNOSIS_RUNS && rounds.every(round => round.screenshot_valid_png),
      detail: rounds.map(round => ({
        round: round.round,
        screenshot: round.final_screenshot || null,
        valid_png: round.screenshot_valid_png
      }))
    }
  ]
  const passed = assertions.every(assertion => assertion.passed)
  return {
    status: passed ? 'passed' : 'failed',
    classification: passed ? 'PASS_UI_FLOW_DIAGNOSTIC_LATENCY' : 'FAIL_PRODUCT',
    data_mode: 'automator_live_real_api',
    request_contract:
      '题包真实 UI 流程 -> 小程序运行时 wx.request；每轮从发起到回调的 elapsed_ms 为性能判定。',
    performance_acceptance: {
      status:
        coldLatency.passed && hotLatencyPassed
          ? 'passed_wx_request_pending_devtools_network_screenshot'
          : 'failed_wx_request_latency',
      cold_threshold_ms: COLD_THRESHOLD_MS,
      hot_threshold_ms: HOT_THRESHOLD_MS,
      required_evidence:
        '同一 QA 运行时的 DevTools Network 截图，分别显示 question/start 和 answer 的真实 Time。'
    },
    rounds,
    ui: {
      entry_path: launch?.path || null,
      diagnosis_path: diagnosisEntry?.path || null,
      question_package_path_observed: packagePathObserved,
      final_button: lastButton || null,
      final_screenshot: coldRound.final_screenshot,
      screenshot_valid_png: coldRound.screenshot_valid_png
    },
    requests: {
      question_start: rounds.flatMap(round => round.start),
      answer: rounds.flatMap(round => round.answer),
      question_start_latency: summarizeLatency(rounds.flatMap(round => round.start)),
      answer_latency: summarizeLatency(rounds.flatMap(round => round.answer))
    },
    assertions,
    evidence: {
      tool: 'miniprogram-automator',
      ws_endpoint: wsEndpoint,
      project_path: projectPath,
      profile,
      max_steps: maxSteps,
      startup_contract: startupContract,
      entry_source: diagnosisEntry?.entrySource || null,
      report_dirs: runResults.map(item => item.reportDir || null),
      screenshots: runResults.flatMap(item => item.shots || []),
      screenshot_attempts: runResults.flatMap(item => item.screenshotAttempts || [])
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const wsEndpoint = formalAutomatorEndpoint(process.env)
  const projectPath = path.resolve(args.project || process.env.MP_PROJECT_PATH || DEFAULT_PROJECT)
  const profile = normalize(args.profile || 'overwatering') || 'overwatering'
  const maxSteps = toNumber(args.maxSteps || args['max-steps'], DEFAULT_MAX_STEPS)
  const startupContract = resolveQaRemoteStartupContract(projectPath)
  const backendTarget = resolveQaBackendTarget(process.env)
  if (!fs.existsSync(projectPath)) {
    throw new Error(`项目路径不存在: ${projectPath}`)
  }
  if (!startupContract.passed) {
    throw new Error(`正式诊断 QA 启动合同不满足远端要求：${JSON.stringify(startupContract)}`)
  }

  const results = []
  let report
  try {
    for (let round = 1; round <= DIAGNOSIS_RUNS; round += 1) {
      try {
        const result = await runYellowingQuickFlow({
          wsEndpoint,
          projectPath,
          maxSteps,
          profile,
          entrySource: 'diagnose_tab',
          authProbeBaseUrl: backendTarget.baseUrl
        })
        results.push(result)
      } catch (error) {
        if (error?.partialResult) {
          results.push(error.partialResult)
        }
        throw error
      }
    }
    report = buildReport(results, { wsEndpoint, projectPath, profile, maxSteps, startupContract })
  } catch (error) {
    report = buildReport(results, { wsEndpoint, projectPath, profile, maxSteps, startupContract })
    report.status = 'failed'
    report.classification = 'BLOCKED_ENV'
    report.assertions.push({
      name: '真实题包性能流程完成',
      passed: false,
      detail: error?.message || String(error)
    })
  }

  const reportDir =
    results.at(-1)?.reportDir ||
    path.resolve(process.env.E2E_ARTIFACT_DIR || '.tmp/e2e/diagnosis/diagnosis-answer-performance')
  await fs.promises.mkdir(reportDir, { recursive: true })
  const reportPath = path.join(reportDir, 'diagnosis-answer-performance-report.json')
  await fs.promises.writeFile(
    reportPath,
    JSON.stringify(
      {
        ...report,
        runs: results.map((result, index) => ({
          round: index + 1,
          logs: result?.logs || [],
          screenshots: result?.shots || [],
          capturedRequests: result?.capturedRequests || []
        }))
      },
      null,
      2
    ),
    'utf8'
  )
  console.log(JSON.stringify({ ...report, report_path: reportPath }, null, 2))
  if (report.status !== 'passed') {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(
    JSON.stringify(
      {
        status: 'blocked',
        classification: 'BLOCKED_ENV',
        data_mode: 'automator_live_real_api',
        message: String(error?.message || error)
      },
      null,
      2
    )
  )
  process.exitCode = 1
})
