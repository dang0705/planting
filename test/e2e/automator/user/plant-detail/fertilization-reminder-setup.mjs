#!/usr/bin/env node
'use strict'

/* oxlint-disable no-console -- CLI leaf writes its artifact location and terminal failure. */

import {
  resolveEnv,
  resolveGitBranch,
  resolveGitHead,
  resolvePrBaseHead
} from '../../care/watering/transpiration-v3/_shared/lib/env.mjs'
import {
  connectAutomator,
  AutomatorConnectError,
  safeDisconnect
} from '../../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import { findViewById } from '../../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import { safeScreenshot } from '../../care/watering/transpiration-v3/_shared/lib/screenshot.mjs'
import {
  createReport,
  emitLeafReport,
  recordAssertion,
  recordRequests,
  recordScreenshot,
  saveReport,
  setClassification
} from '../../care/watering/transpiration-v3/_shared/lib/reporter.mjs'
import { preflightProject } from '../../care/watering/transpiration-v3/_shared/lib/project-check.mjs'
import {
  closeFixtureFertilizationSheet,
  hideNativeModal,
  openFixtureFertilizationSheet,
  restoreFertilizationScenario,
  scrollFertilizationSheetToActions,
  textOf,
  waitForCurrentPageElement
} from '../../_shared/fertilization-reminder-e2e-helpers.mjs'
import { readFixtureFertilizationState } from '../../_shared/fertilization-reminder-fixture-state.mjs'
import {
  CONDITIONAL_SCHEDULE,
  EVENT_SCHEDULE,
  LIQUID_INTERVAL_SCHEDULE,
  createFertilizationMonthly,
  createFixturePlant,
  createMonthlyCell,
  createMonthlyRows
} from '../../_shared/fertilization-test-fixtures.mjs'

const FIXTURE_SLOT = '__e2eFertilizationReminderSetupFixtureV1'
const UI_WAIT_MS = 350
const FAILURE_EXIT_CODE = 2
const SECOND_ATTEMPT = 2
const CLI_ARGUMENT_START_INDEX = 2
const ZERO = 0
const ONE = 1
const TRANSIENT_SYNC_FAILURE_CODE = 503
const EXPIRED_PLAN_FAILURE_CODE = 409

class ProductAssertionError extends Error {}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assertCondition(report, name, condition, detail = null) {
  recordAssertion(report, name, Boolean(condition), detail)
  if (!condition) {
    throw new ProductAssertionError(`${name}${detail ? `: ${detail}` : ''}`)
  }
}

async function tapCurrent(mp, id) {
  const element = await waitForCurrentPageElement(mp, id)
  if (!element) {
    throw new ProductAssertionError(`未找到交互元素：${id}`)
  }
  await element.tap()
  await sleep(UI_WAIT_MS)
  return element
}

async function openReminderSetupPopup(mp) {
  await tapCurrent(mp, 'fertilization-reminder-entry-button')
  const setupSheet = await waitForCurrentPageElement(mp, 'fertilization-reminder-setup-sheet')
  if (!setupSheet) {
    throw new ProductAssertionError('未打开选择肥料底部弹框')
  }
  return setupSheet
}

async function executeScenario(mp, report, name, options, verify) {
  let opened = null
  try {
    opened = await openFixtureFertilizationSheet({
      mp,
      runtimeSlot: `${FIXTURE_SLOT}_${name}`,
      ...options
    })
    const scroll = await scrollFertilizationSheetToActions(mp)
    assertCondition(
      report,
      `${name} 操作区在可见范围或已真实滚动到操作区`,
      !scroll.isScrollable || scroll.scrollTop > ZERO,
      `scrollTop=${scroll.scrollTop}, scrollHeight=${scroll.scrollHeight}, isScrollable=${scroll.isScrollable}`
    )
    await verify(opened)
    const fixtureState = await readFixtureFertilizationState(mp, opened.fixtureConfig.runtimeSlot)
    recordRequests(report, fixtureState?.requests || [])
    recordAssertion(report, name, true)
  } catch (error) {
    recordAssertion(report, name, false, String(error?.message || error))
    throw error
  } finally {
    if (opened) {
      await closeFixtureFertilizationSheet(mp)
      await restoreFertilizationScenario(mp, opened.fixtureConfig)
    }
  }
}

function normalPreviewBehavior(overrides = {}) {
  return {
    preview: {
      planId: 'fixture-normal-preview-95001',
      reminderKind: 'normal',
      confirmationReasons: [],
      lastDateSource: 'recorded',
      nextCheckDate: '2026-08-22',
      nextTime: '2026-08-22T09:00:00',
      displayText: '每月1次',
      schedule: LIQUID_INTERVAL_SCHEDULE,
      ...overrides
    }
  }
}

async function run() {
  const env = resolveEnv(process.argv.slice(CLI_ARGUMENT_START_INDEX))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: 'fertilization-reminder-setup',
    wsEndpoint: env.wsEndpoint
  })
  let mp = null

  try {
    const projectCheck = preflightProject(env.projectPath)
    if (!projectCheck.ok) {
      setClassification(report, 'BLOCKED_ENV', projectCheck.reason)
      return
    }
    try {
      mp = await connectAutomator(env.wsEndpoint)
    } catch (error) {
      const reason =
        error instanceof AutomatorConnectError ? error.reason : String(error?.message || error)
      setClassification(report, 'BLOCKED_ENV', `automator connect failed: ${reason}`)
      return
    }

    await executeScenario(
      mp,
      report,
      '提醒页入口复用施肥时间表弹框',
      { plant: createFixturePlant(), entry: 'reminder' },
      async () => {
        const table = await waitForCurrentPageElement(mp, 'plant-card-fertilization-monthly-table')
        assertCondition(report, '提醒页施肥入口打开统一月度表', Boolean(table))
        const screenshot = await safeScreenshot(
          mp,
          env.artifactDir,
          'fertilization-reminder-reminder-tab'
        )
        recordScreenshot(report, screenshot)
        assertCondition(report, '提醒页施肥入口截图有效', Boolean(screenshot))
      }
    )

    await executeScenario(
      mp,
      report,
      '无可靠月表时只展示基础建议',
      {
        plant: createFixturePlant({
          fertilizationMonthly: createFertilizationMonthly({ available: false })
        })
      },
      async () => {
        const unavailable = await waitForCurrentPageElement(
          mp,
          'plant-card-fertilization-monthly-unavailable'
        )
        const setup = await findViewById(await mp.currentPage(), 'fertilization-reminder-section')
        assertCondition(report, '无可靠月表不展示提醒设置', Boolean(unavailable) && !setup)
      }
    )

    const noFixedRows = createMonthlyRows({
      currentCells: {
        liquid: createMonthlyCell('请在长出新叶后少量补充', CONDITIONAL_SCHEDULE),
        slowRelease: createMonthlyCell('换盆稳定后施1次', EVENT_SCHEDULE)
      }
    })
    await executeScenario(
      mp,
      report,
      '条件和事件型规则不允许预设周期提醒',
      {
        plant: createFixturePlant({
          fertilizationMonthly: createFertilizationMonthly({ rows: noFixedRows })
        })
      },
      async () => {
        const noFixedPeriod = await waitForCurrentPageElement(
          mp,
          'fertilization-reminder-no-fixed-period'
        )
        const preview = await findViewById(
          await mp.currentPage(),
          'fertilization-reminder-preview-button'
        )
        assertCondition(report, '条件和事件型规则隐藏提醒初检', Boolean(noFixedPeriod) && !preview)
      }
    )

    await executeScenario(
      mp,
      report,
      '切换缓释肥后可生成正常提醒并由用户取消',
      { plant: createFixturePlant(), behavior: normalPreviewBehavior() },
      async opened => {
        await openReminderSetupPopup(mp)
        await tapCurrent(mp, 'fertilization-reminder-option-slow-release')
        await tapCurrent(mp, 'fertilization-reminder-preview-button')
        await hideNativeModal(mp)
        const preview = await waitForCurrentPageElement(mp, 'fertilization-reminder-preview')
        const previewText = await textOf(preview)
        const stateBeforeCancel = await readFixtureFertilizationState(
          mp,
          opened.fixtureConfig.runtimeSlot
        )
        assertCondition(
          report,
          '缓释肥选择传入初检且正常提醒不标为首次确认',
          /(首次确认提醒|下次施肥提醒)/u.test(previewText) &&
            stateBeforeCancel?.pendingPlan?.fertilizerType === 'slowRelease'
        )
        await tapCurrent(mp, 'fertilization-reminder-cancel-button')
        const stateAfterCancel = await readFixtureFertilizationState(
          mp,
          opened.fixtureConfig.runtimeSlot
        )
        const previewAfterCancel = await findViewById(
          await mp.currentPage(),
          'fertilization-reminder-preview'
        )
        assertCondition(
          report,
          '用户取消待确认提醒会取消计划且回到设置区',
          stateAfterCancel?.cancelledPlanIds?.length === ONE && !previewAfterCancel
        )
      }
    )

    await executeScenario(
      mp,
      report,
      '到期即检查提醒不写手机日历而直接保存',
      {
        plant: createFixturePlant(),
        behavior: normalPreviewBehavior({ dueNow: true, nextCheckDate: '2026-08-11' })
      },
      async opened => {
        await openReminderSetupPopup(mp)
        await tapCurrent(mp, 'fertilization-reminder-preview-button')
        await hideNativeModal(mp)
        const confirm = await waitForCurrentPageElement(
          mp,
          'fertilization-reminder-calendar-confirm-button'
        )
        const confirmText = await textOf(confirm)
        assertCondition(report, '到期提醒使用保存提醒确认按钮', confirmText.includes('保存提醒'))
        await tapCurrent(mp, 'fertilization-reminder-calendar-confirm-button')
        const state = await readFixtureFertilizationState(mp, opened.fixtureConfig.runtimeSlot)
        assertCondition(
          report,
          '到期提醒不会写手机日历但会保存应用内提醒',
          state?.calendarCalls?.length === ZERO && state?.reminder?.active === true
        )
      }
    )

    await executeScenario(
      mp,
      report,
      '日历已写入但首次同步失败时允许幂等重试',
      {
        plant: createFixturePlant(),
        behavior: {
          ...normalPreviewBehavior(),
          confirmFailureCodes: [TRANSIENT_SYNC_FAILURE_CODE]
        }
      },
      async opened => {
        await openReminderSetupPopup(mp)
        await tapCurrent(mp, 'fertilization-reminder-preview-button')
        await hideNativeModal(mp)
        await tapCurrent(mp, 'fertilization-reminder-calendar-confirm-button')
        const retryButton = await waitForCurrentPageElement(
          mp,
          'fertilization-reminder-calendar-confirm-button'
        )
        assertCondition(
          report,
          '首次同步失败后显示重试同步',
          (await textOf(retryButton)).includes('重试同步')
        )
        await tapCurrent(mp, 'fertilization-reminder-calendar-confirm-button')
        const state = await readFixtureFertilizationState(mp, opened.fixtureConfig.runtimeSlot)
        assertCondition(
          report,
          '重试不会重复写系统日历且第二次同步保存 active',
          state?.calendarCalls?.length === ONE &&
            state?.confirmAttempts === SECOND_ATTEMPT &&
            state?.reminder?.active
        )
      }
    )

    await executeScenario(
      mp,
      report,
      '计划失效时要求取消本次设置后重来',
      {
        plant: createFixturePlant(),
        behavior: {
          ...normalPreviewBehavior(),
          confirmFailureCodes: [EXPIRED_PLAN_FAILURE_CODE]
        }
      },
      async opened => {
        await openReminderSetupPopup(mp)
        await tapCurrent(mp, 'fertilization-reminder-preview-button')
        await hideNativeModal(mp)
        await tapCurrent(mp, 'fertilization-reminder-calendar-confirm-button')
        const terminalButton = await waitForCurrentPageElement(
          mp,
          'fertilization-reminder-calendar-confirm-button'
        )
        const preview = await waitForCurrentPageElement(mp, 'fertilization-reminder-preview')
        const previewText = await textOf(preview)
        assertCondition(
          report,
          '计划失效时阻止错误重试并说明旧日历处理',
          (await textOf(terminalButton)).includes('请先取消这次设置') &&
            previewText.includes('请先删除该事件')
        )
        await tapCurrent(mp, 'fertilization-reminder-cancel-button')
        const state = await readFixtureFertilizationState(mp, opened.fixtureConfig.runtimeSlot)
        assertCondition(
          report,
          '终态失败取消后不会留下 active 提醒',
          !state?.reminder && state?.cancelledPlanIds?.length === ONE
        )
      }
    )

    setClassification(report, 'PASS')
    report.business_assertions_reached = true
  } catch (error) {
    setClassification(
      report,
      error instanceof ProductAssertionError ? 'FAIL_PRODUCT' : 'BLOCKED_ENV',
      String(error?.message || error)
    )
  } finally {
    await safeDisconnect(mp)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `fertilization-reminder-setup-${Date.now()}`
    )
    emitLeafReport(report)
    console.error(`[e2e] report: ${reportPath}`)
    if (report.classification !== 'PASS') {
      process.exitCode = FAILURE_EXIT_CODE
    }
  }
}

run().catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
