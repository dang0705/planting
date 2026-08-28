#!/usr/bin/env node
'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { formalAutomatorEndpoint } from '../_shared/formal-leaf-harness.mjs'
import { normalize } from './yellowing/dom.mjs'
import { runYellowingQuickFlow } from './yellowing/runner.mjs'
import { isValidPngEvidence } from '../../../../scripts/qa/qa-png-evidence.mjs'

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

function buildLeafReport(result, { wsEndpoint, projectPath, profile, maxSteps } = {}) {
  const logs = Array.isArray(result?.logs) ? result.logs : []
  const launch = logs.find(item => item.type === 'state' && item.label === 'launch')
  const entry = logs.find(item => item.type === 'state' && item.label === 'diagnosis-entry-opened')
  const yellowing = logs.find(item => item.type === 'state' && item.label === 'after-yellowing')
  const answers = logs.filter(item => item.type === 'answer')
  const resultState = logs.find(item => item.type === 'result' && !item.screenshot)
  const resultElements = logs.find(item => item.type === 'result-elements')
  const finalScreenshot = [...(result?.shots || [])].at(-1) || ''
  const assertions = [
    {
      name: '真实首页已启动',
      passed: String(launch?.path || '').includes('pages/index/index'),
      detail: launch?.path || 'launch state missing'
    },
    {
      name: '诊断分包入口已打开',
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
      name: '诊断结果状态已到达',
      passed:
        resultState?.isCompleted === true ||
        (Array.isArray(resultElements?.outcomeHits) && resultElements.outcomeHits.length > 0) ||
        String(resultState?.path || '').includes('subpackages/diagnosis/result'),
      detail: resultState?.path || 'result state missing'
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
      report_dir: result?.reportDir || null
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
        screenshots: result?.shots || []
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
  const projectPath = normalize(args.project || process.env.MP_PROJECT_PATH || DEFAULT_PROJECT)
  const maxSteps = toNumber(args.maxSteps, DEFAULT_MAX_STEPS)
  const profile = normalize(args.profile || 'overwatering') || 'overwatering'
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
    result = await runYellowingQuickFlow({ wsEndpoint, projectPath, maxSteps, profile })
    report = buildLeafReport(result, { wsEndpoint, projectPath, profile, maxSteps })
  } catch (error) {
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
