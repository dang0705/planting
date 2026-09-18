#!/usr/bin/env node

/* oxlint-disable no-console -- formal leaf emits its report and evidence path. */

import {
  resolveEnv,
  resolveGitBranch,
  resolveGitHead,
  resolvePrBaseHead
} from '../care/watering/transpiration-v3/_shared/lib/env.mjs'
import {
  connectAutomator,
  reLaunchTo,
  safeDisconnect
} from '../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  findViewById,
  waitForElement
} from '../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import { safeScreenshot } from '../care/watering/transpiration-v3/_shared/lib/screenshot.mjs'
import {
  createReport,
  emitLeafReport,
  recordAssertion,
  recordPage,
  recordPageData,
  recordScreenshot,
  saveReport,
  setClassification
} from '../care/watering/transpiration-v3/_shared/lib/reporter.mjs'
import { preflightProject } from '../care/watering/transpiration-v3/_shared/lib/project-check.mjs'

const HOME_PAGE = '/pages/index/index'
const WAIT_MS = 12_000
const FAILURE_EXIT_CODE = 2
const ARGV_OPTIONS_START_INDEX = 2

function assertProductCondition(report, name, condition, detail = '') {
  recordAssertion(report, name, Boolean(condition), detail)
  if (!condition) {
    const error = new Error(`${name}${detail ? `: ${detail}` : ''}`)
    error.classification = 'FAIL_PRODUCT'
    throw error
  }
}

async function main() {
  const env = resolveEnv(process.argv.slice(ARGV_OPTIONS_START_INDEX))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'mini-program-update-gate',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null
  let classification = 'BLOCKED_ENV'

  try {
    const projectCheck = preflightProject(env.projectPath)
    if (!projectCheck.ok) {
      setClassification(report, classification, projectCheck.reason)
      return
    }

    mp = await connectAutomator(env.wsEndpoint)
    const page = await reLaunchTo(mp, HOME_PAGE)
    recordPage(report, HOME_PAGE)

    const homeRoot = await waitForElement(page, 'index-page', WAIT_MS)
    assertProductCondition(report, '无更新时首页业务入口可见', Boolean(homeRoot))

    const updateApiAvailable = await mp.evaluate(function () {
      return typeof wx !== 'undefined' && typeof wx.getUpdateManager === 'function'
    })
    assertProductCondition(report, '微信端版本更新能力可用', updateApiAvailable)

    const updateGate = await findViewById(page, 'mini-program-update-gate')
    assertProductCondition(
      report,
      '无新版本时更新遮罩不会无条件阻断业务',
      !updateGate,
      '当前运行时出现了更新遮罩，请按更新模拟场景单独验收'
    )

    recordPageData(report, HOME_PAGE, {
      updateApiAvailable,
      updateGateVisible: Boolean(updateGate),
      scenario: 'no_update_available'
    })

    const screenshot = await safeScreenshot(
      mp,
      env.artifactDir,
      'mini-program-update-gate-normal',
      env.wsEndpoint,
      { maxAttempts: 1, report }
    )
    recordScreenshot(report, screenshot)
    assertProductCondition(report, '首页正常状态截图有效', Boolean(screenshot))
    classification = 'PASS'
    setClassification(report, classification)
  } catch (error) {
    classification = error?.classification || classification
    setClassification(report, classification, String(error?.message || error))
  } finally {
    await safeDisconnect(mp)
    const reportPath = saveReport(report, env.artifactDir, `mini-program-update-gate-${Date.now()}`)
    report.report_path = reportPath
    emitLeafReport(report)
    console.error(`[e2e] report: ${reportPath}`)
    if (report.classification !== 'PASS') {
      process.exitCode = FAILURE_EXIT_CODE
    }
  }
}

main().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = FAILURE_EXIT_CODE
})
