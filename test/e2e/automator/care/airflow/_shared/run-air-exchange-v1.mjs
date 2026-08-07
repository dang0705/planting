'use strict'

/**
 * 空气环境评估端上验收共享 runner -- care/airflow/air-exchange-v1。
 *
 * 边界（来自 handoff）：
 *   - 页面没有正常用户入口是本期明确边界；Automator 可对已注册独立路由验证。
 *   - 不得声称已完成黄叶主流程验收。
 *
 * 验收范围：
 *   - reLaunch 到 /pages/airflow/index 容器页，断言完整空气环境组件加载
 *   - 选择窗户情况、新风系统和不确定分别触发完成，断言结果摘要文案
 *   - unknown 不得变成关闭窗户；fresh_air 不得产生出风口/直吹字段
 *
 * 失败语义：
 *   - 预检失败 / 连接失败 -> BLOCKED_ENV，exit 2
 *   - 断言失败 -> FAIL_PRODUCT，exit 1
 *   - 全部通过 -> PASS，exit 0
 */

import path from 'node:path'
import automator from 'miniprogram-automator'
import { handoffFormalLeafScreenshot } from '../../../_shared/formal-leaf-harness.mjs'
import { resolveEnv, resolveGitHead, resolveGitBranch, timestampForFilename } from './lib/env.mjs'
import {
  connectAutomator,
  AutomatorConnectError,
  safeDisconnect,
  reLaunchTo
} from './lib/automator-client.mjs'
import {
  createReport,
  recordPage,
  recordAssertion,
  recordScreenshot,
  setClassification,
  saveReport,
  hasFailedAssertions
} from './lib/reporter.mjs'
import { preflightProject } from './lib/project-check.mjs'
import { findViewById } from '../../watering/transpiration-v3/_shared/lib/element-helpers.mjs'

const AIRFLOW_PAGE = '/pages/airflow/index'
const SCREENSHOT_DIR_NAME = 'screenshots'

export async function runAirExchangeV1() {
  const env = resolveEnv()
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    projectPath: env.projectPath,
    wsEndpoint: env.wsEndpoint
  })

  const preflight = preflightProject(env.projectPath)
  if (!preflight.ok) {
    setClassification(report, 'BLOCKED_ENV', preflight.reason)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `air-exchange-v1-blocked-${timestampForFilename()}`
    )
    console.error(`[e2e][BLOCKED_ENV] ${preflight.reason}`)
    console.error(`[e2e] report: ${reportPath}`)
    process.exit(2)
  }

  let mp = null
  try {
    mp = await connectAutomator(env.wsEndpoint)
    const page = await reLaunchTo(mp, AIRFLOW_PAGE)
    recordPage(report, AIRFLOW_PAGE)

    await assertStableIdsPresent(mp, page, report)
    mp = await assertSourceFlow(mp, page, report, env)
    mp = await captureScreenshot(mp, report, env, 'airflow-final')

    // 仅在未被截图环境失败终态化为 BLOCKED_ENV 时才判定 PASS/FAIL_PRODUCT，
    // 避免 BLOCKED_ENV 被后续 PASS/FAIL_PRODUCT 覆盖。
    if (report.classification !== 'BLOCKED_ENV') {
      if (hasFailedAssertions(report)) {
        setClassification(report, 'FAIL_PRODUCT', 'one or more assertions failed')
      } else {
        setClassification(report, 'PASS')
      }
    }
  } catch (error) {
    // 截图环境失败已在 captureScreenshot 内 setClassification('BLOCKED_ENV')；
    // 此处不得用 FAIL_PRODUCT 覆盖既有 BLOCKED_ENV。
    if (report.classification !== 'BLOCKED_ENV') {
      const classification = error instanceof AutomatorConnectError ? 'BLOCKED_ENV' : 'FAIL_PRODUCT'
      setClassification(report, classification, String(error?.message || error))
    }
  } finally {
    await safeDisconnect(mp)
  }

  const suffix = report.classification === 'PASS' ? 'pass' : 'fail'
  const reportPath = saveReport(
    report,
    env.artifactDir,
    `air-exchange-v1-${suffix}-${timestampForFilename()}`
  )
  console.log(`[e2e] classification: ${report.classification}`)
  console.log(`[e2e] report: ${reportPath}`)

  if (report.classification === 'PASS') {
    process.exit(0)
  }
  if (report.classification === 'BLOCKED_ENV' || report.classification === 'BLOCKED_FIXTURE') {
    process.exit(2)
  }
  process.exit(1)
}

async function assertStableIdsPresent(mp, page, report) {
  // stable id 必须先取得完整 AirEnvironmentAssessment 组件作用域再查询，
  // 不能从 page 根直接查（小程序组件 shadow 边界）。
  const component = await page.$('air-environment-assessment').catch(() => null)
  recordAssertion(report, 'component-scope:air-environment-assessment', Boolean(component))

  const componentScopedIds = [
    'airflow-assessment',
    'airflow-swiper',
    'airflow-exchange-assessment',
    'airflow-exchange-source-window',
    'airflow-exchange-source-fresh_air',
    'airflow-exchange-source-unknown',
    'airflow-exchange-step',
    'airflow-next-step'
  ]
  for (const id of componentScopedIds) {
    const element = component ? await findViewById(component, id) : null
    recordAssertion(report, `stable-id-present:${id}`, Boolean(element))
  }
  const legacyClosedCard = component
    ? await findViewById(component, 'airflow-exchange-source-closed_or_none')
    : null
  recordAssertion(report, 'legacy-closed-source-card-removed', !legacyClosedCard)

  const submitEl = component ? await findViewById(component, 'airflow-submit-button') : null
  recordAssertion(report, 'stable-id-present:airflow-submit-button', Boolean(submitEl))
}

async function assertSourceFlow(mp, page, report, env) {
  // 1. 初始完成按钮不可用（ready=false）
  // Mini Program Automator 对 HTML boolean attribute 可能返回 true / 'true' / 'disabled' / ''（空字符串）
  const component = await page.$('air-environment-assessment').catch(() => null)
  const submitDisabled = await findViewById(component, 'airflow-submit-button')
    .then(el => el?.attribute('disabled'))
    .catch(() => null)
  recordAssertion(
    report,
    'submit-disabled-initial',
    submitDisabled === true ||
      submitDisabled === 'true' ||
      submitDisabled === 'disabled' ||
      submitDisabled === ''
  )

  // 嵌套在 AirEnvironmentAssessment 组件内的 stable id 必须经组件作用域查询/点击；
  // airflow-submit-button 随完成动作位于组件 footer；重置和结果摘要仍在页面层级。
  // 2. 选择 unknown -> 完成 -> 结果摘要出现，文案为中性"已记录：不确定"（不得变成关闭窗户）
  await tapElement(component, 'airflow-exchange-source-unknown', report)
  await tapElement(component, 'airflow-next-step', report)
  await delay(350)
  await assertLocalAirflowIdsPresent(component, report)
  await tapElement(component, 'airflow-previous-step', report)
  await delay(350)
  recordAssertion(
    report,
    'previous-step-returns-to-exchange',
    Boolean(await findViewById(component, 'airflow-exchange-step'))
  )
  await tapElement(component, 'airflow-next-step', report)
  await delay(350)
  await tapElement(component, 'airflow-canopy-open', report)
  await tapElement(component, 'airflow-device-mode-none', report)
  await waitForEnabled(component, 'airflow-submit-button', report)
  const unknownSummary = await submitAndReadSummary(page, component, report)
  recordAssertion(
    report,
    'unknown-result-text',
    Boolean(unknownSummary) &&
      unknownSummary.includes('换气情况不确定') &&
      unknownSummary.includes('没有设备风')
  )
  recordAssertion(
    report,
    'unknown-not-no-window',
    !(unknownSummary && (unknownSummary.includes('偏少') || unknownSummary.includes('关闭窗户')))
  )

  // 3. 重置后选择 fresh_air -> 完成 -> 中性"已记录：新风系统"，不含出风口/直吹
  await tapElement(page, 'airflow-reset-button', report)
  await delay(200)
  await tapElement(component, 'airflow-exchange-source-fresh_air', report)
  await tapElement(component, 'airflow-next-step', report)
  await tapElement(component, 'airflow-canopy-open', report)
  await tapElement(component, 'airflow-device-mode-has-airflow', report)
  await tapElement(component, 'airflow-device-mode-circulating', report)
  await tapElement(component, 'airflow-device-source-fresh_air', report)
  await waitForEnabled(component, 'airflow-submit-button', report)
  const freshAirSummary = await submitAndReadSummary(page, component, report)
  recordAssertion(
    report,
    'fresh-air-result-text',
    Boolean(freshAirSummary) &&
      freshAirSummary.includes('新风换气') &&
      freshAirSummary.includes('有空气流动')
  )
  recordAssertion(
    report,
    'fresh-air-no-outlet-or-draft',
    !(freshAirSummary && (freshAirSummary.includes('出风口') || freshAirSummary.includes('直吹')))
  )

  // 4. 重置后选择 window + 关闭窗户 -> 完成 -> 中性"已记录：窗户情况，关闭窗户"
  await tapElement(page, 'airflow-reset-button', report)
  await delay(200)
  await tapElement(component, 'airflow-exchange-source-window', report)
  await delay(200)
  await tapElement(component, 'airflow-exchange-window-direction-closed', report)
  await tapElement(component, 'airflow-next-step', report)
  await tapElement(component, 'airflow-canopy-open', report)
  await tapElement(component, 'airflow-device-mode-none', report)
  await waitForEnabled(component, 'airflow-submit-button', report)
  const noWindowSummary = await submitAndReadSummary(page, component, report)
  recordAssertion(
    report,
    'window-none-recorded',
    Boolean(noWindowSummary) &&
      noWindowSummary.includes('开窗换气') &&
      noWindowSummary.includes('没有设备风')
  )

  // 5. 重置后选择 window + 双方向 + 每天 -> 完成 -> 中性"已记录：窗户情况，两个及以上方向，每天"
  await tapElement(page, 'airflow-reset-button', report)
  await delay(200)
  await tapElement(component, 'airflow-exchange-source-window', report)
  await delay(200)
  await tapElement(component, 'airflow-exchange-window-direction-two-or-more', report)
  await tapElement(component, 'airflow-exchange-window-frequency-daily', report)
  await tapElement(component, 'airflow-next-step', report)
  await tapElement(component, 'airflow-canopy-open', report)
  await tapElement(component, 'airflow-device-mode-has-airflow', report)
  await tapElement(component, 'airflow-device-mode-direct', report)
  await tapElement(component, 'airflow-device-source-fan', report)
  // 两个连续的组件事件会经过 Vue/小程序桥异步合并；等待完成按钮
  // 实际解除禁用后再点击，避免依赖脆弱的固定 sleep。
  await delay(500)
  await waitForEnabled(component, 'airflow-submit-button', report)
  const windowSummary = await submitAndReadSummary(page, component, report)
  recordAssertion(
    report,
    'window-double-daily-recorded',
    Boolean(windowSummary) && windowSummary.includes('开窗换气') && windowSummary.includes('有直吹')
  )

  return captureScreenshot(mp, report, env, 'airflow-window-recorded')
}

async function assertLocalAirflowIdsPresent(component, report) {
  const localIds = [
    'airflow-local-airflow-step',
    'airflow-canopy-open',
    'airflow-canopy-partial',
    'airflow-canopy-enclosed',
    'airflow-canopy-unknown',
    'airflow-device-mode-none',
    'airflow-device-mode-has-airflow',
    'airflow-device-mode-unknown',
    'airflow-previous-step',
    'airflow-submit-button'
  ]
  for (const id of localIds) {
    const element = component ? await findViewById(component, id) : null
    recordAssertion(report, `stable-id-present:${id}`, Boolean(element))
  }
}

async function waitForEnabled(scope, id, report, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const element = await findViewById(scope, id)
    const disabled = await element?.attribute('disabled').catch(() => null)
    if (element && ![true, 'true', 'disabled', ''].includes(disabled)) {
      return true
    }
    await delay(100)
  }
  recordAssertion(report, `enabled:${id}`, false, `not enabled within ${timeoutMs}ms`)
  return false
}

async function submitAndReadSummary(page, component, report) {
  await tapElement(component, 'airflow-submit-button', report)
  let summary = await readElementTextEventually(page, 'airflow-result-summary')
  if (summary) {
    return summary
  }

  // 事件桥偶发在 button.tap() 返回后仍未派发 click；只在结果缺失时
  // 做一次有界重试，避免掩盖真正的结果断言失败。
  const button = await findViewById(component, 'airflow-submit-button')
  const disabled = await button?.attribute('disabled').catch(() => null)
  if (button && ![true, 'true', 'disabled', ''].includes(disabled)) {
    await tapElement(component, 'airflow-submit-button', report)
    summary = await readElementTextEventually(page, 'airflow-result-summary')
  }
  return summary
}

async function tapElement(scope, selector, report) {
  try {
    if (!scope) {
      recordAssertion(report, `tap:${selector}`, false, 'scope not available')
      return
    }
    const el = await findViewById(scope, selector)
    if (!el) {
      recordAssertion(report, `tap:${selector}`, false, 'element not found')
      return
    }
    await el.tap()
    // miniprogram-automator 的 tap 返回早于小程序事件桥完成；给事件
    // 状态一个短暂的落地窗口，后续查询再由各自的有界等待确认结果。
    await delay(100)
  } catch (error) {
    recordAssertion(report, `tap:${selector}`, false, String(error?.message || error))
  }
}

async function readElementText(page, selector) {
  try {
    const el = await findViewById(page, selector)
    if (!el) {
      return null
    }
    return (await el.text()) || ''
  } catch {
    return null
  }
}

async function readElementTextEventually(page, selector, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = await readElementText(page, selector)
    if (text) {
      return text
    }
    await delay(100)
  }
  return null
}

async function captureScreenshot(mp, report, env, name) {
  // 截图由共享 worker 生成；主会话先释放再经相同受控端点恢复。
  try {
    const screenshotDir = path.resolve(env.artifactDir, SCREENSHOT_DIR_NAME)
    await import('node:fs').then(fs => fs.mkdirSync?.(screenshotDir, { recursive: true }))
    const filepath = path.resolve(screenshotDir, `${name}-${timestampForFilename()}.png`)
    const resumed = await handoffFormalLeafScreenshot({
      mp,
      automator,
      wsEndpoint: env.wsEndpoint,
      outputPath: filepath
    })
    recordScreenshot(report, filepath)
    return resumed.mp
  } catch (error) {
    // 截图超时/transport 失败终态化为 BLOCKED_ENV，不静默吞掉，不误判为产品断言失败
    setClassification(
      report,
      'BLOCKED_ENV',
      `screenshot failed: ${String(error?.message || error)}`
    )
    console.error(`[e2e][BLOCKED_ENV] screenshot failed: ${String(error?.message || error)}`)
    // 抛出使顶层跳过 PASS/FAIL_PRODUCT 判定；顶层 catch 已配置为不覆盖既有 BLOCKED_ENV。
    throw new Error(`screenshot BLOCKED_ENV: ${String(error?.message || error)}`)
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function main() {
  await runAirExchangeV1()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('[e2e] fatal error:', error?.message || error)
    process.exit(1)
  })
}
