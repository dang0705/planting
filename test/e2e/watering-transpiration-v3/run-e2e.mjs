'use strict'

/**
 * E2E 主入口 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 用法：
 *   npm run e2e:watering-transpiration-v3
 *   node test/e2e/watering-transpiration-v3/run-e2e.mjs [--scenario=all|independent|myplant] [--watering-transpiration-mode=shadow|active]
 *
 * 环境变量：
 *   MP_PROJECT_PATH              小程序构建目录（默认 dist/dev/mp-weixin）
 *   E2E_ARTIFACT_DIR             截图和报告目录
 *   WATERING_TRANSPIRATION_MODE  shadow | active
 *   MINIPROGRAM_AUTOMATOR_WS     ws://127.0.0.1:9420
 *
 * 失败语义：任何必需断言失败，进程非零退出。
 * 连接 9420 失败 → BLOCKED_ENV，非零退出。
 * 不自动启动/关闭/重启 DevTools。
 */

import {
  resolveEnv,
  resolveGitHead,
  resolveGitBranch,
  resolvePrBaseHead,
  timestampForFilename
} from './lib/env.mjs'
import { connectAutomator, AutomatorConnectError, safeDisconnect } from './lib/automator-client.mjs'
import {
  createReport,
  saveReport,
  setClassification,
  recordAssertion,
  hasFailedAssertions
} from './lib/reporter.mjs'
import { preflightProject } from './lib/project-check.mjs'
import { runIndependentWateringScenario } from './scenario-independent-watering.mjs'
import { runMyPlantPlannerScenario } from './scenario-my-plant-planner.mjs'

const VALID_CLASSIFICATIONS = new Set(['PASS', 'FAIL_PRODUCT', 'BLOCKED_ENV', 'BLOCKED_FIXTURE'])

function parseScenario(argv) {
  for (const token of argv) {
    if (token.startsWith('--scenario=')) {
      const value = token.slice('--scenario='.length)
      if (['all', 'independent', 'myplant'].includes(value)) return value
      throw new Error(`invalid --scenario: ${value}, expected all|independent|myplant`)
    }
  }
  return 'all'
}

async function main() {
  const argv = process.argv.slice(2)
  const env = resolveEnv(argv)
  const scenario = parseScenario(argv)

  const gitHead = resolveGitHead()
  const branch = resolveGitBranch()
  const baseHead = resolvePrBaseHead()

  console.log('[e2e] config:', {
    projectPath: env.projectPath,
    artifactDir: env.artifactDir,
    mode: env.mode,
    wsEndpoint: env.wsEndpoint,
    scenario,
    gitHead,
    branch,
    baseHead
  })

  // P1-2: 连接 9420 前预检 project.config.json
  const projectCheck = preflightProject(env.projectPath)
  if (!projectCheck.ok) {
    const report = createReport({
      gitHead,
      branch,
      baseHead,
      projectPath: env.projectPath,
      mode: env.mode,
      wsEndpoint: env.wsEndpoint
    })
    setClassification(report, 'BLOCKED_ENV', projectCheck.reason)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `e2e-${env.mode}-blocked-${timestampForFilename()}`
    )
    console.error(`[e2e] BLOCKED_ENV: ${projectCheck.reason}`)
    console.error(`[e2e] report: ${reportPath}`)
    process.exit(2)
  }

  // 连接 9420（不自动启动 DevTools）
  let mp
  try {
    console.log('[e2e] connecting to', env.wsEndpoint)
    mp = await connectAutomator(env.wsEndpoint)
    console.log('[e2e] connected')
  } catch (error) {
    if (error instanceof AutomatorConnectError) {
      const report = createReport({
        gitHead,
        branch,
        baseHead,
        projectPath: env.projectPath,
        mode: env.mode,
        wsEndpoint: env.wsEndpoint
      })
      setClassification(
        report,
        'BLOCKED_ENV',
        `automator connect failed: ${env.wsEndpoint} — ${error.reason}. 请确认微信开发者工具已启动并开启 9420 端口（设置 → 安全设置 → 服务端口）。`
      )
      const reportPath = saveReport(
        report,
        env.artifactDir,
        `e2e-${env.mode}-blocked-${timestampForFilename()}`
      )
      console.error(`[e2e] BLOCKED_ENV: ${error.message}`)
      console.error(`[e2e] report: ${reportPath}`)
      process.exit(1)
    }
    throw error
  }

  const overallResults = []

  try {
    if (scenario === 'all' || scenario === 'independent') {
      console.log('\n[e2e] === scenario: independent watering ===')
      const reportInd = createReport({
        gitHead,
        branch,
        baseHead,
        projectPath: env.projectPath,
        mode: env.mode,
        wsEndpoint: env.wsEndpoint
      })
      const classification = await runIndependentWateringScenario(mp, reportInd, env.artifactDir)
      const reportPath = saveReport(
        reportInd,
        env.artifactDir,
        `e2e-${env.mode}-independent-${timestampForFilename()}`
      )
      console.log(`[e2e] independent watering classification: ${classification}`)
      console.log(`[e2e] report: ${reportPath}`)
      overallResults.push({ scenario: 'independent', classification, reportPath })
    }

    if (scenario === 'all' || scenario === 'myplant') {
      console.log('\n[e2e] === scenario: my plant planner ===')
      const reportMyPlant = createReport({
        gitHead,
        branch,
        baseHead,
        projectPath: env.projectPath,
        mode: env.mode,
        wsEndpoint: env.wsEndpoint
      })
      const classification = await runMyPlantPlannerScenario(
        mp,
        reportMyPlant,
        env.artifactDir,
        env.mode
      )
      const reportPath = saveReport(
        reportMyPlant,
        env.artifactDir,
        `e2e-${env.mode}-myplant-${timestampForFilename()}`
      )
      console.log(`[e2e] my plant planner classification: ${classification}`)
      console.log(`[e2e] report: ${reportPath}`)
      overallResults.push({ scenario: 'myplant', classification, reportPath })
    }
  } finally {
    await safeDisconnect(mp)
  }

  // 汇总
  console.log('\n[e2e] === summary ===')
  let hasFailure = false
  let hasBlocked = false
  for (const r of overallResults) {
    console.log(`  ${r.scenario}: ${r.classification} (${r.reportPath})`)
    if (r.classification === 'FAIL_PRODUCT') hasFailure = true
    if (r.classification === 'BLOCKED_ENV' || r.classification === 'BLOCKED_FIXTURE') {
      hasBlocked = true
    }
  }

  // 退出码：PASS=0，FAIL_PRODUCT=1，BLOCKED_*=2
  if (hasFailure) {
    process.exit(1)
  }
  if (hasBlocked) {
    process.exit(2)
  }
  process.exit(0)
}

main().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exit(1)
})
