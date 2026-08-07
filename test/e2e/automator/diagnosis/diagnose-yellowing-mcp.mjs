#!/usr/bin/env node
'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { formalAutomatorEndpoint } from '../_shared/formal-leaf-harness.mjs'
import { normalize } from './yellowing/dom.mjs'
import { runYellowingQuickFlow } from './yellowing/runner.mjs'

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
  const result = await runYellowingQuickFlow({ wsEndpoint, projectPath, maxSteps, profile })
  const reportFile = path.join(result.reportDir, 'yellowing-mcp-report.json')
  await fs.promises.mkdir(result.reportDir, { recursive: true })
  await fs.promises.writeFile(
    reportFile,
    JSON.stringify(
      {
        tool: 'miniprogram-automator',
        startedAt: result.startedAt,
        wsEndpoint,
        projectPath,
        profile,
        maxSteps,
        logs: result.logs,
        screenshots: result.shots
      },
      null,
      2
    ),
    'utf8'
  )
  console.log(`[结束] 结果路径: ${result.reportDir}`)
  console.log(`[结束] 日志文件: ${reportFile}`)
  if (result.logs.length) {
    console.log(`[摘要] 最终状态: ${JSON.stringify(result.logs.at(-1))}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message || error)
    process.exit(1)
  })
}
