#!/usr/bin/env node
'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { formalAutomatorEndpoint } from '../_shared/formal-leaf-harness.mjs'
import { normalize } from './yellowing/dom.mjs'
import { runYellowingQuickFlow } from './yellowing/runner.mjs'
import { isValidPngEvidence } from '../../../../scripts/qa/qa-png-evidence.mjs'
import { resolveQaBackendTarget } from '../../../../scripts/qa/qa-backend-target.mjs'

const DEFAULT_PROJECT = path.join(process.cwd(), 'dist/dev/mp-weixin')
const DEFAULT_MAX_STEPS = 12

function parseArgs(rawArgs) {
  const parsed = {}
  for (let index = 0; index < rawArgs.length; index += 1) {
    const argument = String(rawArgs[index])
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

function extractWeatherWindow(request = {}) {
  const responseData = request?.response?.data
  if (!responseData || typeof responseData !== 'object') {
    return null
  }
  const candidates = [responseData?.data?.data, responseData?.data, responseData]
  return (
    candidates.find(
      value =>
        value &&
        typeof value === 'object' &&
        (Array.isArray(value.historicalDays) || Array.isArray(value.historical_days))
    ) || null
  )
}

function buildLeafReport(result, { wsEndpoint, projectPath, profile, maxSteps } = {}) {
  const logs = Array.isArray(result?.logs) ? result.logs : []
  const launch = logs.find(item => item.type === 'state' && item.label === 'launch')
  const entry = logs.find(item => item.type === 'state' && item.label === 'diagnosis-entry-opened')
  const yellowing = logs.find(item => item.type === 'state' && item.label === 'after-yellowing')
  const answers = logs.filter(item => item.type === 'answer')
  const resultState = logs.find(item => item.type === 'result' && !item.screenshot)
  const resultElements = logs.find(item => item.type === 'result-elements')
  const resultAdviceEvidence = logs.find(item => item.type === 'result-advice-groups')
  const resultAdviceGroups = Array.isArray(resultAdviceEvidence?.groups)
    ? resultAdviceEvidence.groups
    : []
  const actionAdviceGroups = resultAdviceGroups.filter(group => group.section === 'action')
  const avoidAdviceGroups = resultAdviceGroups.filter(group => group.section === 'avoid')
  const uniqueActionAdviceKeys = [...new Set(actionAdviceGroups.map(group => group.key))].sort()
  const uniqueAvoidAdviceKeys = [...new Set(avoidAdviceGroups.map(group => group.key))].sort()
  const resultOutcomeLabels = Array.isArray(resultAdviceEvidence?.outcomeLabels)
    ? resultAdviceEvidence.outcomeLabels
    : []
  const expectedNutrientOutcomeLabels = [
    '缺铁/新叶脉间黄化',
    '缺氮/长期营养不足',
    '营养供给偏弱'
  ]
  const groupedAdviceUsesSymptoms =
    profile === 'nutrient' &&
    actionAdviceGroups.length === 1 &&
    avoidAdviceGroups.length === 1 &&
    expectedNutrientOutcomeLabels.every(label =>
      String(actionAdviceGroups[0]?.text || '').includes(label)
    ) &&
    expectedNutrientOutcomeLabels.every(label =>
      String(avoidAdviceGroups[0]?.text || '').includes(label)
    )
  const finalScreenshot = [...(result?.shots || [])].at(-1) || ''
  const weatherRequests = (
    Array.isArray(result?.capturedRequests) ? result.capturedRequests : []
  ).filter(request =>
    String(request?.url || '').includes('weather-http/weather/environment-context')
  )
  const weatherRequest = weatherRequests.at(-1) || null
  const weatherWindow = extractWeatherWindow(weatherRequest)
  const historicalDays = Array.isArray(weatherWindow?.historicalDays)
    ? weatherWindow.historicalDays
    : Array.isArray(weatherWindow?.historical_days)
      ? weatherWindow.historical_days
      : []
  const usableHistoricalDays = historicalDays.filter(day => {
    if (day?.missing || String(day?.quality || '').trim() === 'missing') {
      return false
    }
    return [day?.tempMaxC, day?.tempMinC, day?.humidity, day?.textDay, day?.text].some(
      value => value !== undefined && value !== null && value !== ''
    )
  })
  const missingHistoricalDays = historicalDays.filter(
    day => day?.missing === true || String(day?.quality || '').trim() === 'missing'
  )
  const classifiedHistoricalDays = [...usableHistoricalDays, ...missingHistoricalDays]
  const unclassifiedHistoricalDays = historicalDays.filter(
    day => !classifiedHistoricalDays.includes(day)
  )
  const historicalDates = historicalDays.map(day => String(day?.date || '').trim()).filter(Boolean)
  const timelineWeather = logs.find(item => item.type === 'timeline-weather')
  const scrollReset = logs.find(item => item.type === 'scroll-reset')
  const timelineNoticeText = String(timelineWeather?.noticeText || '').trim()
  const timelineCells = Array.isArray(timelineWeather?.cells) ? timelineWeather.cells : []
  const renderedHistoricalDays = timelineCells.filter(
    cell =>
      cell.hasWeatherMetrics && historicalDays.some(day => String(day?.date || '') === cell.date)
  )
  const renderedMissingDays = timelineCells.filter(
    cell =>
      cell.hasWeatherMetrics &&
      missingHistoricalDays.some(day => String(day?.date || '') === cell.date)
  )
  const assertions = [
    {
      name: '真实首页已启动',
      passed: String(launch?.path || '').includes('pages/index/index'),
      detail: launch?.path || 'launch state missing'
    },
    {
      name: '诊断分包流程页已打开',
      passed: Boolean(entry),
      detail: entry?.path || 'diagnosis entry state missing'
    },
    {
      name: '黄叶业务入口已选择',
      passed: Boolean(yellowing),
      detail: yellowing?.path || 'yellowing state missing'
    },
    {
      name: '至少完成一轮真实问答',
      passed: answers.length > 0,
      detail: `answer_count=${answers.length}`
    },
    {
      name: '切题后滚动位置重置',
      passed: scrollReset?.passed === true,
      detail: scrollReset ? JSON.stringify(scrollReset) : '未记录滚动重置证据'
    },
    {
      name: '诊断天气窗口请求成功',
      passed: Boolean(
        weatherRequest && Number(weatherRequest?.response?.statusCode || 0) === 200 && weatherWindow
      ),
      detail: weatherRequest
        ? `status=${weatherRequest?.response?.statusCode || 'unknown'}, historical=${historicalDays.length}`
        : '未捕获 weather/environment-context 请求'
    },
    {
      name: '最近10天历史天气窗口完整返回',
      passed:
        historicalDays.length === 10 &&
        new Set(historicalDates).size === 10 &&
        unclassifiedHistoricalDays.length === 0,
      detail: `historical_days=${historicalDays.length}, usable=${usableHistoricalDays.length}, missing=${missingHistoricalDays.length}, unclassified=${unclassifiedHistoricalDays.length}`
    },
    {
      name: '缺失天气已向用户说明',
      passed:
        missingHistoricalDays.length === 0 ||
        /最近 10 天.*天气记录.*(缺失|准备好)/u.test(timelineNoticeText),
      detail: `missing=${missingHistoricalDays.length}, notice=${timelineNoticeText || 'none'}`
    },
    {
      name: '最近10天天气在时间格逐日渲染',
      passed:
        historicalDays.length === 10 &&
        timelineCells.length > 0 &&
        renderedHistoricalDays.length === usableHistoricalDays.length &&
        renderedMissingDays.length === 0,
      detail: `timeline_cells=${timelineCells.length}, rendered_historical=${renderedHistoricalDays.length}, rendered_missing=${renderedMissingDays.length}`
    },
    {
      name: '诊断结果状态已到达',
      passed:
        resultState?.isCompleted === true ||
        (Array.isArray(resultElements?.outcomeHits) && resultElements.outcomeHits.length > 0) ||
        String(resultState?.path || '').includes('subpackages/diagnosis/result'),
      detail: resultState?.path || 'result state missing'
    },
    {
      name: '建议和暂时避免使用同一归并主键',
      passed:
        uniqueActionAdviceKeys.length > 0 &&
        JSON.stringify(uniqueActionAdviceKeys) === JSON.stringify(uniqueAvoidAdviceKeys),
      detail: {
        action_keys: uniqueActionAdviceKeys,
        avoid_keys: uniqueAvoidAdviceKeys
      }
    },
    {
      name: '相同主键只渲染一组建议和一组暂时避免',
      passed:
        actionAdviceGroups.length === uniqueActionAdviceKeys.length &&
        avoidAdviceGroups.length === uniqueAvoidAdviceKeys.length,
      detail: {
        action_group_count: actionAdviceGroups.length,
        avoid_group_count: avoidAdviceGroups.length
      }
    },
    {
      name: '多个结论的建议标题归拢为症状',
      passed: groupedAdviceUsesSymptoms,
      detail: {
        expected_outcome_labels: expectedNutrientOutcomeLabels,
        result_outcome_labels: resultOutcomeLabels,
        action_text: actionAdviceGroups[0]?.text || '',
        avoid_text: avoidAdviceGroups[0]?.text || ''
      }
    },
    {
      name: '最终截图为有效 PNG',
      passed: Boolean(finalScreenshot) && isValidPngEvidence(finalScreenshot),
      detail: finalScreenshot || 'final screenshot missing'
    }
  ]
  const passed = assertions.every(assertion => assertion.passed)
  return {
    status: passed ? 'passed' : 'failed',
    failure_kind: passed ? null : 'failed_product',
    business_assertions_reached: answers.length > 0,
    assertions,
    screenshot_attempts: result?.screenshotAttempts || [],
    classification: passed ? 'PASS' : 'FAIL_PRODUCT',
    blockerReason: passed ? null : assertions.find(item => !item.passed)?.name || null,
    evidence: {
      tool: 'miniprogram-automator',
      wsEndpoint,
      projectPath,
      profile,
      maxSteps,
      screenshots: result?.shots || [],
      screenshot_attempts: result?.screenshotAttempts || [],
      report_dir: result?.reportDir || null,
      weather: {
        request_count: weatherRequests.length,
        request: weatherRequest,
        historical_days: historicalDays,
        usable_historical_days: usableHistoricalDays.length,
        missing_historical_days: missingHistoricalDays.length,
        unclassified_historical_days: unclassifiedHistoricalDays.length,
        timeline_notice_text: timelineNoticeText,
        timeline_cells: timelineCells,
        rendered_historical_days: renderedHistoricalDays.length
      },
      scroll_reset: scrollReset || null,
      result_advice_groups: resultAdviceGroups,
      result_outcome_labels: resultOutcomeLabels
    }
  }
}

async function writeLeafArtifacts(result, report, reportFile) {
  await fs.promises.mkdir(result?.reportDir || path.dirname(reportFile), { recursive: true })
  await fs.promises.writeFile(
    reportFile,
    JSON.stringify(
      {
        ...report,
        logs: result?.logs || [],
        screenshots: result?.shots || [],
        capturedRequests: result?.capturedRequests || []
      },
      null,
      2
    ),
    'utf8'
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const wsEndpoint = formalAutomatorEndpoint(process.env)
  const backendTarget = resolveQaBackendTarget(process.env)
  const projectPath = normalize(args.project || process.env.MP_PROJECT_PATH || DEFAULT_PROJECT)
  const maxSteps = toNumber(args.maxSteps, DEFAULT_MAX_STEPS)
  const profile =
    normalize(args.profile || process.env.QA_YELLOWING_PROFILE || 'overwatering') || 'overwatering'
  if (!fs.existsSync(projectPath)) {
    throw new Error(`项目路径不存在: ${projectPath}`)
  }
  console.log('[开始] 端上 mcp 自动化：yellowing 测试')
  console.log(
    `[参数] ws=${wsEndpoint}, project=${projectPath}, profile=${profile}, maxSteps=${maxSteps}`
  )
  let result = null
  let report
  try {
    result = await runYellowingQuickFlow({
      wsEndpoint,
      projectPath,
      maxSteps,
      profile,
      authProbeBaseUrl: backendTarget.baseUrl
    })
    report = buildLeafReport(result, { wsEndpoint, projectPath, profile, maxSteps })
  } catch (error) {
    result = error?.partialResult || null
    if (result) {
      report = buildLeafReport(result, { wsEndpoint, projectPath, profile, maxSteps })
      report.status = 'failed'
      report.failure_kind =
        error?.failure_kind === 'failed_product' ? 'failed_product' : 'failed_environment'
      report.classification =
        report.failure_kind === 'failed_product' ? 'FAIL_PRODUCT' : 'BLOCKED_ENV'
      report.blockerReason = error?.message || String(error)
      report.assertions.push({
        name: 'yellowing quick flow completed',
        passed: false,
        detail: error?.message || String(error)
      })
    } else {
      report = {
        status: 'failed',
        failure_kind: 'failed_environment',
        business_assertions_reached: false,
        assertions: [
          {
            name: 'yellowing quick flow completed',
            passed: false,
            detail: error?.message || String(error)
          }
        ],
        classification: 'BLOCKED_ENV',
        blockerReason: error?.message || String(error),
        evidence: { wsEndpoint, projectPath, profile, maxSteps }
      }
    }
  }
  const reportFile = path.join(
    result?.reportDir || path.resolve(process.env.E2E_ARTIFACT_DIR || '.tmp/e2e/yellowing'),
    'yellowing-mcp-report.json'
  )
  await writeLeafArtifacts(result, report, reportFile)
  console.log(JSON.stringify(report))
  console.log(`[结束] 结果路径: ${result?.reportDir || path.dirname(reportFile)}`)
  console.log(`[结束] 日志文件: ${reportFile}`)
  if (result?.logs?.length) {
    console.log(`[摘要] 最终状态: ${JSON.stringify(result.logs.at(-1))}`)
  }
  if (report.status !== 'passed') {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message || error)
    process.exit(1)
  })
}
